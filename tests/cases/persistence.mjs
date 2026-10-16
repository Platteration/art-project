// What the site keeps and gives back, across reloads and versions. The README's Privacy section is the list
// (localStorage keys starting portrait-value-studio. and pose-and-light., the IndexedDB database
// portrait-value-studio), "Simple and Advanced" says what the Studio keeps, and the Help tab's Good to know says
// what Forget my work on this device clears. Each segment runs on pages of its own (a few at once, PERSIST_JOBS),
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
import { openPage, newTab, clean, tab, app, poseFrame, stroke, click, text, visible, sleep, storageGet, DESKTOP } from '../lib.mjs';

const P = 'portrait-value-studio.', PL = 'pose-and-light.';
const ONLY = (process.env.PERSIST_ONLY || '').split(',').filter(Boolean);
const jobs = [], timings = [];
const seg = (name, cost, fn) => jobs.push({ name, cost, fn });

// ---- helpers --------------------------------------------------------------------------------------------------------------
const J = JSON.stringify;
const open = async (pages, site, opts) => { const p = await openPage(site, opts); pages.push(p.context()); return p; };
const keysOf = (page) => app(page).evaluate(() => Object.keys(localStorage).sort());
const siteKeys = (page) => app(page).evaluate(() => Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)).sort());
const dumpOf = (page) => app(page).evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const put = (page, obj) => app(page).evaluate((o) => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, obj);
const appUp = (page) => app(page).waitForFunction(() => !!(window.Studio && window.PaintStudio && window.ValueBattle), null, { timeout: 20000 }).catch(() => null);
async function reload(page) { await page.reload({ waitUntil: 'load' }); await appUp(page); await sleep(300); }
const setRange = (page, id, v) => app(page).evaluate(([id, v]) => { const s = document.getElementById(id); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; }, [id, v]);
const setSelect = (page, id, v) => app(page).evaluate(([id, v]) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; }, [id, v]);
const pressed = (page, sel) => app(page).evaluate((s) => { const e = document.querySelector(s); return e ? e.getAttribute('aria-pressed') : null; }, sel);
const checked = (page, sel) => app(page).evaluate((s) => { const e = document.querySelector(s); return e ? !!e.checked : null; }, sel);
const val = (page, sel) => app(page).evaluate((s) => { const e = document.querySelector(s); return e ? e.value : null; }, sel);
const toastNow = (page) => app(page).evaluate(() => { const e = document.getElementById('toast'); return e.classList.contains('show') ? e.textContent.trim() : ''; });
const dropLogged = (page, re) => { page.log.console = page.log.console.filter((m) => !re.test(m)); page.log.pageerrors = page.log.pageerrors.filter((m) => !re.test(m)); };
// the segment's checks: a thrown error in it is one failed check, not the end of the case
async function runPool(t, site, n) {
  const queue = jobs.filter((j) => !ONLY.length || ONLY.includes(j.name)).sort((a, b) => b.cost - a.cost);
  const worker = async () => {
    for (;;) {
      const j = queue.shift();
      if (!j) return;
      const t0 = Date.now(), pages = [];
      try { await j.fn(t, site, pages); } catch (e) { t.check(false, `${j.name}: the segment ran to its end`, String(e && e.stack || e).slice(0, 500)); }
      for (const c of pages) await c.close().catch(() => null);
      timings.push(`${j.name} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
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
  await app(page).waitForFunction(() => { const g = window.ValueBattle && ValueBattle.state(); return g && !g.answered && !g.over && g.rounds[g.i]; }, null, { timeout: 8000 });
  await app(page).evaluate((right) => {
    const g = ValueBattle.state(), r = g.rounds[g.i];
    const sw = (i) => document.querySelector(`.vb-swatch[data-index="${i}"]`).click();
    if (r.q.mode === 'pair') { const want = right ? r.answer : r.answer === 'same' ? 'left' : 'same'; if (want === 'same') document.querySelector('.vb-choice[data-choice="same"]').click(); else sw(want === 'left' ? 0 : 1); }
    else if (r.q.mode === 'pick') sw(right ? r.answer : (r.answer + 1) % r.n);
    else (right ? r.answer : r.answer.slice().reverse()).forEach(sw);
  }, right);
  await app(page).waitForFunction(() => { const g = ValueBattle.state(); return g && (g.answered || g.over); }, null, { timeout: 4000 }).catch(() => null);
}
// a streak of `rights` right answers and then one wrong: the score pop-up is up, and what it says is returned
async function battleStreak(page, rights = 1) {
  await tab(page, 'battle');
  await app(page).waitForFunction(() => document.getElementById('vb-palette').options.length > 0, null, { timeout: 5000 }).catch(() => null);
  await click(page, '#vb-start');
  await app(page).waitForFunction(() => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !document.getElementById('vb-play').hidden; }, null, { timeout: 8000 });
  for (let i = 0; i < rights; i++) { await battleAnswer(page, true); await click(page, '#vb-next'); await app(page).waitForFunction((i) => { const g = ValueBattle.state(); return g && g.i >= i + 1 && !g.answered; }, i, { timeout: 4000 }).catch(() => null); }
  await battleAnswer(page, false);
  await app(page).waitForFunction(() => !document.getElementById('vb-miss').hidden, null, { timeout: 4000 }).catch(() => null);
  await click(page, '#vb-missNext');
  await app(page).waitForFunction(() => !document.getElementById('vb-popup').hidden, null, { timeout: 4000 }).catch(() => null);
  await sleep(300);
  return app(page).evaluate(() => ({ popup: !document.getElementById('vb-popup').hidden, kicker: document.getElementById('vb-kicker').textContent, newBest: document.getElementById('vb-newBest').hidden ? '' : document.getElementById('vb-newBest').textContent, best: document.getElementById('vb-best').textContent }));
}
const gameReady = (page) => app(page).waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 40000 }).catch(() => null);
// Relaxed (no clock), start, lock in at once with nothing painted (0 points) or with every number mixed from every paint
async function gameLock(page, { paint = false } = {}) {
  await gameReady(page);
  await click(page, '#gameStart');
  await app(page).waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 40000 });
  await sleep(300);
  if (paint) await app(page).evaluate(() => { for (const n of document.querySelectorAll('#gameNumbers .game-number')) { n.click(); for (const b of document.querySelectorAll('#gamePaints button')) b.click(); } });
  await click(page, '#gameLock');
  await app(page).waitForFunction(() => !document.getElementById('gamePopup').hidden, null, { timeout: 15000 }).catch(() => null);
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
  // Pose and light on its own page: opening it, choosing a pose, the mode switch and Save this pose write exactly the three keys the README lists
  const pose = await open(pages, site, { url: 'pose.html' });
  await pose.waitForFunction(() => window.__poseStarted, null, { timeout: 40000 }).catch(() => null);
  t.check((await keysOf(pose)).length === 0, 'opening Pose and light on its own page stores nothing', await keysOf(pose));
  await pose.evaluate(() => document.querySelector('#poses .pose-btn[data-id="wave"]').click());
  t.check(J(await keysOf(pose)) === J([PL + 'v2']), 'choosing a pose stores pose-and-light.v2 and nothing else', await keysOf(pose));
  await pose.evaluate(() => { document.getElementById('savePose').click(); document.querySelector('[data-mode="advanced"]').click(); });
  t.check(J(await keysOf(pose)) === J([PL + 'mine.v1', PL + 'mode', PL + 'v2']), 'Save this pose and the mode switch add pose-and-light.mine.v1 and pose-and-light.mode, the keys the README lists', await keysOf(pose));
  const kept = JSON.parse(await storageGet(pose, PL + 'mine.v1'));
  t.check(Array.isArray(kept) && kept.length === 1 && !JSON.stringify(kept).includes('data:') && typeof kept[0].p === 'object' && JSON.stringify(kept).length < 4000, 'a saved pose is joint angles and a viewpoint, no picture (the Privacy table)', { n: kept.length, bytes: JSON.stringify(kept).length });
  await clean(t, page, 'visit: app'); await clean(t, pose, 'visit: Pose and light');
});

// ---- segment: roundtrip -----------------------------------------------------------------------------------------------------------
seg('roundtrip', 60, async (t, site, pages) => {
  const page = await open(pages, site);
  await appUp(page);
  const want = {};
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
  await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 40000 }).catch(() => null);
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
  const locked = await lockMix(page, 2);
  const rec = await waitRecord(page, (r) => r.sketchShown === false);
  const before = await dumpOf(page);
  t.check(!!rec && rec.canvas && rec.canvas.ground === 'wash' && rec.canvas.weave === 'linen' && Math.abs(rec.canvas.washStr - 0.45) < 0.01, 'the Studio saved its ground, wash strength and texture with the painting', rec);
  t.check(turned.w > turned.h && !!rec && rec.w === turned.w && rec.h === turned.h, 'the Studio saved the paper turned to landscape, at its size', { turned, rec });

  for (const round of [1, 2]) {
    await reload(page);
    const label = round === 1 ? 'after a reload' : 'after a second reload';
    const after = await dumpOf(page);
    t.check(J(after) === J(before), `${label}: the page rewrote none of the ${Object.keys(before).length} saved values`, Object.keys(after).filter((k) => after[k] !== before[k]).concat(Object.keys(before).filter((k) => !(k in after))));
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
    t.check((await app(page).evaluate(() => document.getElementById('gameSound').getAttribute('aria-pressed') || document.getElementById('gameSound').textContent)) !== null && (await dumpOf(page))[P + 'gameSound'] === 'false', `${label}: the sound stays off`, (await dumpOf(page))[P + 'gameSound']);
    await tab(page, 'figure', { wait: false });
    await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 40000 }).catch(() => null);
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
    t.check(await toastNow(page) === '' || /back from last time/.test(await toastNow(page)), `${label}: the Studio says its painting is back, and nothing worse`, await toastNow(page));
    await tab(page, 'study');
    await clean(t, page, `roundtrip ${label}`);
  }
  t.note(`the Studio's wash after the reload is "${wash.name}" (one of ${wash.n} buttons); ${painting}`);

  // -- Pose and light, on its own page: the pose, the light, the mode and a saved pose
  const pose = await open(pages, site, { url: 'pose.html' });
  await pose.waitForFunction(() => window.__poseStarted, null, { timeout: 40000 }).catch(() => null);
  await pose.evaluate(() => { document.querySelector('#poses .pose-btn[data-id="wave"]').click(); document.querySelector('[data-mode="advanced"]').click(); });
  await pose.evaluate(() => { for (const [id, v] of [['lAz', 100], ['lEl', 22], ['lDist', 3.4], ['lSoft', 6], ['lFill', 70]]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } document.getElementById('savePose').click(); });
  const sent = await pose.evaluate(() => ({ pose: JSON.stringify(PoseAndLight.pose), light: { ...PoseAndLight.light } }));
  const stored = JSON.parse(await storageGet(pose, PL + 'v2'));
  t.check(stored && JSON.stringify(stored.pose) === sent.pose && stored.light.az === 100 && stored.light.soft === 6 && stored.light.fill === 70, 'Pose and light stored the pose and the light as they stand', stored && stored.light);
  await pose.reload({ waitUntil: 'load' });
  await pose.waitForFunction(() => window.__poseStarted, null, { timeout: 40000 }).catch(() => null);
  const back = await pose.evaluate(() => ({ cont: !document.getElementById('continueWrap').hidden, mode: PoseAndLight.mode(), mine: document.querySelectorAll('#mine .pose-item').length, light: { ...PoseAndLight.light }, pose: JSON.stringify(PoseAndLight.pose), aria: document.querySelector('[data-mode="advanced"]').getAttribute('aria-pressed') }));
  t.check(back.cont, 'Pose and light after a reload offers Where you left off');
  t.check(back.pose === sent.pose, 'the pose is the pose that was left, joint for joint', { same: back.pose === sent.pose });
  t.check(back.light.az === 100 && back.light.el === 22 && back.light.dist === 3.4 && back.light.soft === 6 && back.light.fill === 70, 'the light is the light that was left (around, up, distance, softness, fill)', back.light);
  t.check(back.mode === 'advanced' && back.aria === 'true', 'the page on its own remembers Advanced', back.mode);
  t.check(back.mine === 1, 'the saved pose is in the library', back.mine);
  await clean(t, pose, 'roundtrip: Pose and light');
});

export default async function persistence(t, site) {
  await runPool(t, site, +(process.env.PERSIST_JOBS || 3));
  t.note('segment times: ' + timings.join('; '));
}
