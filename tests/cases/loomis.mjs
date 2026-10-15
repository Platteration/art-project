// The Loomis head, playtested as a sceptical tester: the mark sequence on the sample and on loaded
// photos (checked against marks the model itself would make, so the fit must come back level), Back
// after each mark, skipping the brows and the forehead, Start over, every mark on one point, marks at
// the corners and dragged outside, the loupe, the fitted head's lines, dragging each dot and each
// line, the arrow buttons tapped, held, spammed and held across a tab switch, Back to the fit, hide
// the head, Save PNG, Draw it in the Studio (and the Studio's underdrawing), the head over the Study
// tab's pictures and in their saved PNGs, a new photo (and a rejected file, and a 24-megapixel one)
// while marking, a press that outlives the photo, hostile saved state, keyboard, and both widths.
import fs from 'node:fs';
import { openPage, clean, tab, DESKTOP, PHONE, makeImage, loadPhoto, textFile, brokenImage, svgImage, click, text, visible, hscroll, screenshot, sleep, storageGet, PROTO_NAMES } from '../lib.mjs';

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
    await tab(page, 'loomis'); await click(page, '#lh-show');
    c = await card(page); i = await ink(page);
    t.check(c.pressed === 'true' && i.red > 100, 'show the head again: the lines are back', { pressed: c.pressed, red: i.red });
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

  t.note('keyboard: the card\'s Lock in, Skip, Back, Draw it in the Studio and Back to the fit are buttons and work from the keyboard; placing a mark, dragging a dot or a line and the arrow buttons are pointer-only (the overlay canvas is not focusable and has no key handler); the README promises no keys here');
  t.note('the overlay canvas keeps the label "The photo: tap the feature asked for" once the head is fitted, when a tap no longer places anything');
}
