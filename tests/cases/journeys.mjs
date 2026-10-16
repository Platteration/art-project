// A visitor's whole session, at both widths: a photo in, a palette chosen, a line drawn, the Studio
// following the palette and copying the lines, the check drawer scoring the Studio painting, a game
// on the photo, a battle, the Help buttons, then Forget. The promises that span tabs live here.
// Then longer sessions, played the way a visitor moves through the app, with what every other tab shows
// read back after each step (the same photo, the same palette, the Studio's reference and its ground, the
// game's photo pane, the best scores) and nothing left behind (a page error, a policy violation, "Updating…"
// stuck, the focus on something hidden, a note that never leaves):
//   1. a photo from its load to the next visit: study it, tweak the splits, pick a palette, tone the Studio's
//      ground and paint, check the painting, play Paint by numbers and Value battle with that palette, reload
//      and carry on (the same photo loaded again finds its best score), then a second palette on the Study tab;
//   2. a Loomis head fitted on a photo and drawn into the Studio, a pose saved in Pose and light and drawn in a
//      Figure study class, then the next visit;
//   3. Simple and Advanced switched at every step (the Study, the Studio, Pose and light, a game, a battle);
//   4. two tabs of the site doing different things (a game in one, picked colors and a battle in the other);
//   5. a phone session through the tab bar's two menus.
// JOURNEYS_ONLY=<regexp> runs only the segments whose name matches.
import { openPage, newTab, clean, tab, poseFrame, DESKTOP, PHONE, makeImage, loadPhoto, stroke, inked, click, text, visible, storageKeys, storageGet, screenshot, hscroll, sleep, app } from '../lib.mjs';

const byText = (page, scope, re) => page.evaluate(([scope, src]) => { const re = new RegExp(src, 'i'); const b = [...document.querySelectorAll(`${scope} button`)].find((x) => re.test(x.textContent) && !x.hidden && !x.disabled); if (!b) return false; b.click(); return b.textContent.trim().slice(0, 40); }, [scope, re.source]);

const ONLY = process.env.JOURNEYS_ONLY ? new RegExp(process.env.JOURNEYS_ONLY, 'i') : null;
const J = JSON.stringify;
const P = 'portrait-value-studio.';

// one block's failure is one failed check, not the end of the case; the pages it opened are closed whatever happens
async function segment(t, name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  const pages = [];
  try { await fn(pages); } catch (e) { t.check(false, `${name}: ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  for (const p of pages) await p.context().close().catch(() => null);
  t.note(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---- waits on the page's own state -------------------------------------------------------------------------------
const until = (page, fn, arg = null, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
const idle = (page) => until(page, () => document.getElementById('busy').hidden, null, 45000);
const studioReady = (page) => page.evaluate(() => Promise.race([window.PaintStudio.ready(), new Promise((r) => setTimeout(r, 20000))]).then(() => true));
const gameReady = (page) => until(page, () => !document.getElementById('gameStart').disabled, null, 90000);
const gamePlaying = (page) => until(page, () => !document.getElementById('gamePlay').hidden, null, 30000);
const gameScored = (page) => until(page, () => !document.getElementById('gameResult').hidden, null, 20000);
const battleRound = (page, i) => until(page, (i) => { const g = window.ValueBattle && ValueBattle.state(); return !!g && (g.over || (g.i >= i && !g.answered)); }, i, 10000);
const battleAnswered = (page) => until(page, () => { const g = ValueBattle.state(); return !!g && g.answered; }, null, 10000);

// what a step must never leave behind: "Updating…" up, a note that stays, the focus on something hidden or inert,
// and (through clean) a page error, a console error, a policy violation, a request off the site
const focusOf = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return { on: 'the page' };
  const r = a.getBoundingClientRect(), cs = getComputedStyle(a);
  const lost = !!a.closest('[hidden], [inert]') || r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none';
  return { on: (a.id || a.tagName.toLowerCase()) + (a.dataset && a.dataset.tab ? `[${a.dataset.tab}]` : ''), lost };
});
async function steady(t, page, label) {
  t.check(await idle(page), `${label}: "Updating…" goes away`);
  const left = await until(page, () => !document.getElementById('toast').classList.contains('show'), null, 20000);
  t.check(left, `${label}: the note at the bottom goes away by itself`, await text(page, '#toast'));
  const f = await focusOf(page);
  t.check(!f.lost, `${label}: the focus is not left on something hidden`, f);
  await clean(t, page, label);
}

// ---- what the tabs show of the shared things -----------------------------------------------------------------------
const shows = (page) => page.evaluate(() => {
  const $ = (id) => document.getElementById(id);
  const sel = (id) => { const s = $(id); return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent.trim() : null; };
  const cur = window.StudioPalette && StudioPalette.current();
  const p = Studio.prep();
  const pressed = (scope, attr) => { const b = document.querySelector(`${scope} [${attr}][aria-pressed="true"]`); return b ? b.getAttribute(attr) : null; };
  return {
    tab: Studio.tab(), mode: document.body.classList.contains('mode-simple') ? 'simple' : 'advanced',
    source: $('source').textContent, key: Studio.sourceKey(), prep: p ? [p.w, p.h] : null,
    palette: cur && cur.name, codes: cur && cur.codes.slice(), chosen: !!(cur && cur.chosen), blockLabel: $('blockViewPalette').textContent, blockView: pressed('.block-view', 'data-block-view'),
    colorsState: $('colorsState').textContent, valuesState: $('valuesState').textContent,
    studioPalette: sel('ps-palette'), refKind: pressed('#ps-refSheet', 'data-ref-kind'), refView: pressed('#ps-refSheet', 'data-ref-view'), ref: [$('ps-refCanvas').width, $('ps-refCanvas').height], refName: $('ps-refName').textContent,
    loomisPhoto: [$('lh-photo').width, $('lh-photo').height],
    gamePhoto: $('gamePhotoName').textContent, gamePalette: $('gamePalette').value, gameBest: $('gameBest').textContent, preview: [$('gamePreview').width, $('gamePreview').height],
    battlePalette: $('vb-palette').value, battleBest: $('vb-best').textContent,
  };
});
// two canvases of the page compared pixel by pixel (a sample of them): their sizes, the mean difference per channel and the
// share of pixels more than 10 levels off in a channel
const samePicture = (page, a, b) => page.evaluate(([a, b]) => {
  const A = document.getElementById(a), B = document.getElementById(b);
  if (!A || !B || !A.width || !B.width) return { size: [A && A.width, A && A.height, B && B.width, B && B.height], diff: null };
  if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height], diff: null };
  const da = A.getContext('2d').getImageData(0, 0, A.width, A.height).data, db = B.getContext('2d').getImageData(0, 0, B.width, B.height).data;
  let d = 0, n = 0, off = 0;
  for (let i = 0; i < da.length; i += 4 * 37) { const e = [0, 1, 2].map((k) => Math.abs(da[i + k] - db[i + k])); d += e[0] + e[1] + e[2]; if (Math.max(...e) > 10) off++; n++; }
  return { size: [A.width, A.height], diff: +(d / n / 3).toFixed(2), off10: +(off / n).toFixed(3) };
}, [a, b]);
// the Studio's ground in the middle of the paper, and how much of the paint and underdrawing layers is marked
const groundAt = (page) => page.evaluate(() => { const c = document.getElementById('ps-ground'); const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data; return [d[0], d[1], d[2]]; });
const sameColor = (a, b, tol = 3) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const paintName = (page, code) => page.evaluate((c) => (Paints.byCode(c) || {}).name || null, code);

// ---- what a visitor does ---------------------------------------------------------------------------------------------
const setRange = (page, id, v) => page.evaluate(([id, v]) => { const s = document.getElementById(id); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
const openDrawer = (page, key) => page.evaluate((k) => { document.getElementById('drawer-' + k).open = true; }, key);
// a known palette chosen on the Study tab, by its id (as Colors and paints lists it)
async function pickPalette(page, id) {
  await openDrawer(page, 'colors');
  await until(page, (id) => { const b = document.querySelector(`#presetList li[data-preset="${id}"] button`); return !!b && !!b.offsetParent; }, id, 30000);
  const ok = await page.evaluate((id) => { const b = document.querySelector(`#presetList li[data-preset="${id}"] button`); if (!b || !b.offsetParent) return false; b.click(); return true; }, id);
  await until(page, (id) => { const c = StudioPalette.current(); const pr = Paints.PRESETS.find((p) => p.id === id); return !!c && !!pr && c.name === pr.name; }, id, 15000);
  await idle(page);
  return ok;
}
// a mix in the Studio: the paints tapped into the well, locked in, the sheet closed; then a stroke on the paper
async function studioMix(page, taps) {
  await click(page, '#ps-colorBtn');
  for (const [code, n] of taps) await page.evaluate(([code, n]) => { const b = document.querySelector(`#ps-paints [data-code="${code}"]`) || document.querySelector('#ps-paints .ps-paint'); for (let i = 0; i < n; i++) b.click(); }, [code, n]);
  await click(page, '#ps-lock');
  await page.evaluate(() => { if (!document.getElementById('ps-paintSheet').hidden) document.querySelector('#ps-paintSheet [data-close]').click(); });
}
// a toned ground of one paint (when the palette has it)
async function studioWash(page, code) {
  await click(page, '#ps-canvasBtn');
  await click(page, '#ps-canvasSheet [data-ground="wash"]');
  const name = await paintName(page, code);
  const ok = await page.evaluate((name) => { const b = [...document.querySelectorAll('#ps-washRow button')].find((x) => x.title === name); if (!b) return false; b.click(); return true; }, name);
  await page.evaluate(() => { if (!document.getElementById('ps-canvasSheet').hidden) document.querySelector('#ps-canvasSheet [data-close]').click(); });
  return ok ? name : null;
}
// the photo the Study tab drew for this test: lib's portrait on a background and a shirt of the colors given
async function photo(page, { name, width = 900, height = 1200, bg = ['#8a9aa6', '#3b4a52'], shirt = '#1f2a33', type = 'image/jpeg' }) {
  const dataUrl = await app(page).evaluate(([w, h, bg, shirt, type]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, bg[0]); grad.addColorStop(1, bg[1]); g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c98f6a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.42, w * 0.22, h * 0.25, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b3f2a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.25, w * 0.24, h * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e2420'; g.fillRect(w * 0.4, h * 0.4, w * 0.05, h * 0.02); g.fillRect(w * 0.55, h * 0.4, w * 0.05, h * 0.02);
    g.fillStyle = '#9c5a4a'; g.fillRect(w * 0.45, h * 0.54, w * 0.1, h * 0.02);
    g.fillStyle = shirt; g.fillRect(w * 0.2, h * 0.68, w * 0.6, h * 0.32);
    return c.toDataURL(type, 0.92);
  }, [width, height, bg, shirt, type]);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  return { name, mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}
// Paint by numbers on the board the setup shows: every number mixed, locked in
async function playGame(page) {
  if (!(await gameReady(page))) return { started: false };
  const palette = await page.evaluate(() => document.getElementById('gamePalette').value);
  await click(page, '#gameStart');
  if (!(await gamePlaying(page))) return { started: false, palette };
  const ref = await samePicture(page, 'gameRef', 'cv-orig');
  // every number a mix of white and a dark earth (or the darkest paint), lighter for each number: a fair attempt, never a perfect one
  await page.evaluate(() => {
    const numbers = [...document.querySelectorAll('#gameNumbers .game-number')], paints = [...document.querySelectorAll('#gamePaints .game-paint')];
    const code = (b) => b.querySelector('.game-paint-code').textContent;
    const white = paints[0], dark = paints.find((b) => ['BU', 'RU', 'IB'].includes(code(b))) || paints[paints.length - 1];
    numbers.forEach((nb, k) => { nb.click(); for (let i = 0; i < k; i++) white.click(); for (let i = 0; i < numbers.length - 1 - k; i++) dark.click(); });
  });
  await click(page, '#gameLock');
  const scored = await gameScored(page);
  const points = scored ? +(await text(page, '#gamePoints')) : null;
  return { started: true, palette, ref, scored, points };
}
// Value battle with two colors on Streak: `right` right answers, then a miss, then the setup again
async function playBattle(page, { palette, right }) {
  await until(page, () => document.getElementById('vb-palette').options.length > 0, null, 10000);
  if (palette) await page.evaluate((v) => { const s = document.getElementById('vb-palette'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, palette);
  await click(page, '#vbCount2'); await click(page, '#vbModeStreak');
  await click(page, '#vb-start');
  if (!(await battleRound(page, 0))) return false;
  for (let i = 0; i <= right; i++) {
    const ok = i < right;
    await page.evaluate((ok) => { const g = ValueBattle.state(), r = g.rounds[g.i]; const want = ok ? r.answer : r.answer === 'same' ? 'left' : 'same'; if (want === 'same') document.querySelector('.vb-choice[data-choice="same"]').click(); else document.querySelector(`.vb-swatch[data-index="${want === 'left' ? 0 : 1}"]`).click(); }, ok);
    await battleAnswered(page);
    if (ok) { await click(page, '#vb-next'); await battleRound(page, i + 1); }
  }
  await until(page, () => !document.getElementById('vb-miss').hidden, null, 5000);
  await click(page, '#vb-missNext');
  await until(page, () => !document.getElementById('vb-popup').hidden, null, 5000);
  await click(page, '#vb-settings');
  return until(page, () => !document.getElementById('vb-setup').hidden, null, 5000);
}
// the Loomis head: every mark tapped where the model puts it for a head s wide at (cx, cy), and locked in
async function fitHead(page, { s = 0.2, cx = 0.5, cy = 0.45 } = {}) {
  const marks = await page.evaluate(([s, cx, cy]) => { const p = Studio.prep(); const a = p.h / p.w; const out = []; Loomis.STEPS.forEach((st) => { out.push([cx + s * st.model[0], (cy + s * st.model[1]) / a]); }); return out; }, [s, cx, cy]);
  for (const [fx, fy] of marks) {
    const b = await page.evaluate(() => { const r = document.getElementById('lh-overlay').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.click(b.x + fx * b.w, b.y + fy * b.h);
    await until(page, () => !document.getElementById('lh-lock').disabled, null, 5000);
    await click(page, '#lh-lock');
  }
  return until(page, () => window.Loomis.has(), null, 15000);
}
// the Studio's saved record (IndexedDB portrait-value-studio, store studio, key painting) stamped at or after `since`
const recordAt = (page) => page.evaluate(() => new Promise((res) => { let r; try { r = indexedDB.open('portrait-value-studio'); } catch (e) { res(null); return; } r.onsuccess = () => { const db = r.result; try { const g = db.transaction('studio').objectStore('studio').get('painting'); g.onsuccess = () => { db.close(); res(g.result ? g.result.savedAt : null); }; g.onerror = () => { db.close(); res(null); }; } catch (e) { db.close(); res(null); } }; r.onerror = () => res(null); }));
async function savedSince(page, since, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const at = await recordAt(page); if (at && at >= since) return true; await sleep(400); }
  return false;
}
// a layer of the Studio that gets marks a moment after the press that asked for them (Copy the Study lines runs 150 ms after the switch)
async function inkAppears(page, sel, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await inked(page, sel)) > 0) return true; await sleep(200); }
  return false;
}
const overlayInk = (page, id) => page.evaluate((id) => { const c = document.getElementById(id).nextElementSibling; if (!c || !c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 100) n++; return n; }, id);

// evidence gathered across the journeys, for the findings written at the end
const seen = { washStudy: null, washMode: null, washReload: null, blocks: null, twoTabCheck: null };

export default async function journeys(t, site) {
  await segment(t, 'the first journeys (desktop and phone)', (pages) => firstJourneys(t, site, pages));
  await segment(t, 'journey 1: a photo from its load to the next visit', (pages) => photoToNextVisit(t, site, pages));
  await segment(t, 'journey 2: a Loomis head into the Studio, a pose into Figure study, the next visit', (pages) => headAndFigure(t, site, pages));
  await segment(t, 'journey 3: Simple and Advanced at every step', (pages) => modeAtEveryStep(t, site, pages));
  await segment(t, 'journey 4: two tabs doing different things', (pages) => twoTabs(t, site, pages));
  await segment(t, 'journey 5: a phone session through the tab bar\'s menus', (pages) => phoneMenus(t, site, pages));
  findings(t);
}

async function firstJourneys(t, site, pages) {
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const page = await openPage(site, { viewport });
    pages.push(page);

    // a photo in, Advanced, the second known palette
    await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'friend.jpg' }));
    t.check(/friend/.test(await text(page, '#tab-study') || ''), `${label}: the photo's name shows on the Study tab`);
    await click(page, '[data-mode="advanced"]'); await sleep(400);
    t.check(await page.evaluate(() => document.body.classList.contains('mode-advanced') || !document.body.classList.contains('mode-simple')), `${label}: Advanced is on`);
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; });
    await page.waitForFunction(() => document.querySelectorAll('#presetList button').length >= 3, null, { timeout: 15000 }).catch(() => null);
    const presets = await page.evaluate(() => [...document.querySelectorAll('#presetList button')].map((b) => b.textContent.trim().slice(0, 40)));
    t.check(presets.length >= 3, `${label}: the known palettes are listed for this photo`, presets);
    await page.evaluate(() => document.querySelectorAll('#presetList button')[1].click()); await sleep(1500);
    const chosen = await page.evaluate(() => window.StudioPalette && StudioPalette.current() && StudioPalette.current().name);
    t.check(!!chosen, `${label}: a palette is chosen`, chosen);
    await clean(t, page, `${label}: photo and palette`);

    // a reference line
    await click(page, '[data-tool="line"]'); await sleep(200);
    await stroke(page, '#tab-study canvas', [[0.2, 0.2], [0.7, 0.6]]);
    await sleep(400);
    const lineCount = await page.evaluate(() => document.querySelector('[data-tool="line"]').dataset.count);
    t.check(lineCount === '1', `${label}: the Lines tool counts one line`, lineCount);
    await click(page, '[data-tool="line"]'); // off again
    await clean(t, page, `${label}: a line`);

    // the Studio follows the palette and copies the lines
    await tab(page, 'paint'); await sleep(1200);
    const psPal = await page.evaluate(() => { const s = document.getElementById('ps-palette'); return s && s.selectedOptions[0] && s.selectedOptions[0].textContent.trim(); });
    t.check(psPal === chosen, `${label}: the Studio's palette follows the Study tab's`, { chosen, psPal });
    const sketchBefore = await inked(page, '#ps-sketch');
    await click(page, '#ps-brushBtn'); await sleep(300);
    const copied = await byText(page, '#ps-root', /Copy the Study lines/);
    await sleep(800);
    t.check(copied !== false, `${label}: Copy the Study lines is offered`, copied);
    const sketchAfter = await inked(page, '#ps-sketch');
    t.check(sketchAfter > sketchBefore, `${label}: the Study line is on the underdrawing`, { sketchBefore, sketchAfter });
    await page.keyboard.press('Escape');
    await stroke(page, '#ps-paper', [[0.3, 0.4], [0.6, 0.5], [0.4, 0.7]]);
    const paint = await inked(page, '#ps-paper');
    t.check(paint > 100, `${label}: a stroke on the paper`, paint);
    await screenshot(page, `journey-${label}-studio`);
    await clean(t, page, `${label}: studio`);

    // the check drawer scores the Studio painting
    await tab(page, 'study'); await sleep(500);
    await page.evaluate(() => { document.getElementById('drawer-check').open = true; });
    const used = await byText(page, '#drawer-check', /Use my Studio painting/);
    t.check(used !== false, `${label}: Use my Studio painting is offered`, used);
    await page.waitForFunction(() => { const b = document.getElementById('checkBody'); return b && !b.hidden; }, null, { timeout: 30000 }).catch(() => null);
    await sleep(1500);
    const scores = await page.evaluate(() => ['scoreColor', 'scoreValue', 'scoreShapes'].map((id) => (document.getElementById(id) || {}).textContent));
    t.check(scores.every((s) => /\d/.test(s || '')), `${label}: the three scores show numbers`, scores);
    t.check(/\d/.test(await text(page, '#checkState') || ''), `${label}: the drawer's badge keeps the score`, await text(page, '#checkState'));
    await clean(t, page, `${label}: check`);

    // a game on the photo: one number mixed, locked in, a score
    await tab(page, 'game'); await sleep(800);
    const gamePal = await page.evaluate(() => { const s = document.getElementById('gamePalette'); return s && s.selectedOptions[0] && s.selectedOptions[0].textContent.trim(); });
    t.note(`${label}: the game suggests "${gamePal}" for this photo (the Study's palette is "${chosen}")`);
    await click(page, '#gameStart');
    await page.waitForFunction(() => document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
    const numbers = await page.evaluate(() => document.querySelectorAll('#gameNumbers .game-number').length);
    t.check(numbers >= 6, `${label}: the board has numbers`, numbers);
    await page.evaluate(() => document.querySelector('#gameNumbers .game-number').click());
    for (let i = 0; i < 3; i++) { await page.evaluate(() => document.querySelector('#gamePaints button').click()); await sleep(120); }
    await click(page, '#gameLock'); await sleep(2500);
    const popup = await page.evaluate(() => { const p = document.getElementById('gamePopup'); return { shown: p && (p.open || !p.hidden), text: p && p.textContent.replace(/\s+/g, ' ').slice(0, 120) }; });
    t.check(popup.shown && /\d/.test(popup.text), `${label}: locking in shows the score pop-up`, popup);
    await click(page, '#gamePopupClose'); await sleep(500);
    t.check((await storageKeys(page)).some((k) => k.endsWith('.gameBest')), `${label}: a best score is kept`);
    await clean(t, page, `${label}: game`);

    // a battle: start, answer once, quit twice
    await tab(page, 'battle'); await sleep(500);
    const started = await byText(page, '#tab-battle', /^Start/);
    t.check(started !== false, `${label}: the battle starts`, started);
    await sleep(800);
    const answered = await page.evaluate(() => { const b = [...document.querySelectorAll('#tab-battle button')].find((x) => /darker|lighter|same|^[A-D]$/i.test(x.textContent.trim()) || /color/i.test(x.getAttribute('aria-label') || '')); if (!b) return null; b.click(); return (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 30); });
    t.check(answered !== null, `${label}: a round can be answered`, answered);
    await sleep(1200);
    const quit = await byText(page, '#tab-battle', /✕|quit|stop/i); await sleep(300); await byText(page, '#tab-battle', /✕|quit|stop/i); await sleep(800);
    t.note(`${label}: battle quit via "${quit}"`);
    await clean(t, page, `${label}: battle`);

    // the Help buttons lead where they say
    await tab(page, 'help'); await sleep(300);
    await click(page, '[data-go="paint"]'); await sleep(600);
    t.check(await page.evaluate(() => !document.getElementById('tab-paint').hidden && document.body.classList.contains('tab-paint')), `${label}: Help's Go to Studio opens the Studio`);
    await tab(page, 'help'); await click(page, '[data-go="check"]'); await sleep(600);
    t.check(await page.evaluate(() => !document.getElementById('tab-study').hidden && document.getElementById('drawer-check').open), `${label}: Help's Check a painting opens the drawer`);
    await clean(t, page, `${label}: help`);

    // Forget: everything back to the defaults
    await tab(page, 'help'); await click(page, '#forgetBtn'); await sleep(300);
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
    await sleep(1500);
    const after = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), simple: document.body.classList.contains('mode-simple'), name: document.querySelector('#tab-study').textContent.includes('friend'), lines: document.querySelector('[data-tool="line"]').dataset.count || '' }));
    t.check(after.keys.length === 0 && after.simple && !after.name && after.lines === '', `${label}: after Forget the defaults are back`, after);
    await clean(t, page, `${label}: forget`);
    await page.context().close();
  }
}

// ==== 1. a photo from its load to the next visit ======================================================================
async function photoToNextVisit(t, site, pages) {
  const L = 'J1';
  const page = await openPage(site);
  pages.push(page);
  const file = await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'aunt.jpg' });

  // the photo in: the Study names it, the other tabs take it
  await loadPhoto(page, file);
  let s = await shows(page);
  t.check(/^aunt\.jpg · 900 × 1200 px/.test(s.source) && s.key === 'aunt:900x1200', `${L} load: the Study tab names the photo`, { source: s.source, key: s.key });
  await steady(t, page, `${L} load`);

  // study it: Advanced, the splits moved
  await click(page, '[data-mode="advanced"]'); await idle(page);
  await openDrawer(page, 'values');
  await setRange(page, 't1', 30); await setRange(page, 't2', 72); await idle(page);
  s = await shows(page);
  t.check(/^Splits at V 3\.0 and 7\.2\b/.test(s.valuesState), `${L} splits: the drawer's header says the splits chosen`, s.valuesState);
  await steady(t, page, `${L} splits`);

  // a palette: Rembrandt's earths, and the blocks shown as it mixes them
  t.check(await pickPalette(page, 'rembrandt'), `${L} palette: Rembrandt (earths) can be picked`);
  await click(page, '[data-block-view="palette"]'); await idle(page);
  s = await shows(page);
  t.check(s.palette === 'Rembrandt (earths)' && s.chosen && s.blockLabel === 'Rembrandt' && s.blockView === 'palette' && /Rembrandt/.test(s.colorsState), `${L} palette: the drawer, its header and the blocks' switch all name Rembrandt`, { palette: s.palette, chosen: s.chosen, blockLabel: s.blockLabel, blockView: s.blockView, colorsState: s.colorsState });
  await steady(t, page, `${L} palette`);

  // the Studio: its palette and its reference are the Study tab's
  await tab(page, 'paint'); await studioReady(page);
  s = await shows(page);
  t.check(s.studioPalette === 'Rembrandt (earths)', `${L} Studio: its palette is the Study tab's`, s.studioPalette);
  t.check(s.refKind === 'studio' && J(s.ref) === J(s.prep), `${L} Studio: the reference is the Study photo, at its size`, { refKind: s.refKind, ref: s.ref, prep: s.prep });
  await until(page, () => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, 30000);
  const refOrig = await samePicture(page, 'ps-refCanvas', 'cv-orig');
  await click(page, '#ps-refFig [data-ref-view="values"]');
  const refValues = await samePicture(page, 'ps-refCanvas', 'cv-value');
  await click(page, '#ps-refFig [data-ref-view="blocks"]');
  const refBlocks = await samePicture(page, 'ps-refCanvas', 'cv-block');
  await click(page, '#ps-refFig [data-ref-view="original"]');
  t.check(refOrig.diff === 0 && refValues.diff === 0, `${L} Studio: the reference's Original and Values are the Study tab's photo and its value study (the splits moved)`, { refOrig, refValues });
  t.check(refBlocks.diff !== null && refBlocks.diff < 1, `${L} Studio: the reference's Blocks are the color shapes the Study tab shows (as Rembrandt mixes them)`, refBlocks);
  if (!(refBlocks.diff !== null && refBlocks.diff < 1)) seen.blocks = { diff: refBlocks.diff, off: refBlocks.off10 };
  // a toned ground of Light Red, a mix locked in, a stroke
  const wash = await studioWash(page, 'LR');
  t.check(wash === 'Light Red', `${L} Studio: a wash of Light Red, one of Rembrandt's paints, can be laid`, wash);
  await studioMix(page, [['LR', 2], ['LW', 3]]);
  await stroke(page, '#ps-paper', [[0.3, 0.35], [0.55, 0.5], [0.4, 0.7]]);
  await stroke(page, '#ps-paper', [[0.6, 0.3], [0.7, 0.6]]);
  const painted1 = await page.evaluate(() => Date.now());
  const ground1 = await groundAt(page), paper1 = await inked(page, '#ps-paper');
  const mixes1 = await page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length);
  t.check(paper1 > 100, `${L} Studio: the strokes are on the paper`, paper1);
  await steady(t, page, `${L} Studio`);

  // the painting checked on the Study tab, against the photo
  await tab(page, 'study');
  await openDrawer(page, 'check');
  await click(page, '#artFromStudio');
  const scored = await until(page, () => !document.getElementById('checkBody').hidden && /\d/.test(document.getElementById('checkState').textContent), null, 45000);
  const check = await page.evaluate(() => ({ badge: document.getElementById('checkState').textContent, color: document.getElementById('scoreColor').textContent, ref: [document.getElementById('cv-refblock').width, document.getElementById('cv-refblock').height], art: document.getElementById('artSource').textContent }));
  s = await shows(page);
  t.check(scored && J(check.ref) === J(s.prep) && s.key === 'aunt:900x1200', `${L} check: the Studio painting is scored against the photo (the reference blocks at its size)`, { check, prep: s.prep, key: s.key });
  await steady(t, page, `${L} check`);

  // Paint by numbers on the photo: the setup names it, the photo pane in play is the photo, a best is kept
  await tab(page, 'game');
  await gameReady(page);
  s = await shows(page);
  t.check(s.gamePhoto === 'Painting from aunt.' && J(s.preview) === J(s.prep), `${L} game: the setup paints from the photo`, { gamePhoto: s.gamePhoto, preview: s.preview, prep: s.prep });
  const game1 = await playGame(page);
  t.check(game1.started && game1.ref && game1.ref.diff === 0, `${L} game: the reference beside the board is the Study photo`, game1.ref);
  t.check(game1.scored && game1.points > 0, `${L} game: locking in scores the portrait`, game1);
  const bests1 = JSON.parse(await storageGet(page, P + 'gameBest') || '{}');
  const bestKey = `aunt:900x1200|medium|${game1.palette}`;
  t.check(bests1[bestKey] === game1.points, `${L} game: the best is kept under the photo, the level and the palette`, { bests1, bestKey });
  await click(page, '#gamePopup [data-game="new"]'); await gameReady(page);
  const bestLine = `Your best on this portrait at this level in Classic mode: ${game1.points} points`;
  t.check((await text(page, '#gameBest')) === bestLine, `${L} game: the setup shows that best`, await text(page, '#gameBest'));
  await steady(t, page, `${L} game`);

  // Value battle with the Study's palette: one right, then a miss
  await tab(page, 'battle');
  t.check(await playBattle(page, { palette: 'rembrandt', right: 1 }), `${L} battle: a streak of one with Rembrandt's earths`);
  s = await shows(page);
  t.check(s.battlePalette === 'rembrandt' && s.battleBest === 'Your best streak here: 1 in a row.', `${L} battle: the setup keeps the palette and shows the best`, { palette: s.battlePalette, best: s.battleBest });
  await steady(t, page, `${L} battle`);

  // the next visit: everything the README says is kept is back, the photo is not (it is never stored)
  t.check(await savedSince(page, painted1), `${L} the Studio saved the painting before the next visit`);
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  s = await shows(page);
  t.check(s.mode === 'advanced' && s.palette === 'Rembrandt (earths)' && s.chosen && s.blockView === 'palette', `${L} next visit: Advanced, Rembrandt (earths) and the blocks as it mixes them are back`, { mode: s.mode, palette: s.palette, chosen: s.chosen, blockView: s.blockView });
  t.check(/^Sample study\b/.test(s.source), `${L} next visit: the Study tab is back on the sample (photos are not kept)`, s.source);
  const drawers = await page.evaluate(() => ['values', 'colors', 'check'].filter((k) => document.getElementById('drawer-' + k).open));
  t.check(J(drawers) === J(['values', 'colors', 'check']), `${L} next visit: the drawers left open are open`, drawers);
  await tab(page, 'paint'); await studioReady(page);
  s = await shows(page);
  const ground2 = await groundAt(page), paper2 = await inked(page, '#ps-paper');
  const mixes2 = await page.evaluate(() => document.querySelectorAll('#ps-mixes .ps-mix').length);
  t.check(Math.abs(paper2 - paper1) <= paper1 * 0.05 && mixes2 === mixes1 && s.studioPalette === 'Rembrandt (earths)', `${L} next visit: the painting, the mix locked in and the palette are back in the Studio`, { paper1, paper2, mixes1, mixes2, palette: s.studioPalette });
  t.check(sameColor(ground2, ground1) && (await text(page, '#ps-washName')) === 'Light Red', `${L} next visit: the Studio's ground is the Light Red wash it had`, { before: ground1, after: ground2, wash: await text(page, '#ps-washName') });
  await tab(page, 'battle');
  s = await shows(page);
  t.check(s.battlePalette === 'rembrandt' && s.battleBest === 'Your best streak here: 1 in a row.', `${L} next visit: the battle's palette and best streak are back`, { palette: s.battlePalette, best: s.battleBest });
  await steady(t, page, `${L} next visit`);

  // the same photo again finds its best; the painting goes on
  await tab(page, 'study');
  await loadPhoto(page, file);
  await tab(page, 'game'); await gameReady(page);
  await page.evaluate((v) => { const s = document.getElementById('gamePalette'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, game1.palette);
  await gameReady(page);
  t.check((await text(page, '#gameBest')) === bestLine, `${L} next visit: the same photo loaded again shows its best at that level and palette`, { line: await text(page, '#gameBest'), want: bestLine });
  await tab(page, 'paint'); await studioReady(page);
  s = await shows(page);
  t.check(s.refKind === 'studio' && J(s.ref) === J(s.prep) && (await samePicture(page, 'ps-refCanvas', 'cv-orig')).diff === 0, `${L} next visit: the Studio's reference is the photo loaded again`, { ref: s.ref, prep: s.prep });
  await stroke(page, '#ps-paper', [[0.2, 0.8], [0.8, 0.85]]);
  t.check((await inked(page, '#ps-paper')) > paper2, `${L} next visit: painting goes on over what came back`);
  await steady(t, page, `${L} carry on`);

  // a second palette on the Study tab: the Studio follows it (it has not chosen one), and its ground stays as it was toned
  await tab(page, 'study');
  await pickPalette(page, 'zorn');
  await tab(page, 'paint'); await studioReady(page);
  s = await shows(page);
  const ground3 = await groundAt(page);
  const wash3 = await text(page, '#ps-washName');
  t.check(s.studioPalette === 'Zorn', `${L} Zorn on the Study tab: the Studio's palette follows`, s.studioPalette);
  t.check(sameColor(ground3, ground1), `${L} Zorn on the Study tab: the Studio's ground under the painting stays the Light Red wash`, { before: ground1, after: ground3, wash: wash3 });
  if (!sameColor(ground3, ground1)) seen.washStudy = { before: ground1, after: ground3, wash: wash3 };
  // and the reference's Blocks against the Study tab's shapes as Zorn mixes them (a palette with no blue)
  await until(page, () => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, 30000);
  await click(page, '#ps-refFig [data-ref-view="blocks"]');
  const zornBlocks = await samePicture(page, 'ps-refCanvas', 'cv-block');
  await click(page, '#ps-refFig [data-ref-view="original"]');
  t.check(zornBlocks.diff !== null && zornBlocks.diff < 1, `${L} Zorn on the Study tab: the reference's Blocks are the color shapes the Study tab shows (as Zorn mixes them)`, zornBlocks);
  if (!(zornBlocks.diff !== null && zornBlocks.diff < 1)) seen.blocks = { ...(seen.blocks || {}), zorn: zornBlocks.diff, zornOff: zornBlocks.off10 };
  await screenshot(page, 'journey-1-studio-after-zorn');
  await steady(t, page, `${L} Zorn`);
}

// ==== 2. a Loomis head into the Studio, a pose into Figure study, the next visit =====================================
async function headAndFigure(t, site, pages) {
  const L = 'J2';
  const page = await openPage(site);
  pages.push(page);
  await click(page, '[data-mode="advanced"]'); await idle(page);
  const sample = await shows(page);
  // a sitter against a blue wall, in a green shirt: no palette is chosen, so the Study tab's is the best match for it
  await loadPhoto(page, await photo(page, { name: 'sitter.png', type: 'image/png', bg: ['#2f6fb5', '#1d4f8a'], shirt: '#2e8b57' }));
  let s = await shows(page);
  t.check(/^sitter\.png · 900 × 1200 px/.test(s.source) && !s.chosen, `${L} load: the Study tab names the photo, its palette the best match (${s.palette})`, { source: s.source, palette: s.palette, chosen: s.chosen });
  await steady(t, page, `${L} load`);

  // the Loomis head on the photo
  await tab(page, 'loomis');
  s = await shows(page);
  t.check(J(s.loomisPhoto) === J(s.prep), `${L} Loomis: the photo is the Study tab's`, { loomis: s.loomisPhoto, prep: s.prep });
  const fitted = await fitHead(page);
  const head = await page.evaluate(() => ({ segs: Loomis.segments().length, ask: document.getElementById('lh-ask').textContent, cardStudio: !document.getElementById('lh-cardStudio').hidden }));
  t.check(fitted && head.segs > 50 && head.cardStudio, `${L} Loomis: eight marks fit the head, and Draw it in the Studio is offered`, head);
  await steady(t, page, `${L} Loomis`);
  await tab(page, 'study');
  const studyHead = await overlayInk(page, 'cv-orig');
  t.check(studyHead > 50 && (await page.evaluate(() => Studio.marks().length)) === head.segs, `${L} Study: the head lies over the Study tab's pictures`, { ink: studyHead });
  await tab(page, 'loomis');

  // drawn into the Studio, by the card's button
  await page.locator('#lh-cardStudio').click();
  await until(page, () => Studio.tab() === 'paint', null, 10000);
  await studioReady(page);
  await inkAppears(page, '#ps-sketch');
  s = await shows(page);
  const sketch1 = await inked(page, '#ps-sketch');
  t.check(s.tab === 'paint' && sketch1 > 200, `${L} Draw it in the Studio: the Studio opens with the head on its underdrawing`, { tab: s.tab, sketch: sketch1 });
  t.check(s.refKind === 'studio' && J(s.ref) === J(s.prep) && s.studioPalette === s.palette, `${L} Studio: the reference is the sitter and the palette the Study tab's (${s.palette})`, { ref: s.ref, prep: s.prep, studio: s.studioPalette, study: s.palette });
  // a wash of a paint of this palette that the sample's best palette does not have, and paint over the head
  const own = s.codes.filter((c) => !['TW', 'LW'].includes(c) && !(sample.codes || []).includes(c));
  const washCode = own.find((c) => ['Vir', 'UB', 'PGL', 'CO', 'AC'].includes(c)) || own[0] || null;
  const washName = washCode ? await studioWash(page, washCode) : null;
  t.check(!!washName, `${L} Studio: a wash of ${washName || 'a paint the sample\'s palette lacks'} is laid (${s.palette} has it, ${sample.palette} does not)`, { codes: s.codes, sample: sample.codes });
  await studioMix(page, [[s.codes[1], 1], [s.codes[0], 2]]);
  await stroke(page, '#ps-paper', [[0.35, 0.3], [0.5, 0.45], [0.62, 0.6]]);
  const painted1 = await page.evaluate(() => Date.now());
  const ground1 = await groundAt(page), paper1 = await inked(page, '#ps-paper');
  await steady(t, page, `${L} Studio`);

  // a pose saved in Pose and light
  await tab(page, 'pose');
  const pf = poseFrame(page);
  t.check(!!pf, `${L} Pose and light: the frame is up`);
  if (!pf) return;
  t.check(await pf.evaluate(() => !document.documentElement.classList.contains('simple')), `${L} Pose and light: the frame is in Advanced, as the app is`);
  await pf.evaluate(() => { const b = document.querySelector('#poses .pose-btn[data-id="lunge"]'); if (b) b.click(); else document.getElementById('libClose').click(); });
  await pf.waitForFunction(() => document.getElementById('library').hidden, null, { timeout: 10000 }).catch(() => null);
  await pf.evaluate(() => document.getElementById('savePose').click());
  const saved = await pf.waitForFunction(() => /^Saved/.test(document.getElementById('savePose').textContent), null, { timeout: 5000 }).then(() => true).catch(() => false);
  const mine = JSON.parse(await storageGet(page, 'pose-and-light.mine.v1') || '[]');
  t.check(saved && mine.length === 1, `${L} Pose and light: Save this pose keeps the lunge`, { saved, mine: mine.length });
  // then the figure is set kneeling, which is where this visit leaves Pose and light
  await pf.evaluate(() => document.getElementById('posesBtn').click());
  await pf.waitForFunction(() => !document.getElementById('library').hidden, null, { timeout: 5000 }).catch(() => null);
  await pf.evaluate(() => { const b = document.querySelector('#poses .pose-btn[data-id="kneel"]'); if (b) b.click(); });
  await pf.waitForFunction(() => document.getElementById('library').hidden, null, { timeout: 10000 }).catch(() => null);
  const kneelMarked = await pf.waitForFunction(() => { const b = document.querySelector('#poses .pose-btn[aria-pressed="true"]'); return !!b && b.dataset.id === 'kneel'; }, null, { timeout: 5000 }).then(() => true).catch(() => false);
  const leftOff = await storageGet(page, 'pose-and-light.v2');
  t.check(kneelMarked && !!leftOff, `${L} Pose and light: Kneel picked from the library is the pose on the figure, and kept`, { kneelMarked, kept: !!leftOff });
  await clean(t, page, `${L} Pose and light`);

  // Figure study: the saved pose is in the class, drawn alone; the Studio's own paper is not touched
  await tab(page, 'figure');
  await until(page, () => !document.getElementById('fig-start').disabled, null, 60000);
  const pool = await page.evaluate(() => ({ mine: [...document.querySelectorAll('#tab-figure [data-pose-id^="mine-"]')].map((b) => b.dataset.poseId), all: document.querySelectorAll('#tab-figure [data-pose-id]').length, group: !!document.querySelector('#tab-figure [data-group="mine"]') }));
  t.check(pool.mine.length === 1 && pool.all === 31, `${L} Figure study: the pose saved in Pose and light is in the class, beside the thirty`, pool);
  if (pool.mine.length) {
    await page.evaluate((id) => { document.querySelectorAll('#tab-figure [data-pose-id]').forEach((b) => { if ((b.getAttribute('aria-pressed') === 'true') !== (b.dataset.poseId === id)) b.click(); }); }, pool.mine[0]);
    await click(page, '#fig-relaxed');
    await page.evaluate(() => { if (window.__figWatch) return; window.__figWatch = true; window.__cardAt = 0; const res = document.getElementById('fig-result'); new MutationObserver(() => { if (!res.hidden) window.__cardAt = performance.now(); }).observe(res, { attributes: true, attributeFilter: ['hidden'] }); });
    await click(page, '#fig-start');
    const posed = await until(page, () => /^Pose 1: /.test(document.getElementById('fig-say').textContent), null, 40000);
    const cls = await page.evaluate(() => { const c = FigureStudy.state(); return c && { id: c.id, pool: c.pool.length }; });
    t.check(posed && cls && cls.id === pool.mine[0], `${L} Figure study: the class deals the saved pose`, cls);
    await until(page, () => { const c = FigureStudy.state(); return !!c && !!c.shot && performance.now() - c.since >= 550; }, null, 20000);
    await stroke(page, '#fs-paper', [[0.45, 0.2], [0.5, 0.5], [0.45, 0.85]]);
    await stroke(page, '#fs-paper', [[0.3, 0.35], [0.7, 0.35]]);
    await click(page, '#fig-done');
    const card = await until(page, () => !document.getElementById('fig-result').hidden, null, 20000);
    await until(page, () => window.__cardAt && performance.now() - window.__cardAt >= 650, null, 5000);
    const stars = await page.evaluate(() => document.getElementById('fig-stars').getAttribute('aria-label'));
    t.check(card && /out of 5 stars/.test(stars || ''), `${L} Figure study: Done brings the card with its stars`, stars);
    await click(page, '#fig-stop');
    const review = await until(page, () => !document.getElementById('fig-review').hidden, null, 10000);
    t.check(review && (await page.evaluate(() => document.querySelectorAll('#fig-cards > *').length)) === 1, `${L} Figure study: Stop class shows the one drawing in the review`);
  }
  await steady(t, page, `${L} Figure study`);
  await tab(page, 'paint'); await studioReady(page);
  t.check((await inked(page, '#ps-paper')) === paper1 && sameColor(await groundAt(page), ground1) && (await inked(page, '#ps-sketch')) === sketch1, `${L} after the class: the Studio's painting, ground and underdrawing are as they were`, { paper: [paper1, await inked(page, '#ps-paper')], sketch: [sketch1, await inked(page, '#ps-sketch')] });
  await tab(page, 'loomis');
  t.check(await page.evaluate(() => Loomis.has() && Loomis.segments().length > 50), `${L} after the class: the Loomis head is still fitted`);
  t.check(!!leftOff && (await storageGet(page, 'pose-and-light.v2')) === leftOff, `${L} after the class: Pose and light's "where you left off" is still the kneeling figure (the class drew the lunge in its own hidden page)`);
  await tab(page, 'pose');
  const marked = await pf.evaluate(() => [...document.querySelectorAll('#poses .pose-btn[aria-pressed="true"], #mine .pose-btn[aria-pressed="true"]')].map((b) => b.dataset.id)).catch(() => null);
  t.check(J(marked) === J(['kneel']), `${L} after the class: Pose and light's library still marks Kneel as the pose on the figure`, marked);

  // the next visit: the Studio's painting, underdrawing and ground, the saved pose in Figure study
  t.check(await savedSince(page, painted1), `${L} the Studio saved the painting before the next visit`);
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  s = await shows(page);
  t.note(`${L}: after the reload the Study tab is on the sample, and its palette is ${s.palette} (it was ${sample.palette} on the sample before the photo)`);
  await tab(page, 'paint'); await studioReady(page);
  const ground2 = await groundAt(page);
  const wash2 = await text(page, '#ps-washName');
  t.check(Math.abs((await inked(page, '#ps-paper')) - paper1) <= paper1 * 0.05 && Math.abs((await inked(page, '#ps-sketch')) - sketch1) <= sketch1 * 0.05, `${L} next visit: the painting and the head's underdrawing are back`);
  t.check(sameColor(ground2, ground1) && wash2 === washName, `${L} next visit: the Studio's ground is the ${washName} wash it was toned with`, { before: ground1, after: ground2, wash: wash2 });
  if (!(sameColor(ground2, ground1) && wash2 === washName)) seen.washReload = { photoPalette: s.palette, wash: washName, now: wash2, before: ground1, after: ground2, samplePalette: sample.palette };
  await tab(page, 'loomis');
  t.note(`${L}: after the reload the Loomis head is ${await page.evaluate(() => Loomis.has()) ? 'still fitted' : 'gone with the photo (neither is kept between visits)'}`);
  await tab(page, 'figure');
  await until(page, () => document.querySelectorAll('#tab-figure [data-pose-id]').length >= 31, null, 60000);
  t.check((await page.evaluate(() => document.querySelectorAll('#tab-figure [data-pose-id^="mine-"]').length)) === 1, `${L} next visit: the saved pose is still in Figure study's library`);
  await steady(t, page, `${L} next visit`);
}

// ==== 3. Simple and Advanced at every step ============================================================================
async function modeAtEveryStep(t, site, pages) {
  const L = 'J3';
  const page = await openPage(site);
  pages.push(page);
  const mode = async (m) => { await click(page, `[data-mode="${m}"]`); await idle(page); };
  const presetsShown = () => page.evaluate(() => [...document.querySelectorAll('#presetList li')].filter((li) => li.offsetParent).map((li) => li.dataset.preset));
  await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'model.jpg' }));
  await openDrawer(page, 'colors');
  await until(page, () => document.querySelectorAll('#presetList li').length >= 10, null, 30000);

  // the Study tab, both ways
  let s = await shows(page);
  let shown = await presetsShown();
  const idOf = (name) => page.evaluate((n) => (Paints.PRESETS.find((p) => p.name === n) || {}).id || null, name);
  t.check(s.mode === 'simple' && shown.length === 3 && shown.includes(await idOf(s.palette)) && s.valuesState === 'Normal detail', `${L} Simple: three palettes, the one in use among them, the Detail preset in the header`, { shown, palette: s.palette, header: s.valuesState });
  await mode('advanced');
  s = await shows(page); shown = await presetsShown();
  t.check(shown.length === 10 && /^Splits at V /.test(s.valuesState) && s.blockLabel === s.palette.replace(/\s*\(.*\)$/, ''), `${L} Advanced: ten palettes, the splits in the header, the blocks' switch names the palette in use (${s.palette})`, { shown: shown.length, header: s.valuesState, label: s.blockLabel });
  const advPalette = s.palette;
  await mode('simple');
  s = await shows(page);
  const simplePalette = s.palette;
  t.check(!s.chosen && ['Zorn', 'Three primaries', 'Rembrandt (earths)'].includes(simplePalette), `${L} back in Simple: the best of its three is used again`, simplePalette);
  await steady(t, page, `${L} Study`);

  // the Studio in Simple: it follows the Study tab's palette; a wash of a paint of it that the Advanced palette lacks
  await tab(page, 'paint'); await studioReady(page);
  s = await shows(page);
  t.check(s.studioPalette === simplePalette, `${L} Studio in Simple: its palette is the Study tab's (${simplePalette})`, s.studioPalette);
  const advCodes = await page.evaluate((n) => (Paints.PRESETS.find((p) => p.name === n) || {}).paints || [], advPalette);
  const own = s.codes.filter((c) => !['TW', 'LW'].includes(c) && !advCodes.includes(c));
  const washCode = own.find((c) => c === 'LR') || own[0] || null;
  const washName = washCode ? await studioWash(page, washCode) : null;
  t.check(!!washName, `${L} Studio in Simple: a wash of ${washName || '(none)'} is laid, a paint ${simplePalette} has and ${advPalette} does not`, { simple: s.codes, advanced: advCodes });
  await studioMix(page, [[s.codes[1], 1], [s.codes[0], 2]]);
  await stroke(page, '#ps-paper', [[0.3, 0.3], [0.6, 0.55]]);
  const ground1 = await groundAt(page);
  // Advanced from the Studio: the palette follows the Study tab's again, and the ground under the painting stays
  await mode('advanced');
  s = await shows(page);
  const ground2 = await groundAt(page);
  const wash2 = await text(page, '#ps-washName');
  t.check(s.studioPalette === s.palette && s.palette === advPalette, `${L} Advanced from the Studio: the Studio's palette follows the Study tab's to ${advPalette}`, { studio: s.studioPalette, study: s.palette });
  t.check(sameColor(ground2, ground1) && wash2 === washName, `${L} Advanced from the Studio: the ground under the painting stays the ${washName} wash`, { before: ground1, after: ground2, wash: wash2 });
  if (!(sameColor(ground2, ground1) && wash2 === washName)) seen.washMode = { simple: simplePalette, advanced: advPalette, wash: washName, now: wash2, before: ground1, after: ground2 };
  await mode('simple');
  s = await shows(page);
  t.check(s.studioPalette === simplePalette, `${L} Simple again from the Studio: the palette is back to ${simplePalette}`, s.studioPalette);
  await steady(t, page, `${L} Studio`);

  // Pose and light follows the switch, whichever tab it is pressed on
  await tab(page, 'pose');
  const pf = poseFrame(page);
  const frameMode = () => pf.evaluate(() => (document.documentElement.classList.contains('simple') ? 'simple' : 'advanced'));
  t.check(!!pf && (await frameMode()) === 'simple', `${L} Pose and light opens in Simple, as the app is`);
  await mode('advanced');
  t.check(await pf.waitForFunction(() => !document.documentElement.classList.contains('simple'), null, { timeout: 5000 }).then(() => true).catch(() => false), `${L} Pose and light turns Advanced with the app's switch`);
  await tab(page, 'help'); await mode('simple'); await tab(page, 'pose');
  t.check(await pf.waitForFunction(() => document.documentElement.classList.contains('simple'), null, { timeout: 5000 }).then(() => true).catch(() => false), `${L} Pose and light is Simple again after the switch was pressed on another tab`);
  await steady(t, page, `${L} Pose and light`);

  // a game: the switch pressed mid-game changes nothing of the game in progress
  await tab(page, 'game');
  await gameReady(page);
  await click(page, '#gameStart'); await gamePlaying(page);
  const before = await page.evaluate(() => ({ numbers: document.querySelectorAll('#gameNumbers .game-number').length, canvas: document.getElementById('gameCanvas').toDataURL().length, timer: document.getElementById('gameTimer').textContent }));
  const switchShown = await visible(page, '[data-mode="advanced"]');
  await mode('advanced');
  await until(page, (t0) => document.getElementById('gameTimer').textContent !== t0, before.timer, 5000);
  const after = await page.evaluate(() => ({ numbers: document.querySelectorAll('#gameNumbers .game-number').length, canvas: document.getElementById('gameCanvas').toDataURL().length, timer: document.getElementById('gameTimer').textContent, playing: !document.getElementById('gamePlay').hidden }));
  t.check(after.playing && after.numbers === before.numbers && after.canvas === before.canvas && after.timer !== before.timer, `${L} game: Advanced pressed mid-game (the switch ${switchShown ? 'is on the screen' : 'is not shown'}): the same board, the clock still running`, { before, after });
  await click(page, '#gameQuit'); await click(page, '#gameQuit'); await gameReady(page);
  t.check(!(await visible(page, '#gamePlay')), `${L} game: ✕ twice leaves the game for the setup`);
  await steady(t, page, `${L} game`);

  // a battle: the switch pressed mid-round leaves the round as it was
  await tab(page, 'battle');
  await click(page, '#vb-start'); await battleRound(page, 0);
  const round = await page.evaluate(() => { const g = ValueBattle.state(); return { i: g.i, q: document.getElementById('vb-question').textContent, n: document.querySelectorAll('#vb-swatches .vb-swatch').length }; });
  await mode('simple');
  const round2 = await page.evaluate(() => { const g = ValueBattle.state(); return { i: g.i, q: document.getElementById('vb-question').textContent, n: document.querySelectorAll('#vb-swatches .vb-swatch').length, pinned: document.getElementById('vb-play').classList.contains('is-pinned') }; });
  t.check(round2.i === round.i && round2.q === round.q && round2.n === round.n && round2.pinned, `${L} battle: Simple pressed mid-round leaves the round on the board`, { round, round2 });
  await click(page, '#vb-quit'); await click(page, '#vb-quit');
  await until(page, () => !document.getElementById('vb-setup').hidden, null, 5000);
  await steady(t, page, `${L} battle`);

  // the last choice is the one remembered
  await mode('advanced');
  await page.reload({ waitUntil: 'load' }); await idle(page);
  s = await shows(page);
  t.check(s.mode === 'advanced', `${L} next visit: Advanced, the last choice, is remembered`, s.mode);
  await steady(t, page, `${L} next visit`);
}

// ==== 4. two tabs doing different things ==============================================================================
async function twoTabs(t, site, pages) {
  const L = 'J4';
  const a = await openPage(site);
  pages.push(a);
  const b = await newTab(site, a);
  const file = await makeImage(a, { width: 900, height: 1200, type: 'image/jpeg', name: 'cousin.jpg' });

  // A: a photo and a game on it
  await loadPhoto(a, file);
  await tab(a, 'game');
  const g = await playGame(a);
  t.check(g.scored && g.points > 0 && g.ref && g.ref.diff === 0, `${L} tab A: a game on the photo, with the photo beside the board, is scored`, g);
  await click(a, '#gamePopup [data-game="new"]'); await gameReady(a);

  // B, meanwhile: a color picked on the sample with the magnifier; it is in A's picked colors too
  await openDrawer(b, 'swatches'); await openDrawer(a, 'swatches');
  const swatchesA0 = await a.evaluate(() => document.querySelectorAll('#swatches .swatch').length);
  const box = await b.locator('#cv-orig').boundingBox();
  await b.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await b.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  const pickedB = await until(b, () => document.querySelectorAll('#swatches .swatch').length >= 1, null, 5000);
  const pickedA = await until(a, (n) => document.querySelectorAll('#swatches .swatch').length === n + 1, swatchesA0, 8000);
  const hexes = async (p) => p.evaluate(() => [...document.querySelectorAll('#swatches .swatch-meta span:first-child')].map((s) => s.textContent));
  t.check(pickedB && pickedA && J(await hexes(a)) === J(await hexes(b)), `${L} a color picked in tab B is in tab A's Picked colors as well`, { a: await hexes(a), b: await hexes(b) });

  // B: a battle with a streak of two; A's battle setup shows that best when it is opened
  await tab(a, 'battle');
  const aBefore = await text(a, '#vb-best');
  await tab(b, 'battle');
  t.check(await playBattle(b, { palette: 'zorn', right: 2 }), `${L} tab B: a streak of two with Zorn`);
  t.check((await text(b, '#vb-best')) === 'Your best streak here: 2 in a row.', `${L} tab B: its setup shows the best`, await text(b, '#vb-best'));
  await tab(a, 'study'); await tab(a, 'battle');
  await a.evaluate(() => { const s = document.getElementById('vb-palette'); if (s.value !== 'zorn') { s.value = 'zorn'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
  await click(a, '#vbCount2'); await click(a, '#vbModeStreak');
  t.check((await text(a, '#vb-best')) === 'Your best streak here: 2 in a row.', `${L} tab A: its battle setup, opened again, shows tab B's best (it showed "${aBefore}")`, await text(a, '#vb-best'));

  // B: the same photo, and A's best on it shows in B's game setup
  await tab(b, 'study');
  await loadPhoto(b, file);
  await tab(b, 'game'); await gameReady(b);
  await b.evaluate((v) => { const s = document.getElementById('gamePalette'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, g.palette);
  await gameReady(b);
  t.check((await text(b, '#gameBest')) === `Your best on this portrait at this level in Classic mode: ${g.points} points`, `${L} tab B: the same photo shows the best tab A scored on it`, await text(b, '#gameBest'));

  // A paints in the Studio; B, open since before, scores "my Studio painting"
  await tab(a, 'paint'); await studioReady(a);
  await stroke(a, '#ps-paper', [[0.15, 0.2], [0.85, 0.25], [0.8, 0.8], [0.2, 0.75]], { steps: 12 });
  const paintedA = await a.evaluate(() => Date.now());
  t.check(await savedSince(a, paintedA), `${L} tab A: the Studio saved its painting`);
  await tab(b, 'study');
  await openDrawer(b, 'check');
  await click(b, '#artFromStudio');
  await until(b, () => !document.getElementById('checkBody').hidden && /\d/.test(document.getElementById('checkState').textContent), null, 45000);
  const scoredB = { art: await inked(b, '#cv-art'), badge: await text(b, '#checkState'), studioB: await inked(b, '#ps-paper'), studioA: await inked(a, '#ps-paper') };
  t.check(scoredB.art > 200, `${L} tab B: Use my Studio painting scores the painting the Studio keeps (tab A's strokes), not an empty sheet`, scoredB);
  if (scoredB.art <= 200) seen.twoTabCheck = scoredB;
  await steady(t, b, `${L} tab B check`);

  // a palette chosen in A: B shows its own until it is opened again (no promise of live sharing), then A's
  await tab(a, 'study');
  t.check(await pickPalette(a, 'zorn'), `${L} tab A: Zorn picked on the Study tab`);
  await b.reload({ waitUntil: 'load' }); await idle(b);
  const sb = await shows(b);
  t.check(sb.palette === 'Zorn' && sb.chosen, `${L} tab B, opened again: the palette tab A chose is the one in use`, { palette: sb.palette, chosen: sb.chosen });
  await steady(t, a, `${L} tab A`);
  await steady(t, b, `${L} tab B`);
}

// ==== 5. a phone session through the tab bar's menus =================================================================
async function phoneMenus(t, site, pages) {
  const L = 'J5';
  const page = await openPage(site, { viewport: PHONE });
  pages.push(page);
  const menus = () => page.evaluate(() => ({
    open: [...document.querySelectorAll('.tab-menu')].filter((m) => !m.hidden).map((m) => m.id),
    expanded: [...document.querySelectorAll('.tab[aria-haspopup]')].filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.id),
    current: [...document.querySelectorAll('.tabs .tab')].filter((b) => b.getAttribute('aria-current') === 'true').map((b) => b.id),
    subs: [document.getElementById('tabLearnSub').textContent, document.getElementById('tabGamesSub').textContent],
    tab: Studio.tab(),
  }));
  const box = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), shown: !e.hidden && getComputedStyle(e).display !== 'none' && r.width > 0 }; }, sel);
  const tabsShown = async () => !!(await box('.tabs')).shown;
  const NAMES = { study: 'Study the photo', loomis: 'Loomis head', pose: 'Pose and light', help: 'How to use', game: 'Paint by numbers', battle: 'Value battle' };
  const GROUP = { study: 'tabLearnBtn', loomis: 'tabLearnBtn', pose: 'tabLearnBtn', help: 'tabLearnBtn', game: 'tabGamesBtn', battle: 'tabGamesBtn', paint: 'tabPaintBtn', figure: 'tabFigureBtn' };
  // a section reached by a tap on its menu, as a visitor does: the menu opens on the screen and closes on the choice
  async function viaMenu(name) {
    const btn = GROUP[name], menu = btn === 'tabLearnBtn' ? '#tabLearnMenu' : '#tabGamesMenu';
    await page.locator('#' + btn).scrollIntoViewIfNeeded().catch(() => null);
    await page.locator('#' + btn).click();
    const m = await box(menu);
    const opened = await menus();
    t.check(m && m.shown && m.l >= 0 && m.r <= PHONE.width && m.b <= PHONE.height && J(opened.expanded) === J([btn]), `${L} ${NAMES[name]}: the menu opens on the screen`, { menu: m, expanded: opened.expanded });
    await page.locator(`.tab-item[data-tab="${name}"]`).click();
    await until(page, (n) => Studio.tab() === n, name, 10000);
    const after = await menus();
    t.check(after.tab === name && after.open.length === 0 && after.expanded.length === 0 && J(after.current) === J([btn]) && after.subs.includes(NAMES[name]), `${L} ${NAMES[name]}: the menu closes, its button is current and names it`, after);
  }

  await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'phone-photo.jpg' }));
  await steady(t, page, `${L} load`);

  // a menu opened and left by a tap elsewhere, then by Escape
  await page.locator('#tabGamesBtn').click();
  await page.mouse.click(PHONE.width / 2, PHONE.height - 40);
  t.check((await menus()).open.length === 0, `${L} a tap outside the open Games menu closes it`, await menus());
  await page.locator('#tabLearnBtn').click();
  await page.keyboard.press('Escape');
  t.check((await menus()).open.length === 0 && (await focusOf(page)).on === 'tabLearnBtn', `${L} Escape closes the Learning tools menu and keeps the focus on its button`, { menus: await menus(), focus: await focusOf(page) });

  // Paint by numbers: the whole screen while playing, the tabs back after ✕ twice
  await viaMenu('game');
  await gameReady(page);
  let s = await shows(page);
  t.check(s.gamePhoto === 'Painting from phone-photo.', `${L} game: the setup paints from the photo`, s.gamePhoto);
  await page.locator('#gameStart').click(); await gamePlaying(page);
  const ref = await samePicture(page, 'gameRef', 'cv-orig');
  t.check(!(await tabsShown()) && ref.diff === 0, `${L} game: the tabs step aside, the photo sits beside the board`, { tabs: await box('.tabs'), ref });
  await page.locator('#gameQuit').click(); await page.locator('#gameQuit').click();
  await gameReady(page);
  t.check((await tabsShown()) && (await menus()).tab === 'game' && (await hscroll(page)) <= 0, `${L} game: after ✕ twice the tabs are back on the setup, nothing spills sideways`);
  await steady(t, page, `${L} game`);

  // Value battle from the same menu
  await viaMenu('battle');
  await page.locator('#vb-start').click(); await battleRound(page, 0);
  t.check(!(await tabsShown()) && (await page.evaluate(() => document.getElementById('vb-play').classList.contains('is-pinned'))), `${L} battle: the board takes the screen`);
  await page.locator('#vb-quit').click(); await page.locator('#vb-quit').click();
  await until(page, () => !document.getElementById('vb-setup').hidden, null, 5000);
  t.check((await tabsShown()) && (await menus()).subs[1] === 'Value battle', `${L} battle: after ✕ twice the tabs are back and Games names Value battle`, await menus());
  await steady(t, page, `${L} battle`);

  // the Studio: the header steps aside, the strip's first icon leads back
  await page.locator('#tabPaintBtn').click(); await studioReady(page);
  t.check(!(await tabsShown()), `${L} Studio: the tabs step aside while painting`);
  await stroke(page, '#ps-paper', [[0.3, 0.3], [0.6, 0.6]]);
  await page.locator('#ps-exit').click();
  await until(page, () => Studio.tab() !== 'paint', null, 5000);
  const back = await menus();
  t.check((await tabsShown()) && back.tab === 'study' && J(back.current) === J(['tabLearnBtn']) && back.subs[0] === 'Study the photo', `${L} Studio: its exit leads back to the Study tab with the tabs`, back);
  await steady(t, page, `${L} Studio`);

  // the Loomis head: the photo, and its own exit
  await viaMenu('loomis');
  s = await shows(page);
  t.check(J(s.loomisPhoto) === J(s.prep) && !(await tabsShown()), `${L} Loomis: the photo fills the screen, the tabs step aside`, { photo: s.loomisPhoto, prep: s.prep });
  await page.locator('#lh-exit').click();
  await until(page, () => Studio.tab() !== 'loomis', null, 5000);
  t.check((await tabsShown()) && (await menus()).tab === 'study', `${L} Loomis: its exit leads back with the tabs`);
  await steady(t, page, `${L} Loomis`);

  // Pose and light, then the Games menu left open and a tap into the frame
  await viaMenu('pose');
  await tab(page, 'pose'); // (waits for the frame to be up)
  await page.locator('#tabGamesBtn').click();
  const frameBox = await box('#poseFrame');
  if (frameBox && frameBox.shown) await page.mouse.click((frameBox.l + frameBox.r) / 2, Math.min(PHONE.height - 20, frameBox.t + 200));
  await until(page, () => document.getElementById('tabGamesMenu').hidden, null, 3000);
  t.check((await menus()).open.length === 0, `${L} Pose and light: a tap into the figure closes the open Games menu`, await menus());
  await steady(t, page, `${L} Pose and light`);

  // How to use, and its jump to the Studio and back
  await viaMenu('help');
  await page.locator('[data-go="paint"]').first().click();
  await until(page, () => Studio.tab() === 'paint', null, 5000);
  t.check(!(await tabsShown()) && (await menus()).current.includes('tabPaintBtn'), `${L} How to use: Go to Studio opens the Studio`);
  await page.locator('#ps-exit').click();
  await until(page, () => Studio.tab() !== 'paint', null, 5000);
  t.check((await tabsShown()) && (await hscroll(page)) <= 0, `${L} How to use: back from the Studio, the page fits the phone`);
  await steady(t, page, `${L} help`);
}

// ---- the findings, from the evidence the journeys gathered ------------------------------------------------------------
function findings(t) {
  const w = [seen.washStudy && 'study', seen.washMode && 'mode', seen.washReload && 'reload'].filter(Boolean);
  if (w.length) {
    const said = [];
    if (seen.washStudy) said.push(`Zorn picked on the Study tab after the Studio's ground was toned with Light Red (a Rembrandt paint): the Studio's ground went from rgb(${seen.washStudy.before}) to rgb(${seen.washStudy.after}), now a wash of ${seen.washStudy.wash}`);
    if (seen.washMode) said.push(`Simple to Advanced pressed while painting: the palette followed from ${seen.washMode.simple} to ${seen.washMode.advanced} and the ground toned with ${seen.washMode.wash} turned to ${seen.washMode.now} (rgb(${seen.washMode.before}) to rgb(${seen.washMode.after}))`);
    if (seen.washReload) say(seen.washReload);
    function say(r) { said.push(`after a reload (the Study tab back on the sample, whose best palette is ${r.photoPalette}), the ground toned with ${r.wash} came back as ${r.now} (rgb(${r.before}) to rgb(${r.after})), though the saved record holds ${r.wash}`); }
    t.finding({
      title: 'The Studio\'s toned ground under a painting changes color by itself when the Study tab\'s palette changes: another palette picked, Simple and Advanced switched, or the next visit',
      severity: 'medium',
      steps: '1. Load a photo (or keep the sample) and do not choose a palette in the Studio. 2. Studio, Canvas: Toned wash, and pick a paint of the palette that another palette lacks (Light Red in Rembrandt\'s earths, Viridian in Frank Reilly\'s). 3. Paint a few strokes. 4. Then either pick Zorn under Colors and paints on the Study tab, or press Advanced (Simple uses Rembrandt\'s earths, Advanced Sorolla\'s palette for this photo), or reload the page after loading a photo whose best palette (Advanced) is Frank Reilly\'s, so the Studio follows the sample\'s Sorolla. 5. Look at the Studio\'s paper.',
      expected: 'README, Simple and Advanced: "The Studio keeps your work: the paper, the underdrawing, the ground and texture ... come back on the next visit". The ground the painting was started on stays as it was toned (the Studio\'s own hint: "The painting stays as it is when the ground changes" is about a change the visitor makes); a palette followed from the Study tab changes the paints offered, not the canvas already painted on.',
      actual: said.join('. ') + '. Nothing tells the visitor; the paint strokes now sit on a different ground, and the wash chosen is gone from the Canvas sheet.',
      cause: 'js/painting.js renderWash (241-243): "if (!codes.includes(canvasState.washCode)) canvasState.washCode = ..." replaces the wash paint by the first earth of the palette now in use whenever the palette lacks it, and it runs from applyPalette (887) on every palette the Studio follows (followPalette 892-897, fired by studio:palette from js/palette.js announce and by studio:mode through fitSimple) and from restore (515-517) after the saved washCode was read back, so the record\'s wash is overwritten before it is shown. The wash paint could be kept (and offered) even when the palette in use does not hold it.',
    });
  }
  if (seen.twoTabCheck) t.finding({
    title: 'In a second open tab, "Use my Studio painting" scores an empty sheet: the painting saved from the first tab is not read',
    severity: 'low',
    steps: '1. Open the site in two tabs, A and B (a link opened twice, a second window). 2. In tab A paint on the Studio and wait a second (the painting is saved). 3. In tab B open How close did I get? and press Use my Studio painting.',
    expected: 'README, How close did I get?: "press Use my Studio painting to score the paper on the Studio tab as it stands"; the Studio is one painting kept in the browser ("The Studio keeps your work ... saved in the browser"), so tab B scores the painting that is saved, or says it is scoring an older copy.',
    actual: `Tab B scores its own Studio, read from the database when tab B opened: an empty sheet (Your painting panel ${seen.twoTabCheck.art} marked pixels, tab B's paper ${seen.twoTabCheck.studioB}, tab A's ${seen.twoTabCheck.studioA}), badge "${seen.twoTabCheck.badge}". Nothing says the score is not of the painting just made.`,
    cause: 'js/app.js, the artFromStudio click handler (2647-2662), scores PaintStudio.composite(), this tab\'s canvases; js/painting.js restore (493) reads the saved record once, as the page starts, and nothing reads it again (the same staleness behind persistence\'s "a second tab ... saves over it").',
  });
  if (seen.blocks) t.finding({
    title: 'The Studio\'s reference shown as Blocks keeps the photo\'s colors while the Study tab shows its color shapes as the palette mixes them',
    severity: 'low',
    steps: '1. Load a photo. 2. Colors and paints: pick Rembrandt (earths). 3. Above Big color shapes, press Rembrandt (the switch beside Photo). 4. Studio, Reference: Show it as Blocks.',
    expected: 'README, Studio: the reference shows "the original, the three-value study or the color-block study, as the Study tab makes them"; the Studio\'s hint: "Blocks shows the big color shapes. Both come from the Study tab." With the Study tab set to show the shapes as the palette mixes them, the Studio\'s Blocks show the same picture (the colors the painter can actually mix).',
    actual: `The Studio's Blocks are the photo's own block colors: the reference canvas differs from the Study tab's Big color shapes, both at the photo's working size, by ${[seen.blocks.diff != null && `${seen.blocks.diff} levels per channel on average with Rembrandt (earths), ${Math.round(seen.blocks.off * 100)}% of the pixels more than 10 levels off`, seen.blocks.zorn != null && `${seen.blocks.zorn} levels with Zorn, ${Math.round(seen.blocks.zornOff * 100)}% of the pixels more than 10 off`].filter(Boolean).join(', and ')} (a sample of the pixels, compared one by one), while its Original and Values match the Study tab's pictures exactly.`,
    cause: 'js/painting.js drawReference (598-605) draws ref.res.blockImage (Studio.result().blockImage), the photo-colored study; the palette view the Study tab draws (js/app.js showBlocks, about 355-370, with blockView "palette") is not offered to the Studio.',
  });
}
