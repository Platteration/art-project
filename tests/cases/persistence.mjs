// What the site keeps and gives back, across reloads and versions. The README's Privacy section is the list
// (localStorage keys starting portrait-value-studio. and pose-and-light., the IndexedDB database
// portrait-value-studio), "Simple and Advanced" says what the Studio keeps, and the Help tab's Good to know says
// what Forget my work on this device clears. Each segment runs on pages of its own (two at once, PERSIST_JOBS),
// and PERSIST_ONLY=roundtrip,limits runs some only.
//   visit       a first visit and a tour of the tabs write nothing but the Studio's one-time note, and the site keeps
//               nothing else anywhere (no cookie, no session storage, no cache, no worker, no other database)
//   roundtrip   every key the site writes, written by the page itself (what a visitor changes), then a reload: each
//               setting is back as it was, and a reload rewrites nothing; the Studio's ground, texture, turned paper
//               and mixes with it; Pose and light's pose, light, mode and saved pose
//   older       what earlier versions of the site saved (removed keys, earlier key and value shapes, preset ids and
//               paint codes that are gone) read back sensibly, and Forget still sweeps the keys nothing reads
//   studio      the Studio's save: a stroke followed by a reload, a save cut off by one, hiding the page, Clear and
//               Undo, and the painting seen from a second tab
//   twotabs     a setting, a mix, a picked color and a painting changed in one tab while another is open
//   full        storage full (a write refuses after the quota is reached) and blocked (localStorage throws on access,
//               IndexedDB refuses): every write site keeps the page working, and says so where the site says it will
//   poseStorage the same for Pose and light on its own page
//   forget      Forget my work on this device with the keys, the painting and the poses all there, and three tabs open
//   midway      a reload in the middle of a Studio stroke, a game, a battle, a Figure study class and a pose drag
//   limits      the fifty boards (Paint by numbers and Value battle), the twelve poses and what is one past them
import fs from 'node:fs';
import path from 'node:path';
import { clean, tab, app, stroke, click, text, sleep, storageGet, makeImage, loadPhoto } from '../lib.mjs';

const P = 'portrait-value-studio.', PL = 'pose-and-light.';
const ONLY = (process.env.PERSIST_ONLY || '').split(',').filter(Boolean);
const jobs = [], timings = [];
const seg = (name, cost, fn) => jobs.push({ name, cost, fn });

// ---- helpers --------------------------------------------------------------------------------------------------------------
const J = JSON.stringify;
// Pages are made here, not by lib's openPage and newTab, for one reason: they wait for the document with a limit of 30 s, which
// a loaded machine can exceed on the heavier pages. The same records (page.log) are kept for clean().
const NOISE = /GPU stall|GL Driver Message|SwiftShader|WebGL-0x/i;
async function attach(site, ctx) {
  const p = await ctx.newPage();
  const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  p.log = log;
  p.setDefaultTimeout(60000); p.setDefaultNavigationTimeout(120000);
  p.on('pageerror', (e) => log.pageerrors.push(String(e.stack || e.message).slice(0, 400)));
  p.on('console', (m) => { const x = m.text(); if (NOISE.test(x)) return; if (m.type() === 'error') log.console.push(x.slice(0, 300)); });
  p.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) log.offsite.push(u); });
  p.on('requestfailed', (r) => { const u = r.url(); const why = (r.failure() || {}).errorText || ''; if (u.startsWith('blob:') || why === 'net::ERR_ABORTED') return; log.failed.push(u + ' ' + why); });
  await p.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${(e.blockedURI || '').slice(0, 60)} ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber}`); }); });
  return p;
}
const open = async (pages, site, { url = '', waitUntil = 'load' } = {}) => {
  const ctx = await site.browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference' });
  pages.push(ctx);
  const p = await attach(site, ctx);
  await p.goto(site.base + url, { waitUntil });
  await sleep(300);
  return p;
};
// another tab of the same browser (the same storage)
async function newTab(site, page, { url = '' } = {}) {
  const p = await attach(site, page.context());
  await p.goto(site.base + url, { waitUntil: url.startsWith('pose') ? 'domcontentloaded' : 'load' });
  await sleep(300);
  return p;
}
const keysOf = (page) => app(page).evaluate(() => Object.keys(localStorage).sort());
const siteKeys = (page) => app(page).evaluate(() => Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)).sort());
const dumpOf = (page) => app(page).evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const put = (page, obj) => app(page).evaluate((o) => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, obj);
const appUp = (page) => app(page).waitForFunction(() => !!(window.Studio && window.PaintStudio && window.ValueBattle), null, { timeout: 20000 }).catch(() => null);
async function reload(page) { await page.reload({ waitUntil: 'load', timeout: 90000 }); await appUp(page); await sleep(300); }
// Pose and light draws with software WebGL here and can be slow on a busy machine: its tabs wait for the document, then for the page's own start
const poseUp = (p) => p.waitForFunction(() => window.__poseStarted, null, { timeout: 90000 }).catch(() => null);
const poseReload = async (p) => { await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await poseUp(p); };
const setRange = (page, id, v) => app(page).evaluate(([id, v]) => { const s = document.getElementById(id); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; }, [id, v]);
const setSelect = (page, id, v) => app(page).evaluate(([id, v]) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; }, [id, v]);
const pressed = (page, sel) => app(page).evaluate((s) => { const e = document.querySelector(s); return e ? e.getAttribute('aria-pressed') : null; }, sel);
const checked = (page, sel) => app(page).evaluate((s) => { const e = document.querySelector(s); return e ? !!e.checked : null; }, sel);
const val = (page, sel) => app(page).evaluate((s) => { const e = document.querySelector(s); return e ? e.value : null; }, sel);
const toastNow = (page) => app(page).evaluate(() => { const e = document.getElementById('toast'); return e.classList.contains('show') ? e.textContent.trim() : ''; });
// A segment's checks are held until it ends, so that one that dies of the machine (a page that does not load in two minutes on a busy
// computer) is run once more and only the second run is counted; a thrown error in it that is not that is one failed check.
const BUSY = /Timeout \d+ms exceeded|timed out|Target (page, context or browser )?has been closed|Browser has been closed|net::ERR_/i;
async function attempt(j, site) {
  const buf = [], pages = [];
  const lt = { check: (ok, title, detail) => { buf.push(['check', [ok, title, detail]]); return !!ok; }, finding: (f) => { buf.push(['finding', [f]]); }, note: (x) => { buf.push(['note', [x]]); } };
  let err = null;
  try { await j.fn(lt, site, pages); } catch (e) { err = e; }
  for (const c of pages) await c.close().catch(() => null);
  return { buf, err };
}
async function runPool(t, site, n) {
  const queue = jobs.filter((j) => !ONLY.length || ONLY.includes(j.name)).sort((a, b) => b.cost - a.cost);
  const worker = async () => {
    for (;;) {
      const j = queue.shift();
      if (!j) return;
      const t0 = Date.now();
      let r = await attempt(j, site), again = false;
      if (r.err && BUSY.test(String(r.err && r.err.message || r.err))) { again = true; r = await attempt(j, site); }
      for (const [kind, args] of r.buf) t[kind](...args);
      if (r.err) t.check(false, `${j.name}: the segment ran to its end`, String(r.err && r.err.stack || r.err).slice(0, 500));
      timings.push(`${j.name} ${((Date.now() - t0) / 1000).toFixed(0)} s${again ? ' (run twice: the machine was too busy for the first)' : ''}`);
      if (process.env.PVS_NOTES) process.stdout.write(`    SEGMENT ${timings[timings.length - 1]}\n`);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
}

// ---- the Studio's record, and what is on its paper ----------------------------------------------------------------------------
// (opened as the Studio opens it, with its store made when the database is new, so reading one never leaves the Studio without it)
const record = (page) => app(page).evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('portrait-value-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('studio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  try {
    const v = await new Promise((res, rej) => { const tx = db.transaction('studio'); const g = tx.objectStore('studio').get('painting'); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); });
    if (!v || typeof v !== 'object') return null;
    return { w: v.w, h: v.h, savedAt: v.savedAt, paper: v.paper instanceof Blob, sketch: v.sketch instanceof Blob, canvas: v.canvas, sketchShown: v.sketchShown };
  } finally { db.close(); }
}).catch(() => null);
async function waitRecord(page, pred, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const r = await record(page); if (r && pred(r)) return r; await sleep(250); }
  return null;
}
const dbNames = (page) => app(page).evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : null));
const studioReady = (page) => Promise.race([app(page).evaluate(() => (window.PaintStudio ? PaintStudio.ready() : null)), sleep(10000)]).catch(() => null);
// the paper's painted pixels (alpha over zero) in a horizontal band, as fractions of its height
const band = (page, y0, y1) => app(page).evaluate(([y0, y1]) => { const c = document.getElementById('ps-paper'); const d = c.getContext('2d').getImageData(0, Math.floor(c.height * y0), c.width, Math.max(1, Math.floor(c.height * (y1 - y0)))).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }, [y0, y1]);
const paperSize = (page) => app(page).evaluate(() => ({ w: document.getElementById('ps-paper').width, h: document.getElementById('ps-paper').height }));
// a stroke along one line across the paper: lowAt 0.8 is the bottom band, 0.2 the top
const line = (page, y) => stroke(page, '#ps-paper', [[0.2, y], [0.8, y]]);
const BOTTOM = [0.7, 0.9], TOP = [0.1, 0.3];
async function openStudio(page) { await tab(page, 'paint'); await studioReady(page); await sleep(400); }
// lock in a mix of one paint (the nth of the palette) the way the sheet does
const lockMix = (page, n) => app(page).evaluate((n) => { document.querySelectorAll('#ps-paints .ps-paint')[n].click(); document.getElementById('ps-lock').click(); return document.querySelectorAll('#ps-mixes .ps-mix').length; }, n);
const mixCount = (page) => app(page).evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length);
const savedMixes = async (page) => { try { return JSON.parse(await storageGet(page, P + 'paintMixes')) || []; } catch (e) { return null; } };

// ---- Value battle and Paint by numbers, played just far enough to write a best ------------------------------------------------
async function battleAnswer(page, right) {
  await app(page).waitForFunction(() => { const g = window.ValueBattle && ValueBattle.state(); return g && !g.answered && !g.over && g.rounds[g.i]; }, null, { timeout: 20000 });
  await app(page).evaluate((right) => {
    const g = ValueBattle.state(), r = g.rounds[g.i];
    const sw = (i) => document.querySelector(`.vb-swatch[data-index="${i}"]`).click();
    if (r.q.mode === 'pair') { const want = right ? r.answer : r.answer === 'same' ? 'left' : 'same'; if (want === 'same') document.querySelector('.vb-choice[data-choice="same"]').click(); else sw(want === 'left' ? 0 : 1); }
    else if (r.q.mode === 'pick') sw(right ? r.answer : (r.answer + 1) % r.n);
    else (right ? r.answer : r.answer.slice().reverse()).forEach(sw);
  }, right);
  await app(page).waitForFunction(() => { const g = ValueBattle.state(); return g && (g.answered || g.over); }, null, { timeout: 10000 }).catch(() => null);
}
// a streak of `rights` right answers and then one wrong: the score pop-up is up, and what it says is returned
async function battleStreak(page, rights = 1) {
  await tab(page, 'battle');
  await app(page).waitForFunction(() => document.getElementById('vb-palette').options.length > 0, null, { timeout: 5000 }).catch(() => null);
  await click(page, '#vb-start');
  await app(page).waitForFunction(() => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !document.getElementById('vb-play').hidden; }, null, { timeout: 20000 });
  for (let i = 0; i < rights; i++) { await battleAnswer(page, true); await click(page, '#vb-next'); await app(page).waitForFunction((i) => { const g = ValueBattle.state(); return g && g.i >= i + 1 && !g.answered; }, i, { timeout: 10000 }).catch(() => null); }
  await battleAnswer(page, false);
  await app(page).waitForFunction(() => !document.getElementById('vb-miss').hidden, null, { timeout: 10000 }).catch(() => null);
  await click(page, '#vb-missNext');
  await app(page).waitForFunction(() => !document.getElementById('vb-popup').hidden, null, { timeout: 10000 }).catch(() => null);
  await sleep(300);
  return app(page).evaluate(() => ({ popup: !document.getElementById('vb-popup').hidden, kicker: document.getElementById('vb-kicker').textContent, newBest: document.getElementById('vb-newBest').hidden ? '' : document.getElementById('vb-newBest').textContent, best: document.getElementById('vb-best').textContent }));
}
const gameReady = (page) => app(page).waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 90000 }).catch(() => null);
// Relaxed (no clock), start, lock in at once with nothing painted (0 points) or with every number mixed from every paint
async function gameLock(page, { paint = false } = {}) {
  await gameReady(page);
  await click(page, '#gameStart');
  await app(page).waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 40000 });
  await sleep(300);
  if (paint) await app(page).evaluate(() => { for (const n of document.querySelectorAll('#gameNumbers .game-number')) { n.click(); for (const b of document.querySelectorAll('#gamePaints button')) b.click(); } });
  await click(page, '#gameLock');
  await app(page).waitForFunction(() => !document.getElementById('gamePopup').hidden, null, { timeout: 40000 }).catch(() => null);
  await sleep(1500);
  return app(page).evaluate(() => ({ popup: !document.getElementById('gamePopup').hidden, pct: document.getElementById('gamePct').textContent, newBest: document.getElementById('gameNewBest').hidden ? '' : document.getElementById('gameNewBest').textContent.trim(), notes: /this visit|not (be )?(kept|saved)|storage|could not/i.test(document.getElementById('gameResult').innerText) }));
}
async function gameBack(page) { await tab(page, 'study'); await tab(page, 'game'); await gameReady(page); }

// a localStorage filled until any write throws (the quota), what is already there kept
const fillStorage = (page) => app(page).evaluate(() => { let n = 0; for (const size of [256 * 1024, 64 * 1024, 16 * 1024, 4 * 1024, 1024, 256, 64, 16, 4, 1]) { const chunk = 'x'.repeat(size); for (let k = 0; k < 4000; k++) { try { localStorage.setItem('filler.' + n, chunk); n++; } catch (e) { break; } } } let full = false; try { localStorage.setItem('filler.probe', 'y'); localStorage.removeItem('filler.probe'); } catch (e) { full = true; } return { n, full }; });
const dropFiller = (page) => app(page).evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('filler.')).forEach((k) => localStorage.removeItem(k)); });


// ---- segment: visit ---------------------------------------------------------------------------------------------------------------
seg('visit', 25, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  t.check((await keysOf(page)).length === 0, 'a first visit stores nothing in localStorage', await keysOf(page));
  // every tab but Pose and light (its own segments), the way a visitor opens them
  for (const name of ['loomis', 'help', 'game', 'battle', 'figure', 'study']) await tab(page, name, { wait: false }).then(() => sleep(400));
  t.check((await keysOf(page)).length === 0, 'opening the Study, Loomis, How to use, Paint by numbers, Value battle and Figure study tabs stores nothing', await keysOf(page));
  await openStudio(page);
  const note1 = await toastNow(page);
  t.check(/Your painting is saved in this browser as you go\./.test(note1), 'the first time the Studio opens it says the painting is saved in this browser as you go', note1);
  t.check(J(await keysOf(page)) === J([P + 'studioNotice']), 'opening the Studio stores one thing: whether its one-time saving note was shown (the README lists it)', await keysOf(page));
  const other = await app(page).evaluate(async () => ({
    session: sessionStorage.length, cookie: document.cookie,
    caches: window.caches ? await caches.keys() : [],
    workers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    databases: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : null,
  }));
  t.check(other.session === 0 && other.cookie === '' && other.caches.length === 0 && other.workers === 0, 'the site keeps nothing in session storage, cookies, Cache Storage or a service worker', other);
  t.check(!other.databases || other.databases.every((n) => n === 'portrait-value-studio'), 'the one database is portrait-value-studio, the one the README names', other.databases);
  const rec = await record(page);
  t.check(rec === null, 'a Studio never painted on has no saved painting', rec);
  await reload(page); await openStudio(page);
  t.check(!/saved in this browser as you go/.test(await toastNow(page)), 'and it does not say so again on the next visit', await toastNow(page));
  // Pose and light on its own page: opening it, choosing a pose, the mode switch and Save this pose write exactly the three keys the README lists
  const pose = await open(pages, site, { url: 'pose.html', waitUntil: 'domcontentloaded' });
  await poseUp(pose);
  t.check((await keysOf(pose)).length === 0, 'opening Pose and light on its own page stores nothing', await keysOf(pose));
  await pose.evaluate(() => document.querySelector('#poses .pose-btn[data-id="wave"]').click());
  t.check(J(await keysOf(pose)) === J([PL + 'v2']), 'choosing a pose stores pose-and-light.v2 and nothing else', await keysOf(pose));
  await pose.evaluate(() => { document.getElementById('savePose').click(); document.querySelector('[data-mode="advanced"]').click(); });
  t.check(J(await keysOf(pose)) === J([PL + 'mine.v1', PL + 'mode', PL + 'v2']), 'Save this pose and the mode switch add pose-and-light.mine.v1 and pose-and-light.mode, the keys the README lists', await keysOf(pose));
  const kept = JSON.parse(await storageGet(pose, PL + 'mine.v1'));
  t.check(Array.isArray(kept) && kept.length === 1 && !JSON.stringify(kept).includes('data:') && typeof kept[0].p === 'object' && JSON.stringify(kept).length < 4000, 'a saved pose is joint angles and a viewpoint, no picture (the Privacy table)', { n: kept.length, bytes: JSON.stringify(kept).length });
  const readme = fs.readFileSync(path.join(site.root, 'README.md'), 'utf8');
  const claims = /Save this pose\*\* keeps up to 12 of your own, with pictures, in this browser/.test(readme);
  t.check(!claims, 'the README describes a saved pose the same way in both places it does: joint angles and a viewpoint, no pictures', claims ? 'Pose library: "keeps up to 12 of your own, with pictures, in this browser"' : '');
  if (claims) t.finding({
    title: 'The README says saved poses are kept "with pictures"; the Privacy section, and the code, say no pictures',
    severity: 'low',
    steps: '1. Read README.md, "Pose library" (Pose and light): "Save this pose keeps up to 12 of your own, with pictures, in this browser". 2. Read "Privacy": "up to twelve saved poses as joint angles and a viewpoint, no pictures (pose-and-light.mine.v1)". 3. Open Pose and light, Save this pose, and read localStorage pose-and-light.mine.v1.',
    expected: 'One statement. The Privacy section is the list of what the site keeps and what Forget clears, so it must be the true one.',
    actual: `The stored pose is ${JSON.stringify(kept).length} bytes of joint angles and a viewpoint with no data: URL or image; the pictures in the library are drawn again from them each time the page opens. The Pose library paragraph says they are kept.`,
    cause: 'README.md, Pose and light, "Pose library" paragraph (the sentence ends "with pictures, in this browser"); js/pose.js changeMine (about 1396) stores { id, p, view } only.',
  });
  await clean(t, page, 'visit: app'); await clean(t, pose, 'visit: Pose and light');
});

// ---- segment: roundtrip -----------------------------------------------------------------------------------------------------------
seg('roundtrip', 60, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  // -- the Study tab: mode, smoothing, lean, block view, drawers, picked colors, the unit on my canvas, paints
  await click(page, '[data-mode="advanced"]');
  await click(page, '#smoothSoft');
  await setRange(page, 'lean', 30);
  await click(page, '[data-block-view="palette"]');
  await click(page, '#drawer-colors > summary'); await click(page, '#drawer-swatches > summary');
  await app(page).evaluate(() => { [[10, 20, 30], [200, 100, 50], [250, 250, 240]].forEach(([r, g, b]) => Studio.addColor({ r, g, b }, true)); });
  await app(page).evaluate(() => { const s = document.getElementById('canvasSize'); s.value = '12.6'; s.dispatchEvent(new Event('input', { bubbles: true })); const y = document.getElementById('canvasSys'); y.value = 'in'; y.dispatchEvent(new Event('change', { bubbles: true })); });
  await click(page, '#srcMine');
  await app(page).evaluate(() => { const s = document.getElementById('paintAddPreset'); s.value = 'rembrandt'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await setRange(page, 'paintMax', 8);
  // -- Value battle and Paint by numbers
  await tab(page, 'battle');
  await setSelect(page, 'vb-palette', 'primary'); await click(page, '#vbCount3'); await click(page, '#vbMode2');
  await tab(page, 'game'); await gameReady(page);
  await setSelect(page, 'gameMode', 'relaxed'); await setRange(page, 'gameAmount', 3); await click(page, '#gameSound'); await click(page, '#tab-game [data-ref-view="blocks"]');
  await click(page, '#gameFromPainting'); await sleep(800);
  const painting = await app(page).evaluate(() => document.getElementById('gamePaintingName').textContent);
  // -- Figure study: the class, the time, the poses taken out
  await tab(page, 'figure', { wait: false });
  await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 90000 }).catch(() => null);
  await click(page, '#fig-timed'); await click(page, '#fig-t60'); await click(page, '#tab-figure [data-pose-id="stand"]'); await click(page, '#tab-figure [data-pose-id="walk"]');
  // -- the Studio: ground, wash, texture, the paper turned, a stroke, a locked mix
  await openStudio(page);
  await click(page, '#ps-canvasSheet [data-ground="wash"]');
  const wash = await app(page).evaluate(() => { const b = [...document.querySelectorAll('#ps-washRow button')]; const last = b[b.length - 1]; last.click(); return { n: b.length, name: document.getElementById('ps-washName').textContent }; });
  await setRange(page, 'ps-washStr', 45);
  await click(page, '#ps-canvasSheet [data-weave="linen"]');
  await click(page, '#ps-orient');
  await click(page, '[data-sketch-show="0"]');
  const turned = await paperSize(page);
  await line(page, 0.8);
  const strokeDone = Date.now();
  const locked = await lockMix(page, 2);
  // the mix locked in Figure study's own copy of the Studio is kept under its own key
  const figMixes = await app(page).evaluate(() => { document.querySelectorAll('#fs-paints .ps-paint')[2].click(); document.getElementById('fs-lock').click(); return document.querySelectorAll('#fs-mixes .ps-mix').length; });
  // (what the Study tab does not keep: noted below)
  await tab(page, 'study');
  await setRange(page, 'simplify', 9); await setRange(page, 'colors', 5);
  await openStudio(page);
  const rec = await waitRecord(page, (r) => r.sketchShown === false && r.savedAt > strokeDone);
  const before = await dumpOf(page);
  const KNOWN = ['palette', 'canvasUnit', 'smoothing', 'blockView', 'lean', 'drawers', 'mode', 'battlePalette', 'battleCount', 'battleMode', 'battleBest', 'myPaints', 'figureStudy', 'figureMixes', 'gameAmount', 'gameSound', 'gameBest', 'gameLevel', 'gamePalette', 'gameSubject', 'gamePainting', 'gameRefView', 'gameMode', 'paintMixes', 'studioNotice', 'paintChoice'].map((k) => P + k);
  t.check(Object.keys(before).every((k) => KNOWN.includes(k)), 'every key written is one of the 26 the code names (and the README\'s Privacy table describes by what they hold)', Object.keys(before).filter((k) => !KNOWN.includes(k)));
  t.check(P + 'figureMixes' in before && figMixes >= 1, 'a mix locked in Figure study\'s own paper is kept under figureMixes', { figMixes, stored: before[P + 'figureMixes'] });
  t.note(`keys this segment wrote: ${Object.keys(before).map((k) => k.replace(P, '')).join(', ')}; keys the code can write that it did not: ${KNOWN.filter((k) => !(k in before)).map((k) => k.replace(P, '')).join(', ')}`);
  t.check(!!rec && rec.canvas && rec.canvas.ground === 'wash' && rec.canvas.weave === 'linen' && Math.abs(rec.canvas.washStr - 0.45) < 0.01, 'the Studio saved its ground, wash strength and texture with the painting', rec);
  t.check(turned.w > turned.h && !!rec && rec.w === turned.w && rec.h === turned.h, 'the Studio saved the paper turned to landscape, at its size', { turned, rec });

  for (const round of [1, 2]) {
    await reload(page);
    const label = round === 1 ? 'after a reload' : 'after a second reload';
    const after = await dumpOf(page);
    // (gamePainting holds the portrait last dealt, so the next one is never the same: it changes by design)
    const rewritten = Object.keys(after).filter((k) => after[k] !== before[k] && k !== P + 'gamePainting').concat(Object.keys(before).filter((k) => !(k in after)));
    t.check(rewritten.length === 0, `${label}: the page rewrote none of the ${Object.keys(before).length} saved values`, rewritten);
    t.check(/^[a-z]+-\d+$/.test(JSON.parse(after[P + 'gamePainting'] || '""')), `${label}: the last painting dealt is kept as a portrait id`, after[P + 'gamePainting']);
    t.check(await app(page).evaluate(() => !document.body.classList.contains('mode-simple')) && (await pressed(page, '[data-mode="advanced"]')) === 'true', `${label}: Advanced is still chosen`);
    t.check((await checked(page, '#smoothSoft')) === true && (await checked(page, '#smoothEdge')) === false, `${label}: Soft smoothing is still chosen`);
    t.check((await val(page, '#lean')) === '30' && (await text(page, '#leanOut')) === '30%', `${label}: Lean toward lighter tones still reads 30%`, [await val(page, '#lean'), await text(page, '#leanOut')]);
    t.check((await pressed(page, '[data-block-view="palette"]')) === 'true', `${label}: the color blocks are still shown as the palette mixes them`);
    t.check(await app(page).evaluate(() => document.getElementById('drawer-colors').open && document.getElementById('drawer-swatches').open && !document.getElementById('drawer-values').open && !document.getElementById('drawer-check').open), `${label}: the Colors and paints and Picked colors drawers are still open and the others closed`);
    t.check(J(await app(page).evaluate(() => [...document.querySelectorAll('#swatches .swatch-meta span:first-child')].map((s) => s.textContent))) === J(['#0A141E', '#C86432', '#FAFAF0']), `${label}: the three picked colors are back, in the order they were picked`, await app(page).evaluate(() => [...document.querySelectorAll('#swatches .swatch-meta span:first-child')].map((s) => s.textContent)));
    t.check((await val(page, '#canvasSize')) === '12.6' && (await val(page, '#canvasSys')) === 'in', `${label}: the unit on my canvas still reads 12.6 in`, [await val(page, '#canvasSize'), await val(page, '#canvasSys')]);
    t.check((await checked(page, '#srcMine')) === true && (await val(page, '#paintMax')) === '8', `${label}: My paints and eight paints on the palette are still chosen`, [await checked(page, '#srcMine'), await val(page, '#paintMax')]);
    const mine = await app(page).evaluate(() => document.getElementById('mineCount').textContent);
    t.check(/9/.test(mine), `${label}: the nine ticked paints of Rembrandt's palette are still ticked`, mine);
    await tab(page, 'battle');
    t.check((await val(page, '#vb-palette')) === 'primary' && (await checked(page, '#vbCount3')) && (await checked(page, '#vbMode2')), `${label}: Value battle is still on Three primaries, three colors, two minutes`, [await val(page, '#vb-palette'), await checked(page, '#vbCount3'), await checked(page, '#vbMode2')]);
    await tab(page, 'game'); await gameReady(page);
    t.check((await val(page, '#gameMode')) === 'relaxed', `${label}: Paint by numbers is still in Relaxed mode`, await val(page, '#gameMode'));
    t.check((await val(page, '#gameAmount')) === '3', `${label}: the amount per tap is still two parts`, await val(page, '#gameAmount'));
    t.check((await pressed(page, '#tab-game [data-ref-view="blocks"]')) === 'true', `${label}: the game's reference is still shown as Blocks`);
    t.check(await app(page).evaluate(() => !!document.querySelector('input[name="gameSubject"][value="painting"]').checked) && /after /.test(await text(page, '#gamePaintingName')), `${label}: Paint by numbers is still set to A painting, with a painting dealt`, await text(page, '#gamePaintingName'));
    t.check((await pressed(page, '#gameSound')) === 'false' && (await app(page).evaluate(() => document.getElementById('gameSound').title)) === 'Sound and vibration off', `${label}: the game's speaker button still says the sound is off`, [await pressed(page, '#gameSound'), await app(page).evaluate(() => document.getElementById('gameSound').title)]);
    await tab(page, 'figure', { wait: false });
    await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 90000 }).catch(() => null);
    const fig = await app(page).evaluate(() => ({ timed: document.getElementById('fig-timed').checked, t60: document.getElementById('fig-t60').checked, out: [...document.querySelectorAll('#tab-figure .fig-pose[aria-pressed="false"]')].map((b) => b.dataset.poseId) }));
    t.check(fig.timed && fig.t60 && J(fig.out.sort()) === J(['stand', 'walk']), `${label}: Figure study is still Timed at a minute a pose, with Stand and Walk taken out`, fig);
    await openStudio(page);
    t.check((await pressed(page, '#ps-canvasSheet [data-ground="wash"]')) === 'true' && (await pressed(page, '#ps-canvasSheet [data-weave="linen"]')) === 'true' && (await text(page, '#ps-washOut')) === '45%', `${label}: the Studio's toned wash at 45% and linen texture are still on`, [await pressed(page, '#ps-canvasSheet [data-ground="wash"]'), await pressed(page, '#ps-canvasSheet [data-weave="linen"]'), await text(page, '#ps-washOut')]);
    t.check((await app(page).evaluate(() => document.getElementById('ps-washName').textContent)) === wash.name && !!wash.name, `${label}: the wash is still the same paint`, [wash.name, await text(page, '#ps-washName')]);
    const size = await paperSize(page);
    t.check(size.w === turned.w && size.h === turned.h && size.w > size.h, `${label}: the paper is still turned to landscape, at ${turned.w} × ${turned.h}`, size);
    t.check((await band(page, ...BOTTOM)) > 100, `${label}: the stroke is on the paper`, await band(page, ...BOTTOM));
    t.check((await pressed(page, '[data-sketch-show="0"]')) === 'true', `${label}: the underdrawing is still hidden`, await pressed(page, '[data-sketch-show="0"]'));
    t.check((await mixCount(page)) === locked, `${label}: the locked mix is among the Studio's mixes (${locked} in all)`, await mixCount(page));
    t.check((await app(page).evaluate(() => document.querySelectorAll('#fs-mixes .ps-mix').length)) === figMixes, `${label}: the mix locked in Figure study is among its mixes (${figMixes} in all)`, await app(page).evaluate(() => document.querySelectorAll('#fs-mixes .ps-mix').length));
    t.check(await toastNow(page) === '' || /back from last time/.test(await toastNow(page)), `${label}: the Studio says its painting is back, and nothing worse`, await toastNow(page));
    await tab(page, 'study');
    if (round === 1) t.note(`not kept across a reload (the README promises none of it): the Simplify slider set to 9 reads ${await val(page, '#simplify')} and Colors in each value set to 5 reads ${await val(page, '#colors')} after it`);
    await clean(t, page, `roundtrip ${label}`);
  }
  t.note(`the wash chosen in the Studio was "${wash.name}" (the last of ${wash.n} buttons); the portrait dealt to Paint by numbers was "${painting}"`);

  // -- Pose and light, on its own page: the pose, the light, the mode and a saved pose
  const pose = await open(pages, site, { url: 'pose.html', waitUntil: 'domcontentloaded' });
  await poseUp(pose);
  await pose.evaluate(() => { document.querySelector('#poses .pose-btn[data-id="wave"]').click(); document.querySelector('[data-mode="advanced"]').click(); });
  await pose.evaluate(() => { for (const [id, v] of [['lAz', 100], ['lEl', 22], ['lDist', 3.4], ['lSoft', 6], ['lFill', 70]]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } document.getElementById('savePose').click(); });
  const sent = await pose.evaluate(() => ({ pose: JSON.stringify(PoseAndLight.pose), light: { ...PoseAndLight.light } }));
  const stored = JSON.parse(await storageGet(pose, PL + 'v2'));
  t.check(stored && JSON.stringify(stored.pose) === sent.pose && stored.light.az === 100 && stored.light.soft === 6 && stored.light.fill === 70, 'Pose and light stored the pose and the light as they stand', stored && stored.light);
  await poseReload(pose);
  const back = await pose.evaluate(() => ({ cont: !document.getElementById('continueWrap').hidden, mode: PoseAndLight.mode(), mine: document.querySelectorAll('#mine .pose-item').length, light: { ...PoseAndLight.light }, pose: JSON.stringify(PoseAndLight.pose), aria: document.querySelector('[data-mode="advanced"]').getAttribute('aria-pressed') }));
  t.check(back.cont, 'Pose and light after a reload offers Where you left off');
  t.check(back.pose === sent.pose, 'the pose is the pose that was left, joint for joint', { same: back.pose === sent.pose });
  t.check(back.light.az === 100 && back.light.el === 22 && back.light.dist === 3.4 && back.light.soft === 6 && back.light.fill === 70, 'the light is the light that was left (around, up, distance, softness, fill)', back.light);
  t.check(back.mode === 'advanced' && back.aria === 'true', 'the page on its own remembers Advanced', back.mode);
  t.check(back.mine === 1, 'the saved pose is in the library', back.mine);
  await clean(t, pose, 'roundtrip: Pose and light');
});

// ---- segment: older ---------------------------------------------------------------------------------------------------------------
// What earlier versions of the site saved (found with git log -p on js/): the keys of tabs that were taken out (Paint it in steps,
// Train your eye, the warm / cool map, the first My paints lists), the Value battle's best under a level and then under a count only,
// the Paint by numbers subject with its portrait, preset ids and paint codes that are gone (zorn-ub, classic, earth; W, CR, CY), the
// Figure study class saved as the poses chosen (ids) and not the poses taken out, drawers of tabs that went, and Pose and light's
// first light (az and el only) and a saved pose with no viewpoint.
const OLD = {
  [P + 'battleLevel']: '"hard"',
  [P + 'battleBest']: { 'zorn:easy': 7, 'zorn:mix': 12, 'primary:3': 4 },
  [P + 'battlePalette']: '"zorn-ub"',
  [P + 'gamePalette']: '"classic"',
  [P + 'gameSubject']: { kind: 'painting', id: 'rembrandt-12' },
  [P + 'gamePainting']: '"rembrandt-12"',
  [P + 'gameBest']: { 'sample-study:600x750|medium|zorn': 640, 'sample-study:600x750|hard|classic': 500 },
  [P + 'gameLevel']: '"hard"',
  [P + 'myPaints']: ['W', 'CR', 'CY', 'YO', 'IB', 'AC'],
  [P + 'paintChoice']: { source: 'preset', preset: 'earth', max: 6 },
  [P + 'paintMixes']: [{ parts: [{ code: 'W', amount: 2 }, { code: 'YO', amount: 1 }] }],
  [P + 'figureStudy']: { mode: 'timed', secs: 30, ids: ['stand', 'walk', 'sit'] },
  [P + 'paints']: { active: 'mine', lists: { mine: ['W', 'CR'] }, show: true },
  [P + 'lesson-step']: '3', [P + 'next-step-only']: 'true',
  [P + 'eye-stats']: { rounds: 12, right: 9 }, [P + 'temp']: { axis: 'warm', mode: 'x', detail: 1, gain: 1, fade: 1 },
  [P + 'drawers']: ['values', 'steps', 'eye', 'swatches'],
  [PL + 'v2']: { pose: { shoulderL: { z: 90 } }, light: { az: 100, el: 20 } },
  [PL + 'mine.v1']: [{ id: 'mine-1730000000000', p: { kneeR: { x: 40 } } }],
};
seg('older', 55, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  await put(page, OLD);
  await reload(page);
  t.check(await app(page).evaluate(() => document.getElementById('toast').textContent.trim() === '' || !/could not be read|went wrong/i.test(document.getElementById('toast').textContent)), 'with the keys of earlier versions saved, the page opens without saying something went wrong', await toastNow(page));
  await clean(t, page, 'older: opening');
  t.check(await app(page).evaluate(() => document.getElementById('drawer-values').open && document.getElementById('drawer-swatches').open && !document.getElementById('drawer-colors').open), 'the saved drawers that still exist are open; the names of drawers that went are ignored');
  // Colors and paints: the old preset id is no preset, the old codes are not paints, the new ones are kept
  await click(page, '[data-mode="advanced"]');
  const paints = await app(page).evaluate(() => ({ mine: document.getElementById('mineCount').textContent, source: document.querySelector('input[name="paintSource"]:checked').value, pressed: [...document.querySelectorAll('#presetList .preset')].filter((b) => b.getAttribute('aria-pressed') === 'true').length, max: document.getElementById('paintMax').value }));
  t.check(/3/.test(paints.mine), 'My paints keeps the three codes that exist (YO, IB, AC) and drops W, CR and CY, which are gone', paints.mine);
  t.check(paints.source === 'preset' && paints.max === '6', 'the saved choice (known palettes, six paints) is read; the palette "earth" of an earlier version is not a palette now', paints);
  // Value battle
  await tab(page, 'battle');
  const vb = await app(page).evaluate(() => { const s = document.getElementById('vb-palette'); return { value: s.value, ok: [...s.options].some((o) => o.value === s.value), best: document.getElementById('vb-best').textContent, count: document.querySelector('input[name="vbCount"]:checked').value, mode: document.querySelector('input[name="vbMode"]:checked').value }; });
  t.check(vb.ok && vb.value !== 'zorn-ub', 'Value battle: the palette "zorn-ub" of an earlier version is not on the menu, and the menu holds a palette that exists', vb);
  t.check(/^(No streak yet for these settings\.|Your best streak here: \d+ in a row\.)$/.test(vb.best), 'Value battle: the best line reads as a best line, whatever the old keys said', vb.best);
  const streak = await battleStreak(page, 1);
  const bests = JSON.parse(await storageGet(page, P + 'battleBest'));
  t.check(streak.popup && /New best/.test(streak.newBest) && bests && typeof bests === 'object' && Object.values(bests).every((v) => Number.isInteger(v)), 'Value battle: a streak played on top of the old record is kept as a new best, and the record is still numbers', { streak, bests });
  t.check(['zorn:easy', 'zorn:mix', 'primary:3'].every((k) => k in bests), 'Value battle: the earlier version\'s entries are left where they were (they age out with the fifty)', Object.keys(bests));
  // Paint by numbers
  await tab(page, 'game'); await gameReady(page);
  const g = await app(page).evaluate(() => { const s = document.getElementById('gamePalette'); return { palette: s.value, ok: [...s.options].some((o) => o.value === s.value), options: [...s.options].map((o) => o.value), subject: document.querySelector('input[name="gameSubject"]:checked').value, name: document.getElementById('gamePaintingName').textContent, level: document.querySelector('input[name="gameLevel"]:checked').value, best: document.getElementById('gameBest').textContent }; });
  t.check(g.ok && g.palette !== 'classic', 'Paint by numbers: the palette "classic" of an earlier version is not on the menu, and the menu holds a palette that exists', g);
  t.check(g.options.includes('mine'), 'Paint by numbers: the three paints that survive (two are enough) make a My paints palette', g.options);
  t.check(g.subject === 'painting' && /after (Rembrandt|Zorn|Sargent|Sorolla|Velázquez|Frans Hals|Vermeer)\.$/.test(g.name), 'Paint by numbers: a painting saved by its id is a painting subject, with a portrait dealt and named', g);
  t.check(g.level === 'hard' && !/NaN|undefined|null/.test(g.best), 'Paint by numbers: the saved level is read and the best line carries no NaN', g);
  // Figure study
  await tab(page, 'figure', { wait: false });
  await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 90000 }).catch(() => null);
  const fig = await app(page).evaluate(() => ({ timed: document.getElementById('fig-timed').checked, t30: document.getElementById('fig-t30').checked, out: document.querySelectorAll('#tab-figure .fig-pose[aria-pressed="false"]').length, all: document.querySelectorAll('#tab-figure .fig-pose').length, note: document.getElementById('fig-mix').textContent }));
  t.check(fig.timed && fig.t30 && fig.out === 0 && fig.all >= 30, 'Figure study: a class saved as the poses chosen (ids) keeps its mode and time, and every pose is in the class (nothing is taken out)', fig);
  // the Studio's mix with a code that is gone
  await openStudio(page);
  const mixes = await app(page).evaluate(() => [...document.querySelectorAll('#ps-mixes .ps-mix')].map((b) => b.title));
  t.check(mixes.length === 9, 'the Studio shows its eight starting mixes and the one saved mix, whose white (W) is no paint now', mixes);
  t.note(`a saved mix of "W 2 · YO 1" is shown as "${mixes[mixes.length - 1]}": a paint code the library no longer has is dropped from the mix, so the mix is another color (the mix is kept, not the white)`);
  await clean(t, page, 'older: every tab');
  // Pose and light: the first light, a saved pose with no viewpoint (in a tab of the same browser, which holds the same keys)
  const pose = await newTab(site, page, { url: 'pose.html' });
  await poseUp(pose);
  const pl = await pose.evaluate(() => ({ cont: !document.getElementById('continueWrap').hidden, light: { ...PoseAndLight.light }, sho: PoseAndLight.pose.shoulderL, mine: [...document.querySelectorAll('#mine .pose-item')].length, hip: PoseAndLight.pose.height }));
  t.check(pl.cont && pl.light.az === 100 && pl.light.el === 20 && pl.light.dist === 2.6 && pl.light.soft === 3 && pl.light.fill === 40, 'Pose and light: a light saved with az and el only keeps those and starts the rest at their defaults', pl.light);
  t.check(pl.sho.z === 90 && pl.mine === 1, 'Pose and light: a pose with only some joints stands the rest straight, and a saved pose with no viewpoint is in the library', pl);
  await pose.evaluate(() => document.querySelector('#mine .pose-btn').click());
  t.check(await pose.evaluate(() => PoseAndLight.pose.kneeR.x === 40), 'Pose and light: that saved pose can be put on the figure', await pose.evaluate(() => PoseAndLight.pose.kneeR));
  await clean(t, pose, 'older: Pose and light');
  // Forget sweeps the keys nothing reads any more
  await tab(page, 'help'); await click(page, '#forgetBtn');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => null), click(page, '#forgetBtn')]);
  await sleep(1500);
  t.check((await siteKeys(page)).length === 0, 'Forget my work removes every key, those of earlier versions included', await siteKeys(page));
  await clean(t, page, 'older: Forget');
});


// ---- segment: studio --------------------------------------------------------------------------------------------------------------
seg('studio', 60, async (t, site, pages) => {
  const page = await open(pages, site);
  await openStudio(page);
  // the first stroke, saved: the baseline everything below is measured against
  await line(page, 0.8);
  const base = await waitRecord(page, (r) => r.savedAt > Date.now() - 600000 && r.paper);
  const full = await band(page, ...BOTTOM);
  t.check(!!base && full > 100, 'a stroke is saved a moment after it is made', { full, base });
  // -- a stroke followed by a reload: at once, while the save is under way, and well after it
  let topFull = 0;
  const trials = {};
  async function trial(pg, wait, into) {
    await openStudio(pg);
    const wasTop = await band(pg, ...TOP);
    await line(pg, 0.2);
    if (!topFull) topFull = (await band(pg, ...TOP)) - wasTop;
    await sleep(wait);
    await reload(pg);
    await openStudio(pg);
    into[wait] = { bottom: await band(pg, ...BOTTOM), top: await band(pg, ...TOP) };
    // a fresh start for the next trial: the top half cleared and saved (by a stroke elsewhere, which also makes the record newer)
    await app(pg).evaluate(() => { const c = document.getElementById('ps-paper'); c.getContext('2d').clearRect(0, 0, c.width, Math.floor(c.height * 0.5)); });
    await line(pg, 0.8);
    const mark = Date.now();
    await waitRecord(pg, (r) => r.savedAt > mark);
    return into[wait];
  }
  for (const wait of [0, 900, 2500]) {
    const r = await trial(page, wait, trials);
    t.check(r.bottom > full * 0.9, `a reload ${wait} ms after a stroke leaves the painting saved before it whole`, { full, bottom: r.bottom });
    if (wait === 2500) t.check(r.top > topFull * 0.8, 'a stroke followed by a reload 2.5 s later is kept', { topFull, top: r.top });
    else t.check(r.top === 0 || r.top > topFull * 0.8, `a reload ${wait} ms after a stroke keeps the stroke whole or not at all, never half of it`, { topFull, top: r.top });
  }
  t.note(`a stroke followed by a reload, on this machine: after 0 ms the stroke ${trials[0].top > 0 ? 'was kept' : 'was lost'}, after 900 ms ${trials[900].top > 0 ? 'was kept' : 'was lost'}, after 2500 ms ${trials[2500].top > 0 ? 'was kept' : 'was lost'} (whether the save on pagehide gets done depends on how fast the paper is encoded and the next page arrives)`);
  // the same on a device that takes a few hundred milliseconds to encode the paper (a phone or an iPad, or a busy computer): the page
  // is gone before the pictures are
  const slow = await open(pages, site);
  await slow.addInitScript(() => { const orig = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) { setTimeout(() => orig.call(this, cb, ...rest), 400); }; });
  await reload(slow);
  await openStudio(slow);
  await line(slow, 0.8);
  await waitRecord(slow, (r) => r.savedAt > Date.now() - 600000 && r.paper, 30000);
  const slowTrials = {};
  for (const wait of [0, 300]) {
    const r = await trial(slow, wait, slowTrials);
    t.check(r.bottom > full * 0.9, `on a slow device a reload ${wait} ms after a stroke leaves the painting saved before it whole`, { full, bottom: r.bottom });
  }
  t.check(slowTrials[0].top > 0 && slowTrials[300].top > 0, 'a stroke made a moment before the page goes (a reload, a closed tab) is still there next time, on a device that takes 0.4 s to encode the paper: the Help tab says a closed tab loses nothing', { slow: slowTrials, here: trials });
  if (slowTrials[0].top === 0 && slowTrials[300].top === 0) t.finding({
    title: 'A stroke made less than about a second before a reload or a closed tab is lost: the save on pagehide cannot finish',
    severity: 'low',
    steps: '1. Open the Studio (index.html#paint) on a phone, a tablet or a busy computer (here: a browser whose canvas.toBlob takes 0.4 s) and paint a stroke across the paper; wait two seconds (it is saved). 2. Paint a second stroke and reload the page (or close the tab) at once, or 300 ms after the stroke. 3. Open the Studio again.',
    expected: 'README, Simple and Advanced: "The Studio keeps your work: the paper, the underdrawing, ... are saved in the browser a moment after each change ... and come back on the next visit"; the Help tab: "Close the tab, come back later, and it is still there." js/painting.js says that a change still waiting is saved as the page goes (pagehide).',
    actual: `The second stroke is gone after the reload at 0 and 300 ms (${J(slowTrials)}); the painting saved before it is whole. In this browser at normal speed: ${J(trials)} (the save is a race with the unload, and on this machine ${trials[0].top > 0 ? 'it was won' : 'it was lost too'}).`,
    cause: 'js/painting.js saveNowIfDue (532-533) answers pagehide by calling saveNow, but saveNow awaits two canvas.toBlob() encodings and then an IndexedDB write (472-480), none of which a page that is unloading is given time for, so the record is never written. A save already under way (the 800 ms delay has passed, the pictures are being encoded) is cut off the same way. Taking the pixels synchronously at pagehide (getImageData, put in the record as ImageData) or encoding after every stroke ends, not 0.8 s later, would keep it.',
  });
  await clean(t, slow, 'studio: slow encoder');

  // -- hiding the page (a phone switching apps) saves at once, and the page stays up to finish it
  await openStudio(page);
  await app(page).evaluate(() => { const c = document.getElementById('ps-paper'); c.getContext('2d').clearRect(0, 0, c.width, c.height); });
  await line(page, 0.2);
  const strokeDone = Date.now();
  const hiddenAt = await app(page).evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); const at = Date.now(); document.dispatchEvent(new Event('visibilitychange')); return at; });
  const hid = await waitRecord(page, (r) => r.savedAt >= strokeDone - 50, 30000);
  await app(page).evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  t.check(!!hid && hid.savedAt - hiddenAt < 500, 'hiding the page saves the last stroke at once, without waiting out the 0.8 s', { delay: hid ? hid.savedAt - hiddenAt : null });
  await reload(page); await openStudio(page);
  t.check((await band(page, ...TOP)) > 100, 'the stroke saved on hiding is on the paper after a reload', await band(page, ...TOP));

  // -- Clear the paper (two taps) is kept; Undo brings the paper back and that is kept too
  await openStudio(page);
  await app(page).evaluate(() => { const c = document.getElementById('ps-paper'); c.getContext('2d').clearRect(0, 0, c.width, c.height); });
  await line(page, 0.8);
  let mark = Date.now();
  await waitRecord(page, (r) => r.savedAt > mark);
  mark = Date.now();
  await click(page, '#ps-clear'); await sleep(200); await click(page, '#ps-clear');
  t.check((await band(page, ...BOTTOM)) === 0, 'two taps on Clear empty the paper');
  const cleared = await waitRecord(page, (r) => r.savedAt > mark);
  await reload(page); await openStudio(page);
  t.check(!!cleared && (await band(page, ...BOTTOM)) === 0, 'a cleared paper stays cleared after a reload', await band(page, ...BOTTOM));
  await line(page, 0.8);
  mark = Date.now(); await waitRecord(page, (r) => r.savedAt > mark - 100 && r.paper);
  mark = Date.now();
  await click(page, '#ps-clear'); await sleep(200); await click(page, '#ps-clear');
  await waitRecord(page, (r) => r.savedAt > mark);
  mark = Date.now();
  await click(page, '#ps-undo');
  t.check((await band(page, ...BOTTOM)) > 100, 'Undo brings the cleared paper back');
  await waitRecord(page, (r) => r.savedAt > mark);
  await reload(page); await openStudio(page);
  t.check((await band(page, ...BOTTOM)) > 100, 'a paper brought back by Undo is the paper that is saved, and it is back after a reload', await band(page, ...BOTTOM));
  // Undo after a restore goes back to the painting that came back (not to a blank paper), and that is what is kept
  await openStudio(page);
  const restoredInk = await band(page, ...BOTTOM);
  await line(page, 0.2);
  t.check((await band(page, ...TOP)) > 100, 'a stroke on a restored painting is drawn');
  await click(page, '#ps-undo');
  t.check((await band(page, ...TOP)) === 0 && (await band(page, ...BOTTOM)) > restoredInk * 0.9, 'and Undo takes back that stroke only, not the painting that came back', [await band(page, ...TOP), await band(page, ...BOTTOM), restoredInk]);
  const undoMark = Date.now();
  await waitRecord(page, (r) => r.savedAt > undoMark);
  await reload(page); await openStudio(page);
  t.check((await band(page, ...TOP)) === 0 && (await band(page, ...BOTTOM)) > restoredInk * 0.9, 'and after a reload the painting is the one Undo left', [await band(page, ...TOP), await band(page, ...BOTTOM)]);
  await clean(t, page, 'studio');
});

// ---- segment: twotabs ---------------------------------------------------------------------------------------------------------------
// Two tabs of the site open at once (the README: the picked colors "are kept in your browser between visits and shared by every tab you
// have the tool open in"; saved poses show in the other page). What else is one record the tab holds whole, so the stale tab writes over
// the other's work?
seg('twotabs', 70, async (t, site, pages) => {
  const a = await open(pages, site);
  const b = await newTab(site, a);
  await appUp(a); await appUp(b);
  // picked colors and My paints follow each other (the control: they are shared by design)
  await app(a).evaluate(() => Studio.addColor({ r: 1, g: 2, b: 3 }, true));
  await app(b).evaluate(() => Studio.addColor({ r: 4, g: 5, b: 6 }, true));
  const sw = (p) => app(p).evaluate(() => [...document.querySelectorAll('#swatches .swatch-meta span:first-child')].map((s) => s.textContent));
  for (const p of [a, b]) await app(p).waitForFunction(() => document.querySelectorAll('#swatches .swatch').length >= 2, null, { timeout: 5000 }).catch(() => null);
  t.check(J(await sw(a)) === J(['#010203', '#040506']) && J(await sw(b)) === J(['#010203', '#040506']), 'a color picked in one tab is picked in the other, in order', [await sw(a), await sw(b)]);
  await app(a).evaluate(() => { const s = document.getElementById('paintAddPreset'); s.value = 'zorn'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await app(b).evaluate(() => { const s = document.getElementById('paintAddPreset'); s.value = 'primary'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  const mineIn = (p) => app(p).evaluate(() => document.getElementById('mineCount').textContent);
  for (const p of [a, b]) await app(p).waitForFunction(() => /^7 /.test(document.getElementById('mineCount').textContent), null, { timeout: 5000 }).catch(() => null);
  t.check(JSON.parse(await storageGet(a, P + 'myPaints')).length === 7 && /7/.test(await mineIn(a)) && /7/.test(await mineIn(b)), 'paints ticked in two tabs are all ticked in both (Zorn and the three primaries share a white: 7 paints)', [JSON.parse(await storageGet(a, P + 'myPaints')), await mineIn(a), await mineIn(b)]);
  // a Forget-free setting set in one tab and read by a tab opened afterwards
  await click(a, '[data-mode="advanced"]');
  const c = await newTab(site, a);
  await appUp(c);
  t.check(await app(c).evaluate(() => !document.body.classList.contains('mode-simple')), 'a tab opened after the switch to Advanced opens in Advanced');
  await c.close();
  // the same with nothing painted in B at all: B only changes the canvas texture (a setting), in a browser of its own
  let textureWipes = null;
  {
    const a2 = await open(pages, site);
    const b2 = await newTab(site, a2);
    await appUp(a2); await appUp(b2);
    await openStudio(a2); await openStudio(b2);
    await line(a2, 0.8);
    let m2 = Date.now();
    await waitRecord(a2, (r) => r.savedAt > m2 - 100);
    m2 = Date.now();
    await click(b2, '#ps-canvasSheet [data-weave="linen"]');
    const wrote = await waitRecord(b2, (r) => r.savedAt > m2);
    await reload(a2); await openStudio(a2);
    const kept2 = await band(a2, ...BOTTOM);
    t.check(kept2 > 100, 'tab A\'s painting is still there after tab B (opened before it, never painted on) changed the canvas texture', { fromA: kept2, bSaved: !!wrote });
    textureWipes = kept2 <= 100 && wrote ? kept2 : null;
    await clean(t, a2, 'twotabs: texture, A'); await clean(t, b2, 'twotabs: texture, B');
  }
  // the Studio's painting: B opened before A painted, A painted and it was saved, then B paints
  await openStudio(a); await openStudio(b);
  await line(a, 0.8);
  let mark = Date.now();
  await waitRecord(a, (r) => r.savedAt > mark - 100);
  mark = Date.now();
  await line(b, 0.2);
  await waitRecord(b, (r) => r.savedAt > mark);
  await reload(a); await openStudio(a);
  const keptA = await band(a, ...BOTTOM), keptB = await band(a, ...TOP);
  t.check(keptA > 100 && keptB > 100, 'after tab A painted and tab B (opened before) then painted, the saved painting holds both strokes', { fromA: keptA, fromB: keptB });
  if (keptA <= 100 && keptB > 100) t.finding({
    title: 'A second tab that was open before the painting was made saves over it: the first tab\'s painting is silently lost',
    severity: 'medium',
    steps: '1. Open the site in tab A and again in tab B (any visitor who opens a link twice, or comes back through a bookmark). 2. In tab A open the Studio, paint a stroke across the bottom and wait two seconds. 3. In tab B (opened before the stroke) open the Studio (it shows a blank paper) and paint a stroke across the top, or only tap Canvas, Linen. 4. Reload tab A and open the Studio.',
    expected: 'The painting saved in tab A is kept (README: "The Studio keeps your work ... saved in the browser a moment after each change ... and come back on the next visit"; the Help tab: "Close the tab, come back later, and it is still there"); the picked colors, My paints and saved poses already follow every open tab, and the second tab at least shows the saved painting before it paints on it.',
    actual: `After the reload tab A shows only tab B's stroke (bottom stroke ${keptA} painted pixels, top stroke ${keptB}); tab A's painting is gone from IndexedDB, with no message to either tab.${textureWipes !== null ? ' B need not paint at all: in a second browser, tab B only tapped Canvas, Linen after tab A\'s stroke was saved, and tab A\'s stroke was gone after its reload (' + textureWipes + ' painted pixels where it had been).' : ''}`,
    cause: 'js/painting.js restore (493) runs once, as the page starts; saveNow (472-480) then writes the whole record under the one key "painting" from this tab\'s canvases, with no look at the record already there (its savedAt) and no change event from other tabs, so a tab whose canvas is older than the stored record replaces it. Re-reading the record when the Studio opens or the tab is shown (or comparing savedAt before writing, and a BroadcastChannel to tell the other tab) would stop it.',
  });
  // the mixes locked in: A locks one, B (opened before) locks another
  const before = await mixCount(a);
  await lockMix(a, 0);
  await lockMix(b, 3);
  const stored = await savedMixes(a);
  await reload(a); await openStudio(a);
  const after = await mixCount(a);
  t.check(after === before + 2 && stored && stored.length === 2, 'a mix locked in tab A and another locked in tab B (opened before) are both kept', { before, after, stored: stored && stored.length });
  if (stored && stored.length === 1) t.finding({
    title: 'A mix locked in one tab is lost when a tab that was open before it locks another: the saved list is the second tab\'s alone',
    severity: 'medium',
    steps: '1. Open the site in tab A and in tab B. 2. In tab A open the Studio, tap a paint and Lock in. 3. In tab B open the Studio, tap another paint and Lock in. 4. Reload tab A and open the Studio, or read localStorage portrait-value-studio.paintMixes.',
    expected: 'README, Studio: "Mixes you lock in are kept between visits." Both locked mixes are kept, as the paints ticked in two tabs are (js/palette.js listens for the storage event and writes on top of the other tab\'s list).',
    actual: `portrait-value-studio.paintMixes holds one mix (${J(stored)}), tab B's; after the reload the Studio has ${after} mixes, not ${before + 2}.`,
    cause: 'js/painting.js saveMixes (825) writes this tab\'s own state.mixes under paintMixes, and the Studio has no storage listener (js/palette.js 447 has one for My paints), so a stale tab overwrites the list. The same holds for the Figure study class (js/figure.js showSetup, 206, writes its own Set of poses taken out) and the open drawers (js/app.js 2752).',
  });
  // the Figure class: the poses taken out in A, then in B
  await tab(a, 'figure', { wait: false }); await tab(b, 'figure', { wait: false });
  for (const p of [a, b]) await app(p).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 90000 }).catch(() => null);
  await click(a, '#tab-figure [data-pose-id="stand"]');
  await app(a).waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').out || []).includes('stand'), P + 'figureStudy', { timeout: 4000 }).catch(() => null);
  await click(b, '#tab-figure [data-pose-id="walk"]');
  await app(b).waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || '{}').out || []).includes('walk'), P + 'figureStudy', { timeout: 4000 }).catch(() => null);
  const fs = JSON.parse(await storageGet(a, P + 'figureStudy') || '{}');
  t.check(J((fs.out || []).slice().sort()) === J(['stand', 'walk']), 'the poses taken out of the Figure class in two tabs are both out', fs);
  if (fs.out && fs.out.length === 1 && fs.out[0] === 'walk') t.finding({
    title: 'Poses taken out of the Figure class in one tab are put back by a second tab that was open before',
    severity: 'low',
    steps: '1. Open the site in tab A and in tab B and open Figure study in both. 2. In tab A tap Stand to take it out of the class. 3. In tab B tap Walk to take it out. 4. Read localStorage portrait-value-studio.figureStudy, or reload tab A.',
    expected: 'README, Privacy: the Figure study class "(Relaxed or Timed, the time a pose gets, the poses taken out)" is kept; both poses stay out, as the picked colors and the paints ticked follow every tab.',
    actual: `figureStudy holds ${J(fs)}: Stand is back in the class, with no sign to tab A.`,
    cause: 'js/figure.js showSetup (206) writes the whole Set of poses taken out that this tab holds (kept = load() is read once, at line 133), without reading what the other tab saved.',
  });
  await clean(t, a, 'twotabs: A'); await clean(t, b, 'twotabs: B');
});

// ---- segment: gamesetup -------------------------------------------------------------------------------------------------------------
// Paint by numbers' setup against Value battle's: what is chosen and kept when it is chosen, or only when a game starts
seg('gamesetup', 40, async (t, site, pages) => {
  const page = await open(pages, site);
  await tab(page, 'game'); await gameReady(page);
  await setSelect(page, 'gameMode', 'relaxed'); await setRange(page, 'gameAmount', 4);
  await click(page, '#gameHard'); await gameReady(page);
  const saved = await dumpOf(page);
  t.check(saved[P + 'gameMode'] === '"relaxed"' && saved[P + 'gameAmount'] === '4', 'Paint by numbers: Mode and the amount per tap are saved the moment they are chosen', saved);
  t.check(P + 'gameLevel' in saved, 'Paint by numbers: Difficulty is saved the moment it is chosen, as Value battle saves its palette, count and mode', Object.keys(saved));
  await reload(page); await tab(page, 'game'); await gameReady(page);
  const back = await app(page).evaluate(() => ({ level: document.querySelector('input[name="gameLevel"]:checked').value, mode: document.getElementById('gameMode').value }));
  t.check(back.level === 'hard' && back.mode === 'relaxed', 'Paint by numbers after a reload: Hard and Relaxed are still chosen', back);
  if (back.mode === 'relaxed' && back.level !== 'hard') t.finding({
    title: 'Paint by numbers keeps its Difficulty only once a game has been started; Mode, the amount per tap and the subject are kept as soon as they are chosen',
    severity: 'low',
    steps: '1. Open Games, Paint by numbers. 2. Choose Hard and Relaxed mode, without starting. 3. Reload the page and open Paint by numbers again.',
    expected: 'The README\'s Privacy section lists "game and battle settings" as kept; Value battle keeps its palette, count and mode when they are chosen, and Paint by numbers does so for its Mode, the amount per tap, the sound and the subject.',
    actual: `After the reload Mode is ${back.mode} but Difficulty is ${back.level}; portrait-value-studio.gameLevel was not written until Start painting (keys after the changes: ${Object.keys(saved).join(', ')}).`,
    cause: 'js/game.js startGame (586-587) is the only place that calls save(LEVEL_KEY ...) (and save(PALETTE_KEY ...)); the level radios (about 1701) have a change handler that rebuilds the setup and writes nothing, where the Mode menu\'s (1693-1696) and the amount slider\'s (1261) handlers call save.',
  });
  // a game played keeps the level, and its best is read back under the palette it was played with
  await click(page, '#gameHard'); await gameReady(page);
  await setSelect(page, 'gamePalette', 'primary'); await gameReady(page);
  const g = await gameLock(page, { paint: true });
  const played = await dumpOf(page);
  const bestKey = Object.keys(JSON.parse(played[P + 'gameBest'] || '{}'))[0] || '';
  t.check(g.popup && /\|hard\|primary\|relaxed$/.test(bestKey) && played[P + 'gameLevel'] === '"hard"' && played[P + 'gamePalette'] === '"primary"', 'a game played on Hard, Three primaries and Relaxed keeps its best under those settings, and keeps the level and palette', { bestKey, level: played[P + 'gameLevel'], palette: played[P + 'gamePalette'] });
  const points = JSON.parse(played[P + 'gameBest'] || '{}')[bestKey];
  await reload(page); await tab(page, 'game'); await gameReady(page);
  const again = await app(page).evaluate(() => ({ level: document.querySelector('input[name="gameLevel"]:checked').value, palette: document.getElementById('gamePalette').value, best: document.getElementById('gameBest').textContent }));
  t.check(again.level === 'hard', 'after a reload the level of that game is the one chosen', again);
  t.note(`after that game and a reload the palette menu reads "${again.palette}", not primary: js/game.js renderPalettes (404-412) gives every new board its suggested palette, so the palette written at Start (gamePalette) is not applied on the next visit`);
  await setSelect(page, 'gamePalette', 'primary'); await gameReady(page);
  const line = await text(page, '#gameBest');
  t.check(points > 0 && line === `Your best on this portrait at this level in Relaxed mode: ${points} points`, 'and the best of that game is read back once that palette is chosen again, under its portrait, level and mode', { points, line });
  await clean(t, page, 'gamesetup');
});

// ---- segment: full and blocked ----------------------------------------------------------------------------------------------------
// Every write site with the storage full (a real quota: localStorage filled until any write throws, and a database that refuses
// the painting with QuotaExceededError) and blocked (localStorage throws SecurityError on access, IndexedDB refuses to open): the
// page keeps working for the visit, the Studio and Value battle say that nothing is kept, and what was saved before is not harmed.
const INIT = {
  full: () => { IDBObjectStore.prototype.put = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; },
  blocked: () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); }, configurable: true });
    IDBFactory.prototype.open = function () { throw new DOMException('Access to the Indexed Database API is denied in this context.', 'SecurityError'); };
  },
};
for (const kind of ['full', 'blocked']) {
  seg(kind, 75, async (t, site, pages) => {
    const page = await open(pages, site);
    await appUp(page);
    const L = `storage ${kind}`;
    const SEEDED = { [P + 'mode']: 'advanced', [P + 'lean']: '40', [P + 'palette']: [{ r: 9, g: 8, b: 7 }] };
    if (kind === 'full') {
      await put(page, SEEDED);
      const f = await fillStorage(page);
      t.check(f.full, 'the storage could be filled until every write throws', f);
    }
    await page.addInitScript(INIT[kind]);
    await reload(page);
    // -- the Study tab's writes
    if (kind === 'full') t.check(await app(page).evaluate(() => !document.body.classList.contains('mode-simple')), `${L}: what was saved before (Advanced) is read back from the full storage`);
    await click(page, '[data-mode="simple"]');
    t.check(await app(page).evaluate(() => document.body.classList.contains('mode-simple')) && (await pressed(page, '[data-mode="simple"]')) === 'true', `${L}: the Simple switch still works for this visit`);
    await click(page, '[data-mode="advanced"]');
    await click(page, '#smoothSoft');
    t.check((await checked(page, '#smoothSoft')) === true, `${L}: the smoothing choice still switches`);
    await click(page, '#srcMine'); await setRange(page, 'paintMax', 7);
    t.check((await checked(page, '#srcMine')) === true && (await val(page, '#paintMax')) === '7', `${L}: the paint source and the number of paints still change`, [await checked(page, '#srcMine'), await val(page, '#paintMax')]);
    await setRange(page, 'lean', 70);
    t.check((await text(page, '#leanOut')) === '70%' && (await val(page, '#lean')) === '70', `${L}: the lean slider still moves, and reads 70%`, await text(page, '#leanOut'));
    await click(page, '[data-block-view="palette"]');
    t.check((await pressed(page, '[data-block-view="palette"]')) === 'true', `${L}: the block view still switches to the palette`);
    await click(page, '#drawer-swatches > summary');
    t.check(await app(page).evaluate(() => document.getElementById('drawer-swatches').open), `${L}: a drawer still opens`);
    await app(page).evaluate(() => Studio.addColor({ r: 200, g: 10, b: 20 }, false));
    const sw = await app(page).evaluate(() => [...document.querySelectorAll('#swatches .swatch-meta span:first-child')].map((s) => s.textContent));
    t.check(sw.includes('#C80A14'), `${L}: a picked color is listed for this visit`, sw);
    await app(page).evaluate(() => { const s = document.getElementById('canvasSize'); s.value = '8.5'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    t.check((await val(page, '#canvasSize')) === '8.5' && !(await toastNow(page)).match(/went wrong/), `${L}: the unit on my canvas takes a length`, await toastNow(page));
    await app(page).evaluate(() => { const s = document.getElementById('paintAddPreset'); s.value = 'zorn'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    t.check(/4/.test(await text(page, '#mineCount')), `${L}: ticking a known palette's paints ticks them for this visit`, await text(page, '#mineCount'));
    // -- Value battle: its settings, then a streak of one and a miss. "New best!" says it is for this visit only
    await tab(page, 'battle');
    await setSelect(page, 'vb-palette', 'primary'); await click(page, '#vbCount3'); await click(page, '#vbCountMix');
    t.check((await val(page, '#vb-palette')) === 'primary' && (await checked(page, '#vbCountMix')) === true, `${L}: Value battle's palette and count still change`, [await val(page, '#vb-palette'), await checked(page, '#vbCountMix')]);
    const vb = await battleStreak(page, 1);
    t.check(vb.popup && /^New best! \(this visit only\)$/.test(vb.newBest), `${L}: Value battle's score says the best is for this visit only`, vb);
    await click(page, '#vb-settings'); await sleep(300);
    const best = await text(page, '#vb-best');
    t.check(/^Your best streak here: 1 in a row\.$/.test(best), `${L}: the setup still shows the best of this visit`, best);
    // -- Paint by numbers: every number mixed from all the paints, then locked in
    await tab(page, 'game'); await gameReady(page);
    await setSelect(page, 'gameMode', 'relaxed'); await setRange(page, 'gameAmount', 3); await click(page, '#gameSound'); await click(page, '#tab-game [data-ref-view="blocks"]'); await click(page, '#gameMedium');
    t.check((await val(page, '#gameMode')) === 'relaxed' && (await val(page, '#gameAmount')) === '3' && (await pressed(page, '#gameSound')) === 'false', `${L}: Paint by numbers' mode, amount and sound still change`, [await val(page, '#gameMode'), await val(page, '#gameAmount'), await pressed(page, '#gameSound')]);
    await gameReady(page);
    const g = await gameLock(page, { paint: true });
    t.check(g.popup && Number(g.pct) >= 0, `${L}: Paint by numbers locks in and scores`, g);
    t.note(`${L}: Paint by numbers' score card reads "${g.newBest || '(no New best)'}" and ${g.notes ? 'says' : 'does not say'} that the best is not kept`);
    if (g.newBest && !g.notes && kind === 'blocked') t.note(`${L}: the same card, the same missing sign as with the storage full (see that finding)`);
    if (g.newBest && !g.notes && kind === 'full') t.finding({
      title: 'Paint by numbers shows "New best!" with no sign that the best could not be kept (storage full or blocked), where Value battle says "(this visit only)"',
      severity: 'low',
      steps: '1. Make the browser\'s storage full (another site or tab has used the quota), or unavailable (site data blocked). 2. Open Games, Paint by numbers, tap every number and every paint once, and lock in the portrait. 3. Read the score card, then reload and open the setup.',
      expected: 'The score card tells the visitor the best is not kept, as Value battle\'s does ("New best! (this visit only)", js/battle.js 475) and as the Studio and Pose and light say what they cannot keep; the README says "best scores" are kept in the browser.',
      actual: `The card reads "${g.newBest}" and nothing else about storage; after a reload the setup shows no best for the portrait.`,
      cause: 'js/game.js 1345 calls save(BEST_KEY, bests) and drops its result (save, line 108, returns nothing on a refused write, unlike battle.js save, line 35, which returns false and finish() shows in els.newBest).',
    });
    await gameBack(page);
    // -- Figure study: the class setup
    await tab(page, 'figure', { wait: false });
    await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 90000 }).catch(() => null);
    await click(page, '#fig-timed'); await click(page, '#tab-figure [data-pose-id="stand"]');
    t.check(await app(page).evaluate(() => document.getElementById('fig-timed').checked && document.querySelector('#tab-figure [data-pose-id="stand"]').getAttribute('aria-pressed') === 'false' && !document.getElementById('fig-start').disabled), `${L}: Figure study's setup still takes a change, and Start is there`);
    // -- the Studio: a stroke, then a locked mix; the painting cannot be kept and the Studio says so, once
    await openStudio(page);
    await app(page).evaluate(() => { const e = document.getElementById('toast'); e.textContent = ''; e.classList.remove('show'); });
    await line(page, 0.8);
    t.check((await band(page, ...BOTTOM)) > 100, `${L}: the Studio still paints`);
    const said = await app(page).waitForFunction(() => /could not be saved|cannot be saved/.test(document.getElementById('toast').textContent), null, { timeout: 25000 }).then(() => text(page, '#toast')).catch(() => null);
    const wantSaid = kind === 'full' ? /The painting could not be saved: browser storage is full\. It stays for this visit only\./ : /The painting could not be saved in this browser\. It stays for this visit only\./;
    t.check(!!said && wantSaid.test(said), `${L}: the Studio says the painting could not be kept, and why`, said);
    await app(page).evaluate(() => { const e = document.getElementById('toast'); e.textContent = ''; e.classList.remove('show'); });
    await line(page, 0.2); await sleep(2500);
    t.check(!/could not be saved/.test(await toastNow(page)), `${L}: and says it once a visit, not on every stroke`, await toastNow(page));
    const mixes = await lockMix(page, 1);
    t.check(mixes === 9, `${L}: a mix can be locked in for this visit`, mixes);
    await clean(t, page, L);
    // -- what was there before is not harmed, and nothing is written behind the failure
    const other = await newTab(site, page);
    if (kind === 'full') {
      await dropFiller(other);
      const back = await dumpOf(other);
      // (a value replaced by one no longer than it fits in a full storage, so the lean slider's "70" may well have been kept: it is the picked color, which grew, that must be whole)
      t.check(back[P + 'mode'] === 'advanced' && ['40', '70'].includes(back[P + 'lean']) && back[P + 'palette'] === J([{ r: 9, g: 8, b: 7 }]), `${L}: the values saved before the storage was full are whole (Advanced, a lean of 40 or 70, the one picked color: the new one was refused, the old one not touched)`, back);
    } else {
      t.check((await siteKeys(other)).length === 0, `${L}: nothing the site wrote while it was blocked reached the storage`, await siteKeys(other));
      t.check((await record(other)) === null, `${L}: nor a painting in the database`);
    }
    await clean(t, other, `${L}: a tab opened after`);
  });
}

// ---- segment: poseStorage -----------------------------------------------------------------------------------------------------------
for (const kind of ['full', 'blocked']) {
  seg('pose-' + kind, 40, async (t, site, pages) => {
    const page = await open(pages, site, { url: 'pose.html', waitUntil: 'domcontentloaded' });
    await poseUp(page);
    const L = `Pose and light, storage ${kind}`;
    if (kind === 'full') {
      await page.evaluate(() => { document.querySelector('#poses .pose-btn[data-id="wave"]').click(); document.getElementById('savePose').click(); });
      const f = await fillStorage(page);
      t.check(f.full, `${L}: the storage could be filled until every write throws`, f);
    } else await page.addInitScript(INIT.blocked);
    await poseReload(page);
    const fresh = await page.evaluate(() => ({ cont: !document.getElementById('continueWrap').hidden, mine: document.querySelectorAll('#mine .pose-item').length }));
    if (kind === 'full') t.check(fresh.cont && fresh.mine === 1, `${L}: the pose and the saved pose from before are read from the full storage`, fresh);
    await page.evaluate(() => document.querySelector('#poses .pose-btn[data-id="run"]').click());
    const note = await page.evaluate(() => { const n = document.getElementById('keepNote'); return { shown: !n.hidden, text: n.textContent }; });
    const wantNote = kind === 'full' ? /^This pose could not be kept for next time: browser storage is full\.$/ : /^This pose cannot be kept for next time: this browser does not let the site keep it\.$/;
    t.check(note.shown && wantNote.test(note.text), `${L}: the rail says the pose cannot be kept for next time, and why`, note);
    t.check(await page.evaluate(() => PoseAndLight.pose.hipR.x < -40), `${L}: the figure takes the pose for this visit`);
    // (a full storage lets go of the pose stored before, so the room it frees is filled again before the next write)
    if (kind === 'full') t.check(await page.evaluate((k) => localStorage.getItem(k) === null, PL + 'v2'), `${L}: a pose that could not be stored lets go of the one stored before, so the next visit does not offer an older one`);
    if (kind === 'full') await fillStorage(page);
    await page.evaluate(() => document.getElementById('savePose').click());
    const btn = await page.evaluate(() => document.getElementById('savePose').textContent);
    t.check(btn === `In the library for this visit only: ${kind === 'full' ? 'storage is full' : 'storage is off'}`, `${L}: Save this pose says it is in the library for this visit only`, btn);
    const lib = await page.evaluate(() => ({ mine: document.querySelectorAll('#mine .pose-item').length, note: document.getElementById('libNote').textContent }));
    t.check(lib.mine === (kind === 'full' ? 2 : 1), `${L}: the pose is in the library for this visit`, lib);
    t.check(/(could not be saved: browser storage is full|kept for this visit only: this browser does not let the site keep them)/.test(lib.note), `${L}: the library says why the poses are for this visit only`, lib.note);
    await page.evaluate(() => document.querySelector('#mine .pose-x').click());
    t.check(await page.evaluate(() => document.querySelectorAll('#mine .pose-item').length) === (kind === 'full' ? 1 : 0), `${L}: a saved pose can still be removed`);
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    t.check(await page.evaluate(() => PoseAndLight.mode()) === 'advanced', `${L}: the mode switch still works for this visit`);
    const other = await newTab(site, page, { url: 'pose.html' });
    if (kind === 'full') { await dropFiller(other); const k = await siteKeys(other); t.check(k.includes(PL + 'mine.v1'), `${L}: the poses saved before are still saved`, k); }
    await clean(t, page, L); await clean(t, other, `${L}: a tab opened after`);
  });
}


// ---- segment: forget --------------------------------------------------------------------------------------------------------------
// Forget my work on this device, with every kind of thing kept and three tabs of the site open (the app twice, Pose and light on its own page)
seg('forget', 60, async (t, site, pages) => {
  const a = await open(pages, site);
  await appUp(a);
  await put(a, { ...OLD, [P + 'mode']: 'advanced', [P + 'palette']: [{ r: 1, g: 2, b: 3 }], [P + 'battleBest']: { 'zorn:mix:streak': 5 }, [P + 'gameBest']: { 'sample-study:600x750|medium|zorn': 640 },
    [PL + 'v2']: { pose: { shoulderL: { z: 90 } }, light: { az: 100, el: 20 } }, [PL + 'mine.v1']: [{ id: 'mine-1', p: { kneeR: { x: 40 } } }], [PL + 'mode']: 'advanced' });
  await reload(a);
  await openStudio(a);
  await line(a, 0.8); await lockMix(a, 1);
  const painted = await waitRecord(a, (r) => r.savedAt > Date.now() - 600000 && r.paper);
  const b = await newTab(site, a);
  await appUp(b); await tab(b, 'game', { wait: false });
  const c = await newTab(site, a, { url: 'pose.html' });
  await poseUp(c);
  const before = await siteKeys(a);
  t.check(!!painted && before.length >= 20 && before.includes(P + 'paintMixes') && before.includes(PL + 'v2'), 'before Forget: the painting is saved and the site holds a key of every kind', { keys: before.length, painted: !!painted });
  t.check(await c.evaluate(() => !document.getElementById('continueWrap').hidden && document.querySelectorAll('#mine .pose-item').length === 1), 'before Forget: Pose and light offers Where you left off and holds a saved pose');
  await tab(a, 'help');
  await click(a, '#forgetBtn');
  await a.waitForFunction(() => /again/i.test(document.getElementById('forgetBtn').textContent), null, { timeout: 3000 }).catch(() => null);
  const armed = await text(a, '#forgetBtn');
  // a page that has been reloaded has lost what was set on the old one
  for (const pg of [a, b, c]) await pg.evaluate(() => { window.__before = 1; });
  const gone = (pg) => pg.waitForFunction(() => !window.__before, null, { timeout: 90000 }).then(() => 'reloaded').catch(() => 'did not reload');
  const reloaded = await Promise.all([gone(a), gone(b), gone(c), click(a, '#forgetBtn')]);
  t.check(reloaded.slice(0, 3).every((x) => x === 'reloaded'), 'Forget in one tab reloads it, the other tab of the app and the Pose and light page', reloaded.slice(0, 3));
  t.check(/again/i.test(armed), 'the first tap only arms the button', armed);
  await appUp(a); await appUp(b);
  await poseUp(c);
  await sleep(1500);
  for (const [name, pg] of [['this tab', a], ['the other tab of the app', b], ['the Pose and light tab', c]]) t.check((await keysOf(pg)).length === 0, `after Forget no key remains, ${name} included`, await keysOf(pg));
  t.check((await record(a)) === null, 'after Forget the saved painting is gone from the database');
  await openStudio(a);
  t.check((await band(a, ...BOTTOM)) === 0 && (await mixCount(a)) === 8, 'after Forget the Studio opens on a blank paper with only its eight starting mixes', [await band(a, ...BOTTOM), await mixCount(a)]);
  t.check(await c.evaluate(() => document.getElementById('continueWrap').hidden && document.querySelectorAll('#mine .pose-item').length === 0 && PoseAndLight.mode() === 'simple'), 'after Forget Pose and light has no pose to continue, no saved pose and is in Simple');
  t.check(await app(a).evaluate(() => document.body.classList.contains('mode-simple')) && await app(b).evaluate(() => document.body.classList.contains('mode-simple')), 'after Forget both tabs of the app are in Simple');
  t.check(await app(b).evaluate(() => document.getElementById('tab-study') && !document.getElementById('tab-study').hidden), 'the tab that was on Paint by numbers starts again on the Study tab');
  const dbs = await dbNames(a);
  t.note(`after Forget and the reload the Studio opens its database again: indexedDB.databases() lists ${J(dbs)} (empty, with no painting in it)`);
  await clean(t, a, 'forget: this tab'); await clean(t, b, 'forget: the other tab'); await clean(t, c, 'forget: Pose and light');
});

// ---- segment: midway --------------------------------------------------------------------------------------------------------------
seg('midway', 75, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  // -- a Studio stroke with the pointer still down
  await openStudio(page);
  await line(page, 0.8);
  const base = await waitRecord(page, (r) => r.savedAt > Date.now() - 600000 && r.paper);
  const full = await band(page, ...BOTTOM);
  const box = await app(page).evaluate(() => { const r = document.getElementById('ps-paper').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.2); await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.2, { steps: 6 });
  await page.reload({ waitUntil: 'load', timeout: 90000 }); await page.mouse.up();
  await appUp(page); await openStudio(page);
  t.check(!!base && (await band(page, ...BOTTOM)) > full * 0.9, 'a reload with the pointer still down mid-stroke leaves the saved painting whole', [full, await band(page, ...BOTTOM)]);
  const topNow = await band(page, ...TOP);
  t.check(topNow === 0 || topNow > 100, 'and the stroke that was being made is whole or not there, never a fragment', topNow);
  t.check(!/could not be read|went wrong/i.test(await toastNow(page)), 'and the Studio opens without a complaint', await toastNow(page));
  // -- Paint by numbers in play
  const keysBefore = await dumpOf(page);
  await tab(page, 'game'); await gameReady(page);
  await setSelect(page, 'gameMode', 'relaxed');
  await click(page, '#gameStart');
  await app(page).waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 40000 });
  await app(page).evaluate(() => { const n = document.querySelector('#gameNumbers .game-number'); n.click(); document.querySelectorAll('#gamePaints button').forEach((b) => b.click()); });
  await reload(page);
  const afterGame = await dumpOf(page);
  t.check(!(P + 'gameBest' in afterGame), 'a reload in the middle of a game writes no best for it', afterGame[P + 'gameBest']);
  t.check(afterGame[P + 'gameLevel'] === '"medium"' && /^"[a-z-]+"$/.test(afterGame[P + 'gamePalette'] || ''), 'the level and palette the game was started with are what is kept', { level: afterGame[P + 'gameLevel'], palette: afterGame[P + 'gamePalette'] });
  t.check(await app(page).evaluate(() => !document.getElementById('tab-study').hidden && !document.body.classList.contains('game-focus')), 'the page comes back on the Study tab, out of the game\'s full-screen layout');
  await tab(page, 'game'); await gameReady(page);
  t.check(await app(page).evaluate(() => !document.getElementById('gameSetup').hidden && document.getElementById('gamePlay').hidden), 'and Paint by numbers opens on its setup, with Start painting ready');
  // -- Value battle in a streak
  await tab(page, 'battle');
  await click(page, '#vb-start');
  await app(page).waitForFunction(() => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !document.getElementById('vb-play').hidden; }, null, { timeout: 20000 });
  await battleAnswer(page, true); await click(page, '#vb-next'); await battleAnswer(page, true);
  await reload(page);
  t.check(!((P + 'battleBest') in (await dumpOf(page))), 'a reload in the middle of a streak of two writes no best for it (the streak is not over)', (await dumpOf(page))[P + 'battleBest']);
  await tab(page, 'battle');
  t.check(await app(page).evaluate(() => !document.getElementById('vb-setup').hidden && document.getElementById('vb-play').hidden && !document.body.classList.contains('battle-focus') && /^No streak yet/.test(document.getElementById('vb-best').textContent)), 'Value battle opens on its setup, out of its pinned board, with no streak yet');
  // -- a Figure study class under way
  await tab(page, 'figure', { wait: false });
  await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 90000 }).catch(() => null);
  await click(page, '#fig-timed'); await click(page, '#fig-t60');
  const figKeys = await dumpOf(page);
  await click(page, '#fig-start');
  const inClass = await app(page).waitForFunction(() => document.body.classList.contains('figure-focus') && !!document.querySelector('#fs-paper'), null, { timeout: 90000 }).then(() => true).catch(() => false);
  if (inClass) { await sleep(1500); await stroke(page, '#fs-paper'); await sleep(1200); }
  t.check(inClass, 'a Figure study class starts (the pose is drawn and the paper is up)');
  await reload(page);
  t.check(await app(page).evaluate(() => !document.body.classList.contains('figure-focus')), 'a reload in the middle of a class comes back out of the class');
  await tab(page, 'figure', { wait: false });
  await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 90000 }).catch(() => null);
  t.check(await app(page).evaluate(() => document.getElementById('fig-timed').checked && document.getElementById('fig-t60').checked && !document.getElementById('fig-setup').hidden), 'Figure study opens on its setup, still Timed at a minute a pose');
  t.check(await app(page).evaluate(() => document.getElementById('fig-back').hidden && document.getElementById('fig-review').hidden), 'and offers no drawings to go back to: a class\'s drawings last until the page is closed (the Help tab)');
  await openStudio(page);
  t.check((await band(page, ...BOTTOM)) > full * 0.9, 'the class\'s drawing did not touch the Studio\'s painting', await band(page, ...BOTTOM));
  const rec = await record(page);
  t.check(!!rec && rec.w === base.w && rec.h === base.h, 'and the Studio\'s record is the one saved before', rec);
  // -- Pose and light with a drag under way
  const pose = await newTab(site, page, { url: 'pose.html' });
  await poseUp(pose);
  await pose.evaluate(() => document.querySelector('#poses .pose-btn[data-id="wave"]').click());
  await sleep(400);
  const wave = await pose.evaluate(() => JSON.stringify(PoseAndLight.pose));
  const hand = await pose.evaluate(() => { PoseAndLight.render(); const c = PoseAndLight.ctrls().find((x) => x.id === 'handR'); return c && c.center; });
  const vb = await pose.locator('#view').boundingBox();
  await pose.mouse.move(vb.x + hand.x, vb.y + hand.y); await pose.mouse.down();
  await pose.mouse.move(vb.x + hand.x + 90, vb.y + hand.y - 120, { steps: 8 });
  const mid = await pose.evaluate(() => JSON.stringify(PoseAndLight.pose));
  t.check(mid !== wave, 'the pose is moving under the pointer when the page is reloaded', { moved: mid !== wave });
  await pose.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await pose.mouse.up();
  await poseUp(pose);
  const back = await pose.evaluate(() => ({ pose: JSON.stringify(PoseAndLight.pose), cont: !document.getElementById('continueWrap').hidden, keep: document.getElementById('keepNote').hidden }));
  t.check(back.cont && back.pose === wave, 'Pose and light comes back with the pose that was last let go of (Where you left off), not the half-dragged one', { cont: back.cont, same: back.pose === wave });
  await clean(t, page, 'midway'); await clean(t, pose, 'midway: Pose and light');
});

// ---- segment: limits --------------------------------------------------------------------------------------------------------------
// The README: only the fifty most recently played boards keep a best (Paint by numbers; Value battle keeps its settings the same way);
// up to twelve saved poses. At the limit, one past it, and a board played again.
const fifty = (n, mk) => Object.fromEntries(Array.from({ length: n }, (_, i) => [mk(i), 100 + i]));
seg('limits-game', 70, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  await put(page, { [P + 'gameBest']: fifty(49, (i) => `old-${i}.jpg:100x100|medium|zorn`), [P + 'gameMode']: '"relaxed"' });
  await reload(page);
  await tab(page, 'game'); await gameReady(page);
  const g1 = await gameLock(page);
  let bests = JSON.parse(await storageGet(page, P + 'gameBest')); let ks = Object.keys(bests);
  const first = ks[ks.length - 1];
  t.check(g1.popup && ks.length === 50 && ks.slice(0, 49).every((k, i) => k === `old-${i}.jpg:100x100|medium|zorn`), 'with 49 boards kept, a fiftieth is added and none is dropped', { n: ks.length, last: first });
  await gameBack(page); await click(page, '#gameEasy'); await gameReady(page);
  const g2 = await gameLock(page);
  bests = JSON.parse(await storageGet(page, P + 'gameBest')); ks = Object.keys(bests);
  t.check(g2.popup && ks.length === 50 && !ks.includes('old-0.jpg:100x100|medium|zorn') && ks.includes('old-1.jpg:100x100|medium|zorn') && ks.includes(first) && /\|easy\|/.test(ks[ks.length - 1]), 'with fifty kept, a fifty-first board played drops the oldest one only and keeps the rest', { n: ks.length, head: ks.slice(0, 2), tail: ks.slice(-2) });
  await gameBack(page); await click(page, '#gameMedium'); await gameReady(page);
  const g3 = await gameLock(page);
  bests = JSON.parse(await storageGet(page, P + 'gameBest')); ks = Object.keys(bests);
  t.check(g3.popup && ks.length === 50 && ks.includes('old-1.jpg:100x100|medium|zorn') && ks[ks.length - 1] === first, 'a board played again is the most recent again, and drops nothing', { n: ks.length, head: ks.slice(0, 2), tail: ks.slice(-2) });
  t.check(Object.values(bests).every((v) => Number.isInteger(v)), 'every best kept is still a whole number of points', Object.values(bests).filter((v) => !Number.isInteger(v)));
  await clean(t, page, 'limits: Paint by numbers');
});
seg('limits-battle', 50, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  await put(page, { [P + 'battleBest']: fifty(49, (i) => `p${i}:2:streak`) });
  await reload(page);
  const v1 = await battleStreak(page, 1);
  let bests = JSON.parse(await storageGet(page, P + 'battleBest')); let ks = Object.keys(bests);
  t.check(v1.popup && ks.length === 50 && ks.includes('p0:2:streak') && ks[49] === 'zorn:mix:streak', 'Value battle: with 49 kept, a fiftieth is added and none is dropped', { n: ks.length, last: ks[ks.length - 1] });
  await reload(page); await tab(page, 'battle');
  t.check((await text(page, '#vb-best')) === 'Your best streak here: 1 in a row.', 'Value battle: after a reload the setup reads the streak of one back as the best', await text(page, '#vb-best'));
  await click(page, '#vbCount3'); await sleep(200);
  const v2 = await battleStreak(page, 1);
  bests = JSON.parse(await storageGet(page, P + 'battleBest')); ks = Object.keys(bests);
  t.check(v2.popup && ks.length === 50 && !ks.includes('p0:2:streak') && ks.includes('p1:2:streak') && ks[49] === 'zorn:3:streak', 'Value battle: a fifty-first setting played drops the oldest only', { n: ks.length, head: ks.slice(0, 2), tail: ks.slice(-2) });
  await click(page, '#vb-settings'); await click(page, '#vbCountMix'); await sleep(200);
  const v3 = await battleStreak(page, 1);
  bests = JSON.parse(await storageGet(page, P + 'battleBest')); ks = Object.keys(bests);
  t.check(v3.popup && ks.length === 50 && ks.includes('p1:2:streak') && ks[49] === 'zorn:mix:streak', 'Value battle: a setting played again is the most recent again and drops nothing', { n: ks.length, tail: ks.slice(-2) });
  await clean(t, page, 'limits: Value battle');
});
seg('limits-poses', 45, async (t, site, pages) => {
  const page = await open(pages, site, { url: 'pose.html', waitUntil: 'domcontentloaded' });
  await poseUp(page);
  await page.evaluate(() => document.querySelector('#poses .pose-btn[data-id="stand"]').click());
  const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').map((q) => q.id), PL + 'mine.v1');
  const ids = [];
  for (let i = 1; i <= 13; i++) {
    await page.evaluate((i) => { PoseAndLight.pose.neck.y = i; document.getElementById('savePose').click(); }, i);
    const now = await stored(); ids.push(now.slice());
    const text = await page.evaluate(() => document.getElementById('savePose').textContent);
    if (i === 12) t.check(now.length === 12 && !/oldest/.test(text), 'Save this pose: the twelfth pose is kept and nothing is dropped', { n: now.length, text });
    if (i === 13) {
      t.check(now.length === 12 && !now.includes(ids[0][0]) && now[11] !== ids[11][11] && now.slice(0, 11).join() === ids[11].slice(1).join(), 'Save this pose: a thirteenth drops the oldest one only, and is the newest', { n: now.length });
      t.check(/the oldest of your twelve made room/.test(text), 'the button says the oldest of the twelve made room', text);
    }
  }
  t.check(await page.evaluate(() => document.querySelectorAll('#mine .pose-item').length) === 12 && J(await page.evaluate(() => [...document.querySelectorAll('#mine .pose-item .pose-name, #mine .pose-item span')].map((e) => e.textContent).filter((x) => /^Your pose/.test(x)))) === J(Array.from({ length: 12 }, (_, i) => `Your pose ${i + 1}`)), 'the library lists twelve, named Your pose 1 to Your pose 12');
  t.check(await page.evaluate(() => document.getElementById('savePose').disabled === false), 'Save this pose is still available with twelve kept (it replaces the oldest)');
  // fifteen in the store (an older page, another tool): the page shows the newest twelve, and the first change trims the store to the twelve
  const fifteen = Array.from({ length: 15 }, (_, k) => ({ id: 'mine-seed-' + k, p: { neck: { y: k } } }));
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [PL + 'mine.v1', J(fifteen)]);
  await poseReload(page);
  const shown = await page.evaluate(() => [...document.querySelectorAll('#mine .pose-btn')].map((b) => b.dataset.id));
  t.check(shown.length === 12 && shown[0] === 'mine-seed-3' && shown[11] === 'mine-seed-14', 'fifteen saved poses in the storage: the library shows the newest twelve', shown);
  await page.evaluate(() => document.querySelector('#mine .pose-x').click());
  const trimmed = await stored();
  t.check(trimmed.length === 11 && trimmed[0] === 'mine-seed-4', 'and removing one leaves eleven in the storage (the store is held to twelve at the first change)', trimmed);
  // Figure study reads the same list: thirteen in the store give twelve in the class
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [PL + 'mine.v1', J(Array.from({ length: 13 }, (_, k) => ({ id: 'mine-seed-' + k, p: { neck: { y: k } } })))]);
  const app2 = await newTab(site, page);
  await appUp(app2);
  await tab(app2, 'figure', { wait: false });
  await app2.waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 42, null, { timeout: 90000 }).catch(() => null);
  const mine = await app2.evaluate(() => [...document.querySelectorAll('#tab-figure [data-pose-id^="mine-"]')].map((b) => b.dataset.poseId));
  t.check(mine.length === 12 && !mine.includes('mine-seed-0'), 'Figure study offers the newest twelve of thirteen saved poses', mine);
  await clean(t, page, 'limits: poses'); await clean(t, app2, 'limits: Figure study');
});


// ---- segment: bestkey ---------------------------------------------------------------------------------------------------------------
// README, Privacy: "best scores for your own photos are keyed by the photo's file name and size, the reduced size for a very large photo"
seg('bestkey', 45, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  await put(page, { [P + 'gameMode']: '"relaxed"' });
  await reload(page);
  await loadPhoto(page, await makeImage(page, { width: 600, height: 800, type: 'image/jpeg', name: 'sitter.jpg' }), { settle: 800 });
  await tab(page, 'game');
  await app(page).waitForFunction(() => /sitter/i.test(document.getElementById('gamePhotoName').textContent), null, { timeout: 60000 }).catch(() => null);
  await gameReady(page);
  const g = await gameLock(page);
  let ks = Object.keys(JSON.parse(await storageGet(page, P + 'gameBest') || '{}'));
  t.check(g.popup && ks.length === 1 && /^sitter:600x800\|medium\|[a-z-]+\|relaxed$/.test(ks[0]), 'a best for a photo is kept under its file name (without the extension) and size', ks);
  await tab(page, 'study');
  await loadPhoto(page, await makeImage(page, { width: 5600, height: 4400, type: 'image/jpeg', quality: 0.3, name: 'huge.jpg', draw: 'flat' }), { settle: 1500 });
  await tab(page, 'game');
  await app(page).waitForFunction(() => /huge/i.test(document.getElementById('gamePhotoName').textContent), null, { timeout: 90000 }).catch(() => null);
  await gameReady(page);
  const g2 = await gameLock(page);
  ks = Object.keys(JSON.parse(await storageGet(page, P + 'gameBest') || '{}'));
  const huge = ks.find((k) => k.startsWith('huge:'));
  t.check(g2.popup && !!huge && /^huge:2800x2200\|/.test(huge), 'a very large photo (5600 × 4400) is keyed by the reduced size it was reduced to (2800 × 2200)', ks);
  await clean(t, page, 'bestkey');
});


export default async function persistence(t, site) {
  await runPool(t, site, +(process.env.PERSIST_JOBS || 2));
  t.note('segment times: ' + timings.join('; '));
}
