// The app shell and everything cross-cutting, played like a sceptical tester (README: "Simple and Advanced",
// "How to use", "Privacy", the guard parts of "Publishing"; source js/app.js (tabs, menus, switchTab, the hash
// routes, the guide's buttons, Forget), js/guard.js, the .no-js / .old-browser / .load-failed / .part-failed /
// .all-failed rules in styles.css, 404.html): the two menus by keyboard, the focus order through the top bar,
// the guide's step buttons and every screenshot, Simple and Advanced across reloads and the Pose frame, dark
// mode and reduced motion on every tab, the window resized live, Back and Forward through hashes, an old browser,
// JavaScript off, storage blocked two ways and full, the guard's two-tap reset, Forget during a game and a Figure
// class, the 404 page, the toast's lifetime and cap, and the whole-app sweeps: every portrait-value-studio.* and
// pose-and-light.* key seeded hostile at once (each shape, and a different one in every key) with every tab
// opened in turn and the page read for words a bad value turned up (NaN, undefined, [object Object]); every
// #route (and every way of writing one) opened with a hostile state; every script blocked one at a time and made
// to throw one at a time, and two or all of them at once, each read against js/guard.js's TAB_OF (the menu item,
// the panel, the guide's jump button, the menu's name, the note, the keyboard walk); styles.css, the fonts, the
// icons, three.js, pose.html's scripts and the guide's pictures missing; axe on every tab at both widths.
// Steps are independent, each on contexts of its own, and run on a small pool of workers (PVS_WORKERS, default 3)
// longest first, so the case stays inside its time budget on a shared machine. PVS_STEPS=<regexp> runs the steps
// whose names match, for working on one.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, clean, tab, app, TABS, DESKTOP, PHONE, poseFrame, stroke, inked, storageKeys, storageGet, click, text, hscroll, screenshot, sleep, axe, violations } from '../lib.mjs';

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
  return { cls: document.documentElement.className.trim(), nojs: d('.nojs-note'), part: d('.partfail-note'), old: d('.oldbrowser-note'), tabs: d('.tabs'), help: d('#tab-help'), study: d('#tab-study'), actions: d('.topbar-actions'), steps: d('.help-steps .btn'), forget: d('#forgetBtn'), forgetShown: !!(document.getElementById('forgetBtn').getClientRects().length),
    hidden: [...document.querySelectorAll('[data-tab]')].filter((e) => e.hidden).map((e) => e.dataset.tab).sort(), groups: [...document.querySelectorAll('.tab-group')].filter((g) => g.hidden).map((g) => g.dataset.group),
    goHidden: [...document.querySelectorAll('[data-go]')].filter((e) => e.hidden).map((e) => e.dataset.go).sort(), learnSub: document.getElementById('tabLearnSub').textContent, gamesSub: document.getElementById('tabGamesSub').textContent, paintsOff: document.getElementById('paints').hidden, blockViewOff: document.querySelector('.block-view').hidden, colorsState: document.getElementById('colorsState').textContent.trim(), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), fromStudio: !!document.getElementById('artFromStudio').hidden };
});
const active = (page) => page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return 'body'; return a.id || a.getAttribute('data-mode') || a.tagName.toLowerCase(); });
const menuOf = (page, id) => page.evaluate((id) => { const m = document.getElementById(id); const b = document.querySelector(`[aria-controls="${id}"]`); return { hidden: m.hidden, expanded: b.getAttribute('aria-expanded') }; }, id);
const luminance = (fr) => fr.evaluate(() => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(document.body).backgroundColor); return m ? +((0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255).toFixed(2) : -1; });
const toastOf = (page) => page.evaluate(() => { const e = document.getElementById('toast'); const b = e.querySelector('button'); return { show: e.classList.contains('show'), text: e.textContent.trim(), button: b ? b.textContent : null, disabled: !!(b && b.disabled) }; });
const isSimple = (page) => page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), pressed: [...document.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode + '=' + b.getAttribute('aria-pressed')).join(' ') }));
const frameMode = (page) => { const f = poseFrame(page); return f ? f.evaluate(() => window.PoseAndLight ? PoseAndLight.mode() : null).catch(() => null) : null; };
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const timings = [];
// what a step is expected to cost on a busy machine, in seconds (longest first keeps the workers even); the
// default is 20
const COSTS = [[/^modes/, 140], [/live resize/, 90], [/storage blocked \(writes\)/, 110], [/^pose and figure routes/, 100], [/^routes/, 70], [/^axe/, 90], [/dark/, 70], [/hostile keys/, 60], [/forget during a figure/, 60], [/reduced motion/, 40], [/storage blocked \(access\)/, 75], [/guard\.js blocked/, 50], [/three|pose scripts/, 40]];
const jobs = [];
// a step registers itself; the pool at the end of the case runs them
function step(t, name, fn) { jobs.push({ name, fn, cost: (COSTS.find(([re]) => re.test(name)) || [0, 20])[1] }); }
async function runJob(t, j) {
  if (process.env.PVS_STEPS && !new RegExp(process.env.PVS_STEPS).test(j.name)) return;
  const t0 = Date.now();
  try { await j.fn(); } catch (e) { t.check(false, `${j.name}: the step ran to its end`, String(e && e.stack || e).slice(0, 400)); }
  timings.push(`${j.name} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
async function reloadWith(page, script, arg) { await page.addInitScript(script, arg); await page.reload({ waitUntil: 'load' }); await sleep(500); }
// the wait part of lib's tab() without the click: the Pose frame up (or its failure panel), Figure's pictures (or its note)
async function settle(page, name, timeout = 15000) {
  if (name === 'pose') { const t0 = Date.now(); while (Date.now() - t0 < timeout) { const f = poseFrame(page); if (f) { const up = await f.evaluate(() => (!!window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30) || !document.getElementById('fail').hidden).catch(() => false); if (up) return true; } await sleep(250); } return false; }
  if (name === 'figure') return !!(await page.waitForFunction(() => { const b = document.querySelectorAll('#tab-figure [data-pose-id]'); return (b.length > 0 && [...b].every((x) => { const i = x.querySelector('img'); return i && i.src.startsWith('blob:'); })) || /could not be drawn/.test(document.getElementById('fig-libNote').textContent); }, null, { timeout }).catch(() => null));
  await sleep(300); return true;
}
// every tab in turn, the way a visitor opens them; heavy = wait for Pose and Figure to finish; each(name) runs on
// every tab once it is up
async function tour(page, { heavy = true, timeout = 15000, each = null, tabs = TABS } = {}) {
  const out = {};
  for (const name of tabs) {
    await tab(page, name, { wait: false });
    if (heavy && (name === 'pose' || name === 'figure')) await settle(page, name, timeout); else await sleep(250);
    out[name] = (await shownPanels(page)).join(',');
    if (each) await each(name);
  }
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
  groupA(t, site); groupB(t, site); groupC(t, site); groupD(t, site); groupE(t, site);
  jobs.sort((a, b) => b.cost - a.cost);
  let next = 0;
  const worker = async () => { while (next < jobs.length) await runJob(t, jobs[next++]); };
  await Promise.all(Array.from({ length: Math.max(1, +process.env.PVS_WORKERS || 3) }, worker));
  t.note(`step timings (${jobs.length} steps on ${+process.env.PVS_WORKERS || 3} workers, longest first): ${timings.join('; ')}`);
}

// ---- A: keyboard, the guide, modes, reduced motion, hashes, an old browser, the toast --------------------------

function groupA(t, site) {
  // the two menus by keyboard, and the focus order through the top bar, at both widths
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    step(t, `${label} keyboard`, async () => {
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
  step(t, 'guide', async () => {
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
  step(t, 'modes', async () => {
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
  step(t, 'reduced motion', async () => {
    const page = await openPage(site, { reducedMotion: true });
    const s = await page.evaluate(() => ({ matches: matchMedia('(prefers-reduced-motion: reduce)').matches, toast: getComputedStyle(document.getElementById('toast')).transitionDuration, summary: getComputedStyle(document.querySelector('.drawer > summary'), '::after').transitionDuration, tab: getComputedStyle(document.querySelector('.tab')).transitionDuration, caret: getComputedStyle(document.querySelector('.tab-caret')).transitionDuration }));
    t.check(s.matches && /^0s/.test(s.toast) && /^0s/.test(s.summary), 'reduced motion: the toast and drawer markers have no transition', s);
    if (!/^0s/.test(s.caret)) t.note(`reduced motion: the menu caret still rotates over ${s.caret} and the tab buttons keep their ${s.tab} colour transitions (styles.css 1285 and 1379 list only the toast, the drawer markers and the game pulses); a 0.15 s turn of an arrow is below what the setting is for, so no finding`);
    await tour(page, { heavy: false, tabs: TABS.filter((n) => n !== 'figure') });
    await clean(t, page, 'reduced motion');
    await page.context().close();
  });

  // Back and Forward through hashes: the address is read at start only
  step(t, 'hashes', async () => {
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
    step(t, `${label} old browser`, async () => {
      const page = await openPage(site, { viewport });
      await clean(t, page, `${label} before the old-browser reload`);
      await reloadWith(page, () => { delete window.ResizeObserver; });
      const s = await notesOf(page);
      t.check(/old-browser/.test(s.cls) && s.old === 'block' && s.nojs === 'none' && s.part === 'none', `${label} old browser: the "too old" note alone shows`, s);
      t.check(s.tabs === 'none' && s.actions === 'none' && s.help === 'block' && s.steps === 'none' && s.forgetShown, `${label} old browser: no tabs, no switch, the guide reads, its Try buttons are off, Forget stays`, s);
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
  step(t, 'toast', async () => {
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
    // (the Loomis head has a strip of its own, earlier in the page: the Studio's is the one in #tab-paint)
    await phone.waitForFunction(() => { const p = document.getElementById('tab-paint'); return p && !p.hidden && p.querySelector('.ps-strip') && p.querySelector('.ps-strip').getBoundingClientRect().height > 0; }, null, { timeout: 15000 }).catch(() => null);
    await sleep(1200);
    await phone.evaluate(() => Studio.toast('toast-test on a phone', 4000));
    const pos = await phone.evaluate(() => { const t = document.getElementById('toast').getBoundingClientRect(); const s = document.querySelector('#tab-paint .ps-strip').getBoundingClientRect(); return { toastBottom: Math.round(t.bottom), stripTop: Math.round(s.top), shown: document.getElementById('toast').classList.contains('show'), within: t.right <= innerWidth && t.left >= 0 }; });
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

function groupB(t, site) {
  // dark mode on every tab, with screenshots, at both widths
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    step(t, `${label} dark`, async () => {
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
  step(t, 'live resize', async () => {
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
  step(t, '404 page', async () => {
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
  step(t, 'reset offer', async () => {
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
  step(t, 'forget during a game', async () => {
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
  step(t, 'forget during a figure class', async () => {
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
  step(t, 'forget disarms', async () => {
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
  step(t, 'storage blocked (writes)', async () => {
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
  step(t, 'storage blocked (access)', async () => {
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
  step(t, 'forget with a full storage', async () => {
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

// ---- C: hostile keys on every tab, every route, every way of writing one ------------------------------------

// a different shape in every key: the seven above, dealt out by the key's place in the list
const VARIANT_BASE = VARIANTS.slice();
VARIANTS.push(['a different shape in every key', (k) => VARIANT_BASE[ALL_KEYS.indexOf(k) % VARIANT_BASE.length][1]()]);

// words a bad saved value turns up on the page when something reads it as text: NaN, undefined, [object Object],
// a function's source (the text on show, and what is in a field)
const JUNK = /NaN|undefined|\[object |native code|function \w*\(|Infinity/;
const junkIn = (fr) => fr.evaluate((src) => {
  const bad = new RegExp(src), hits = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (!p || p.closest('script,style,template,noscript') || !bad.test(n.textContent) || !p.getClientRects().length) continue;
    hits.push(`${p.id || p.className || p.tagName}: ${n.textContent.trim().slice(0, 60)}`);
  }
  for (const i of document.querySelectorAll('input,select,textarea')) if (i.getClientRects().length && bad.test(String(i.value))) hits.push(`${i.id || i.name} = ${String(i.value).slice(0, 40)}`);
  return hits.slice(0, 6);
}, JUNK.source);

function groupC(t, site) {
  // every key seeded hostile at once, every tab opened in turn, for each shape; Pose and Figure are waited for on
  // the shapes most likely to trip them (prototype names, 5000 entries, a different shape in every key)
  for (const [label, make] of VARIANTS) {
    step(t, `hostile keys: ${label}`, async () => {
      const page = await openPage(site, { storage: seedAll(make) });
      const heavy = /prototype|5000|different/.test(label);
      const junk = [];
      const out = await tour(page, { heavy, timeout: 40000, each: async (name) => {
        const j = await junkIn(app(page));
        if (j.length) junk.push(`${name}: ${j.join(' | ')}`);
        const f = heavy && name === 'pose' ? poseFrame(page) : null;
        const jf = f ? await junkIn(f).catch(() => []) : [];
        if (jf.length) junk.push(`pose frame: ${jf.join(' | ')}`);
      } });
      t.check(tourOk(out), `every key ${label}: every tab opens`, out);
      const s = await page.evaluate(() => ({ polluted: 'polluted' in Object.prototype || 'polluted' in {}, simple: document.body.classList.contains('mode-simple'), toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent.trim() : '' }));
      t.check(!s.polluted && s.simple, `every key ${label}: no prototype pollution, Simple mode`, s);
      t.check(junk.length === 0, `every key ${label}: no tab shows NaN, undefined, [object Object] or a function's source`, junk);
      if (s.toast) t.note(`every key ${label}: the page says "${s.toast}" after the tour`);
      await clean(t, page, `hostile keys: ${label}`);
      await page.context().close();
    });
  }

  // every route opened with a hostile state: two shapes for each route, so that every shape meets two routes
  async function openRoute(h, vi, heavy) {
    const [label, make] = VARIANTS[vi % VARIANTS.length];
    const page = await openPage(site, { url: h, storage: seedAll(make) });
    const want = { '#check': 'tab-study', '#nonsense': 'tab-study' }[h] || 'tab-' + h.slice(1);
    if (heavy) await settle(page, h.slice(1), 40000);
    const shown = await shownPanels(page);
    t.check(shown.join() === want, `route ${h} with every key ${label}: opens ${want}`, shown);
    if (h === '#check') t.check(await page.evaluate(() => document.getElementById('drawer-check').open === true && !document.getElementById('checkSection').hidden), `route #check with every key ${label}: the check drawer is open`);
    const junk = await junkIn(app(page));
    t.check(junk.length === 0, `route ${h} with every key ${label}: nothing on the page reads NaN or undefined`, junk);
    await clean(t, page, `route ${h} with every key ${label}`);
    await page.context().close();
  }
  step(t, 'routes with hostile state', async () => {
    const routes = ['#check', '#game', '#paint', '#help', '#loomis', '#battle', '#study', '#nonsense'];
    for (let i = 0; i < routes.length; i++) for (const k of [0, 1]) await openRoute(routes[i], i + k * 4, false);
  });
  step(t, 'pose and figure routes with hostile state', async () => {
    for (const [h, vi] of [['#pose', 3], ['#pose', 4], ['#figure', 7], ['#figure', 4]]) await openRoute(h, vi, true);
  });

  // an address written by hand: any case, a trailing slash, a query, a name that is a property of Object, a bare #;
  // opened at load, and then changed in place (an unknown one leaves the open tab as it is)
  step(t, 'hash spellings', async () => {
    const make = VARIANTS[3][1];
    for (const [h, want] of [['#Help', 'help'], ['#loomis?x=1', 'loomis'], ['#__proto__', 'study'], ['#hasOwnProperty', 'study']]) {
      const page = await openPage(site, { url: h, storage: seedAll(make) });
      t.check((await shownPanels(page)).join() === 'tab-' + want, `opened at ${h}: ${want} shows`, await shownPanels(page));
      await clean(t, page, `opened at ${h}`);
      await page.context().close();
    }
    const page = await openPage(site, { storage: seedAll(make) });
    let open = 'study';
    for (const [h, to] of [['#Help', 'help'], ['#GAME/', 'game'], ['#loomis?x=1', 'loomis'], ['#paint&y=2', 'paint'], ['#nonsense', null], ['#__proto__', null], ['#constructor', null], ['#toString', null], ['#hasOwnProperty', null], ['#valueOf', null], ['#battle', 'battle'], ['#', 'study'], ['#help', 'help'], ['', 'study'], ['#CHECK', 'study'], ['#loomis', 'loomis'], ['#study', 'study']]) {
      // (the hashchange event is queued: wait for it, so a tab that wrongly switched is seen too)
      await page.evaluate((x) => new Promise((res) => { const done = () => setTimeout(res, 60); addEventListener('hashchange', done, { once: true }); setTimeout(done, 600); location.hash = x; }), h);
      const want = to || open;
      const ok = await page.waitForFunction((w) => { const p = [...document.querySelectorAll('.tabpanel')].filter((e) => !e.hidden).map((e) => e.id); return p.length === 1 && p[0] === 'tab-' + w; }, want, { timeout: 3000 }).then(() => true).catch(() => false);
      t.check(ok, `the address changed to ${JSON.stringify(h)}: ${to ? to + ' opens' : 'the open tab (' + open + ') stays'}`, await shownPanels(page));
      open = want;
    }
    t.check(await page.evaluate(() => document.getElementById('drawer-check').open === true && !document.getElementById('checkSection').hidden), 'the address #CHECK opened the check drawer');
    await clean(t, page, 'hash spellings');
    await page.context().close();
  });
}

// ---- D: scripts that do not load, scripts that throw, the stylesheet, the fonts, the pictures ----------------

const NOJS = { note: 'nojs' };
// each script blocked on its own: the standing note, the menu items and panels the guard takes off (js/guard.js
// TAB_OF, plus what a module takes off for itself when what it needs did not load), the menus' names
const BLOCKED = [
  ['js/guard.js', { note: 'none', hidden: [], heavy: true }],
  ['js/processing.js', NOJS],
  ['js/mixing.js', NOJS],
  ['js/paints.js', NOJS],
  ['js/app.js', NOJS],
  ['js/palette.js', { note: 'part', hidden: [], paints: true }],
  ['js/subjects.js', { note: 'part', hidden: ['game'], gamesSub: 'Value battle', url: '#game', menus: { tabGamesBtn: ['tabBattleBtn'] } }],
  ['js/game.js', { note: 'part', hidden: ['game'], gamesSub: 'Value battle', url: '#game', menus: { tabGamesBtn: ['tabBattleBtn'] } }],
  ['js/painting.js', { note: 'part', hidden: ['figure', 'loomis', 'paint'], url: '#paint', fromStudio: true, menus: { tabLearnBtn: ['tabStudyBtn', 'tabPoseBtn', 'tabHelpBtn'] } }],
  ['js/figure.js', { note: 'part', hidden: ['figure'], url: '#figure' }],
  ['js/loomis.js', { note: 'part', hidden: ['loomis'], url: '#loomis', menus: { tabLearnBtn: ['tabStudyBtn', 'tabPoseBtn', 'tabHelpBtn'] } }],
  ['js/battle.js', { note: 'part', hidden: ['battle'], url: '#battle', gamesSub: 'Paint by numbers', menus: { tabGamesBtn: ['tabGameBtn'] } }],
];
// two or more at once
const PAIRS = [
  [['js/game.js', 'js/battle.js'], { note: 'part', hidden: ['battle', 'game'], groups: ['games'], url: '#battle' }],
  [['js/painting.js', 'js/subjects.js'], { note: 'part', hidden: ['figure', 'game', 'loomis', 'paint'], gamesSub: 'Value battle', url: '#figure', fromStudio: true }],
  [['js/loomis.js', 'js/battle.js'], { note: 'part', hidden: ['battle', 'loomis'], url: '#loomis', menus: { tabLearnBtn: ['tabStudyBtn', 'tabPoseBtn', 'tabHelpBtn'], tabGamesBtn: ['tabGameBtn'] } }],
  [['js/palette.js', 'js/figure.js'], { note: 'part', hidden: ['figure'], paints: true, url: '#figure' }],
  [['js/palette.js', 'js/subjects.js', 'js/game.js', 'js/painting.js', 'js/figure.js', 'js/loomis.js', 'js/battle.js'], { note: 'part', hidden: ['battle', 'figure', 'game', 'loomis', 'paint'], groups: ['games'], paints: true, url: '#paint', fromStudio: true, menus: { tabLearnBtn: ['tabStudyBtn', 'tabPoseBtn', 'tabHelpBtn'] } }],
];
const shortName = (f) => f.replace(/^js\//, '').replace(/\.js$/, '');
const readSite = (site, f) => fs.readFileSync(path.join(site.root, f), 'utf8');
// the guard's TAB_OF, read out of its source, and the scripts index.html loads
function guardRules(site) {
  const m = /var TAB_OF = \{([^}]*)\}/.exec(readSite(site, 'js/guard.js'));
  return { tabOf: m ? Object.fromEntries([...m[1].matchAll(/(\w+):\s*'([a-z]*)'/g)].map((x) => [x[1], x[2]])) : null, loaded: [...readSite(site, 'index.html').matchAll(/<script src="js\/([a-z-]+)\.js"><\/script>/g)].map((x) => x[1]) };
}

// what the page shows against what the rules say (want: note, hidden, groups, gamesSub, learnSub, fromStudio)
async function checkState(t, label, page, want) {
  const s = await notesOf(page);
  const noteOk = want.note === 'nojs' ? s.nojs === 'block' && s.part === 'none' && s.old === 'none' : want.note === 'part' ? s.part === 'block' && s.nojs === 'none' && s.old === 'none' : s.part === 'none' && s.nojs === 'none' && s.old === 'none';
  t.check(noteOk, `${label}: the right note (${want.note})`, s);
  if (want.note === 'nojs') {
    t.check(s.tabs === 'none' && s.actions === 'none' && s.help === 'block' && s.study === 'none' && s.steps === 'none' && !s.forgetShown, `${label}: only the guide shows (the Study panel is off), no tabs, no switch, no Try buttons, no Forget row (it needs the app)`, s);
    return s;
  }
  const hidden = want.hidden || [], groups = want.groups || [];
  t.check(s.hidden.join() === hidden.join() && s.groups.join() === groups.join(), `${label}: menu items off ${JSON.stringify(hidden)}${groups.length ? ', groups off ' + groups : ''}`, { hidden: s.hidden, groups: s.groups });
  t.check(s.shown.join() === 'tab-study', `${label}: the page shows one panel, Study${want.url ? ', in place of its own route ' + want.url : ''}`, s.shown);
  t.check(s.goHidden.join() === (hidden.includes('paint') ? 'paint' : ''), `${label}: the guide's "Go to Studio" is off exactly when the Studio is`, s.goHidden);
  if (!groups.includes('learn')) t.check(s.learnSub === (want.learnSub || 'Study the photo'), `${label}: the Learning tools button names ${want.learnSub || 'Study the photo'}`, s.learnSub);
  if (!groups.includes('games')) t.check(s.gamesSub === (want.gamesSub || 'Paint by numbers'), `${label}: the Games button names ${want.gamesSub || 'Paint by numbers'}`, s.gamesSub);
  t.check(s.fromStudio === !!want.fromStudio, `${label}: Use my Studio painting ${want.fromStudio ? 'goes with the Studio' : 'stays'}`, s.fromStudio);
  // palette.js plans the paints (the guard's rule for it is "palette", a part of the Study tab and no tab): without it
  // the Paints to use block and the block study's Palette switch go, and the drawer's header still says what it is set to
  t.check(s.paintsOff === !!want.paints && s.blockViewOff === !!want.paints, `${label}: the Paints to use block and the Palette switch ${want.paints ? 'go with palette.js' : 'stay'}`, { paintsOff: s.paintsOff, blockViewOff: s.blockViewOff });
  t.check(want.paints ? /^\d per value$/.test(s.colorsState) : s.colorsState !== '', `${label}: the Colors and paints drawer ${want.paints ? 'says "N per value"' : 'says what it is set to'}`, s.colorsState);
  return s;
}
// every tab a visitor can still reach opens; one the guard took off stays off (its click lands on Study). Pose and
// Figure start frames that cost seconds: they are clicked only when they are meant to be off, or when asked for
async function clickTabs(t, label, page, want, { pose = false } = {}) {
  const hidden = want.hidden || [], out = {};
  for (const name of TABS) {
    if ((name === 'pose' && !pose) || (name === 'figure' && !hidden.includes('figure'))) { out[name] = 'not clicked'; continue; }
    await click(page, `[data-tab="${name}"]`); await sleep(150);
    out[name] = (await shownPanels(page)).join();
  }
  t.check(TABS.every((n) => out[n] === 'not clicked' || out[n] === (hidden.includes(n) ? 'tab-study' : 'tab-' + n)), `${label}: every remaining tab opens, the missing ones stay off`, out);
  const items = await page.evaluate(() => [...document.querySelectorAll('[data-tab]')].map((e) => `${e.dataset.tab}:${e.hidden ? 'off' : 'on'}`).join(' '));
  t.check(TABS.every((n) => items.includes(`${n}:${hidden.includes(n) ? 'off' : 'on'}`)), `${label}: after the clicks the menu items are as they were`, items);
}
// the keys walk a menu: only the items left, and round again
async function walkMenu(t, label, page, btn, ids) {
  await page.evaluate((id) => document.getElementById(id).focus(), btn);
  await page.keyboard.press('ArrowDown');
  const seen = [await active(page)];
  for (let i = 0; i < ids.length; i++) { await page.keyboard.press('ArrowDown'); seen.push(await active(page)); }
  await page.keyboard.press('Escape');
  t.check(seen.join() === ids.concat(ids[0]).join(), `${label}: ArrowDown walks ${btn}'s menu through the items left only (${ids.join(', ')}) and round again`, seen);
}

function groupD(t, site) {
  // the table, read against the guard's rules and index.html
  step(t, 'guard rules and the scripts', async () => {
    const { tabOf, loaded } = guardRules(site);
    t.check(tabOf && Object.keys(tabOf).length >= 8 && loaded.length >= 12, 'js/guard.js\'s TAB_OF and index.html\'s script list can be read', { tabOf, loaded });
    if (!tabOf) return;
    const table = BLOCKED.map(([f]) => shortName(f));
    t.check(loaded.every((s) => table.includes(s)), 'every script index.html loads is blocked in this case (a new script needs a row)', loaded.filter((s) => !table.includes(s)));
    t.check(loaded.filter((s) => !['guard', 'processing', 'mixing', 'paints'].includes(s)).every((s) => Object.prototype.hasOwnProperty.call(tabOf, s)), 'every module script has a rule in TAB_OF (a script with none is read as the app not starting)', loaded.filter((s) => !Object.prototype.hasOwnProperty.call(tabOf, s)));
    for (const [f, want] of BLOCKED) {
      const rule = Object.prototype.hasOwnProperty.call(tabOf, shortName(f)) ? tabOf[shortName(f)] : undefined;
      if (rule === 'all') t.check(want.note === 'nojs', `${f}: TAB_OF says "all", the table expects the standing note and the guide alone`);
      else if (rule === '') t.check(want.note === 'part' && want.hidden.length === 0, `${f}: TAB_OF says no tab, the table expects the part note and nothing taken off`);
      else if (rule === 'palette') t.check(want.note === 'part' && want.paints === true && want.hidden.length === 0, `${f}: TAB_OF says palette, the table takes the paints part off and no tab`);
      else if (rule) t.check(want.note === 'part' && want.hidden.includes(rule), `${f}: TAB_OF says ${rule}, the table takes that tab off`);
    }
  });

  // every script blocked one at a time
  for (const [file, want] of BLOCKED) {
    step(t, `${file} blocked`, async () => {
      const label = `${file} blocked`;
      const page = await openPage(site, { block: [site.base + file], url: want.url || '' });
      await frames(page);
      await checkState(t, label, page, want);
      if (want.note !== 'nojs') {
        if (want.heavy) { const out = await tour(page, { heavy: true, timeout: 40000 }); t.check(tourOk(out), `${label}: every tab opens (Pose and Figure up)`, out); }
        else await clickTabs(t, label, page, want);
        for (const [btn, ids] of Object.entries(want.menus || {})) await walkMenu(t, label, page, btn, ids);
      }
      t.check(page.log.pageerrors.length === 0, `${label}: no page error`, page.log.pageerrors);
      await page.context().close();
    });
  }

  // the same scripts, found but throwing on their first line: the guard hears an error from a script it knows and
  // takes that part off, as when it is missing (js/guard.js: the error handler's booting branch)
  for (const [file, want] of BLOCKED.filter(([f]) => !/guard|processing|paints/.test(f))) {
    step(t, `${file} throws`, async () => {
      const label = `${file} throwing at its first line`, boom = `${shortName(file)} was made to throw`;
      const page = await openPage(site, { url: want.url || '' });
      await page.route(site.base + file, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `throw new Error('${boom}');` }));
      await page.reload({ waitUntil: 'load' }); await frames(page);
      await checkState(t, label, page, want);
      if (want.note !== 'nojs') {
        await clickTabs(t, label, page, want);
        for (const [btn, ids] of Object.entries(want.menus || {})) await walkMenu(t, label, page, btn, ids);
      }
      t.check(page.log.pageerrors.length === 1 && page.log.pageerrors[0].includes(boom), `${label}: the one page error is the one provoked`, page.log.pageerrors);
      t.check(page.log.offsite.length === 0 && (await violations(page)).length === 0, `${label}: no request off the site, no policy violation`, { offsite: page.log.offsite, csp: await violations(page) });
      await page.context().close();
    });
  }

  // two or more at once
  for (const [files, want] of PAIRS) {
    step(t, `${files.map(shortName).join(' + ')} blocked`, async () => {
      const label = `${files.map(shortName).join(' + ')} blocked`;
      const page = await openPage(site, { block: files.map((f) => site.base + f), url: want.url || '' });
      await frames(page);
      await checkState(t, label, page, want);
      await clickTabs(t, label, page, want);
      for (const [btn, ids] of Object.entries(want.menus || {})) await walkMenu(t, label, page, btn, ids);
      t.check(page.log.pageerrors.length === 0, `${label}: no page error`, page.log.pageerrors);
      await page.context().close();
    });
  }
  step(t, 'the guard and a script it needs blocked', async () => {
    let page = await openPage(site, { block: [site.base + 'js/guard.js', site.base + 'js/processing.js'] });
    await frames(page);
    let s = await notesOf(page);
    await click(page, '#tabPaintBtn'); await sleep(300);
    const dead = { ...s, afterClick: await shownPanels(page) };
    const guided = s.nojs === 'block' || s.part === 'block';
    t.check(guided, 'guard.js and processing.js blocked: the page still says it has not started', dead);
    if (!guided) t.finding({ title: 'With guard.js missing and a script app.js depends on missing, the page shows its full set of controls with no note, and none of them works', severity: 'medium', steps: 'Serve the site without js/guard.js and js/processing.js (a partial deploy; the README notes guard.js is a runtime file). Open the page. Press Studio, or any section.', expected: 'The no-js fallback: the "has not started" note over the guide and no controls (the page starts with class="no-js" for exactly this).', actual: `Class no-js is removed, no note shows, the four section buttons and the switch are there and nothing happens on a press (after Studio: ${dead.afterClick.join()}).`, cause: 'js/app.js: removes no-js and, when Study, Mixing or Paints is missing and there is no guard, returns in silence.' });
    t.check(page.log.pageerrors.length === 0, 'guard.js and processing.js blocked: no page error', page.log.pageerrors);
    await page.context().close();
    page = await openPage(site, { block: [site.base + 'js/guard.js', site.base + 'js/app.js'] });
    await frames(page);
    s = await notesOf(page);
    t.check(/no-js/.test(s.cls) && s.nojs === 'block' && s.tabs === 'none' && s.help === 'block', 'guard.js and app.js blocked: the no-js fallback shows the guide and the note', s);
    await page.context().close();
  });

  // the Palette part of the page, with palette.js missing: TAB_OF gives it no tab, so the guard takes nothing off
  step(t, 'palette.js blocked: what is left of the paints part', async () => {
    const page = await openPage(site, { block: [site.base + 'js/palette.js'], storage: { [PVS('mode')]: 'advanced' } });
    await frames(page);
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; });
    const sig = () => page.evaluate(() => { const c = document.getElementById('cv-block'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });
    await page.waitForFunction(() => document.getElementById('cv-block').width > 0, null, { timeout: 15000 }).catch(() => null);
    await sleep(800);
    const seen = await page.evaluate(() => {
      const shown = (e) => !!e && !e.hidden && e.getClientRects().length > 0;
      const palette = document.getElementById('blockViewPalette'), mine = document.getElementById('srcMine');
      return { paletteButton: shown(palette) && !palette.disabled, radios: shown(mine) && !mine.disabled, list: document.getElementById('presetList').children.length, listShown: shown(document.getElementById('presetPane')), state: document.getElementById('colorsState').textContent, title: palette.title };
    });
    const before = await sig();
    if (seen.paletteButton) await page.locator('#blockViewPalette').click();
    if (seen.radios) await page.locator('label[for="srcMine"]').click();
    await sleep(1500);
    const after = await page.evaluate(() => ({ pressed: document.getElementById('blockViewPalette').getAttribute('aria-pressed'), label: document.getElementById('cv-block').getAttribute('aria-label'), mineHidden: document.getElementById('minePane').hidden, presetHidden: document.getElementById('presetPane').hidden, checked: (document.querySelector('input[name="paintSource"]:checked') || {}).id }));
    const changed = (await sig()) !== before;
    const dead = { paletteView: seen.paletteButton && after.pressed === 'true' && !changed && after.label === 'Color-block study', myPaints: seen.radios && after.checked === 'srcMine' && after.mineHidden, emptyList: seen.listShown && seen.list === 0 };
    t.check(!dead.paletteView && !dead.myPaints && !dead.emptyList, 'palette.js blocked: no control or list that needs it is left on the page (the Palette view, Known palettes / My paints, the empty list of palettes)', { dead, seen, after });
    t.check(seen.state !== '', 'palette.js blocked: the Colors and paints drawer still says what it is set to', { state: seen.state });
    if (dead.paletteView || dead.myPaints || dead.emptyList) t.finding({ title: 'With palette.js missing, the paints part stays on the page as controls that do nothing', severity: 'medium', steps: 'Block js/palette.js (a partial deploy or one failed request) and open the site with Advanced chosen. Under Big color shapes press Palette; open Colors and paints and choose My paints.', expected: 'The standing note says part of the app did not start and "only the parts that started are shown" (the note\'s own words, as for every other script): the Palette view button, the Known palettes and My paints choice and the empty list are taken off, as the guard does for a missing Studio, Figure, Loomis, game or battle.', actual: `The note shows and everything else stays: Palette becomes pressed and the picture does not change (its tooltip says "${seen.title}", which sends the visitor to a drawer whose list is empty); in the drawer "Best match first. Pick one to see how to mix each color." sits over ${seen.list} palettes, the summary line is empty, and choosing My paints ticks the radio while the pane stays closed (${JSON.stringify(after)}).`, cause: 'js/guard.js 159: TAB_OF has palette: "", so failed() takes no tab off and nothing else; js/app.js 346-363 (showBlocks) keeps the Palette button for a StudioPalette that is not there; index.html 148-196 has the Paints to use block with its radios without a hidden state for the part-failed case (styles.css has no .part-failed rule for it).' });
    await page.context().close();
  });

  // the frame's own scripts and three.js: the Pose page says it could not start, the app and Figure study say nothing wrong
  step(t, 'pose scripts blocked', async () => {
    for (const file of ['js/pose.js', 'js/pose-embed.js', 'js/vendor/three.min.js']) {
      const page = await openPage(site, { block: [site.base + file] });
      await tab(page, 'pose', { wait: false });
      await settle(page, 'pose', 15000);
      await sleep(1500);
      const f = poseFrame(page);
      const s = f ? await f.evaluate(() => ({ started: !!window.__poseStarted, fail: !document.getElementById('fail').hidden, rail: getComputedStyle(document.querySelector('.rail')).display, embed: document.documentElement.classList.contains('embed'), imgs: document.querySelectorAll('#poses button.has-img').length, mode: window.PoseAndLight ? PoseAndLight.mode() : null })).catch(() => null) : null;
      const shell = await notesOf(page);
      const height = await page.evaluate(() => document.getElementById('poseFrame').style.height);
      if (file !== 'js/pose-embed.js') t.check(s && !s.started && s.fail && s.rail === 'none' && shell.part === 'none' && shell.nojs === 'none', `${file} blocked: the Pose frame shows its failure panel without dead controls; the app shows no note of its own`, { s, app: shell.cls });
      else { t.check(s && s.started && s.imgs === 30 && shell.part === 'none' && shell.nojs === 'none', 'pose-embed.js blocked: the Pose page still runs inside the frame', { s, height }); t.note(`pose-embed.js blocked: the frame is not told it is embedded (its own header shows, its height stays the stylesheet's ${height || '900px default'} instead of following the page) and the app's Simple/Advanced is not followed (frame mode ${s && s.mode})`); }
      // Figure study draws its pictures in a frame of the same page: it must say so, not wait or hang
      await tab(page, 'figure', { wait: false });
      const fig = await page.waitForFunction(() => { const b = document.querySelectorAll('#tab-figure [data-pose-id]'); const n = document.getElementById('fig-libNote').textContent; return /could not be drawn/.test(n) ? 'note' : b.length === 30 && [...b].every((x) => { const i = x.querySelector('img'); return i && i.src.startsWith('blob:'); }) ? 'pictures' : null; }, null, { timeout: 40000 }).then((h) => h.jsonValue()).catch(() => 'neither in 40 s');
      const want = file === 'js/pose-embed.js' ? 'pictures' : 'note';
      t.check(fig === want, `${file} blocked: Figure study ${want === 'note' ? 'says the poses could not be drawn' : 'still gets its 30 pictures'}`, fig);
      if (want === 'note') t.check(await page.evaluate(() => document.getElementById('fig-start').disabled), `${file} blocked: Figure's Start is off with no poses to deal`);
      t.check(page.log.pageerrors.length === 0, `${file} blocked: no page error`, page.log.pageerrors);
      await page.context().close();
    }
  });

  // the stylesheet
  step(t, 'styles.css blocked', async () => {
    const page = await openPage(site, { block: [site.base + 'styles.css'] });
    await frames(page);
    const s = await notesOf(page);
    const texts = await page.evaluate(() => [...document.querySelectorAll('.oldbrowser-note, .partfail-note, .nojs-note')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.querySelector('strong').textContent));
    t.check(/load-failed/.test(s.cls) && s.nojs === 'block', 'styles.css blocked: the guard marks the load failed and the "has not started" note shows', s);
    const only = s.old === 'none' && s.part === 'none';
    t.check(only, 'styles.css blocked: the "too old" and "part did not start" notes stay hidden', texts);
    if (!only) t.finding({ title: 'With styles.css missing, the page shows all three standing notes, two of them wrong: "This browser is too old" and "Part of Portrait Value Studio did not start"', severity: 'medium', steps: 'Serve the site with styles.css blocked or missing (a partial deploy, a blocked request). Open the page.', expected: 'One note that fits: the stylesheet did not load, reload the page (the guard adds load-failed for this case).', actual: `The page is unstyled and reads: ${texts.map((x) => `"${x}"`).join(', ')}.`, cause: 'index.html 26-28: the three notes are plain divs hidden only by styles.css; js/guard.js syncNotes() is the one that should hide the two that do not apply.' });
    const out = await tour(page, { heavy: false, tabs: TABS.filter((n) => n !== 'figure') });
    t.check(TABS.filter((n) => n !== 'figure').every((n) => out[n] === 'tab-' + n), 'styles.css blocked: every tab still opens', out);
    t.check(page.log.pageerrors.length === 0, 'styles.css blocked: no page error', page.log.pageerrors);
    await page.context().close();
    // with a script missing as well: still the one note that says the page did not load, never two
    const both = await openPage(site, { block: [site.base + 'styles.css', site.base + 'js/game.js'] });
    await frames(both);
    const b = await notesOf(both);
    t.check(/load-failed/.test(b.cls) && /part-failed/.test(b.cls) && b.nojs === 'block' && b.part === 'none' && b.old === 'none', 'styles.css and game.js blocked: one note, the "has not started" one (the part note waits behind it)', b);
    t.check(both.log.pageerrors.length === 0, 'styles.css and game.js blocked: no page error', both.log.pageerrors);
    await both.context().close();
  });

  // the fonts: the files, the stylesheet that names them, and the files the page links but does not need
  step(t, 'fonts and icons blocked', async () => {
    for (const [label, block] of [['the font files', ['fonts/*']], ['fonts.css', ['fonts.css']], ['the manifest and the icons', ['manifest.json', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png']]]) {
      const page = await openPage(site, { block: block.map((b) => site.base + b) });
      await frames(page);
      const s = await page.evaluate(() => ({ status: document.fonts.status, loaded: [...document.fonts].filter((f) => f.status === 'loaded').length, font: getComputedStyle(document.querySelector('h1')).fontFamily }));
      const out = await tour(page, { heavy: false, tabs: TABS.filter((n) => n !== 'figure') });
      const shell = await notesOf(page);
      t.check(TABS.filter((n) => n !== 'figure').every((n) => out[n] === 'tab-' + n) && shell.nojs === 'none' && shell.part === 'none' && shell.old === 'none', `${label} blocked: every tab opens, no note (the typefaces fall back, the page does not need the rest)`, { ...s, out });
      if (label !== 'the manifest and the icons') t.check(s.loaded === 0, `${label} blocked: none of the three typefaces is in use`, s);
      // the browser logs each blocked request itself, and the guard says nothing more
      t.check(page.log.console.every((m) => /Failed to load resource/.test(m)), `${label} blocked: the console holds only the browser's own lines for the blocked requests`, page.log.console);
      dropLogged(page, /Failed to load resource/);
      await clean(t, page, `${label} blocked`);
      await page.context().close();
    }
  });

  // the guide's pictures: all thirty missing, at both widths
  step(t, 'guide pictures 404', async () => {
    for (const [label, viewport] of [['phone', PHONE], ['desktop', DESKTOP]]) {
      const page = await openPage(site, { viewport, notFound: [site.base + 'img/help/*'], url: '#help' });
      await page.evaluate(async () => { for (const i of document.querySelectorAll('#tab-help img')) { i.scrollIntoView(); await new Promise((r) => setTimeout(r, 30)); } });
      await page.waitForFunction(() => [...document.querySelectorAll('#tab-help img')].every((i) => i.complete), null, { timeout: 20000 }).catch(() => null);
      const s = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('#tab-help img')];
        return { n: imgs.length, loaded: imgs.filter((i) => i.naturalWidth > 0).length, noAlt: imgs.filter((i) => (i.alt || '').length <= 10).length, collapsed: imgs.filter((i) => { const r = i.getBoundingClientRect(); return r.width < 20 || r.height < 20; }).length, captions: [...document.querySelectorAll('#tab-help figcaption')].filter((c) => c.getClientRects().length).length, parts: document.querySelectorAll('#tab-help .help-part').length, steps: document.querySelectorAll('#tab-help .help-steps li').length };
      });
      t.check(s.n === 30 && s.loaded === 0 && s.noAlt === 0 && s.collapsed === 0, `${label}: all thirty guide pictures missing: each keeps its alt text and its frame`, s);
      t.check(s.captions >= 30 && s.parts >= 10 && s.steps === 4, `${label}: all thirty pictures missing: the guide's text and captions are all there`, s);
      t.check((await hscroll(page)) <= 0, `${label}: all thirty pictures missing: no horizontal scroll`, await hscroll(page));
      t.check((await notesOf(page)).nojs === 'none', `${label}: all thirty pictures missing: no note (a picture of a guide is not the app)`);
      t.check(page.log.console.every((m) => /status of 404/.test(m)), `${label}: all thirty pictures missing: the console holds only the browser's own 404 lines`, page.log.console.slice(0, 3));
      await screenshot(page, `app-shell-more-nopictures-${label}`);
      dropLogged(page, /status of 404/);
      await clean(t, page, `${label} guide pictures 404`);
      await page.context().close();
    }
  });

  // JavaScript off altogether: the page starts with class no-js, which shows the guide instead of dead controls
  step(t, 'JavaScript off', async () => {
    for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
      const context = await site.browser.newContext({ viewport, javaScriptEnabled: false });
      const page = await context.newPage();
      const log = { errors: [], offsite: [] };
      page.on('pageerror', (e) => log.errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
      page.on('request', (r) => { if (!r.url().startsWith(site.base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) log.offsite.push(r.url()); });
      await page.goto(site.base, { waitUntil: 'load' });
      const s = await page.evaluate(() => {
        const shown = (q) => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0; };
        return { cls: document.documentElement.className, note: shown('.nojs-note'), old: shown('.oldbrowser-note'), part: shown('.partfail-note'), tabs: shown('.tabs'), actions: shown('.topbar-actions'), rail: shown('.rail'), study: shown('#tab-study'), help: shown('#tab-help'), steps: shown('.help-steps .btn'), forget: shown('#forgetBtn'), toolstrip: shown('.toolstrip'), noteText: (document.querySelector('.nojs-note') || {}).textContent, hs: document.documentElement.scrollWidth - document.documentElement.clientWidth, h3: document.querySelectorAll('#tab-help h3').length };
      });
      t.check(/no-js/.test(s.cls) && s.note && !s.old && !s.part && !s.tabs && !s.actions && !s.rail && !s.study && s.help && !s.steps && !s.forget && !s.toolstrip, `${label}, JavaScript off: the "has not started" note and the guide, with no controls that would do nothing`, s);
      t.check(/JavaScript/.test(s.noteText || '') && /reload/i.test(s.noteText || ''), `${label}, JavaScript off: the note says to turn JavaScript on and reload`, s.noteText);
      t.check(s.hs <= 0 && s.h3 >= 10, `${label}, JavaScript off: the guide reads whole, no horizontal scroll`, { hs: s.hs, h3: s.h3 });
      t.check(log.errors.length === 0 && log.offsite.length === 0, `${label}, JavaScript off: no error, no request off the site`, log);
      await context.close();
    }
  });
}

// ---- E: axe on every tab at both widths -----------------------------------------------------------------------

// a Figure pose button before its picture has arrived: its name's contrast, read in the page as it stands
const placeholderContrast = (page) => app(page).waitForFunction(() => {
  const n = document.querySelector('#tab-figure .fig-pose:not(.has-img) .fig-pose-name');
  if (!n) return null;
  const rgb = (c) => (/rgba?\((\d+), (\d+), (\d+)/.exec(c) || []).slice(1, 4).map(Number);
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cs = getComputedStyle(n), fg = rgb(cs.color), bg = rgb(getComputedStyle(n.closest('.fig-pose')).backgroundColor);
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return { ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2), fg: fg.join(','), bg: bg.join(','), size: cs.fontSize, weight: cs.fontWeight, withPicture: document.querySelectorAll('#tab-figure .fig-pose.has-img').length, total: document.querySelectorAll('#tab-figure .fig-pose').length, at: Date.now() };
}, null, { timeout: 40000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);

function groupE(t, site) {
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    step(t, `axe ${label}`, async () => {
      const serious = [], minor = new Set(), skipped = [];
      const take = async (page, what, opts) => {
        for (const x of await axe(page, opts)) {
          if (x.impact === 'critical' || x.impact === 'serious') serious.push(`${label} ${what}: ${x.id} (${x.impact}) ${x.help} ×${x.count} e.g. ${x.nodes[0]}`);
          else minor.add(`${x.id} (${x.impact}) ${x.help} e.g. ${x.nodes[0]}`);
        }
      };
      const page = await openPage(site, { viewport, bypassCSP: true });
      let placeholder = null, settledAt = 0;
      for (const name of TABS) {
        await tab(page, name, { wait: false });
        if (name === 'figure' && label === 'phone') placeholder = await placeholderContrast(page);
        if ((name === 'pose' || name === 'figure') && !(await settle(page, name, 60000))) { skipped.push(name); continue; }
        if (name === 'figure') settledAt = Date.now();
        await take(page, name);
        if (name === 'pose' && poseFrame(page)) await take(page, 'pose frame', { frame: poseFrame(page) });
      }
      // Advanced shows every setting: the Study tab with every drawer open, and the Pose frame with its rig controls
      await page.locator('[data-mode="advanced"]').click();
      await tab(page, 'study', { wait: false });
      await page.evaluate(() => document.querySelectorAll('.drawer').forEach((d) => { d.open = true; }));
      await sleep(400);
      await take(page, 'study (Advanced, every drawer open)');
      await tab(page, 'pose', { wait: false });
      const f = poseFrame(page);
      if (f) { await f.waitForFunction(() => window.PoseAndLight && PoseAndLight.mode() === 'advanced', null, { timeout: 10000 }).catch(() => null); await take(page, 'pose frame (Advanced)', { frame: f }); }
      await tab(page, 'help', { wait: false });
      await take(page, 'help (Advanced)');
      // both menus open
      await click(page, '#tabLearnBtn'); await take(page, 'Learning tools menu open');
      await click(page, '#tabGamesBtn'); await take(page, 'Games menu open');
      await page.keyboard.press('Escape');
      t.check(serious.length === 0, `axe ${label}: no serious or critical issue on any tab (Simple and Advanced), the Pose frame, or with a menu open`, serious);
      const strips = serious.filter((s) => /scrollable-region-focusable/.test(s) && /help/.test(s));
      if (strips.length) t.finding({ title: 'At phone width the guide\'s screenshot strips scroll sideways but cannot be reached or scrolled from the keyboard', severity: 'medium', steps: 'Open the site on a 390 × 844 window, open How to use, Tab through the page: the strips of phone screenshots are skipped, and the arrow keys cannot scroll them. Or run axe-core on the tab.', expected: 'A keyboard user can reach each strip and scroll it.', actual: `axe reports scrollable-region-focusable (serious): ${strips[0]}`, cause: 'styles.css .help-shots overflow-x: auto below 760 px without a tabindex on the element.' });
      if (skipped.length) t.note(`axe ${label}: ${skipped.join(' and ')} did not finish drawing within 60 s on this machine, so it was not read`);
      for (const m of minor) t.note(`axe ${label} (not serious): ${m}`);
      // the pose names before their pictures arrive
      if (placeholder) {
        const lasted = settledAt ? Math.max(0, Math.round((settledAt - placeholder.at) / 1000)) : null;
        t.check(placeholder.ratio >= 4.5, 'Figure study: a pose\'s name over its grey placeholder, before its picture arrives, reads at 4.5 : 1 or better', placeholder);
        if (placeholder.ratio < 4.5) t.finding({ title: 'Figure study\'s pose names are white on mid grey at 3.3 : 1 until each picture is drawn', severity: 'low', steps: 'Open Figure study (at any width) on a fresh visit and look at the pose buttons while the pictures are still being drawn one by one, or run axe-core (color-contrast) at that moment. They stay so when a picture cannot be drawn.', expected: 'A name that can be read: 4.5 : 1 for text this small (10.9 px, semi-bold).', actual: `${placeholder.total - placeholder.withPicture} of ${placeholder.total} buttons had no picture when read; their name is rgb(${placeholder.fg}) on rgb(${placeholder.bg}) at ${placeholder.size}, ${placeholder.ratio} : 1 (axe: color-contrast, serious, ×3 or more while it lasts; here the placeholders lasted about ${lasted === null ? 'the first seconds' : lasted + ' s'}).`, cause: 'styles.css 1504 and 1508: .fig-pose has background #8d8e8e and color #fff; .fig-pose:not(.has-img) .fig-pose-name drops the dark gradient (background: none) that gives the name its contrast once the picture is there (1507).' });
      } else t.note('axe phone: no Figure placeholder was seen before its picture (the list arrived with its pictures, or not within 40 s), so its contrast was not read');
      await clean(t, page, `axe ${label}`);
      await page.context().close();
      // the 404 page
      const nf = await openPage(site, { url: 'no-such-page', viewport, bypassCSP: true });
      await take(nf, '404 page');
      t.check(serious.length === 0, `axe ${label}: no serious or critical issue on the 404 page either`, serious);
      await nf.context().close();
    });
  }
}
