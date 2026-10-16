// Figure study, played like a sceptical tester (README "Figure study"): the setup at its extremes (every
// pose out, a group out, one pose, the remembered class), a relaxed class on a small pool (a blank Done, a
// drawing traced from the pose's own joints, Clear then Undo, Ctrl+Z, the two tap guards measured inside
// the page, ten poses never the same twice running, ✕ twice and ✕ re-arming), the review (stars, the
// average, Save as PNG for each, the gesture hidden, Draw again, New class, Back to your drawings), a timed
// class (10 s to the chime and the red stretch, Pause/Resume, leaving the tab, the hidden page, 30 s with
// Done early), a pose saved in Pose and light (in the class, then deleted: Draw again), a reload during a
// class, hostile saved state for figureStudy and figureMixes, and the phone layout.
// Added after a coverage read of the README against this case: the analyzer driven directly and the 30 poses' shots, the Studio's paper kept
// apart from the class's, the tools of the Studio inside a class (reference, eraser, underdrawing, zoom, turn, paints), Save as PNG's size and
// content, the 1, 5 and 10 minute clocks (the page's clock moved on), orderings of Pause/leaving the tab/Done/Next pose/✕, a render that fails,
// a frame that never answers, Forget my work, the keyboard, axe, the dark theme, reduced motion, the phone on its side, game.js missing, a sandbox.
import fs from 'node:fs';
import { openPage, clean, tab, PHONE, stroke, inked, click, text, visible, hscroll, screenshot, sleep, storageGet, storageKeys, poseFrame, renderFrame, makeImage, pasteFile, dropFiles, newTab, axe, violations } from '../lib.mjs';

const KEY = 'portrait-value-studio.figureStudy';
const MIXES = 'portrait-value-studio.figureMixes';
const GRADES = ['Keep drawing', 'Keep drawing', 'Getting there', 'Good gesture', 'Strong gesture!', 'Gesture master!'];
const starsFor = (pct) => [88, 78, 65, 50, 30].filter((min) => pct >= min).length;
const half = (v) => { const r = Math.round(v * 2) / 2, w = Math.floor(r); return r - w ? `${w || ''}½` : String(w); };

// ---- waits on the class's own state (never a bare sleep where a condition exists) ----
const poseShown = (page, n) => page.waitForFunction((n) => new RegExp('^Pose ' + n + ': ').test(document.getElementById('fig-say').textContent), n, { timeout: 30000 }).then(() => true).catch(() => false);
const cardUp = (page, timeout = 15000) => page.waitForFunction(() => !document.getElementById('fig-result').hidden, null, { timeout }).then(() => true).catch(() => false);
// the count-up has reached the number the stars' label names
const cardSettled = (page) => page.waitForFunction(() => { const m = /, (\d+)%/.exec(document.getElementById('fig-stars').getAttribute('aria-label') || ''); return !!m && document.getElementById('fig-pct').textContent === m[1]; }, null, { timeout: 5000 }).catch(() => null);
// a watch inside the page: when the card came up (for its 0.6 s guard), and the pose just shown
const watch = (page) => page.evaluate(() => {
  if (window.__figWatch) return;
  window.__figWatch = true; window.__cardAt = 0;
  const res = document.getElementById('fig-result');
  new MutationObserver(() => { if (!res.hidden) window.__cardAt = performance.now(); }).observe(res, { attributes: true, attributeFilter: ['hidden'] });
});
const guardOver = (page) => page.waitForFunction(() => window.__cardAt && performance.now() - window.__cardAt >= 650, null, { timeout: 5000 }).catch(() => null);
const doneGuardOver = (page) => page.waitForFunction(() => { const c = window.FigureStudy.state(); return c && c.shot && performance.now() - c.since >= 550; }, null, { timeout: 5000 }).catch(() => null);
const cardState = (page) => page.evaluate(() => ({
  shown: !document.getElementById('fig-result').hidden, kicker: document.getElementById('fig-kicker').textContent, pct: document.getElementById('fig-pct').textContent,
  grade: document.getElementById('fig-grade').textContent, label: document.getElementById('fig-stars').getAttribute('aria-label'), on: document.querySelectorAll('#fig-stars .game-star.is-on').length,
  tips: [...document.querySelectorAll('#fig-tips li')].map((l) => l.textContent), say: document.getElementById('fig-say').textContent, focus: document.activeElement && document.activeElement.id,
  pose: (document.getElementById('fig-pose').getAttribute('src') || '').slice(0, 5), poseAlt: document.getElementById('fig-pose').alt, inert: [...document.querySelector('.fig-studio').children].filter((e) => e.id !== 'fig-result').every((e) => e.inert),
}));
const setupState = (page) => page.evaluate(() => ({
  mix: document.getElementById('fig-mix').textContent, plan: document.getElementById('fig-plan').textContent, note: document.getElementById('fig-libNote').textContent,
  all: document.getElementById('fig-all').textContent, allHidden: document.getElementById('fig-all').hidden, start: document.getElementById('fig-start').disabled,
  timed: document.getElementById('fig-timed').checked, timesHidden: document.getElementById('fig-times').hidden, secs: (document.querySelector('input[name="figTime"]:checked') || {}).value,
  poses: document.querySelectorAll('#fig-poses [data-pose-id]').length, pictures: [...document.querySelectorAll('#fig-poses [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length,
  inClass: [...document.querySelectorAll('#fig-poses [data-pose-id]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.poseId),
  groups: [...document.querySelectorAll('.fig-group-btn')].map((b) => [b.dataset.group, b.textContent, b.getAttribute('aria-label')]), heads: [...document.querySelectorAll('.fig-group h4')].map((h) => h.textContent),
  setup: !document.getElementById('fig-setup').hidden, review: !document.getElementById('fig-review').hidden, draw: !document.querySelector('.fig-studio').hidden, back: !document.getElementById('fig-back').hidden,
  stored: localStorage.getItem('portrait-value-studio.figureStudy'),
}));
const stateOf = (page) => page.evaluate(() => { const c = window.FigureStudy.state(); return c && { n: c.n, id: c.id, mode: c.mode, secs: c.secs, pool: c.pool, running: c.running, held: c.held, over: c.over, results: c.results.length }; });
const clockState = (page) => page.evaluate(() => { const c = document.getElementById('fig-clock'), p = document.getElementById('fig-pause'); return { clock: c.textContent, label: c.getAttribute('aria-label'), low: c.classList.contains('is-low'), paused: c.classList.contains('is-paused'), color: getComputedStyle(c).color, pauseHidden: p.hidden, pauseText: p.querySelector('.fig-btn-text').textContent, pauseLabel: p.getAttribute('aria-label'), held: p.classList.contains('is-held') }; });
// the pose library, restricted to some ids (every other pose taken out)
async function onlyPoses(page, ids) {
  await page.evaluate((ids) => {
    document.querySelectorAll('#fig-poses [data-pose-id]').forEach((b) => { const want = ids.includes(b.dataset.poseId); if ((b.getAttribute('aria-pressed') === 'true') !== want) b.click(); });
  }, ids);
}
// a drawing traced from the pose's own joints, where the reference would sit on the paper: a stick figure
// with the head as an oval, the shoulder and hip lines (what the gesture is made of)
async function trace(page) {
  const paths = await page.evaluate(() => {
    const s = window.FigureStudy.state().shot, W = 900, H = 1200, k = Math.min(W / s.w, H / s.h), ox = (W - s.w * k) / 2, oy = (H - s.h * k) / 2;
    const P = (n) => { const v = s.joints[n]; return [(ox + v[0] * s.w * k) / W, (oy + v[1] * s.h * k) / H]; };
    const chain = (...ns) => ns.map(P);
    const cr = P('crown'), ch = P('chin'), cx = (cr[0] + ch[0]) / 2, cy = (cr[1] + ch[1]) / 2, r = Math.hypot(cr[0] - ch[0], (cr[1] - ch[1]) * H / W) / 2, head = [];
    for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; head.push([cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * (W / H)]); }
    return [chain('crown', 'neck', 'chest', 'waist', 'pelvis'), chain('shoulderR', 'elbowR', 'wristR', 'handR'), chain('shoulderL', 'elbowL', 'wristL', 'handL'), chain('hipR', 'kneeR', 'ankleR', 'toeR'), chain('hipL', 'kneeL', 'ankleL', 'toeL'), chain('shoulderR', 'shoulderL'), chain('hipR', 'hipL'), head];
  });
  for (const p of paths) await stroke(page, '#fs-paper', p, { steps: 4 });
}
// a scribble over the whole sheet: the README says it is taken down to nothing
async function scribble(page) {
  const pts = [];
  for (let i = 0; i <= 36; i++) pts.push([i % 2 ? 0.88 : 0.12, 0.06 + i * 0.024]);
  await stroke(page, '#fs-paper', pts, { steps: 3 });
}
// Done, then the next card, with every guard waited out
async function endPose(page) { await doneGuardOver(page); await click(page, '#fig-done'); return cardUp(page); }
async function nextPose(page, n) { await guardOver(page); await click(page, '#fig-nextPose'); return poseShown(page, n); }
async function stopTwice(page) { await click(page, '#fig-end'); await click(page, '#fig-end'); await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null); }
const chimeSpy = (page) => page.evaluate(() => { if (window.__chimes === undefined) { window.__chimes = 0; window.GameSound.chime = () => { window.__chimes++; }; } return window.GameSound.on(); });
const chimes = (page) => page.evaluate(() => window.__chimes);
const dataUrls = (page) => page.evaluate(() => [...document.querySelectorAll('#fig-cards canvas')].map((c) => c.toDataURL()));
const download = (page, selector) => Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), click(page, selector)]).then(([d]) => d && d.suggestedFilename());


// ---- helpers for the blocks after the first author's (each block quotes the README sentence it covers) ----
// the gesture's four colours (#e8590c, #1c6dd0, #2b8a3e, #c2255c) as they land on a light sheet: each line is laid at 0.75 or 0.95 opacity over a pale edge
const PIX = { action: [238, 130, 73], bones: [39, 116, 210], tilt: [54, 144, 71], miss: [197, 48, 99] };
const POOL_ALL = ['stand', 'relaxed', 'wave', 'reach', 'think', 'hips', 'point', 'walk', 'run', 'lunge', 'jump', 'throw', 'kick', 'box', 'crouch', 'kneel', 'sit', 'dance', 'attitude', 'seconde', 'passe', 'penche', 'cambre', 'jete', 'reverence', 'flamenco', 'jazz', 'contemporary', 'spiral', 'hiphop'];
// one block's failure is one failed check, not the end of the case; the time each took goes in the notes
async function segment(t, name, fn) {
  const t0 = Date.now();
  try { await fn(); } catch (e) { t.check(false, `${name}: ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  t.note(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
// every message the page puts in its toast, in order
const toastLog = (page) => page.evaluate(() => { if (window.__toasts) return; window.__toasts = []; const el = document.getElementById('toast'); new MutationObserver(() => { if (el.textContent) window.__toasts.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
const toasts = (page) => page.evaluate(() => window.__toasts || []);
// time the page's clock can be moved forward by (the class reads performance.now), so a long pose needs no long wait
const skewClock = (page) => page.evaluate(() => { if (window.__skew) return; const real = performance.now.bind(performance); let skew = 0; performance.now = () => real() + skew; window.__skew = (ms) => { skew += ms; }; window.__skewReset = () => { skew = 0; }; });
const skewBy = (page, ms) => page.evaluate((ms) => window.__skew(ms), ms);
// (only with no class and no card on screen: a card's guard and a pose's clock are stamped in the moved time)
const unskew = (page) => page.evaluate(() => window.__skewReset && window.__skewReset());
// the percentage a card's stars label names (the number in the page counts up to it)
const pctOf = (c) => +((/, (\d+)%/.exec((c && c.label) || '') || [])[1]);
// the tab open and its list of poses arrived (the pictures stream in after it, and are waited for only where a block needs them)
async function figureUp(page) {
  await tab(page, 'figure', { wait: false });
  await page.waitForFunction(() => !document.getElementById('fig-start').disabled, null, { timeout: 40000 }).catch(() => null);
  await watch(page);
}
// leave whatever is on the screen for the setup: a pose (✕ twice), the card (Stop class), the review (New class)
async function toSetup(page) {
  for (let i = 0; i < 5; i++) {
    const s = await page.evaluate(() => ({ cls: !!window.FigureStudy.state(), card: !document.getElementById('fig-result').hidden, review: !document.getElementById('fig-review').hidden, setup: !document.getElementById('fig-setup').hidden }));
    if (s.setup && !s.cls) return;
    if (s.cls && s.card) { await guardOver(page); await click(page, '#fig-stop'); } else if (s.cls) await stopTwice(page); else if (s.review) await click(page, '#fig-new');
  }
}
// a class with the given settings and pool, started from the setup (every other pose taken out)
async function startClass(page, { timed = null, ids = null } = {}) {
  await toSetup(page);
  if (timed) { await click(page, '#fig-timed'); await click(page, `#fig-t${timed}`); } else await click(page, '#fig-relaxed');
  if (ids) await onlyPoses(page, ids);
  await click(page, '#fig-start');
  return poseShown(page, 1);
}
// the pose's joints, drawn as lines on the sheet (the paper may have been turned, so its size is asked)
async function traceParts(page, parts = ['spine', 'armR', 'armL', 'legR', 'legL', 'sh', 'hp', 'head']) {
  const paths = await page.evaluate((parts) => {
    const F = window.FigureStudy, s = F.state().shot, { w: W, h: H } = F.studio.paperSize(), k = Math.min(W / s.w, H / s.h), ox = (W - s.w * k) / 2, oy = (H - s.h * k) / 2;
    const P = (n) => { const v = s.joints[n]; return [(ox + v[0] * s.w * k) / W, (oy + v[1] * s.h * k) / H]; };
    const chains = { spine: ['crown', 'neck', 'chest', 'waist', 'pelvis'], armR: ['shoulderR', 'elbowR', 'wristR', 'handR'], armL: ['shoulderL', 'elbowL', 'wristL', 'handL'], legR: ['hipR', 'kneeR', 'ankleR', 'toeR'], legL: ['hipL', 'kneeL', 'ankleL', 'toeL'], sh: ['shoulderR', 'shoulderL'], hp: ['hipR', 'hipL'] };
    return parts.map((p) => {
      if (p !== 'head') return chains[p].map(P);
      const cr = P('crown'), ch = P('chin'), cx = (cr[0] + ch[0]) / 2, cy = (cr[1] + ch[1]) / 2, r = Math.hypot((cr[0] - ch[0]) * W, (cr[1] - ch[1]) * H) / 2, pts = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; pts.push([cx + Math.cos(a) * r * 0.8 / W, cy + Math.sin(a) * r / H]); }
      return pts;
    });
  }, parts);
  for (const p of paths) await stroke(page, '#fs-paper', p, { steps: 4 });
}
// the card as it stands now, once its count-up is done
async function finishPose(page) { const up = await endPose(page); await cardSettled(page); return up ? cardState(page) : null; }
// decode a PNG (as base64) in the page and measure it: its size, how many pixels sit near each gesture colour, how many distinct tones it has
const pngFacts = (page, buf) => page.evaluate(async ([b64, hex]) => {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = url; });
  URL.revokeObjectURL(url);
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, near = { action: 0, bones: 0, tilt: 0, miss: 0 }, tones = new Set();
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gr = d[i + 1], b = d[i + 2];
    if (i % 16 === 0) tones.add((r >> 3) + ',' + (gr >> 3) + ',' + (b >> 3));
    if (r + gr + b < 240) dark++;
    for (const k in hex) { const h = hex[k]; if (Math.abs(r - h[0]) < 26 && Math.abs(gr - h[1]) < 26 && Math.abs(b - h[2]) < 26) near[k]++; }
  }
  const cd = g.getImageData(2, 2, 20, 20).data; let cr = 0, cg = 0, cb = 0;
  for (let i = 0; i < cd.length; i += 4) { cr += cd[i]; cg += cd[i + 1]; cb += cd[i + 2]; }
  const cn = cd.length / 4;
  return { w: c.width, h: c.height, near, tones: tones.size, dark, corner: [Math.round(cr / cn), Math.round(cg / cn), Math.round(cb / cn)] };
}, [buf.toString('base64'), PIX]);
async function downloadFile(page, selector, timeout = 10000) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), click(page, selector)]);
  if (!dl) return null;
  const p = await dl.path().catch(() => null);
  return { name: dl.suggestedFilename(), buf: p ? fs.readFileSync(p) : Buffer.alloc(0) };
}
// loading an address that was let go is the probe, and Chrome logs each such load as a console error; those lines are not the page's
const dropProbeErrors = (page) => { const c = page.log.console; for (let i = c.length - 1; i >= 0; i--) if (/ERR_FILE_NOT_FOUND/.test(c[i])) c.splice(i, 1); };

// ---- the analyzer, driven directly (window.FigureStudy.analyze) with drawings made to measure -------------
// Runs in the page. For one pose: the drawing the README describes, made in several ways, and what analyze() says of each.
async function analyzerScenarios(id) {
  const F = window.FigureStudy;
  const s = await F.shotOf(id);
  s.img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s.url; });
  const W = 900, H = 1200, kRef = Math.min(W / s.w, H / s.h), oxRef = (W - s.w * kRef) / 2, oyRef = (H - s.h * kRef) / 2;
  const chains = { spine: ['crown', 'neck', 'chest', 'waist', 'pelvis'], armR: ['shoulderR', 'elbowR', 'wristR', 'handR'], armL: ['shoulderL', 'elbowL', 'wristL', 'handL'], legR: ['hipR', 'kneeR', 'ankleR', 'toeR'], legL: ['hipL', 'kneeL', 'ankleL', 'toeL'], sh: ['shoulderR', 'shoulderL'], hp: ['hipR', 'hipL'] };
  const ALL = ['head', 'spine', 'armR', 'armL', 'legR', 'legL', 'sh', 'hp'];
  const draw = ({ f = 1, ox = oxRef, oy = oyRef, sx = 1, parts = ALL, extra = null } = {}) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), k = kRef * f, cx = ox + s.w * k / 2;
    g.strokeStyle = g.fillStyle = '#222'; g.lineWidth = 6; g.lineCap = g.lineJoin = 'round';
    const P = (n) => { const v = s.joints[n]; return [cx + (ox + v[0] * s.w * k - cx) * sx, oy + v[1] * s.h * k]; };
    parts.forEach((p) => {
      g.beginPath();
      if (p === 'head') { const cr = P('crown'), ch = P('chin'), r = Math.hypot(cr[0] - ch[0], cr[1] - ch[1]) / 2; g.ellipse((cr[0] + ch[0]) / 2, (cr[1] + ch[1]) / 2, r * 0.8, r, Math.atan2(ch[1] - cr[1], ch[0] - cr[0]) - Math.PI / 2, 0, Math.PI * 2); } else chains[p].forEach((n, i) => { const q = P(n); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
      g.stroke();
    });
    if (extra) extra(g, { k, ox, oy });
    return { c, k, P };
  };
  // the naming the notes use for a pair of limbs (README: which parts are dashed), from the joints alone
  const px = (n) => ({ x: s.joints[n][0] * s.w, y: s.joints[n][1] * s.h, near: s.joints[n][2] });
  const headA = Math.max(4, Math.hypot(px('crown').x - px('chin').x, px('crown').y - px('chin').y) / 2 * 1.06);
  const sides = (a, b, what) => (Math.abs(a.x - b.x) > headA * 0.9 ? (a.x < b.x ? [`the ${what} on the left`, `the ${what} on the right`] : [`the ${what} on the right`, `the ${what} on the left`]) : (a.near >= b.near ? [`the near ${what}`, `the far ${what}`] : [`the far ${what}`, `the near ${what}`]));
  const arms = sides(px('shoulderR'), px('shoulderL'), 'arm'), legs = sides(px('hipR'), px('hipL'), 'leg');
  const names = { armR: arms[0], armL: arms[1], legR: legs[0], legL: legs[1], head: 'the head', body: 'the body' };
  const run = (d) => {
    const a = F.analyze(s, d.c), cr = d.P('crown'), sp = a.scoreParts;
    const harm = sp && sp.follow + sp.along > 0 ? 2 * sp.follow * sp.along / (sp.follow + sp.along) : 0;
    return {
      score: a.score, marked: a.marked, k: a.map.k, kDrawn: d.k, match: a.match, parts: sp,
      crownErr: Math.hypot(a.map.ox + a.g.P.crown.x * a.map.k - cr[0], a.map.oy + a.g.P.crown.y * a.map.k - cr[1]), figH: d.k * s.h,
      tips: a.tips.map(([lead, text]) => lead + ': ' + text), leads: a.tips.map((x) => x[0]),
      formula: sp ? Math.round(100 * harm * (0.85 + 0.15 * sp.shape) * sp.clean * Math.max(0, 1 - 0.18 * sp.dashed)) : null,
      falses: a.match ? Object.values(a.match).filter((v) => !v).length : null,
    };
  };
  const fig = F.figureMaskOf(s);
  const eroded = (n) => { const e = new Uint8Array(fig.cast.length); for (let y = n; y < fig.h - n; y++) for (let x = n; x < fig.w - n; x++) { let ok = 1; for (let dy = -n; dy <= n && ok; dy++) for (let dx = -n; dx <= n; dx++) if (!fig.cast[(y + dy) * fig.w + x + dx]) { ok = 0; break; } e[y * fig.w + x] = ok; } return e; };
  const castCells = eroded(2);
  let castN = 0; for (const v of castCells) castN += v;
  const fillWith = (cells) => (g, { k, ox, oy }) => { for (let i = 0; i < cells.length; i++) if (cells[i]) { const x = i % fig.w, y = Math.floor(i / fig.w); g.fillRect(ox + (x / fig.s) * k, oy + (y / fig.s) * k, k / fig.s + 1, k / fig.s + 1); } };
  const out = { names, castN };
  out.plain = run(draw());
  out.corner = run(draw({ f: 0.45, ox: 60, oy: 60 }));
  out.speck = run(draw({ f: 0.45, ox: 60, oy: 60, extra: (g) => { g.beginPath(); g.arc(790, 1110, 3, 0, 7); g.fill(); } }));
  out.noArmL = run(draw({ parts: ALL.filter((p) => p !== 'armL') }));
  out.noArmLlegR = run(draw({ parts: ALL.filter((p) => p !== 'armL' && p !== 'legR') }));
  out.headSpine = run(draw({ parts: ['head', 'spine'] }));
  out.wide = run(draw({ sx: 1.5 }));
  out.hatch = run(draw({ extra: (g) => { g.lineWidth = 5; for (let y = 60; y < 1160; y += 26) { g.beginPath(); g.moveTo(60, y); g.lineTo(840, y + 20); g.stroke(); } } }));
  out.box = run(draw({ extra: (g) => { g.lineWidth = 6; g.strokeRect(120, 40, 660, 1120); } }));
  out.signature = run(draw({ extra: (g) => { g.lineWidth = 4; g.beginPath(); g.moveTo(700, 1120); g.bezierCurveTo(740, 1090, 760, 1150, 800, 1110); g.stroke(); } }));
  out.line = run(draw({ extra: (g) => { g.lineWidth = 4; g.beginPath(); g.moveTo(20, 1160); g.lineTo(880, 1160); g.stroke(); } }));
  out.bars = run(draw({ extra: (g) => { g.lineWidth = 8; g.beginPath(); g.moveTo(80, 200); g.lineTo(80, 1000); g.moveTo(820, 200); g.lineTo(820, 1000); g.stroke(); } }));
  out.cast = castN ? run(draw({ extra: fillWith(castCells) })) : null;
  out.castFull = castN ? run(draw({ extra: fillWith(fig.cast) })) : null;
  // the figure drawn two fifths narrower: taller and thinner for its height than the pose (the Your drawing note)
  out.thin = run(draw({ sx: 0.6 }));
  // one arm drawn along a quarter, and along three quarters, of its length: the README's "no marks near half its length" rule
  const armPart = (frac) => (g, { k, ox, oy }) => {
    const pts = ['shoulderL', 'elbowL', 'wristL', 'handL'].map((n) => [ox + s.joints[n][0] * s.w * k, oy + s.joints[n][1] * s.h * k]);
    const seg = []; for (let i = 1; i < pts.length; i++) seg.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let want = frac * seg.reduce((a, b) => a + b, 0);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && want > 0; i++) { const f = Math.min(1, want / seg[i - 1]); g.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); want -= seg[i - 1]; }
    g.stroke();
  };
  out.arm25 = run(draw({ parts: ALL.filter((p) => p !== 'armL'), extra: armPart(0.25) }));
  out.arm75 = run(draw({ parts: ALL.filter((p) => p !== 'armL'), extra: armPart(0.75) }));
  // the wooden figure's outline alone (the cells on its edge, a line one cell thick): what someone who outlines the body draws
  if (fig) {
    const ol = new Uint8Array(fig.w * fig.h);
    for (let y = 0; y < fig.h; y++) for (let x = 0; x < fig.w; x++) {
      const i = y * fig.w + x;
      if (fig.d[i] !== 0) continue;
      if ((x > 0 && fig.d[i - 1] > 0) || (x < fig.w - 1 && fig.d[i + 1] > 0) || (y > 0 && fig.d[i - fig.w] > 0) || (y < fig.h - 1 && fig.d[i + fig.w] > 0)) ol[i] = 1;
    }
    out.outline = run(draw({ parts: [], extra: fillWith(ol) }));
    out.outlineCells = ol.reduce((a, b) => a + b, 0);
  }
  return out;
}
// Runs in the page: the line of action's three words from points that bow no way, one way and both ways; the gesture's
// four colours drawn with every part matched, and with one left out
function curveAndColours(cols) {
  const F = window.FigureStudy;
  const line = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 100 + i * 4, y: 50 + i * 100 }));
  const bow = (amt) => [0, 1, 2, 3, 4, 5, 6].map((i) => { const t = i / 6; return { x: 100 + amt * Math.sin(Math.PI * t) * 600, y: 50 + i * 100 }; });
  const sbend = (amt) => [0, 1, 2, 3, 4, 5, 6].map((i) => { const t = i / 6; return { x: 100 + amt * Math.sin(2 * Math.PI * t) * 600, y: 50 + i * 100 }; });
  const shapes = { straight: F.fitCurve(line).shape, flat: F.fitCurve(bow(0.01)).shape, C: F.fitCurve(bow(0.2)).shape, S: F.fitCurve(sbend(0.2)).shape };
  const s = { w: 600, h: 750, joints: {} };
  const J = { pelvis: [0.5, 0.5], waist: [0.5, 0.42], chest: [0.5, 0.34], neck: [0.5, 0.27], head: [0.5, 0.2], crown: [0.5, 0.12], chin: [0.5, 0.27], face: [0.5, 0.2], shoulderR: [0.42, 0.3], elbowR: [0.38, 0.42], wristR: [0.36, 0.52], handR: [0.35, 0.57], hipR: [0.46, 0.52], kneeR: [0.45, 0.68], ankleR: [0.45, 0.85], toeR: [0.47, 0.88], heelR: [0.44, 0.88], shoulderL: [0.58, 0.3], elbowL: [0.62, 0.42], wristL: [0.64, 0.52], handL: [0.65, 0.57], hipL: [0.54, 0.52], kneeL: [0.55, 0.68], ankleL: [0.55, 0.85], toeL: [0.57, 0.88], heelL: [0.54, 0.88] };
  for (const n in J) s.joints[n] = [J[n][0], J[n][1], 0];
  const g = F.gestureOf(s);
  const paint = (match) => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 750;
    const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 600, 750);
    F.drawGesture(x, g, { k: 1, ox: 0, oy: 0 }, match);
    const d = x.getImageData(0, 0, 600, 750).data, n = { action: 0, bones: 0, tilt: 0, miss: 0 };
    for (let i = 0; i < d.length; i += 4) for (const k in cols) { const h = cols[k]; if (Math.abs(d[i] - h[0]) < 22 && Math.abs(d[i + 1] - h[1]) < 22 && Math.abs(d[i + 2] - h[2]) < 22) n[k]++; }
    return n;
  };
  return { shapes, whole: paint({ head: true, body: true, armR: true, armL: true, legR: true, legL: true }), noneMatch: paint(null), oneOut: paint({ head: true, body: true, armR: false, armL: true, legR: true, legL: true }) };
}
// Runs in the page: every pose of the library, drawn once, its shot read and a drawing traced from its joints scored
async function everyPose() {
  const F = window.FigureStudy, out = [], t0 = performance.now();
  for (const p of F.poses()) {
    const t1 = performance.now();
    const s = await F.shotOf(p.id);
    if (!s) { out.push({ id: p.id, name: p.name, shot: null }); continue; }
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s.url; });
    const names = Object.keys(s.joints), xs = names.map((n) => s.joints[n][0]), ys = names.map((n) => s.joints[n][1]);
    // the picture: not one flat tone
    let spread = 0;
    if (img) { const c = document.createElement('canvas'); c.width = 60; c.height = 75; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 60, 75); const d = g.getImageData(0, 0, 60, 75).data, tones = new Set(); for (let i = 0; i < d.length; i += 4) tones.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); spread = tones.size; }
    const rec = { id: p.id, name: p.name, w: s.w, h: s.h, img: !!img, spread, joints: names.length, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), tilts: s.tilts, shotMs: Math.round(performance.now() - t1) };
    if (img) {
      s.img = img;
      // a drawing traced from the joints, at the reference's place on the sheet
      const W = 900, H = 1200, k = Math.min(W / s.w, H / s.h), ox = (W - s.w * k) / 2, oy = (H - s.h * k) / 2;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.strokeStyle = '#222'; g.lineWidth = 6; g.lineCap = g.lineJoin = 'round';
      const P = (n) => [ox + s.joints[n][0] * s.w * k, oy + s.joints[n][1] * s.h * k];
      const chains = [['crown', 'neck', 'chest', 'waist', 'pelvis'], ['shoulderR', 'elbowR', 'wristR', 'handR'], ['shoulderL', 'elbowL', 'wristL', 'handL'], ['hipR', 'kneeR', 'ankleR', 'toeR'], ['hipL', 'kneeL', 'ankleL', 'toeL'], ['shoulderR', 'shoulderL'], ['hipR', 'hipL']];
      chains.forEach((ch) => { g.beginPath(); ch.forEach((n, i) => { const q = P(n); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); });
      const cr = P('crown'), chn = P('chin'), r = Math.hypot(cr[0] - chn[0], cr[1] - chn[1]) / 2;
      g.beginPath(); g.ellipse((cr[0] + chn[0]) / 2, (cr[1] + chn[1]) / 2, r * 0.8, r, Math.atan2(chn[1] - cr[1], chn[0] - cr[0]) - Math.PI / 2, 0, Math.PI * 2); g.stroke();
      const a = F.analyze(s, c);
      rec.score = a.score; rec.stars = a.stars; rec.dashed = a.match ? Object.entries(a.match).filter(([, v]) => !v).map(([k2]) => k2) : null;
      rec.shape = a.g.action.shape; rec.tips = a.tips.map(([lead, text]) => [lead, text]);
      // the body's own tilts, and how wide the shoulders and hips look in the picture (in heads), which the Tilt note waits on
      const P2 = (n) => ({ x: s.joints[n][0] * s.w, y: s.joints[n][1] * s.h });
      const head = Math.max(4, Math.hypot(P2('crown').x - P2('chin').x, P2('crown').y - P2('chin').y) / 2 * 1.06) * 2;
      rec.wideSh = Math.abs(P2('shoulderR').x - P2('shoulderL').x) / head; rec.wideHp = Math.abs(P2('hipR').x - P2('hipL').x) / head;
    }
    out.push(rec);
  }
  out.total = Math.round(performance.now() - t0);
  return { list: out, ms: Math.round(performance.now() - t0) };
}

// ================= J. the analyzer, driven directly =================
// README "The gesture ... is fitted to the marks", "The gesture match ...", "The notes ...": drawings made to measure are handed to
// window.FigureStudy.analyze, the way the card's own drawing is
async function analyzerBlock(t, page) {
  const castCost = []; // the solid cast shadow's cost on each pose, for one finding after both poses
  for (const id of ['stand', 'relaxed']) {
    const R = await page.evaluate(analyzerScenarios, id);
    const P = R.plain, all = (m) => !!m && Object.values(m).every((v) => v === true);
    t.check(P.marked && P.score >= 90 && all(P.match) && P.parts.dashed === 0 && Math.abs(P.k / P.kDrawn - 1) < 0.05 && P.crownErr < 0.03 * P.figH && P.leads.includes('Well matched'), `analyze ${id}: a drawing traced from the joints is fitted at its own size and place, every part matched, well matched`, { score: P.score, ratio: P.k / P.kDrawn, err: P.crownErr, match: P.match, leads: P.leads });
    const C = R.corner;
    t.check(C.marked && Math.abs(C.k / C.kDrawn - 1) < 0.08 && C.crownErr < 0.04 * C.figH && C.score >= 85 && all(C.match), `analyze ${id}: the same drawing at 0.45 size in the sheet's corner is fitted to where it is, as finely (README: a small drawing is measured as finely as a large one)`, { score: C.score, ratio: C.k / C.kDrawn, err: C.crownErr, figH: C.figH, match: C.match });
    const K = R.speck;
    t.check(Math.abs(K.k / C.k - 1) < 0.01 && Math.abs(K.score - C.score) <= 1 && all(K.match), `analyze ${id}: a speck 400 px from the drawing is left out (the fit and the score do not move)`, { without: [C.k, C.score], with: [K.k, K.score], match: K.match });
    // dashed parts: exactly the part left out, named by side, and 18% off for each
    const A = R.noArmL, nm = R.names;
    t.check(A.match.armL === false && A.falses === 1 && A.parts.dashed === 1 && A.score < P.score * 0.9 && A.leads.includes('Dashed') && A.tips.some((x) => x === `Dashed: no marks near ${nm.armL}. Look again at where it goes.`), `analyze ${id}: with one arm left out only that arm is dashed, the note names it (${nm.armL}) and the score falls`, { match: A.match, score: A.score, plain: P.score, tips: A.tips.filter((x) => /^Dashed/.test(x)), want: nm.armL });
    const B = R.noArmLlegR;
    t.check(B.match.armL === false && B.match.legR === false && B.falses === 2 && B.parts.dashed === 2 && B.score < A.score && B.tips.some((x) => x === `Dashed: no marks near ${nm.armL} and ${nm.legR}. Look again at where they go.`), `analyze ${id}: two parts left out: both dashed and named in one sentence (${nm.armL} and ${nm.legR})`, { match: B.match, score: B.score, tips: B.tips.filter((x) => /^Dashed/.test(x)) });
    const H = R.headSpine;
    t.check(H.parts.dashed >= 2 && H.falses === H.parts.dashed && H.score < 40 && H.leads.includes('Dashed') && !H.leads.includes('Well matched'), `analyze ${id}: a head and a spine alone leave the limbs dashed and score under 40`, { dashed: H.parts.dashed, match: H.match, score: H.score });
    t.note(`analyze ${id}: a head and a spine alone: ${H.parts.dashed} of the 4 limbs dashed, scale ${(H.k / H.kDrawn).toFixed(2)} of the drawing's (the fit shrinks the gesture onto the tall thin box of the marks, so a limb or two can lie along the spine); score ${H.score}`);
    // the score is its stated formula: the harmonic mean, up to 15% off for the shape, the clean factor, 18% for each dashed part
    const rows = Object.entries(R).filter(([, v]) => v && v.formula !== undefined && v.formula !== null);
    const bad = rows.filter(([, v]) => Math.abs(v.formula - v.score) > 1 || v.parts.dashed !== v.falses);
    t.check(bad.length === 0 && rows.length >= 10, `analyze ${id}: every score is the README's formula from its parts (harmonic mean, shape, clean, 18% per dashed part) and "dashed" counts the dashed parts`, bad.map(([k, v]) => ({ k, score: v.score, formula: v.formula, dashed: v.parts.dashed, falses: v.falses })));
    const Wd = R.wide;
    t.check(Wd.parts.shape < 0.5 && Wd.score < P.score && Wd.tips.some((x) => /^Your drawing: is wider for its height than the pose/.test(x)), `analyze ${id}: a figure drawn 1.5 times too wide loses on shape and the note says it is wider for its height`, { shape: Wd.parts.shape, score: Wd.score, tips: Wd.tips.filter((x) => /^Your drawing/.test(x)) });
    t.check(P.parts.shape > 0.9 && P.parts.shape <= 1, `analyze ${id}: a drawing of the pose's own proportions takes at most a few percent off for shape`, P.parts.shape);
    const Hh = R.hatch;
    t.check(Hh.parts.clean === 0 && Hh.score === 0 && Hh.leads.includes('Extra marks'), `analyze ${id}: hatching the room around the figure takes the score to nothing and the note says why`, { clean: Hh.parts.clean, score: Hh.score, leads: Hh.leads });
    const Bx = R.box;
    t.check(Bx.parts.clean < 0.8 && Bx.score <= 45 && Bx.leads.includes('Extra marks'), `analyze ${id}: a frame drawn round the figure counts as marks filling the room`, { clean: Bx.parts.clean, score: Bx.score, leads: Bx.leads });
    const Sg = R.signature, Ln = R.line;
    t.check(Math.abs(Sg.score - P.score) <= 1 && !Sg.leads.includes('Extra marks') && Sg.tips.find((x) => /^Your drawing/.test(x)) === P.tips.find((x) => /^Your drawing/.test(x)) && Math.abs(Ln.score - P.score) <= 1 && Ln.tips.find((x) => /^Your drawing/.test(x)) === P.tips.find((x) => /^Your drawing/.test(x)), `analyze ${id}: a signature in the corner and a line across the foot of the sheet are left out of the drawing's shape and cost nothing`, { plain: P.score, signature: Sg.score, line: Ln.score });
    const Br = R.bars;
    t.check(Br.parts.along < 0.8 && Br.parts.clean >= 0.9 && Br.leads.includes('Off the figure') && !Br.leads.includes('Well matched') && Br.score < P.score - 5, `analyze ${id}: long marks away from the body (two bars either side) take the score down and the note says the drawing lies off the figure`, { along: Br.parts.along, clean: Br.parts.clean, score: Br.score, leads: Br.leads });
    // README: "The notes ... whether the drawing is as wide for its height as the pose": the pose's own proportions are said to have
    // its overall shape, and a figure two fifths narrower is said to be taller and thinner (and its score falls well down)
    const Th = R.thin;
    t.check(P.tips.includes("Your drawing: has the pose's overall shape: about as wide for its height.") && Th.score < P.score - 30 && Th.tips.includes('Your drawing: is taller and thinner than the pose. Check how far the arms and legs reach out to the sides.'), `analyze ${id}: a drawing of the pose's proportions is said to have its overall shape, and one two fifths narrower is said to be taller and thinner, with its score well down`, { plain: P.score, thin: Th.score, tips: Th.tips.filter((x) => /^Your drawing/.test(x)) });
    // README: "The gesture ... settles inside an outline drawing as well as on a stick figure": the wooden figure's own edge, drawn alone
    if (R.outline) {
      const O = R.outline;
      t.check(O.marked && Math.abs(O.k / O.kDrawn - 1) < 0.05 && O.crownErr < 0.04 * O.figH && O.score >= 85 && all(O.match) && O.leads.includes('Well matched'), `analyze ${id}: an outline of the body alone (the cells on the wooden figure's edge) is fitted at its own size and place, every part matched, well matched`, { score: O.score, ratio: O.k / O.kDrawn, err: O.crownErr, match: O.match, cells: R.outlineCells });
    } else t.note(`analyze ${id}: no picture for the wooden figure, so no outline drawing to fit`);
    // README: "A part with no marks near half its length is dashed". Asserted on the stand, where the arm hangs clear of the body:
    // a quarter of the arm drawn is dashed and named by side, three quarters are not. (On the relaxed pose the arm hangs against
    // the torso, so the marks along the torso count as marks near the arm: that is the rule working, and it is noted, not checked.)
    if (id === 'stand') {
      const Q = R.arm25, Qh = R.arm75;
      t.check(Q.match.armL === false && Q.parts.dashed === 1 && Q.tips.includes(`Dashed: no marks near ${nm.armL}. Look again at where it goes.`) && Qh.match.armL === true && Qh.parts.dashed === 0, `analyze ${id}: an arm drawn along a quarter of its length is dashed and named, one drawn along three quarters is not (README: no marks near half its length)`, { quarter: { match: Q.match.armL, dashed: Q.parts.dashed, tips: Q.tips.filter((x) => /^Dashed/.test(x)) }, threeQuarters: { match: Qh.match.armL, dashed: Qh.parts.dashed } });
    } else t.note(`analyze ${id}: a quarter of the left arm drawn: ${R.arm25.match.armL ? 'not dashed (the marks along the torso are near the arm)' : 'dashed'}; three quarters: ${R.arm75.match.armL ? 'not dashed' : 'dashed'}`);
    if (R.castN) {
      const Cs = R.cast;
      t.check(Math.abs(Cs.score - P.score) <= 3 && all(Cs.match) && Cs.parts.along > 0.95, `analyze ${id}: the cast shadow (the gray floor patches touching the figure), drawn solid, costs nothing`, { plain: P.score, withCast: Cs.score, along: Cs.parts.along, cells: R.castN });
      // README: "The cast shadow ... can be drawn without cost". Drawn solid out to the edge of the mask the page keeps (the most a visitor
      // shading it would fill), the score falls by a star's worth: the drawing's box takes in the whole width of the shadow.
      const Cf = R.castFull;
      castCost.push({ id, plain: P.score, solid: Cf.score, shape: +Cf.parts.shape.toFixed(2) });
      t.check(Math.abs(Cf.score - P.score) <= 3, `analyze ${id}: the cast shadow drawn solid out to the edge of the mask the page keeps costs nothing (README: "can be drawn without cost")`, { plain: P.score, solid: Cf.score, shape: Cf.parts.shape });
    } else t.note(`analyze ${id}: the reference shows no cast shadow patch touching the figure, so nothing to draw on it`);
  }
  {
    const lost = castCost.filter((c) => Math.abs(c.solid - c.plain) > 3);
    if (lost.length) t.finding({
      title: 'A cast shadow drawn solid to the edge of its patch takes a star off the gesture match, though the README says it can be drawn without cost',
      severity: 'medium',
      steps: 'Figure study, a relaxed class on Stand (Weight on one leg shows the same). On the paper, trace the stick figure and then fill the gray patch on the floor that touches the feet solid, out to the patch\'s outer edge (the mask the page keeps for the cast shadow: a few pixels past its soft edge). Done. The same drawing without the patch is the comparison. The analyzer block of this case does this with the reference\'s own mask (window.FigureStudy.figureMaskOf), filling its cast cells.',
      expected: 'README, Figure study, after the stars: "The cast shadow the reference shows (the gray patches on the floor that touch the figure) can be drawn without cost, and a name, a label or a line across the sheet is left out of the drawing\'s shape." The score with the solid shadow should equal the score without it (100 on Stand).',
      actual: `The solid shadow costs a star: ${lost.map((c) => `${c.id} ${c.solid} against ${c.plain} without it (shape ${c.shape.toFixed(2)})`).join('; ')}. Each score crosses a star line (88 or 78) and drops a star. The shadow's width joins the drawing's shape box, which takes the shape term to 0.`,
      cause: 'Read from the code, and the shape value (0.00) and the score measured: js/figure.js:779 drops a cell of the drawing from the shape box only when it lies inside the reference\'s cast mask (onCast, on the fitted grid). The outer ring of a solid fill can land just outside that mask (the fit is a few pixels off it), and it stays in; where the shadow touches the feet, the 30% rule on the same line keeps its connected piece with the figure. The box then spans the shadow\'s width (js/figure.js:782). The shape term falls to 0 and takes 15% off the score (js/figure.js:829, 0.85 + 0.15 × shape).',
    });
  }
  // the line of action's word, and the gesture's four colours
  const G = await page.evaluate(curveAndColours, PIX);
  t.check(G.shapes.straight === 'straight' && G.shapes.flat === 'straight' && G.shapes.C === 'C' && G.shapes.S === 'S', 'the line of action is called straight, a C or an S by how far it bows (fitCurve on a line, a slight bow, one bow and two)', G.shapes);
  t.check(G.whole.action > 100 && G.whole.bones > 100 && G.whole.tilt > 50 && G.whole.miss === 0, 'drawGesture: with every part matched the line of action, the stick figure and the tilt lines are drawn in their colours and nothing in the dashed pink', G.whole);
  t.check(G.oneOut.miss > 30 && G.oneOut.bones > 100 && G.oneOut.bones < G.whole.bones, 'drawGesture: a part with no marks near it is drawn in dashed pink instead of blue', { whole: G.whole, oneOut: G.oneOut });
  t.check(G.noneMatch.miss === 0, 'drawGesture: with no marks to match (nothing drawn) nothing is dashed', G.noneMatch);
  await clean(t, page, 'the analyzer');
}
// The help's colour key against the colours the gesture is drawn in (index.html .fig-sw-*, js/figure.js COLORS)
async function colourKeyBlock(t, page) {
  const sw = await page.evaluate(() => { const bg = (c) => getComputedStyle(document.querySelector('.fig-' + c)).backgroundColor, img = (c) => getComputedStyle(document.querySelector('.fig-' + c)).backgroundImage; return { action: bg('sw-action'), bones: bg('sw-bones'), tilt: bg('sw-tilt'), miss: img('sw-miss'), keys: document.querySelectorAll('.fig-key').length, help: /pink/.test(document.getElementById('tab-help').textContent) }; });
  t.check(sw.action === 'rgb(232, 89, 12)' && sw.bones === 'rgb(28, 109, 208)' && sw.tilt === 'rgb(43, 138, 62)' && /rgb\(194, 37, 92\)/.test(sw.miss), 'the colour key\'s swatches are the colours the gesture is drawn in (#e8590c, #1c6dd0, #2b8a3e, #c2255c)', sw);
}

// ================= K. every pose of the library renders a usable shot =================
// README: "pose-and-light:render with a pose's reference picture (600 × 750, the figure filling it with a little room all round ...),
// where each joint lands in it, and the true tilt of its shoulders and hips"; "The notes give the line of action, the tilt of the
// shoulders and hips (the body's own, from the model ...)". A class deals poses at random, so every one is drawn here, once.
async function everyPoseBlock(t, page) {
  const { list, ms } = await page.evaluate(everyPose);
  t.check(list.length === POOL_ALL.length && POOL_ALL.every((id) => list.some((r) => r.id === id)), 'the pose library holds the 30 poses', list.map((r) => r.id));
  const missing = list.filter((r) => r.shot === null).map((r) => r.id);
  t.check(missing.length === 0, 'every pose renders a shot (a class would skip one that did not)', missing);
  const ok = list.filter((r) => r.shot !== null);
  const odd = ok.filter((r) => r.w !== 600 || r.h !== 750 || r.joints !== 26 || !r.img);
  t.check(odd.length === 0, 'every shot is 600 × 750 with its 26 joints, and its picture loads', odd.map((r) => [r.id, r.w, r.h, r.joints, r.img]));
  const out = ok.filter((r) => r.minX < 0.02 || r.maxX > 0.98 || r.minY < 0.02 || r.maxY > 0.98);
  t.check(out.length === 0, 'every joint of every pose lands inside its picture (none within 2% of an edge)', out.map((r) => [r.id, +r.minX.toFixed(3), +r.maxX.toFixed(3), +r.minY.toFixed(3), +r.maxY.toFixed(3)]));
  const small = ok.filter((r) => Math.max(r.maxX - r.minX, r.maxY - r.minY) < 0.6);
  t.check(small.length === 0, 'the figure fills its picture in every pose (its joints span at least 60% of one side)', small.map((r) => [r.id, +(r.maxX - r.minX).toFixed(2), +(r.maxY - r.minY).toFixed(2)]));
  const flat = ok.filter((r) => r.spread < 15);
  t.check(flat.length === 0, 'every picture has more than one tone in it', flat.map((r) => [r.id, r.spread]));
  const badTilt = ok.filter((r) => !r.tilts || !Number.isFinite(r.tilts.shoulders) || !Number.isFinite(r.tilts.hips) || Math.abs(r.tilts.shoulders) > 90 || Math.abs(r.tilts.hips) > 90);
  t.check(badTilt.length === 0, 'every pose carries finite shoulder and hip tilts in degrees', badTilt.map((r) => [r.id, r.tilts]));
  t.note(`every pose: 30 shots and 30 scored traces in ${(ms / 1000).toFixed(0)} s (slowest shot ${Math.max(...ok.map((r) => r.shotMs))} ms)`);
  // a drawing traced from a pose's own joints is a good drawing of it, whichever pose
  const low = ok.filter((r) => !(r.score >= 65));
  t.check(low.length === 0, 'a drawing traced from the joints of any of the 30 poses earns at least three stars', low.map((r) => [r.id, r.score, r.dashed, r.tips && r.tips.map((x) => x[0])]));
  t.note(`traced drawings of the 30 poses score ${Math.min(...ok.map((r) => r.score))} to ${Math.max(...ok.map((r) => r.score))}`);
  // the notes against the model: the line of action's word is the curve's own, the tilt sentence follows the body's tilts
  const sentence = (r) => { const sh = r.tilts.shoulders, hp = r.tilts.hips, lv = (d) => Math.abs(d) < 3; return lv(sh) && lv(hp) ? 'both level' : !lv(sh) && !lv(hp) && Math.sign(sh) !== Math.sign(hp) ? 'contrapposto' : !lv(sh) && !lv(hp) ? 'same way' : lv(sh) ? 'hips only' : 'shoulders only'; };
  const said = (r) => { const x = (r.tips.find((q) => q[0] === 'Tilt') || [])[1]; return x === undefined ? 'none' : /both nearly level/.test(x) ? 'both level' : /contrapposto/.test(x) ? 'contrapposto' : /same way/.test(x) ? 'same way' : /hips tilt while/.test(x) ? 'hips only' : /shoulders tilt while/.test(x) ? 'shoulders only' : '?' + x; };
  const wrong = ok.filter((r) => r.wideSh > 0.6 && r.wideHp > 0.4 && said(r) !== sentence(r));
  t.check(wrong.length === 0, 'the Tilt note says what the model\'s own tilts are (level, contrapposto when they oppose by 3° or more each, the same way, or one alone), for every pose', wrong.map((r) => [r.id, r.tilts, said(r), sentence(r)]));
  const endOn = ok.filter((r) => !(r.wideSh > 0.6 && r.wideHp > 0.4));
  t.check(endOn.every((r) => said(r) === 'none'), 'no Tilt note is given where the shoulders or the hips are seen end on', endOn.map((r) => [r.id, r.wideSh, r.wideHp, said(r)]));
  const kinds = new Set(ok.map(said));
  t.check(kinds.has('both level') && kinds.has('contrapposto') && kinds.has('same way'), 'the 30 poses between them reach the level, contrapposto and same-way sentences (the rule is exercised both ways)', [...kinds]);
  const wordOf = { straight: '^nearly straight', C: '^a C curve', S: '^an S curve' };
  const lineBad = ok.filter((r) => !wordOf[r.shape] || r.tips[0][0] !== 'Line of action' || !new RegExp(wordOf[r.shape]).test(r.tips[0][1]));
  t.check(lineBad.length === 0, 'the Line of action note names the curve the model has (straight, a C or an S) for every pose', lineBad.map((r) => [r.id, r.shape, r.tips[0]]));
  const shapes = ok.reduce((m, r) => { m[r.shape] = (m[r.shape] || 0) + 1; return m; }, {});
  t.note(`lines of action over the 30 poses: ${JSON.stringify(shapes)}; tilt sentences: ${JSON.stringify(ok.reduce((m, r) => { const k = said(r); m[k] = (m[k] || 0) + 1; return m; }, {}))}`);
  await clean(t, page, 'every pose');
}

// ================= L. the sheet and the studio's tools inside a class =================
// README: "a second copy of the Studio (... with its own ids, reference and paper), which starts with the charcoal pencil on a paper
// texture, a fresh sheet for each pose"; the reference of each pose (Values, Blocks, size, Hidden); Save as PNG for each drawing
const R = (s) => `#fs-root ${s}`;
const range = (page, sel, v) => page.evaluate(([sel, v]) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
// the pose's reference on the paper: how many tones, whether they are all gray, where it is
const refFacts = (page) => page.evaluate(() => {
  const c = document.getElementById('fs-refCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, tones = new Set();
  let gray = true;
  for (let i = 0; i < d.length; i += 4) { tones.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); if (Math.abs(d[i] - d[i + 1]) > 6 || Math.abs(d[i] - d[i + 2]) > 6) gray = false; }
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const f = document.getElementById('fs-refFig'), p = box(document.getElementById('fs-paper')), r = box(f);
  const ix = Math.max(0, Math.min(p.x + p.w, r.x + r.w) - Math.max(p.x, r.x)), iy = Math.max(0, Math.min(p.y + p.h, r.y + r.h) - Math.max(p.y, r.y));
  return { tones: tones.size, gray, hidden: f.hidden, fig: r, paper: p, covers: f.hidden ? 0 : (ix * iy) / (p.w * p.h), out: document.getElementById('fs-refSizeOut').textContent, name: document.getElementById('fs-refName').textContent, hint: document.getElementById('fs-refViewHint').textContent, min: +document.getElementById('fs-refSize').min, max: +document.getElementById('fs-refSize').max };
});
async function toolsBlock(t, page, mem) {
  await toastLog(page);
  t.check(await startClass(page, { ids: ['stand', 'relaxed'] }), 'tools: a relaxed class on two poses starts');
  // ---- pose 1: the starting state, the reference, the eraser
  const st = await page.evaluate(() => {
    const root = document.getElementById('fs-root'), on = (sel) => !!root.querySelector(sel + '[aria-pressed="true"]'), wv = document.getElementById('fs-weave');
    const d = wv.getContext('2d').getImageData(0, 0, wv.width, wv.height).data, tones = new Set();
    for (let i = 0; i < d.length; i += 40) tones.add(d[i]);
    return { status: document.getElementById('fs-status').textContent, pencil: on('[data-brush="pencil"]'), charcoal: on('[data-lead="charcoal"]'), paper: on('[data-weave="paper"]'), raw: on('[data-ground="raw"]'), tones: tones.size, textured: document.getElementById('fs-paperWrap').classList.contains('ps-textured-paper') };
  });
  t.check(/^Pencil · black · Charcoal · Medium · 4 px · 900 × 1200$/.test(st.status) && st.pencil && st.charcoal && st.paper && st.textured && st.tones > 5, 'tools: the sheet starts with the charcoal pencil on a paper texture', st);
  const r0 = await refFacts(page);
  t.check(!r0.hidden && r0.tones > 40 && /^(Stand|Weight on one leg), pose 1\. Drawn from the Pose and light figure\.$/.test(r0.name), 'reference: the pose is drawn on the paper\'s stage, a real picture, named', { tones: r0.tones, name: r0.name });
  t.check(r0.covers === 0, 'reference: at 1400 px wide it sits beside the paper, not over it', { covers: r0.covers, fig: r0.fig, paper: r0.paper });
  await click(page, '#fs-refBtn');
  const sheet = await page.evaluate(() => {
    const root = document.getElementById('fs-root'), follow = [...root.querySelectorAll('.ps-follow')], shown = (e) => { const r = e.getBoundingClientRect(); return !e.hidden && getComputedStyle(e).display !== 'none' && r.width > 0; };
    const sh = document.getElementById('fs-refSheet'), words = [...sh.querySelectorAll('button, label, p, span, h3')].filter(shown).map((e) => e.textContent.trim()).join(' | ');
    return { follow: follow.length, shown: follow.filter(shown).length, open: !sh.hidden, words };
  });
  t.check(sheet.open && sheet.follow >= 3 && sheet.shown === 0 && !/Load a photo|Copy the Study lines|The Study photo|A portrait|Another painting/.test(sheet.words), 'reference: the Study tab\'s own controls (The Study photo / A portrait, Load a photo, Copy the Study lines) are left off this copy', sheet);
  t.check(r0.hint === 'Values shows the pose in dark, middle and light. Blocks shows its big shapes of light and shadow.', 'reference: the sheet explains Values and Blocks in the pose\'s words', r0.hint);
  await click(page, R('[data-ref-view="values"]'));
  const rv = await refFacts(page);
  t.check(rv.tones <= 4 && rv.tones >= 2 && rv.gray, 'reference: Values shows the pose in a few grays (dark, middle, light)', { tones: rv.tones, gray: rv.gray });
  await click(page, R('[data-ref-view="blocks"]'));
  const rb = await refFacts(page);
  t.check(rb.tones >= 3 && rb.tones <= 30 && !rb.gray, 'reference: Blocks shows its big shapes in a handful of colors', { tones: rb.tones });
  await click(page, R('[data-ref-view="original"]'));
  t.check((await refFacts(page)).tones > 40, 'reference: back to the original picture');
  await range(page, '#fs-refSize', 20); const small = await refFacts(page);
  await range(page, '#fs-refSize', 70); const big = await refFacts(page);
  t.check(small.fig.w < r0.fig.w && big.fig.w > r0.fig.w && small.out === '20%' && big.out === '70%' && big.fig.w / small.fig.w > 2, 'reference: the size slider scales the picture, 20% to 70%, with its readout', { small: small.fig.w, normal: r0.fig.w, big: big.fig.w, out: [small.out, big.out] });
  await click(page, R('[data-ref-show="0"]'));
  const hid = await refFacts(page);
  await click(page, R('[data-ref-show="1"]'));
  const shown = await refFacts(page);
  t.check(hid.hidden && !shown.hidden && shown.tones > 40, 'reference: Hidden takes the pose off the paper and Shown brings it back', { hidden: hid.hidden, shown: !shown.hidden });
  await range(page, '#fs-refSize', 42);
  await click(page, '#fs-refBtn');
  const b0 = (await refFacts(page)).fig;
  await stroke(page, '#fs-refFig .ps-frame', [[0.5, 0.5], [0.2, 0.9]], { steps: 5 });
  const b1 = (await refFacts(page)).fig;
  t.check(Math.abs(b1.x - b0.x) > 20 && Math.abs(b1.y - b0.y) > 20 && Math.abs(b1.w - b0.w) < 2, 'reference: dragging its frame moves it over the stage', { from: [b0.x, b0.y], to: [b1.x, b1.y] });
  t.check((await inked(page, '#fs-paper')) === 0, 'reference: dragging the picture drew nothing on the paper');
  // the eraser rubs out marks and leaves nothing to score
  await stroke(page, '#fs-paper', [[0.3, 0.3], [0.7, 0.7]]);
  const drawn = await inked(page, '#fs-paper');
  await click(page, R('[data-ps-tool="eraser"]'));
  for (const y of [0.2, 0.4, 0.6, 0.8]) await stroke(page, '#fs-paper', [[0, y], [1, y]], { steps: 6 });
  await stroke(page, '#fs-paper', [[0.2, 0.2], [0.8, 0.8]], { steps: 6 });
  t.check(drawn > 100 && (await inked(page, '#fs-paper')) === 0, 'tools: the eraser rubs out every mark', { drawn, after: await inked(page, '#fs-paper') });
  const c1 = await finishPose(page);
  t.check(c1 && c1.grade === 'Nothing drawn' && c1.pct === '0' && c1.on === 0, 'tools: a sheet rubbed back to blank is "Nothing drawn", not a score', c1 && { grade: c1.grade, pct: c1.pct });
  t.check(c1 && !c1.tips.some((x) => /^Measure/.test(x)) && c1.tips.length >= 2, 'the card gives the notes the README lists (line of action, tilt, width for height, dashed parts or what else) and no Measure note', c1 && c1.tips);
  // ---- pose 2: the underdrawing layer
  t.check(await nextPose(page, 2), 'tools: pose 2 comes');
  const eraserStill = await text(page, '#fs-status');
  await click(page, '#fs-brushBtn'); await click(page, '#fs-brushBtn');
  await click(page, R('[data-brush="sketch"]'));
  const sk = await text(page, '#fs-status');
  await traceParts(page);
  const skInk = await inked(page, '#fs-sketch'), paintInk = await inked(page, '#fs-paper');
  await click(page, R('[data-sketch-show="0"]'));
  const c2 = await finishPose(page);
  t.check(/^Underdrawing · /.test(sk) && skInk > 100 && paintInk === 0, 'tools: the underdrawing brush draws on its own layer', { sk, skInk, paintInk });
  t.check(c2 && c2.grade === 'Nothing drawn' && c2.pct === '0', 'tools: an underdrawing hidden before Done is not counted as marks ("Nothing drawn")', c2 && { grade: c2.grade, pct: c2.pct });
  t.note(`the eraser chosen on pose 1 was still in hand on pose 2 (status "${eraserStill}"): the tool, like the ground and the paper's turn, carries over from pose to pose; only the marks are fresh`);
  // ---- pose 3: a gray ground and the white pencil; the Canvas sheet's Save
  t.check(await nextPose(page, 3), 'tools: pose 3 comes');
  await click(page, R('[data-ground="gray"]'));
  await click(page, '#fs-brushBtn'); await click(page, '#fs-brushBtn');
  await click(page, R('[data-brush="pencil"]')); await click(page, R('[data-pcolor="white"]'));
  const wh = await text(page, '#fs-status');
  await traceParts(page);
  const dl = await downloadFile(page, '#fs-save');
  const sheetPng = dl && dl.buf.length ? await pngFacts(page, dl.buf) : null;
  t.check(dl && dl.name === 'figure-drawing.png' && sheetPng && sheetPng.w === 900 && sheetPng.h === 1200 && sheetPng.tones > 8 && Object.values(sheetPng.near).every((n) => n === 0) && !(await page.evaluate(() => document.getElementById('saveDialog').open)), 'tools: the Canvas sheet\'s Save gives figure-drawing.png, 900 × 1200, textured, with the paper alone (no gesture on it), and no dialog at the top level', { name: dl && dl.name, sheetPng });
  t.check(/white/.test(wh) && sheetPng && Math.abs(sheetPng.corner[0] - sheetPng.corner[1]) < 14 && sheetPng.corner[0] > 100 && sheetPng.corner[0] < 160, 'tools: the gray ground is gray in the saved sheet', { wh, corner: sheetPng && sheetPng.corner });
  const c3 = await finishPose(page);
  t.check(c3 && pctOf(c3) >= 65 && c3.grade !== 'Nothing drawn', 'tools: white-pencil marks on a gray ground count (a traced drawing earns at least three stars)', c3 && { pct: pctOf(c3), grade: c3.grade });
  mem.pose3 = c3;
  // ---- pose 4: the paper turned to landscape, zoomed in
  t.check(await nextPose(page, 4), 'tools: pose 4 comes');
  const keptGray = await page.evaluate(() => document.querySelector('#fs-root [data-ground="gray"]').getAttribute('aria-pressed'));
  await click(page, '#fs-orient');
  const land = await page.evaluate(() => ({ status: document.getElementById('fs-status').textContent, size: window.FigureStudy.studio.paperSize() }));
  t.check(/ · 1200 × 900$/.test(land.status) && land.size.w === 1200 && land.size.h === 900, 'tools: Turn the paper makes the sheet landscape (1200 × 900)', land);
  await click(page, '#fs-viewBtn');
  await range(page, '#fs-zoom', 400);
  await page.evaluate(() => window.FigureStudy.studio.closeSheets());
  const z = await page.evaluate(() => { const s = document.getElementById('fs-stage').getBoundingClientRect(), p = document.getElementById('fs-paper').getBoundingClientRect(); return { cx: s.left + s.width / 2, cy: s.top + s.height / 2, p: { x: p.left, y: p.top, w: p.width, h: p.height }, out: document.getElementById('fs-zoomOut').textContent }; });
  await page.mouse.move(z.cx - 40, z.cy + 10); await page.mouse.down(); await page.mouse.move(z.cx + 40, z.cy + 10, { steps: 6 }); await page.mouse.up();
  const where = await page.evaluate(() => { const c = document.getElementById('fs-paper'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { const x = (i / 4) % c.width, y = Math.floor(i / 4 / c.width); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, n: x1 - x0 }; });
  const wantX = (z.cx - z.p.x) / z.p.w * 1200, wantY = (z.cy + 10 - z.p.y) / z.p.h * 900;
  t.check(z.out === '400%' && where.n > 10 && Math.abs(where.x - wantX) < 36 && Math.abs(where.y - wantY) < 36, 'tools: at 400% zoom a stroke lands under the pointer', { where, wantX, wantY, zoom: z.out });
  await click(page, '#fs-fitBtn'); await click(page, '#fs-undo');
  t.check((await inked(page, '#fs-paper')) === 0, 'tools: Fit and Undo bring the zoomed sheet back to blank');
  await traceParts(page);
  const c4 = await finishPose(page);
  t.check(c4 && pctOf(c4) >= 65 && c4.grade !== 'Nothing drawn', 'tools: a drawing traced on the turned paper earns at least three stars', c4 && { pct: pctOf(c4) });
  const cvs = await page.evaluate(() => { const c = document.getElementById('fig-drawing'); return [c.width, c.height]; });
  t.check(cvs[0] === 600 && cvs[1] === 450, 'tools: the card\'s drawing of a landscape sheet is 600 × 450', cvs);
  mem.landscape = c4;
  // ---- pose 5: a mix locked in the class
  t.check(await nextPose(page, 5), 'tools: pose 5 comes');
  const keptTurn = await page.evaluate(() => window.FigureStudy.studio.paperSize());
  t.note(`pose 5 began with the paper still ${keptTurn.w} × ${keptTurn.h} and the ground gray=${keptGray}: the sheet's turn and ground carry over, only the marks are fresh`);
  if (keptTurn.w > keptTurn.h) await click(page, '#fs-orient');
  await click(page, R('[data-ground="raw"]'));
  await click(page, '#fs-colorBtn');
  await click(page, '#fs-paints li:nth-child(3) button'); await click(page, '#fs-paints li:nth-child(5) button');
  const well = await text(page, '#fs-wellParts');
  await click(page, '#fs-lock');
  const kept = await storageGet(page, MIXES), studios = await storageGet(page, 'portrait-value-studio.paintMixes');
  let keptParts = null; try { keptParts = JSON.parse(kept); } catch (e) { /* not JSON */ }
  t.check(Array.isArray(keptParts) && keptParts.length === 1 && keptParts[0].parts.length === 2 && studios === null, 'paints: a mix locked in during a class is kept under figureMixes, and the Studio\'s own key (paintMixes) is untouched', { kept, studios, well });
  mem.mix = keptParts && keptParts[0];
  await click(page, '#fs-brushBtn'); await click(page, R('[data-brush="round"]'));
  await range(page, '#fs-roundSize', 8);
  await traceParts(page);
  const col = await page.evaluate(() => { const c = document.getElementById('fs-paper'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let any = 0, colored = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { any++; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 25) colored++; } return { any, colored }; });
  const c5 = await finishPose(page);
  t.check(col.any > 500 && col.colored > col.any * 0.8 && c5 && pctOf(c5) >= 65, 'paints: a stroke painted with the locked mix is colored on the paper and scores like any other mark', { col, pct: pctOf(c5) });
  mem.urls = await page.evaluate(() => window.FigureStudy.state().results.map((r) => r.image));
  await clean(t, page, 'tools in a class');
}
// the review of that class: Save as PNG for each, with the gesture shown and hidden; then a second class, which lets the first one go
async function toolsReviewBlock(t, page, mem) {
  await guardOver(page); await click(page, '#fig-stop');
  const rv = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, cards: [...document.querySelectorAll('#fig-cards canvas')].map((c) => [c.width, c.height]), titles: [...document.querySelectorAll('#fig-cards figcaption strong')].map((e) => e.textContent) }));
  t.check(rv.review && rv.cards.length === 3 && rv.cards[0].join('x') === '450x600' && rv.cards[1].join('x') === '600x450' && rv.cards[2].join('x') === '450x600', 'review: three drawings (poses 3, 4 and 5; the two nothing-drawn ones are left out), the landscape one drawn landscape', rv);
  const shown = await downloadFile(page, '#fig-cards .fig-card:nth-child(1) button');
  const f1 = shown && await pngFacts(page, shown.buf);
  t.check(shown && /^figure-1-[a-z-]+\.png$/.test(shown.name) && f1 && f1.w === 900 && f1.h === 1200, 'review: Save as PNG is the full 900 × 1200 sheet, not the half-size card', { name: shown && shown.name, f1 });
  t.check(f1 && f1.near.bones > 300 && f1.near.action > 100 && f1.near.tilt > 50 && f1.tones > 50, 'review: the saved PNG holds the gesture (stick figure, line of action, tilt lines) over the textured paper', f1);
  t.check(f1 && f1.corner[0] > 100 && f1.corner[0] < 160, 'review: the saved PNG keeps the gray ground the drawing was made on', f1 && f1.corner);
  const land = await downloadFile(page, '#fig-cards .fig-card:nth-child(2) button');
  const f2 = land && await pngFacts(page, land.buf);
  t.check(f2 && f2.w === 1200 && f2.h === 900 && f2.near.bones > 300, 'review: the landscape drawing saves as 1200 × 900 with its gesture', { name: land && land.name, f2 });
  await click(page, '[data-fig-gesture="0"]');
  await page.waitForFunction(() => document.querySelector('[data-fig-gesture="0"]').getAttribute('aria-pressed') === 'true', null, { timeout: 3000 }).catch(() => null);
  const hidden = await downloadFile(page, '#fig-cards .fig-card:nth-child(1) button');
  const fh = hidden && await pngFacts(page, hidden.buf);
  t.check(fh && fh.w === 900 && fh.h === 1200 && fh.near.action === 0 && fh.near.bones === 0 && fh.near.tilt === 0 && fh.near.miss === 0 && fh.tones > 50, 'review: with the gesture hidden the saved PNG has none of it in it (only the drawing, still on its paper)', fh);
  await click(page, '[data-fig-gesture="1"]');
  // a second class lets the first one's pictures go (the page keeps one class's drawings)
  const poseThumbs = await page.evaluate(() => [...document.querySelectorAll('#fig-poses img')].map((i) => i.src));
  const alive = (urls) => page.evaluate((urls) => Promise.all(urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u; }))), urls);
  const before = await alive([...mem.urls.filter(Boolean), ...poseThumbs.slice(0, 3)]);
  await click(page, '#fig-again');
  t.check(await poseShown(page, 1), 'review: Draw again starts the class again');
  await traceParts(page);
  const second = await finishPose(page);
  await guardOver(page); await click(page, '#fig-stop');
  const cards2 = await page.evaluate(() => document.querySelectorAll('#fig-cards .fig-card').length);
  const after = await alive(mem.urls.filter(Boolean));
  dropProbeErrors(page);
  t.check(before.every(Boolean) && cards2 === 1 && second && after.every((x) => x === false), 'the class before is let go when the next class ends: its drawings\' pictures can no longer be loaded (the page keeps one class)', { before, after, cards2 });
  await page.waitForFunction((old) => [...document.querySelectorAll('#fig-poses img')].every((i) => i.src.startsWith('blob:') && !old.includes(i.src)), poseThumbs, { timeout: 40000 }).catch(() => null);
  const thumbs = await page.evaluate((old) => { const imgs = [...document.querySelectorAll('#fig-poses img')]; return { n: imgs.length, fresh: imgs.filter((i) => i.src.startsWith('blob:') && !old.includes(i.src)).length }; }, poseThumbs);
  t.check(thumbs.n === 30 && thumbs.fresh === 30, 'after a class the pose pictures are drawn again and the old ones replaced (30 fresh pictures)', thumbs);
  const oldGone = await alive(poseThumbs.slice(0, 5));
  dropProbeErrors(page);
  t.check(oldGone.every((x) => x === false), 'the pose pictures replaced are let go (their old Blob addresses load nothing)', oldGone);
  await clean(t, page, 'tools review');
}

// ================= M. the clock in orderings the first blocks did not try =================
// README: "Pause holds it (the button turns to Resume), and leaving the tab or the page pauses it too"; "Timed gives each pose 10 s, 30 s,
// 1 min, 5 min or 10 min ... The last stretch of the clock turns red (the last fifth of a short pose, at least 3 seconds; the last 30
// seconds of a long one)"; "Relaxed ... its clock counts up the time on each pose, and stops while the page is hidden"; "the next pose's
// picture is drawn while you work on this one"
// the time the pose has used and what is left, from the class's own books (ms)
const usedOf = (page) => page.evaluate(() => { const c = window.FigureStudy.state(); return c.used + (c.running ? performance.now() - c.from : 0); });
// move the page's clock so that this many seconds are left on a timed pose
async function setLeft(page, secs, leftSecs) { const used = await usedOf(page); await skewBy(page, secs * 1000 - leftSecs * 1000 - used); }
const clockText = (page) => page.evaluate(() => document.getElementById('fig-clock').textContent);
const waitClock = (page, want, low = null) => page.waitForFunction(([want, low]) => { const c = document.getElementById('fig-clock'); return c.textContent === want && (low === null || c.classList.contains('is-low') === low); }, [want, low], { timeout: 5000 }).then(() => true).catch(() => false);
async function clockBlock(t, page) {
  await toastLog(page);
  await renderFrame(page).evaluate(() => { window.__renders = []; addEventListener('message', (e) => { if (e.data && e.data.type === 'pose-and-light:render') window.__renders.push(e.data.id); }); });
  // ---- the next pose's picture is drawn while you work on this one
  t.check(await startClass(page, { ids: ['stand', 'relaxed'] }), 'clock: a relaxed class on two poses starts');
  await renderFrame(page).waitForFunction(() => window.__renders.length >= 2, null, { timeout: 30000 }).catch(() => null);
  const pre = await page.evaluate(() => { const c = window.FigureStudy.state(); return { id: c.id, next: c.next, pool: c.pool }; });
  const sent = await renderFrame(page).evaluate(() => window.__renders.slice());
  t.check(pre.next && pre.next !== pre.id && pre.pool.includes(pre.next) && sent.includes(pre.id) && sent.includes(pre.next), 'prefetch: while pose 1 is being drawn on, the picture of the pose after it has already been asked for', { pre, sent });
  // ---- Relaxed: leaving the tab stops the clock, coming back runs it again (no button), and the card's time is the clock's
  await page.waitForFunction(() => document.getElementById('fig-clock').textContent !== '0:00', null, { timeout: 5000 }).catch(() => null);
  await traceParts(page, ['spine']);
  await tab(page, 'study');
  const away = await stateOf(page), usedAway = await usedOf(page);
  await sleep(1200); // (a stopped clock has no condition to wait on)
  const usedLater = await usedOf(page);
  await tab(page, 'figure');
  const back = await stateOf(page), cb = await clockState(page);
  t.check(away && !away.running && back && back.running && cb.pauseHidden && !cb.paused, 'relaxed: leaving the tab stops the clock; coming back runs it again with no button to press', { away, back, pauseHidden: cb.pauseHidden });
  t.check(usedLater === usedAway, 'relaxed: no time is counted on the pose while another tab is open (1.2 s away, the time used did not move)', { usedAway, usedLater });
  await finishPose(page);
  const atDone = await clockText(page);
  await guardOver(page);
  t.check(await nextPose(page, 2), 'clock: Next pose brings pose 2');
  const dup = await renderFrame(page).evaluate(() => window.__renders.slice());
  const pose2 = await page.evaluate(() => window.FigureStudy.state().id);
  t.check(pose2 === pre.next && dup.filter((x) => x === pose2).length === 1, 'prefetch: pose 2 is the pose that was drawn ahead, and it was not drawn a second time when its turn came', { pose2, next: pre.next, renders: dup });
  await traceParts(page, ['spine']);
  await finishPose(page);
  await guardOver(page); await click(page, '#fig-stop');
  const times = await page.evaluate(() => [...document.querySelectorAll('#fig-cards figcaption span')].map((e) => e.textContent));
  const sec = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
  t.check(times.length === 2 && Math.abs(sec(times[0]) - sec(atDone)) <= 1, 'relaxed: the time on the review card is the clock\'s at Done', { times, atDone });
  // ---- Timed 30 s: Done while the clock is held by leaving the tab, then Next pose
  t.check(await startClass(page, { timed: 30, ids: ['stand', 'relaxed'] }), 'clock: a timed class (30 s) starts');
  await tab(page, 'study'); await tab(page, 'figure');
  const held1 = await stateOf(page), hc = await clockState(page);
  t.check(held1 && held1.held && !held1.running && hc.pauseText === 'Resume', 'ordering: left the tab and came back: the clock is held and offers Resume', { held1, pause: hc.pauseText });
  t.check(await endPose(page), 'ordering: Done is answered while the clock is held');
  t.check(await nextPose(page, 2), 'ordering: Next pose brings pose 2');
  const s2 = await stateOf(page), c2 = await clockState(page);
  await sleep(1500); // (a clock that should not run has no condition to wait on)
  const c2b = await clockState(page);
  const runs = s2 && s2.running && c2.pauseText === 'Pause';
  t.check(runs || c2.pauseText === 'Resume', 'ordering: the held clock is shown as held (Resume offered), not left running or silently stopped', { s2, c2: c2.clock, pause: c2.pauseText });
  t.check(runs, 'ordering: after Done on a held pose, Next pose starts the next pose\'s clock (README: Next pose starts the next pose\'s clock)', { running: s2 && s2.running, held: s2 && s2.held, clock: c2.clock, after1500ms: c2b.clock, pause: c2.pauseText });
  if (!runs) t.finding({ title: 'Next pose on a Timed pose that was held (Pause, or leaving the tab) starts the next pose with its clock stopped', severity: 'low', steps: 'Figure study > Timed > 30 s > Start drawing. Open another tab (Study) and come back, or press Pause: the button reads Resume. Do not press Resume: press Done, then Next pose.', expected: 'README: "Next pose starts the next pose\'s clock": pose 2 shows Pause and counts down from its own 30 s.', actual: `Pose 2 is shown with the clock at ${c2.clock} not running, the button still reading "${c2.pauseText}" and no time passing (${c2b.clock} 1.5 s later) until the visitor presses Resume; the pose is untimed meanwhile.`, cause: 'js/figure.js: the Next pose click handler no longer clears cls.held (hold(false)), which showPose reads in run(!c.held && ...); cls.held is otherwise cleared only in startClass.' });
  await toSetup(page);
  await clean(t, page, 'clock orderings');
}

// the clocks of 1, 5 and 10 minutes, which no wait could afford: the page's own clock is moved on (performance.now), and what the
// README says of the red stretch and of the end is read at each step
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
async function longClocksBlock(t, page) {
  await skewClock(page);
  const spy = await chimeSpy(page);
  for (const [secs, name] of [[60, '1 min'], [300, '5 min'], [600, '10 min']]) {
    const red = Math.min(30, Math.max(3, secs * 0.2));
    t.check(await startClass(page, { timed: secs, ids: ['stand', 'relaxed'] }), `${name}: the class starts`);
    const c0 = await clockState(page);
    t.check(c0.clock === fmtClock(secs) && c0.label === 'Time left' && !c0.low, `${name}: the clock opens at ${fmtClock(secs)} and is not red`, c0);
    await setLeft(page, secs, red + 1.5);
    const calm = await page.waitForFunction((red) => { const c = document.getElementById('fig-clock'); const [m, s] = c.textContent.split(':').map(Number); const left = m * 60 + s; return left >= red + 1 && left <= red + 2 && !c.classList.contains('is-low'); }, red, { timeout: 5000 }).then(() => true).catch(() => false);
    t.check(calm, `${name}: ${red + 1} to ${red + 2} s left, the clock is still not red`, await clockState(page));
    await setLeft(page, secs, red - 0.3);
    const lit = await waitClock(page, fmtClock(red), true);
    t.check(lit, `${name}: the clock turns red at ${fmtClock(red)} (${secs >= 150 ? 'the last 30 seconds of a long pose' : 'the last fifth of a short pose, at least 3 s'})`, await clockState(page));
    if (secs === 600) {
      await setLeft(page, secs, 595);
      t.check(await waitClock(page, '9:55', false), '10 min: past 9:59 the clock reads m:ss (9:55), calm again when more than 30 s are left', await clockState(page));
      const before = await chimes(page);
      await setLeft(page, secs, 0.4);
      t.check(await cardUp(page, 8000), '10 min: the time runs out and the card comes by itself');
      const tc = { ...(await cardState(page)), chimes: await chimes(page), clock: (await clockState(page)).clock };
      t.check(tc.kicker === 'Time’s up!' && tc.chimes === before + 1 && tc.clock === '0:00' && tc.grade === 'Nothing drawn', '10 min: Time’s up! with one chime at the end of a long pose, the clock at 0:00', { kicker: tc.kicker, chimes: [before, tc.chimes], clock: tc.clock });
    }
    await toSetup(page);
    await unskew(page);
  }
  t.check(spy, 'the games\' sound switch was on for the chime');
  await clean(t, page, 'long clocks');
}
// Pause, or leaving the tab, while the next pose's picture is still on its way
async function holdDuringLoadBlock(t, page) {
  t.check(await startClass(page, { timed: 30, ids: ['stand', 'relaxed'] }), 'hold during a load: a timed class (30 s) starts');
  await endPose(page);
  await guardOver(page);
  // Pause pressed in the same instant as Next pose: the pose arrives held
  await page.evaluate(() => { document.getElementById('fig-nextPose').click(); document.getElementById('fig-pause').click(); });
  t.check(await poseShown(page, 2), 'hold during a load: pose 2 comes');
  const a = await stateOf(page), ca = await clockState(page);
  await sleep(1500); // (a held clock has no condition to wait on)
  const cb = await clockState(page);
  t.check(a && a.held && !a.running && ca.clock === '0:30' && cb.clock === '0:30' && ca.pauseText === 'Resume', 'hold during a load: Pause pressed as Next pose was tapped: the pose arrives with the clock held at 0:30 and Resume offered', { a, ca: ca.clock, cb: cb.clock, pause: ca.pauseText });
  await click(page, '#fig-pause');
  t.check(await waitClock(page, '0:29') || await waitClock(page, '0:28'), 'hold during a load: Resume starts the clock', await clockState(page));
  // the other tab opened in the same instant: the pose arrives held, and still held back on the tab
  await endPose(page); await guardOver(page);
  await page.evaluate(() => { document.getElementById('fig-nextPose').click(); document.querySelector('[data-tab="study"]').click(); });
  t.check(await poseShown(page, 3), 'hold during a load: pose 3 comes (while another tab is open)');
  const b = await stateOf(page);
  await tab(page, 'figure');
  const b2 = await stateOf(page), cc = await clockState(page);
  t.check(b && b.held && !b.running && b2 && b2.held && !b2.running && cc.clock === '0:30' && cc.pauseText === 'Resume', 'hold during a load: the tab left in the same instant: the clock does not start when the pose arrives, nor when the tab is back (it waits for Resume)', { b, b2, clock: cc.clock, pause: cc.pauseText });
  await toSetup(page);
  await clean(t, page, 'hold during a load');
}

// ================= N. stopping the class in orders the first blocks did not try =================
// README: "When the class stops (Stop class on the card, or ✕ twice during a pose), every drawing comes back"; "The card's buttons wait 0.6 s"
async function stopOrderBlock(t, page) {
  await toastLog(page);
  // ✕ twice in the instant after Next pose, while the next pose is still being drawn
  t.check(await startClass(page, { ids: ['stand', 'relaxed'] }), 'stop: a relaxed class starts');
  await traceParts(page, ['spine']);
  t.check(await endPose(page), 'stop: a drawing is done');
  await guardOver(page);
  const logged = (await toasts(page)).length;
  const out = await page.evaluate(() => { document.getElementById('fig-nextPose').click(); document.getElementById('fig-end').click(); document.getElementById('fig-end').click(); return { cls: !!window.FigureStudy.state(), review: !document.getElementById('fig-review').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length }; });
  t.check(!out.cls && out.review && out.cards === 1, '✕ twice the moment Next pose was tapped ends the class at once, and the review holds the one drawing', out);
  await sleep(2000); // (the pose that was being drawn arrives meanwhile; nothing can be waited on for a thing that must not happen)
  const late = await page.evaluate(() => ({ cls: !!window.FigureStudy.state(), review: !document.getElementById('fig-review').hidden, setup: !document.getElementById('fig-setup').hidden, draw: !document.querySelector('.fig-studio').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length, say: document.getElementById('fig-say').textContent }));
  t.check(!late.cls && late.review && !late.setup && !late.draw && late.cards === 1 && !/^Pose 2: /.test(late.say), 'stop: the pose that was on its way does not bring the finished class back to life', late);
  t.check((await toasts(page)).slice(logged).every((m) => /^(Tap ✕ again to stop the class|The class is over)$/.test(m)), 'stop: nothing but the stop messages were said', (await toasts(page)).slice(logged));
  // Start tapped twice in a row: one class
  await click(page, '#fig-new');
  await onlyPoses(page, ['stand', 'relaxed']);
  await page.evaluate(() => { const b = document.getElementById('fig-start'); b.click(); b.click(); });
  t.check(await poseShown(page, 1), 'stop: Start tapped twice in a row starts a class');
  await sleep(1200); // (a second class would show as a second pose 1; nothing to wait on)
  const dbl = await page.evaluate(() => ({ n: window.FigureStudy.state().n, say: document.getElementById('fig-say').textContent, count: document.getElementById('fig-count').textContent }));
  t.check(dbl.n === 1 && dbl.count === 'Pose 1' && /^Pose 1: /.test(dbl.say), 'stop: ... and it is one class, at pose 1', dbl);
  // a very short stroke is not a drawing; a modest line is
  await stroke(page, '#fs-paper', [[0.5, 0.5], [0.52, 0.51]]);
  const tiny = await inked(page, '#fs-paper');
  const c1 = await finishPose(page);
  t.check(c1 && c1.grade === 'Nothing drawn' && c1.pct === '0', 'a stroke 2% of the sheet long is "Nothing drawn", like a blank sheet', c1 && { tiny, grade: c1.grade, pct: c1.pct });
  t.check(await nextPose(page, 2), 'stop: pose 2 comes');
  await stroke(page, '#fs-paper', [[0.3, 0.4], [0.5, 0.45]]);
  const modest = await inked(page, '#fs-paper');
  const c2 = await finishPose(page);
  t.check(c2 && c2.grade !== 'Nothing drawn', 'a line 20% of the sheet long is a drawing (it has a score and a word, if only "Keep drawing")', c2 && { modest, grade: c2.grade, pct: c2.pct });
  t.note(`the least that counts as a drawing is 25 cells of a 240-wide grid over the sheet: a 4 px charcoal stroke of 2% of the sheet inked ${tiny} sample points and was "Nothing drawn", one of 20% inked ${modest} and was scored`);
  await guardOver(page); await click(page, '#fig-stop');
  const rv = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length }));
  t.check(rv.review && rv.cards === 1, 'the review leaves out the nothing-drawn pose and keeps the other', rv);
  await clean(t, page, 'stop orderings');
}
// the keyboard: Enter on Done, a held Enter on Next pose, Ctrl+Z and Escape on the card, Ctrl+Z on the review
async function keyboardBlock(t, page) {
  await skewClock(page);
  t.check(await startClass(page, { ids: ['stand', 'relaxed'] }), 'keyboard: a relaxed class starts');
  await traceParts(page, ['spine']);
  await page.focus('#fig-done');
  await doneGuardOver(page);
  await page.keyboard.press('Enter');
  t.check(await cardUp(page), 'keyboard: Enter on Done ends the pose');
  await cardSettled(page);
  await skewBy(page, -8000); // (the card's 0.6 s guard held open, so the keys below cannot race it)
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  const held = await page.evaluate(() => { const c = window.FigureStudy.state(); return { n: c.n, results: c.results.length, card: !document.getElementById('fig-result').hidden, focus: document.activeElement && document.activeElement.id }; });
  t.check(held.n === 1 && held.results === 1 && held.card && held.focus === 'fig-nextPose', 'keyboard: a held Enter lands on Next pose (focused by the card) and is not answered inside the guard', held);
  const before = await cardState(page);
  await page.keyboard.press('Control+z'); await page.keyboard.press('Escape');
  const after = await cardState(page);
  t.check(after.shown && before.kicker === after.kicker && before.pct === after.pct && before.grade === after.grade && JSON.stringify(before.tips) === JSON.stringify(after.tips) && after.inert, 'keyboard: Ctrl+Z and Escape on the card change nothing (the studio behind stays inert)', { before: before.pct, after: after.pct });
  await skewBy(page, 8700);
  await page.keyboard.press('Enter');
  t.check(await poseShown(page, 2), 'keyboard: once the guard is over, Enter on the focused Next pose brings pose 2');
  await traceParts(page, ['spine']);
  await finishPose(page); await guardOver(page); await click(page, '#fig-stop');
  await page.keyboard.press('Control+z');
  const rv = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length, cls: !!window.FigureStudy.state() }));
  t.check(rv.review && rv.cards === 2 && !rv.cls, 'keyboard: Ctrl+Z on the review changes nothing', rv);
  await unskew(page);
  await clean(t, page, 'keyboard');
}
// a new photo dropped or pasted while a pose is being drawn goes to the Study tab; the pose stays the reference
async function dropDuringPoseBlock(t, page) {
  t.check(await startClass(page, { timed: 30, ids: ['stand', 'relaxed'] }), 'drop: a timed class (30 s) starts');
  const name = await text(page, '#fs-refName');
  const pasted = await makeImage(page, { width: 500, height: 700, name: 'pasted-photo.png' });
  const dropped = await makeImage(page, { width: 520, height: 680, name: 'dropped-photo.png' });
  await pasteFile(page, pasted);
  await dropFiles(page, 'body', [dropped]);
  // (the dropped photo is read after the pasted one is prepared: the work is over once it is the source and Updating… is down)
  await page.waitForFunction(() => { const b = document.querySelector('#source strong'); return !!b && b.textContent === 'dropped-photo.png' && document.getElementById('busy').hidden; }, null, { timeout: 30000 }).catch(() => null);
  const s = await page.evaluate(() => { const c = window.FigureStudy.state(); return { source: (document.querySelector('#source strong') || {}).textContent, ref: document.getElementById('fs-refName').textContent, running: c.running, held: c.held, shot: !!c.shot, draw: !document.querySelector('.fig-studio').hidden, tab: window.Studio.tab(), busy: !document.getElementById('busy').hidden }; });
  t.check(s.ref === name && s.running && !s.held && s.shot && s.draw && s.tab === 'figure' && !s.busy, 'drop: a photo pasted and another dropped during a pose leave the pose as the reference, the clock running, the class on screen', { s, name });
  await stroke(page, '#fs-paper', [[0.3, 0.3], [0.6, 0.6]]);
  t.check((await inked(page, '#fs-paper')) > 50, 'drop: the paper still takes a stroke');
  await tab(page, 'study');
  const src = await text(page, '#source');
  t.check(/dropped-photo\.png/.test(src || ''), 'drop: the Study tab holds the dropped photo', src);
  await tab(page, 'figure');
  await toSetup(page);
  await clean(t, page, 'drop during a pose');
}

// ================= O. the first visit's long page: the frame loaded late, the Studio's paper kept apart, a render that fails =================
// the Studio's saved painting, as the database holds it (the object store the Studio and the class's copy would both write to)
const idbInfo = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('portrait-value-studio');
  r.onerror = () => resolve(null);
  r.onsuccess = () => {
    const db = r.result;
    try {
      const tx = db.transaction('studio'), st = tx.objectStore('studio'), keys = st.getAllKeys(), rec = st.get('painting');
      tx.oncomplete = () => { db.close(); resolve({ keys: keys.result, savedAt: rec.result && rec.result.savedAt, w: rec.result && rec.result.w, h: rec.result && rec.result.h }); };
      tx.onerror = () => { db.close(); resolve(null); };
    } catch (e) { db.close(); resolve({ keys: [], err: String(e) }); }
  };
}));
// how much the Studio's paper holds: pixels with any ink, and the same for its tone
const paperFacts = (page) => page.evaluate(() => { const c = document.getElementById('ps-paper'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let any = 0, sum = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { any++; sum += d[i + 3]; } return { w: c.width, h: c.height, any, sum }; });
async function openingBlock(t, page, mem) {
  await watch(page); await toastLog(page);
  // the hidden frame is not loaded for a visitor who never opens the tab
  const pre = await page.evaluate(() => ({ src: document.getElementById('fig-render').getAttribute('src'), data: document.getElementById('fig-render').dataset.src }));
  t.check(pre.src === null && /render=1/.test(pre.data || '') && !renderFrame(page), 'the hidden pose-drawing frame is not loaded until the Figure study tab first opens', pre);
  // the Studio's painting, saved in the browser
  await tab(page, 'paint');
  await stroke(page, '#ps-paper', [[0.2, 0.3], [0.8, 0.35], [0.5, 0.7]], { steps: 10 });
  await stroke(page, '#ps-paper', [[0.3, 0.8], [0.7, 0.2]], { steps: 10 });
  let saved = false;
  for (let i = 0; i < 30 && !saved; i++) { const db = await idbInfo(page); saved = !!(db && db.savedAt); if (!saved) await sleep(500); }
  mem.studio = { ...(await paperFacts(page)), db: await idbInfo(page) };
  t.check(saved && mem.studio.any > 1000 && mem.studio.db && mem.studio.db.keys.length === 1 && mem.studio.db.keys[0] === 'painting', 'the Studio keeps its painting in the browser (one record, "painting") a moment after the strokes', mem.studio);
  // Figure study opened, and Start pressed the instant it enables, before the pictures have streamed in
  await tab(page, 'figure', { wait: false });
  const frameNow = await page.evaluate(() => { const f = document.getElementById('fig-render'), r = f.getBoundingClientRect(); return { src: f.getAttribute('src'), left: r.left, vis: getComputedStyle(f).visibility, events: getComputedStyle(f).pointerEvents, hidden: f.getAttribute('aria-hidden'), tab: f.tabIndex }; });
  t.check(/pose\.html\?render=1$/.test(frameNow.src || '') && frameNow.left < -1000 && frameNow.vis === 'hidden' && frameNow.events === 'none' && frameNow.hidden === 'true' && frameNow.tab === -1, 'opening the tab loads pose.html?render=1 in a frame that is off screen, invisible, unreachable and hidden from assistive tech', frameNow);
  const setupNow = await setupState(page);
  t.check(/Setting up the poses/.test(setupNow.note) && setupNow.start && setupNow.allHidden, 'while the poses are being set up the tab says so, Start is off and Take them all out is not offered', { note: setupNow.note, start: setupNow.start, allHidden: setupNow.allHidden });
  await page.waitForFunction(() => !document.getElementById('fig-start').disabled, null, { timeout: 40000 }).catch(() => null);
  const early = await page.evaluate(() => ({ pics: [...document.querySelectorAll('#fig-poses [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length, total: document.querySelectorAll('#fig-poses [data-pose-id]').length }));
  await click(page, '#fig-start');
  t.check(await poseShown(page, 1), 'Start pressed the moment it enables (while the pictures are still streaming in) starts a class on the whole library');
  const st = await page.evaluate(() => { const c = window.FigureStudy.state(); return { id: c.id, next: c.next, pool: c.pool.length }; });
  mem.used = [st.id, st.next];
  t.check(st.pool === 30, 'the early class draws on all 30 poses', st);
  t.note(`Start was pressed with ${early.pics} of ${early.total} pose pictures in`);
  await stopTwice(page);
  t.check((await setupState(page)).setup, 'the early class (nothing drawn) goes back to the setup');
  const pics = await page.waitForFunction(() => { const b = document.querySelectorAll('#fig-poses [data-pose-id]'); return b.length === 30 && [...b].every((x) => x.querySelector('img').src.startsWith('blob:')); }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  t.check(pics, 'every pose still gets its picture after the class was started early (30 of 30)', await setupState(page));
  await clean(t, page, 'opening');
}
// A pose's picture failing mid-class (a lost WebGL context in the drawing frame): the skip, the three strikes, the one-pose class
async function renderFailureBlock(t, page, mem) {
  const frame = renderFrame(page);
  const fresh = POOL_ALL.filter((id) => !mem.used.includes(id));
  const lose = () => frame.evaluate(() => { const c = document.getElementById('view'), gl = c.getContext('webgl2') || c.getContext('webgl'); window.__restored = false; c.addEventListener('webglcontextrestored', () => { window.__restored = true; }); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); return gl.isContextLost(); });
  const gone = await lose();
  t.check(gone === true, 'the drawing frame\'s WebGL context is lost (as on a phone whose GPU resets)');
  await toSetup(page);
  const mark = (await toasts(page)).length;
  await onlyPoses(page, fresh.slice(0, 4));
  await click(page, '#fig-start');
  const over = await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 30000 }).then(() => true).catch(() => false);
  const said = (await toasts(page)).slice(mark);
  const skips = said.filter((m) => / could not be drawn; on to the next pose$/.test(m)), ends = said.filter((m) => m === 'The poses could not be drawn, so the class is over');
  const s = await setupState(page);
  t.check(over && skips.length === 2 && ends.length === 1 && said[said.length - 1] === ends[0], 'render failing: two poses are skipped with "X could not be drawn; on to the next pose", the third failure ends the class with "The poses could not be drawn, so the class is over"', said);
  t.check(s.setup && !s.review && !s.draw && !s.start, 'render failing: the class lands back on the setup (nothing was drawn), Start still on', { setup: s.setup, draw: s.draw, start: s.start });
  // a class of one pose cannot go on to another: it is over at the first failure
  const mark2 = (await toasts(page)).length;
  await onlyPoses(page, [fresh[5]]);
  await click(page, '#fig-start');
  await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 30000 }).catch(() => null);
  const said2 = (await toasts(page)).slice(mark2);
  t.check(said2.length >= 1 && said2.every((m) => m === 'The poses could not be drawn, so the class is over') && !(await stateOf(page)), 'render failing: a class of one pose is over at its first failure, with no "on to the next pose"', said2);
  // a timed class: nothing started, nothing rang
  await skewClock(page);
  const spy = await chimeSpy(page), ringing = await chimes(page);
  await click(page, '#fig-timed'); await click(page, '#fig-t10');
  await onlyPoses(page, [fresh[6]]);
  await click(page, '#fig-start');
  await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 30000 }).catch(() => null);
  await skewBy(page, 30000);
  const ranOn = { cls: await stateOf(page), chimes: await chimes(page) };
  await unskew(page);
  t.check(spy && !ranOn.cls && ranOn.chimes === ringing && (await setupState(page)).setup, 'render failing: a timed class that could not draw its pose starts no clock (30 s later: no class, no chime)', ranOn);
  // the context comes back: the next class draws again
  await frame.evaluate(() => { window.__lose.restoreContext(); });
  const back = await frame.waitForFunction(() => window.__restored === true, null, { timeout: 15000 }).then(() => true).catch(() => false);
  t.check(back, 'the drawing frame\'s WebGL context comes back');
  await click(page, '#fig-relaxed');
  t.check(await startClass(page, { ids: fresh.slice(7, 10) }), 'after the context is back a class draws its first pose again');
  await toSetup(page);
  await clean(t, page, 'a render that fails');
}
// the same pose id twice (one saved in Pose and light under a library pose's id): one tile, one pose
async function collisionBlock(t, page) {
  await page.evaluate(() => localStorage.setItem('pose-and-light.mine.v1', JSON.stringify([{ id: 'stand', p: {} }, { id: 'mine-gone', p: {} }])));
  await putAllBack(page);
  await bounceTab(page);
  await page.waitForFunction(() => document.querySelectorAll('#fig-poses [data-pose-id]').length === 31, null, { timeout: 20000 }).catch(() => null);
  const s = await page.evaluate(() => ({ stand: document.querySelectorAll('#fig-poses [data-pose-id="stand"]').length, total: document.querySelectorAll('#fig-poses [data-pose-id]').length, mix: document.getElementById('fig-mix').textContent, mine: [...document.querySelectorAll('#fig-poses [data-pose-id^="mine-"]')].map((b) => b.querySelector('.fig-pose-name').textContent) }));
  t.check(s.stand === 1 && s.total === 31 && s.mine.length === 1, 'a saved pose that shares a library pose\'s id gets no second tile (one "stand"; the other saved pose is added as "Your pose")', s);
  await click(page, '#fig-poses [data-pose-id="stand"]');
  const t1 = await setupState(page);
  t.check(t1.inClass.length === 30 && !t1.inClass.includes('stand') && /^30 of the 31 poses/.test(t1.mix), 'taking "stand" out takes out that one pose (30 of 31 left)', { n: t1.inClass.length, mix: t1.mix });
  await click(page, '#fig-poses [data-pose-id="stand"]');
  await page.evaluate(() => localStorage.removeItem('pose-and-light.mine.v1'));
  await bounceTab(page);
  await page.waitForFunction(() => document.querySelectorAll('#fig-poses [data-pose-id]').length === 30, null, { timeout: 20000 }).catch(() => null);
  t.check((await setupState(page)).poses === 30, 'with the saved poses gone the list is the 30 again');
  await clean(t, page, 'colliding ids');
}

// every pose back in the class; another tab and back (the list is asked for again), without waiting for the pictures
const putAllBack = (page) => page.evaluate(() => document.querySelectorAll('#fig-poses [data-pose-id]').forEach((b) => { if (b.getAttribute('aria-pressed') !== 'true') b.click(); }));
const bounceTab = (page) => page.evaluate(() => { document.querySelector('[data-tab="study"]').click(); document.querySelector('[data-tab="figure"]').click(); });

// The class never touched the Studio's painting; a reload brings the Studio's paper back as it was, the class's locked mix with it
// apart from the Studio's own; Forget my work then clears every key and the painting (README Privacy: what the site keeps)
async function reloadTailBlock(t, page, mem) {
  await toSetup(page);
  const keysBefore = await storageKeys(page);
  const poseKeys = await storageKeys(page, /^pose-and-light\./);
  t.check(poseKeys.length === 0, 'the render frame keeps nothing: after classes and pictures, no pose-and-light key was written (Pose and light itself never opened)', poseKeys);
  const dbNow = await idbInfo(page);
  t.check(dbNow && dbNow.keys.length === 1 && dbNow.keys[0] === 'painting' && dbNow.savedAt === mem.studio.db.savedAt, 'after the classes the Studio\'s saved painting is the record it was: still the only one, never saved over (the class\'s paper has autosave off)', { before: mem.studio.db, now: dbNow });
  await page.reload({ waitUntil: 'load' });
  await sleep(300);
  await tab(page, 'paint');
  const back = await page.waitForFunction((want) => { const c = document.getElementById('ps-paper'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let any = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) any++; return any > 0 && Math.abs(any - want) <= want * 0.01; }, mem.studio.any, { timeout: 20000 }).then(() => true).catch(() => false);
  const afterFacts = await paperFacts(page);
  t.check(back, 'after a reload the Studio\'s paper is the painting made before the classes (the same ink), not a class\'s drawing', { before: mem.studio.any, after: afterFacts.any });
  const mixesStudio = await page.evaluate(() => ({ n: document.querySelectorAll('#ps-mixes button').length, key: localStorage.getItem('portrait-value-studio.paintMixes') }));
  t.check(mixesStudio.n === 8 && mixesStudio.key === null, 'the Studio\'s own mixes are its eight starters; the mix locked in during a class is not among them', mixesStudio);
  await tab(page, 'figure');
  const s = await setupState(page);
  const kept = await page.evaluate(() => { const st = window.FigureStudy.studio.state; return { kept: st.mixes.filter((m) => !m.starter).map((m) => m.parts.map((p) => p.code + p.amount).join('+')), starters: st.mixes.filter((m) => m.starter).length }; });
  t.check(s.setup && !s.back && kept.starters === 8 && kept.kept.length === 1 && mem.mix && kept.kept[0] === mem.mix.parts.map((p) => p.code + p.amount).join('+'), 'after a reload the class opens on its setup, with the mix locked in last time kept beside the eight starters', { setup: s.setup, back: s.back, kept, locked: mem.mix });
  // Forget my work on this device (How to use): the class's settings and mixes, the Studio's painting, all of it
  await click(page, '#fig-timed'); await click(page, '#fig-t10');
  const changed = await storageGet(page, KEY);
  t.check(changed === '{"mode":"timed","secs":10,"out":[]}', 'the class set to Timed (10 s) is stored', changed);
  await tab(page, 'help');
  await click(page, '#forgetBtn');
  const armed = await text(page, '#forgetBtn');
  await Promise.all([page.waitForEvent('load', { timeout: 20000 }).catch(() => null), click(page, '#forgetBtn')]);
  await sleep(300);
  t.check(/Tap again/.test(armed || ''), 'Forget my work asks for a second tap', armed);
  const leftKeys = await storageKeys(page);
  t.check(leftKeys.length === 0, 'after Forget my work and the reload nothing is stored: no key of the site\'s is left (the visit drew its setup and wrote nothing)', leftKeys);
  await tab(page, 'figure');
  const f = await setupState(page);
  t.check(f.poses === 30 && !f.timed && f.inClass.length === 30 && f.stored === null && !f.back, 'after Forget the class is back to Relaxed with all 30 poses in, and nothing stored for it', { timed: f.timed, n: f.inClass.length, stored: f.stored });
  const keysAfter = await storageKeys(page);
  t.check(keysAfter.length === 0, 'drawing the setup after Forget wrote no key either (the page writes the class only once it differs from what it loaded)', keysAfter);
  const kept2 = await page.evaluate(() => window.FigureStudy.studio.state.mixes.filter((m) => !m.starter).length);
  t.check(kept2 === 0, 'Forget took the locked mix with it', kept2);
  await tab(page, 'paint');
  await sleep(500); // (a painting that should not come back has no condition to wait on)
  const gone = await paperFacts(page), dbEnd = await idbInfo(page);
  t.check(gone.any === 0 && dbEnd && dbEnd.keys.length === 0, 'Forget took the Studio\'s painting too (a blank paper, no record)', { any: gone.any, db: dbEnd });
  t.note(`keys written during the first visit's classes and tools (before Forget): ${keysBefore.join(', ') || 'none'}`);
  await clean(t, page, 'reload and Forget');
}
// Forget pressed in another tab of the site while a class is on: this tab starts over
async function forgetElsewhereBlock(t, site) {
  const page = await openPage(site);
  await figureUp(page);
  t.check(await startClass(page, { timed: 60, ids: ['stand', 'relaxed'] }), 'forget elsewhere: a timed class (1 min) is on');
  const other = await newTab(site, page, { url: '' });
  await tab(other, 'help');
  await click(other, '#forgetBtn');
  const reloaded = page.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
  await click(other, '#forgetBtn');
  t.check(await reloaded, 'forget elsewhere: pressing Forget my work in another tab reloads this tab (within a few seconds)');
  await sleep(300);
  const s = await page.evaluate(() => ({ cls: !!(window.FigureStudy && window.FigureStudy.state()), keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)) }));
  t.check(!s.cls && s.keys.length === 0, 'forget elsewhere: the class is gone and no key is left', s);
  await tab(page, 'figure');
  t.check((await setupState(page)).setup && (await setupState(page)).stored === null, 'forget elsewhere: this tab opens on a setup with nothing stored');
  await clean(t, page, 'forget elsewhere');
  await page.context().close();
}

// ================= P. pages of their own: assistive tech and the dark theme, a frame that never answers, game.js missing, a sandbox =================
// README "Accessibility"/page behaviour: aria-live, role=dialog, role=timer, aria-pressed throughout; prefers-reduced-motion skips the count-up
const quiet = (page) => page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#fig-result')), null, { timeout: 4000 }).catch(() => null);
async function accessibilityBlock(t, site) {
  const page = await openPage(site, { bypassCSP: true, url: '#figure' });
  try {
    const src = await page.evaluate(() => document.getElementById('fig-render').getAttribute('src'));
    t.check(/pose\.html\?render=1$/.test(src || ''), 'a page opened on #figure loads the hidden drawing frame at once, without a click', src);
    await tab(page, 'figure');
    await watch(page);
    const serious = (v) => v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
    const scan = async (label) => {
      const v = await axe(page);
      t.check(serious(v).length === 0, `axe, ${label}: no serious or critical violation`, serious(v));
      const rest = v.filter((x) => !serious([x]).length);
      if (rest.length) t.note(`axe, ${label}, lesser: ${rest.map((x) => `${x.id} (${x.impact}, ${x.count}: ${x.nodes.slice(0, 2).join(' ; ')})`).join('; ')}`);
    };
    await scan('the setup');
    t.check(await startClass(page, { ids: ['stand', 'relaxed'] }), 'axe: a class starts');
    await traceParts(page, ['spine', 'armR', 'armL']);
    await scan('a pose');
    t.check(await endPose(page), 'axe: Done shows the card');
    await cardSettled(page); await quiet(page);
    await scan('the card');
    await guardOver(page); await click(page, '#fig-stop');
    await scan('the review');
    // the dark theme and reduced motion, switched on in the page as a visitor's system would
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await scan('the review, dark');
    await click(page, '#fig-again');
    t.check(await poseShown(page, 1), 'dark: Draw again starts a class');
    await traceParts(page, ['spine', 'armR', 'armL', 'legR', 'legL', 'head']);
    await scan('a pose, dark');
    t.check(await endPose(page), 'dark: Done shows the card');
    const now = await cardState(page);
    const label = (/, (\d+)%/.exec(now.label || '') || [])[1];
    t.check(label !== undefined && now.pct === label && +label > 0, 'reduced motion: the percentage is on the card at once, with no count-up (it reads the number its label names)', { pct: now.pct, label: now.label });
    await quiet(page);
    await scan('the card, dark');
    const dark = await page.evaluate(() => { const cs = (id) => getComputedStyle(document.getElementById(id)); const bg = getComputedStyle(document.body).backgroundColor; return { bg, grade: cs('fig-grade').color, pct: cs('fig-pct').color, popup: cs('fig-popup').backgroundColor }; });
    t.check(dark.grade !== dark.popup && dark.pct !== dark.popup, 'dark: the grade and the percentage are not drawn in the card\'s own background color', dark);
    await guardOver(page); await click(page, '#fig-stop');
    await scan('the review, dark');
    // the phone on its side: 844 × 390
    await page.setViewportSize({ width: 844, height: 390 });
    await click(page, '#fig-new');
    t.check(await startClass(page, { timed: 30, ids: ['stand', 'relaxed'] }), 'landscape phone: a timed class starts');
    const lay = await page.evaluate(() => {
      const inV = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
      return { bar: inV('fig-bar'), clock: inV('fig-clock'), done: inV('fig-done'), end: inV('fig-end'), pause: inV('fig-pause'), paperH: Math.round(document.getElementById('fs-paper').getBoundingClientRect().height), paperVisible: inV('fs-paper'), hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    t.check(lay.bar && lay.clock && lay.done && lay.end && lay.pause && lay.paperH >= 200 && lay.hscroll <= 0, 'landscape phone: the bar, the clock, Pause, Done and ✕ are in view, the paper is at least 200 px tall, no sideways scroll', lay);
    await screenshot(page, 'figure-landscape-pose');
    await click(page, '#fs-colorBtn');
    const sheetOpen = await page.evaluate(() => !document.getElementById('fs-paintSheet').hidden);
    await stroke(page, '#fs-paper', [[0.45, 0.4], [0.55, 0.6]]);
    const sheetShut = await page.evaluate(() => document.getElementById('fs-paintSheet').hidden);
    t.check(sheetOpen && sheetShut && (await inked(page, '#fs-paper')) > 20, 'landscape phone: the Paints sheet is closed by the first stroke on the paper, which lands', { sheetOpen, sheetShut });
    await traceParts(page, ['spine']);
    t.check(await endPose(page), 'landscape phone: Done shows the card');
    await cardSettled(page); await quiet(page);
    const card = await page.evaluate(() => {
      const pop = document.getElementById('fig-popup'), before = pop.scrollTop;
      pop.scrollTop = pop.scrollHeight;
      const inV = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= -1 && r.bottom <= innerHeight + 1; };
      return { scrollable: pop.scrollHeight > pop.clientHeight, next: inV('fig-nextPose'), stop: inV('fig-stop'), popupFits: pop.getBoundingClientRect().bottom <= innerHeight + 1, hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, before };
    });
    t.check(card.next && card.stop && card.popupFits && card.hscroll <= 0, 'landscape phone: the card scrolls inside itself and Next pose and Stop class come within reach, with no sideways scroll', card);
    await screenshot(page, 'figure-landscape-card');
    await scan('the card, landscape phone');
    await toSetup(page);
    // the pose's reference must not hide the paper at the size a class opens it: on a phone upright and on its side
    for (const [w, h, label] of [[390, 844, 'a phone upright'], [844, 390, 'a phone on its side']]) {
      await page.setViewportSize({ width: w, height: h });
      t.check(await startClass(page, { ids: ['stand', 'relaxed'] }), `reference: a class starts on ${label}`);
      const rf = await refFacts(page);
      t.check(!rf.hidden && rf.covers < 0.6 && rf.tones > 40, `reference: on ${label} the pose picture covers ${Math.round(rf.covers * 100)}% of the paper (under 60%), so there is paper to draw on`, { covers: rf.covers, fig: rf.fig, paper: rf.paper });
      await toSetup(page);
    }
    await clean(t, page, 'accessibility, dark, landscape');
  } finally { await page.context().close(); }
}
// A frame that loads but never says it is ready (pose.html?render=1 answered 404): the 25 s note, Start off, the retry on coming back
async function silentFrameBlock(t, site) {
  const gone = site.base + 'pose.html?render=1';
  const page = await openPage(site, { notFound: [gone] });
  try {
    await page.clock.install();
    await tab(page, 'figure', { wait: false });
    const a = await setupState(page);
    t.check(/^Setting up the poses/.test(a.note) && a.start && a.allHidden && a.poses === 0, 'a frame that does not answer: the tab says "Setting up the poses…", Start is off and there are no poses to take out', { note: a.note, start: a.start, poses: a.poses });
    await page.clock.fastForward(12000);
    t.check(/^Setting up the poses/.test((await setupState(page)).note), 'a frame that does not answer: 12 s in, the tab is still setting up (the wait is 25 s)');
    await page.clock.fastForward(14000);
    const b = await setupState(page);
    const src = await page.evaluate(() => document.getElementById('fig-render').getAttribute('src'));
    t.check(/could not be drawn here\. Pose and light needs 3D drawing \(WebGL\).*Try another browser, or reload the page and come back to this tab\.$/.test(b.note) && b.start && b.setup && src === null, 'a frame that does not answer: after 25 s the tab says the poses could not be drawn here (WebGL, another browser, reload), Start stays off, the frame is let go', { note: b.note, start: b.start, src });
    await page.unroute(gone);
    page.log.console.length = 0; page.log.failed.length = 0;
    await page.evaluate(() => { document.querySelector('[data-tab="study"]').click(); document.querySelector('[data-tab="figure"]').click(); });
    const c = await setupState(page);
    t.check(/^Setting up the poses/.test(c.note), 'coming back to the tab tries again: it says "Setting up the poses…" once more', c.note);
    const up = await page.waitForFunction(() => document.querySelectorAll('#fig-poses [data-pose-id]').length === 30 && !document.getElementById('fig-start').disabled, null, { timeout: 40000 }).then(() => true).catch(() => false);
    const d = await setupState(page);
    t.check(up && d.poses === 30 && !d.start && /^A pose with a tick/.test(d.note), 'coming back to the tab tries again, and this time the 30 poses arrive and Start is on', { poses: d.poses, start: d.start, note: d.note });
    t.check(page.log.pageerrors.length === 0, 'a frame that does not answer: no page error', page.log.pageerrors);
    page.log.pageerrors.length = 0;
  } finally { await page.context().close(); }
}
// js/game.js missing: its sound is not there, and the class (the clock's end and the click on Start) goes on without it
async function noGameBlock(t, site) {
  const page = await openPage(site, { notFound: [site.base + 'js/game.js'] });
  try {
    await figureUp(page); await skewClock(page);
    const has = await page.evaluate(() => typeof window.GameSound);
    t.check(has === 'undefined', 'game.js missing: there is no GameSound', has);
    t.check(await startClass(page, { timed: 10, ids: ['stand', 'relaxed'] }), 'game.js missing: a timed class starts');
    await traceParts(page, ['spine']);
    await skewBy(page, 11000);
    t.check(await cardUp(page, 10000), 'game.js missing: the time runs out and the card comes (without a chime)');
    const c = await cardState(page);
    t.check(c.kicker === 'Time’s up!' && c.grade !== undefined, 'game.js missing: the card says Time’s up!', c.kicker);
    await guardOver(page); await click(page, '#fig-stop');
    t.check((await setupState(page)).review, 'game.js missing: Stop class shows the review');
    t.check(page.log.pageerrors.length === 0, 'game.js missing: no page error in the whole class', page.log.pageerrors);
  } finally { await page.context().close(); }
}
// inside another site's sandboxed frame (no downloads allowed): Save as PNG opens the image to save by hand
async function sandboxBlock(t, site) {
  const page = await openPage(site, { sandbox: {}, url: 'index.html#figure' });
  try {
    const fr = page.app;
    await fr.waitForFunction(() => { const b = document.querySelectorAll('#fig-poses [data-pose-id]'); return b.length === 30 && [...b].every((x) => x.querySelector('img').src.startsWith('blob:')); }, null, { timeout: 60000 }).catch(() => null);
    await fr.evaluate(() => { document.querySelectorAll('#fig-poses [data-pose-id]').forEach((b) => { if (!['stand', 'relaxed'].includes(b.dataset.poseId) && b.getAttribute('aria-pressed') === 'true') b.click(); }); document.getElementById('fig-start').click(); });
    const shown = await fr.waitForFunction(() => /^Pose 1: /.test(document.getElementById('fig-say').textContent), null, { timeout: 30000 }).then(() => true).catch(() => false);
    t.check(shown, 'sandbox: a class starts inside a sandboxed frame');
    // the paper's own Save, from the Canvas sheet
    await stroke(page, '#fs-paper', [[0.3, 0.3], [0.7, 0.7]]);
    await fr.evaluate(() => document.getElementById('fs-save').click());
    const dlg = await fr.waitForFunction(() => document.getElementById('saveDialog').open && document.getElementById('saveImg').complete && document.getElementById('saveImg').naturalWidth > 0, null, { timeout: 8000 }).then(() => true).catch(() => false);
    const nm = await fr.evaluate(() => ({ name: document.getElementById('saveName').textContent, img: [document.getElementById('saveImg').naturalWidth, document.getElementById('saveImg').naturalHeight] }));
    t.check(dlg && nm.name === 'figure-drawing.png' && nm.img[0] === 900 && nm.img[1] === 1200, 'sandbox: the Canvas sheet\'s Save opens the 900 × 1200 sheet in the save dialog (figure-drawing.png)', nm);
    await fr.evaluate(() => document.getElementById('saveClose').click());
    await fr.evaluate(() => { const b = document.getElementById('fig-done'); b.focus(); });
    await fr.waitForFunction(() => { const c = window.FigureStudy.state(); return c && c.shot && performance.now() - c.since >= 600; }, null, { timeout: 5000 }).catch(() => null);
    await fr.evaluate(() => document.getElementById('fig-done').click());
    await fr.waitForFunction(() => !document.getElementById('fig-result').hidden, null, { timeout: 10000 }).catch(() => null);
    await sleep(900); // (the card's guard)
    await fr.evaluate(() => document.getElementById('fig-stop').click());
    const rv = await fr.waitForFunction(() => !document.getElementById('fig-review').hidden, null, { timeout: 8000 }).then(() => true).catch(() => false);
    if (rv) {
      await fr.evaluate(() => document.querySelector('#fig-cards .fig-card button').click());
      const d2 = await fr.waitForFunction(() => document.getElementById('saveDialog').open && document.getElementById('saveImg').naturalWidth > 0, null, { timeout: 8000 }).then(() => true).catch(() => false);
      const n2 = await fr.evaluate(() => document.getElementById('saveName').textContent);
      t.check(d2 && /^figure-1-[a-z-]+\.png$/.test(n2), 'sandbox: Save as PNG on a review card opens that drawing in the save dialog (figure-1-<pose>.png)', n2);
      await fr.evaluate(() => document.getElementById('saveClose').click());
    } else t.check(false, 'sandbox: a drawing made in the sandbox reaches the review');
    t.check(page.log.pageerrors.length === 0 && (await violations(page)).length === 0, 'sandbox: no page error and no policy violation', { errors: page.log.pageerrors });
  } finally { await page.context().close(); }
}

// ================= Q. the review's wording at its edges, and the sound switch =================
// README: "every drawing comes back beside its pose, with its stars ... the class's average stars"; "ending with a chime (with the game's sound switch)"
// draws the stand pose's gesture part by part until the card would give this many stars (the analysis the card itself runs), clearing the sheet between tries
async function drawForStars(page, want) {
  for (const parts of [['head', 'spine', 'armR', 'armL'], ['spine', 'armR', 'armL'], ['head', 'spine', 'armR', 'legL'], ['head', 'spine', 'armR', 'legR'], ['head', 'spine', 'armR']]) {
    await page.evaluate(() => window.FigureStudy.studio.clearAll());
    await traceParts(page, parts);
    const stars = await page.evaluate(() => { const F = window.FigureStudy, c = F.state(); return F.analyze(c.shot, F.studio.ink()).stars; });
    if (stars === want) return parts.join('+');
  }
  return null;
}
async function wordingBlock(t, page) {
  const lede = (stars) => { const n = stars.length, shown = half(stars.reduce((x, y) => x + y, 0) / n); return `${n} drawing${n > 1 ? 's' : ''} from a relaxed class, ${shown} star${shown === '1' || shown === '½' ? '' : 's'} on average. Each is beside the pose it was drawn from, with the pose's gesture laid over it.`; };
  const classOf = async (kinds) => {
    t.check(await startClass(page, { ids: ['stand'] }), `wording: a class of ${kinds.length} on one pose starts`);
    const stars = [];
    for (let i = 0; i < kinds.length; i++) {
      if (i) await nextPose(page, i + 1);
      if (kinds[i] === 'scribble') await scribble(page);
      else if (kinds[i] === 'corner') await stroke(page, '#fs-paper', [[0.05, 0.04], [0.3, 0.13]], { steps: 6 }); // a line off the figure, in the sheet's corner: marked, and no star
      else if (!(await drawForStars(page, 1))) t.note('wording: no part of the gesture drawn alone earned exactly one star on this run');
      stars.push((await finishPose(page)).on);
      await guardOver(page);
    }
    await click(page, '#fig-stop');
    return { stars, lede: await text(page, '#fig-reviewLede'), ratings: await page.evaluate(() => [...document.querySelectorAll('#fig-cards .fig-rating')].map((x) => x.textContent)) };
  };
  const b = await classOf(['scribble', 'one']);
  if (b.stars.join() === '0,1') t.check(b.lede === lede(b.stars) && /, ½ star on average\./.test(b.lede), 'wording: a scribble (no star) and a one-star drawing average half a star, read "½ star on average" (singular)', b);
  else t.check(b.lede === lede(b.stars), `wording: the lede names the average of the stars the two cards show (${b.stars.join(' and ')})`, b);
  await click(page, '[data-fig-gesture="0"]');
  const c = await classOf(['one', 'one']);
  const co = await page.evaluate(() => ({ pressed: [...document.querySelectorAll('[data-fig-gesture]')].map((x) => x.getAttribute('aria-pressed')).join(','), labels: [...document.querySelectorAll('#fig-cards canvas')].map((x) => x.getAttribute('aria-label')) }));
  if (c.stars.join() === '1,1') t.check(c.lede === lede(c.stars) && /, 1 star on average\./.test(c.lede), 'wording: two one-star drawings average one star, read "1 star on average" (singular)', c);
  else t.check(c.lede === lede(c.stars), `wording: the lede names the average of the stars the two cards show (${c.stars.join(' and ')})`, c);
  t.check(co.pressed === 'false,true' && co.labels.length === 2 && co.labels.every((l) => !/with the gesture over it/.test(l)), 'wording: Hidden, chosen on one review, is still the choice on the next: its button is pressed and its pictures are drawn without the gesture, as their labels say', co);
  await click(page, '[data-fig-gesture="1"]');
  const labels = await page.evaluate(() => [...document.querySelectorAll('#fig-cards canvas')].map((x) => x.getAttribute('aria-label')));
  t.check(labels.length === 2 && labels.every((l) => /, with the gesture over it$/.test(l)), 'wording: Gestures shown puts the gesture back on those pictures and in their labels', labels);
  // one drawing that earns no star at all (README: the stars are the games' thresholds, so 0 stars below 30%): the lede's singular
  // sentence with 0 stars, and the card's word for it, on a class of one
  const z = await classOf(['corner']);
  t.check(z.stars.join() === '0' && z.lede === lede(z.stars) && /^1 drawing from a relaxed class, 0 stars on average\./.test(z.lede) && /0 out of 5 stars, \d+% · Keep drawing$/.test(z.ratings[0] || ''), 'wording: one drawing with no star reads "1 drawing from a relaxed class, 0 stars on average", and its card reads 0 out of 5 stars, Keep drawing', z);
  await clean(t, page, 'review wording');
}
// the games' sound switch off: the clock running out is silent
async function soundOffBlock(t, page) {
  await skewClock(page);
  await chimeSpy(page);
  await click(page, '#gameSound');
  const off = await page.evaluate(() => ({ on: window.GameSound.on(), pressed: document.getElementById('gameSound').getAttribute('aria-pressed') }));
  t.check(off.on === false && off.pressed === 'false', 'the games\' sound switch is turned off', off);
  t.check(await startClass(page, { timed: 10, ids: ['stand', 'relaxed'] }), 'sound off: a timed class (10 s) starts');
  const rang = await chimes(page);
  await skewBy(page, 11000);
  t.check(await cardUp(page, 10000), 'sound off: the time runs out and the card comes');
  const c = await cardState(page);
  t.check(c.kicker === 'Time’s up!' && (await chimes(page)) === rang, 'sound off: Time’s up! without a chime', { kicker: c.kicker, chimes: [rang, await chimes(page)] });
  await toSetup(page);
  await unskew(page);
  await click(page, '#gameSound');
  t.check((await page.evaluate(() => window.GameSound.on())) === true, 'the sound switch is back on');
  await clean(t, page, 'sound off');
}

export default async function figure(t, site) {
  // ================= A. the setup, desktop =================
  const page = await openPage(site);
  await tab(page, 'figure');
  await watch(page);
  {
    const s = await setupState(page);
    t.check(s.poses === 30 && s.pictures === 30 && !s.start && s.setup && !s.review && !s.draw, 'the tab opens on the setup with 30 poses and pictures, Start enabled', s);
    t.check(/^All 30 poses are in the class/.test(s.mix) && /No time limit/.test(s.plan) && /A pose with a tick/.test(s.note) && s.all === 'Take them all out' && !s.allHidden && s.timesHidden && !s.timed, 'the setup says every pose is in, no time limit, and offers Take them all out', s);
    t.check(s.heads.join('|') === 'Standing|Moving and sport|Low to the floor|Dance' && s.groups.every(([g, txt, label]) => txt === 'Take these out' && /^Take out the /.test(label)), 'the four groups each have a Take these out button with its label', s.groups);
    t.check(s.stored === null, 'a visit that changes nothing stores nothing', s.stored);
    // every pose out
    await click(page, '#fig-all');
    const o = await setupState(page);
    t.check(o.start && o.inClass.length === 0 && o.mix === 'Every pose is out of the class. Tap one to put it back.' && o.plan === '' && o.all === 'Put them all back' && o.groups.every(([, txt]) => txt === 'Put these back'), 'Take them all out: Start off, the message says every pose is out, every button offers Put back', o);
    let stored = null; try { stored = JSON.parse(o.stored); } catch (e) { /* not JSON */ }
    t.check(stored && stored.mode === 'relaxed' && stored.secs === 30 && Array.isArray(stored.out) && stored.out.length === 30, 'the poses taken out are stored', o.stored);
    t.check(await page.evaluate(() => { const b = document.getElementById('fig-start'); b.click(); return !window.FigureStudy.state() && !document.getElementById('fig-setup').hidden; }), 'a disabled Start does nothing', await stateOf(page));
    // all back
    await click(page, '#fig-all');
    const b = await setupState(page);
    t.check(!b.start && b.inClass.length === 30 && /^All 30 poses/.test(b.mix) && b.all === 'Take them all out' && JSON.parse(b.stored).out.length === 0, 'Put them all back: every pose in again, the store emptied', b);
    // a group out, one of its poses back, the group out again, then back
    await click(page, '.fig-group-btn[data-group="standing"]');
    const g1 = await setupState(page);
    const standing = await page.evaluate(() => [...document.querySelectorAll('#fig-poses [data-pose-id]')].filter((x) => x.closest('.fig-group').querySelector('.fig-group-btn').dataset.group === 'standing').map((x) => x.dataset.poseId));
    t.check(standing.length === 7 && g1.inClass.length === 23 && standing.every((id) => !g1.inClass.includes(id)) && g1.mix === '23 of the 30 poses are in the class, in a random order.' && g1.groups[0][1] === 'Put these back' && g1.groups[0][2] === 'Put back the standing poses', 'Take these out on Standing takes its 7 poses out and says 23 of the 30', { standing, mix: g1.mix, group: g1.groups[0] });
    await click(page, `#fig-poses [data-pose-id="${standing[0]}"]`);
    const g2 = await setupState(page);
    t.check(g2.inClass.length === 24 && g2.inClass.includes(standing[0]) && g2.groups[0][1] === 'Take these out' && /^24 of the 30/.test(g2.mix), 'one standing pose tapped back: 24 in, the group button offers Take these out again', { n: g2.inClass.length, mix: g2.mix, group: g2.groups[0] });
    await click(page, '.fig-group-btn[data-group="standing"]');
    const g3 = await setupState(page);
    t.check(g3.inClass.length === 23 && g3.groups[0][1] === 'Put these back', 'the group button with one pose in takes the rest out', { n: g3.inClass.length, group: g3.groups[0] });
    await click(page, '.fig-group-btn[data-group="standing"]');
    const g4 = await setupState(page);
    t.check(g4.inClass.length === 30 && g4.groups[0][1] === 'Take these out' && /^All 30/.test(g4.mix), 'Put these back brings the whole group back', { n: g4.inClass.length, mix: g4.mix });
    // Timed, 10 s
    await click(page, '#fig-timed'); await click(page, '#fig-t10');
    const tm = await setupState(page);
    t.check(tm.timed && !tm.timesHidden && tm.secs === '10' && tm.plan === '10 s a pose, until you stop the class' && tm.stored === '{"mode":"timed","secs":10,"out":[]}', 'Timed at 10 s shows the times, says 10 s a pose and is stored', tm);
    await click(page, '#fig-t600');
    t.check((await setupState(page)).plan === '10 min a pose, until you stop the class', 'the plan names 10 min for the longest pose');
    await click(page, '#fig-relaxed');
    const rx = await setupState(page);
    t.check(!rx.timed && rx.timesHidden && /No time limit/.test(rx.plan) && rx.stored === '{"mode":"relaxed","secs":600,"out":[]}', 'back to Relaxed: the times hide, the plan says no time limit, the time chosen is kept', rx);
    await click(page, '#fig-t30');
    await clean(t, page, 'setup');
  }

  // ================= B. a relaxed class on three poses =================
  const ids = ['stand', 'relaxed', 'wave'];
  {
    await onlyPoses(page, ids);
    const s = await setupState(page);
    t.check(s.inClass.length === 3 && s.mix === '3 of the 30 poses are in the class, in a random order.' && JSON.parse(s.stored).out.length === 27, 'three poses in: the message counts them, 27 are stored as out', { mix: s.mix, n: s.inClass.length });
    // Done the instant the pose appears must do nothing (the 0.5 s guard), measured inside the page
    await page.evaluate(() => { window.__early = null; const el = document.getElementById('fig-say'); const mo = new MutationObserver(() => { if (/^Pose 1: /.test(el.textContent)) { mo.disconnect(); const dt = performance.now() - window.FigureStudy.state().since; document.getElementById('fig-done').click(); window.__early = { dt, cardHidden: document.getElementById('fig-result').hidden, over: window.FigureStudy.state().over }; } }); mo.observe(el, { childList: true, characterData: true, subtree: true }); });
    // a stroke while the first pose is still coming: the paper is locked and says so
    const lockedSay = await page.evaluate(() => { document.getElementById('fig-start').click(); const p = document.getElementById('fs-paper'); const r = p.getBoundingClientRect(); p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: r.left + 20, clientY: r.top + 20 })); return { toast: document.getElementById('toast').textContent, shot: !!window.FigureStudy.state().shot, draw: !document.querySelector('.fig-studio').hidden, setup: !document.getElementById('fig-setup').hidden }; });
    t.check(lockedSay.draw && !lockedSay.setup && !lockedSay.shot && lockedSay.toast === 'The next pose is coming', 'Start shows the paper at once; a stroke before the pose has come is refused with "The next pose is coming"', lockedSay);
    t.check(await poseShown(page, 1), 'the first pose comes');
    const early = await page.evaluate(() => window.__early);
    if (early && early.dt < 450) t.check(early.cardHidden && !early.over, `Done ${early.dt.toFixed(0)} ms after the pose appeared does nothing (the half-second guard)`, early);
    else t.note(`the Done guard could not be measured on pose 1 (the tap came ${early ? early.dt.toFixed(0) : '?'} ms after the pose)`);
    const p1 = await page.evaluate(() => ({ count: document.getElementById('fig-count').textContent, name: document.getElementById('fig-name').textContent, say: document.getElementById('fig-say').textContent, ref: document.getElementById('fs-refName').textContent, focus: document.activeElement && document.activeElement.id, ink: 0 }));
    const c1 = await clockState(page);
    t.check(p1.count === 'Pose 1' && ['Stand', 'Weight on one leg', 'Wave'].includes(p1.name), 'the bar names Pose 1 and one of the three poses', p1);
    t.check(p1.say === `Pose 1: ${p1.name}` && p1.ref === `${p1.name}, pose 1. Drawn from the Pose and light figure.` && p1.focus === 'fig-done', 'the live region and the reference name the pose; Done has focus', p1);
    t.check(c1.label === 'Time on this pose' && c1.pauseHidden && !c1.low && !c1.paused, 'a relaxed class: the clock counts time on this pose, no Pause button', c1);
    t.check(await page.waitForFunction(() => document.getElementById('fig-clock').textContent !== '0:00', null, { timeout: 4000 }).then(() => true).catch(() => false), 'the relaxed clock counts up', await text(page, '#fig-clock'));
    t.check((await inked(page, '#fs-paper')) === 0, 'the sheet starts blank', await inked(page, '#fs-paper'));
    // the hidden page stops a relaxed clock; back again it runs
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hid = await stateOf(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const back = await stateOf(page);
    t.check(hid && !hid.running && back && back.running, 'a hidden page stops the relaxed clock; it runs again when the page is back', { hid, back });
    // draw, Clear twice, Undo, Ctrl+Z
    await trace(page);
    const ink1 = await inked(page, '#fs-paper');
    t.check(ink1 > 500, 'a drawing traced from the pose lands on the sheet', ink1);
    await click(page, '#fs-clear');
    t.check(/Tap again to clear/.test(await text(page, '#toast')) && (await inked(page, '#fs-paper')) === ink1, 'Clear arms first and keeps the drawing', await text(page, '#toast'));
    await click(page, '#fs-clear');
    t.check((await inked(page, '#fs-paper')) === 0, 'Clear again blanks the sheet');
    await click(page, '#fs-undo');
    t.check((await inked(page, '#fs-paper')) === ink1, 'Undo after Clear brings the drawing back', await inked(page, '#fs-paper'));
    await stroke(page, '#fs-paper', [[0.1, 0.1], [0.2, 0.15]]);
    const ink2 = await inked(page, '#fs-paper');
    await page.keyboard.press('Control+z');
    t.check(ink2 > ink1 && (await inked(page, '#fs-paper')) === ink1, 'Ctrl+Z undoes the last stroke in the class', { ink1, ink2, after: await inked(page, '#fs-paper') });
    // Done, then Next pose and Stop class in the same instant: the card's 0.6 s guard
    const atomic = await page.evaluate(() => { document.getElementById('fig-done').click(); const shown = !document.getElementById('fig-result').hidden; document.getElementById('fig-nextPose').click(); const still = !document.getElementById('fig-result').hidden; document.getElementById('fig-stop').click(); return { shown, still, still2: !document.getElementById('fig-result').hidden, cls: !!window.FigureStudy.state(), n: window.FigureStudy.state() && window.FigureStudy.state().n }; });
    t.check(atomic.shown && atomic.still && atomic.still2 && atomic.cls && atomic.n === 1, 'Done shows the card; Next pose and Stop class in the same instant are not answered (the 0.6 s guard)', atomic);
    await cardSettled(page);
    const card = await cardState(page);
    const pct = +card.pct, stars = starsFor(pct);
    t.check(card.kicker === 'Pose 1 done' && /^\d+$/.test(card.pct) && pct >= 0 && pct <= 100 && card.on === stars && card.grade === GRADES[stars] && card.label === `${stars} out of 5 stars, ${pct}% gesture match`, 'the card: Pose 1 done, a percentage, the stars it earns, the word for them, the label', card);
    t.check(pct >= 65, 'a drawing traced from the pose\'s own joints earns at least three stars', { pct, tips: card.tips });
    t.check(card.pose === 'blob:' && card.poseAlt === `The pose: ${p1.name}` && (await inked(page, '#fig-drawing')) > 100 && card.tips.length >= 3 && /^Line of action: /.test(card.tips[0]) && card.tips.some((x) => /^(Your drawing|Well matched|Dashed|Extra marks|Off the figure): /.test(x)), 'the card shows the pose, the drawing with the gesture, and notes starting with the line of action', { pose: card.pose, alt: card.poseAlt, tips: card.tips });
    t.check(card.say === `Pose 1 done ${p1.name}: ${stars} out of 5 stars, ${pct}% gesture match. ${GRADES[stars]}`.replace(/([^!.])$/, '$1.') && card.focus === 'fig-nextPose' && card.inert, 'the live region reads the card; Next pose has focus; the studio behind is inert', { say: card.say, focus: card.focus, inert: card.inert });
    t.check(!(await clockState(page)).paused, 'the clock is not drawn as paused on the card (the pose is over)', await clockState(page));
    // another tab and back while the card is up: the card stays
    await tab(page, 'study'); await tab(page, 'figure');
    const after = await cardState(page);
    t.check(after.shown && (await setupState(page)).draw, 'leaving the tab and coming back during the card keeps the card up', { shown: after.shown });
    // Next pose: a fresh sheet
    t.check(await nextPose(page, 2), 'Next pose (after the guard) brings pose 2');
    const p2 = await page.evaluate(() => ({ count: document.getElementById('fig-count').textContent, card: !document.getElementById('fig-result').hidden, undo: document.getElementById('fs-undo').disabled, focus: document.activeElement && document.activeElement.id, clock: document.getElementById('fig-clock').textContent }));
    t.check(p2.count === 'Pose 2' && !p2.card && p2.undo && (await inked(page, '#fs-paper')) === 0 && p2.focus === 'fig-done' && /^0:0[0-2]$/.test(p2.clock), 'pose 2: a fresh sheet, nothing to undo, the clock from 0:00, Done focused', p2); // (read a moment after the pose starts: up to 0:02 on a loaded machine)
    // a blank sheet Done
    t.check(await endPose(page), 'Done with a blank sheet shows a card');
    await cardSettled(page);
    const blank = await cardState(page);
    t.check(blank.kicker === 'Pose 2 done' && blank.pct === '0' && blank.on === 0 && blank.grade === 'Nothing drawn' && blank.label === '0 out of 5 stars, 0% gesture match' && blank.tips.some((x) => x === 'Nothing drawn: the gesture is shown where the reference would sit.') && /: nothing drawn\.$/.test(blank.say), 'a blank sheet: 0%, no star, "Nothing drawn", the note says where the gesture sits', blank);
    // ten poses: never the same twice running (a scribble on pose 3 for a 0-star card)
    const names = [p1.name, await text(page, '#fig-name')];
    let scribbled = null;
    for (let n = 3; n <= 10; n++) {
      t.check(await nextPose(page, n), `Next pose brings pose ${n}`);
      names.push(await text(page, '#fig-name'));
      if (n === 3) { await scribble(page); }
      t.check(await endPose(page), `Done ends pose ${n}`);
      await cardSettled(page);
      if (n === 3) { scribbled = await cardState(page); }
    }
    t.check(names.length === 10 && names.every((x, i) => i === 0 || x !== names[i - 1]), 'ten poses in a row, never the same pose twice running', names.join(' > '));
    t.check(new Set(names).size === 3, 'all three poses of the class come up over ten poses', names.join(' > '));
    t.check(scribbled && scribbled.pct === '0' && scribbled.on === 0 && scribbled.grade === 'Keep drawing' && scribbled.tips.some((x) => /^(Extra marks|Dashed): /.test(x)), 'a scribble over the sheet earns nothing (README: taken down to nothing) and the notes say why', scribbled && { pct: scribbled.pct, grade: scribbled.grade, tips: scribbled.tips });
    // ✕ during a pose: once arms, three seconds later it re-arms, twice stops; a stroke under way is kept
    t.check(await nextPose(page, 11), 'pose 11 comes');
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    await click(page, '#fig-end');
    t.check((await text(page, '#toast')) === 'Tap ✕ again to stop the class' && !!(await stateOf(page)), '✕ once asks for a second tap and the class goes on', await text(page, '#toast'));
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
    await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => null);
    await sleep(3200); // (the re-arm is 3 s of wall clock: no condition to wait on)
    await click(page, '#fig-end');
    t.check((await text(page, '#toast')) === 'Tap ✕ again to stop the class' && !!(await stateOf(page)), '✕ after more than 3 s arms again instead of stopping', await text(page, '#toast'));
    await click(page, '#fig-end');
    await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null);
    const rv = await setupState(page);
    t.check(!(await stateOf(page)) && rv.review && !rv.setup && !rv.draw && (await text(page, '#toast')) === 'The class is over', '✕ twice ends the class and shows the review', { state: await stateOf(page), rv: { review: rv.review, setup: rv.setup, draw: rv.draw }, toast: await text(page, '#toast') });
    await clean(t, page, 'relaxed class');
  }

  // ================= C. the review =================
  let firstDataUrls;
  {
    const r = await page.evaluate(() => ({
      lede: document.getElementById('fig-reviewLede').textContent, focus: document.activeElement && document.activeElement.id, scrollY: window.scrollY,
      cards: [...document.querySelectorAll('#fig-cards .fig-card')].map((c) => ({ title: c.querySelector('figcaption strong').textContent, time: c.querySelector('figcaption span').textContent, rating: c.querySelector('.fig-rating').textContent, stars: c.querySelector('.fig-rating-stars').textContent, tips: c.querySelectorAll('.fig-tips li').length, img: (c.querySelector('img').getAttribute('src') || '').slice(0, 5), alt: c.querySelector('img').alt, canvasLabel: c.querySelector('canvas').getAttribute('aria-label'), save: c.querySelector('button').textContent })),
      pressed: [...document.querySelectorAll('[data-fig-gesture]')].map((b) => b.getAttribute('aria-pressed')).join(','),
    }));
    const starsOf = (rating) => (/(\d) out of 5 stars/.exec(rating) || [])[1];
    const stars = r.cards.map((c) => +(starsOf(c.rating) || 0));
    const avg = half(stars.reduce((a, b) => a + b, 0) / (stars.length || 1));
    t.check(r.cards.length === 3 && r.lede === `3 drawings from a relaxed class, ${avg} star${avg === '1' || avg === '½' ? '' : 's'} on average. Each is beside the pose it was drawn from, with the pose's gesture laid over it.`, 'the review: three drawings (the traced one, the scribble and the stroke ✕ cut short), the average stars in words', { lede: r.lede, stars });
    t.check(r.cards.every((c, i) => new RegExp(`^${i + 1}\\. `).test(c.title) && /^\d+:\d\d$/.test(c.time) && /^[★☆]{5}$/.test(c.stars) && /\d+% · /.test(c.rating) && c.tips >= 3 && c.img === 'blob:' && /^The pose: /.test(c.alt) && c.canvasLabel === `Your drawing of ${c.title.replace(/^\d+\. /, '')}, with the gesture over it` && c.save === 'Save as PNG'), 'each card: its number and pose, the time, five star glyphs, the percentage and word, notes, the pose picture, Save as PNG', r.cards);
    t.check(r.focus === 'fig-reviewTitle' && r.scrollY === 0 && r.pressed === 'true,false', 'the review title takes focus at the top of the page; Gestures shown is pressed', { focus: r.focus, scrollY: r.scrollY, pressed: r.pressed });
    const inks = await page.evaluate(() => [...document.querySelectorAll('#fig-cards canvas')].map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - d[0]) > 40 || Math.abs(d[i + 1] - d[1]) > 40) n++; return n; }));
    t.check(inks.length === 3 && inks.every((n) => n > 50), 'every review card shows marks', inks);
    firstDataUrls = await dataUrls(page);
    // the gesture hidden and shown again
    await click(page, '[data-fig-gesture="0"]');
    await page.waitForFunction((a) => document.querySelector('#fig-cards canvas').toDataURL() !== a, firstDataUrls[0], { timeout: 3000 }).catch(() => null);
    const hidden = await dataUrls(page);
    const h = await page.evaluate(() => ({ pressed: [...document.querySelectorAll('[data-fig-gesture]')].map((b) => b.getAttribute('aria-pressed')).join(','), labels: [...document.querySelectorAll('#fig-cards canvas')].map((c) => c.getAttribute('aria-label')) }));
    t.check(hidden.every((u, i) => u !== firstDataUrls[i]) && h.pressed === 'false,true' && h.labels.every((l) => /^Your drawing of [^,]+$/.test(l)), 'Hidden takes the gesture off every card and its label', h);
    const file2 = await download(page, '#fig-cards .fig-card:nth-child(2) button');
    t.check(/^figure-2-[a-z0-9-]+\.png$/.test(file2 || ''), 'Save as PNG on the second card downloads figure-2-<pose>.png', file2);
    await click(page, '[data-fig-gesture="1"]');
    await page.waitForFunction((a) => document.querySelector('#fig-cards canvas').toDataURL() === a, firstDataUrls[0], { timeout: 3000 }).catch(() => null);
    t.check(JSON.stringify(await dataUrls(page)) === JSON.stringify(firstDataUrls), 'Gestures shown draws the cards as before');
    const file1 = await download(page, '#fig-cards .fig-card:nth-child(1) button');
    t.check(/^figure-1-[a-z0-9-]+\.png$/.test(file1 || '') && !(await page.evaluate(() => document.getElementById('saveDialog').open)), 'Save as PNG on the first card downloads figure-1-<pose>.png, with no dialog at the top level', file1);
    // Draw again: the same class; ✕ twice with nothing drawn goes to the setup, the drawings stay
    await click(page, '#fig-again');
    t.check(await poseShown(page, 1), 'Draw again starts at pose 1');
    const again = await stateOf(page);
    t.check(again && again.mode === 'relaxed' && again.pool.length === 3 && again.pool.every((id) => ids.includes(id)), 'Draw again uses the same class: relaxed, the same three poses', again);
    await stopTwice(page);
    const s = await setupState(page);
    t.check(s.setup && !s.review && s.back && (await text(page, '#toast')) === 'The class is over' && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'fig-start', 'a class with nothing drawn goes straight back to the setup, with Back to your drawings offered and Start focused', { setup: s.setup, back: s.back, toast: await text(page, '#toast') });
    await click(page, '#fig-back');
    const b = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length, focus: document.activeElement && document.activeElement.id }));
    t.check(b.review && b.cards === 3 && b.focus === 'fig-reviewTitle', 'Back to your drawings returns to the three cards', b);
    await click(page, '#fig-new');
    const n = await setupState(page);
    t.check(n.setup && !n.review && n.back, 'New class shows the setup with Back to your drawings', { setup: n.setup, back: n.back });
    await clean(t, page, 'review');
  }

  // ================= D. a timed class: 10 s to the chime, Pause, leaving, 30 s with Done early =================
  {
    await click(page, '#fig-timed'); await click(page, '#fig-t10');
    const soundOn = await chimeSpy(page);
    t.check(soundOn, 'the games\' sound switch is on by default, so the chime plays', soundOn);
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'the timed class starts');
    const c0 = await clockState(page);
    t.check(c0.clock === '0:10' && c0.label === 'Time left' && !c0.pauseHidden && c0.pauseText === 'Pause' && c0.pauseLabel === 'Pause the clock' && !c0.low && !c0.paused, 'a timed class: 0:10 of time left, a Pause button', c0);
    t.check(await page.waitForFunction(() => document.getElementById('fig-clock').textContent === '0:09', null, { timeout: 3000 }).then(() => true).catch(() => false), 'the clock counts down');
    await click(page, '#fig-pause');
    const ph = await clockState(page);
    await sleep(1200); // (a held clock has no condition to wait on: it must not change)
    const ph2 = await clockState(page);
    const st = await stateOf(page);
    t.check(ph.pauseText === 'Resume' && ph.pauseLabel === 'Resume the clock' && ph.held && ph.paused && ph2.clock === ph.clock && st && !st.running && st.held, 'Pause holds the clock: the button turns to Resume, the clock stops', { ph, after: ph2.clock, st });
    await click(page, '#fig-pause');
    t.check(await page.waitForFunction((was) => document.getElementById('fig-clock').textContent !== was, ph.clock, { timeout: 3000 }).then(() => true).catch(() => false) && (await clockState(page)).pauseText === 'Pause', 'Resume runs the clock on again', await clockState(page));
    // leaving the tab holds a timed class until Resume
    await tab(page, 'study');
    const away = await stateOf(page);
    await tab(page, 'figure');
    const backOn = { ...(await stateOf(page)), ...(await clockState(page)), draw: (await setupState(page)).draw };
    t.check(away && !away.running && away.held && !backOn.running && backOn.held && backOn.pauseText === 'Resume' && backOn.draw, 'leaving the tab pauses a timed class; back on it, the clock waits for Resume', { away, back: backOn });
    await click(page, '#fig-pause');
    // the hidden page too
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hid = await stateOf(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const vis = { ...(await stateOf(page)), pauseText: (await clockState(page)).pauseText };
    t.check(hid && !hid.running && hid.held && !vis.running && vis.pauseText === 'Resume', 'the page hidden pauses a timed class, and it waits for Resume once visible', { hid, vis });
    await click(page, '#fig-pause');
    // the red last stretch, then the chime
    const lowAt = await page.waitForFunction(() => document.getElementById('fig-clock').classList.contains('is-low') && document.getElementById('fig-clock').textContent, null, { timeout: 12000 }).then((h) => h.jsonValue()).catch(() => null);
    const lowColor = await page.evaluate(() => getComputedStyle(document.getElementById('fig-clock')).color);
    const earth = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--earth)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    t.check(lowAt && lowColor === earth, 'the last stretch of the clock turns red', { lowAt, lowColor, earth });
    // README: the last fifth of a short pose, at least 3 seconds: 3 s of a 10 s pose
    t.check(lowAt === '0:03', 'README: the red stretch of a 10 s pose is its last 3 seconds (the last fifth, at least 3 s)', lowAt);
    if (lowAt !== '0:03' && lowAt !== null) {
      t.finding({ title: 'A 10 s pose turns red with 3 s left, not the last fifth (2 s) the README promises', severity: 'low', steps: 'Figure study > Timed > 10 s > Start drawing. Watch the clock: it turns red at 0:03.', expected: 'README "Figure study" 1: "The last stretch of the clock turns red (the last fifth of a short pose, the last 30 seconds of a long one)": 2 s of a 10 s pose, so red at 0:02.', actual: 'The clock turns red at 0:03 (30% of the pose). Every other time (30 s, 1 min, 5 min, 10 min) matches the README.', cause: 'js/figure.js:299 floors the red stretch at 3 s: Math.min(30, Math.max(3, cls.secs * 0.2)).' });
    }
    t.check(await cardUp(page, 12000), 'the time runs out and the card comes by itself');
    const tc = { ...(await cardState(page)), chimes: await chimes(page), clock: (await clockState(page)).clock };
    t.check(tc.kicker === 'Time’s up!' && tc.chimes === 1 && tc.clock === '0:00' && tc.grade === 'Nothing drawn', 'time up: the card says Time’s up!, the chime rang once, the clock stands at 0:00', tc);
    await guardOver(page); await click(page, '#fig-stop');
    await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null);
    const after = await setupState(page);
    t.check(after.setup && !after.review && after.back, 'Stop class with nothing drawn goes back to the setup, the drawings before still offered', { setup: after.setup, back: after.back });
    // 30 s, Done early
    await click(page, '#fig-t30');
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'a 30 s class starts');
    t.check((await clockState(page)).clock === '0:30', 'the clock starts at 0:30', await clockState(page));
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    const chimesBefore = await chimes(page);
    await page.waitForFunction(() => document.getElementById('fig-clock').textContent === '0:29', null, { timeout: 3000 }).catch(() => null);
    t.check(await endPose(page), 'Done ends a timed pose early');
    const early = { ...(await cardState(page)), chimes: await chimes(page), clock: (await clockState(page)).clock };
    await sleep(1200); // (a stopped clock has no condition to wait on: it must not change)
    const later = (await clockState(page)).clock;
    t.check(early.kicker === 'Pose 1 done' && early.chimes === chimesBefore && /^0:2[89]$/.test(early.clock) && later === early.clock, 'Done early: "Pose 1 done", no chime, the clock stops where it was', { kicker: early.kicker, chimes: early.chimes, before: chimesBefore, clock: early.clock, later });
    t.check(await nextPose(page, 2) && (await clockState(page)).clock === '0:30', 'the next pose starts from 0:30 again', await clockState(page));
    await stopTwice(page);
    const rv = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, lede: document.getElementById('fig-reviewLede').textContent, cards: document.querySelectorAll('#fig-cards .fig-card').length }));
    t.check(rv.review && rv.cards === 1 && /^1 drawing from a timed class, 30 s a pose, /.test(rv.lede), 'the review names a timed class at 30 s a pose, with its one drawing', rv);
    await clean(t, page, 'timed class');
  }

  // ================= E. a pose saved in Pose and light: in the class; deleted, Draw again =================
  {
    await tab(page, 'pose');
    const pf = poseFrame(page);
    const saved = pf ? await pf.evaluate(() => { document.getElementById('libClose').click(); document.getElementById('savePose').click(); return document.getElementById('savePose').textContent; }) : null;
    t.check(saved === 'Saved in the pose library', 'a pose is saved in Pose and light', saved);
    await tab(page, 'figure');
    await page.waitForFunction(() => document.querySelectorAll('#fig-poses [data-pose-id^="mine-"] img[src^="blob:"]').length === 1, null, { timeout: 20000 }).catch(() => null);
    const m = await setupState(page);
    const mine = await page.evaluate(() => { const b = document.querySelector('#fig-poses [data-pose-id^="mine-"]'); return b && { id: b.dataset.poseId, name: b.querySelector('.fig-pose-name').textContent, pressed: b.getAttribute('aria-pressed'), pic: b.classList.contains('has-img'), group: b.closest('.fig-group').querySelector('h4').textContent, btn: b.closest('.fig-group').querySelector('.fig-group-btn').getAttribute('aria-label') }; });
    t.check(m.poses === 31 && m.pictures === 31 && mine && mine.name === 'Your pose 1' && mine.pressed === 'true' && mine.pic && mine.group === 'Your poses' && mine.btn === 'Take out your saved poses' && m.heads[4] === 'Your poses', 'the saved pose appears in the setup under Your poses, with its picture, in the class', { poses: m.poses, pictures: m.pictures, mine, heads: m.heads });
    t.check(/^31 of the 31 poses|^All 31 poses/.test(m.mix) || /of the 31 poses/.test(m.mix), 'the message counts 31 poses now', m.mix);
    // a class of that one pose alone: it has to repeat
    await onlyPoses(page, [mine.id]);
    const one = await setupState(page);
    t.check(one.inClass.length === 1 && one.mix === '1 of the 31 poses is in the class.' && !one.start, 'one pose in the class: Start is on, the line reads as one pose', { mix: one.mix, n: one.inClass.length });
    t.check(one.mix !== '1 of the 31 poses are in the class, in a random order.', 'the message for one pose reads as one pose', one.mix);
    if (one.mix === '1 of the 31 poses are in the class, in a random order.') t.finding({ title: 'With one pose in the class the setup says "1 of the 31 poses are in the class, in a random order."', severity: 'low', steps: 'Figure study > Take them all out > tap one pose back in. Read the line under Poses.', expected: 'A sentence for one pose: "1 of the 31 poses is in the class." (and no random order to speak of).', actual: '"1 of the 31 poses are in the class, in a random order."', cause: 'js/figure.js:198 uses one template for every count above zero.' });
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1) && (await text(page, '#fig-name')) === 'Your pose 1', 'the class draws the saved pose', await text(page, '#fig-name'));
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    t.check(await endPose(page) && await nextPose(page, 2) && (await text(page, '#fig-name')) === 'Your pose 1', 'with one pose in the class, the same pose comes again', await text(page, '#fig-name'));
    await guardOver(page);
    await stopTwice(page);
    t.check((await setupState(page)).review && (await page.evaluate(() => document.querySelectorAll('#fig-cards .fig-card').length)) === 1, 'the review shows the one drawing of the saved pose');
    // the saved pose deleted in Pose and light, then Draw again on the review
    await tab(page, 'pose');
    const removed = pf ? await pf.evaluate(() => { const x = document.querySelector('#mine .pose-x'); if (!x) return null; x.click(); return document.querySelectorAll('#mine .pose-btn').length; }) : null;
    t.check(removed === 0, 'the saved pose is removed in Pose and light', removed);
    await tab(page, 'figure');
    await page.waitForFunction(() => document.querySelectorAll('#fig-poses [data-pose-id]').length === 30, null, { timeout: 20000 }).catch(() => null);
    const gone = await setupState(page);
    t.check(gone.poses === 30 && gone.review, 'back on the tab the list is 30 again and the review is still up', { poses: gone.poses, review: gone.review });
    const againSay = await page.evaluate(() => { const toast = document.getElementById('toast'); toast.textContent = ''; toast.classList.remove('show'); document.getElementById('fig-again').click(); return { cls: !!window.FigureStudy.state(), toast: toast.textContent, review: !document.getElementById('fig-review').hidden, draw: !document.querySelector('.fig-studio').hidden }; });
    await page.waitForFunction(() => window.FigureStudy.state() || document.getElementById('toast').classList.contains('show') || !document.querySelector('.fig-studio').hidden, null, { timeout: 1500 }).catch(() => null);
    const againLater = { ...(await setupState(page)), cls: !!(await stateOf(page)), toast: await text(page, '#toast') };
    const dead = !againSay.cls && !againLater.cls && !againLater.draw && !againLater.toast;
    t.check(!dead, 'Draw again with the class\'s only pose deleted says why it cannot start', { againSay, later: { cls: againLater.cls, draw: againLater.draw, toast: againLater.toast, review: againLater.review } });
    if (dead) t.finding({ title: 'Draw again does nothing, with no message, when every pose of the last class has been deleted in Pose and light', severity: 'medium', steps: 'Pose and light > Save this pose. Figure study > Take them all out, tap "Your pose 1" back in > Start drawing > draw a stroke > Done > ✕ twice (the review). Pose and light > open the library > × on Your pose 1 (removed). Figure study (the review is still up) > Draw again.', expected: 'A class starts, or the page says the pose is no longer in the library (and offers New class).', actual: 'Nothing happens: the review stays, no toast, no class. The button is dead.', cause: 'js/figure.js:227-228 startClass() filters the pool by byId() and returns silently when nothing is left; the review\'s Draw again (js/figure.js:1017) passes last.pool, which names only the deleted pose.' });
    await clean(t, page, 'saved pose');
  }

  // ================= F. a reload during a class =================
  {
    await click(page, '#fig-new');
    await click(page, '#fig-relaxed');
    await onlyPoses(page, ids);
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'a class for the reload starts');
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    t.check(await endPose(page), 'a drawing is done before the reload');
    await page.reload({ waitUntil: 'load' });
    await sleep(300);
    await tab(page, 'figure');
    const s = await setupState(page);
    t.check(s.setup && !s.review && !s.back && !s.draw && !(await page.evaluate(() => !!window.FigureStudy.state())), 'after a reload the class and its drawings are gone and the setup shows, with no Back to your drawings', { setup: s.setup, review: s.review, back: s.back });
    t.check(!s.timed && s.inClass.length === 3 && s.mix === '3 of the 30 poses are in the class, in a random order.', 'the class, the time and the poses taken out are remembered across the reload', { timed: s.timed, n: s.inClass.length, mix: s.mix });
    const help = await page.evaluate(() => document.getElementById('tab-help').textContent);
    t.check(/keeps a class's drawings until you start another or close the page/.test(help), 'How to use says a class\'s drawings last until the page closes', help.length);
    t.note('A reload during a class loses its drawings silently: nothing on the Figure study tab itself says they are kept only until the page closes (How to use > Good to know does, index.html:1196), and the README calls it by design.');
    await clean(t, page, 'reload');
    await page.context().close();
  }

  // ================= G. hostile saved state: figureStudy =================
  {
    const all = ['stand', 'relaxed', 'wave', 'reach', 'think', 'hips', 'point', 'walk', 'run', 'lunge', 'jump', 'throw', 'kick', 'box', 'crouch', 'kneel', 'sit', 'dance', 'attitude', 'seconde', 'passe', 'penche', 'cambre', 'jete', 'reverence', 'flamenco', 'jazz', 'contemporary', 'spiral', 'hiphop'];
    const huge = Array.from({ length: 10000 }, (_, i) => (i === 0 ? 'stand' : i === 5000 ? 'wave' : i === 150 ? 'constructor' : 'junk-' + i));
    const cases = [
      ['a JSON string', '"nope"', { timed: false, secs: '30', inClass: 30 }],
      ['a number', 42, { timed: false, secs: '30', inClass: 30 }],
      ['an array', [1, 2, 3], { timed: false, secs: '30', inClass: 30 }],
      ['not JSON', 'nope{', { timed: false, secs: '30', inClass: 30 }],
      ['mode, secs and out of the wrong types', { mode: ['timed'], secs: { 10: true }, out: { length: 1e9, 0: 'stand' } }, { timed: false, secs: '30', inClass: 30 }],
      ['secs "constructor", out "constructor", mode "constructor"', { mode: 'constructor', secs: 'constructor', out: 'constructor' }, { timed: false, secs: '30', inClass: 30 }],
      ['secs "__proto__", mode "timed" as TIMED, out of junk and prototype names', { mode: 'TIMED', secs: '__proto__', out: [null, 5, {}, [], 'constructor', '__proto__', 'toString', 'stand'] }, { timed: false, secs: '30', inClass: 29, out: ['stand'] }],
      ['timed with secs as the string "10" and out with 10000 entries', { mode: 'timed', secs: '10', out: huge }, { timed: true, secs: '10', inClass: 29, out: ['stand'] }],
      ['timed, 600, every pose out', { mode: 'timed', secs: 600, out: all }, { timed: true, secs: '600', inClass: 0 }],
      ['timed with secs 10.5 (no such time)', { mode: 'timed', secs: 10.5, out: [] }, { timed: true, secs: '30', inClass: 30 }],
    ];
    for (const [label, value, want] of cases) {
      const t0 = Date.now();
      const page = await openPage(site, { storage: { [KEY]: value } });
      await tab(page, 'figure');
      const s = await setupState(page);
      const secs = (Date.now() - t0) / 1000;
      const okOut = want.out ? want.out.every((id) => !s.inClass.includes(id)) : true;
      t.check(s.poses === 30 && s.timed === want.timed && s.secs === want.secs && s.inClass.length === want.inClass && okOut && s.start === (want.inClass === 0) && s.timesHidden === !want.timed, `hostile figureStudy (${label}): ${want.timed ? 'Timed' : 'Relaxed'}, ${want.secs} s, ${want.inClass} poses in, Start ${want.inClass ? 'on' : 'off'}`, { timed: s.timed, secs: s.secs, inClass: s.inClass.length, start: s.start, mix: s.mix });
      t.check(want.inClass === 0 ? s.mix === 'Every pose is out of the class. Tap one to put it back.' && s.plan === '' : want.inClass === 30 ? /^All 30 poses/.test(s.mix) : s.mix === `${want.inClass} of the 30 poses are in the class, in a random order.`, `hostile figureStudy (${label}): the message counts the poses right`, { mix: s.mix, plan: s.plan });
      if (want.inClass) {
        await click(page, '#fig-start');
        t.check(await poseShown(page, 1), `hostile figureStudy (${label}): a class starts`);
        await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5]]);
        t.check((await inked(page, '#fs-paper')) > 50, `hostile figureStudy (${label}): a stroke lands`);
        await stopTwice(page);
        t.check((await setupState(page)).review, `hostile figureStudy (${label}): ✕ twice shows the review`);
      } else {
        await click(page, '#fig-all');
        t.check((await setupState(page)).inClass.length === 30 && !(await setupState(page)).start, `hostile figureStudy (${label}): Put them all back enables Start`);
      }
      if (value === cases[7][1]) { const stored = await storageGet(page, KEY); t.note(`figureStudy with 10000 entries in out: the tab was up ${secs.toFixed(1)} s after the page opened; the store afterwards holds ${stored ? stored.length : 0} characters`); }
      await clean(t, page, `hostile figureStudy (${label})`);
      await page.context().close();
    }
  }

  // ================= H. hostile saved state: figureMixes =================
  {
    const TWYO = { parts: [{ code: 'TW', amount: 1 }, { code: 'YO', amount: 0.5 }] };
    const cases = [
      ['a JSON string', '"nope"', 0],
      ['an object', { parts: [TWYO] }, 0],
      ['junk, prototype-name codes and bad amounts', [null, 1, 'x', { parts: 'TW' }, { parts: [] }, { parts: [{ code: 'constructor', amount: 1 }, { code: '__proto__', amount: 1 }, { code: 'TW', amount: '2' }, { code: 'TW', amount: NaN }, { code: 'TW', amount: 1e9 }, { code: 'YO', amount: 0.5 }] }, { parts: [{ code: 'TW', amount: 1 }], starter: true, c: 'hostile' }], 2],
      ['__proto__ and constructor as keys', '[{"__proto__": {"parts": [{"code":"TW","amount":1}]}, "constructor": 1, "parts": [{"code":"CRL","amount":1}]}]', 1],
      ['a huge array of 3000 mixes', Array.from({ length: 3000 }, () => TWYO), 3000],
    ];
    for (const [label, value, wantKept] of cases) {
      const t0 = Date.now();
      const page = await openPage(site, { storage: { [MIXES]: value } });
      await tab(page, 'figure');
      const s = await page.evaluate(() => { const st = window.FigureStudy.studio.state; return { kept: st.mixes.filter((m) => !m.starter).length, starters: st.mixes.filter((m) => m.starter).length, colors: st.mixes.every((m) => Array.isArray(m.c) && m.c.length === 3), codes: st.mixes.every((m) => m.parts.every((p) => /^[A-Z]+$/i.test(p.code) && p.amount > 0 && p.amount <= 100)) }; });
      t.check(s.kept === wantKept && s.starters === 8 && s.colors && s.codes, `hostile figureMixes (${label}): ${wantKept} kept mix${wantKept === 1 ? '' : 'es'} beside the eight starters, each with a color and real parts`, s);
      await click(page, '#fig-start');
      t.check(await poseShown(page, 1), `hostile figureMixes (${label}): a class starts`);
      await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5]]);
      t.check((await inked(page, '#fs-paper')) > 50, `hostile figureMixes (${label}): a stroke lands`);
      if (wantKept > 100) t.note(`figureMixes with 3000 mixes: the first pose was up ${((Date.now() - t0) / 1000).toFixed(1)} s after the page opened`);
      await stopTwice(page);
      await clean(t, page, `hostile figureMixes (${label})`);
      await page.context().close();
    }
  }

  // ================= I. the phone =================
  {
    const page = await openPage(site, { viewport: PHONE, url: '#figure' });
    await tab(page, 'figure');
    await watch(page);
    const s = await setupState(page);
    t.check(s.poses === 30 && s.pictures === 30 && !s.start && (await hscroll(page)) <= 0, 'phone: the setup with 30 pictures, no horizontal scroll', { poses: s.poses, pictures: s.pictures, hscroll: await hscroll(page) });
    await screenshot(page, 'figure-phone-setup');
    await onlyPoses(page, ids);
    await click(page, '#fig-timed'); await click(page, '#fig-t30');
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'phone: the class starts');
    const lay = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
      return { studio: box(document.querySelector('.fig-studio')), bar: inView(document.getElementById('fig-bar')), done: inView(document.getElementById('fig-done')), pause: inView(document.getElementById('fig-pause')), end: inView(document.getElementById('fig-end')), paper: inView(document.getElementById('fs-paper')), clock: inView(document.getElementById('fig-clock')), tabs: getComputedStyle(document.querySelector('.tabs')).display, pauseText: getComputedStyle(document.querySelector('#fig-pause .fig-btn-text')).display, labels: ['fig-pause', 'fig-done', 'fig-end'].map((id) => document.getElementById(id).getAttribute('aria-label')), focus: document.activeElement && document.activeElement.id };
    });
    t.check(lay.studio.x >= 0 && lay.studio.y >= 0 && lay.studio.w <= 390 && lay.studio.h <= 844 && lay.bar && lay.done && lay.pause && lay.end && lay.paper && lay.clock, 'phone: the studio fills the screen with the bar, the clock, Pause, Done, ✕ and the paper all in view', lay);
    t.check(lay.tabs === 'none' && lay.pauseText === 'none' && lay.labels.join('|') === 'Pause the clock|Done: see how this pose went|Stop the class', 'phone: the tabs step aside; Pause is an icon with its label', { tabs: lay.tabs, pauseText: lay.pauseText, labels: lay.labels });
    await screenshot(page, 'figure-phone-pose');
    await click(page, '#fig-pause');
    const held = await page.evaluate(() => ({ text: getComputedStyle(document.querySelector('#fig-pause .fig-btn-text')).display, word: document.querySelector('#fig-pause .fig-btn-text').textContent }));
    t.check(held.text !== 'none' && held.word === 'Resume', 'phone: a held clock shows the word Resume', held);
    await click(page, '#fig-pause');
    await stroke(page, '#fs-paper', [[0.3, 0.3], [0.5, 0.5], [0.4, 0.7]]);
    t.check((await inked(page, '#fs-paper')) > 50, 'phone: a stroke lands', await inked(page, '#fs-paper'));
    t.check(await endPose(page), 'phone: Done shows the card');
    await cardSettled(page);
    const card = await page.evaluate(() => {
      const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
      const pop = document.getElementById('fig-popup');
      return { popup: inView(pop), next: inView(document.getElementById('fig-nextPose')), stop: inView(document.getElementById('fig-stop')), drawing: inView(document.getElementById('fig-drawing')), scrollable: pop.scrollHeight > pop.clientHeight, grade: document.getElementById('fig-grade').textContent, hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    t.check(card.popup && card.next && card.stop && card.drawing && card.grade && card.hscroll <= 0, 'phone: the card fits the screen with the drawing, Next pose and Stop class in reach', card);
    await screenshot(page, 'figure-phone-card');
    await guardOver(page); await click(page, '#fig-stop');
    await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null);
    const rv = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length, tabs: getComputedStyle(document.querySelector('.tabs')).display, hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, cardW: Math.round(document.querySelector('.fig-card').getBoundingClientRect().width) }));
    t.check(rv.review && rv.cards === 1 && rv.tabs !== 'none' && rv.hscroll <= 0 && rv.cardW <= 390, 'phone: Stop class shows the review, the tabs are back, no horizontal scroll', rv);
    await screenshot(page, 'figure-phone-review');
    const file = await download(page, '#fig-cards .fig-card button');
    t.check(/^figure-1-[a-z0-9-]+\.png$/.test(file || ''), 'phone: Save as PNG downloads the drawing', file);
    await click(page, '#fig-new');
    t.check((await setupState(page)).setup && (await hscroll(page)) <= 0, 'phone: New class returns to the setup without horizontal scroll');
    await clean(t, page, 'phone');
    await page.context().close();
  }

  // ================= J. onward: what the README promises and the blocks above did not reach =================
  // (each block quotes its README sentence; blocks that share a long page run in the order below, one failing does not stop the next)
  const mem = {};
  {
    const long = await openPage(site);
    try {
      await watch(long); await toastLog(long);
      await segment(t, 'first visit: frame, Studio paper, early Start', () => openingBlock(t, long, mem));
      await segment(t, 'a render that fails', () => renderFailureBlock(t, long, mem));
      await segment(t, 'the studio tools in a class', () => toolsBlock(t, long, mem));
      await segment(t, 'the class\'s review and PNGs', () => toolsReviewBlock(t, long, mem));
      await segment(t, 'the analyzer', () => analyzerBlock(t, long));
      await segment(t, 'the colour key', () => colourKeyBlock(t, long));
      await segment(t, 'every pose of the library', () => everyPoseBlock(t, long));
      await segment(t, 'colliding pose ids', () => collisionBlock(t, long));
      await segment(t, 'reload and Forget my work', () => reloadTailBlock(t, long, mem));
    } finally { await long.context().close(); }
  }
  {
    const page = await openPage(site);
    try {
      await figureUp(page);
      await segment(t, 'clock orderings, prefetch, relaxed tab', () => clockBlock(t, page));
      await segment(t, '1, 5 and 10 minute clocks', () => longClocksBlock(t, page));
      await segment(t, 'hold during a load', () => holdDuringLoadBlock(t, page));
      await segment(t, 'stopping in other orders', () => stopOrderBlock(t, page));
      await segment(t, 'the keyboard', () => keyboardBlock(t, page));
      await segment(t, 'a photo dropped during a pose', () => dropDuringPoseBlock(t, page));
      await segment(t, 'sound switched off', () => soundOffBlock(t, page));
      await segment(t, 'review wording', () => wordingBlock(t, page));
    } finally { await page.context().close(); }
  }
  await segment(t, 'axe, dark theme, reduced motion, phone on its side', () => accessibilityBlock(t, site));
  await segment(t, 'a frame that never answers', () => silentFrameBlock(t, site));
  await segment(t, 'Forget my work pressed in another tab', () => forgetElsewhereBlock(t, site));
  await segment(t, 'game.js missing', () => noGameBlock(t, site));
  await segment(t, 'inside a sandboxed frame', () => sandboxBlock(t, site));
  t.note('Left out of the blocks above, with the reason: (1) hostile answers from the render frame (a duplicate id, an unknown group, a long name, NaN joints): only the page\'s own frame can post them (the receiver checks the sender window), so they would guard against pose.js itself, and pose.js dedupes and validates before it answers; (2) ✕ while the card is up: the strip is inert there, which the card checks above already pin (a click that cannot happen); (3) ✕ armed on one pose and tapped again on the next: a second tap within 3 s of the first stops the class whichever pose it falls on, by design; (4) the one-drawing "0 stars" review sentence is not asserted on its own (a scribble\'s 0-star card is in the review of block B, and the half-star and one-star sentences are); (5) hostile pose-list answers were not sent for the same reason as (1).');
  t.note('Where a gap\'s "how" did not hold, the block says what it measured instead: a head and a spine alone leave 2 or 3 of the limbs dashed, not 4, because the fit shrinks the gesture onto their tall thin box; a drawing moved sideways is simply fitted where it is (score unchanged), so "Off the figure" is driven by marks away from the body (two bars either side); the next pose\'s picture being ready is read from the render requests the frame received (the request for pose 2 left while pose 1 was on screen, and was not repeated), not from a stopwatch.');
  t.note('Round 2 (the gaps the last round left open). Driven now: the one-drawing "0 stars" review sentence (wording block), a figure outlined alone and a figure two fifths narrower (analyzer block), and the rule that a part needs marks along half its length (quarter and three quarters of an arm, on the stand). Not a finding, but measured: on the relaxed pose the quarter arm still counts as marked, because it hangs against the torso and the marks along the torso are near it; the rule is asserted on the stand only. Left out with reasons: hostile list answers sent from the render frame (js/figure.js:86 takes a message only from the frame\'s own window, and :91-94 dedupes, type-checks and drops what does not fit; the frame is trusted by design, so a test would only re-run that validator, which the hostile saved states in block G already drive); a Nothing-drawn pose in the review (js/figure.js drawn(c) lists the drawings with marks; the review block pins that as the design, so it is not a finding); the eraser, gray ground and a turned paper carried from one pose to the next (a fresh sheet is the README\'s promise, and the marks are fresh; noted, not asserted). The least that counts as a drawing is 25 cells of a 240-wide grid: a 2%-of-sheet charcoal stroke is Nothing drawn and a 20% line is scored (noted; the README gives no size).');
}
