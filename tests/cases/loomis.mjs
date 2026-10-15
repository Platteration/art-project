// The Loomis head, playtested as a sceptical tester: the mark sequence on the sample and on loaded
// photos (checked against marks the model itself would make, so the fit must come back level), Back
// after each mark, skipping the brows and the forehead, Start over, every mark on one point, marks at
// the corners and dragged outside, the loupe, the fitted head's lines, dragging each dot and each
// line, the arrow buttons tapped, held, spammed and held across a tab switch, Back to the fit, hide
// the head, Save PNG, Draw it in the Studio (and the Studio's underdrawing), the head over the Study
// tab's pictures and in their saved PNGs, a new photo (and a rejected file, and a 24-megapixel one)
// while marking, a press that outlives the photo, hostile saved state, keyboard, and both widths.
// At the end: the coverage critic's gaps (every high and medium one, then the low ones the time allowed): a turned,
// nodded, tilted or long head; a hidden head through Start over and a new photo; the loupe's content and place; marks
// while a new photo is prepared; the head on the Study pictures and in their PNGs by position; the no-head card; touch;
// dots close together; a profile; the far side dashed; a resize; Draw it in the Studio pressed again; Save PNG while
// hidden and mid-sequence; the drag extremes; the narrow widths; a pixel ratio of 2; a sandboxed save; the words and
// labels; keyboard focus; dark theme; the model's numbers; drags cut short; a dropped or pasted photo; small and wide photos.
import fs from 'node:fs';
import { openPage, clean, tab, DESKTOP, PHONE, makeImage, loadPhoto, textFile, brokenImage, svgImage, click, text, visible, hscroll, screenshot, sleep, storageGet, PROTO_NAMES, dropFiles, pasteFile, axe, app } from '../lib.mjs';

const DEG = Math.PI / 180;
const ORDER = ['leftEye', 'rightEye', 'leftBrow', 'rightBrow', 'nose', 'mouth', 'chin', 'forehead'];
const NAMES = { leftEye: 'Left eye', rightEye: 'Right eye', leftBrow: 'Left eyebrow', rightBrow: 'Right eyebrow', nose: 'Nose', mouth: 'Mouth', chin: 'Chin', forehead: 'Forehead' };
const OPTIONAL = new Set(['leftBrow', 'rightBrow', 'forehead']);
const PARAM_OF = { centre: 'yaw', side: 'yaw', sideLine: 'yaw', brow: 'pitch', hair: 'pitch', eyes: 'pitch', nose: 'len', mouth: 'len', chin: 'len', face: 'len', jaw: 'len' };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- what the module holds, what the card says, what the overlay shows ----
const lstate = (page) => page.evaluate(() => { const s = Loomis.state; const c = (o) => (o ? { ...o } : null); return { step: s.step, pending: c(s.pending), fit: c(s.fit), auto: c(s.auto), shown: s.shown, points: Object.fromEntries(Object.entries(s.points).map(([k, v]) => [k, { ...v }])), aspect: s.aspect, moving: s.moving, has: Loomis.has(), segs: Loomis.segments().length }; });
const card = (page) => page.evaluate(() => { const g = (id) => document.getElementById('lh-' + id); const vis = (e) => !e.hidden && getComputedStyle(e).display !== 'none'; return { step: g('stepLabel').textContent, ask: g('ask').textContent, sub: g('sub').textContent, subShown: vis(g('sub')), lockShown: vis(g('lock')), lock: g('lock').disabled, skip: vis(g('skip')), backShown: vis(g('back')), back: g('back').disabled, cardStudio: vis(g('cardStudio')), refit: vis(g('refit')), undo: g('undo').disabled, reset: g('reset').disabled, show: g('show').disabled, pressed: g('show').getAttribute('aria-pressed'), studio: g('studio').disabled, save: g('save').disabled, done: g('root').classList.contains('lh-done'), loupe: !g('loupe').hidden, photo: [g('photo').width, g('photo').height] }; });
const ink = (page) => page.evaluate(() => { const c = document.getElementById('lh-overlay'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const n = { any: 0, red: 0, cyan: 0, yellow: 0, white: 0 }; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 40) continue; n.any++; if (d[i + 3] < 200) continue; const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 200 && g < 90 && b < 90) n.red++; else if (r < 80 && g > 170 && b > 200) n.cyan++; else if (r > 220 && g > 180 && b < 80) n.yellow++; else if (r > 245 && g > 245 && b > 245) n.white++; } return n; });
const studyInk = (page, id = 'cv-orig') => page.evaluate((id) => { const c = document.getElementById(id).nextElementSibling; if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let red = 0, cyan = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90) red++; else if (d[i] < 80 && d[i + 1] > 170 && d[i + 2] > 200) cyan++; } return { red, cyan }; }, id);
const ovBox = (page) => page.evaluate(() => { const c = document.getElementById('lh-overlay'); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, W: c.width, H: c.height }; });
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const inside = (a, b, tol = 1) => a && b && a.x >= b.x - tol && a.y >= b.y - tol && a.r <= b.r + tol && a.b <= b.b + tol;
const overlaps = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
async function press(page, fx, fy) { const b = await ovBox(page); await page.mouse.move(b.x + Math.min(fx * b.w, b.w - 0.5), b.y + Math.min(fy * b.h, b.h - 0.5)); await page.mouse.down(); }
async function tap(page, fx, fy) { await press(page, fx, fy); await page.mouse.up(); }
async function dragFrac(page, [fx, fy], [tx, ty], steps = 6) { const b = await ovBox(page); await page.mouse.move(b.x + fx * b.w, b.y + fy * b.h); await page.mouse.down(); await page.mouse.move(b.x + tx * b.w, b.y + ty * b.h, { steps }); await page.mouse.up(); }
async function mark(page, fx, fy) { await tap(page, fx, fy); await click(page, '#lh-lock'); }
// a mark pressed inside the picture and dragged to (fx, fy), which may be outside it: the mark stops at the edge
async function markDragged(page, fx, fy) { await dragFrac(page, [0.5, 0.5], [fx, fy]); await click(page, '#lh-lock'); }
// the marks the model itself makes for a level head of ball radius s (in picture widths) centred at (cx, cy), in picture fractions
const marksFor = (page, { s = 0.2, cx = 0.5, cy = 0.45 } = {}) => page.evaluate(([s, cx, cy]) => { const p = Studio.prep(); const a = p.h / p.w; const out = {}; Loomis.STEPS.forEach((st) => { out[st.key] = [cx + s * st.model[0], (cy + s * st.model[1]) / a]; }); return out; }, [s, cx, cy]);
async function sequence(page, marks, skip = []) { for (const key of ORDER) { if (skip.includes(key)) await click(page, '#lh-skip'); else await mark(page, marks[key][0], marks[key][1]); } }
const changed = (a, b, tol = 1e-6) => ['s', 'tx', 'ty', 'yaw', 'pitch', 'roll', 'len'].filter((k) => !near(a[k], b[k], tol));
const loupe = (page) => page.evaluate(() => { const l = document.getElementById('lh-loupe'), st = document.getElementById('lh-stage'); const r = l.getBoundingClientRect(), s = st.getBoundingClientRect(); const c = document.getElementById('lh-loupeCanvas'); let photo = 0; if (c.width) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - 34) + Math.abs(d[i + 1] - 34) + Math.abs(d[i + 2] - 34) > 30) photo++; } return { shown: !l.hidden && getComputedStyle(l).display !== 'none', inStage: r.left >= s.left && r.top >= s.top && r.right <= s.right && r.bottom <= s.bottom, photo, size: [r.width, r.height] }; });
const armToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.classList.remove('show'); });
const toastMatch = (page, re, timeout = 3000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source, { timeout }).then(() => text(page, '#toast')).catch(() => null);
const handlesOf = (page) => page.evaluate(() => Loomis.handles(document.getElementById('lh-overlay').width));
async function handleAt(page, glyph) { const hs = await handlesOf(page); const h = hs.find((x) => x.glyph === glyph); const b = await ovBox(page); const k = b.w / b.W; return { x: b.x + h.x * k, y: b.y + h.y * k, h, b }; }
async function tapHandle(page, glyph, holdMs = 0) { const { x, y } = await handleAt(page, glyph); await page.mouse.move(x, y); await page.mouse.down(); if (holdMs) await sleep(holdMs); await page.mouse.up(); }
// a pixel of the overlay that the page's own hit test gives to each piece, mark, handle, the ball's edge and the inside
const spots = (page) => page.evaluate(() => { const c = document.getElementById('lh-overlay'); const W = c.width, H = c.height, f = Loomis.state.fit; if (!f) return { W, H, pick: {} }; const cx = f.tx * W, cy = f.ty * W, R = f.s * W; const out = {}; const x0 = Math.max(0, Math.floor(cx - 2.3 * R)), x1 = Math.min(W, Math.ceil(cx + 2.3 * R)), y0 = Math.max(0, Math.floor(cy - 2.3 * R)), y1 = Math.min(H, Math.ceil(cy + 2.8 * R)); for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { const h = Loomis.hitTest(x, y, W); if (!h) continue; const k = h.kind === 'line' ? h.name : h.kind === 'handle' ? 'handle:' + h.handle.glyph : h.kind === 'mark' ? 'mark:' + h.key : h.kind; (out[k] = out[k] || []).push([x, y]); } const pick = {}; for (const k of Object.keys(out)) pick[k] = out[k][Math.floor(out[k].length / 2)]; return { W, H, pick, counts: Object.fromEntries(Object.entries(out).map(([k, a]) => [k, a.length])) }; });
const hitAt = (page, x, y) => page.evaluate(([x, y]) => { const h = Loomis.hitTest(x, y, document.getElementById('lh-overlay').width); return h ? (h.kind === 'line' ? h.name : h.kind === 'handle' ? 'handle:' + h.handle.glyph : h.kind === 'mark' ? 'mark:' + h.key : h.kind) : null; }, [x, y]);
async function dragPiece(page, name, dx, dy) {
  const sp = await spots(page); const p = sp.pick[name]; if (!p) return null;
  const b = await ovBox(page); const k = b.w / b.W;
  const before = (await lstate(page)).fit;
  await page.mouse.move(b.x + p[0] * k, b.y + p[1] * k); await page.mouse.down();
  await page.mouse.move(b.x + (p[0] + dx) * k, b.y + (p[1] + dy) * k, { steps: 6 });
  const during = await lstate(page);
  await page.mouse.up();
  const after = (await lstate(page)).fit;
  return { before, after, during, end: await hitAt(page, p[0] + dx, p[1] + dy), start: p, changed: changed(before, after) };
}
// a saved PNG read back in the page: its size and how many pixels wear the head's red and cyan
async function pngOf(page, dl) {
  if (!dl) return null;
  const b64 = fs.readFileSync(await dl.path()).toString('base64');
  return page.evaluate(async (b64) => { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let red = 0, cyan = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90) red++; else if (d[i] < 80 && d[i + 1] > 170 && d[i + 2] > 200) cyan++; } return { w: c.width, h: c.height, red, cyan }; }, b64);
}
const download = async (page, sel) => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), click(page, sel)]); return dl; };
const layoutOf = (page) => page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom, shown: !e.hidden && getComputedStyle(e).display !== 'none' }; }; return { card: r('#lh-card'), stage: r('#lh-stage'), wrap: r('#lh-wrap'), strip: r('#lh-root .ps-strip'), exit: r('#lh-exit'), tabs: r('.tabs'), vw: innerWidth, vh: innerHeight }; });

// ---- helpers for the checks at the end of this case (the coverage critic's gaps) ----
const guard = async (t, label, fn) => { try { await fn(); } catch (e) { t.check(false, `${label}: the step ran to its end`, String((e && e.message) || e).slice(0, 300)); } };
// the marks a head makes at a pose, by the model's own projection (a pose's fields left out are level)
const posedMarks = (page, pose) => page.evaluate((pose) => { const a = Studio.prep(); const aspect = a.h / a.w; const f = { s: 0.2, tx: 0.5, ty: 0.45, yaw: 0, pitch: 0, roll: 0, len: 1, ...pose }; const out = {}; Loomis.STEPS.forEach((st) => { const p = Loomis.project(st.model, f, st.face); out[st.key] = [p[0], p[1] / aspect]; }); return out; }, pose);
// how far each locked mark is from the landmark the fitted head puts there (picture widths)
const residualsOf = (page) => page.evaluate(() => { const f = Loomis.state.fit, a = Loomis.state.aspect; return Loomis.STEPS.filter((st) => Loomis.state.points[st.key]).map((st) => { const p = Loomis.state.points[st.key]; const q = Loomis.project(st.model, f, st.face); return +Math.hypot(q[0] - p.x, q[1] - p.y * a).toFixed(4); }); });
// what a canvas (or a decoded PNG kept as window.__png) holds of the head: the share of the ball's rim (radius s x W, 3 px either way)
// that is red, the share of the centre line's run that is cyan, and the colour counts. Self-contained: it is sent to the page as text.
const HEAD_STATS = (c, fit) => {
  const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const isRed = (r, g, b) => r > 200 && g < 90 && b < 90;
  const isCyan = (r, g, b) => r < 80 && g > 170 && b > 200;
  const isYellow = (r, g, b) => r > 200 && g > 180 && b < 80;
  // any of the head's inks, the red ball's blended edge included (a brow or eye line crossing the rim covers it there)
  const isHead = (r, g, b) => (r > 90 && r > 2 * g && r > 2 * b) || (r < 120 && g > 140 && b > 160 && b > r) || (r > 200 && g > 150 && b < 90);
  const at = (x, y, pred) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return false; const i = (yi * W + xi) * 4; return d[i + 3] > 200 && pred(d[i], d[i + 1], d[i + 2]); };
  let rim = 0, rimN = 0, run = 0, runN = 0;
  if (fit) {
    const cx = fit.tx * W, cy = fit.ty * W, R = fit.s * W;
    for (let a = 0; a < 360; a += 10) { const th = (a * Math.PI) / 180; let hit = false; for (let r = R - 3; r <= R + 3 && !hit; r++) hit = at(cx + r * Math.cos(th), cy + r * Math.sin(th), isHead); rim += hit ? 1 : 0; rimN++; }
    for (let y = cy - 0.8 * R; y <= cy + 0.8 * R; y += 2) { runN++; if (at(cx - 1, y, isCyan) || at(cx, y, isCyan) || at(cx + 1, y, isCyan)) run++; }
  }
  let red = 0, cyan = 0, yellow = 0, white = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] <= 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (isRed(r, g, b)) red++; else if (isCyan(r, g, b)) cyan++; else if (isYellow(r, g, b)) yellow++; else if (r > 245 && g > 245 && b > 245) white++;
  }
  return { W, H, rim: rimN ? +(rim / rimN).toFixed(2) : null, run: runN ? +(run / runN).toFixed(2) : null, red, cyan, yellow, white };
};
const headStats = (page, expr, fit) => page.evaluate(`(${HEAD_STATS.toString()})(${expr}, ${JSON.stringify(fit)})`);
// a saved PNG decoded in the page (kept as window.__png, for headStats)
async function decodePng(page, dl) {
  if (!dl) return null;
  const b64 = fs.readFileSync(await dl.path()).toString('base64');
  return page.evaluate(async (b64) => { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); window.__png = c; return { w: c.width, h: c.height }; }, b64);
}
const sketchInk = (page) => page.evaluate(() => { const c = document.getElementById('ps-sketch'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++; return n; });
// the layout after a resize has settled: the stage and the photo stop moving for about 300 ms (a CSS transition runs first)
const settled = (page) => page.evaluate(() => new Promise((res) => { let last = '', same = 0, ticks = 0; const tick = () => { const s = document.getElementById('lh-stage').getBoundingClientRect(), w = document.getElementById('lh-wrap').getBoundingClientRect(); const k = [s.left, s.top, s.width, s.height, w.left, w.top, w.width, w.height].join(); same = k === last ? same + 1 : 0; last = k; ticks++; if (same >= 6 || ticks > 80) res(true); else setTimeout(tick, 50); }; tick(); }));
// the same marks as frameSeq, placed inside another site's frame (the Loomis module lives there, not in the page)
const frameSeq = (page, marks, skip = []) => { const fr = app(page); return (async () => { for (const k of ['leftEye', 'rightEye', 'leftBrow', 'rightBrow', 'nose', 'mouth', 'chin', 'forehead']) { if (skip.includes(k)) { await click(page, '#lh-skip'); continue; } await fr.evaluate(([x, y]) => { Loomis.place(x, y); document.getElementById('lh-lock').click(); }, marks[k]); } })(); };
// how much of an element is inside the window, from 0 to 1
const inWindow = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)); return +(vis / r.height).toFixed(2); }, sel);
// the loupe for a press at each edge of the picture: shown, inside the stage, and not over the finger
const edgeProbe = async (pg) => {
  const out = [];
  for (const [fx, fy] of [[0.02, 0.5], [0.98, 0.5], [0.5, 0.02], [0.5, 0.98]]) {
    await press(pg, fx, fy);
    const b = await ovBox(pg);
    const px = b.x + Math.min(fx * b.w, b.w - 0.5), py = b.y + Math.min(fy * b.h, b.h - 0.5);
    const r = await pg.evaluate(() => { const l = document.getElementById('lh-loupe').getBoundingClientRect(), s = document.getElementById('lh-stage').getBoundingClientRect(); return { shown: !document.getElementById('lh-loupe').hidden, l: [l.left, l.top, l.right, l.bottom], s: [s.left, s.top, s.right, s.bottom] }; });
    await pg.mouse.up();
    const [L, T, R, B] = r.l, [SL, ST, SR, SB] = r.s;
    out.push({ at: [fx, fy], shown: r.shown, inStage: L >= SL - 0.5 && T >= ST - 0.5 && R <= SR + 0.5 && B <= SB + 0.5, under: px >= L && px <= R && py >= T && py <= B });
  }
  return out;
};

export default async function loomis(t, site) {
  // ================= desktop: the sample, the full sequence, the loupe, the fitted head and all its handles =================
  {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    let c = await card(page), s = await lstate(page), i = await ink(page);
    t.check(c.step === '1 of 8' && c.ask === 'Left eye' && /Tap the middle of the eye on the left/.test(c.sub) && c.lock && !c.skip && c.back && c.undo && c.reset && c.show && c.studio && c.save && !c.cardStudio && !c.refit && !c.done && !c.loupe, 'fresh: the card asks for the left eye, every control off, nothing to skip', c);
    t.check(c.photo[0] > 0 && c.photo[1] > 0 && i.any === 0 && s.step === 0 && !s.has, 'fresh: the sample is on the stage and the overlay is blank', { photo: c.photo, ink: i });
    const lay = await layoutOf(page);
    t.check(!overlaps(lay.card, lay.wrap) && inside(lay.wrap, lay.stage) && !lay.exit.shown && lay.tabs.shown && (await hscroll(page)) <= 0, 'desktop: the card is beside the photo, not over it; the tabs stay; no Leave button; no horizontal scroll', lay);
    // controls that are off do nothing
    await click(page, '#lh-lock'); await click(page, '#lh-back'); await click(page, '#lh-undo'); await click(page, '#lh-reset');
    s = await lstate(page); c = await card(page);
    t.check(s.step === 0 && !s.pending && c.step === '1 of 8', 'fresh: Lock in, Back, Back one mark and Start over do nothing before a mark', { step: s.step, pending: s.pending });
    // a right button press places nothing
    { const b = await ovBox(page); await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); }
    t.check(!(await lstate(page)).pending, 'a right-button press places no mark');
    await clean(t, page, 'desktop fresh');

    // the first mark: the loupe during the press, the ring after, then a drag before locking
    const marks = await marksFor(page);
    await press(page, 0.3, 0.3);
    let lp = await loupe(page); s = await lstate(page);
    t.check(lp.shown && lp.inStage && lp.photo > 50 && s.pending && near(s.pending.x, 0.3, 0.01) && near(s.pending.y, 0.3, 0.01), 'a press places the pending mark and shows the loupe inside the stage with the photo in it', { lp, pending: s.pending });
    { const b = await ovBox(page); await page.mouse.move(b.x + marks.leftEye[0] * b.w, b.y + marks.leftEye[1] * b.h, { steps: 5 }); }
    lp = await loupe(page); s = await lstate(page);
    t.check(lp.shown && s.pending && near(s.pending.x, marks.leftEye[0], 0.01) && near(s.pending.y, marks.leftEye[1], 0.01), 'dragging before Lock in moves the pending mark under the finger, loupe still up', s.pending);
    await page.mouse.up();
    lp = await loupe(page); c = await card(page); i = await ink(page);
    t.check(!lp.shown && !c.lock && !c.back && !c.undo && !c.reset && /Drag to fine-tune, then lock it in\.$/.test(c.sub) && i.yellow > 0 && i.red === 0, 'after the press: loupe gone, Lock in / Back / Start over on, the card says to fine-tune, a yellow ring on the photo', { c, i });
    // Lock in from the keyboard
    await page.focus('#lh-lock'); await page.keyboard.press('Enter');
    s = await lstate(page); c = await card(page);
    t.check(s.step === 1 && s.points.leftEye && !s.pending && c.step === '2 of 8' && c.ask === 'Right eye' && c.lock, 'Enter on Lock in locks the mark; the card moves to the right eye', { step: s.step, c: c.step });
    await click(page, '#lh-lock');
    t.check((await lstate(page)).step === 1, 'Lock in pressed again with nothing pending does nothing');
    // the rest, checking the card at each step
    const perStep = [];
    for (let k = 1; k < ORDER.length; k++) {
      const key = ORDER[k];
      c = await card(page);
      perStep.push(c.step === `${k + 1} of 8` && c.ask === NAMES[key] && c.skip === OPTIONAL.has(key) && c.lock && !c.done);
      await mark(page, marks[key][0], marks[key][1]);
      if (k === 4) { c = await card(page); t.check(c.show && c.studio && c.save && c.undo === false, 'mid-way (after the nose): show, Studio and Save stay off, Back one mark on', c); }
      if (k === 6) { s = await lstate(page); c = await card(page); t.check(s.has && !c.done && !c.show && !c.save && !c.studio && (await ink(page)).red > 0, 'after the chin (the fifth needed mark) the head is already fitted and drawn while the forehead is still asked', { has: s.has, c }); }
    }
    t.check(perStep.every(Boolean), 'each step names its feature, counts n of 8, and offers Skip only for the brows and forehead', perStep);
    await clean(t, page, 'desktop sequence');

    // the fitted head
    armToast(page); await click(page, '#lh-undo'); await click(page, '#lh-lock'); // re-lock the forehead to hear the toast on the last lock
    const toast = await toastMatch(page, /head is over the face/i, 2000);
    c = await card(page); s = await lstate(page); i = await ink(page);
    t.check(!!toast && c.step === 'Head fitted' && /Drag a dot or a line/.test(c.ask) && !c.lockShown && !c.skip && !c.backShown && c.cardStudio && c.refit && c.done && !c.undo && !c.reset && !c.show && !c.studio && !c.save && c.pressed === 'true', 'the last lock: "The head is over the face", the card says Head fitted with Draw it in the Studio and Back to the fit, every strip control on', { toast, c });
    t.check(i.red > 100 && i.cyan > 100 && i.yellow > 100 && i.white > 0, 'the head is drawn: ball and jaw red, centre and brow cyan, eye / nose / mouth / chin yellow, the marks white', i);
    const f = s.fit;
    t.check(f && near(f.yaw, 0, 0.03) && near(f.pitch, 0, 0.03) && near(f.roll, 0, 0.03) && near(f.s, 0.2, 0.01) && near(f.tx, 0.5, 0.01) && near(f.ty, 0.45, 0.01) && near(f.len, 1, 0.03), 'marks the model itself makes at a level head come back as that head (yaw, pitch, roll ~0, radius 0.2, centred, length 1)', f);
    const resid = await page.evaluate(() => { const f = Loomis.state.fit, a = Loomis.state.aspect; return Loomis.STEPS.map((st) => { const p = Loomis.state.points[st.key]; const q = Loomis.project(st.model, f, st.face); return +Math.hypot(q[0] - p.x, q[1] - p.y * a).toFixed(4); }); });
    t.check(resid.every((r) => r < 0.01), 'every landmark lands within 1% of the picture width of its mark', resid);
    t.note(`fit residuals (picture widths): ${resid.join(', ')}; fit ${JSON.stringify(f)}`);
    if (!c.subShown) t.finding({ title: 'The fitted card\'s sentence about the arrows is written but never shown', severity: 'low', steps: '1. On the Loomis head, lock in all the marks. 2. Read the card under "Head fitted".', expected: 'The card (or something on the page) says what the arrow buttons around the ball do: "The arrows turn, nod and tilt the head…", as js/loomis.js line 252 writes into #lh-sub.', actual: `#lh-sub holds "${c.sub.slice(0, 60)}…" but styles.css line 1634 (.lh-done .lh-sub { display: none }) hides it, so the arrows (drawn on the canvas, with no label or tooltip) are explained nowhere on the page.` });
    t.check(c.subShown, 'the fitted card shows its line about the arrows', { shown: c.subShown, sub: c.sub.slice(0, 60) });
    const hs = await handlesOf(page);
    t.check(hs.length === 6 && hs.every((h) => h.x >= 0 && h.y >= 0), 'six arrow buttons sit around the ball, all on the picture', hs.map((h) => [h.glyph, Math.round(h.x), Math.round(h.y)]));
    await screenshot(page, 'loomis-desktop-fitted');

    // the arrows: a tap is three degrees, a hold keeps going, spam is harmless, the limit holds, Back to the fit returns
    const auto = s.auto;
    await tapHandle(page, 'right'); let g = (await lstate(page)).fit;
    t.check(near(g.yaw, auto.yaw + 3 * DEG, 1e-6) && changed(auto, g).join() === 'yaw', 'a tap on the right arrow turns the head three degrees and nothing else', { yaw: g.yaw, auto: auto.yaw });
    await tapHandle(page, 'left'); await tapHandle(page, 'left'); g = (await lstate(page)).fit;
    t.check(near(g.yaw, auto.yaw - 3 * DEG, 1e-6), 'two taps on the left arrow turn it back and three degrees further', g.yaw);
    await tapHandle(page, 'up'); await tapHandle(page, 'cw'); g = (await lstate(page)).fit;
    t.check(near(g.pitch, auto.pitch - 3 * DEG, 1e-6) && near(g.roll, auto.roll + 3 * DEG, 1e-6), 'up nods three degrees, the clockwise arrow tilts three degrees', { pitch: g.pitch, roll: g.roll });
    await tapHandle(page, 'right', 1000); g = (await lstate(page)).fit;
    const held = Math.round((g.yaw - (auto.yaw - 3 * DEG)) / (3 * DEG));
    t.check(held >= 4 && held <= 12, 'holding the right arrow for a second keeps turning (about seven steps)', held);
    for (let k = 0; k < 25; k++) await tapHandle(page, 'left');
    g = (await lstate(page)).fit;
    t.check(near(g.yaw, auto.yaw - 3 * DEG + held * 3 * DEG - 25 * 3 * DEG, 1e-6), '25 quick taps on the left arrow are 25 steps, no more, no less', g.yaw);
    { const { x, y } = await handleAt(page, 'right'); await page.mouse.move(x, y); await page.mouse.down(); await page.waitForFunction(() => Loomis.state.fit.yaw >= 1.5, null, { timeout: 10000 }).catch(() => null); await sleep(300); await page.mouse.up(); }
    g = (await lstate(page)).fit;
    t.check(near(g.yaw, 1.5, 1e-9) && (await ink(page)).red > 50, 'held past the limit the turn stops at 1.5 rad and the head is still drawn', g.yaw);
    await click(page, '#lh-refit'); g = (await lstate(page)).fit;
    t.check(changed(g, auto).length === 0, 'Back to the fit returns every value to the fitted head', changed(g, auto));
    await click(page, '#lh-refit');
    t.check(changed((await lstate(page)).fit, auto).length === 0, 'Back to the fit twice is the same head');
    // a hold that outlives the tab: the repeat must stop
    { const { x, y } = await handleAt(page, 'right'); await page.mouse.move(x, y); await page.mouse.down(); await sleep(500); await page.evaluate(() => Studio.go('study')); await sleep(150); await page.mouse.up(); await sleep(400); const y1 = (await lstate(page)).fit.yaw; await sleep(500); const y2 = (await lstate(page)).fit.yaw; t.check(y1 === y2, 'switching tabs while an arrow is held does not leave it turning', { y1, y2 }); await tab(page, 'loomis'); await click(page, '#lh-refit'); }
    await clean(t, page, 'desktop arrows');

    // the head over the Study tab's pictures, and in a saved Study PNG
    await tab(page, 'study');
    const st = { orig: await studyInk(page, 'cv-orig'), value: await studyInk(page, 'cv-value'), block: await studyInk(page, 'cv-block') };
    t.check(st.orig && st.orig.red > 50 && st.orig.cyan > 50 && st.value && st.value.red > 50 && st.block && st.block.red > 50, 'the head shows over the photo, the three-value study and the color blocks on the Study tab', st);
    { const dl = await download(page, '[data-save="orig"]'); const png = await pngOf(page, dl); t.check(dl && /original\.png$/.test(dl.suggestedFilename()) && png && png.red > 100 && png.cyan > 100, 'the Study\'s saved photo PNG carries the head', { name: dl && dl.suggestedFilename(), png }); }
    await page.evaluate(() => { const d = document.getElementById('saveDialog'); if (d && d.open) d.close(); }).catch(() => null);
    await tab(page, 'loomis');
    t.check((await card(page)).done && (await lstate(page)).has, 'back on the tab the head is still fitted');
    await clean(t, page, 'desktop study overlay');

    // dragging each line, the ball's edge, the inside, and a dot
    const sp = await spots(page);
    t.note(`hit test bands (pixels sampled every 3 px): ${JSON.stringify(sp.counts)}`);
    const drags = [['centre', 'yaw', 18, 0], ['side', 'yaw', 18, 0], ['brow', 'pitch', 0, 14], ['hair', 'pitch', 0, 14], ['eyes', 'pitch', 0, 12], ['nose', 'len', 0, 12], ['mouth', 'len', 0, 12], ['chin', 'len', 0, 12], ['face', 'len', 0, 12], ['jaw', 'len', 0, 12]];
    const dragReport = [];
    for (const [name, param, dx, dy] of drags) {
      const r = await dragPiece(page, name, dx, dy);
      if (!r) { dragReport.push(`${name}: no pixel of the overlay hits it`); continue; }
      const sameFamily = (n) => n && PARAM_OF[n] === param;
      const onlyThat = r.changed.join() === param;
      const under = r.end === name || sameFamily(r.end) || /^(mark|handle)/.test(r.end || '');
      if (!(onlyThat && under)) dragReport.push(`${name}: changed ${JSON.stringify(r.changed)} (wanted ${param}), under the finger at the end: ${r.end}`);
      await click(page, '#lh-refit');
    }
    t.note('the side plane\'s vertical coincides with the side ring on a level head, so the ring takes the hit; both turn the head');
    t.check(dragReport.length === 0, 'dragging the centre line and side plane turns the head, the brow, hairline and eye lines nod it, the nose, mouth, chin, face and jaw lines set its length, each bringing the line under the finger', dragReport);
    { const r = await dragPiece(page, 'ball', 0, 0); const b0 = (await lstate(page)).fit; const p = sp.pick.ball; const cx = b0.tx * sp.W, cy = b0.ty * sp.W; const ang = Math.atan2(p[1] - cy, p[0] - cx); const r2 = await dragPiece(page, 'ball', Math.round(Math.cos(ang) * 20), Math.round(Math.sin(ang) * 20)); t.check(r && r2 && r2.changed.join() === 's' && r2.after.s > r2.before.s + 0.02, 'dragging the ball\'s edge outward grows the ball and changes nothing else', r2 && { changed: r2.changed, s: [r2.before.s, r2.after.s] }); await click(page, '#lh-refit'); }
    { const r = await dragPiece(page, 'move', 15, 10); t.check(r && r.changed.sort().join() === 'tx,ty' && near(r.after.tx - r.before.tx, 15 / sp.W, 1e-3) && near(r.after.ty - r.before.ty, 10 / sp.W, 1e-3), 'a drag inside the head moves it by the drag and changes nothing else', r && { changed: r.changed, dtx: (r.after.tx - r.before.tx) * sp.W, dty: (r.after.ty - r.before.ty) * sp.W }); await click(page, '#lh-refit'); }
    { // a dot: the mark follows the finger, the head is refitted (and that becomes the fit to go back to), the loupe shows
      const b = await ovBox(page); const p0 = (await lstate(page)).points.leftEye; const before = (await lstate(page)).fit;
      await page.mouse.move(b.x + p0.x * b.w, b.y + p0.y * b.h); await page.mouse.down();
      await page.mouse.move(b.x + (p0.x - 0.03) * b.w, b.y + (p0.y + 0.02) * b.h, { steps: 5 });
      const mid = { loupe: await loupe(page), s: await lstate(page) };
      await page.mouse.up();
      const after = await lstate(page);
      t.check(mid.loupe.shown && mid.s.moving === 'leftEye' && near(after.points.leftEye.x, p0.x - 0.03, 0.01) && near(after.points.leftEye.y, p0.y + 0.02, 0.01) && changed(before, after.fit).length > 0 && changed(after.fit, after.auto).length === 0 && !(await loupe(page)).shown && after.moving === null, 'dragging a dot moves that mark with the loupe up, refits the head, and the refit is what Back to the fit returns to', { mid: { loupe: mid.loupe.shown, moving: mid.s.moving }, point: after.points.leftEye, changed: changed(before, after.fit) });
      // dragged out of the picture, a dot stops at its edge
      const chin = after.points.chin; await page.mouse.move(b.x + chin.x * b.w, b.y + chin.y * b.h); await page.mouse.down(); await page.mouse.move(b.x + chin.x * b.w, b.y + b.h + 60, { steps: 5 }); await page.mouse.up();
      const out = (await lstate(page)).points.chin;
      t.check(out.y === 1 && near(out.x, chin.x, 0.01) && (await lstate(page)).has, 'a dot dragged below the picture stops at its bottom edge and the head is still fitted', out);
      await page.mouse.move(b.x + out.x * b.w, b.y + out.y * b.h); await page.mouse.down(); await page.mouse.move(b.x + chin.x * b.w, b.y + chin.y * b.h, { steps: 5 }); await page.mouse.up();
    }
    await clean(t, page, 'desktop drags');

    // hide the head: nothing drawn, nothing to drag, nothing on the Study tab, and what Draw it in the Studio says
    await click(page, '#lh-show');
    c = await card(page); i = await ink(page); s = await lstate(page);
    t.check(c.pressed === 'false' && i.red === 0 && i.cyan === 0 && i.yellow === 0 && i.white > 0 && s.has && s.shown === false, 'hide the head: the lines go, the marks stay, the button reads pressed=false', { pressed: c.pressed, i });
    { const p0 = s.points.rightEye; await dragFrac(page, [p0.x, p0.y], [p0.x + 0.05, p0.y]); const p1 = (await lstate(page)).points.rightEye; t.check(p1.x === p0.x && p1.y === p0.y, 'with the head hidden a drag on a dot moves nothing', { p0, p1 }); }
    await tab(page, 'study');
    t.check((await studyInk(page, 'cv-orig')).red === 0, 'with the head hidden the Study tab shows no head');
    await tab(page, 'loomis');
    t.check(!c.studio && s.segs === 0, 'with the head hidden Draw it in the Studio is still offered, and there are no lines to copy until it is shown', { studioDisabled: c.studio, segs: s.segs });
    const noticeBefore = await storageGet(page, 'portrait-value-studio.studioNotice');
    armToast(page); await click(page, '#lh-studio');
    const hiddenToast = await toastMatch(page, /Nothing to copy|head|hidden/i, 2500);
    const shownTab = await page.evaluate(() => [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id).join());
    const sketchInk = await page.evaluate(() => { const c = document.getElementById('ps-sketch'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++; return n; });
    const hiddenOk = shownTab === 'tab-paint' && (sketchInk > 0 || /head|hidden|show/i.test(hiddenToast || ''));
    t.check(hiddenOk, 'Draw it in the Studio with the head hidden draws it or says the head is hidden', { shownTab, sketchInk, toast: hiddenToast });
    if (!hiddenOk) t.finding({ title: 'Draw it in the Studio with the head hidden opens the Studio and says "Nothing to copy: draw lines, measures or plumb lines on the Study tab first"', severity: 'medium', steps: '1. On the Loomis head, lock in all the marks (the head is fitted). 2. Press the eye icon (Show or hide the head) so the head is hidden. 3. Press Draw it in the Studio (the strip\'s pencil icon or the card\'s button).', expected: 'Either the button is off while the head is hidden (as Save PNG is off without a fit), or the head is drawn anyway, or the message says the head is hidden and how to show it.', actual: `The Studio opens with an empty underdrawing (${sketchInk} inked samples) and the toast says "${hiddenToast}": a message about Study lines, which the visitor never touched, with no word about the hidden head. Cause: js/loomis.js line 468, segments() returns [] while state.shown is false; line 260 keeps the Studio button on whenever there is a fit; line 273 (toStudio) clicks the Studio's Copy the Study lines, whose js/painting.js line 367 says "Nothing to copy…" for an empty list.` });
    const noticeAfter = await storageGet(page, 'portrait-value-studio.studioNotice'); const toastNow = await text(page, '#toast');
    const noticeLost = noticeBefore === null && noticeAfter !== null && !/saved in this browser/.test(toastNow || '');
    t.check(!noticeLost, 'the Studio\'s one-time "saved in this browser" note is not spent unseen by a first visit through Draw it in the Studio', { noticeBefore, noticeAfter, toast: toastNow });
    if (noticeLost) t.finding({ title: 'The Studio\'s one-time "saved in this browser" note is spent unseen when the Studio is first opened through Draw it in the Studio', severity: 'low', steps: '1. In a fresh browser (no portrait-value-studio.studioNotice key), open the Loomis head and lock in all the marks. 2. Press Draw it in the Studio. 3. Read the toast.', expected: 'The one-time note ("Your painting is saved in this browser as you go…", 7 s) is read, or kept for a visit where it can be: the README promises it to the first Studio visit.', actual: `The note shows for about 150 ms and is replaced by "${toastNow}"; its key is set (${noticeAfter}), so it never shows again. Cause: js/loomis.js line 273 clicks the Studio's Copy the Study lines 150 ms after switching tabs; js/painting.js line 820 shows the note at activation and sets its key, and lines 367 and 379 replace the toast.` });
    // Draw it in the Studio shows a hidden head again (it draws what it copies), so back here the lines are up
    await tab(page, 'loomis');
    c = await card(page); i = await ink(page);
    t.check(c.pressed === 'true' && i.red > 100, 'back from Draw it in the Studio the head is shown again: the lines are back', { pressed: c.pressed, red: i.red });
    await clean(t, page, 'desktop hide');

    // Save PNG: the photo with the head, at the photo's size
    { const dl = await download(page, '#lh-save'); const png = await pngOf(page, dl); const prep = await page.evaluate(() => { const p = Studio.prep(); return [p.w, p.h]; }); t.check(dl && dl.suggestedFilename() === 'loomis-head.png' && png && png.w === prep[0] && png.h === prep[1] && png.red > 100 && png.cyan > 100, 'Save PNG downloads loomis-head.png at the photo\'s size with the head on it', { name: dl && dl.suggestedFilename(), png, prep }); }
    await page.evaluate(() => { const d = document.getElementById('saveDialog'); if (d && d.open) d.close(); }).catch(() => null);
    await clean(t, page, 'desktop save');

    // Draw it in the Studio from the card: the construction lands on the underdrawing, in pencil, shown
    armToast(page); await click(page, '#lh-cardStudio');
    const copied = await toastMatch(page, /underdrawing/, 4000);
    await sleep(300);
    const studio = await page.evaluate(() => { const c = document.getElementById('ps-sketch'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++; return { ink: n, shown: !document.getElementById('ps-paperWrap').classList.contains('ps-no-sketch'), status: document.getElementById('ps-status').textContent, tab: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id).join(), toast: document.getElementById('toast').textContent }; });
    t.check(!!copied && studio.tab === 'tab-paint' && studio.ink > 200 && studio.shown, 'Draw it in the Studio opens the Studio with the head on the underdrawing, shown', { copied, ...studio });
    t.note(`after Draw it in the Studio the Studio's status reads "${studio.status}" (the tool in hand; the underdrawing was drawn on, so the eraser would rub it out next)`);
    t.note(`"Draw it in the Studio" ends with the Studio's copy message: "${copied}" (it speaks of the Study lines, which the README counts the head among)`);
    await tab(page, 'loomis');
    t.check((await card(page)).done, 'back from the Studio the head is still fitted');
    await clean(t, page, 'desktop studio');

    // Back one mark from the fitted head, then Start over
    await click(page, '#lh-undo');
    c = await card(page); s = await lstate(page); i = await ink(page);
    t.check(!c.done && c.step === '8 of 8' && c.ask === 'Forehead' && !c.lock && s.pending && !s.points.forehead && s.has && i.red > 50 && i.yellow > 0, 'Back one mark from the fitted head returns to the forehead as a pending ring, with the head still drawn', { c: c.step, pending: !!s.pending, red: i.red });
    await click(page, '#lh-lock');
    t.check((await card(page)).done, 'locking it again refits');
    await click(page, '#lh-reset'); await click(page, '#lh-reset');
    c = await card(page); s = await lstate(page); i = await ink(page);
    t.check(c.step === '1 of 8' && c.ask === 'Left eye' && !c.done && c.undo && c.reset && c.show && c.save && c.studio && s.step === 0 && !s.has && !s.pending && Object.keys(s.points).length === 0 && i.any === 0, 'Start over (twice) empties everything and the controls go off', { c, s: { step: s.step, has: s.has }, i });
    await tab(page, 'study');
    t.check((await studyInk(page, 'cv-orig')).red === 0, 'after Start over the Study tab has no head');
    await clean(t, page, 'desktop start over');
    await page.context().close();
  }

  // ================= desktop: loaded photos: Back after each mark, skips, Start over mid-way, the same point, corners, the tight crop, a new photo while marking =================
  {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await loadPhoto(page, await makeImage(page, { width: 600, height: 800, name: 'face.png' }));
    let c = await card(page);
    t.check(c.photo[1] > c.photo[0] && near(c.photo[1] / c.photo[0], 800 / 600, 0.01) && c.step === '1 of 8', 'a photo loaded from the Loomis strip fills the stage at its own aspect', c.photo);
    const marks = await marksFor(page);
    // Back after each mark: the mark comes back as the pending ring, and locks again
    let backOk = true; const backLog = [];
    await tap(page, marks.leftEye[0], marks.leftEye[1]); await click(page, '#lh-back');
    c = await card(page); let s = await lstate(page);
    backOk &= !s.pending && s.step === 0 && c.lock && c.back && c.undo;
    if (!backOk) backLog.push('Back with a pending mark did not clear it');
    for (let k = 0; k < ORDER.length; k++) {
      const key = ORDER[k], [fx, fy] = marks[key];
      await mark(page, fx, fy);
      await click(page, k === 7 ? '#lh-undo' : '#lh-back');
      s = await lstate(page); c = await card(page);
      const ok = s.step === k && s.pending && near(s.pending.x, fx, 0.01) && near(s.pending.y, fy, 0.01) && !s.points[key] && !c.lock && c.step === `${k + 1} of 8` && c.ask === NAMES[key] && /Drag to fine-tune/.test(c.sub);
      if (!ok) backLog.push(`${key}: step ${s.step}, pending ${JSON.stringify(s.pending)}, card ${c.step} ${c.ask}`);
      backOk &= ok;
      await click(page, '#lh-lock');
      s = await lstate(page);
      if (!(s.step === k + 1 && s.points[key])) { backOk = false; backLog.push(`${key}: re-lock failed`); }
    }
    t.check(backOk, 'Back after each mark brings that mark back as the pending ring (the strip\'s Back from the fitted head too), and Lock in puts it back', backLog);
    t.check((await card(page)).done && (await lstate(page)).has, 'the sequence with a Back at every step still ends in a fitted head');
    await clean(t, page, 'photo back');

    // skips: the brows and the forehead, and Back onto a skipped step
    await click(page, '#lh-reset'); armToast(page);
    await sequence(page, marks, ['leftBrow', 'rightBrow', 'forehead']);
    const skipToast = await toastMatch(page, /head is over the face/i, 1500);
    s = await lstate(page); c = await card(page);
    t.check(c.done && s.has && Object.keys(s.points).sort().join() === 'chin,leftEye,mouth,nose,rightEye' && near(s.fit.yaw, 0, 0.05) && near(s.fit.s, 0.2, 0.02), 'skipping both brows and the forehead fits the head from the five needed marks, level', { points: Object.keys(s.points), fit: s.fit });
    t.check(!!skipToast, 'ending with Skip on the forehead still says "The head is over the face"', { toast: await text(page, '#toast'), card: c.step });
    if (!skipToast) t.finding({ title: 'Skipping the forehead as the last step fits the head without a word: "The head is over the face" only follows a Lock in', severity: 'low', steps: '1. On the Loomis head, lock in the eyes, (skip or lock the brows,) nose, mouth and chin. 2. At "8 of 8 Forehead" press Skip.', expected: 'The same message as after locking the forehead: "The head is over the face" (the README: after the last the head is drawn over the photo; eyebrows and forehead can be skipped).', actual: `The head is drawn and the card changes to "${c.step}", but no toast: js/loomis.js line 159 toasts only in lock(); skip() (lines 161-167) refits silently.` });
    await click(page, '#lh-undo');
    c = await card(page); s = await lstate(page);
    t.check(!c.done && c.step === '8 of 8' && c.ask === 'Forehead' && c.lock && c.skip && !s.pending && s.has, 'Back onto a skipped forehead: nothing pending, Lock in off, Skip on, the head still fitted', c);
    await click(page, '#lh-skip');
    t.check((await card(page)).done, 'Skip again refits');
    await click(page, '#lh-skip'); await click(page, '#lh-skip');
    t.check((await card(page)).done && (await lstate(page)).step === 8, 'Skip pressed with the head fitted does nothing');
    // Skip is not offered for a needed mark: a click on it mid-way changes nothing
    await click(page, '#lh-reset'); await mark(page, ...marks.leftEye); await mark(page, ...marks.rightEye); await click(page, '#lh-skip'); await click(page, '#lh-skip');
    c = await card(page); await click(page, '#lh-skip'); s = await lstate(page);
    t.check(c.ask === 'Nose' && !c.skip && s.step === 4, 'Skip is hidden for the nose and a click on it does nothing', { ask: c.ask, skip: c.skip, step: s.step });
    // Start over mid-way, and after that Back does nothing
    await mark(page, ...marks.nose);
    await click(page, '#lh-reset'); await click(page, '#lh-back'); await click(page, '#lh-undo');
    s = await lstate(page); c = await card(page);
    t.check(s.step === 0 && Object.keys(s.points).length === 0 && !s.pending && c.step === '1 of 8' && c.undo && c.reset && (await ink(page)).any === 0, 'Start over mid-way empties the marks; Back after it does nothing', { step: s.step, c: c.step });
    await clean(t, page, 'photo skips');

    // every mark on the same point
    for (let k = 0; k < 8; k++) await mark(page, 0.5, 0.5);
    s = await lstate(page); c = await card(page); let i = await ink(page);
    const sameSaid = `${await text(page, '#toast')} ${await text(page, '#lh-sub')}`;
    const sameOk = (s.has && s.fit.s > 0.01 && i.red > 50) || (!s.has && /different points/.test(sameSaid) && i.red === 0);
    t.check(sameOk, 'eight marks on one point still give a head that is drawn (or the page says the marks cannot make one)', { fit: s.fit, ink: i, said: sameSaid, card: c.step });
    if (!sameOk) t.finding({ title: 'With the eyes on one point the fit collapses to a head of radius 0: "The head is over the face", but nothing is drawn and the arrows sit around a point', severity: 'medium', steps: '1. On the Loomis head (sample or any photo), tap the same spot for every feature and press Lock in each time (eight times; or lock both eyes on one spot and the rest anywhere).', expected: 'A head of some size (the other marks give one), or the card says the two eyes must be two different points and asks again.', actual: `The toast says "The head is over the face" and the card "Head fitted / Drag a dot or a line to adjust it", but the fit is ${JSON.stringify(s.fit)}: radius 0, so no ball, no lines (${i.red} red pixels) and nothing to drag; six arrow buttons are drawn around the point and turn an invisible head. Cause: js/loomis.js line 86, s0 = eyeDist / 0.8 is 0 when the eyes coincide; the Nelder–Mead simplex steps for s are s0 × 0.2 and s0 × 0.05 (lines 100, 104), so s never leaves 0, where the cost is 1e9 (line 94); lock() at line 159 announces the head regardless.` });
    await click(page, '#lh-reset');
    // marks at the picture's corners, with the brows and forehead skipped
    const corners = { leftEye: [-0.05, -0.05], rightEye: [1.05, -0.05], nose: [0.5, 0.5], mouth: [0.5, 0.75], chin: [0.5, 1.05] };
    for (const key of ORDER) { if (corners[key]) await markDragged(page, ...corners[key]); else await click(page, '#lh-skip'); }
    s = await lstate(page); i = await ink(page);
    t.check(s.has && s.points.leftEye.x === 0 && s.points.leftEye.y === 0 && s.points.rightEye.x === 1 && s.points.chin.y === 1 && i.red > 50 && Number.isFinite(s.fit.yaw), 'marks at the picture\'s corners and edges fit a (huge) head that is drawn, without error', { fit: s.fit, red: i.red });
    await tapHandle(page, 'left').catch(() => null);
    await clean(t, page, 'photo same point and corners');

    // a tightly cropped head (the crown above the picture): where do the arrows go?
    await click(page, '#lh-reset');
    const tight = await marksFor(page, { cy: 0.1 });
    await sequence(page, tight, ['leftBrow', 'rightBrow', 'forehead']);
    s = await lstate(page);
    const hs = await handlesOf(page); const box = await ovBox(page);
    const off = hs.filter((h) => h.x < 0 || h.y < 0 || h.x > box.W || h.y > box.H).map((h) => h.glyph);
    const p0 = s.fit.pitch;
    { const h = hs.find((x) => x.glyph === 'down'); const k = box.w / box.W; await page.mouse.move(box.x + Math.max(0, Math.min(box.W, h.x)) * k, box.y + Math.max(0, Math.min(box.H, h.y)) * k); await page.mouse.down(); await page.mouse.up(); }
    const p1 = (await lstate(page)).fit.pitch;
    const tightOk = off.length === 0 || p1 !== p0;
    t.check(tightOk, 'for a head whose crown is above the picture the nod and tilt arrows can still be tapped', { off, handles: hs.map((h) => [h.glyph, Math.round(h.x), Math.round(h.y)]), picture: [box.W, box.H], pitch: [p0, p1] });
    if (!tightOk) t.finding({ title: 'For a tightly cropped head (crown cut off by the top of the picture) the nod and tilt arrows lie above the picture and cannot be tapped', severity: 'medium', steps: '1. Load a portrait cropped close, so the top of the head is outside the picture (or on any photo mark the eyes about a tenth of the way down, the nose, mouth and chin below them). 2. Lock in the marks. 3. Look for the up/down (nod) and curved (tilt) arrows and try to tap them.', expected: 'All six arrows are on screen and tappable (kept inside the picture, or drawn on the stage around it), since the README says the arrow buttons around the ball turn, nod and tilt it.', actual: `The arrows ${JSON.stringify(off)} are placed at ${JSON.stringify(hs.filter((h) => off.includes(h.glyph)).map((h) => [h.glyph, Math.round(h.x), Math.round(h.y)]))} on a picture ${box.W} × ${box.H}: above its top edge, so they are neither drawn nor reachable (a tap at the nearest point of the picture leaves pitch at ${p1}). Only the lines (brow, hairline, eye line) can still nod it. Cause: js/loomis.js lines 189-198 (handles: the nod arrows at cy − R − pad, the tilt arrows at cy − 0.78 R − 0.6 pad) and 440 (drawn on the overlay, which is exactly the photo's box: styles.css line 1622); line 325 (pos) clamps the pointer into the picture and line 220 needs it within 16 px of the arrow.` });
    await clean(t, page, 'photo tight crop');

    // a new photo while marking: the marks go, the card starts again; a rejected file leaves them
    await click(page, '#lh-reset');
    await mark(page, ...marks.leftEye); await mark(page, ...marks.rightEye); await tap(page, ...marks.leftBrow);
    s = await lstate(page);
    t.check(s.step === 2 && s.pending, 'two marks locked and a third pending');
    const rejected = [['a text file', textFile()], ['a broken JPEG', brokenImage()], ['a 2 × 4000 strip', await makeImage(page, { width: 2, height: 4000, name: 'strip.png' })], ['a 1 × 1 image', await makeImage(page, { width: 1, height: 1, name: 'dot.png' })]];
    const rej = [];
    for (const [label, file] of rejected) {
      armToast(page);
      await loadPhoto(page, file, { settle: 600 });
      const msg = await toastMatch(page, /./, 1500);
      s = await lstate(page); c = await card(page);
      const ok = s.step === 2 && s.pending && Object.keys(s.points).length === 2 && c.step === '3 of 8' && !!msg;
      if (!ok) rej.push(`${label}: step ${s.step}, pending ${!!s.pending}, card ${c.step}, toast "${msg}"`);
      else rej.push(`${label}: kept, says "${(msg || '').slice(0, 70)}"`);
    }
    t.check(rej.every((x) => /: kept/.test(x)), 'a rejected file (text, broken, a strip, 1 px) leaves the marks and the pending ring, and says why', rej);
    await loadPhoto(page, await makeImage(page, { width: 800, height: 600, draw: 'transparent', name: 'see-through.png' }));
    s = await lstate(page); c = await card(page); i = await ink(page);
    t.check(s.step === 0 && !s.pending && Object.keys(s.points).length === 0 && c.step === '1 of 8' && c.undo && i.any === 0 && c.photo[0] > c.photo[1], 'a new photo (a transparent landscape PNG) while marking starts the marks again on it', { step: s.step, c: c.step, photo: c.photo });
    t.note('a new photo clears the Loomis marks without a word; the card going back to "1 of 8" is the only sign (the Study\'s own marks get "cleared for the new photo")');
    { armToast(page); await mark(page, 0.4, 0.4); await loadPhoto(page, svgImage(), { settle: 800 }); s = await lstate(page); const msg = await text(page, '#toast'); t.note(`an SVG with no size (${svgImage().name}) ${s.step === 0 && !s.pending ? 'loaded and reset the marks' : 'was refused and the marks stayed'}; toast: "${msg}"`); t.check(s.step === 0 || (s.step === 1 && msg), 'an SVG either loads (marks reset) or is refused with a word', { step: s.step, msg }); }
    await clean(t, page, 'photo new while marking');

    // a press that outlives the photo: the mark placed on the old photo is dropped, the loupe goes
    await click(page, '#lh-reset');
    await press(page, 0.5, 0.5);
    await page.setInputFiles('#file', await makeImage(page, { width: 600, height: 800, draw: 'noise', name: 'noise.png' }));
    await page.waitForFunction(() => { const b = document.getElementById('busy'); return b && b.hidden && Loomis.state.step === 0 && !Loomis.state.pending; }, null, { timeout: 15000 }).catch(() => null);
    { const b = await ovBox(page); await page.mouse.move(b.x + b.w * 0.6, b.y + b.h * 0.6, { steps: 4 }); }
    const midPress = { s: await lstate(page), loupe: await loupe(page) };
    await page.mouse.up();
    s = await lstate(page); c = await card(page);
    t.check(!midPress.s.pending && !s.pending && s.step === 0 && !(await loupe(page)).shown && c.step === '1 of 8', 'a photo loaded during a press: the press places nothing on the new photo and the loupe is gone on release', { pendingDuring: midPress.s.pending, loupeDuring: midPress.loupe.shown, after: s.pending });
    // a 24-megapixel photo
    await loadPhoto(page, await makeImage(page, { width: 6000, height: 4000, type: 'image/jpeg', quality: 0.6, name: 'big.jpg' }), { settle: 1500 });
    c = await card(page);
    const bigMarks = await marksFor(page, { s: 0.12, cy: 0.3 });
    await sequence(page, bigMarks);
    s = await lstate(page); i = await ink(page);
    t.check(c.photo[0] > c.photo[1] && s.has && near(s.fit.s, 0.12, 0.01) && near(s.fit.yaw, 0, 0.05) && i.red > 50, 'a 24-megapixel photo: the stage shows it and the marks fit a level head on it', { photo: c.photo, fit: s.fit, red: i.red });
    await clean(t, page, 'photo 24 megapixels');

    // a tab switch with a mark pending keeps it; a reload keeps nothing (nothing is promised)
    await click(page, '#lh-reset'); await mark(page, 0.4, 0.4); await tap(page, 0.6, 0.4);
    await tab(page, 'study'); await tab(page, 'loomis');
    s = await lstate(page); c = await card(page);
    t.check(s.step === 1 && s.pending && near(s.pending.x, 0.6, 0.01) && !c.loupe && /Drag to fine-tune/.test(c.sub) && !c.lock, 'leaving and reopening the tab keeps the locked mark and the pending ring, loupe hidden', { step: s.step, pending: s.pending, sub: c.sub });
    await page.reload({ waitUntil: 'load' }); await sleep(500); await tab(page, 'loomis');
    c = await card(page);
    t.check(c.step === '1 of 8' && c.undo, 'after a reload the marks start again (nothing is kept, and nothing promised)');
    t.note('the Loomis head reads no saved state of its own: a reload mid-way starts the marks again on the sample');
    await clean(t, page, 'photo tab switch and reload');
    await page.context().close();
  }

  // ================= hostile saved state in every key the app reads: the tab must still fit a head =================
  {
    const storage = {};
    const keys = ['mode', 'drawers', 'smoothing', 'lean', 'blockView', 'canvasUnit', 'palette', 'paintChoice', 'myPaints', 'paintMixes', 'studioNotice', 'figureStudy', 'figureMixes', 'gameMode', 'gameBest', 'battleBest'];
    const junk = ['constructor', '{"__proto__":{"x":1}}', 'NaN', JSON.stringify(Array(5000).fill('x')), '{"a":{"b":{"c":[1,2,{"d":null}]}}}', '12', 'true', '[]', '{"constructor":1,"__proto__":2,"toString":3}', '"\\u0000"', '-1e999', 'undefined'];
    keys.forEach((k, n) => { storage['portrait-value-studio.' + k] = junk[n % junk.length]; });
    PROTO_NAMES.forEach((n) => { storage['portrait-value-studio.' + n] = n; });
    const page = await openPage(site, { viewport: DESKTOP, url: '#loomis', storage });
    await sleep(500);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id).join());
    const marks = await marksFor(page);
    await sequence(page, marks, ['leftBrow', 'rightBrow', 'forehead']);
    const s = await lstate(page), c = await card(page);
    t.check(shown === 'tab-loomis' && c.done && s.has && near(s.fit.yaw, 0, 0.05) && (await ink(page)).red > 50, 'with junk in every saved key the Loomis tab opens from #loomis and fits a head', { shown, fit: s.fit });
    await clean(t, page, 'hostile storage');
    await page.context().close();
  }

  // ================= phone: the layout, the sequence with the loupe at the corners, the toast, the arrows, hide, save, the Studio =================
  {
    const page = await openPage(site, { viewport: PHONE });
    await tab(page, 'loomis');
    let lay = await layoutOf(page);
    t.check(lay.card.b <= lay.stage.y + 1 && !overlaps(lay.card, lay.wrap) && inside(lay.wrap, lay.stage) && lay.strip.b <= lay.vh + 1 && lay.strip.y > lay.stage.y && lay.exit.shown && !lay.tabs.shown && (await hscroll(page)) <= 0, 'phone: the card is a row above the photo, the strip at the bottom with a Leave button, the tabs stepped aside, no horizontal scroll', lay);
    const marks = await marksFor(page);
    // the loupe at a corner stays inside the stage, and at the opposite corner
    for (const [fx, fy] of [[0.02, 0.02], [0.98, 0.98], [0.5, 0.02]]) {
      await press(page, fx, fy); const lp = await loupe(page); await page.mouse.up();
      t.check(lp.shown && lp.inStage && lp.size[0] >= 100, `phone: the loupe at (${fx}, ${fy}) is on screen inside the stage`, lp);
    }
    await click(page, '#lh-back');
    armToast(page);
    await sequence(page, marks, ['leftBrow', 'rightBrow']);
    const toast = await toastMatch(page, /head is over the face/i, 2000);
    const tr = await rect(page, '#toast'), sr = await rect(page, '#lh-root .ps-strip');
    let s = await lstate(page), c = await card(page), i = await ink(page);
    t.check(!!toast && c.done && s.has && near(s.fit.yaw, 0, 0.05) && i.red > 50, 'phone: the sequence fits a level head and says so', { toast, fit: s.fit });
    lay = await layoutOf(page);
    t.check(inside(lay.wrap, lay.stage) && !overlaps(lay.card, lay.wrap), 'phone: once fitted the smaller card still leaves the photo inside the stage', lay);
    const toastClear = !overlaps(tr, sr);
    t.check(toastClear, 'phone: the toast does not cover the Loomis strip', { toast: tr, strip: sr });
    if (!toastClear) t.finding({ title: 'On a phone the toast sits over the Loomis strip\'s icons', severity: 'low', steps: '1. At 390 × 844 open the Loomis head and lock in the marks (or do anything that shows a toast). 2. Look at the bottom strip while "The head is over the face" shows.', expected: 'The note sits above the strip, as it does on the Studio tab (styles.css line 1355 lifts it 78 px there).', actual: `The toast (${JSON.stringify(tr)}) overlaps the strip (${JSON.stringify(sr)}) for the note's 1.8 s. Cause: styles.css line 1355 lists body.tab-paint and body.figure-focus but not body.tab-loomis.` });
    await screenshot(page, 'loomis-phone-fitted');
    // the arrows all on the picture, and one of them works
    const hs = await handlesOf(page); const box = await ovBox(page);
    t.check(hs.every((h) => h.x >= 0 && h.y >= 0 && h.x <= box.W && h.y <= box.H), 'phone: all six arrows are on the picture for a centred head', hs.map((h) => [h.glyph, Math.round(h.x), Math.round(h.y)]));
    const auto = s.auto; await tapHandle(page, 'down');
    t.check(near((await lstate(page)).fit.pitch, auto.pitch + 3 * DEG, 1e-6), 'phone: a tap on the down arrow nods three degrees');
    { const r = await dragPiece(page, 'centre', 14, 0); t.check(r && r.changed.join() === 'yaw', 'phone: dragging the centre line turns the head', r && r.changed); }
    await click(page, '#lh-refit');
    t.check(changed((await lstate(page)).fit, auto).length === 0, 'phone: Back to the fit returns the fitted head');
    await clean(t, page, 'phone fitted');
    // hide, save, the Studio
    await click(page, '#lh-show'); i = await ink(page); await click(page, '#lh-show');
    t.check(i.red === 0 && (await ink(page)).red > 50, 'phone: hide and show the head');
    { const dl = await download(page, '#lh-save'); const png = await pngOf(page, dl); t.check(dl && dl.suggestedFilename() === 'loomis-head.png' && png && png.red > 50, 'phone: Save PNG downloads the head', { name: dl && dl.suggestedFilename(), png }); }
    await page.evaluate(() => { const d = document.getElementById('saveDialog'); if (d && d.open) d.close(); }).catch(() => null);
    armToast(page); await click(page, '#lh-studio');
    const copied = await toastMatch(page, /underdrawing/, 4000);
    const studio = await page.evaluate(() => { const c = document.getElementById('ps-sketch'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++; return { ink: n, tab: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id).join() }; });
    t.check(!!copied && studio.tab === 'tab-paint' && studio.ink > 100, 'phone: the strip\'s Draw it in the Studio puts the head on the underdrawing', { copied, ...studio });
    await page.evaluate(() => document.getElementById('ps-exit').click()); await sleep(300);
    await tab(page, 'loomis');
    await click(page, '#lh-exit'); await sleep(300);
    const after = await page.evaluate(() => ({ shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id).join(), tabs: getComputedStyle(document.querySelector('.tabs')).display }));
    t.check(after.shown === 'tab-study' && after.tabs !== 'none', 'phone: Leave returns to the Study tab with the tabs back', after);
    await clean(t, page, 'phone studio and leave');
    await page.context().close();
  }

  // ================= the coverage critic's gaps: high and medium first =================
  // gap (high): a turned, nodded, tilted or long head is fitted from its marks, not only a level one
  await guard(t, 'turned, nodded, tilted and long heads', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    const POSES = [{ yaw: 0.5 }, { yaw: -0.5 }, { yaw: 0.9 }, { yaw: -0.9, bare: true }, { pitch: 0.35 }, { pitch: -0.35, bare: true }, { roll: 0.3 }, { roll: -0.3 }, { len: 0.85 }, { len: 1.2, bare: true }, { yaw: -0.6, pitch: 0.25, roll: -0.2, len: 1.1 }];
    const rows = [];
    for (const pose of POSES) {
      await click(page, '#lh-reset');
      await sequence(page, await posedMarks(page, pose), pose.bare ? ['leftBrow', 'rightBrow', 'forehead'] : []);
      const f = (await lstate(page)).fit, want = { yaw: 0, pitch: 0, roll: 0, len: 1, ...pose };
      // the nod is not asserted: a nod and the face length trade off on eight 2-D marks, and the fit leans toward a level head (the README's pull); the landmarks are what it promises
      const ok = !!f && near(f.yaw, want.yaw, 0.06) && near(f.roll, want.roll, 0.06) && near(f.len, want.len, 0.05) && near(f.s, 0.2, 0.02) && near(f.tx, 0.5, 0.02) && near(f.ty, 0.45, 0.02);
      const res = await residualsOf(page), red = (await ink(page)).red;
      rows.push({ pose: JSON.stringify(pose), fit: f && [f.yaw, f.pitch, f.roll, f.len, f.s].map((v) => +v.toFixed(3)), maxResidual: Math.max(...res), red, ok: ok && Math.max(...res) <= 0.01 && red > 50 });
    }
    const bad = rows.filter((r) => !r.ok);
    t.check(bad.length === 0, 'a turned (either way), tilted or long head is fitted to the pose that made its marks, yaw sign included, every landmark within 1% of its mark, and drawn', bad.length ? bad : `${rows.length} poses`);
    t.note(`the nods come back as ${rows.filter((r) => /pitch/.test(r.pose)).map((r) => `${r.pose} -> pitch ${r.fit ? r.fit[1] : 'none'} (residual ${r.maxResidual})`).join('; ')}: the landmarks still land within 1% of a picture width, and the nod leans toward level`);
    if (bad.length) t.finding({ title: 'A turned, nodded, tilted or long head is not fitted to the pose its marks were made from', severity: 'high', steps: '1. On the Loomis head (the sample), tap and lock the eight marks of a head turned to one side, nodded, tilted or lengthened (a three-quarter view is the usual case). 2. Read the fitted yaw, pitch, roll and length, and look at where the lines lie.', expected: 'The fit recovers the pose (the yaw with its sign, the nod, the tilt and the face length), every mark lands on its landmark, and the head is drawn over the face.', actual: JSON.stringify(bad).slice(0, 500) });
    await clean(t, page, 'gap: turned and posed heads');
    await page.context().close();
  });

  // gap (high): a head hidden with the eye button stays hidden through Start over, a new photo and Back one mark
  await guard(t, 'a hidden head after Start over, a new photo and Back one mark', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    const FIVE = ['leftBrow', 'rightBrow', 'forehead'];
    await sequence(page, await marksFor(page), FIVE);
    await click(page, '#lh-show');
    await click(page, '#lh-reset'); await click(page, '#lh-reset');
    armToast(page);
    await sequence(page, await marksFor(page), FIVE);
    const bad = [];
    let c = await card(page), i = await ink(page);
    if (!(c.done && i.red > 50)) bad.push({ after: 'Start over', fitted: c.done, red: i.red, pressed: c.pressed, toast: await toastMatch(page, /over the face/i, 300) });
    await loadPhoto(page, await makeImage(page, { width: 800, height: 600, name: 'other.png' }), { settle: 800 });
    armToast(page);
    await sequence(page, await marksFor(page), FIVE);
    c = await card(page); i = await ink(page);
    if (!(c.done && i.red > 50)) bad.push({ after: 'a new photo', fitted: c.done, red: i.red, pressed: c.pressed, toast: await toastMatch(page, /over the face/i, 300) });
    // still hidden: Back one mark, then the forehead tapped and locked again
    await click(page, '#lh-undo');
    const fh = (await marksFor(page)).forehead;
    await tap(page, fh[0], fh[1]); await click(page, '#lh-lock');
    c = await card(page); i = await ink(page);
    if (!(c.done && i.red > 50)) bad.push({ after: 'Back one mark and Lock in', fitted: c.done, red: i.red, pressed: c.pressed, toast: await toastMatch(page, /over the face/i, 300) });
    t.check(bad.length === 0, 'a head hidden with the eye button is drawn again after Start over, a new photo and Back one mark and Lock in, so the fit that follows shows it', bad.length ? bad : 'drawn after all three');
    if (bad.length) t.finding({ title: 'A head hidden with the eye button stays hidden after Start over, a new photo or Back one mark, while "The head is over the face" is said', severity: 'high', steps: '1. On the Loomis head, lock in the marks and press the eye button (Show or hide the head). 2. Press Start over twice (or load another photo, or press Back one mark and then Lock in) and mark the features again.', expected: 'The head is drawn over the photo after the last mark, as the README says ("After the last the head is drawn over the photo"), or the page says the head is hidden and how to show it.', actual: `${JSON.stringify(bad).slice(0, 420)} Cause: js/loomis.js line 186, reset() clears points, step, fit and auto but not state.shown, which the eye button sets (line 305); clearMarks (js/app.js line 2095) calls reset for a new photo; back() (line 178) leaves shown alone.` });
    await clean(t, page, 'gap: hidden head');
    await page.context().close();
  });

  // gap (medium): the loupe shows the spot under the finger, and is never over the finger
  await guard(t, 'the loupe content and its place', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await loadPhoto(page, await makeImage(page, { width: 600, height: 800, name: 'face.png' }), { settle: 800 });
    const rows = [];
    for (const [fx, fy, name] of [[0.5, 0.25, 'hair'], [0.5, 0.42, 'face'], [0.5, 0.85, 'shirt'], [0.1, 0.1, 'background']]) {
      await press(page, fx, fy);
      const r = await page.evaluate(([fx, fy]) => {
        const lc = document.getElementById('lh-loupeCanvas'), ph = document.getElementById('lh-photo');
        const mean = (ctx, x0, y0) => { const d = ctx.getImageData(x0, y0, 4, 4).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n].map(Math.round); };
        const o = Math.round(lc.width / 2 + 16); // 16 loupe pixels from the centre: clear of the crosshair and its ring
        return { loupe: mean(lc.getContext('2d'), o, o), photo: mean(ph.getContext('2d'), Math.round(fx * ph.width) - 2, Math.round(fy * ph.height) - 2) };
      }, [fx, fy]);
      await page.mouse.up();
      rows.push({ name, ...r, same: r.loupe.every((v, k) => Math.abs(v - r.photo[k]) <= 24) });
    }
    const distinct = rows.every((r, a) => rows.every((o, b) => a === b || Math.abs(r.photo[0] - o.photo[0]) + Math.abs(r.photo[1] - o.photo[1]) + Math.abs(r.photo[2] - o.photo[2]) > 40));
    t.check(rows.every((r) => r.same) && distinct, 'the loupe shows the photo under the finger: its middle is the colour of the spot pressed (hair, face, shirt, background)', rows);
    const edgesDesk = await edgeProbe(page);
    const phone = await openPage(site, { viewport: PHONE });
    await tab(phone, 'loomis');
    const edgesPhone = await edgeProbe(phone);
    t.check([...edgesDesk, ...edgesPhone].every((e) => e.shown && e.inStage && !e.under), 'the loupe for a press at each edge is shown inside the stage and not under the finger, on both widths', { desktop: edgesDesk, phone: edgesPhone });
    await clean(t, page, 'gap: loupe');
    await clean(t, phone, 'gap: loupe on a phone');
    await phone.context().close();
    await page.context().close();
  });

  // gap (medium): marks placed while a new photo is still being prepared must not land on the new picture
  await guard(t, 'marks while a new photo is prepared', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await mark(page, 0.3, 0.3); await mark(page, 0.6, 0.3);
    // at the moment the "Updating" note comes up (the old picture still shown), two marks are placed and locked in one task
    await page.evaluate(() => {
      window.__mid = null;
      const busy = document.getElementById('busy');
      new MutationObserver((_, mo) => {
        if (busy.hidden) return;
        mo.disconnect();
        const before = Loomis.state.step;
        Loomis.place(0.4, 0.45); document.getElementById('lh-lock').click();
        Loomis.place(0.7, 0.5); document.getElementById('lh-lock').click();
        window.__mid = { before, after: Loomis.state.step };
      }).observe(busy, { attributes: true, attributeFilter: ['hidden'] });
    });
    await page.setInputFiles('#file', await makeImage(page, { width: 6000, height: 4000, type: 'image/jpeg', quality: 0.6, name: 'big.jpg' }));
    await page.waitForFunction(() => window.__mid && document.getElementById('busy').hidden, null, { timeout: 60000 }).catch(() => null);
    await sleep(800);
    const mid = await page.evaluate(() => window.__mid);
    const s = await lstate(page), c = await card(page);
    const kept = s.step !== 0 || Object.keys(s.points).length > 0;
    if (!mid) t.note('the "Updating" note never came up while the 24-megapixel photo was prepared, so no mark was placed in that window');
    else {
      t.check(!kept, 'marks placed while a new photo is being prepared are dropped, not kept for the new photo', { mid, step: s.step, points: Object.keys(s.points), card: c.step });
      if (kept) t.finding({ title: 'Marks placed while a new photo is still being prepared survive onto the new photo', severity: 'medium', steps: '1. On the Loomis head, lock two marks. 2. Load a large photo (a 24-megapixel JPEG) with Load photo. 3. While the "Updating…" note shows, tap and lock marks on the picture.', expected: 'The new photo starts with no marks (the README: loading a new photo clears all three), so marks placed on the old picture are dropped or refused.', actual: `After the new photo arrives the card reads "${c.step} ${c.ask}" with ${Object.keys(s.points).length} mark(s) kept (step ${s.step}); the two locked during the note were placed on the old picture and now sit on the new one. Cause: js/loomis.js clears its marks only in reset(), called from clearMarks when the file is read (js/app.js lines 552 and 2095-2097); the picture itself changes only at studio:result (js/loomis.js line 357), and nothing in between clears marks placed meanwhile.` });
    }
    await clean(t, page, 'gap: marks while preparing');
    await page.context().close();
  });

  // gap (medium): the head sits where the fit puts it on the Study pictures and in their saved PNGs (by position, not colour counts)
  await guard(t, 'the head on the Study pictures and their PNGs', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await loadPhoto(page, await makeImage(page, { width: 600, height: 800, name: 'face.png' }), { settle: 800 });
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const fit = (await lstate(page)).fit;
    await tab(page, 'study');
    const rows = {};
    for (const id of ['cv-orig', 'cv-value', 'cv-block']) rows[id] = await headStats(page, `document.getElementById('${id}').nextElementSibling`, fit);
    for (const kind of ['orig', 'value', 'block']) {
      const dl = await download(page, `[data-save="${kind}"]`);
      rows[`png-${kind}`] = dl && (await decodePng(page, dl)) ? await headStats(page, 'window.__png', fit) : null;
    }
    // the rim: at least 70% of its angles carry a head ink within 3 px (a line that crosses the rim covers it there); the centre line: 80% of its run
    const placed = Object.values(rows).every((r) => r && r.rim !== null && r.rim >= 0.7 && r.run !== null && r.run >= 0.8);
    t.check(placed, 'the head is where the fit puts it on the Study pictures and in their saved PNGs: the ball\'s rim and the centre line are in place', rows);
    if (!placed) t.finding({ title: 'The head on the Study pictures or in their saved PNGs is not where the fit puts it', severity: 'medium', steps: '1. Load a portrait and lock in the Loomis marks (the head is fitted). 2. Open the Study tab and look at the head over the photo, the three-value study and the color blocks, and at their Save PNG files.', expected: 'The ball and the centre line lie where the fitted head puts them, in each picture and each saved PNG.', actual: JSON.stringify(rows).slice(0, 500) });
    t.note('the underdrawing (Draw it in the Studio) is fitted to the paper, not the picture, so its place is not measured here');
    await clean(t, page, 'gap: study head position');
    await page.context().close();
  });

  // gap (medium): the no-head card, and the way back from it
  await guard(t, 'the no-head state and the way back', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    // both eyes, nose, mouth and chin on one point: the five needed marks cannot make a head
    await mark(page, 0.5, 0.5); await mark(page, 0.5, 0.5);
    await click(page, '#lh-skip'); await click(page, '#lh-skip');
    await mark(page, 0.5, 0.5); await mark(page, 0.5, 0.5); await mark(page, 0.5, 0.5);
    await click(page, '#lh-skip');
    const c = await card(page), s = await lstate(page), i = await ink(page), hs = await handlesOf(page);
    const toast = (await text(page, '#toast')) || '';
    const noHead = c.step === 'No head' && c.ask === 'These marks make no head' && /different points/.test(c.sub) && c.backShown && !c.lockShown && !c.skip && c.show && c.save && c.studio && hs.length === 0 && i.red === 0 && !s.has && /different points/.test(toast);
    t.check(noHead, 'when the marks make no head the card says No head and why, offers Back, turns Show, Save and Draw it in the Studio off, and draws no arrows or head', { step: c.step, ask: c.ask, sub: c.sub.slice(0, 80), backShown: c.backShown, lockShown: c.lockShown, skip: c.skip, show: c.show, save: c.save, studio: c.studio, arrows: hs.length, red: i.red, toast });
    // Back twice: the forehead, then the chin's ring; the chin moved off the others and locked, a head again
    await click(page, '#lh-back'); await click(page, '#lh-back');
    const c2 = await card(page), s2 = await lstate(page);
    t.check(c2.step === '7 of 8' && c2.ask === 'Chin' && !!s2.pending && !s2.points.chin, 'Back twice gives the chin back as a pending ring, so it can be moved', { step: c2.step, ask: c2.ask, pending: s2.pending });
    await tap(page, 0.5, 0.9); await click(page, '#lh-lock'); await click(page, '#lh-skip');
    const s3 = await lstate(page), c3 = await card(page);
    t.check(s3.has && c3.done, 'moving the chin off the others and locking it fits a head again', { has: s3.has, step: c3.step, fit: s3.fit && +s3.fit.s.toFixed(3) });
    await clean(t, page, 'gap: no head');
    await page.context().close();
  });

  // gap (medium): touch on a phone: a finger places and drags a mark, drags a dot, a second finger and a cancel leave nothing stuck, a held arrow keeps turning
  await guard(t, 'touch on a phone', async () => {
    const page = await openPage(site, { viewport: PHONE });
    await tab(page, 'loomis');
    const cdp = await page.context().newCDPSession(page);
    const send = (type, pts = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
    const at = async (fx, fy) => { const b = await ovBox(page); return [b.x + fx * b.w, b.y + fy * b.h]; };
    const [x0, y0] = await at(0.3, 0.3), [x1, y1] = await at(0.36, 0.4);
    await send('touchStart', [[x0, y0]]); await sleep(60);
    const during = { loupe: (await loupe(page)).shown, pending: (await lstate(page)).pending };
    for (let k = 1; k <= 6; k++) await send('touchMove', [[x0 + ((x1 - x0) * k) / 6, y0 + ((y1 - y0) * k) / 6]]);
    const moved = (await lstate(page)).pending;
    await send('touchEnd'); await sleep(80);
    const after = { pending: (await lstate(page)).pending, loupe: (await loupe(page)).shown, scrollY: await page.evaluate(() => window.scrollY) };
    const placed = !!moved && near(moved.x, 0.36, 0.02) && near(moved.y, 0.4, 0.02) && !!after.pending && !after.loupe;
    t.check(during.loupe && !!during.pending && placed && after.scrollY === 0, 'a finger places a mark and drags it: the loupe is up, the mark follows the finger and stays when the finger lifts, and the page does not scroll', { during, moved, after });
    // a dot dragged by a finger once the head is fitted
    await click(page, '#lh-reset');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const pe = (await lstate(page)).points.chin;
    const [cx, cy] = await at(pe.x, pe.y), [dx, dy] = await at(pe.x - 0.03, pe.y + 0.02);
    await send('touchStart', [[cx, cy]]); await sleep(40);
    for (let k = 1; k <= 6; k++) await send('touchMove', [[cx + ((dx - cx) * k) / 6, cy + ((dy - cy) * k) / 6]]);
    const dragged = (await lstate(page)).points.chin;
    await send('touchEnd'); await sleep(80);
    t.check(near(dragged.x, pe.x - 0.03, 0.01) && near(dragged.y, pe.y + 0.02, 0.01) && (await lstate(page)).moving === null, 'a finger drags a dot: the mark follows it and nothing is left moving when it lifts', { from: pe, to: dragged });
    // a second finger lands mid-drag and both lift: no drag left going, no loupe up
    await send('touchStart', [[dx, dy]]); await sleep(30);
    await send('touchMove', [[dx + 4, dy + 2]]);
    const [sx, sy] = await at(0.8, 0.8);
    await send('touchMove', [[dx + 8, dy + 4], [sx, sy]]);
    await send('touchMove', [[dx + 12, dy + 6], [sx, sy + 4]]);
    await send('touchEnd'); await sleep(80);
    const two = { moving: (await lstate(page)).moving, loupe: (await loupe(page)).shown };
    t.check(two.moving === null && !two.loupe, 'a second finger landing mid-drag and both lifting leaves no drag going and no loupe up', two);
    // a touch the browser cancels
    await send('touchStart', [[dx, dy]]); await sleep(30);
    await send('touchMove', [[dx + 3, dy]]);
    await send('touchCancel'); await sleep(80);
    const cancelled = { moving: (await lstate(page)).moving, loupe: (await loupe(page)).shown };
    t.check(cancelled.moving === null && !cancelled.loupe, 'a touch the browser cancels leaves no drag going and no loupe up', cancelled);
    // an arrow held by a finger keeps turning
    const before = (await lstate(page)).fit;
    const h = await handleAt(page, 'right');
    await send('touchStart', [[h.x, h.y]]); await sleep(1000); await send('touchEnd'); await sleep(80);
    const held = Math.round(((await lstate(page)).fit.yaw - before.yaw) / (3 * DEG));
    t.check(held >= 4 && held <= 14, 'an arrow held by a finger keeps turning, about three degrees a step', { held });
    await clean(t, page, 'gap: touch');
    await page.context().close();
  });

  // gap (medium): dots close together: a press on a dot picks up that dot, the nearer one, on a small head at phone scale
  await guard(t, 'dots close together', async () => {
    const page = await openPage(site, { viewport: PHONE });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page, { s: 0.05 }), ['leftBrow', 'rightBrow', 'forehead']);
    const pts = await page.evaluate(() => ({ nose: Loomis.state.points.nose, mouth: Loomis.state.points.mouth }));
    const b = await ovBox(page), k = b.w / b.W;
    const apart = Math.hypot((pts.nose.x - pts.mouth.x) * b.W, (pts.nose.y - pts.mouth.y) * b.H);
    const res = [];
    for (const name of ['mouth', 'nose']) {
      const before = (await lstate(page)).points;
      const x = before[name].x * b.W, y = before[name].y * b.H;
      const hit = await hitAt(page, x, y);
      await page.mouse.move(b.x + x * k, b.y + y * k); await page.mouse.down();
      await page.mouse.move(b.x + (x + 2) * k, b.y + (y + 1) * k, { steps: 3 }); await page.mouse.up();
      const after = (await lstate(page)).points;
      const moved = Object.keys(after).filter((n) => Math.hypot(after[n].x - before[n].x, after[n].y - before[n].y) > 1e-4);
      res.push({ name, hit, moved });
    }
    t.check(res.every((r) => r.hit === 'mark:' + r.name && r.moved.length === 1 && r.moved[0] === r.name), 'a press on a dot picks up that dot, even when two dots are a few pixels apart (the nearer one wins)', { apartPx: +apart.toFixed(1), res });
    t.note('the arrows are tested before the dots (js/loomis.js hitTest): a dot under an arrow was not searched for here, since no level head puts one there');
    await clean(t, page, 'gap: dots close');
    await page.context().close();
  });

  // gap (medium): a profile, and two eyes on one point in a profile
  await guard(t, 'a profile and two eyes on one point', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    const rows = [];
    for (const yaw of [1.1, -1.1, 1.4]) {
      await click(page, '#lh-reset');
      await sequence(page, await posedMarks(page, { yaw }), []);
      const f = (await lstate(page)).fit, res = await residualsOf(page), red = (await ink(page)).red;
      rows.push({ yaw, fit: f && +f.yaw.toFixed(3), maxResidual: Math.max(...res), red, ok: !!f && Math.sign(f.yaw) === Math.sign(yaw) && Math.abs(f.yaw - yaw) < 0.08 && Math.max(...res) <= 0.01 && red > 50 });
    }
    t.check(rows.every((r) => r.ok), 'a profile (a turn of 1.1 either way, and 1.4) is fitted with its turn and every mark on its feature', rows);
    // the far eye sits on the silhouette: both eyes on the visible eye's spot, the rest where the profile puts them
    await click(page, '#lh-reset');
    const m = await posedMarks(page, { yaw: 1.1 });
    m.rightEye = m.leftEye;
    await sequence(page, m, []);
    const s = await lstate(page), c = await card(page), red = (await ink(page)).red;
    const coherent = (s.has && red > 50) || c.step === 'No head';
    t.check(coherent, 'two eyes on one point in a profile: the head is drawn, or the card says it makes no head (never a fit with nothing drawn)', { step: c.step, has: s.has, red, fit: s.fit && +s.fit.yaw.toFixed(3) });
    if (!coherent) t.finding({ title: 'Two eyes on one point in a profile: "The head is over the face" is said, but no head is drawn', severity: 'medium', steps: '1. On the Loomis head, tap the visible eye of a profile, press Lock in, then tap the same spot for the other eye and lock it. 2. Mark the nose, mouth and chin where the profile puts them, skip the brows and the forehead.', expected: 'A head is drawn, or the card says the marks make no head.', actual: `The card reads "${c.step}", the fit is ${JSON.stringify(s.fit)} and ${red} red pixels are drawn.` });
    t.note(`both eyes on the visible eye: the fit reads yaw ${s.fit ? s.fit.yaw.toFixed(3) : 'none'} for a profile of 1.1; ${red > 50 ? 'a head is drawn' : 'nothing is drawn'}`);
    await clean(t, page, 'gap: profile');
    await page.context().close();
  });

  // gap (medium): the far side of the head is faint and dashed
  await guard(t, 'the far side of the head is faint and dashed', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), []);
    for (let k = 0; k < 17; k++) await tapHandle(page, 'right'); // about 0.9 rad: the centre line's far half clear of its near half
    const r = await page.evaluate(() => {
      const c = document.getElementById('lh-overlay'), W = c.width, f = Loomis.state.fit, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const path = [];
      for (let k = 0; k <= 720; k++) { const th = (k / 720) * Math.PI * 2; const p = Loomis.project([0, -Math.cos(th), Math.sin(th)], f, false); if (p[2] < -0.05) path.push([p[0] * W, p[1] * W]); }
      let on = 0;
      for (const [x, y] of path) { const xi = Math.round(x), yi = Math.round(y); if (xi >= 0 && yi >= 0 && xi < c.width && yi < c.height && d[(yi * c.width + xi) * 4 + 3] > 25) on++; }
      let faint = 0;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a >= 60 && a <= 140 && Math.max(d[i], d[i + 1], d[i + 2]) > 100) faint++; }
      return { yaw: +f.yaw.toFixed(3), far: path.length, on, share: path.length ? +(on / path.length).toFixed(2) : null, faint };
    });
    const dashed = r.far > 100 && r.share !== null && r.share > 0.1 && r.share < 0.85 && r.faint > 0;
    t.check(dashed, 'the far half of the centre line is drawn faint and dashed: part of it inked, with gaps, and faint pixels in the overlay', r);
    if (!dashed) t.finding({ title: 'The far side of a turned head is drawn solid, or not at all, instead of faint and dashed', severity: 'medium', steps: '1. On the Loomis head, lock in the marks. 2. Press the right arrow about 17 times (a turn of about 50 degrees). 3. Look at the far half of the centre line, the faint line behind the ball.', expected: 'The far side is faint (about 40% alpha) and dashed, as the README says ("Lines on the far side of the head are faint and dashed").', actual: JSON.stringify(r) });
    await clean(t, page, 'gap: far side');
    await page.context().close();
  });

  // gap (medium): a resize or a turn of the phone keeps the head, the arrows and the pending ring on the picture
  await guard(t, 'resize and orientation', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const fitted = [];
    // (a landscape phone, 844 x 390, is the layout finding further down: its photo runs off the window)
    for (const vp of [{ width: 390, height: 844 }, { width: 1400, height: 900 }]) {
      await page.setViewportSize(vp);
      await settled(page);
      const lay = await layoutOf(page), i = await ink(page), hs = await handlesOf(page), box = await ovBox(page);
      fitted.push({ vp: `${vp.width}x${vp.height}`, overlay: [box.W, box.H], wrapInStage: inside(lay.wrap, lay.stage), cardOver: overlaps(lay.card, lay.wrap), red: i.red, arrowsInside: hs.every((h) => h.x >= 0 && h.y >= 0 && h.x <= box.W && h.y <= box.H) });
    }
    t.check(fitted.every((r) => r.wrapInStage && !r.cardOver && r.red > 50 && r.arrowsInside), 'after a resize or a turn the fitted head is redrawn at the new size, the photo stays in the stage, the card does not cover it, and the arrows are on the picture', fitted);
    // a pending ring: one mark locked, a second pending, then the resizes
    await click(page, '#lh-reset');
    await mark(page, 0.3, 0.3);
    await tap(page, 0.6, 0.5);
    const pending = [];
    for (const vp of [{ width: 390, height: 844 }, { width: 1400, height: 900 }]) {
      await page.setViewportSize(vp);
      await settled(page);
      const lay = await layoutOf(page), i = await ink(page);
      await press(page, 0.95, 0.25); const lp = await loupe(page); await page.mouse.up();
      pending.push({ vp: `${vp.width}x${vp.height}`, pendingKept: !!(await lstate(page)).pending, yellow: i.yellow, loupeInStage: lp.shown && lp.inStage, wrapInStage: inside(lay.wrap, lay.stage) });
    }
    t.check(pending.every((r) => r.pendingKept && r.yellow > 0 && r.loupeInStage && r.wrapInStage), 'after a resize with a mark pending, the ring is redrawn on the picture and the loupe stays on the stage', pending);
    if (!fitted.every((r) => r.wrapInStage && !r.cardOver && r.red > 50 && r.arrowsInside) || !pending.every((r) => r.pendingKept && r.yellow > 0 && r.loupeInStage && r.wrapInStage)) t.finding({ title: 'After a resize or a turn the head, the arrows or the pending ring is not kept on the picture', severity: 'medium', steps: '1. On the Loomis head, lock in the marks. 2. Resize the window to 844 × 390, then 390 × 844 (a phone turned), then back. 3. Look at the head and the arrows. 4. Repeat with one mark pending.', expected: 'The overlay is redrawn at the new size, the arrows stay on the picture, the loupe stays inside the stage, and a pending ring survives.', actual: JSON.stringify({ fitted, pending }).slice(0, 500) });
    await clean(t, page, 'gap: resize');
    await page.context().close();
  });

  // gap (medium, a note): Draw it in the Studio pressed again after turning the head: what the underdrawing holds (the decision is the maintainer's)
  await guard(t, 'Draw it in the Studio pressed again', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    armToast(page); await click(page, '#lh-studio');
    const first = { toast: await toastMatch(page, /underdrawing/, 4000), ink: await sketchInk(page) };
    await tab(page, 'loomis');
    for (let k = 0; k < 10; k++) await tapHandle(page, 'right');
    armToast(page); await click(page, '#lh-studio');
    const second = { toast: await toastMatch(page, /underdrawing/, 4000), ink: await sketchInk(page) };
    t.note(`Draw it in the Studio pressed again after turning the head (ten right-arrow taps): the underdrawing holds ${second.ink} inked samples against ${first.ink} after the first press (${(second.ink / Math.max(1, first.ink)).toFixed(2)} times), and the toasts read "${first.toast}" then "${second.toast}". The copy adds to the underdrawing and clears nothing (js/painting.js lines 386-400), so the second head is drawn over the first; the README does not say whether it should replace it.`);
    t.check(second.ink > first.ink && !!second.toast, 'pressing Draw it in the Studio again adds the turned head to the underdrawing with its copy message', { first, second });
    await clean(t, page, 'gap: studio again');
    await page.context().close();
  });

  // gap (medium, a note): Save PNG and Draw it in the Studio mid-sequence, after the chin, with the forehead still pending
  await guard(t, 'Save PNG mid-sequence', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    const marks = await marksFor(page);
    await mark(page, ...marks.leftEye); await mark(page, ...marks.rightEye);
    await click(page, '#lh-skip'); await click(page, '#lh-skip');
    await mark(page, ...marks.nose); await mark(page, ...marks.mouth); await mark(page, ...marks.chin);
    const enabled = { save: !(await card(page)).save, studio: !(await card(page)).studio };
    const a = await decodePng(page, await download(page, '#lh-save'));
    const yellowA = a ? (await headStats(page, 'window.__png', null)).yellow : null;
    await tap(page, ...marks.forehead);
    const dlB = await download(page, '#lh-save');
    const b = await decodePng(page, dlB);
    const yellowB = b ? (await headStats(page, 'window.__png', null)).yellow : null;
    t.note(`mid-sequence (the chin locked, the forehead pending): Save PNG and Draw it in the Studio are ${enabled.save && enabled.studio ? 'enabled' : 'not both enabled'}; the saved PNG has ${yellowB} yellow pixels with the pending forehead ring against ${yellowA} before it (the ring is #ffd21f, the lines' colour too). The head copied at this point is the earlier head: a copy is made when it is pressed, and nothing later updates it.`);
    await clean(t, page, 'gap: mid-sequence save');
    await page.context().close();
  });

  // gap (medium): Save PNG with the head hidden saves what the screen shows: the photo and the marks, no head
  await guard(t, 'Save PNG with the head hidden', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    await click(page, '#lh-show');
    const dl = await download(page, '#lh-save');
    const dims = await decodePng(page, dl);
    const st = dims ? await headStats(page, 'window.__png', null) : null;
    const photo = await headStats(page, "document.getElementById('lh-photo')", null);
    const prep = await page.evaluate(() => { const p = Studio.prep(); return [p.w, p.h]; });
    const ok = !!dl && dl.suggestedFilename() === 'loomis-head.png' && !!st && st.red <= photo.red + 5 && st.cyan <= photo.cyan + 5 && st.white > 0 && dims.w === prep[0] && dims.h === prep[1];
    t.check(ok, 'Save PNG with the head hidden saves the photo at its size with the marks and no head, as the screen shows', { name: dl && dl.suggestedFilename(), png: st, photoColours: { red: photo.red, cyan: photo.cyan }, dims, prep });
    t.note('Save PNG stays enabled while the head is hidden (it is off only without a fit), so a hidden head is saved without the head; the README does not say which the visitor should get');
    await click(page, '#lh-show');
    await clean(t, page, 'gap: hidden save');
    await page.context().close();
  });

  // gap (medium): the extremes of the drags: the ball at its least size, the head pushed into a corner, a line past its limit
  await guard(t, 'the extremes of the drags', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const reachable = async (hs) => { const out = []; for (const h of hs) out.push((await hitAt(page, h.x, h.y)) === 'handle:' + h.glyph); return out.every(Boolean); };
    const OWN = { left: 'yaw', right: 'yaw', up: 'pitch', down: 'pitch', ccw: 'roll', cw: 'roll' };
    const tapsOwn = async () => { const out = []; for (const glyph of Object.keys(OWN)) { const b0 = (await lstate(page)).fit; await tapHandle(page, glyph); const b1 = (await lstate(page)).fit; out.push(changed(b0, b1).join() === OWN[glyph]); } return out; };
    const apartOf = (hs, W) => hs.every((h, a) => hs.every((o, b) => a === b || Math.hypot(h.x - o.x, h.y - o.y) >= (30 * W) / 400));
    // (a) the ball dragged in to its least size
    const sp = await spots(page), W = sp.W, f0 = (await lstate(page)).fit, bx = await ovBox(page), kk = bx.w / bx.W;
    if (sp.pick.ball) { const p = sp.pick.ball; await page.mouse.move(bx.x + p[0] * kk, bx.y + p[1] * kk); await page.mouse.down(); await page.mouse.move(bx.x + f0.tx * W * kk, bx.y + f0.ty * W * kk, { steps: 12 }); await page.mouse.up(); }
    const smin = (await lstate(page)).fit;
    const hsA = await handlesOf(page), reachA = await reachable(hsA), tapA = await tapsOwn(), apartA = apartOf(hsA, W);
    const partA = { s: smin && +smin.s.toFixed(4), apartA, reachA, tapA };
    t.check(!!smin && near(smin.s, 0.03, 1e-6) && apartA && reachA && tapA.every(Boolean), 'the ball at its least size (0.03): the six arrows stay apart, each is reachable, and each turns its own value', partA);
    await click(page, '#lh-refit');
    // (b) the head pushed into the top-left corner
    const sp2 = await spots(page), q = sp2.pick.move;
    if (q) await dragPiece(page, 'move', -q[0] + 4, -q[1] + 4);
    const fB = (await lstate(page)).fit, box = await ovBox(page);
    const hsB = await handlesOf(page), inB = hsB.every((h) => h.x >= 0 && h.y >= 0 && h.x <= box.W && h.y <= box.H), reachB = await reachable(hsB), tapB = await tapsOwn(), apartB = apartOf(hsB, box.W);
    const partB = { centre: fB && [+fB.tx.toFixed(3), +fB.ty.toFixed(3)], inB, apartB, reachB, tapB };
    t.check(!!q && inB && apartB && reachB && tapB.every(Boolean), 'the head pushed into the top-left corner: the arrows stay on the picture, apart, reachable, and each turns its own value', partB);
    await click(page, '#lh-refit');
    // (c) a centre line dragged past the edge of the picture
    const rC = await dragPiece(page, 'centre', 400, 0);
    const yawC = (await lstate(page)).fit.yaw, redC = (await ink(page)).red;
    t.check(!!rC && Math.abs(yawC) <= 1.5 + 1e-9 && redC > 50, 'a centre line dragged past the edge stops at the yaw limit (1.5 rad) and the head is still drawn', { yaw: yawC, red: redC, changed: rC && rC.changed });
    if (!(!!smin && near(smin.s, 0.03, 1e-6) && apartA && reachA && tapA.every(Boolean)) || !(!!q && inB && apartB && reachB && tapB.every(Boolean))) t.finding({ title: 'At the extremes of a drag the arrows overlap, or cannot each turn their own value', severity: 'medium', steps: '1. On the Loomis head, drag the ball edge toward the centre (the least size). 2. Look at the six arrows, and tap each. 3. Then drag the head to the top-left corner and do the same.', expected: 'The six arrows are kept on the picture, apart, and each one turns its own value.', actual: JSON.stringify({ partA, partB }).slice(0, 500) });
    await clean(t, page, 'gap: extremes');
    await page.context().close();
  });

  // gap (medium): the desktop stage at its narrowest (760 px, the card beside the photo) and a landscape phone (844 x 390)
  await guard(t, 'the narrow desktop and a landscape phone', async () => {
    for (const vp of [{ width: 760, height: 700 }]) {
      const page = await openPage(site, { viewport: vp });
      await tab(page, 'loomis');
      const corners = [];
      for (const [fx, fy] of [[0.03, 0.03], [0.97, 0.97]]) { await press(page, fx, fy); const lp = await loupe(page); await page.mouse.up(); corners.push(lp.shown && lp.inStage); }
      await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
      const lay = await layoutOf(page), hs = await handlesOf(page), hscr = await hscroll(page);
      const hits = [];
      for (const h of hs) hits.push((await hitAt(page, h.x, h.y)) === 'handle:' + h.glyph);
      const ok = lay.wrap.h > 120 && inside(lay.wrap, lay.stage) && !overlaps(lay.card, lay.wrap) && hscr <= 0 && corners.every(Boolean) && hits.every(Boolean);
      t.check(ok, `${vp.width} × ${vp.height}: the photo is over 120 px high inside the stage, the card does not cover it, no horizontal scroll, the loupe is on the stage at the corners, and all six arrows can be tapped`, { wrap: [lay.wrap.w, lay.wrap.h], card: [lay.card.x, lay.card.y, lay.card.w, lay.card.h], hscroll: hscr, corners, hits });
      await clean(t, page, `gap: ${vp.width} wide`);
      await page.context().close();
    }
  });

  // gap (medium): a landscape phone (844 x 390): the photo, and every mark on it, must be in the window
  await guard(t, 'a landscape phone, 844 x 390', async () => {
    const page = await openPage(site, { viewport: { width: 844, height: 390 } });
    await tab(page, 'loomis');
    const lay = await layoutOf(page);
    const visible = await inWindow(page, '#lh-wrap');
    const scroll = await page.evaluate(() => ({ scrollH: document.documentElement.scrollHeight, innerH: innerHeight, scrollY }));
    const marks = await marksFor(page);
    const offWindow = await page.evaluate((marks) => { const r = document.getElementById('lh-wrap').getBoundingClientRect(); return Object.entries(marks).filter(([, m]) => r.top + m[1] * r.height > innerHeight).map(([k]) => k); }, marks);
    const inWin = visible >= 0.9 && offWindow.length === 0;
    t.check(inWin, 'a landscape phone (844 × 390): the whole photo is in the window, so every mark can be placed', { visible, photoTopBottom: [Math.round(lay.wrap.y), Math.round(lay.wrap.b)], scroll, offWindow });
    if (!inWin) t.finding({ title: 'On a landscape phone (844 × 390) the Loomis photo runs off the bottom of the window, and the page cannot scroll to the lower marks', severity: 'medium', steps: '1. Open the Loomis head on a phone turned to landscape (844 × 390 CSS px). 2. Look at the photo: the header and the tabs sit above it. 3. Try to tap the nose, mouth or chin on the picture, or scroll down.', expected: 'The photo fills the window (the README: "the photo fills the screen"), or the page scrolls so that every mark can be reached.', actual: `The photo sits at y ${Math.round(lay.wrap.y)} to ${Math.round(lay.wrap.b)} in a ${scroll.innerH} px window: ${Math.round((1 - visible) * 100)}% of it is below the window. The page does not scroll (scroll height ${scroll.scrollH}), and the layer holding the tab clips at the window (styles.css line 1391: .ps has overflow: hidden), so the marks ${JSON.stringify(offWindow)} cannot be placed in this orientation. The header and the tabs take about ${Math.round(lay.wrap.y)} px above the photo.` });
    await clean(t, page, 'gap: landscape phone');
    await page.context().close();
  });

  // ================= the low gaps the time allowed =================
  // gap (low): a device pixel ratio of 2 (every phone): the overlay is twice the CSS size, the head is drawn, a drag still turns it
  await guard(t, 'device pixel ratio 2', async () => {
    const page = await openPage(site, { viewport: PHONE });
    await page.evaluate(() => Object.defineProperty(window, 'devicePixelRatio', { get: () => 2, configurable: true }));
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const box = await ovBox(page), cssW = await page.evaluate(() => document.getElementById('lh-wrap').clientWidth), i = await ink(page);
    const r = await dragPiece(page, 'centre', 14, 0);
    t.check(box.W === Math.round(cssW * 2) && i.red > 50 && !!r && r.changed.join() === 'yaw', 'with a device pixel ratio of 2 the overlay is twice the CSS size, the head is drawn, and a line drag still turns it', { overlay: box.W, css: cssW, red: i.red, changed: r && r.changed });
    await clean(t, page, 'gap: pixel ratio 2');
    await page.context().close();
  });

  // gap (low): Save PNG for the head inside another site's sandboxed frame: the save dialog opens with loomis-head.png
  await guard(t, 'the sandboxed Save PNG', async () => {
    const page = await openPage(site, { sandbox: {} });
    await tab(page, 'loomis');
    // the marks of a level head, computed in the frame (the app's own module lives there)
    const m = await app(page).evaluate(() => { const p = Studio.prep(); const a = p.h / p.w; const out = {}; Loomis.STEPS.forEach((st) => { out[st.key] = [0.5 + 0.2 * st.model[0], (0.45 + 0.2 * st.model[1]) / a]; }); return out; });
    await frameSeq(page, m, ['leftBrow', 'rightBrow', 'forehead']);
    await click(page, '#lh-save');
    const shown = await app(page).waitForFunction(() => { const d = document.getElementById('saveDialog'), i = document.getElementById('saveImg'); return d.open && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).then(() => true).catch(() => false);
    const got = await app(page).evaluate(() => ({ open: document.getElementById('saveDialog').open, name: document.getElementById('saveName').textContent, src: (document.getElementById('saveImg').getAttribute('src') || '').slice(0, 5) }));
    t.check(shown && got.open && got.name === 'loomis-head.png' && got.src === 'blob:', 'inside another site\'s sandboxed frame, Save PNG on the Loomis head opens the save dialog with loomis-head.png', got);
    await app(page).evaluate(() => { const d = document.getElementById('saveDialog'); if (d.open) d.close(); }).catch(() => null);
    await clean(t, page, 'gap: sandboxed save');
    await page.context().close();
  });

  // gap (low): the words a visitor reads (the arrows' sentence, the strip's names, the Load photo label, the photo's accept)
  await guard(t, 'the card words and the strip labels', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const got = await app(page).evaluate(() => {
      const names = ['lh-undo', 'lh-reset', 'lh-show', 'lh-studio', 'lh-save', 'lh-exit'];
      const btn = Object.fromEntries(names.map((id) => { const e = document.getElementById(id); return [id, { title: e.title, aria: e.getAttribute('aria-label') }]; }));
      return { btn, sub: document.getElementById('lh-sub').textContent, loadLabel: (document.querySelector('label[for="file"]') || {}).textContent || null, accept: document.getElementById('file').accept };
    });
    const ok = Object.values(got.btn).every((b) => b.title && b.aria) && got.sub.startsWith('The arrows turn, nod and tilt the head.') && got.loadLabel === 'Load photo' && /image/.test(got.accept);
    t.check(ok, 'the arrows\' sentence is on the card once fitted, every strip button has its name (title and aria-label), and the photo control reads Load photo', got);
    await clean(t, page, 'gap: words');
    await page.context().close();
  });

  // gap (low): keyboard focus after Lock in stays on a live control of the card, so the next Enter does something
  await guard(t, 'keyboard focus after Lock in', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await tap(page, 0.3, 0.3);
    await page.focus('#lh-lock'); await page.keyboard.press('Enter');
    const focus = await app(page).evaluate(() => { const a = document.activeElement; return { id: a ? a.id : null, tag: a ? a.tagName : null, disabled: a ? !!a.disabled : null }; });
    const live = focus.tag === 'BUTTON' && !focus.disabled && /^lh-/.test(focus.id || '');
    t.check(live, 'after Lock in the keyboard focus is on a live control of the card (not lost to the page)', focus);
    if (!live) t.finding({ title: 'Keyboard focus is lost to the page when Lock in is pressed from the keyboard', severity: 'low', steps: '1. On the Loomis head, Tab to a mark, tap it so Lock in is enabled. 2. Focus Lock in with Tab and press Enter. 3. Press Enter or Tab again.', expected: 'Focus stays on a control of the card (Back, Start over or the next step), so the keyboard user carries on.', actual: `After Lock in the focus is on ${JSON.stringify(focus)}: the button became disabled, so the focus fell to the page.` });
    await clean(t, page, 'gap: keyboard focus');
    await page.context().close();
  });

  // gap (low): the Loomis tab in dark theme, fitted: axe finds no serious or critical violation
  await guard(t, 'the dark theme', async () => {
    const page = await openPage(site, { viewport: DESKTOP, dark: true, bypassCSP: true });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const v = await axe(page);
    const serious = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
    t.check(serious.length === 0, 'the Loomis tab in dark theme, fitted: no serious or critical axe violation', serious.length ? serious : v.map((x) => x.id));
    await clean(t, page, 'gap: dark');
    await page.context().close();
  });

  // gap (low): the model's numbers against the README's, and the ball still a circle when turned, nodded and tilted
  await guard(t, 'the model numbers and the circle', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    const M = await page.evaluate(() => Object.fromEntries(Loomis.STEPS.map((st) => [st.key, st.model])));
    const numbers = near(M.leftEye[1], 1 / 3, 0.02) && near(M.rightEye[1], 1 / 3, 0.02) && near(M.leftEye[0], -0.4, 1e-9) && near(M.rightEye[0], 0.4, 1e-9) && near(M.nose[1], 1, 1e-9) && near(M.mouth[1], 4 / 3, 0.01) && near(M.chin[1], 2, 1e-9) && near(M.forehead[1], -0.72, 0.005) && near(M.forehead[2], Math.sqrt(1 - 0.72 * 0.72), 0.005);
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    for (let k = 0; k < 8; k++) await tapHandle(page, 'right');
    await tapHandle(page, 'up'); await tapHandle(page, 'cw');
    const st = await headStats(page, "document.getElementById('lh-overlay')", (await lstate(page)).fit);
    t.check(numbers && st.rim >= 0.7,'the model numbers are the README\'s (eyes a third of a radius below the brow line, nose 1, mouth a third of the way to the chin, chin 2, forehead at 0.72), and the ball stays a circle when turned, nodded and tilted', { eyes: M.leftEye, nose: M.nose, mouth: M.mouth, chin: M.chin, forehead: M.forehead, rim: st.rim });
    await clean(t, page, 'gap: numbers');
    await page.context().close();
  });

  // gap (low): a dot drag cut short by a new photo; a line drag cut short by a tab switch, with no button down after
  await guard(t, 'drags cut short', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const b = await ovBox(page), pl = (await lstate(page)).points.leftEye;
    await page.mouse.move(b.x + pl.x * b.w, b.y + pl.y * b.h); await page.mouse.down();
    await page.mouse.move(b.x + (pl.x + 0.02) * b.w, b.y + (pl.y + 0.01) * b.h, { steps: 3 });
    await page.setInputFiles('#file', await makeImage(page, { width: 800, height: 600, name: 'wide.png' }));
    await page.waitForFunction(() => Math.abs(Loomis.state.aspect - 0.75) < 0.01, null, { timeout: 15000 }).catch(() => null);
    await page.mouse.move(b.x + (pl.x + 0.03) * b.w, b.y + (pl.y + 0.02) * b.h, { steps: 3 });
    await page.mouse.up();
    await sleep(300);
    const s1 = await lstate(page), lp1 = await loupe(page);
    t.check(s1.step === 0 && s1.moving === null && !lp1.shown, 'a dot dragged when a new photo loads: the marks start again, no drag is left going, and the loupe is gone', { step: s1.step, moving: s1.moving, loupe: lp1.shown, aspect: s1.aspect });
    await sequence(page, await marksFor(page), ['leftBrow', 'rightBrow', 'forehead']);
    const sp = await spots(page), pc = sp.pick.centre, bb = await ovBox(page), kk = bb.w / bb.W;
    await page.mouse.move(bb.x + pc[0] * kk, bb.y + pc[1] * kk); await page.mouse.down();
    await page.mouse.move(bb.x + (pc[0] + 10) * kk, bb.y + pc[1] * kk, { steps: 3 });
    await page.evaluate(() => Studio.go('study')); await sleep(150);
    await page.mouse.move(bb.x + (pc[0] + 30) * kk, bb.y + pc[1] * kk, { steps: 3 });
    await page.mouse.up();
    await tab(page, 'loomis');
    const f1 = (await lstate(page)).fit;
    await page.mouse.move(bb.x + (pc[0] + 60) * kk, bb.y + pc[1] * kk, { steps: 4 });
    const f2 = (await lstate(page)).fit;
    t.check(!!f1 && Number.isFinite(f1.yaw) && changed(f1, f2).length === 0, 'a line drag cut short by a tab switch ends there: a move with no button down does not turn the head', { changed: changed(f1, f2), yaw: f1 && f1.yaw });
    await clean(t, page, 'gap: drags cut short');
    await page.context().close();
  });

  // gap (low): a photo dropped on the Loomis picture, and one pasted, are loaded like Load photo
  await guard(t, 'a dropped and a pasted photo', async () => {
    const page = await openPage(site, { viewport: DESKTOP });
    await tab(page, 'loomis');
    await mark(page, 0.3, 0.3);
    const url = page.url();
    await dropFiles(page, '#lh-overlay', [await makeImage(page, { width: 800, height: 500, name: 'dropped.png' })]);
    await page.waitForFunction(() => Math.abs(Loomis.state.aspect - 0.625) < 0.01, null, { timeout: 15000 }).catch(() => null);
    const d = await lstate(page);
    await mark(page, 0.3, 0.3);
    await pasteFile(page, await makeImage(page, { width: 600, height: 800, name: 'pasted.png' }));
    await page.waitForFunction(() => Math.abs(Loomis.state.aspect - 1.333) < 0.01, null, { timeout: 15000 }).catch(() => null);
    const p = await lstate(page);
    t.check(d.step === 0 && Math.abs(d.aspect - 0.625) < 0.01 && p.step === 0 && Math.abs(p.aspect - 1.333) < 0.01 && page.url() === url, 'a photo dropped on the picture and one pasted each start the marks again on their own shape, with no navigation', { dropped: [d.step, d.aspect], pasted: [p.step, p.aspect], url: page.url() === url });
    await clean(t, page, 'gap: drop and paste');
    await page.context().close();
  });

  // gap (low): a very small photo (40 x 60) and a very wide one (4000 x 500): a head is drawn, the arrows stay on the picture, the loupe stays on the stage, Save PNG gives the photo's size
  await guard(t, 'a very small and a very wide photo', async () => {
    const rows = [];
    for (const [w, h, s, cy, label] of [[40, 60, 0.2, 0.45, 'small'], [4000, 500, 0.02, 0.0625, 'wide']]) {
      const page = await openPage(site, { viewport: DESKTOP });
      await tab(page, 'loomis');
      await loadPhoto(page, await makeImage(page, { width: w, height: h, name: `${label}.png` }), { settle: 800 });
      await press(page, 0.5, 0.5); const lp = await loupe(page); await page.mouse.up();
      await sequence(page, await marksFor(page, { s, cy }), ['leftBrow', 'rightBrow', 'forehead']);
      const fit = (await lstate(page)).fit, red = (await ink(page)).red, hs = await handlesOf(page), box = await ovBox(page);
      const arrows = hs.every((hh) => hh.x >= 0 && hh.y >= 0 && hh.x <= box.W && hh.y <= box.H);
      const dl = await download(page, '#lh-save'), dims = await decodePng(page, dl);
      const prep = await page.evaluate(() => { const p = Studio.prep(); return [p.w, p.h]; });
      rows.push({ label, photo: [w, h], fit: !!fit, red, arrows, loupe: lp.shown && lp.inStage, png: !!dims && dims.w === prep[0] && dims.h === prep[1] });
      await clean(t, page, `gap: ${label} photo`);
      await page.context().close();
    }
    t.check(rows.every((r) => r.fit && r.red > 20 && r.arrows && r.loupe && r.png), 'a 40 × 60 and a 4000 × 500 photo: the head is fitted and drawn, the arrows are on the picture, the loupe is on the stage, and Save PNG gives the photo\'s size', rows);
  });

  // what was left out, and what the case does not measure
  t.note('gaps left out for the time budget (low): the Studio restored while the head is copied (a race that needs a large saved painting to show); Forget my work on this device from another tab (the Loomis head keeps nothing, so only the reload is at issue); the Study\'s working size and Advanced mode with a head fitted; Copy the Study lines with a head and Study marks together; a held arrow when the window loses focus (the pointer is still down, so turning on is the hold working, not a stuck repeat).');
  t.note('the manual adjustments (an arrow turn, a line drag) are discarded by a dot drag or Back one mark + Lock in: that refits the head by design (the README: "Dragging a dot moves that mark and refits the head"), so it is not checked as a finding.');
  t.note('no check of the existing sample case was changed; every existing check passes on the current tree, and none is plainly the author\'s mistake.');
  t.note('keyboard: the card\'s Lock in, Skip, Back, Draw it in the Studio and Back to the fit are buttons and work from the keyboard; placing a mark, dragging a dot or a line and the arrow buttons are pointer-only (the overlay canvas is not focusable and has no key handler); the README promises no keys here');
  t.note('the overlay canvas keeps the label "The photo: tap the feature asked for" once the head is fitted, when a tap no longer places anything');
}
