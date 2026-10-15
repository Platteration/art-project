// The app shell and everything cross-cutting, played like a sceptical tester (README: "Simple and Advanced",
// "How to use", "Settings", the guard parts of "Publishing"; source js/app.js (tabs, menus, switchTab, the hash
// routes, the guide's buttons, Forget), js/guard.js, the .no-js / .old-browser / .load-failed / .part-failed /
// .all-failed rules in styles.css, 404.html): the two menus by keyboard, the focus order through the top bar,
// the guide's step buttons and every screenshot, Simple and Advanced across reloads and the Pose frame, dark
// mode and reduced motion on every tab, the window resized live on every tab, Back and Forward through hashes,
// an old browser, storage blocked two ways and full, the guard's two-tap reset, Forget during a game and a Figure
// class, the 404 page, the toast's lifetime and cap, every key seeded hostile at once, every script blocked one
// at a time and two at a time against the guard's TAB_OF, styles.css, the fonts and a guide picture missing,
// every route with a hostile state, and axe at both widths. Independent steps run three at a time, each on a
// context of its own, so the case stays inside its time budget on a shared machine.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, clean, tab, TABS, DESKTOP, PHONE, poseFrame, stroke, inked, storageKeys, storageGet, click, text, hscroll, screenshot, sleep, axe } from '../lib.mjs';

const PVS = (k) => 'portrait-value-studio.' + k;
// every key the app reads (js/app.js, palette.js, painting.js, figure.js, game.js, battle.js, pose.js)
const APP_KEYS = ['palette', 'canvasUnit', 'smoothing', 'blockView', 'lean', 'drawers', 'mode', 'battlePalette', 'battleCount', 'battleMode', 'battleBest', 'myPaints', 'figureStudy', 'figureMixes', 'gameAmount', 'gameSound', 'gameBest', 'gameLevel', 'gamePalette', 'gameSubject', 'gamePainting', 'gameRefView', 'gameMode', 'paintMixes', 'studioNotice', 'paintChoice'].map(PVS);
const POSE_KEYS = ['pose-and-light.v2', 'pose-and-light.mine.v1', 'pose-and-light.mode'];
const ALL_KEYS = APP_KEYS.concat(POSE_KEYS);
const BIG = JSON.stringify(Array.from({ length: 5000 }, (_, i) => (i % 3 === 0 ? 'constructor' : i % 3 === 1 ? { id: '__proto__', p: { x: 'NaN' }, view: 'toString' } : i)));
const VARIANTS = [
  ['a plain string', () => 'oops'],
  ['NaN', () => 'NaN'],
  ['a JSON string where a number or an object is expected', () => '"42"'],
  ['prototype names as keys and values', () => '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"toString":"valueOf","hasOwnProperty":"__proto__","id":"constructor","p":{"__proto__":null}}'],
  ['a 5000-entry array', () => BIG],
  ['nested objects and the wrong type', () => '{"a":{"b":{"c":{"d":[[[[1]]]]}}},"w":"900","h":[1200],"value":{"x":1},"id":12,"p":"constructor","pose":[],"view":[1,2]}'],
  ['a boolean', () => 'true'],
];
const seedAll = (make) => Object.fromEntries(ALL_KEYS.map((k) => [k, make(k)]));
const SAVED_FAILED = 'Your saved settings or painting could not be read.';
const APP_FAILED = 'Something went wrong in the app. If a control stops responding, reload the page.';

// ---- helpers of this case -------------------------------------------------------------------------------

const shownPanels = (page) => page.evaluate(() => [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id));
const notesOf = (page) => page.evaluate(() => {
  const d = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'missing'; };
  return { cls: document.documentElement.className.trim(), nojs: d('.nojs-note'), part: d('.partfail-note'), old: d('.oldbrowser-note'), tabs: d('.tabs'), help: d('#tab-help'), study: d('#tab-study'), actions: d('.topbar-actions'), steps: d('.help-steps .btn'), forget: d('#forgetBtn'),
    hidden: [...document.querySelectorAll('[data-tab]')].filter((e) => e.hidden).map((e) => e.dataset.tab).sort(), groups: [...document.querySelectorAll('.tab-group')].filter((g) => g.hidden).map((g) => g.dataset.group),
    learnSub: document.getElementById('tabLearnSub').textContent, gamesSub: document.getElementById('tabGamesSub').textContent, shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), fromStudio: !!document.getElementById('artFromStudio').hidden };
});
const active = (page) => page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return 'body'; return a.id || a.getAttribute('data-mode') || a.tagName.toLowerCase(); });
const menuOf = (page, id) => page.evaluate((id) => { const m = document.getElementById(id); const b = document.querySelector(`[aria-controls="${id}"]`); return { hidden: m.hidden, expanded: b.getAttribute('aria-expanded') }; }, id);
const luminance = (fr) => fr.evaluate(() => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(document.body).backgroundColor); return m ? +((0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255).toFixed(2) : -1; });
const toastOf = (page) => page.evaluate(() => { const e = document.getElementById('toast'); const b = e.querySelector('button'); return { show: e.classList.contains('show'), text: e.textContent.trim(), button: b ? b.textContent : null, disabled: !!(b && b.disabled) }; });
const isSimple = (page) => page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), pressed: [...document.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode + '=' + b.getAttribute('aria-pressed')).join(' ') }));
const frameMode = (page) => { const f = poseFrame(page); return f ? f.evaluate(() => window.PoseAndLight ? PoseAndLight.mode() : null).catch(() => null) : null; };
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const timings = [];
async function step(t, name, fn) { const t0 = Date.now(); try { await fn(); } catch (e) { t.check(false, `${name}: the step ran to its end`, String(e && e.stack || e).slice(0, 400)); } timings.push(`${name} ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
async function reloadWith(page, script, arg) { await page.addInitScript(script, arg); await page.reload({ waitUntil: 'load' }); await sleep(500); }
// the wait part of lib's tab() without the click: the Pose frame up (or its failure panel), Figure's pictures (or its note)
async function settle(page, name, timeout = 15000) {
  if (name === 'pose') { const t0 = Date.now(); while (Date.now() - t0 < timeout) { const f = poseFrame(page); if (f) { const up = await f.evaluate(() => (!!window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30) || !document.getElementById('fail').hidden).catch(() => false); if (up) return true; } await sleep(250); } return false; }
  if (name === 'figure') return !!(await page.waitForFunction(() => { const b = document.querySelectorAll('#tab-figure [data-pose-id]'); return (b.length > 0 && [...b].every((x) => { const i = x.querySelector('img'); return i && i.src.startsWith('blob:'); })) || /could not be drawn/.test(document.getElementById('fig-libNote').textContent); }, null, { timeout }).catch(() => null));
  await sleep(300); return true;
}
// every tab in turn, the way a visitor opens them; heavy = wait for Pose and Figure to finish
async function tour(page, { heavy = true, timeout = 15000 } = {}) {
  const out = {};
  for (const name of TABS) { await tab(page, name, { wait: false }); if (heavy && (name === 'pose' || name === 'figure')) await settle(page, name, timeout); else await sleep(250); out[name] = (await shownPanels(page)).join(','); }
  return out;
}
const tourOk = (out) => TABS.every((n) => out[n] === 'tab-' + n);
async function forgetTwice(page) {
  await click(page, '#forgetBtn');
  await page.waitForFunction(() => /again/i.test(document.getElementById('forgetBtn').textContent), null, { timeout: 3000 }).catch(() => null);
  const armed = await text(page, '#forgetBtn');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
  await sleep(1500);
  return armed;
}
const dbRecord = (page) => page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('portrait-value-studio'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onupgradeneeded = () => { /* a fresh one: no store */ }; }); if (!db) return 'no db'; let out = 'none'; try { out = await new Promise((res) => { const tx = db.transaction('studio'); const g = tx.objectStore('studio').get('painting'); g.onsuccess = () => res(g.result ? 'record' : 'none'); g.onerror = () => res('error'); }); } catch (e) { out = 'no store'; } db.close(); return out; });
// drop what a step deliberately provoked (a reported error is logged to the console by design) before clean()
function dropLogged(page, re) { page.log.console = page.log.console.filter((m) => !re.test(m)); page.log.pageerrors = page.log.pageerrors.filter((m) => !re.test(m)); }

// ---- the case ---------------------------------------------------------------------------------------------

export default async function appShellMore(t, site) {
  if (process.env.PVS_NOTES) { const note = t.note; t.note = (x) => { note(x); process.stdout.write(`    NOTE ${String(x).slice(0, 400)}\n`); }; }
  await Promise.all([groupA(t, site).then(() => groupD(t, site)), groupB(t, site), groupC(t, site)]);
  t.note(`step timings (three groups ran side by side): ${timings.join('; ')}`);
}

// ---- A: keyboard, the guide, modes, reduced motion, hashes, an old browser, the toast --------------------------

async function groupA(t, site) {
  // the two menus by keyboard, and the focus order through the top bar, at both widths
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    await step(t, `${label} keyboard`, async () => {
      const page = await openPage(site, { viewport });
      await page.evaluate(() => document.getElementById('tabLearnBtn').focus());
      await page.keyboard.press('ArrowDown');
      let m = await menuOf(page, 'tabLearnMenu');
      t.check(!m.hidden && m.expanded === 'true' && (await active(page)) === 'tabStudyBtn', `${label}: ArrowDown on Learning tools opens its menu on the open page`, { ...m, focus: await active(page) });
      await page.keyboard.press('ArrowDown');
      t.check((await active(page)) === 'tabLoomisBtn', `${label}: ArrowDown moves to the next item`, await active(page));
      await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
      t.check((await active(page)) === 'tabHelpBtn', `${label}: ArrowUp wraps from the first item to the last`, await active(page));
      await page.keyboard.press('ArrowDown');
      t.check((await active(page)) === 'tabStudyBtn', `${label}: ArrowDown wraps from the last item to the first`, await active(page));
      await page.keyboard.press('Escape');
      m = await menuOf(page, 'tabLearnMenu');
      t.check(m.hidden && m.expanded === 'false' && (await active(page)) === 'tabLearnBtn', `${label}: Esc closes the menu and puts focus back on its button`, { ...m, focus: await active(page) });
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
      await sleep(300);
      const picked = { shown: await shownPanels(page), focus: await active(page), menu: await menuOf(page, 'tabLearnMenu'), sub: await text(page, '#tabLearnSub'), checked: await page.evaluate(() => document.getElementById('tabHelpBtn').getAttribute('aria-checked')) };
      t.check(picked.shown.join() === 'tab-help' && picked.focus === 'tabLearnBtn' && picked.menu.hidden && picked.sub === 'How to use' && picked.checked === 'true', `${label}: Enter picks the item: the guide opens, the button names it, focus returns to the button`, picked);
      // Games: Enter opens the menu (a button's click), Space picks
      await page.evaluate(() => document.getElementById('tabGamesBtn').focus());
      await page.keyboard.press('Enter');
      m = await menuOf(page, 'tabGamesMenu');
      t.check(!m.hidden && (await active(page)) === 'tabGameBtn', `${label}: Enter on Games opens its menu with the first item focused`, { ...m, focus: await active(page) });
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space'); await sleep(300);
      t.check((await shownPanels(page)).join() === 'tab-battle' && (await text(page, '#tabGamesSub')) === 'Value battle', `${label}: Space picks Value battle`, { shown: await shownPanels(page), sub: await text(page, '#tabGamesSub') });
      // Tab out of an open menu: where does focus go, and does the menu close?
      await page.evaluate(() => document.getElementById('tabLearnBtn').focus());
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      const tabbed = { focus: await active(page), menu: await menuOf(page, 'tabLearnMenu') };
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      const left = { focus: await active(page), menu: await menuOf(page, 'tabLearnMenu') };
      const closes = left.menu.hidden;
      t.check(closes, `${label}: Tab out of an open menu closes it`, { afterOneTab: tabbed, afterFourTabs: left });
      if (!closes && label === 'desktop') t.finding({ title: 'A tab menu stays open, and its button says expanded, after Tab moves focus out of it', severity: 'low', steps: 'Focus Learning tools (Tab to it), press ArrowDown so the menu opens, then press Tab four times: focus walks every item and lands on Studio.', expected: 'The menu closes when focus leaves it (as it does on Esc or a click elsewhere), and aria-expanded goes back to false.', actual: `The menu stays open with aria-expanded="true" while focus is on ${left.focus}; only Esc, a click elsewhere or picking an item closes it (js/app.js 2237-2248: the menu closes on Escape, on pointerdown outside and on a pick, never on focusout).` });
      await page.keyboard.press('Escape');
      // Esc with focus nowhere near the menu still closes it (the document listener)
      await page.evaluate(() => { document.getElementById('tabGamesBtn').click(); document.activeElement.blur(); });
      await page.keyboard.press('Escape');
      t.check((await menuOf(page, 'tabGamesMenu')).hidden, `${label}: Esc anywhere on the page closes an open menu`);
      // focus order from the top of the page (a click on the title puts the starting point there)
      await click(page, '#tabStudyBtn');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('.brand h1').click();
      await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
      const order = [];
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); order.push(await active(page)); }
      const want = ['simple', 'advanced', 'file', 'tabLearnBtn', 'tabPaintBtn', 'tabFigureBtn', 'tabGamesBtn'];
      t.check(order.slice(0, 7).join() === want.join(), `${label}: Tab walks the top bar in order: Simple, Advanced, Load photo, the four sections`, order);
      t.note(`${label} focus order from the top: ${order.join(' → ')}`);
      await clean(t, page, `${label} keyboard`);
      await page.context().close();
    });
  }

  // the guide: its step buttons jump to their parts, every screenshot has a size and loads at that size
  await step(t, 'guide', async () => {
    const page = await openPage(site);
    await tab(page, 'help');
    const steps = await page.evaluate(() => [...document.querySelectorAll('.help-steps li')].map((li) => ({ text: li.querySelector('strong').textContent, go: li.querySelector('[data-go]') ? li.querySelector('[data-go]').dataset.go : null })));
    t.check(steps.length === 4, 'the guide opens with a four-step path', steps);
    t.note(`the four steps and their buttons: ${steps.map((s) => `${s.text} → ${s.go || 'no button'}`).join('; ')} (the README says "buttons that jump to the part they describe"; step 2, Look at the shapes, has none, which reads as intended: it describes the Study tab step 1 leads to)`);
    for (const go of ['study', 'paint', 'check']) {
      await tab(page, 'help');
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.locator(`[data-go="${go}"]`).click();
      await sleep(400);
      const s = await page.evaluate(() => ({ shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), y: window.scrollY, check: document.getElementById('drawer-check').open, top: document.getElementById('drawer-check').getBoundingClientRect().top, section: !document.getElementById('checkSection').hidden }));
      if (go === 'check') t.check(s.shown.join() === 'tab-study' && s.check && s.top >= -2 && s.top < 500 && s.section, 'Check a painting opens the Study tab with the check drawer open and in view', s);
      else t.check(s.shown.join() === 'tab-' + go && s.y === 0, `Go to ${go} opens that tab at the top of the page`, s);
    }
    await tab(page, 'help');
    await page.evaluate(async () => { for (const i of document.querySelectorAll('#tab-help img')) { i.scrollIntoView(); await new Promise((r) => setTimeout(r, 40)); } });
    await page.waitForFunction(() => [...document.querySelectorAll('#tab-help img')].every((i) => i.complete), null, { timeout: 20000 }).catch(() => null);
    const imgs = await page.evaluate(() => [...document.querySelectorAll('#tab-help img')].map((i) => ({ src: i.getAttribute('src'), w: i.getAttribute('width'), h: i.getAttribute('height'), nw: i.naturalWidth, nh: i.naturalHeight, alt: (i.alt || '').length })));
    t.check(imgs.length === 30 && imgs.every((i) => i.w && i.h), 'every guide screenshot (30) has width and height attributes', imgs.filter((i) => !i.w || !i.h));
    t.check(imgs.every((i) => i.nw > 0 && i.nh > 0), 'every guide screenshot loads', imgs.filter((i) => !(i.nw > 0)));
    t.check(imgs.every((i) => i.nw === +i.w && i.nh === +i.h), 'every guide screenshot is the size its attributes say (400 × 774)', imgs.filter((i) => i.nw !== +i.w || i.nh !== +i.h));
    t.check(imgs.every((i) => i.alt > 10), 'every guide screenshot has an alt text', imgs.filter((i) => i.alt <= 10));
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(t, page, 'guide');
    await page.context().close();
  });

  // Simple and Advanced: remembered across reloads, followed by the Pose frame, apart from pose.html's own switch
  await step(t, 'modes', async () => {
    const page = await openPage(site);
    t.check((await isSimple(page)).simple, 'a first visit starts in Simple', await isSimple(page));
    await page.locator('[data-mode="advanced"]').click(); await sleep(200);
    t.check(!(await isSimple(page)).simple && (await storageGet(page, PVS('mode'))) === 'advanced', 'Advanced takes and is written to the mode key', { ...(await isSimple(page)), key: await storageGet(page, PVS('mode')) });
    await page.reload({ waitUntil: 'load' }); await sleep(600);
    t.check(!(await isSimple(page)).simple && (await isSimple(page)).pressed === 'simple=false advanced=true', 'Advanced is back after a reload', await isSimple(page));
    // the frame is told the mode when it loads, even when the switch moved while it was still loading
    await tab(page, 'pose', { wait: false });
    await page.locator('[data-mode="simple"]').click();
    await page.locator('[data-mode="advanced"]').click();
    await settle(page, 'pose', 30000);
    const f = poseFrame(page);
    await f.waitForFunction(() => window.PoseAndLight && PoseAndLight.mode() === 'advanced', null, { timeout: 5000 }).catch(() => null);
    t.check((await frameMode(page)) === 'advanced', 'the Pose frame follows the app: Advanced after the switch moved while it loaded', await frameMode(page));
    await page.locator('[data-mode="simple"]').click();
    await f.waitForFunction(() => PoseAndLight.mode() === 'simple', null, { timeout: 5000 }).catch(() => null);
    t.check((await frameMode(page)) === 'simple', 'the Pose frame follows a switch to Simple at once', await frameMode(page));
    t.check((await storageGet(page, 'pose-and-light.mode')) === null, 'the embedded Pose page writes no mode key of its own', await storageGet(page, 'pose-and-light.mode'));
    await page.locator('[data-mode="advanced"]').click();
    await f.waitForFunction(() => PoseAndLight.mode() === 'advanced', null, { timeout: 5000 }).catch(() => null);
    t.check((await frameMode(page)) === 'advanced', 'and back to Advanced', await frameMode(page));
    await clean(t, page, 'modes in the app');
    await page.context().close();
    // pose.html on its own: a switch of its own, remembered under its own key, apart from the app's
    const alone = await openPage(site, { url: 'pose.html', storage: { [PVS('mode')]: 'advanced' } });
    await alone.waitForFunction(() => window.__poseStarted && window.PoseAndLight, null, { timeout: 30000 }).catch(() => null);
    t.check((await alone.evaluate(() => PoseAndLight.mode())) === 'simple', 'pose.html alone starts Simple whatever the app\'s mode key says', await alone.evaluate(() => PoseAndLight.mode()));
    await alone.locator('[data-mode="advanced"]').first().click(); await sleep(200);
    t.check((await storageGet(alone, 'pose-and-light.mode')) === 'advanced' && (await storageGet(alone, PVS('mode'))) === 'advanced', 'its own switch is kept under pose-and-light.mode and leaves the app\'s key alone', { own: await storageGet(alone, 'pose-and-light.mode'), app: await storageGet(alone, PVS('mode')) });
    await alone.reload({ waitUntil: 'load' });
    await alone.waitForFunction(() => window.__poseStarted && window.PoseAndLight, null, { timeout: 30000 }).catch(() => null);
    t.check((await alone.evaluate(() => PoseAndLight.mode())) === 'advanced', 'pose.html alone remembers its own Advanced across a reload', await alone.evaluate(() => PoseAndLight.mode()));
    await clean(t, alone, 'pose.html alone modes');
    await alone.context().close();
    // the app with only the Pose page's own key set: the app and its frame stay Simple; hostile mode values read as Simple
    for (const [label, mode] of [['pose-and-light.mode=advanced alone', null], ['"Advanced"', 'Advanced'], ['"advanced " with a space', 'advanced '], ['an object', '{"mode":"advanced"}'], ['"true"', 'true']]) {
      const seed = mode === null ? { 'pose-and-light.mode': 'advanced' } : { [PVS('mode')]: mode };
      const p = await openPage(site, { storage: seed });
      t.check((await isSimple(p)).simple, `the mode key ${label}: the app opens in Simple`, await isSimple(p));
      if (mode === null) { await tab(p, 'pose'); t.check((await frameMode(p)) === 'simple', 'the Pose frame inside the app ignores pose-and-light.mode and follows the app (Simple)', await frameMode(p)); }
      await clean(t, p, `mode key ${label}`);
      await p.context().close();
    }
  });

  // reduced motion: the toast and the drawer markers stop animating; what still moves is noted
  await step(t, 'reduced motion', async () => {
    const page = await openPage(site, { reducedMotion: true });
    const s = await page.evaluate(() => ({ matches: matchMedia('(prefers-reduced-motion: reduce)').matches, toast: getComputedStyle(document.getElementById('toast')).transitionDuration, summary: getComputedStyle(document.querySelector('.drawer > summary'), '::after').transitionDuration, tab: getComputedStyle(document.querySelector('.tab')).transitionDuration, caret: getComputedStyle(document.querySelector('.tab-caret')).transitionDuration }));
    t.check(s.matches && /^0s/.test(s.toast) && /^0s/.test(s.summary), 'reduced motion: the toast and drawer markers have no transition', s);
    if (!/^0s/.test(s.caret)) t.note(`reduced motion: the menu caret still rotates over ${s.caret} and the tab buttons keep their ${s.tab} colour transitions (styles.css 1285 and 1379 list only the toast, the drawer markers and the game pulses); a 0.15 s turn of an arrow is below what the setting is for, so no finding`);
    await tour(page, { heavy: false });
    await clean(t, page, 'reduced motion');
    await page.context().close();
  });

  // Back and Forward through hashes: the address is read at start only
  await step(t, 'hashes', async () => {
    const page = await openPage(site, { url: '#help' });
    t.check((await shownPanels(page)).join() === 'tab-help', 'opened at #help, the guide shows');
    await page.evaluate(() => { location.hash = '#game'; }); await sleep(600);
    const typed = await shownPanels(page);
    await page.goBack({ waitUntil: 'load' }).catch(() => null); await sleep(600);
    const back = { hash: await page.evaluate(() => location.hash), shown: await shownPanels(page) };
    await page.goForward({ waitUntil: 'load' }).catch(() => null); await sleep(600);
    const fwd = { hash: await page.evaluate(() => location.hash), shown: await shownPanels(page) };
    t.note(`hash changed to #game in place: ${typed.join()} shows; Back → ${back.hash} shows ${back.shown.join()}; Forward → ${fwd.hash} shows ${fwd.shown.join()}`);
    const live = typed.join() === 'tab-game' && back.shown.join() === 'tab-help' && fwd.shown.join() === 'tab-game';
    t.check(live, 'a hash change after load (typed, or Back/Forward between two hashes) opens that tab', { typed, back, fwd });
    if (!live) t.finding({ title: 'The address is read only when the page loads: Back and Forward between two hashes of the page, or a hash typed into the address bar, leave the open tab as it was', severity: 'low', steps: 'Open index.html#help. Change the address to index.html#game (or arrive at it through Back/Forward). Look at the page.', expected: 'The tab the address names opens, as it does on a reload; the address and the open tab agree.', actual: `The guide stays open under an address that says #game (and switching tabs never updates the address, so a bookmark or a shared link always reopens the entry tab): js/app.js 2745-2752 reads location.hash in start() and nothing listens for hashchange or popstate. A reload fixes it: after reload the tab is ${fwd.hash}.` });
    await page.reload({ waitUntil: 'load' }); await sleep(500);
    t.check((await shownPanels(page)).join() === 'tab-' + (await page.evaluate(() => location.hash.slice(1))), 'after a reload the tab matches the address', { hash: await page.evaluate(() => location.hash), shown: await shownPanels(page) });
    await clean(t, page, 'hashes');
    await page.context().close();
  });

  // an old browser: no ResizeObserver → the standing note, the guide and nothing dead
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    await step(t, `${label} old browser`, async () => {
      const page = await openPage(site, { viewport });
      await clean(t, page, `${label} before the old-browser reload`);
      await reloadWith(page, () => { delete window.ResizeObserver; });
      const s = await notesOf(page);
      t.check(/old-browser/.test(s.cls) && s.old === 'block' && s.nojs === 'none' && s.part === 'none', `${label} old browser: the "too old" note alone shows`, s);
      t.check(s.tabs === 'none' && s.actions === 'none' && s.help === 'block' && s.steps === 'none' && s.forget !== 'none', `${label} old browser: no tabs, no switch, the guide reads, its Try buttons are off, Forget stays`, s);
      t.check((await hscroll(page)) <= 0, `${label} old browser: no horizontal scroll`, await hscroll(page));
      t.check(/too old/.test(await text(page, '.oldbrowser-note')) && /guide below still reads/i.test(await text(page, '.oldbrowser-note')), `${label} old browser: the note says what to do`, await text(page, '.oldbrowser-note'));
      if (label === 'desktop') {
        // the one control left, Forget, still works there
        await page.evaluate(() => localStorage.setItem('portrait-value-studio.mode', 'advanced'));
        await forgetTwice(page);
        t.check((await storageKeys(page)).length === 0 && /old-browser/.test((await notesOf(page)).cls), 'old browser: Forget clears the keys and reloads, the note stays', { keys: await storageKeys(page), cls: (await notesOf(page)).cls });
      }
      await clean(t, page, `${label} old browser`);
      await page.context().close();
    });
  }

  // the toast: a note stays about six seconds; the guard shows three a visit at most; the app's own notes are short
  await step(t, 'toast', async () => {
    const page = await openPage(site);
    await page.evaluate(() => StudioGuard.report(new Error('toast-test 1')));
    const t0 = Date.now();
    let s = await toastOf(page);
    t.check(s.show && s.text === APP_FAILED && !s.button, 'a reported error shows the standing app note, without a reset button', s);
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 9000 }).catch(() => null);
    const secs = (Date.now() - t0) / 1000;
    t.check(secs >= 5 && secs < 8.5, 'the note goes after about six seconds', secs.toFixed(1));
    await page.evaluate(() => { StudioGuard.report(new Error('toast-test 2')); StudioGuard.report(new Error('toast-test 3')); });
    t.check((await toastOf(page)).show, 'the second and third notes show');
    await page.evaluate(() => { const e = document.getElementById('toast'); e.textContent = ''; e.classList.remove('show'); Promise.reject(new Error('toast-test 4')); StudioGuard.report(new Error('toast-test 5')); });
    await sleep(300);
    s = await toastOf(page);
    t.check(!s.show && s.text === '', 'a fourth note of the visit is not shown (three at most)', s);
    await page.evaluate(() => Studio.toast('toast-test short'));
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 4000 }).catch(() => null);
    t.check(!(await toastOf(page)).show, 'the app\'s own short note goes within three seconds');
    dropLogged(page, /toast-test/);
    await clean(t, page, 'toast');
    await page.context().close();
    // on a phone, with the Studio's tool strip along the bottom, a note sits above the strip, not under it
    const phone = await openPage(site, { viewport: PHONE, url: '#paint' });
    await phone.waitForFunction(() => document.querySelector('.ps') && !document.querySelector('.ps').hidden, null, { timeout: 15000 }).catch(() => null);
    await sleep(1200);
    await phone.evaluate(() => Studio.toast('toast-test on a phone', 4000));
    const pos = await phone.evaluate(() => { const t = document.getElementById('toast').getBoundingClientRect(); const s = document.querySelector('.ps-strip').getBoundingClientRect(); return { toastBottom: Math.round(t.bottom), stripTop: Math.round(s.top), shown: document.getElementById('toast').classList.contains('show'), within: t.right <= innerWidth && t.left >= 0 }; });
    t.check(pos.shown && pos.toastBottom <= pos.stripTop && pos.within, 'phone Studio: a note sits above the tool strip and inside the window', pos);
    for (const n of [1, 2, 3]) await phone.evaluate((n) => StudioGuard.report(new Error('toast-test ' + n)), n);
    await phone.evaluate(() => { const e = document.getElementById('toast'); e.textContent = ''; e.classList.remove('show'); StudioGuard.report(new Error('toast-test 4')); });
    await sleep(200);
    t.check(!(await toastOf(phone)).show, 'phone: the guard shows three notes a visit at most', await toastOf(phone));
    dropLogged(phone, /toast-test/);
    await clean(t, phone, 'phone toast');
    await phone.context().close();
  });
}

// ---- B: dark mode, live resizing, the 404 page, the guard's reset, Forget during a game and a class, storage ---

async function groupB(t, site) {
  // dark mode on every tab, with screenshots, at both widths
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    await step(t, `${label} dark`, async () => {
      const page = await openPage(site, { viewport, dark: true });
      const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
      t.check(scheme === 'dark', `${label} dark: the page takes the dark scheme`, scheme);
      const bad = [];
      for (const name of TABS) {
        await tab(page, name, { wait: false });
        if (name === 'pose' || name === 'figure') await settle(page, name, label === 'desktop' ? 30000 : 12000);
        const lum = await luminance(page);
        if (!(lum >= 0 && lum < 0.25)) bad.push(`${name}: ${lum}`);
        if (name === 'pose') { const f = poseFrame(page); const fl = f ? await luminance(f).catch(() => -1) : -1; if (!(fl >= 0 && fl < 0.25)) bad.push(`pose frame: ${fl}`); }
        if ((await hscroll(page)) > 0) bad.push(`${name}: hscroll ${await hscroll(page)}`);
        await screenshot(page, `app-shell-more-dark-${label}-${name}`);
      }
      t.check(bad.length === 0, `${label} dark: every tab (and the Pose frame) is dark with no horizontal scroll`, bad);
      await clean(t, page, `${label} dark`);
      await page.context().close();
    });
  }

  // the window resized live between 390 and 1400 on every tab
  await step(t, 'live resize', async () => {
    const page = await openPage(site);
    const widths = [1400, 1100, 999, 960, 860, 760, 700, 640, 480, 390, 760, 1400];
    const bad = [], layouts = {};
    for (const name of TABS) {
      await page.setViewportSize(DESKTOP); await frames(page);
      await tab(page, name, { wait: false });
      if (name === 'pose' || name === 'figure') await settle(page, name, 30000);
      const h0 = name === 'pose' ? await page.evaluate(() => document.getElementById('poseFrame').style.height) : null;
      const seen = [];
      for (const w of widths) {
        await page.setViewportSize({ width: w, height: w < 700 ? 844 : 900 }); await frames(page); await sleep(60);
        const s = await page.evaluate(() => ({ hs: document.documentElement.scrollWidth - document.documentElement.clientWidth, tabs: getComputedStyle(document.querySelector('.tabs')).display, cols: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns.split(' ').length, shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id).join() }));
        seen.push(`${w}:${s.tabs[0]}${s.cols}`);
        if (s.hs > 0) bad.push(`${name} at ${w}: ${s.hs}px wide`);
        if (s.shown !== 'tab-' + name) bad.push(`${name} at ${w}: shows ${s.shown}`);
        if (w <= 759 && (name === 'paint' || name === 'loomis') && s.tabs !== 'none') bad.push(`${name} at ${w}: tabs ${s.tabs} (the phone layout hides them)`);
        if (w >= 760 && s.tabs === 'none') bad.push(`${name} at ${w}: tabs hidden`);
        // the workbench: rail, tool bar and panels side by side from 960 px (styles.css 150), one column below
        if (name === 'study' && ((w >= 960 && s.cols !== 3) || (w < 960 && s.cols !== 1))) bad.push(`study at ${w}: ${s.cols} columns`);
      }
      layouts[name] = seen.join(' ');
      if (name === 'pose') {
        await page.setViewportSize(PHONE); await frames(page);
        const grew = await page.waitForFunction((h) => document.getElementById('poseFrame').style.height !== h, h0, { timeout: 6000 }).then(() => true).catch(() => false);
        const h1 = await page.evaluate(() => document.getElementById('poseFrame').style.height);
        if (!grew) bad.push(`pose: the frame stayed ${h0} at phone width`);
        t.note(`the Pose frame is ${h0} at 1400 wide and ${h1} at 390`);
      }
    }
    t.check(bad.length === 0, 'resized live on every tab: no horizontal scroll, the tab stays, the layout follows the width', bad);
    t.note(`layouts seen while resizing (width:tabs-display columns): study ${layouts.study}`);
    await page.setViewportSize(DESKTOP); await frames(page);
    await clean(t, page, 'live resize');
    await page.context().close();
  });

  // the 404 page: served with its status, styled, its links all real, its shortcuts open the right tab, both widths, dark
  await step(t, '404 page', async () => {
    const res = await fetch(site.base + 'no-such-page');
    t.check(res.status === 404 && /Page not found/.test(await res.text()), 'a wrong address gets the 404 page with status 404', res.status);
    const page = await openPage(site, { url: 'js/vendor/no-such-file.js' });
    // the page itself is a 404 (the browser logs that to the console); what it loads must not be
    const subs = [];
    page.on('response', (r) => { if (r.status() >= 400 && r.request().resourceType() !== 'document') subs.push(`${r.url()} ${r.status()}`); });
    const info = await page.evaluate(() => ({ title: document.title, cls: document.body.className, h1: document.querySelector('h1').textContent, links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')), radius: getComputedStyle(document.querySelector('.not-found-card')).borderRadius, font: getComputedStyle(document.querySelector('h1')).fontFamily, robots: (document.querySelector('meta[name="robots"]') || {}).content, scripts: document.scripts.length, fonts: document.fonts.status }));
    t.check(/Page not found/.test(info.title) && info.cls === 'not-found' && info.radius !== '0px' && info.robots === 'noindex' && info.scripts === 0, 'the 404 page is styled from a nested path too, noindex, no script', info);
    const policy = (/Content-Security-Policy:\s*(.+)/.exec(fs.readFileSync(path.join(site.root, '_headers'), 'utf8')) || [, ''])[1].trim();
    const meta = await page.evaluate(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
    t.check(meta === policy, 'the 404 page carries the same policy as _headers in its meta tag', { meta, policy });
    t.check(info.links.join() === '/,/#paint,/#game,/#battle,/#loomis,/#pose,/#figure,/#help', 'its links: the app and the seven shortcuts', info.links);
    for (const href of info.links) { const r = await fetch(site.base + href.replace(/^\//, '').split('#')[0]); t.check(r.status === 200, `404 page link ${href} resolves`, r.status); }
    t.check(/Bricolage/i.test(info.font) && info.fonts === 'loaded', 'the 404 page loads the site\'s typefaces', { font: info.font, fonts: info.fonts });
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), page.locator('a[href="/#battle"]').click()]);
    await sleep(800);
    t.check((await shownPanels(page)).join() === 'tab-battle', 'the Value battle shortcut opens that tab', await shownPanels(page));
    await page.goBack({ waitUntil: 'load' }).catch(() => null); await sleep(400);
    t.check(/Page not found/.test(await page.title()), 'Back returns to the 404 page', await page.title());
    t.check(subs.length === 0, 'everything the 404 page loads is found', subs);
    dropLogged(page, /status of 404/);
    await clean(t, page, '404 page desktop');
    await page.setViewportSize(PHONE); await frames(page);
    t.check((await hscroll(page)) <= 0, '404 page at phone width: no horizontal scroll', await hscroll(page));
    await screenshot(page, 'app-shell-more-404-phone');
    await page.context().close();
    const dark = await openPage(site, { url: 'nowhere', dark: true, viewport: PHONE });
    const lum = await luminance(dark);
    t.check(lum >= 0 && lum < 0.25, 'the 404 page follows dark mode', lum);
    dropLogged(dark, /status of 404/);
    await clean(t, dark, '404 page dark');
    await dark.context().close();
  });

  // the guard's reset offer: two taps, and everything goes (keys, the saved painting, the mode)
  await step(t, 'reset offer', async () => {
    const page = await openPage(site, { url: '#paint' });
    await page.waitForFunction(() => document.querySelector('.ps') && !document.querySelector('.ps').hidden, null, { timeout: 15000 }).catch(() => null);
    await sleep(1500);
    await page.evaluate(() => { localStorage.setItem('portrait-value-studio.mode', 'advanced'); localStorage.setItem('pose-and-light.mode', 'advanced'); localStorage.setItem('portrait-value-studio.gameBest', '{"x":1}'); });
    await stroke(page, '#ps-paper');
    await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => null);
    await sleep(2500);
    t.check((await dbRecord(page)) === 'record' && (await storageKeys(page)).length >= 3, 'before the reset: a saved painting and three keys', { record: await dbRecord(page), keys: await storageKeys(page) });
    await page.evaluate(() => StudioGuard.report(new Error('reset-test'), { saved: true }));
    let s = await toastOf(page);
    t.check(s.show && s.text.startsWith(SAVED_FAILED) && s.button === 'Reset settings and saved painting', 'a saved-state error shows the "could not be read" note with its reset button', s);
    await page.locator('#toast button').click(); await sleep(200);
    s = await toastOf(page);
    t.check(s.show && s.button === 'Tap again to reset' && !s.disabled, 'the first tap arms the reset', s);
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), page.locator('#toast button').click()]);
    await sleep(2000);
    // the page reloads on #paint, so the Studio's one-time "kept in this browser" note is shown anew and its flag written: the one key allowed back
    const after = { keys: await storageKeys(page), record: await dbRecord(page), simple: (await isSimple(page)).simple, toast: (await toastOf(page)).text };
    t.check(after.keys.every((k) => k === PVS('studioNotice')) && after.record !== 'record' && after.simple, 'the second tap clears every key and the saved painting, and the page reloads in Simple (the Studio\'s first-visit flag alone is written afresh)', after);
    await tab(page, 'paint'); await sleep(2000);
    t.check((await inked(page, '#ps-paper')) === 0, 'the paper is blank after the reset', await inked(page, '#ps-paper'));
    dropLogged(page, /reset-test/);
    await clean(t, page, 'reset offer');
    await page.context().close();
    t.note('no saved key reaches the reset offer: every localStorage reader catches its own errors and returns a default (app.js readPalette/loadCanvasSize/restoreDrawers, palette.js, painting.js, figure.js, game.js and battle.js load()), and the Studio\'s restore() resolves for every record shape (a bad record is said as "could not be read, so this is a fresh paper" without the reset). Seeding gameBest as a string, NaN or an object triggers nothing; the two-tap reset was driven through StudioGuard.report(err, { saved: true }) and does clear everything.');
  });

  // Forget during a game and during a Figure class: the keys go, nothing resumes, the class and the game are over
  await step(t, 'forget during a game', async () => {
    const page = await openPage(site);
    await tab(page, 'game');
    await page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 40000 }).catch(() => null);
    await click(page, '#gameStart');
    await page.waitForFunction(() => document.body.classList.contains('game-focus'), null, { timeout: 10000 }).catch(() => null);
    const inPlay = await page.evaluate(() => document.body.classList.contains('game-focus'));
    t.check(inPlay, 'a game is in play', inPlay);
    await page.evaluate(() => localStorage.setItem('portrait-value-studio.gameBest', '{"sample":{"pct":90}}'));
    await tab(page, 'help');
    const armed = await forgetTwice(page);
    t.check(/again/i.test(armed), 'Forget arms on the first tap during a game', armed);
    const after = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), focus: document.body.classList.contains('game-focus'), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), setup: !document.getElementById('gameSetup').hidden }));
    t.check(after.keys.length === 0 && !after.focus && after.shown.join() === 'tab-study', 'after Forget mid-game: no key, the game is over, the page reopened on Study', after);
    await sleep(2000);
    t.check((await storageKeys(page)).length === 0, 'two seconds on, still no key (nothing the game was doing came back)', await storageKeys(page));
    await clean(t, page, 'forget during a game');
    await page.context().close();
  });
  await step(t, 'forget during a figure class', async () => {
    const page = await openPage(site);
    await tab(page, 'figure', { timeout: 40000 });
    await page.waitForFunction(() => !document.getElementById('fig-start').disabled, null, { timeout: 20000 }).catch(() => null);
    await click(page, '#fig-start');
    await page.waitForFunction(() => { const s = document.querySelector('.fig-studio'); return s && !s.hidden && document.body.classList.contains('figure-focus'); }, null, { timeout: 30000 }).catch(() => null);
    await sleep(1500);
    await stroke(page, '#fs-paper');
    const drawn = await inked(page, '#fs-paper');
    t.check(drawn > 50, 'a class is running and a stroke is on its paper', drawn);
    await tab(page, 'help');
    await forgetTwice(page);
    const after = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), focus: document.body.classList.contains('figure-focus'), studio: (() => { const s = document.querySelector('.fig-studio'); return s ? !s.hidden && getComputedStyle(s).display !== 'none' : false; })(), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id) }));
    t.check(after.keys.length === 0 && !after.focus && !after.studio && after.shown.join() === 'tab-study', 'after Forget mid-class: no key, no class, the page reopened on Study', after);
    await clean(t, page, 'forget during a figure class');
    await page.context().close();
  });

  // Forget arms, then disarms by itself after five seconds
  await step(t, 'forget disarms', async () => {
    const page = await openPage(site, { url: '#help' });
    const idle = await text(page, '#forgetBtn');
    await click(page, '#forgetBtn');
    const t0 = Date.now();
    const armed = await text(page, '#forgetBtn');
    await page.waitForFunction((idle) => document.getElementById('forgetBtn').textContent === idle, idle, { timeout: 8000 }).catch(() => null);
    const secs = (Date.now() - t0) / 1000;
    t.check(/again/i.test(armed) && secs >= 4 && secs < 7.5 && (await text(page, '#forgetBtn')) === idle && (await storageKeys(page)).length === 0, 'one tap arms Forget, and it disarms by itself after five seconds without clearing anything', { armed, secs: secs.toFixed(1), now: await text(page, '#forgetBtn') });
    await clean(t, page, 'forget disarms');
    await page.context().close();
  });

  // storage blocked: setItem throws and there is no IndexedDB; then localStorage itself throws on access
  await step(t, 'storage blocked (writes)', async () => {
    const page = await openPage(site);
    await clean(t, page, 'before storage was blocked');
    await reloadWith(page, () => { Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    const out = await tour(page, { heavy: true, timeout: 30000 });
    t.check(tourOk(out), 'writes blocked and no IndexedDB: every tab opens', out);
    await page.locator('[data-mode="advanced"]').click(); await sleep(200);
    t.check(!(await isSimple(page)).simple, 'writes blocked: the switch still works for this visit', await isSimple(page));
    await tab(page, 'paint'); await sleep(1500);
    await stroke(page, '#ps-paper');
    t.check((await inked(page, '#ps-paper')) > 50, 'writes blocked: the Studio still paints', await inked(page, '#ps-paper'));
    t.note(`writes blocked, no IndexedDB: the Studio's note after a stroke reads "${(await toastOf(page)).text || '(nothing)'}" (the README says the painting is kept; without a database nothing is said either way)`);
    await tab(page, 'help');
    await forgetTwice(page);
    t.check((await shownPanels(page)).join() === 'tab-study', 'writes blocked: Forget still reloads the page', await shownPanels(page));
    await clean(t, page, 'storage blocked (writes)');
    await page.context().close();
  });
  await step(t, 'storage blocked (access)', async () => {
    const page = await openPage(site);
    await clean(t, page, 'before storage access was blocked');
    await reloadWith(page, () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); }, configurable: true }); });
    const out = await tour(page, { heavy: true, timeout: 30000 });
    t.check(tourOk(out), 'localStorage throws on access: every tab opens', out);
    await tab(page, 'help');
    await forgetTwice(page);
    t.check((await shownPanels(page)).join() === 'tab-study', 'localStorage throws on access: Forget still reloads the page', await shownPanels(page));
    await clean(t, page, 'storage blocked (access)');
    await page.context().close();
  });
  // storage full: a realistic case of setItem throwing while the keys are still there to clear
  await step(t, 'forget with a full storage', async () => {
    const page = await openPage(site, { url: '#help' });
    // fill it to the last byte: big chunks, then smaller and smaller ones, until a one-letter write throws
    const fill = await page.evaluate(() => { localStorage.setItem('portrait-value-studio.mode', 'advanced'); localStorage.setItem('pose-and-light.mode', 'advanced'); let n = 0, kb = 0, err = ''; for (const size of [256 * 1024, 64 * 1024, 16 * 1024, 4 * 1024, 1024, 256, 64, 16, 4, 1]) { const chunk = 'x'.repeat(size); for (let k = 0; k < 2000; k++) { try { localStorage.setItem('filler.' + n, chunk); n++; kb += size / 1024; } catch (e) { err = e.name; break; } } } let full = false; try { localStorage.setItem('portrait-value-studio.probe', 'y'); } catch (e) { full = true; } return { n, kb: Math.round(kb), err, full }; });
    t.note(`localStorage took ${fill.n} writes, ${fill.kb} KB, before ${fill.err || 'nothing'}; a one-letter write ${fill.full ? 'then throws too (full)' : 'still works'}`);
    t.check(fill.full, 'the storage could be filled until any write throws', fill);
    if (fill.full) {
      await forgetTwice(page);
      const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)));
      const cleared = keys.length === 0;
      t.check(cleared, 'with a full storage, Forget still removes the site\'s keys', keys);
      if (!cleared) t.finding({ title: 'With browser storage full, "Forget my work on this device" leaves every saved key in place', severity: 'high', steps: 'Fill localStorage until setItem throws (any other site or this one storing enough; here 256 KB strings under keys of another name until QuotaExceededError). Have portrait-value-studio.mode = advanced saved. Open How to use, tap Forget my work on this device twice. After the reload, read localStorage.', expected: 'Every portrait-value-studio.* and pose-and-light.* key is gone, as the button and the README\'s Privacy section promise; the page reopens in Simple.', actual: `${keys.join(', ')} survive and the page reopens in Advanced. js/guard.js 29-33: forget() writes the "forget" marker for the site's other tabs with setItem first, inside the same try as the loop that removes the keys; when that write throws (storage full), the catch swallows it and the removal never runs. The same happens whenever setItem throws for any reason while getItem and removeItem still work.` });
    }
    await clean(t, page, 'forget with a full storage');
    await page.context().close();
  });
}

// ---- C: hostile keys on every tab and every route, scripts blocked, styles, fonts, a picture, axe -------------

async function groupC(t, site) {
  // every key seeded hostile at once, every tab opened in turn, for each shape
  for (const [label, make] of VARIANTS) {
    await step(t, `hostile keys: ${label}`, async () => {
      const page = await openPage(site, { storage: seedAll(make) });
      // Pose and Figure are waited for on the two shapes most likely to trip them (prototype names, 5000 entries)
      const heavy = /prototype|5000/.test(label);
      const out = await tour(page, { heavy, timeout: 20000 });
      t.check(tourOk(out), `every key ${label}: every tab opens`, out);
      const s = await page.evaluate(() => ({ polluted: 'polluted' in Object.prototype || 'polluted' in {}, simple: document.body.classList.contains('mode-simple'), toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent.trim() : '', mine: document.querySelectorAll('#mine .pose-btn').length }));
      t.check(!s.polluted && s.simple, `every key ${label}: no prototype pollution, Simple mode`, s);
      if (s.toast) t.note(`every key ${label}: the page says "${s.toast}" after the tour`);
      await clean(t, page, `hostile keys: ${label}`);
      await page.context().close();
    });
  }

  // every route opened with a hostile state (a different shape for each route)
  await step(t, 'routes with hostile state', async () => {
    const routes = ['#check', '#game', '#paint', '#help', '#loomis', '#pose', '#figure', '#battle', '#nonsense'];
    for (let i = 0; i < routes.length; i++) {
      const h = routes[i], [label, make] = VARIANTS[i % VARIANTS.length];
      const page = await openPage(site, { url: h, storage: seedAll(make) });
      const want = { '#check': 'tab-study', '#nonsense': 'tab-study' }[h] || 'tab-' + h.slice(1);
      if (h === '#pose' || h === '#figure') await settle(page, h.slice(1), 20000);
      const shown = await shownPanels(page);
      t.check(shown.join() === want, `route ${h} with every key ${label}: opens ${want}`, shown);
      if (h === '#check') t.check(await page.evaluate(() => document.getElementById('drawer-check').open === true && !document.getElementById('checkSection').hidden), 'route #check with hostile keys: the check drawer is open');
      await clean(t, page, `route ${h} with every key ${label}`);
      await page.context().close();
    }
  });

  // every script blocked one at a time: the guard's rules (js/guard.js TAB_OF), every remaining tab still opens
  const BLOCKED = [
    ['js/guard.js', { note: 'none', hidden: [] }],
    ['js/processing.js', { note: 'nojs' }],
    ['js/mixing.js', { note: 'nojs' }],
    ['js/paints.js', { note: 'nojs' }],
    ['js/app.js', { note: 'nojs' }],
    ['js/palette.js', { note: 'part', hidden: [] }],
    ['js/subjects.js', { note: 'part', hidden: ['game'], gamesSub: 'Value battle', url: '#game' }],
    ['js/game.js', { note: 'part', hidden: ['game'], gamesSub: 'Value battle', url: '#game' }],
    ['js/painting.js', { note: 'part', hidden: ['figure', 'loomis', 'paint'], url: '#paint', fromStudio: true }],
    ['js/figure.js', { note: 'part', hidden: ['figure'], url: '#figure' }],
    ['js/loomis.js', { note: 'part', hidden: ['loomis'], url: '#loomis', learnSub: 'Study the photo' }],
    ['js/battle.js', { note: 'part', hidden: ['battle'], url: '#battle', gamesSub: 'Paint by numbers' }],
  ];
  for (const [file, want] of BLOCKED) {
    await step(t, `${file} blocked`, async () => {
      const page = await openPage(site, { block: [site.base + file], url: want.url || '' });
      await sleep(900);
      const s = await notesOf(page);
      const noteOk = want.note === 'nojs' ? s.nojs === 'block' && s.part === 'none' && s.old === 'none' : want.note === 'part' ? s.part === 'block' && s.nojs === 'none' && s.old === 'none' : s.part === 'none' && s.nojs === 'none' && s.old === 'none';
      t.check(noteOk, `${file} blocked: the right note (${want.note})`, s);
      if (want.note === 'nojs') t.check(s.tabs === 'none' && s.actions === 'none' && s.help === 'block' && s.study === 'none' && s.steps === 'none' && s.forget !== 'none', `${file} blocked: only the guide shows (the Study panel is off), no tabs, no switch, no Try buttons, Forget stays`, s);
      else {
        t.check(s.hidden.join() === want.hidden.join() && s.groups.length === 0, `${file} blocked: menu items off ${JSON.stringify(want.hidden)}`, { hidden: s.hidden, groups: s.groups });
        t.check(s.shown.length === 1 && s.shown[0] === (want.url ? 'tab-study' : 'tab-study'), `${file} blocked: the page shows one panel${want.url ? ', Study in place of its own route' : ''}`, s.shown);
        if (want.gamesSub) t.check(s.gamesSub === want.gamesSub, `${file} blocked: the Games button names what is left (${want.gamesSub})`, s.gamesSub);
        if (want.learnSub) t.check(s.learnSub === want.learnSub, `${file} blocked: the Learning tools button names what is open`, s.learnSub);
        if (want.fromStudio) t.check(s.fromStudio, `${file} blocked: Use my Studio painting goes with the Studio`);
        // every tab still on the menu opens; a tab taken off stays off (its click lands on Study)
        const out = {};
        for (const name of TABS) { await tab(page, name, { wait: false }); await sleep(250); out[name] = (await shownPanels(page)).join(); }
        const expect = (n) => (want.hidden.includes(n) ? 'tab-study' : 'tab-' + n);
        t.check(TABS.every((n) => out[n] === expect(n)), `${file} blocked: every remaining tab opens, the missing ones stay off`, out);
      }
      t.check(page.log.pageerrors.length === 0, `${file} blocked: no page error`, page.log.pageerrors);
      await page.context().close();
    });
  }
  // the frame's own scripts
  await step(t, 'pose scripts blocked', async () => {
    for (const file of ['js/pose.js', 'js/pose-embed.js']) {
      const page = await openPage(site, { block: [site.base + file] });
      await tab(page, 'pose', { wait: false });
      await settle(page, 'pose', 15000);
      await sleep(2000);
      const f = poseFrame(page);
      const s = f ? await f.evaluate(() => ({ started: !!window.__poseStarted, fail: !document.getElementById('fail').hidden, rail: getComputedStyle(document.querySelector('.rail')).display, embed: document.documentElement.classList.contains('embed'), imgs: document.querySelectorAll('#poses button.has-img').length, mode: window.PoseAndLight ? PoseAndLight.mode() : null })).catch(() => null) : null;
      const app = await notesOf(page);
      const height = await page.evaluate(() => document.getElementById('poseFrame').style.height);
      if (file === 'js/pose.js') t.check(s && !s.started && s.fail && s.rail === 'none' && app.part === 'none' && app.nojs === 'none', 'pose.js blocked: the frame shows its failure panel without dead controls; the app shows no note of its own', { s, app: app.cls });
      else { t.check(s && s.started && s.imgs === 30 && app.part === 'none' && app.nojs === 'none', 'pose-embed.js blocked: the Pose page still runs inside the frame', { s, height }); t.note(`pose-embed.js blocked: the frame is not told it is embedded (its own header shows, its height stays the stylesheet's ${height || '900px default'} instead of following the page) and the app's Simple/Advanced is not followed (frame mode ${s && s.mode})`); }
      t.check(page.log.pageerrors.length === 0, `${file} blocked: no page error`, page.log.pageerrors);
      await page.context().close();
    }
  });

}

// ---- D: two scripts at once, styles.css, the fonts, a picture, axe (after group A, for balance) ----------------

async function groupD(t, site) {
  // two scripts blocked at once
  await step(t, 'two scripts blocked', async () => {
    let page = await openPage(site, { block: [site.base + 'js/game.js', site.base + 'js/battle.js'], url: '#battle' });
    await sleep(1000);
    let s = await notesOf(page);
    t.check(s.part === 'block' && s.hidden.join() === 'battle,game' && s.groups.join() === 'games' && s.shown.join() === 'tab-study', 'game.js and battle.js blocked: the Games section leaves the bar, Study shows', s);
    t.check(page.log.pageerrors.length === 0, 'game.js and battle.js blocked: no page error', page.log.pageerrors);
    await page.context().close();
    page = await openPage(site, { block: [site.base + 'js/painting.js', site.base + 'js/subjects.js'], url: '#figure' });
    await sleep(1000);
    s = await notesOf(page);
    t.check(s.part === 'block' && s.hidden.join() === 'figure,game,loomis,paint' && s.groups.length === 0 && s.gamesSub === 'Value battle' && s.shown.join() === 'tab-study', 'painting.js and subjects.js blocked: four items off, Games names Value battle, Study shows', s);
    const out = await tour(page, { heavy: false });
    t.check(out.study === 'tab-study' && out.help === 'tab-help' && out.pose === 'tab-pose' && out.battle === 'tab-battle' && out.paint === 'tab-study' && out.figure === 'tab-study', 'painting.js and subjects.js blocked: what is left opens, the rest stays off', out);
    t.check(page.log.pageerrors.length === 0, 'painting.js and subjects.js blocked: no page error', page.log.pageerrors);
    await page.context().close();
    // the guard and a script app.js needs: no safety net at all
    page = await openPage(site, { block: [site.base + 'js/guard.js', site.base + 'js/processing.js'] });
    await sleep(1000);
    s = await notesOf(page);
    await click(page, '#tabPaintBtn'); await sleep(300);
    const dead = { ...s, afterClick: await shownPanels(page) };
    const guided = s.nojs === 'block' || s.part === 'block';
    t.check(guided, 'guard.js and processing.js blocked: the page still says it has not started', dead);
    if (!guided) t.finding({ title: 'With guard.js missing and a script app.js depends on missing, the page shows its full set of controls with no note, and none of them works', severity: 'medium', steps: 'Serve the site without js/guard.js and js/processing.js (a partial deploy; the README notes guard.js is a runtime file). Open the page. Press Studio, or any section.', expected: 'The no-js fallback: the "has not started" note over the guide and no controls (the page starts with class="no-js" for exactly this).', actual: `Class no-js is removed, no note shows, the four section buttons and the switch are there and nothing happens on a press (after Studio: ${dead.afterClick.join()}). js/app.js 5 removes no-js before line 8 checks for Study, Mixing and Paints; when that check fails without a guard it returns in silence (lines 9-12). Keeping no-js on until the check passes would leave the fallback in place.` });
    t.check(page.log.pageerrors.length === 0, 'guard.js and processing.js blocked: no page error', page.log.pageerrors);
    await page.context().close();
    page = await openPage(site, { block: [site.base + 'js/guard.js', site.base + 'js/app.js'] });
    await sleep(1000);
    s = await notesOf(page);
    t.check(/no-js/.test(s.cls) && s.nojs === 'block' && s.tabs === 'none' && s.help === 'block', 'guard.js and app.js blocked: the no-js fallback shows the guide and the note', s);
    await page.context().close();
  });

  // styles.css blocked, the fonts blocked, a guide picture missing
  await step(t, 'styles.css blocked', async () => {
    const page = await openPage(site, { block: [site.base + 'styles.css'] });
    await sleep(1200);
    const s = await notesOf(page);
    const texts = await page.evaluate(() => [...document.querySelectorAll('.oldbrowser-note, .partfail-note, .nojs-note')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.querySelector('strong').textContent));
    t.check(/load-failed/.test(s.cls) && s.nojs === 'block', 'styles.css blocked: the guard marks the load failed and the "has not started" note shows', s);
    const only = s.old === 'none' && s.part === 'none';
    t.check(only, 'styles.css blocked: the "too old" and "part did not start" notes stay hidden', texts);
    if (!only) t.finding({ title: 'With styles.css missing, the page shows all three standing notes, two of them wrong: "This browser is too old" and "Part of Portrait Value Studio did not start"', severity: 'medium', steps: 'Serve the site with styles.css blocked or missing (a partial deploy, a blocked request). Open the page.', expected: 'One note that fits: the stylesheet did not load, reload the page (the guard adds load-failed for this case).', actual: `The page is unstyled and reads: ${texts.map((x) => `"${x}"`).join(', ')}. The three notes are plain divs hidden only by styles.css 1724-1729, so without the stylesheet all of them show; the old-browser one sends the visitor to install another browser. An hidden attribute on the two that do not apply (toggled by js/guard.js), or the notes carried in the stylesheet-free part of the page, would leave one.` });
    const out = await tour(page, { heavy: false });
    t.check(tourOk(out), 'styles.css blocked: every tab still opens', out);
    t.check(page.log.pageerrors.length === 0, 'styles.css blocked: no page error', page.log.pageerrors);
    await page.context().close();
  });
  await step(t, 'fonts blocked', async () => {
    const page = await openPage(site, { block: [site.base + 'fonts/*'] });
    await sleep(800);
    const s = await page.evaluate(() => ({ status: document.fonts.status, loaded: [...document.fonts].filter((f) => f.status === 'loaded').length, errored: [...document.fonts].filter((f) => f.status === 'error').length, font: getComputedStyle(document.querySelector('h1')).fontFamily }));
    const out = await tour(page, { heavy: false });
    t.check(tourOk(out) && (await notesOf(page)).nojs === 'none', 'the fonts blocked: every tab opens, no note (the typefaces fall back)', { ...s, out });
    t.check(page.log.pageerrors.length === 0, 'the fonts blocked: no page error', page.log.pageerrors);
    await page.context().close();
  });
  await step(t, 'guide picture 404', async () => {
    const page = await openPage(site, { notFound: [site.base + 'img/help/start.jpg'], url: '#help' });
    await page.waitForFunction(() => { const i = document.querySelector('img[src="img/help/start.jpg"]'); return i && i.complete; }, null, { timeout: 10000 }).catch(() => null);
    const s = await page.evaluate(() => { const i = document.querySelector('img[src="img/help/start.jpg"]'); const r = i.getBoundingClientRect(); return { natural: i.naturalWidth, alt: i.alt.length, box: [Math.round(r.width), Math.round(r.height)], caption: i.closest('figure').querySelector('figcaption').textContent }; });
    t.check(s.natural === 0 && s.alt > 10 && s.box[0] > 0 && s.caption.length > 0 && (await notesOf(page)).nojs === 'none', 'a guide picture missing: its alt and caption stay, the frame keeps its size, no note', s);
    t.note(`a guide picture missing (404): the phone frame shows the browser's broken-image mark with the alt text; the page says nothing more, which is fair for a picture in a guide`);
    t.check(page.log.console.length === 1 && /status of 404/.test(page.log.console[0]), 'a guide picture missing: the one console line is the browser\'s own 404 for it', page.log.console);
    dropLogged(page, /status of 404/);
    await clean(t, page, 'guide picture 404');
    await page.context().close();
  });

  // axe on every tab at phone width, and on the desktop with each menu open and on the 404 page
  await step(t, 'axe', async () => {
    const serious = [], minor = new Set();
    const take = async (page, label) => { const v = await axe(page); for (const x of v) { if (x.impact === 'critical' || x.impact === 'serious') serious.push(`${label}: ${x.id} (${x.impact}) ${x.help} ×${x.count} e.g. ${x.nodes[0]}`); else minor.add(`${x.id} (${x.impact}) ${x.help} e.g. ${x.nodes[0]}`); } };
    const phone = await openPage(site, { viewport: PHONE, bypassCSP: true });
    for (const name of TABS) { await tab(phone, name, { wait: false }); if (name === 'pose' || name === 'figure') await settle(phone, name, 20000); await take(phone, 'phone ' + name); }
    await phone.context().close();
    const desk = await openPage(site, { bypassCSP: true });
    await click(desk, '#tabLearnBtn'); await take(desk, 'desktop Learning tools menu open');
    await click(desk, '#tabGamesBtn'); await take(desk, 'desktop Games menu open');
    await desk.keyboard.press('Escape');
    await desk.context().close();
    const nf = await openPage(site, { url: 'no-such-page', bypassCSP: true });
    await take(nf, '404 page');
    await nf.context().close();
    t.check(serious.length === 0, 'axe: no serious or critical issue on any tab at phone width, with a menu open, or on the 404 page', serious);
    const strips = serious.filter((s) => /scrollable-region-focusable/.test(s) && /help/.test(s));
    if (strips.length) t.finding({ title: 'At phone width the guide\'s screenshot strips scroll sideways but cannot be reached or scrolled from the keyboard', severity: 'medium', steps: 'Open the site on a 390 × 844 window, open How to use, Tab through the page: the strips of phone screenshots (every part with more than one picture) are skipped, and the arrow keys cannot scroll them. Or run axe-core on the tab.', expected: 'A keyboard user can reach each strip and scroll it (tabindex="0" with a label on .help-shots), or the pictures wrap instead of scrolling as they do from 760 px up.', actual: `axe reports scrollable-region-focusable (serious) on ${strips[0].replace(/^phone help: /, '')}: styles.css 1609 gives .help-shots overflow-x: auto below 760 px and index.html gives the element no tabindex, so the second and later pictures of a part are out of a keyboard user's reach.` });
    for (const m of minor) t.note(`axe (not serious): ${m}`);
  });
}
