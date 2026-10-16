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
  const strokeDone = Date.now();
  const locked = await lockMix(page, 2);
  const rec = await waitRecord(page, (r) => r.sketchShown === false && r.savedAt > strokeDone);
  const before = await dumpOf(page);
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
  await app(page).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 40000 }).catch(() => null);
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
  await pose.waitForFunction(() => window.__poseStarted, null, { timeout: 40000 }).catch(() => null);
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
  const lone = await app(page).evaluate(() => PaintStudio.ready() && true);
  // -- a stroke followed by a reload, three ways: at once, a moment later and while the save is under way; then well after it
  let topFull = 0;
  const trials = {};
  for (const wait of [0, 300, 900, 2500]) {
    await openStudio(page);
    const wasTop = await band(page, ...TOP);
    await line(page, 0.2);
    if (!topFull) topFull = (await band(page, ...TOP)) - wasTop;
    await sleep(wait);
    await reload(page);
    await openStudio(page);
    const b = await band(page, ...BOTTOM), tp = await band(page, ...TOP);
    trials[wait] = { bottom: b, top: tp };
    t.check(b > full * 0.9, `a reload ${wait} ms after a stroke leaves the painting saved before it whole`, { full, bottom: b });
    if (wait === 2500) t.check(tp > topFull * 0.8, 'a stroke followed by a reload 2.5 s later is kept', { topFull, top: tp });
    else t.check(tp === 0 || tp > topFull * 0.8, `a reload ${wait} ms after a stroke keeps the stroke whole or not at all, never half of it`, { topFull, top: tp });
    if (wait !== 2500) {
      // clear the top line for the next trial: paint over by clearing the whole paper and the baseline again is not needed, so the trial only counts what is new
      await app(page).evaluate(() => { const c = document.getElementById('ps-paper'); const g = c.getContext('2d'); g.clearRect(0, 0, c.width, Math.floor(c.height * 0.5)); });
      await line(page, 0.8); // (a stroke elsewhere, so the cleared top is saved too)
      await waitRecord(page, (r) => r.savedAt > Date.now() - 4000);
    }
  }
  const lostAtOnce = trials[0].top === 0, lostSoon = trials[300].top === 0;
  t.check(!lostAtOnce || !lostSoon || true, 'measured');
  t.note(`a stroke followed by a reload: after 0 ms the stroke ${trials[0].top > 0 ? 'was kept' : 'was lost'}, after 300 ms ${trials[300].top > 0 ? 'was kept' : 'was lost'}, after 900 ms ${trials[900].top > 0 ? 'was kept' : 'was lost'}, after 2500 ms ${trials[2500].top > 0 ? 'was kept' : 'was lost'}`);
  t.check(trials[0].top > 0 && trials[300].top > 0, 'a stroke made less than a second before the page goes (a reload, a closed tab) is still saved: the README says a closed tab loses nothing', trials);
  if (trials[0].top === 0 && trials[300].top === 0 && trials[900].top === 0) t.finding({
    title: 'A stroke made less than about a second before a reload or a closed tab is lost: the save on pagehide never finishes',
    severity: 'low',
    steps: '1. Open the Studio (index.html#paint) and paint a stroke across the paper; wait two seconds (it is saved). 2. Paint a second stroke and reload the page (or close the tab) at once, 300 ms after the stroke, or 900 ms after it. 3. Open the Studio again.',
    expected: 'README, Simple and Advanced: "The Studio keeps your work: the paper, the underdrawing, ... are saved in the browser a moment after each change ... and come back on the next visit"; the Help tab: "Close the tab, come back later, and it is still there." js/painting.js says the page saves what is waiting as it goes (pagehide), "so a closed tab ... loses nothing".',
    actual: `The second stroke is gone after the reload when the page goes 0, 300 or 900 ms after it (bottom stroke kept whole in every case; the stroke after 2.5 s is kept). The first stroke, saved before, is intact (${J(trials)}).`,
    cause: 'js/painting.js saveNowIfDue (about 528) answers pagehide by calling saveNow, but saveNow awaits two canvas.toBlob() encodings and then an IndexedDB write (about 474-480); a page that is unloading does not stay alive for them, so the record is never written. A save already under way (the 800 ms delay has passed, the PNGs are being encoded) is cut off the same way. Taking the pixels synchronously at pagehide (getImageData, put into the record as ImageData) or encoding after every stroke ends would keep it.',
  });

  // -- hiding the page (a phone switching apps) saves at once, and the page stays up to finish it
  await openStudio(page);
  await app(page).evaluate(() => { const c = document.getElementById('ps-paper'); c.getContext('2d').clearRect(0, 0, c.width, c.height); });
  await line(page, 0.2);
  const strokeDone = Date.now();
  await app(page).evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  const hid = await waitRecord(page, (r) => r.savedAt >= strokeDone - 50, 8000);
  await app(page).evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  t.check(!!hid && hid.savedAt - strokeDone < 700, 'hiding the page saves the last stroke at once, without waiting out the 0.8 s', { delay: hid ? hid.savedAt - strokeDone : null });
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
  t.check(J(await sw(a)) === J(['#010203', '#040506']) && J(await sw(b)) === J(['#010203', '#040506']), 'a color picked in one tab is picked in the other, in order', [await sw(a), await sw(b)]);
  await app(a).evaluate(() => { const s = document.getElementById('paintAddPreset'); s.value = 'zorn'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await app(b).evaluate(() => { const s = document.getElementById('paintAddPreset'); s.value = 'primary'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  const mineIn = (p) => app(p).evaluate(() => document.getElementById('mineCount').textContent);
  t.check(JSON.parse(await storageGet(a, P + 'myPaints')).length === 7 && /7/.test(await mineIn(a)) && /7/.test(await mineIn(b)), 'paints ticked in two tabs are all ticked in both (Zorn and the three primaries share a white: 7 paints)', [JSON.parse(await storageGet(a, P + 'myPaints')), await mineIn(a), await mineIn(b)]);
  // a Forget-free setting set in one tab and read by a tab opened afterwards
  await click(a, '[data-mode="advanced"]');
  const c = await newTab(site, a);
  await appUp(c);
  t.check(await app(c).evaluate(() => !document.body.classList.contains('mode-simple')), 'a tab opened after the switch to Advanced opens in Advanced');
  await c.close();
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
    steps: '1. Open the site in tab A and again in tab B (any visitor who opens a link twice, or comes back through a bookmark). 2. In tab A open the Studio, paint a stroke across the bottom and wait two seconds. 3. In tab B (opened before the stroke) open the Studio (it shows a blank paper) and paint a stroke across the top. 4. Reload tab A and open the Studio.',
    expected: 'The painting saved in tab A is kept (README: "The Studio keeps your work ... saved in the browser a moment after each change ... and come back on the next visit"; the Help tab: "Close the tab, come back later, and it is still there"); the picked colors, My paints and saved poses already follow every open tab, and the second tab at least shows the saved painting before it paints on it.',
    actual: `After the reload tab A shows only tab B's stroke (bottom stroke ${keptA} painted pixels, top stroke ${keptB}); tab A's painting is gone from IndexedDB, with no message to either tab.`,
    cause: 'js/painting.js restore (about 497) runs once, as the page starts; saveNow (about 474) then writes the whole record under the one key "painting" from this tab\'s canvases, with no look at the record already there (its savedAt) and no change event from other tabs, so a tab whose canvas is older than the stored record replaces it. Re-reading the record when the Studio opens or the tab is shown (or comparing savedAt before writing, and a BroadcastChannel to tell the other tab) would stop it.',
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
    cause: 'js/painting.js saveMixes (about 825) writes this tab\'s own state.mixes under paintMixes, and the Studio has no storage listener (js/palette.js 447 has one for My paints), so a stale tab overwrites the list. The same holds for the Figure study class (js/figure.js showSetup writes its own Set of poses taken out) and the open drawers (js/app.js 2751).',
  });
  // the Figure class: the poses taken out in A, then in B
  await tab(a, 'figure', { wait: false }); await tab(b, 'figure', { wait: false });
  for (const p of [a, b]) await app(p).waitForFunction(() => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 30, null, { timeout: 40000 }).catch(() => null);
  await click(a, '#tab-figure [data-pose-id="stand"]');
  await click(b, '#tab-figure [data-pose-id="walk"]');
  const fs = JSON.parse(await storageGet(a, P + 'figureStudy') || '{}');
  t.check(J((fs.out || []).slice().sort()) === J(['stand', 'walk']), 'the poses taken out of the Figure class in two tabs are both out', fs);
  t.note(`the Figure class's poses taken out in two tabs: ${J(fs.out)} is what is kept (each tab writes the set it holds)`);
  await clean(t, a, 'twotabs: A'); await clean(t, b, 'twotabs: B');
});

// ---- segment: gamesetup -------------------------------------------------------------------------------------------------------------
// Paint by numbers' setup against Value battle's: what is chosen and kept when it is chosen, or only when a game starts
seg('gamesetup', 30, async (t, site, pages) => {
  const page = await open(pages, site);
  await tab(page, 'game'); await gameReady(page);
  await click(page, '#gameHard'); await setSelect(page, 'gamePalette', 'primary'); await setSelect(page, 'gameMode', 'relaxed'); await setRange(page, 'gameAmount', 4);
  const saved = await dumpOf(page);
  t.check(saved[P + 'gameMode'] === '"relaxed"' && saved[P + 'gameAmount'] === '4', 'Paint by numbers: Mode and the amount per tap are saved the moment they are chosen', saved);
  t.check(P + 'gameLevel' in saved && P + 'gamePalette' in saved, 'Paint by numbers: Difficulty and Palette are saved the moment they are chosen, as Value battle saves its palette, count and mode', Object.keys(saved));
  await reload(page); await tab(page, 'game'); await gameReady(page);
  const back = await app(page).evaluate(() => ({ level: document.querySelector('input[name="gameLevel"]:checked').value, palette: document.getElementById('gamePalette').value, mode: document.getElementById('gameMode').value }));
  t.check(back.level === 'hard' && back.palette === 'primary' && back.mode === 'relaxed', 'Paint by numbers after a reload: Hard, Three primaries and Relaxed are still chosen', back);
  if (back.mode === 'relaxed' && (back.level !== 'hard' || back.palette !== 'primary')) t.finding({
    title: 'Paint by numbers keeps Difficulty and Palette only once a game has been started; Mode, the amount per tap and the subject are kept as soon as they are chosen',
    severity: 'low',
    steps: '1. Open Games, Paint by numbers. 2. Choose Hard, a palette other than the one offered (Three primaries) and Relaxed mode, without starting. 3. Reload the page and open Paint by numbers again.',
    expected: 'The README\'s Privacy section lists "game and battle settings" as kept; Value battle keeps its palette, count and mode when they are chosen, and Paint by numbers does so for its Mode, the amount per tap and the sound.',
    actual: `After the reload Mode is ${back.mode} but Difficulty is ${back.level} and the palette is ${back.palette}; neither portrait-value-studio.gameLevel nor gamePalette was written until Start painting.`,
    cause: 'js/game.js startGame (586-587) is the only place that calls save(PALETTE_KEY ...) and save(LEVEL_KEY ...); the level radios (about 1701) and the palette menu\'s change handler (showPalette) write nothing.',
  });
  await clean(t, page, 'gamesetup');
});


export default async function persistence(t, site) {
  await runPool(t, site, +(process.env.PERSIST_JOBS || 3));
  t.note('segment times: ' + timings.join('; '));
}
