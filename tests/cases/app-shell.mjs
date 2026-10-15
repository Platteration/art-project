// The app shell and everything cross-cutting: the tab menus by keyboard, the focus order, the Help tab's
// jump buttons and screenshots, Simple and Advanced across reloads and the Pose frame, dark mode and
// reduced motion on every tab, live resizes between 390 and 1400 on every tab, hash routing (back and
// forward), the old-browser note, JavaScript off, a script that arrives and throws while the page starts,
// storage blocked outright, saved state of hostile shape for every key the shell reads, the guard's reset
// offer (and its button once the note has gone), Forget during a game, a Figure class and a pending Studio
// save, the sandboxed embed, the 404 page, the toast's lifetime, a tab left in the middle of a stroke.
// README: "Simple and Advanced", "How to use", "Settings", the guard parts of "Publishing"; source:
// js/app.js, js/guard.js, styles.css (.no-js/.old-browser/.load-failed/.part-failed/.all-failed), 404.html.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, clean, tab, TABS, DESKTOP, PHONE, poseFrame, stroke, inked, click, text, visible, hscroll, screenshot, sleep, makeImage, loadPhoto, pasteFile } from '../lib.mjs';

const SAVED_FAILED = 'Your saved settings or painting could not be read.';
const APP_FAILED = 'Something went wrong in the app. If a control stops responding, reload the page.';
const PVS = 'portrait-value-studio.';
const SIMPLE_PALETTES = ['Zorn', 'Three primaries', 'Rembrandt (earths)'];

// the shown panel, the menus' state and where the focus is
const shell = (page) => page.evaluate(() => ({
  shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id),
  learnOpen: !document.getElementById('tabLearnMenu').hidden, learnExpanded: document.getElementById('tabLearnBtn').getAttribute('aria-expanded'),
  gamesOpen: !document.getElementById('tabGamesMenu').hidden, gamesExpanded: document.getElementById('tabGamesBtn').getAttribute('aria-expanded'),
  active: document.activeElement && (document.activeElement.id || document.activeElement.tagName.toLowerCase()),
  current: [...document.querySelectorAll('.tab[aria-current="true"]')].map((b) => b.id),
  checked: [...document.querySelectorAll('.tab-item[aria-checked="true"]')].map((b) => b.dataset.tab),
  learnSub: document.getElementById('tabLearnSub').textContent, gamesSub: document.getElementById('tabGamesSub').textContent,
  simple: document.body.classList.contains('mode-simple'),
  body: [...document.body.classList].filter((c) => c.startsWith('tab-')).join(),
  hash: location.hash,
}));
const toastState = (page) => page.evaluate(() => { const t = document.getElementById('toast'); const b = t.querySelector('button'); return { text: t.textContent, show: t.classList.contains('show'), button: b ? b.textContent : null, disabled: b ? b.disabled : null }; });
const waitShown = (page, id, timeout = 3000) => page.waitForFunction((id) => { const p = document.getElementById(id); return p && !p.hidden; }, id, { timeout }).catch(() => null);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const atWidth = async (page, width, height = 900) => { await page.setViewportSize({ width, height }); await page.waitForFunction((w) => window.innerWidth === w, width, { timeout: 3000 }).catch(() => null); await settle(page); };
// a console line or page error the test caused on purpose (a StudioGuard.report() it made, a script it broke)
// is the test's, not the page's
const dropOwn = (page, re) => { page.log.console = page.log.console.filter((m) => !re.test(m)); };
const dropErrors = (page, re) => { page.log.pageerrors = page.log.pageerrors.filter((m) => !re.test(m)); dropOwn(page, re); };
const navigate = (page, fn) => Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => null), fn()]);
// resolves true when the promise settles within ms, false when it does not (a page whose main thread is stuck)
const within = (p, ms) => Promise.race([p.then(() => true, () => true), sleep(ms).then(() => false)]);
const dbRecord = (fr) => fr.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('portrait-value-studio'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); if (!db) return 'no db'; let v = 'no store'; try { v = await new Promise((res) => { const tx = db.transaction('studio'); const g = tx.objectStore('studio').get('painting'); g.onsuccess = () => res(g.result ? 'record' : 'none'); g.onerror = () => res('error'); }); } catch (e) { /* no store */ } db.close(); return v; });
const siteKeys = (fr) => fr.evaluate(() => Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)));
// the last control a Tab reaches before the element with this id, focused (so the next Tab is the one after it)
const focusLastBefore = (page, id) => page.evaluate((id) => {
  const target = document.getElementById(id);
  const all = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')].filter((e) => (e.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) && !target.contains(e) && e.tabIndex >= 0 && !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const last = all[all.length - 1]; if (!last) return null; last.focus(); return last.id || last.textContent.trim().slice(0, 30);
}, id);
const activeIs = (page) => page.evaluate(() => { const e = document.activeElement; return { cls: e.className, text: e.textContent.trim().slice(0, 40), id: e.id }; });
// what a fallback page shows: the notes, the controls that should have stepped aside, the guide
const fallback = (page) => page.evaluate(() => {
  const d = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : null; };
  return {
    cls: document.documentElement.className.trim(), nojs: d('.nojs-note'), old: d('.oldbrowser-note'), part: d('.partfail-note'),
    tabs: d('.tabs'), actions: d('.topbar-actions'), rail: d('.rail'), study: d('#tab-study'), help: d('#tab-help'), steps: d('.help-steps .btn'),
    toolstrip: d('.toolstrip'), tools: [...document.querySelectorAll('.toolstrip button')].filter((b) => b.getClientRects().length).map((b) => b.id || b.textContent.trim()),
    forget: d('#forgetBtn'),
  };
});
// a page of our own (for JavaScript off), recorded the way openPage records one
async function barePage(site, { viewport = DESKTOP, javaScriptEnabled = true } = {}) {
  const context = await site.browser.newContext({ viewport, javaScriptEnabled });
  const page = await context.newPage();
  const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  page.log = log;
  page.on('pageerror', (e) => log.pageerrors.push(String(e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') log.console.push(m.text().slice(0, 300)); });
  page.on('request', (r) => { if (!r.url().startsWith(site.base) && !r.url().startsWith('data:')) log.offsite.push(r.url()); });
  page.on('requestfailed', (r) => { const why = (r.failure() || {}).errorText || ''; if (why !== 'net::ERR_ABORTED') log.failed.push(r.url() + ' ' + why); });
  return page;
}

export default async function appShell(t, site) {
  // ---- the tab menus by keyboard, and the mouse edges of the same menus ----------------------------
  for (const round of [1, 2]) {
    const page = await openPage(site);
    await page.focus('#tabLearnBtn');
    await page.keyboard.press('ArrowDown');
    let s = await shell(page);
    t.check(s.learnOpen && s.learnExpanded === 'true' && s.active === 'tabStudyBtn', `menus ${round}: ArrowDown on Learning tools opens it with the open page focused`, s);
    await page.keyboard.press('ArrowDown'); s = await shell(page);
    t.check(s.active === 'tabLoomisBtn', `menus ${round}: ArrowDown moves to the next item`, s.active);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); s = await shell(page);
    t.check(s.active === 'tabStudyBtn', `menus ${round}: ArrowDown wraps from the last item to the first`, s.active);
    await page.keyboard.press('ArrowUp'); s = await shell(page);
    t.check(s.active === 'tabHelpBtn', `menus ${round}: ArrowUp wraps from the first item to the last`, s.active);
    await page.keyboard.press('Escape'); s = await shell(page);
    t.check(!s.learnOpen && s.learnExpanded === 'false' && s.active === 'tabLearnBtn', `menus ${round}: Escape closes the menu and puts the focus back on its button`, s);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await waitShown(page, 'tab-loomis'); s = await shell(page);
    t.check(s.shown.join() === 'tab-loomis' && !s.learnOpen && s.active === 'tabLearnBtn' && s.checked.join() === 'loomis' && s.learnSub === 'Loomis head' && s.current.join() === 'tabLearnBtn', `menus ${round}: Enter picks Loomis head: panel, aria-checked, subtitle, aria-current, focus on the button`, s);
    // the Games menu: nothing checked yet, so the first item takes the focus
    await page.focus('#tabGamesBtn'); await page.keyboard.press('ArrowDown'); s = await shell(page);
    t.check(s.gamesOpen && !s.learnOpen && s.active === 'tabGameBtn', `menus ${round}: ArrowDown on Games opens it on its first item`, s);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await waitShown(page, 'tab-battle'); s = await shell(page);
    t.check(s.shown.join() === 'tab-battle' && s.gamesSub === 'Value battle' && s.current.join() === 'tabGamesBtn' && s.checked.join() === 'battle' && s.active === 'tabGamesBtn', `menus ${round}: Enter picks Value battle and the Games button names it`, s);
    // Space on the button opens it too; a second press closes it (a toggle), with the states in step
    await page.keyboard.press('Space'); s = await shell(page);
    t.check(s.gamesOpen && s.gamesExpanded === 'true' && s.active === 'tabBattleBtn', `menus ${round}: Space on the button opens the menu on the open page`, s);
    await page.focus('#tabGamesBtn'); await page.keyboard.press('Space'); s = await shell(page);
    t.check(!s.gamesOpen && s.gamesExpanded === 'false', `menus ${round}: a second press closes it, aria-expanded in step`, s);
    // edge: back on the button of the open menu (ArrowUp to its first item, then Shift+Tab), then ArrowDown again
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+Tab'); s = await shell(page);
    const backOnButton = s.active === 'tabGamesBtn' && s.gamesOpen;
    t.check(backOnButton, `menus ${round}: Shift+Tab from the first item goes back to the button, the menu still open`, s);
    await page.keyboard.press('ArrowDown'); const s2 = await shell(page);
    const stays = s2.gamesOpen && s2.gamesExpanded === 'true' && (s2.active === 'tabGameBtn' || s2.active === 'tabBattleBtn');
    t.check(stays, `menus ${round}: ArrowDown on the button of an open menu moves into it rather than closing it`, s2);
    if (backOnButton && !stays && round === 2) t.finding({ title: 'ArrowDown on the button of an already open tab menu closes the menu instead of moving into it', severity: 'low', steps: 'Focus Games and press ArrowDown (the menu opens on an item). Press ArrowUp to reach Paint by numbers, then Shift+Tab: the focus is back on the Games button and the menu is still open. Press ArrowDown.', expected: 'The focus moves into the open menu, as the first ArrowDown did (ARIA menu button: Down Arrow opens the menu and moves the focus to an item).', actual: `The menu closes and the focus stays on the button: js/app.js:2243 answers ArrowDown with btn.click(), and the click handler (2238-2242) toggles, so on an open menu it shuts it. State after: ${JSON.stringify({ gamesOpen: s2.gamesOpen, expanded: s2.gamesExpanded, active: s2.active })}`, cause: 'js/app.js:2243 (ArrowDown = btn.click()) with the toggle at 2238-2242' });
    // edge: Tab out of the open menu: the menu should not stay open behind the focus
    await page.evaluate(() => document.querySelectorAll('.tab-menu').forEach((m) => { m.hidden = true; }));
    await page.focus('#tabLearnBtn'); await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    s = await shell(page);
    const left = s.active !== 'tabStudyBtn' && s.active !== 'tabLoomisBtn' && s.active !== 'tabPoseBtn' && s.active !== 'tabHelpBtn';
    t.check(left && !s.learnOpen, `menus ${round}: Tab out of the Learning menu closes it`, s);
    if (left && s.learnOpen && round === 2) t.finding({ title: 'Tab out of an open tab menu leaves the menu open behind the focus', severity: 'low', steps: 'Focus Learning tools, press ArrowDown (the menu opens), press Tab four times: the focus leaves the menu for the Studio button.', expected: 'The menu closes when the focus leaves it (a keyboard visitor otherwise has an open menu covering the page with nothing to close it but Escape).', actual: `The menu stays open with aria-expanded="true"; nothing closes it on focusout (js/app.js:2236-2249 handle only ArrowDown, ArrowUp and Escape; the pointerdown at 2250 is for the mouse). Focus on ${s.active}`, cause: 'js/app.js:2236-2250: no focusout handler on the menu' });
    await page.keyboard.press('Escape');
    // mouse: a double click toggles open then closed; a click outside closes
    await page.click('#tabLearnBtn'); await page.click('#tabLearnBtn'); s = await shell(page);
    t.check(!s.learnOpen && s.learnExpanded === 'false', `menus ${round}: two clicks on the button open then close it`, s);
    await page.click('#tabLearnBtn'); s = await shell(page);
    t.check(s.learnOpen && s.active === 'tabStudyBtn', `menus ${round}: a click opens the menu on its first item when none of its pages is open`, s);
    await page.mouse.click(700, 600); s = await shell(page);
    t.check(!s.learnOpen, `menus ${round}: a click outside closes the menu`, s);
    // opening one menu closes the other
    await page.click('#tabLearnBtn'); await page.click('#tabGamesBtn'); s = await shell(page);
    t.check(!s.learnOpen && s.gamesOpen, `menus ${round}: opening Games closes Learning tools`, s);
    await page.keyboard.press('Escape');
    await clean(t, page, `menus ${round}`);
    await page.context().close();
  }

  // ---- focus order through the top bar and into a tab, and the mode switch by keyboard ----------
  {
    const page = await openPage(site);
    const order = [];
    for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const e = document.activeElement; return e.id || e.dataset.mode || (e.tagName.toLowerCase() + (e.parentElement && e.parentElement.id ? '@' + e.parentElement.id : '')); })); }
    t.check(order.slice(0, 7).join() === 'simple,advanced,file,tabLearnBtn,tabPaintBtn,tabFigureBtn,tabGamesBtn', 'focus order: Simple, Advanced, Load photo, then the four section buttons in order', order);
    t.check(order[7] === 'summary@drawer-values', 'focus order: after the sections, the first drawer of the rail', order);
    // nothing in a hidden panel ever takes the focus, and every stop is visible
    const invisible = [];
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); const e = await page.evaluate(() => { const e = document.activeElement; return e && e !== document.body && e.id !== 'file' && (e.getClientRects().length === 0 || e.closest('[hidden]')) ? (e.id || e.tagName) : null; }); if (e) invisible.push(e); }
    t.check(invisible.length === 0, 'focus order: no stop on an invisible control in forty Tabs through the Study tab', invisible);
    // Enter on Advanced switches the mode; Space on Simple switches back
    await page.focus('[data-mode="advanced"]'); await page.keyboard.press('Enter');
    let s = await shell(page);
    t.check(!s.simple && (await page.evaluate(() => document.querySelector('[data-mode="advanced"]').getAttribute('aria-pressed'))) === 'true', 'keyboard: Enter on Advanced switches the mode', s);
    await page.focus('[data-mode="simple"]'); await page.keyboard.press('Space'); s = await shell(page);
    t.check(s.simple, 'keyboard: Space on Simple switches back', s);
    // on the Help tab the focus goes from the sections into the guide, never into a hidden panel
    await tab(page, 'help');
    await page.focus('#tabGamesBtn'); await page.keyboard.press('Tab');
    const next = await page.evaluate(() => { const e = document.activeElement; return { id: e.id || e.textContent.trim().slice(0, 30), inHelp: !!e.closest('#tab-help'), visible: e.getClientRects().length > 0 }; });
    t.check(next.visible && (next.inHelp || next.id), 'focus order: from the last section button the focus lands on a visible control', next);
    await clean(t, page, 'focus order');
    await page.context().close();
  }

  // ---- the Help tab: the four-step path, its buttons, every part, every screenshot ---------------
  {
    const page = await openPage(site, { url: '#help' });
    const help = await page.evaluate(() => ({
      steps: document.querySelectorAll('.help-steps > li').length,
      goes: [...document.querySelectorAll('.help-steps [data-go]')].map((b) => b.dataset.go),
      parts: [...document.querySelectorAll('#tab-help .help-part')].map((p) => ({ id: p.id, h3: !!p.querySelector('h3'), shots: p.querySelectorAll('figure.phone img').length })),
      forgetInTips: !!document.querySelector('#help-tips #forgetBtn'),
      tips: document.getElementById('help-tips').textContent.replace(/\s+/g, ' '),
    }));
    t.check(help.steps === 4 && help.goes.join() === 'study,paint,check', 'help: four steps with buttons to Study, Studio and Check a painting', help.goes);
    t.note('help: step 2 (Look at the shapes) has no jump button; steps 1, 3 and 4 do. The README says "with buttons that jump to the part they describe".');
    const want = ['help-start', 'help-study', 'help-tools', 'help-loomis', 'help-pose', 'help-colors', 'help-studio', 'help-figure', 'help-check', 'help-game', 'help-battle', 'help-tips'];
    t.check(help.parts.map((p) => p.id).join() === want.join(), 'help: the twelve parts the README lists, in order', help.parts.map((p) => p.id));
    t.check(help.parts.every((p) => p.h3) && help.parts.every((p) => p.id === 'help-tips' || p.shots > 0) && help.forgetInTips, 'help: every part has a heading, every part but Good to know has a screenshot, Forget sits under Good to know', help.parts);
    // README: "a few things good to know (nothing is uploaded, the Studio autosaves, where Undo is)"
    t.check(/Nothing is uploaded/.test(help.tips) && /saves your painting as you go/.test(help.tips) && /Undo is everywhere/.test(help.tips), 'help: Good to know says nothing is uploaded, the Studio saves as you go, and where Undo is', help.tips.slice(0, 300));
    // every screenshot: width and height given, from img/help/, an alt, and it loads at the size it claims
    const shots = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('#tab-help img')];
      imgs.forEach((i) => { i.loading = 'eager'; });
      await Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 8000); }))));
      return imgs.map((i) => ({ src: i.getAttribute('src'), w: i.getAttribute('width'), h: i.getAttribute('height'), nw: i.naturalWidth, nh: i.naturalHeight, alt: (i.alt || '').length, shown: Math.round(i.getBoundingClientRect().width) }));
    });
    const bad = shots.filter((s) => !s.w || !s.h || !s.src.startsWith('img/help/') || !s.alt || s.nw !== +s.w || s.nh !== +s.h || s.nw === 0);
    t.check(shots.length >= 29 && bad.length === 0, `help: all ${shots.length} screenshots have width/height, an alt, come from img/help/ and load at the size they claim`, bad);
    t.check(fs.readdirSync(path.join(site.root, 'img', 'help')).filter((f) => f.endsWith('.jpg')).every((f) => shots.some((s) => s.src === 'img/help/' + f)), 'help: every file in img/help/ is shown by the guide', fs.readdirSync(path.join(site.root, 'img', 'help')));
    // README: "400 px wide, twice their display width": the first picture of each part, at the desktop width
    const firsts = await page.evaluate(() => [...document.querySelectorAll('#tab-help .help-part figure.phone')].filter((f, i, all) => all.findIndex((g) => g.closest('.help-part') === f.closest('.help-part')) === i).map((f) => ({ w: Math.round(f.querySelector('img').getBoundingClientRect().width), cap: !!(f.querySelector('figcaption') || {}).textContent })));
    t.check(firsts.length === 11 && firsts.every((f) => f.w >= 170 && f.w <= 220 && f.cap), 'help: each part\'s first screenshot shows at about half its 400 px (170 to 220 px), with a caption', firsts);
    // the jump buttons
    await click(page, '[data-go="paint"]'); await waitShown(page, 'tab-paint');
    let s = await shell(page);
    t.check(s.shown.join() === 'tab-paint' && s.current.join() === 'tabPaintBtn', 'help: Go to Studio opens the Studio', s);
    await tab(page, 'help'); await page.evaluate(() => window.scrollTo(0, 2000));
    await click(page, '[data-go="study"]'); await waitShown(page, 'tab-study'); s = await shell(page);
    t.check(s.shown.join() === 'tab-study' && (await page.evaluate(() => window.scrollY)) === 0, 'help: Go to Study the photo opens the Study tab at the top', { ...s, scrollY: await page.evaluate(() => window.scrollY) });
    await tab(page, 'help');
    await click(page, '[data-go="check"]'); await waitShown(page, 'tab-study'); await settle(page);
    const check = await page.evaluate(() => { const d = document.getElementById('drawer-check'); const r = d.getBoundingClientRect(); return { open: d.open, section: !document.getElementById('checkSection').hidden, top: Math.round(r.top), inView: r.top >= -2 && r.top < window.innerHeight }; });
    t.check((await shell(page)).shown.join() === 'tab-study' && check.open && check.section && check.inView, 'help: Check a painting opens the Study tab with the check drawer open and in view', check);
    // the same button again: still open, nothing toggles shut
    await tab(page, 'help'); await click(page, '[data-go="check"]'); await settle(page);
    t.check(await page.evaluate(() => document.getElementById('drawer-check').open && !document.getElementById('checkSection').hidden), 'help: Check a painting a second time leaves the drawer open');
    // by keyboard: where does the focus go after a jump button? the button is in the hidden guide now
    await tab(page, 'help'); await page.focus('[data-go="paint"]'); await page.keyboard.press('Enter'); await waitShown(page, 'tab-paint');
    const after = await page.evaluate(() => { const e = document.activeElement; return { id: e.id || e.tagName.toLowerCase(), hiddenPanel: !!e.closest('.tabpanel[hidden]') }; });
    const focusKept = after.id !== 'body' && !after.hiddenPanel;
    t.check(focusKept, 'help: after a jump button by keyboard the focus is on something visible', after);
    if (!focusKept) t.finding({ title: 'After a Help jump button is pressed by keyboard, the focus falls to the page body (the button pressed is now hidden)', severity: 'low', steps: 'Open How to use, Tab to "Go to Studio", press Enter.', expected: 'The focus moves to the Studio section button (as the menu items do, switchTab(name, true)) or into the Studio.', actual: `document.activeElement is ${after.id}${after.hiddenPanel ? ' inside the hidden help panel' : ''}: js/app.js:2638-2642 call switchTab(go) without focus, so the focus is on a button that is now display:none, the browser drops it to the body, and the next Tab starts from the top of the page.`, cause: 'js/app.js:2640: switchTab(go) without its focus argument' });
    await clean(t, page, 'help');
    await page.context().close();
  }
  // the guide at phone width: the pictures fit the phone frame, and Check a painting lands in view
  {
    const page = await openPage(site, { viewport: PHONE, url: '#help' });
    const phone = await page.evaluate(() => [...document.querySelectorAll('#tab-help figure.phone')].map((f) => { const r = f.getBoundingClientRect(); return { w: Math.round(f.querySelector('img').getBoundingClientRect().width), right: Math.round(r.right) }; }));
    t.check(phone.length >= 29 && phone.every((p) => p.w >= 150 && p.w <= 358), 'help phone: every screenshot shows at a phone-sized width (150 to 358 px)', phone.slice(0, 4));
    t.check((await hscroll(page)) <= 0, 'help phone: no horizontal scroll');
    await click(page, '[data-go="check"]'); await waitShown(page, 'tab-study'); await settle(page);
    const check = await page.evaluate(() => { const d = document.getElementById('drawer-check'); const r = d.getBoundingClientRect(); return { open: d.open, top: Math.round(r.top), inView: r.top >= -2 && r.top < window.innerHeight * 0.5 }; });
    t.check((await shell(page)).shown.join() === 'tab-study' && check.open && check.inView, 'help phone: Check a painting opens the check drawer at the top of the screen', check);
    await clean(t, page, 'help phone');
    await page.context().close();
  }

  // ---- Simple and Advanced: remembered across reloads, followed by the Pose frame, apart from pose.html ----
  {
    const page = await openPage(site);
    let s = await shell(page);
    t.check(s.simple && !(await visible(page, '#simplify')) && (await visible(page, '.simple-only')), 'mode: starts Simple with the Detail preset and no Simplify slider', s);
    await click(page, '[data-mode="advanced"]'); await settle(page);
    const adv = { simple: (await shell(page)).simple, slider: await visible(page, '#simplify'), preset: await visible(page, '.simple-only'), key: await page.evaluate(() => localStorage.getItem('portrait-value-studio.mode')) };
    t.check(!adv.simple && adv.slider && !adv.preset && adv.key === 'advanced', 'mode: Advanced shows the sliders, hides the Detail preset, and is written', adv);
    await click(page, '[data-mode="advanced"]'); await settle(page);
    t.check((await page.evaluate(() => localStorage.getItem('portrait-value-studio.mode'))) === 'advanced' && !(await shell(page)).simple, 'mode: Advanced pressed again stays Advanced', adv);
    await page.reload({ waitUntil: 'load' }); await sleep(500);
    t.check(!(await shell(page)).simple && (await page.evaluate(() => document.querySelector('[data-mode="advanced"]').getAttribute('aria-pressed'))) === 'true', 'mode: Advanced is back after a reload');
    await tab(page, 'pose');
    const pf = poseFrame(page);
    const poseMode = (f) => f.evaluate(() => ({ simple: document.documentElement.classList.contains('simple'), pressed: [...document.querySelectorAll('[data-mode]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.mode), ownSwitch: getComputedStyle(document.querySelector('.top')).display, key: localStorage.getItem('pose-and-light.mode') }));
    let pm = pf ? await poseMode(pf) : null;
    t.check(pm && !pm.simple && pm.pressed.join() === 'advanced' && pm.ownSwitch === 'none', 'mode: the Pose frame opens in Advanced and hides its own switch', pm);
    await click(page, '[data-mode="simple"]');
    await pf.waitForFunction(() => document.documentElement.classList.contains('simple'), null, { timeout: 3000 }).catch(() => null);
    pm = await poseMode(pf);
    t.check(pm.simple && pm.pressed.join() === 'simple' && pm.key === null, 'mode: Simple in the app reaches the open Pose frame at once, without writing the page\'s own key', pm);
    await click(page, '[data-mode="advanced"]');
    await pf.waitForFunction(() => !document.documentElement.classList.contains('simple'), null, { timeout: 3000 }).catch(() => null);
    t.check(!(await poseMode(pf)).simple, 'mode: and back to Advanced');
    // a menu opened over the Pose tab, then a touch on the figure (inside the frame): the menu should close
    await page.click('#tabLearnBtn');
    const box = await page.locator('#poseFrame').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height - 20, 500)); await sleep(150);
    s = await shell(page);
    t.check(!s.learnOpen && s.learnExpanded === 'false', 'pose: a click inside the Pose frame closes an open tab menu', s);
    if (s.learnOpen) t.finding({ title: 'A tab menu stays open when the visitor clicks into the Pose and light picture', severity: 'low', steps: 'Open Learning tools > Pose and light. Open the Learning tools menu again. Click on the figure or the light controls inside the Pose page.', expected: 'The menu closes, as it does for a click anywhere else on the page.', actual: `The menu stays open over the page with aria-expanded="true" (focus moved into the frame: ${s.active}): the close-on-click listener is a pointerdown on the app's document (js/app.js:2250), and a pointerdown inside the frame's own document never reaches it.`, cause: 'js/app.js:2250: pointerdown on document only; nothing closes the menus on blur or when the frame takes the focus' });
    await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelectorAll('.tab-menu').forEach((m) => { m.hidden = true; }));
    // the frame's height message: capped, sanity-checked, and only taken from the frame itself
    const fh = () => page.evaluate(() => document.getElementById('poseFrame').style.height);
    await pf.evaluate(() => parent.postMessage({ type: 'pose-and-light:height', height: 1e9 }, '*'));
    await page.waitForFunction(() => document.getElementById('poseFrame').style.height === '6000px', null, { timeout: 2000 }).catch(() => null);
    const h1 = await fh();
    await pf.evaluate(() => { parent.postMessage({ type: 'pose-and-light:height', height: 0 }, '*'); parent.postMessage({ type: 'pose-and-light:height', height: 'abc' }, '*'); parent.postMessage({ type: 'pose-and-light:height', height: -40 }, '*'); });
    await page.evaluate(() => window.postMessage({ type: 'pose-and-light:height', height: 123 }, '*'));
    await sleep(300);
    const h2 = await fh();
    t.check(h1 === '6000px' && h2 === '6000px', 'pose: the frame\'s height is capped at 6000 px, and 0, "abc", a negative height or a message from the page itself change nothing', { h1, h2 });
    // the system's colour scheme changing while the app is open: the app, the frame and the histogram follow
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(21, 32, 25)', null, { timeout: 3000 }).catch(() => null);
    const live = { app: await page.evaluate(() => getComputedStyle(document.body).backgroundColor), frame: await pf.evaluate(() => getComputedStyle(document.body).backgroundColor) };
    t.check(live.app === 'rgb(21, 32, 25)' && live.frame === 'rgb(21, 32, 25)', 'scheme: the system turning dark while the app is open turns the app and the Pose frame dark', live);
    await tab(page, 'study'); await page.evaluate(() => { document.getElementById('drawer-values').open = true; }); await settle(page); await sleep(200);
    const histSig = () => page.evaluate(() => { const c = document.getElementById('hist'); const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] * 3 + d[i + 2] * 7; return n; });
    const hDark = await histSig();
    await page.emulateMedia({ colorScheme: 'light' }); await sleep(300);
    const hLight = await histSig();
    t.check(hDark !== hLight, 'scheme: the histogram is redrawn in the new colours when the system scheme changes', { hDark, hLight });
    // a host page setting data-theme="dark" over a light system
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await pf.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 3000 }).catch(() => null);
    const forced = { app: await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).colorScheme]), frame: await pf.evaluate(() => getComputedStyle(document.body).backgroundColor) };
    t.check(forced.app[0] === 'rgb(21, 32, 25)' && forced.app[1] === 'dark' && forced.frame === 'rgb(21, 32, 25)', 'scheme: data-theme="dark" on a light system turns the app and the frame dark', forced);
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await clean(t, page, 'mode in the app');
    // pose.html on its own keeps a choice of its own (README: pose-and-light.mode)
    const alone = await page.context().newPage();
    await alone.goto(site.base + 'pose.html', { waitUntil: 'load' }); await sleep(800);
    const own = await alone.evaluate(() => ({ simple: document.documentElement.classList.contains('simple'), appKey: localStorage.getItem('portrait-value-studio.mode') }));
    t.check(own.simple && own.appKey === 'advanced', 'mode: pose.html on its own starts Simple while the app is Advanced', own);
    await alone.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    await alone.waitForFunction(() => !document.documentElement.classList.contains('simple'), null, { timeout: 2000 }).catch(() => null);
    const own2 = await alone.evaluate(() => ({ simple: document.documentElement.classList.contains('simple'), key: localStorage.getItem('pose-and-light.mode'), appKey: localStorage.getItem('portrait-value-studio.mode') }));
    t.check(!own2.simple && own2.key === 'advanced' && own2.appKey === 'advanced', 'mode: its own switch writes pose-and-light.mode only', own2);
    await alone.close();
    await page.context().close();
  }

  // ---- dark mode on every tab, with screenshots; a host's data-theme reaches the Pose frame ----------
  {
    const page = await openPage(site, { dark: true });
    const dark = (fr) => fr.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color }));
    for (const name of TABS) {
      await tab(page, name);
      const d = await dark(page);
      t.check(d.scheme === 'dark' && d.bg === 'rgb(21, 32, 25)' && d.ink === 'rgb(239, 230, 211)', `dark ${name}: the dark ground and ink`, d);
      t.check((await hscroll(page)) <= 0, `dark ${name}: no horizontal scroll`, await hscroll(page));
      await screenshot(page, `app-shell-dark-${name}`);
    }
    const pf = poseFrame(page);
    const pd = pf ? await pf.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor })) : null;
    t.check(pd && pd.scheme === 'dark', 'dark pose: the frame follows the dark scheme', pd);
    // the toast reads in the dark: light on dark ink, inside the viewport
    await page.evaluate(() => window.Studio.toast('A note in the dark', 4000));
    const tt = await page.evaluate(() => { const e = document.getElementById('toast'); const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, show: e.classList.contains('show') }; });
    t.check(tt.show && tt.bg === 'rgb(239, 230, 211)' && tt.color === 'rgb(21, 32, 25)', 'dark: the toast is dark on light', tt);
    // the reset offer's button, the one note that leads to data loss, reads in the dark too
    await page.evaluate(() => window.StudioGuard.report(new Error('test: dark offer'), { saved: true })); dropOwn(page, /test: dark offer/);
    const contrast = await page.evaluate(() => {
      const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const b = document.querySelector('#toast .toast-action'); const fg = rgb(getComputedStyle(b).color); const bg = rgb(getComputedStyle(document.getElementById('toast')).backgroundColor);
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x); return { fg, bg, ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2), border: getComputedStyle(b).borderColor };
    });
    t.check(contrast.ratio >= 4.5, 'dark: the reset offer\'s button reads on the toast (contrast 4.5 or more)', contrast);
    // a host page switching with data-theme: the app and the frame follow
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await pf.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', null, { timeout: 3000 }).catch(() => null);
    const sw = { app: await dark(page), frame: await pf.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor })) };
    t.check(sw.app.scheme === 'light' && sw.app.bg === 'rgb(239, 231, 214)' && sw.frame.theme === 'light', 'dark: data-theme="light" on the host overrides the scheme in the app and the frame', sw);
    await clean(t, page, 'dark mode');
    await page.context().close();
  }

  // ---- reduced motion; and the Studio's palette in Simple mode follows the Study tab's best of three ----
  {
    const page = await openPage(site, { reducedMotion: true });
    const rm = await page.evaluate(() => ({ toast: getComputedStyle(document.getElementById('toast')).transitionProperty, caretRule: getComputedStyle(document.querySelector('.drawer > summary'), '::after').transitionProperty, tabCaret: getComputedStyle(document.querySelector('.tab-caret')).transitionDuration }));
    t.check(rm.toast === 'none' && rm.caretRule === 'none', 'reduced motion: the toast and the drawer arrow do not animate', rm);
    if (rm.tabCaret !== '0s') t.note(`reduced motion: the menu caret still rotates over ${rm.tabCaret} (styles.css .tab-caret transition) and the section buttons keep their colour transitions; small, and not promised either way.`);
    await page.evaluate(() => window.Studio.toast('still'));
    t.check((await toastState(page)).show, 'reduced motion: a toast still appears');
    for (const name of ['help', 'game']) await tab(page, name);
    // README Studio: "until you choose one here, the palette follows the Study tab's" (in Simple, the best of three)
    await tab(page, 'paint'); await sleep(500);
    const pal = () => page.evaluate(() => ({ study: window.StudioPalette && StudioPalette.current() && StudioPalette.current().name, studio: (document.getElementById('ps-palette').selectedOptions[0] || {}).textContent }));
    const p1 = await pal();
    t.check(SIMPLE_PALETTES.includes(p1.study) && p1.studio === p1.study, 'Simple: the Studio paints with the Study tab\'s palette, the best of the three Simple offers', p1);
    await click(page, '[data-mode="advanced"]');
    await page.waitForFunction(() => { const c = window.StudioPalette.current(); return c && (document.getElementById('ps-palette').selectedOptions[0] || {}).textContent === c.name; }, null, { timeout: 4000 }).catch(() => null);
    const p2 = await pal();
    t.check(p2.studio === p2.study, 'Advanced pressed with the Studio open: the Studio\'s palette still follows the Study tab\'s (now the best of all ten)', { simple: p1, advanced: p2 });
    await clean(t, page, 'reduced motion');
    await page.context().close();
  }

  // ---- the window resized live between 1400 and 390 on every tab --------------------------------
  {
    const page = await openPage(site);
    const widths = [1400, 960, 959, 860, 759, 640, 390, 1000, 1400];
    for (const name of TABS) {
      await tab(page, name);
      const over = [];
      const seen = {};
      for (const w of widths) {
        await atWidth(page, w, w < 500 ? 844 : 900);
        const h = await hscroll(page);
        if (h > 0) over.push(`${w}px: +${h}`);
        seen[w] = await page.evaluate(() => ({
          cols: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns.split(' ').length,
          strip: getComputedStyle(document.querySelector('.toolstrip')).flexDirection,
          tabs: getComputedStyle(document.querySelector('.tabs')).display,
          sub: getComputedStyle(document.querySelector('#tabPaintBtn .tab-sub')).display,
          menuSub: getComputedStyle(document.getElementById('tabLearnSub')).display,
          exit: (() => { const e = document.querySelector('#tab-paint .ps-exit'); return e ? getComputedStyle(e).display : null; })(),
          poseH: document.getElementById('poseFrame').style.height,
        }));
      }
      t.check(over.length === 0, `resize ${name}: no horizontal scroll at any width`, over);
      if (name === 'study') t.check(seen[1400].cols === 3 && seen[390].cols === 1 && seen[960].cols === 3 && seen[959].cols === 1, 'resize study: the rail, tool bar and pictures go to one column under 960', { 1400: seen[1400], 960: seen[960], 959: seen[959], 390: seen[390] });
      if (name === 'study') t.check(seen[1400].strip === 'column' && seen[390].strip === 'row', 'resize study: the tool bar turns from a column to a row', { 1400: seen[1400].strip, 390: seen[390].strip });
      t.check(seen[1400].sub !== 'none' && seen[860].sub === 'none' && seen[390].sub === 'none' && seen[390].menuSub !== 'none', `resize ${name}: a section's subtitle goes under 860 while a menu's stays`, { 1400: seen[1400].sub, 860: seen[860].sub, 390: seen[390] });
      if (name === 'paint') t.check(seen[1400].tabs !== 'none' && seen[759].tabs === 'none' && seen[759].exit !== 'none' && seen[1400].exit === 'none', 'resize paint: the tabs step aside under 760 and the strip grows its way back', { 1400: seen[1400], 759: seen[759] });
      if (name === 'pose') t.check(/^\d+px$/.test(seen[390].poseH) && /^\d+px$/.test(seen[1400].poseH) && seen[390].poseH !== seen[1400].poseH, 'resize pose: the frame is re-sized by its page at each width', { 390: seen[390].poseH, 1400: seen[1400].poseH });
      t.check((await shell(page)).shown.join() === 'tab-' + name, `resize ${name}: the tab stays open through the resizes`);
    }
    await clean(t, page, 'live resize');
    await page.context().close();
  }

  // ---- hashes: the address bar edited while the app is open, then back and forward ---------------
  {
    const results = [];
    for (const round of [1, 2]) {
      const page = await openPage(site, { url: '#paint' });
      t.check((await shell(page)).shown.join() === 'tab-paint', `hash ${round}: #paint opens the Studio at load`);
      await page.evaluate(() => { location.hash = '#game'; });
      await waitShown(page, 'tab-game', 1500);
      const changed = await shell(page);
      await page.goBack({ waitUntil: 'commit' }).catch(() => null); await waitShown(page, 'tab-paint', 1500);
      const back = await shell(page);
      await page.goForward({ waitUntil: 'commit' }).catch(() => null); await waitShown(page, 'tab-game', 1500);
      const fwd = await shell(page);
      results.push({ changed, back, fwd });
      t.check(changed.hash === '#game' && changed.shown.join() === 'tab-game', `hash ${round}: the address changed to #game while the app is open opens the game`, changed);
      t.check(back.hash === '#paint' && back.shown.join() === 'tab-paint', `hash ${round}: Back (to #paint) shows the Studio`, back);
      t.check(fwd.hash === '#game' && fwd.shown.join() === 'tab-game', `hash ${round}: Forward (to #game) shows the game`, fwd);
      await clean(t, page, `hash ${round}`);
      await page.context().close();
    }
    if (results.every((r) => r.changed.shown.join() !== 'tab-game' || r.fwd.shown.join() !== 'tab-game')) {
      t.finding({ title: 'A hash shortcut only works at page load: editing the address to #game (or Back/Forward between hashes) while the app is open changes nothing', severity: 'medium', steps: 'Open /#paint. Edit the address bar to /#game and press Enter (a same-document navigation), or press Back and Forward after that.', expected: 'The tab named by the hash opens, as it does when the address is first opened (the 404 page and the README offer these shortcuts as addresses).', actual: `The Studio stays open; the address says #game. js/app.js:2748-2755 read location.hash once in start(); there is no hashchange or popstate listener, and switchTab never writes the hash. Seen: ${JSON.stringify(results[0].changed)}`, cause: 'js/app.js:2748-2755: the hash is read once, in start(); no hashchange/popstate listener' });
    }
    // the hash does not follow the tab either: a reload returns to the hash's tab, not the one in use
    const page = await openPage(site, { url: '#help' });
    await tab(page, 'battle');
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    const s = await shell(page);
    t.note(`hash: after opening #help, going to Value battle and reloading, the page shows ${s.shown.join()} (the hash still says ${s.hash}); the hash never follows the tab in use, so a reload returns to the hash's tab.`);
    // a route opened at load leaves the shell as the menus would: subtitle, aria-current, aria-checked, body class
    const viaMenu = { loomis: null, battle: null };
    for (const name of ['loomis', 'battle']) { await tab(page, name); const m = await shell(page); viaMenu[name] = { current: m.current, checked: m.checked, sub: name === 'loomis' ? m.learnSub : m.gamesSub, body: m.body }; }
    for (const [i, name] of ['loomis', 'battle'].entries()) {
      await page.goto(`${site.base}?r=${i}#${name}`, { waitUntil: 'load' }); await sleep(400);
      const m = await shell(page);
      const got = { current: m.current, checked: m.checked, sub: name === 'loomis' ? m.learnSub : m.gamesSub, body: m.body };
      t.check(JSON.stringify(got) === JSON.stringify(viaMenu[name]) && m.shown.join() === 'tab-' + name, `hash: #${name} at load leaves the shell as its menu item does (subtitle, aria-current, aria-checked, body class)`, { atLoad: got, viaMenu: viaMenu[name] });
    }
    const variants = [];
    for (const [i, h] of ['#Help', '#help/', '#loomis?x', '#nonsense'].entries()) { await page.goto(`${site.base}?v=${i}${h}`, { waitUntil: 'load' }); await sleep(300); variants.push(`${h} → ${(await shell(page)).shown.join()}`); }
    t.check(variants.every((v) => / → tab-study$/.test(v)), 'hash: an address the app does not know (#Help, #help/, #loomis?x, #nonsense) opens the Study tab', variants);
    t.note(`hash: the shortcuts match exactly: ${variants.join('; ')} (no case folding or trailing slash).`);
    // the 404 page's root-absolute files exist
    const assets = [];
    for (const f of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'fonts.css', 'styles.css']) { const r = await page.request.get(site.base + f); assets.push(`${f} ${r.status()}`); }
    t.check(assets.every((a) => / 200$/.test(a)), 'hash: the icons and styles the 404 page names root-absolute are served', assets);
    await clean(t, page, 'hash routes');
    await page.context().close();
  }

  // ---- the old-browser note: no ResizeObserver, both widths --------------------------------------
  const oldStrips = [];
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const page = await openPage(site, { viewport });
    await page.addInitScript(() => { delete window.ResizeObserver; });
    await page.goto(site.base, { waitUntil: 'load' }); await sleep(800);
    const s = { ...(await fallback(page)), noteText: await page.evaluate(() => document.querySelector('.oldbrowser-note').textContent.slice(0, 60)) };
    t.check(s.cls.includes('old-browser') && s.old === 'block' && /too old/.test(s.noteText) && s.nojs === 'none', `old browser ${label}: the standing note says the browser is too old`, s);
    t.check(s.tabs === 'none' && s.actions === 'none' && s.rail === 'none' && s.study === 'none' && s.help === 'block' && s.steps === 'none' && s.forget !== 'none', `old browser ${label}: no controls, the guide reads, Forget still there`, s);
    t.check(s.toolstrip === 'none', `old browser ${label}: the tool bar goes with the other controls`, s.tools);
    oldStrips.push(s);
    t.check((await hscroll(page)) <= 0, `old browser ${label}: no horizontal scroll`, await hscroll(page));
    if (label === 'phone') await screenshot(page, 'app-shell-old-browser-phone');
    await clean(t, page, `old browser ${label}`);
    await page.context().close();
  }
  // an old browser opened straight on a tab whose page needs ResizeObserver (index.html#pose): the frame loads although hidden
  {
    // (opened at #pose and reloaded: a goto to the hash from the plain address would be a same-document change, with no init script and no start())
    const page = await openPage(site, { url: '#pose' });
    await page.addInitScript(() => { delete window.ResizeObserver; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => { const f = document.getElementById('poseFrame'); return f.getAttribute('src') && f.contentDocument && f.contentDocument.readyState === 'complete'; }, null, { timeout: 8000 }).catch(() => null);
    await sleep(1500);
    const pf = poseFrame(page);
    const s = await page.evaluate(() => ({ cls: document.documentElement.className.trim(), src: document.getElementById('poseFrame').getAttribute('src'), tab: window.Studio && window.Studio.tab() }));
    s.frame = pf ? await pf.evaluate(() => ({ ro: 'ResizeObserver' in window, started: !!window.__poseStarted, failed: document.documentElement.classList.contains('failed'), imgs: document.querySelectorAll('#poses button.has-img').length })).catch(() => 'gone') : null;
    t.check(s.cls.includes('old-browser') && s.tab === 'pose', 'old browser #pose: the note is up and the page opened on the Pose tab', s);
    t.note(`old browser #pose: the hidden Pose frame ${s.frame ? JSON.stringify(s.frame) : 'did not load'}.`);
    const errs = page.log.pageerrors.slice();
    const ok = await clean(t, page, 'old browser #pose');
    if (!ok) t.finding({ title: 'In an old browser (no ResizeObserver) opened at #pose, the hidden Pose frame still loads and its script throws', severity: 'low', steps: 'In an init script delete window.ResizeObserver (every frame); open index.html#pose.', expected: 'With the old-browser note up and the tabs hidden, the Pose page is not loaded (or fails quietly like a missing three.js).', actual: `html class "${s.cls}", poseFrame src ${s.src}: start() still calls switchTab("pose") (js/app.js:2753), which sets the frame's src, and js/pose.js:1536 constructs a ResizeObserver without a guard, so the frame throws: ${errs.map((e) => e.split('\n')[0]).join(' | ').slice(0, 200)}`, cause: 'js/app.js:2753 opens the frame in old-browser mode; js/pose.js:1536 new ResizeObserver unguarded' });
    await page.context().close();
  }

  // ---- JavaScript off altogether: the no-js guide at both widths --------------------------------------
  const nojsStrips = [];
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const page = await barePage(site, { viewport, javaScriptEnabled: false });
    await page.goto(site.base, { waitUntil: 'load' });
    const s = await fallback(page);
    const pics = await page.evaluate(() => { const imgs = [...document.querySelectorAll('#tab-help img')]; return { n: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth === +i.getAttribute('width')).length }; });
    t.check(s.cls === 'no-js' && s.nojs === 'block' && s.old === 'none' && s.part === 'none', `JavaScript off ${label}: the one "has not started" note`, s);
    t.check(s.tabs === 'none' && s.actions === 'none' && s.rail === 'none' && s.study === 'none' && s.help === 'block' && s.steps === 'none', `JavaScript off ${label}: no tabs, no Load photo, no rail, no Study tab, no jump buttons; the guide reads`, s);
    t.check(pics.n >= 29 && pics.loaded === pics.n, `JavaScript off ${label}: every guide picture loads`, pics);
    t.check((await hscroll(page)) <= 0, `JavaScript off ${label}: no horizontal scroll`);
    t.check(s.toolstrip === 'none' && s.forget === 'none', `JavaScript off ${label}: no control that cannot work is shown (the tool bar, Forget)`, { toolstrip: s.toolstrip, tools: s.tools, forget: s.forget });
    nojsStrips.push(s);
    if (label === 'phone') await screenshot(page, 'app-shell-no-js-phone');
    await clean(t, page, `JavaScript off ${label}`);
    await page.context().close();
  }

  // ---- a script that arrives and throws while the page starts (the guard's "did not start" branch) ----
  const allFailed = {};
  {
    const page = await openPage(site);
    const swap = async (name, body) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.route(site.base + `js/${name}.js`, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body })); await page.reload({ waitUntil: 'load' }); await sleep(500); };
    const OWN = /boom|did not start|did not finish loading/;
    // loomis.js throws at its first line: its item goes, the part note shows, the rest works
    await swap('loomis', 'throw new Error("boom: loomis")');
    let f = await fallback(page);
    const items = await page.evaluate(() => [...document.querySelectorAll('.tab-item, .tab')].filter((b) => b.hidden).map((b) => b.id));
    t.check(f.cls === 'part-failed' && f.part === 'block' && f.nojs === 'none' && items.join() === 'tabLoomisBtn' && f.tabs !== 'none', 'boot throw loomis.js: "Part of Portrait Value Studio did not start", Loomis head off the menu, the rest in place', { ...f, hidden: items });
    for (const name of ['paint', 'help', 'study']) { await tab(page, name); t.check((await shell(page)).shown.join() === 'tab-' + name, `boot throw loomis.js: ${name} still opens`); }
    await page.evaluate(() => window.Studio.go('loomis'));
    t.check((await shell(page)).shown.join() === 'tab-study', 'boot throw loomis.js: a way into the Loomis head lands on Study the photo, not a dead panel');
    dropErrors(page, OWN);
    await clean(t, page, 'boot throw loomis.js');
    // painting.js runs to its end and then throws: the Studio goes, and so does "Use my Studio painting"
    await swap('painting', fs.readFileSync(path.join(site.root, 'js', 'painting.js'), 'utf8') + '\nthrow new Error("boom: painting");');
    const pf2 = await page.evaluate(() => ({ cls: document.documentElement.className.trim(), studio: document.getElementById('tabPaintBtn').hidden, fromStudio: document.getElementById('artFromStudio').hidden, part: getComputedStyle(document.querySelector('.partfail-note')).display }));
    t.check(pf2.cls === 'part-failed' && pf2.studio && pf2.fromStudio && pf2.part === 'block', 'boot throw painting.js: the Studio and "Use my Studio painting" go, the part note shows', pf2);
    for (const name of ['loomis', 'figure']) { await tab(page, name, { wait: name !== 'figure' }); t.check((await shell(page)).shown.join() === 'tab-' + name, `boot throw painting.js (after its last line): ${name} still opens`); }
    dropErrors(page, OWN);
    await clean(t, page, 'boot throw painting.js');
    // palette.js throws: no tab of its own, so nothing leaves the menu, but the note says a part did not start
    await swap('palette', 'throw new Error("boom: palette")');
    f = await fallback(page);
    t.check(f.cls === 'part-failed' && f.part === 'block' && f.tabs !== 'none', 'boot throw palette.js: the part note, every tab kept', f);
    dropErrors(page, OWN);
    await clean(t, page, 'boot throw palette.js');
    // app.js throws: nothing has started, so the guide stands alone
    await swap('app', 'throw new Error("boom: app")');
    f = await fallback(page);
    t.check(/all-failed/.test(f.cls) && f.nojs === 'block' && f.part === 'none' && f.tabs === 'none' && f.actions === 'none' && f.rail === 'none' && f.help === 'block', 'boot throw app.js: the "has not started" note over the guide, no tabs, no rail', f);
    const forget = await page.evaluate(() => { const b = document.getElementById('forgetBtn'); const idle = b.textContent; b.click(); return { idle, after: b.textContent }; });
    allFailed.strip = f; allFailed.forget = forget;
    t.check(f.toolstrip === 'none', 'boot throw app.js: the tool bar goes with the other controls (nothing could answer it)', f.tools);
    t.check(f.forget === 'none' || forget.after !== forget.idle, 'boot throw app.js: Forget is either gone or answers a tap', forget);
    dropErrors(page, OWN);
    await clean(t, page, 'boot throw app.js');
    await page.context().close();
  }
  {
    // one finding for the controls the fallbacks leave behind
    const deadNojs = nojsStrips.filter((s) => s.toolstrip !== 'none' || s.forget !== 'none');
    const deadAll = allFailed.strip && (allFailed.strip.toolstrip !== 'none' || (allFailed.strip.forget !== 'none' && allFailed.forget.after === allFailed.forget.idle));
    const deadOld = oldStrips.some((s) => s.toolstrip !== 'none');
    if (deadNojs.length || deadAll || deadOld) t.finding({ title: 'The "guide instead of dead controls" fallbacks leave the tool bar (Magnifier, Lines, Measure, Plumb, Grid) on the page, and with JavaScript off or app.js failed, the Forget button too, none of which can work', severity: 'medium', steps: 'Open the site (1) with JavaScript off, (2) with js/app.js answering a script that throws, or (3) in a browser without ResizeObserver (old-browser note). Look above the guide, and press "Forget my work on this device" under Good to know.', expected: 'Only the note and the guide (index.html\'s own comment: "shows the guide instead of dead controls"; guard.js: "a standing note instead of controls that die one by one").', actual: `The five tool icons stay above the guide in every fallback (${[deadNojs.length ? 'JavaScript off: ' + JSON.stringify(deadNojs[0].tools) : '', deadAll ? 'app.js throws: ' + JSON.stringify(allFailed.strip.tools) : '', deadOld ? 'old browser: shown, and pressing Lines turns a tool on for the hidden Study pictures' : ''].filter(Boolean).join('; ')}); with JavaScript off or app.js failed nothing answers them, and Forget (display ${nojsStrips[0] && nojsStrips[0].forget}) does nothing when pressed (after one tap with app.js failed it still reads "${allFailed.forget && allFailed.forget.after}": its listener is in app.js:2759-2773).`, cause: 'styles.css:1730-1732 hide .topbar-actions, .tabs, .rail and the panels but not .toolstrip (index.html:269, outside the rail) or #forgetBtn' });
  }

  // ---- storage blocked outright: setItem throws and no IndexedDB; then localStorage itself throws ----
  {
    const page = await openPage(site);
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    await page.goto(site.base, { waitUntil: 'load' }); await sleep(600);
    const err0 = page.log.pageerrors.length;
    t.check((await page.evaluate(() => { try { localStorage.setItem('x', 'y'); return 'wrote'; } catch (e) { return e.name + ' ' + typeof indexedDB; } })) === 'QuotaExceededError undefined', 'storage blocked: setItem throws and there is no IndexedDB');
    for (const name of ['help', 'paint', 'loomis', 'game', 'battle', 'pose', 'figure', 'study']) {
      await tab(page, name);
      t.check((await shell(page)).shown.join() === 'tab-' + name, `storage blocked: ${name} opens`, await shell(page));
    }
    await click(page, '[data-mode="advanced"]'); await settle(page);
    t.check(!(await shell(page)).simple, 'storage blocked: Advanced still switches for this visit');
    await tab(page, 'paint'); await sleep(1200);
    const note1 = await toastState(page);
    await stroke(page, '#ps-paper'); await sleep(2000);
    const after = { ink: await inked(page, '#ps-paper'), toast: await toastState(page) };
    t.check(after.ink > 50, 'storage blocked: painting still works', after.ink);
    // the guide says the Studio saves as you go: with no database to save to, the visitor must be told it does not
    const toldNotKept = /visit only|not (be )?saved|could not be saved/.test(note1.text + ' ' + after.toast.text + ' ' + (await page.evaluate(() => document.getElementById('ps-status') ? document.getElementById('ps-status').textContent : '')));
    t.check(toldNotKept, 'storage blocked: the Studio says the painting stays for this visit only', { onOpen: note1.text, afterStroke: after.toast.text });
    if (!toldNotKept) t.finding({ title: 'With IndexedDB absent (window.indexedDB undefined, as Firefox with dom.indexedDB.enabled=false has it) the Studio silently keeps nothing, while the guide says it saves as you go', severity: 'low', steps: 'In an init script set window.indexedDB to undefined (or turn IndexedDB off in Firefox). Open the Studio, paint a stroke, wait.', expected: 'A note that the painting stays for this visit only (the note the Studio gives when a save fails, painting.js:447, and gives inside a sandboxed embed).', actual: `Nothing is said on opening ("${note1.text}") or after a stroke ("${after.toast.text}"): painting.js:412 sets hasDb false, saveSoon (434) and restore (455) return at once, and the one-time note at 861 needs dbOk, so neither the "saved as you go" note nor the "could not be saved" one appears, and the painting is gone on the next visit.`, cause: 'js/painting.js:412/434/455: hasDb false returns silently; nothing says so' });
    t.check(page.log.pageerrors.length === err0, 'storage blocked: no page error', page.log.pageerrors);
    // Forget still reloads the page
    await tab(page, 'help');
    await click(page, '#forgetBtn'); await navigate(page, () => click(page, '#forgetBtn')); await sleep(500);
    t.check((await shell(page)).shown.join() === 'tab-study' && (await shell(page)).simple, 'storage blocked: Forget reloads to a fresh Simple page', await shell(page));
    await clean(t, page, 'storage blocked');
    await page.context().close();
  }
  {
    const page = await openPage(site);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); }, configurable: true });
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    await page.goto(site.base, { waitUntil: 'load' }); await sleep(600);
    t.check((await page.evaluate(() => { try { return typeof localStorage; } catch (e) { return e.name; } })) === 'SecurityError', 'storage throws: reading localStorage throws');
    for (const name of ['help', 'paint', 'loomis', 'game', 'battle', 'figure', 'study']) {
      await tab(page, name);
      t.check((await shell(page)).shown.join() === 'tab-' + name, `storage throws: ${name} opens`, await shell(page));
    }
    await page.evaluate(() => document.getElementById('autoSplit').click());
    t.check(/Splits set/.test((await toastState(page)).text), 'storage throws: a control still answers with its note', await toastState(page));
    await clean(t, page, 'storage throws');
    await page.context().close();
  }

  // ---- saved state of hostile shape, for every key the shell reads and the others' too -----------
  const rounds = [
    ['strings and prototype names', PHONE, ['help', 'paint', 'game', 'battle', 'loomis', 'study'], {
      [PVS + 'mode']: 'ADVANCED', [PVS + 'drawers']: '"constructor"', [PVS + 'smoothing']: '__proto__', [PVS + 'palette']: 'constructor',
      [PVS + 'canvasUnit']: '{"value":NaN}', [PVS + 'lean']: 'NaN', [PVS + 'blockView']: 'constructor', [PVS + 'studioNotice']: 'constructor',
      [PVS + 'gameBest']: '"a string"', [PVS + 'figureStudy']: '"x"', [PVS + 'figureMixes']: '"x"', [PVS + 'myPaints']: '"x"', [PVS + 'paintChoice']: '42', [PVS + 'paintMixes']: '"x"',
      [PVS + 'battleBest']: '"x"', [PVS + 'battlePalette']: 'constructor', [PVS + 'gameLevel']: '__proto__', [PVS + 'gamePainting']: 'toString',
      'pose-and-light.v2': '"x"', 'pose-and-light.mine.v1': '"x"', 'pose-and-light.mode': '{"a":1}',
    }],
    ['wrong types and nested objects', DESKTOP, ['help', 'paint', 'game', 'battle', 'loomis', 'study'], {
      [PVS + 'mode']: { __proto__: { x: 1 } }, [PVS + 'drawers']: { constructor: 1, length: 1e9 }, [PVS + 'smoothing']: { a: { b: { c: 1 } } },
      [PVS + 'palette']: [{ r: '1', g: 2, b: 3 }, { r: 1e308, g: 0, b: 0 }, { r: -1, g: 0, b: 0 }, '__proto__', null, { r: 1, g: 1, b: 1, constructor: 'x' }, { r: 2.5, g: 1, b: 1 }],
      [PVS + 'canvasUnit']: { value: { valueOf: 1 }, sys: '__proto__' }, [PVS + 'lean']: '101', [PVS + 'blockView']: { a: 1 }, [PVS + 'studioNotice']: 0,
      [PVS + 'gameBest']: { constructor: { prototype: 1 }, hasOwnProperty: 'no', __proto__: { x: 1 } }, [PVS + 'figureStudy']: [], [PVS + 'battleBest']: [1, 2, 3], [PVS + 'myPaints']: { constructor: 1 },
      [PVS + 'paintChoice']: { __proto__: 1 }, [PVS + 'gameLevel']: 'constructor', [PVS + 'gameMode']: 1e308, [PVS + 'gameSubject']: { kind: '__proto__' }, [PVS + 'gamePalette']: ['constructor'],
      [PVS + 'battleCount']: '1e309', [PVS + 'battleMode']: ['x'], [PVS + 'gameAmount']: 'NaN', [PVS + 'gameSound']: 'null', [PVS + 'gameRefView']: { toString: 1 },
      'pose-and-light.v2': { pose: [1, 2], light: 'x' }, 'pose-and-light.mine.v1': { length: 1e9 }, 'pose-and-light.mode': ['advanced'],
    }],
    ['huge arrays and extremes', DESKTOP, ['help', 'paint', 'figure', 'game', 'study'], {
      [PVS + 'mode']: 'advanced', [PVS + 'drawers']: Array(20000).fill('values').concat(['check', 'colors', 'swatches']), [PVS + 'smoothing']: 'soft',
      [PVS + 'palette']: Array.from({ length: 3000 }, (_, i) => ({ r: i % 256, g: (i * 7) % 256, b: (i * 13) % 256 })),
      [PVS + 'canvasUnit']: { value: '1e308', sys: 'cm' }, [PVS + 'lean']: '050', [PVS + 'blockView']: 'palette',
      [PVS + 'figureStudy']: { mode: 'constructor', secs: 'abc', out: '__proto__' }, [PVS + 'gameBest']: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['k' + i, i])),
      'pose-and-light.mine.v1': Array.from({ length: 500 }, () => ({})), 'pose-and-light.v2': { pose: {}, light: { az: 1e308, el: 'x', dist: -1 } },
    }],
  ];
  for (const [label, viewport, tabs, storage] of rounds) {
    const page = await openPage(site, { viewport, storage });
    const t0 = Date.now();
    const atLoad = await toastState(page);
    for (const name of tabs) {
      await tab(page, name);
      t.check((await shell(page)).shown.join() === 'tab-' + name, `hostile ${label}: ${name} opens`, await shell(page));
    }
    const s = await shell(page);
    if (label === 'huge arrays and extremes') {
      const kept = await page.evaluate(() => ({ values: document.getElementById('drawer-values').open, check: document.getElementById('drawer-check').open, swatches: document.querySelectorAll('#swatches .swatch').length, lean: document.getElementById('lean').value, smoothing: document.querySelector('input[name="smoothing"]:checked').value }));
      t.check(!s.simple && kept.values && kept.check && kept.swatches === 3000 && kept.lean === '50' && kept.smoothing === 'soft', 'hostile huge: the sound values among the junk are kept (Advanced, 3000 colours, the drawers, lean "050" as 50, smoothing)', { simple: s.simple, ...kept });
      const unit = await page.evaluate(() => document.getElementById('canvasSize').value);
      t.check(unit === '', 'hostile huge: a saved canvas unit of 1e308 is not restored into Unit on my canvas (the labels would ignore it)', unit);
    } else {
      t.check(s.simple, `hostile ${label}: a mode that is not exactly "advanced" reads as Simple`, s);
    }
    const say = await toastState(page);
    t.check(!/could not be read/.test(atLoad.text) && !/could not be read/.test(say.text), `hostile ${label}: no "could not be read" note (every reader falls back silently)`, { atLoad: atLoad.text, now: say.text });
    t.note(`hostile ${label}: toast at load "${atLoad.text}", after the tabs "${say.text}"; ${((Date.now() - t0) / 1000).toFixed(1)} s for ${tabs.length} tabs.`);
    await clean(t, page, `hostile ${label}`);
    await page.context().close();
  }
  t.note('Which saved keys trigger the guard\'s "could not be read" note: none of the localStorage keys. Every reader (app.js restoreDrawers/restoreSmoothing/readPalette/loadCanvasSize, game.js/palette.js/battle.js/painting.js load(), figure.js load(), pose.js restore()) parses inside try/catch and falls back to its default, so the note with its reset offer is reached only through StudioGuard.report(err, { saved: true }) from a Studio restore() that rejects (painting.js:842) or a start() step that throws (app.js:2729), which a junk IndexedDB record does not do either: it says "could not be read, so this is a fresh paper" (painting.js:859). The steps below drive the offer through StudioGuard.report itself.');

  // ---- the guard's reset offer: a junk saved painting, then the two-tap reset and what it clears -----
  {
    // (the keys are written by hand, not seeded through openPage: its seed runs again on every reload)
    const page = await openPage(site);
    await page.evaluate(() => { localStorage.setItem('portrait-value-studio.mode', 'advanced'); localStorage.setItem('portrait-value-studio.lean', '80'); localStorage.setItem('pose-and-light.mode', 'advanced'); localStorage.setItem('portrait-value-studio.gameBest', '{"a":1}'); });
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    t.check(!(await shell(page)).simple, 'reset: the seeded Advanced mode is in force');
    await tab(page, 'paint'); await sleep(800);
    await stroke(page, '#ps-paper');
    await page.waitForFunction(async () => true, null, { timeout: 100 }).catch(() => null);
    let rec = 'none';
    for (let i = 0; i < 12 && rec !== 'record'; i++) { await sleep(400); rec = await dbRecord(page); } // the autosave lands
    t.check(rec === 'record', 'reset: a painting record exists before the junk is written', rec);
    // a record of the wrong shape: the Studio must say so, as a fresh paper
    await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('portrait-value-studio', 1); r.onsuccess = () => res(r.result); }); await new Promise((res) => { const tx = db.transaction('studio', 'readwrite'); tx.objectStore('studio').put({ w: 'constructor', h: NaN, paper: 'nope', canvas: { ground: '__proto__' } }, 'painting'); tx.oncomplete = res; }); db.close(); });
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    await tab(page, 'paint');
    await page.waitForFunction(() => /could not be read|fresh paper/.test(document.getElementById('toast').textContent), null, { timeout: 6000 }).catch(() => null);
    const junk = await toastState(page);
    t.check(/could not be read, so this is a fresh paper/.test(junk.text) && junk.button === null && (await inked(page, '#ps-paper')) === 0, 'reset: a junk saved painting is said as a fresh paper (the Studio\'s own note, no reset button)', junk);
    // now the guard's offer itself: two taps, and it stays while armed; then everything is gone
    // (once the Studio's own note has gone: its timer would otherwise cut the offer short, see "toast timers")
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 9000 }).catch(() => null);
    await page.evaluate(() => window.StudioGuard.report(new Error('test: saved state unreadable'), { saved: true }));
    dropOwn(page, /test: saved state/);
    let offer = await toastState(page);
    t.check(offer.show && offer.text.startsWith(SAVED_FAILED) && offer.button === 'Reset settings and saved painting', 'reset: the note offers the reset', offer);
    await page.click('#toast .toast-action'); offer = await toastState(page);
    t.check(offer.show && offer.button === 'Tap again to reset' && !offer.disabled, 'reset: the first tap arms it and says so', offer);
    await sleep(6500); offer = await toastState(page);
    t.check(offer.show && offer.button === 'Tap again to reset', 'reset: the armed offer is still there after 6.5 s', offer);
    t.note('reset: once armed, the offer never times out (guard.js:66 clears the hide timer); it stays until the second tap or another note replaces it.');
    await navigate(page, () => page.click('#toast .toast-action')); await sleep(1500);
    const gone = { keys: await siteKeys(page), record: await dbRecord(page), ...(await page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), lean: document.getElementById('lean').value }))) };
    t.check(gone.keys.length === 0 && gone.record !== 'record' && gone.simple, 'reset: after the second tap and the reload no key, no record, Simple again', gone);
    await tab(page, 'paint'); await sleep(1500);
    t.check((await inked(page, '#ps-paper')) === 0, 'reset: the paper is blank');
    await clean(t, page, 'reset offer');
    await page.context().close();
  }

  // ---- the reset offer's button once the note has gone (20 s), side by side with the 404 page and the old-browser legs ----
  const resetOfferGone = async () => {
    const page = await openPage(site);
    await page.evaluate(() => { localStorage.setItem('portrait-value-studio.mode', 'advanced'); localStorage.setItem('portrait-value-studio.lean', '80'); });
    await page.evaluate(() => window.StudioGuard.report(new Error('test: offer that goes'), { saved: true })); dropOwn(page, /test: offer that goes/);
    // while it shows, the keyboard reaches it: Tab from the last control before it
    const from = await focusLastBefore(page, 'toast'); await page.keyboard.press('Tab');
    const shownReach = await activeIs(page);
    t.check(/toast-action/.test(shownReach.cls), 'reset offer: while shown, Tab from the last control reaches its button', { from, active: shownReach });
    await page.keyboard.press('Escape');
    t.note(`reset offer: Escape ${(await toastState(page)).show ? 'leaves the note up (nothing promises otherwise; it goes after 20 s)' : 'hides the note'}.`);
    const went = await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 25000 }).then(() => true).catch(() => false);
    await sleep(400); // the fade
    t.check(went, 'reset offer: the note goes after its 20 s');
    // the same Tab once the note has gone: the focus must not land on a button no one can see
    await focusLastBefore(page, 'toast'); await page.keyboard.press('Tab');
    const goneReach = { ...(await activeIs(page)), toastOpacity: await page.evaluate(() => getComputedStyle(document.getElementById('toast')).opacity) };
    const tabHits = /toast-action/.test(goneReach.cls);
    t.check(!tabHits, 'reset offer gone: Tab from the last control does not land on its invisible button', goneReach);
    // nor may it catch clicks: the toast lets the pointer through, its button does not
    const spot = await page.evaluate(() => { const b = document.querySelector('#toast .toast-action'); if (!b) return null; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hit: hit ? hit.className : null, under: (() => { b.style.visibility = 'hidden'; const u = document.elementFromPoint(x, y); b.style.visibility = ''; return u ? (u.id || u.className || u.tagName).toString().slice(0, 40) : null; })() }; });
    const clickHits = !!spot && spot.hit === 'toast-action';
    t.check(!clickHits, 'reset offer gone: its invisible button does not catch clicks at the bottom of the window', spot);
    let wiped = null;
    if (clickHits) {
      // what two ordinary clicks on that spot do
      await page.keyboard.press('Escape');
      await page.evaluate(() => { const b = document.querySelector('#toast .toast-action'); if (b.textContent !== 'Reset settings and saved painting') { b.remove(); } });
      if (await page.evaluate(() => !!document.querySelector('#toast .toast-action'))) {
        await navigate(page, async () => { await page.mouse.click(spot.x, spot.y); await sleep(200); await page.mouse.click(spot.x, spot.y); });
        await sleep(800);
        wiped = { keys: await siteKeys(page), simple: await page.evaluate(() => document.body.classList.contains('mode-simple')) };
      }
    }
    if (tabHits || clickHits) t.finding({ title: 'Once the reset offer\'s note has faded, its "Reset settings and saved painting" button stays on the page, invisible, focusable and clickable: two clicks at the bottom centre of the window wipe every setting and the saved painting', severity: 'medium', steps: 'Have the guard\'s saved-state note come up (StudioGuard.report(err, { saved: true }), what a Studio restore() that rejects or a start() step that throws calls). Leave it: after 20 s it fades. Then (a) Tab from the last control of the page, or (b) click twice at the bottom centre of the window, where the note was.', expected: 'The button leaves with its note (removed, or hidden from the pointer and the keyboard); nothing invisible can clear the visitor\'s work.', actual: `${tabHits ? `Tab lands on the invisible button (toast opacity ${goneReach.toastOpacity}); Enter twice clears everything. ` : ''}${clickHits ? `The spot (${Math.round(spot.x)}, ${Math.round(spot.y)}) is taken by the invisible button, not the page underneath (${spot.under}); ` : ''}${wiped ? `two clicks there reloaded the page with ${wiped.keys.length} saved keys left (Advanced and the lean were set) and the mode back to ${wiped.simple ? 'Simple' : 'Advanced'}.` : ''} guard.js:72-73 only removes the class "show" when the 20 s are up; the button stays in the toast, and styles.css:1735 gives .toast-action pointer-events: auto inside a toast whose opacity is 0.`, cause: 'js/guard.js:72-73 (the hide timer leaves the button); styles.css:1735 (.toast .toast-action { pointer-events: auto } even when the toast is hidden)' });
    await clean(t, page, 'reset offer gone');
    await page.context().close();
  };
  const fourOhFour = async () => {
    const page = await openPage(site);
    // the browser logs the document's own 404 status as a console error: that line is the address's, not the page's;
    // any other 4xx (a stylesheet, an icon) stays a defect
    const bad = []; page.on('response', (r) => { if (r.status() >= 400) bad.push(r.url().replace(site.base, '/') + ' ' + r.status()); });
    const ownStatus = (addresses) => { const extra = bad.filter((b) => !addresses.some((a) => b === a + ' 404')); t.check(extra.length === 0, `404: no file of the page is missing (${addresses.join(', ')})`, bad); bad.length = 0; if (!extra.length) dropOwn(page, /^Failed to load resource: the server responded with a status of 404/); };
    const resp = await page.goto(site.base + 'js/', { waitUntil: 'load' }); await sleep(300);
    const nf = await page.evaluate(() => ({
      title: document.title, notFound: document.body.classList.contains('not-found'), h1: document.querySelector('h1').textContent,
      font: getComputedStyle(document.querySelector('h1')).fontFamily, styled: getComputedStyle(document.querySelector('.not-found-card')).borderRadius,
      links: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      csp: (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content, robots: (document.querySelector('meta[name="robots"]') || {}).content,
      themes: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.media),
    }));
    t.check(resp && resp.status() === 404 && nf.notFound && /Page not found/.test(nf.title) && /isn’t here/.test(nf.h1), '404: a folder address gets the not-found page with status 404', { status: resp && resp.status(), ...nf });
    t.check(/Bricolage/.test(nf.font) && nf.styled === '12px', '404: styles.css and the fonts apply (root-absolute paths)', { font: nf.font, radius: nf.styled });
    t.check(nf.links.join() === '/,/#paint,/#game,/#battle,/#loomis,/#pose,/#figure,/#help', '404: the home link and the seven hash shortcuts, root-absolute', nf.links);
    const headers = fs.readFileSync(path.join(site.root, '_headers'), 'utf8');
    const hostCsp = (/Content-Security-Policy:\s*(.+)/.exec(headers) || [, ''])[1].trim();
    const indexCsp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync(path.join(site.root, 'index.html'), 'utf8')) || [, ''])[1];
    t.check(nf.csp === hostCsp && nf.csp === indexCsp, '404: its policy is the same as _headers and index.html', { page: nf.csp, host: hostCsp });
    t.check(nf.robots === 'noindex' && nf.themes.length === 2, '404: noindex and both theme colours', nf);
    t.check((await hscroll(page)) <= 0, '404 desktop: no horizontal scroll');
    ownStatus(['/js/']);
    await clean(t, page, '404 desktop');
    // every shortcut opens its tab
    for (const [href, want] of [['/#game', 'tab-game'], ['/#help', 'tab-help'], ['/', 'tab-study']]) {
      await page.goto(site.base + 'nowhere', { waitUntil: 'load' });
      await navigate(page, () => page.click(`a[href="${href}"]`)); await sleep(500);
      const shown = await page.evaluate(() => [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id));
      t.check(shown.join() === want, `404: the ${href} link opens ${want}`, shown);
    }
    ownStatus(['/nowhere', '/nowhere', '/nowhere']);
    await clean(t, page, '404 links');
    await page.context().close();
    const phone = await openPage(site, { viewport: PHONE, dark: true });
    const pbad = []; phone.on('response', (r) => { if (r.status() >= 400) pbad.push(r.url().replace(site.base, '/') + ' ' + r.status()); });
    await phone.goto(site.base + 'missing-page', { waitUntil: 'load' }); await sleep(300);
    const d = await phone.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, card: document.querySelector('.not-found-card').getBoundingClientRect().right, w: window.innerWidth }));
    t.check(d.bg === 'rgb(21, 32, 25)' && d.card <= d.w && (await hscroll(phone)) <= 0, '404 phone, dark: the dark ground, the card fits', d);
    await screenshot(phone, 'app-shell-404-phone-dark');
    t.check(pbad.join() === '/missing-page 404', '404 phone: only the address itself is 404', pbad);
    if (pbad.join() === '/missing-page 404') dropOwn(phone, /^Failed to load resource: the server responded with a status of 404/);
    await clean(t, phone, '404 phone');
    await phone.context().close();
  };
  const oldBrowserLegs = async () => {
    // the other legs of guard.js's check: no <dialog> (Safari 15.3 and older), no Promise.prototype.finally
    for (const leg of ['dialog', 'finally']) {
      const page = await openPage(site);
      await page.evaluate(() => { localStorage.setItem('portrait-value-studio.mode', 'advanced'); localStorage.setItem('pose-and-light.mode', 'advanced'); });
      await page.addInitScript((leg) => { if (leg === 'dialog') delete window.HTMLDialogElement; else delete Promise.prototype.finally; }, leg);
      await page.goto(site.base, { waitUntil: 'load' }); await sleep(600);
      const f = await fallback(page);
      t.check(f.cls.includes('old-browser') && f.old === 'block' && f.tabs === 'none' && f.help === 'block', `old browser without ${leg === 'dialog' ? 'HTMLDialogElement' : 'Promise.prototype.finally'}: the standing note and the guide`, f);
      if (leg === 'dialog') {
        // Forget is the one control shown there: it still clears and reloads
        await click(page, '#forgetBtn'); await navigate(page, () => click(page, '#forgetBtn')); await sleep(500);
        t.check((await siteKeys(page)).length === 0, 'old browser: Forget clears every key and reloads', await siteKeys(page));
      }
      await clean(t, page, `old browser without ${leg}`);
      await page.context().close();
    }
  };
  await Promise.all([resetOfferGone(), (async () => { await fourOhFour(); await oldBrowserLegs(); })()]);

  // ---- the toast: lifetime, the guard's cap, the two timers, long notes on a phone ---------------
  {
    const page = await openPage(site);
    await page.evaluate(() => window.Studio.toast('A passing note'));
    t.check((await toastState(page)).show, 'toast: a note shows');
    const hid = await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 3500 }).then(() => true).catch(() => false);
    t.check(hid, 'toast: a passing note goes within about 2 s');
    // the guard's note: 6 s, and at most three a visit
    const boom = () => page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'boom' })));
    await boom();
    let g = await toastState(page);
    t.check(g.show && g.text === APP_FAILED, 'toast: an error after load shows the guard\'s note', g);
    const hid2 = await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 8000 }).then(() => true).catch(() => false);
    t.check(hid2, 'toast: the guard\'s note goes after about 6 s');
    await boom(); await boom();
    await page.evaluate(() => { const e = document.getElementById('toast'); e.classList.remove('show'); e.textContent = ''; });
    await boom(); g = await toastState(page);
    t.check(!g.show && g.text === '', 'toast: a fourth error note in a visit is not shown (three at most)', g);
    await page.evaluate(() => window.StudioGuard.report(new Error('test: later saved-state error'), { saved: true })); dropOwn(page, /test: later/);
    g = await toastState(page);
    t.note(`toast: after three error notes a saved-state error gets ${g.show ? 'a note' : 'no note and no reset offer'} (guard.js:56 counts every note against the same cap of three).`);
    await clean(t, page, 'toast cap');
    await page.context().close();
  }
  {
    // a promise rejected with nothing to catch it, and an error from a module's file once the page has loaded
    const page = await openPage(site);
    await page.evaluate(() => { Promise.reject(new Error('test: unhandled')); });
    await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'), null, { timeout: 2000 }).catch(() => null);
    const r = await toastState(page);
    t.check(r.show && r.text === APP_FAILED, 'toast: an unhandled rejection shows the guard\'s note', r);
    await page.evaluate((base) => window.dispatchEvent(new ErrorEvent('error', { message: 'test: late', filename: base + 'js/painting.js', lineno: 1 })), site.base);
    const late = await page.evaluate(() => ({ text: document.getElementById('toast').textContent, cls: document.documentElement.className.trim(), studio: !document.getElementById('tabPaintBtn').hidden }));
    t.check(late.text === APP_FAILED && late.cls === '' && late.studio, 'toast: an error from js/painting.js after load is a note, not the Studio taken off the menu', late);
    dropErrors(page, /test: unhandled/);
    await clean(t, page, 'toast rejection');
    await page.context().close();
  }
  {
    // the two timers: an app note's own timer (app.js:159-166) is not cleared by the guard's note (guard.js:71-73)
    const seen = [];
    for (const round of [1, 2]) {
      const page = await openPage(site);
      await page.evaluate(() => { window.Studio.toast('Copied #000000'); window.StudioGuard.report(new Error('test: saved state'), { saved: true }); });
      dropOwn(page, /test: saved state/);
      const at0 = await toastState(page);
      const vanished = await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 4000 }).then(() => true).catch(() => false);
      const at4 = await toastState(page);
      seen.push({ at0, vanished, at4 });
      t.check(at0.button === 'Reset settings and saved painting' && !vanished, `toast timers ${round}: the reset offer, shown right after an app note, stays its 20 s`, { at0, vanished, at4 });
      await clean(t, page, `toast timers ${round}`);
      await page.context().close();
    }
    if (seen.every((x) => x.vanished)) t.finding({ title: 'The guard\'s reset offer is hidden early by an app note\'s timer that was still running', severity: 'low', steps: 'With the app loaded: Studio.toast("Copied #000000") (any app note, 1.8 s), then within that time StudioGuard.report(err, { saved: true }) (a saved-state failure). Wait 2 s.', expected: 'The note "Your saved settings or painting could not be read." with its reset button stays 20 s (guard.js:73).', actual: `The toast is hidden after about 1.8 s: app.js:165 keeps its own toastTimer and guard.js:71-73 clears only the guard's, so the earlier timer removes the class "show". The reverse happens too (a guard note's 6 s timer cuts a later app note). Seen: ${JSON.stringify(seen[0])}`, cause: 'js/app.js:159-166 and js/guard.js:71-73: two hide timers on one toast, each clearing only its own' });
  }
  {
    const page = await openPage(site, { viewport: PHONE });
    const long = 'The painting could not be saved: browser storage is full. It stays for this visit only. Remove something saved and try again, then paint on.';
    await page.evaluate((m) => window.Studio.toast(m, 5000), long);
    const box = await page.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), w: window.innerWidth, h: window.innerHeight }; });
    t.check(box.left >= 0 && box.right <= box.w && box.bottom <= box.h, 'toast phone: a long note fits the screen', box);
    await page.evaluate(() => window.StudioGuard.report(new Error('test: saved state'), { saved: true })); dropOwn(page, /test: saved state/);
    const offer = await page.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(); const b = document.querySelector('#toast .toast-action').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), bLeft: Math.round(b.left), bRight: Math.round(b.right), bH: Math.round(b.height), w: window.innerWidth }; });
    t.check(offer.left >= 0 && offer.right <= offer.w && offer.bLeft >= 0 && offer.bRight <= offer.w && offer.bH >= 20, 'toast phone: the reset offer and its button fit the screen', offer);
    await screenshot(page, 'app-shell-phone-reset-offer');
    // the menus on a phone fit the screen, and stay on it when the window is widened past 640 with one open
    await page.click('#tabLearnBtn'); await settle(page);
    const menuBox = (id) => page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { open: !document.getElementById(id).hidden, left: Math.round(r.left), right: Math.round(r.right), w: window.innerWidth, items: [...document.querySelectorAll(`#${id} .tab-item`)].every((b) => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= window.innerWidth && q.height > 30; }) }; }, id);
    const lm = await menuBox('tabLearnMenu');
    t.check(lm.left >= 0 && lm.right <= lm.w && lm.items && (await hscroll(page)) <= 0, 'phone: the Learning tools menu fits the screen', lm);
    await screenshot(page, 'app-shell-phone-learn-menu');
    const across = [];
    for (const w of [1400, 700, 390]) { await atWidth(page, w, w < 500 ? 844 : 900); across.push({ w, ...(await menuBox('tabLearnMenu')), hs: await hscroll(page) }); }
    t.check(across.every((m) => m.open && m.left >= 0 && m.right <= m.w && m.hs <= 0), 'phone: an open menu stays inside the window while it is widened to 1400 and narrowed back', across);
    await page.click('#tabGamesBtn'); await settle(page);
    const gm = { ...(await menuBox('tabGamesMenu')), learn: await page.evaluate(() => !document.getElementById('tabLearnMenu').hidden) };
    t.check(gm.open && !gm.learn && gm.left >= 0 && gm.right <= gm.w && (await hscroll(page)) <= 0, 'phone: the Games menu fits the screen and the other closed', gm);
    await page.keyboard.press('Escape');
    // with the Studio's strip, the Loomis strip or a Figure class along the bottom, a note sits above it
    const above = async (name) => {
      await page.evaluate(() => window.Studio.toast('A note above the strip', 4000)); await settle(page);
      return page.evaluate((name) => { const t = document.getElementById('toast').getBoundingClientRect(); const s = [...document.querySelectorAll(`#tab-${name} .ps-strip`)].find((e) => e.getBoundingClientRect().height > 0); const r = s && s.getBoundingClientRect(); return { toastBottom: Math.round(t.bottom), toastLeft: Math.round(t.left), toastRight: Math.round(t.right), stripTop: r ? Math.round(r.top) : null, w: window.innerWidth }; }, name);
    };
    for (const name of ['paint', 'loomis']) {
      await tab(page, name);
      const a = await above(name);
      t.check(a.stripTop !== null && a.toastBottom <= a.stripTop && a.toastLeft >= 0 && a.toastRight <= a.w, `toast phone ${name}: a note sits above the strip along the bottom`, a);
    }
    await tab(page, 'figure');
    await page.waitForFunction(() => !document.getElementById('fig-start').disabled, null, { timeout: 20000 }).catch(() => null);
    await click(page, '#fig-start');
    await page.waitForFunction(() => { const s = document.querySelector('.fig-studio'); return s && !s.hidden && document.body.classList.contains('figure-focus'); }, null, { timeout: 20000 }).catch(() => null);
    const a = await above('figure');
    t.check(a.stripTop !== null && a.toastBottom <= a.stripTop, 'toast phone figure: during a class a note sits above the class\'s strip', a);
    await screenshot(page, 'app-shell-phone-toast-in-class');
    await clean(t, page, 'phone toast and menus');
    await page.context().close();
  }

  // ---- Forget: the arm times out, a save still pending, during a game and during a Figure class ---------
  {
    const page = await openPage(site);
    await tab(page, 'help');
    const idle = await text(page, '#forgetBtn');
    await click(page, '#forgetBtn');
    t.check(/Tap again/.test(await text(page, '#forgetBtn')), 'forget: the first tap arms', await text(page, '#forgetBtn'));
    const disarmed = await page.waitForFunction((idle) => document.getElementById('forgetBtn').textContent === idle, idle, { timeout: 7000 }).then(() => true).catch(() => false);
    t.check(disarmed, 'forget: an unconfirmed tap disarms after 5 s', await text(page, '#forgetBtn'));
    // a stroke whose autosave is still waiting (0 ms: within the 800 ms delay; 900 ms: while it encodes), then Forget
    for (const wait of [0, 900]) {
      await tab(page, 'paint'); await sleep(600);
      await stroke(page, '#ps-paper', [[0.2, 0.2], [0.6, 0.5], [0.4, 0.8]]);
      if (wait) await sleep(wait);
      await navigate(page, () => page.evaluate(() => { window.Studio.go('help'); const b = document.getElementById('forgetBtn'); b.click(); b.click(); }));
      await sleep(1200);
      const rec = await dbRecord(page);
      await tab(page, 'paint'); await sleep(800);
      const ink = await inked(page, '#ps-paper');
      t.check(rec !== 'record' && ink === 0, `forget ${wait} ms after a stroke: the pending save does not bring the painting back`, { rec, ink });
    }
    // during a game, with the host's and near-miss keys beside the site's
    await tab(page, 'game');
    await page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 30000 }).catch(() => null);
    await click(page, '#gameStart');
    await page.waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
    const inGame = await page.evaluate(() => ({ play: !document.getElementById('gamePlay').hidden, keys: Object.keys(localStorage).filter((k) => k.startsWith('portrait-value-studio.')).length }));
    t.check(inGame.play && inGame.keys > 0, 'forget: a game is on and has written its settings', inGame);
    const OTHERS = { 'host.key': 'x', 'portrait-value-studio': 'y', 'xportrait-value-studio.mode': 'z', 'pose-and-light': 'w' };
    await page.evaluate((o) => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); localStorage.setItem('portrait-value-studio.zzz', '1'); localStorage.setItem('portrait-value-studio.forget', '0'); localStorage.setItem('pose-and-light.zzz', '1'); }, OTHERS);
    await tab(page, 'help');
    await click(page, '#forgetBtn'); await navigate(page, () => click(page, '#forgetBtn')); await sleep(2000);
    const afterGame = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), all: Object.keys(localStorage).sort(), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), focus: document.body.classList.contains('game-focus'), play: !document.getElementById('gamePlay').hidden }));
    t.check(afterGame.keys.length === 0 && afterGame.shown.join() === 'tab-study' && !afterGame.focus && !afterGame.play, 'forget during a game: nothing kept, a fresh page on the Study tab', afterGame);
    t.check(afterGame.all.join() === Object.keys(OTHERS).sort().join(), 'forget: keys outside the two prefixes (the host page\'s, "portrait-value-studio" without its dot, near misses) are left alone', afterGame.all);
    await clean(t, page, 'forget during a game');
    // during a Figure class: first leave it through the top bar and come back (a desktop keeps the tabs in a class)
    await tab(page, 'figure');
    await click(page, '#fig-start');
    await page.waitForFunction(() => { const s = document.querySelector('.fig-studio'); return s && !s.hidden; }, null, { timeout: 30000 }).catch(() => null);
    await sleep(1500);
    await stroke(page, '#fs-paper');
    const ink0 = await inked(page, '#fs-paper');
    const inClass = await page.evaluate(() => ({ draw: !document.querySelector('.fig-studio').hidden, focus: document.body.classList.contains('figure-focus'), keys: Object.keys(localStorage).filter((k) => k.startsWith('portrait-value-studio.')) }));
    t.check(inClass.draw && ink0 > 50, 'forget: a class is on with a stroke on its paper', inClass);
    await page.click('#tabLearnBtn'); await page.click('#tabStudyBtn'); await waitShown(page, 'tab-study');
    await page.click('#tabFigureBtn'); await waitShown(page, 'tab-figure'); await sleep(400);
    const back = { draw: await page.evaluate(() => !document.querySelector('.fig-studio').hidden), ink: await inked(page, '#fs-paper'), bar: await page.evaluate(() => (document.querySelector('.fig-bar') || {}).textContent.replace(/\s+/g, ' ').trim().slice(0, 60)) };
    t.check(back.draw && back.ink === ink0, 'class: Study the photo and back through the top bar mid-class keeps the class and its drawing', { ink0, ...back });
    await tab(page, 'help');
    await click(page, '#forgetBtn'); await navigate(page, () => click(page, '#forgetBtn')); await sleep(2000);
    const afterClass = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), focus: document.body.classList.contains('figure-focus'), draw: !document.querySelector('.fig-studio').hidden }));
    t.check(afterClass.keys.length === 0 && afterClass.shown.join() === 'tab-study' && !afterClass.focus && !afterClass.draw, 'forget during a Figure class: nothing kept, the class gone, a fresh page', afterClass);
    await clean(t, page, 'forget during a class');
    await page.context().close();
  }

  // ---- inside another site's sandboxed frame: the save dialog, the settings kept apart, Forget, the Studio ----
  {
    const page = await openPage(site, { sandbox: {} });
    const fr = page.app;
    await fr.waitForFunction(() => window.Studio && Studio.result && Studio.result(), null, { timeout: 30000 }).catch(() => null);
    // README: "including a sandboxed one ..., where the fonts and the save dialog must still work"
    await fr.focus('[data-save="block"]'); await page.keyboard.press('Enter');
    await fr.waitForFunction(() => { const d = document.getElementById('saveDialog'); const i = document.getElementById('saveImg'); return d.open && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => null);
    const dlg = await fr.evaluate(() => { const i = document.getElementById('saveImg'); return { open: document.getElementById('saveDialog').open, src: i.src.slice(0, 10), w: i.naturalWidth, name: document.getElementById('saveName').textContent, alt: i.alt, fonts: document.fonts.status }; });
    t.check(dlg.open && dlg.src === 'blob:null' && dlg.w > 0 && /-color-blocks\.png$/.test(dlg.name) && dlg.fonts === 'loaded', 'sandboxed embed: Save PNG opens the save-by-hand dialog with the picture and its name', dlg);
    await screenshot(page, 'app-shell-sandbox-save');
    await page.keyboard.press('Enter'); // the dialog's first control is Close
    await fr.waitForFunction(() => !document.getElementById('saveDialog').open, null, { timeout: 2000 }).catch(() => null);
    const closed = await fr.evaluate(() => ({ open: document.getElementById('saveDialog').open, focus: document.activeElement && document.activeElement.dataset.save, src: document.getElementById('saveImg').getAttribute('src') }));
    t.check(!closed.open && closed.focus === 'block' && closed.src === null, 'sandboxed embed: Close shuts it, lets the picture go and puts the focus back on Save PNG', closed);
    await clean(t, page, 'sandboxed embed save');
    // Advanced chosen in the embed is not the site's choice (the browser keeps the two apart)
    await fr.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    const top = await page.context().newPage(); await top.goto(site.base, { waitUntil: 'load' }); await sleep(400);
    const apart = { embedSimple: await fr.evaluate(() => document.body.classList.contains('mode-simple')), siteSimple: await top.evaluate(() => document.body.classList.contains('mode-simple')) };
    await top.close();
    t.check(!apart.embedSimple && apart.siteSimple, 'sandboxed embed: Advanced in the embed leaves the site itself in Simple', apart);
    // the Studio in an opaque origin cannot save: it says so after a stroke
    await fr.evaluate(() => window.Studio.go('paint')); await sleep(800);
    await stroke(page, '#ps-paper', undefined, { frame: fr });
    await fr.waitForFunction(() => /visit only|could not be saved/.test(document.getElementById('toast').textContent), null, { timeout: 5000 }).catch(() => null);
    const said = await fr.evaluate(() => document.getElementById('toast').textContent);
    t.check(/stays for this visit only/.test(said), 'sandboxed embed: the Studio says the painting stays for this visit only', said);
    // Forget in the embed (no storage there at all): the frame starts over cleanly
    await fr.evaluate(() => { window.Studio.go('help'); const b = document.getElementById('forgetBtn'); b.click(); b.click(); });
    await sleep(500);
    await fr.waitForFunction(() => document.readyState === 'complete' && window.Studio && !document.getElementById('forgetBtn').disabled, null, { timeout: 10000 }).catch(() => null);
    const after = await fr.evaluate(() => ({ shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), simple: document.body.classList.contains('mode-simple') })).catch((e) => ({ error: String(e).slice(0, 100) }));
    t.check(after.shown && after.shown.join() === 'tab-study' && after.simple, 'sandboxed embed: Forget reloads the frame to a fresh Simple page', after);
    await clean(t, page, 'sandboxed embed forget');
    await page.context().close();
  }

  // ---- a module the guard took off the menu: the menus by keyboard, the guide's buttons, the tab bar ----
  {
    // painting.js missing takes the Studio, Figure study and the Loomis head with it; game.js missing takes Paint by numbers
    const page = await openPage(site, { block: [site.base + 'js/game.js', site.base + 'js/painting.js'] });
    dropOwn(page, /did not (load|finish loading)|ERR_FAILED/);
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.tab-item, .tab')].filter((b) => b.hidden).map((b) => b.id));
    t.check(['tabGameBtn', 'tabPaintBtn', 'tabFigureBtn', 'tabLoomisBtn'].every((id) => hidden.includes(id)), 'missing modules: Paint by numbers, Studio, Figure study and Loomis head are off the menu', hidden);
    await page.focus('#tabGamesBtn'); await page.keyboard.press('ArrowDown');
    const g1 = await shell(page);
    await page.keyboard.press('ArrowDown');
    const g2 = await shell(page);
    const gamesOk = g1.gamesOpen && g1.active === 'tabBattleBtn';
    t.check(gamesOk, 'missing modules: ArrowDown on Games opens it on Value battle, the item left', { first: g1, second: g2 });
    await page.keyboard.press('Escape');
    await page.focus('#tabLearnBtn'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    const l1 = await shell(page);
    const learnOk = l1.learnOpen && l1.active === 'tabPoseBtn';
    t.check(learnOk, 'missing modules: ArrowDown from Study the photo steps over the hidden Loomis head to Pose and light', l1);
    await page.keyboard.press('Escape');
    if (!gamesOk || !learnOk) t.finding({ title: 'When the guard has taken a page off a tab menu, the arrow keys get stuck on the hidden item: the keyboard cannot open Games on its last game, or step past a missing Loomis head', severity: 'low', steps: 'Serve the site with js/game.js failing (Paint by numbers leaves the menu) and js/painting.js failing (Studio, Figure study and Loomis head leave). Focus Games and press ArrowDown, then ArrowDown again. Focus Learning tools, press ArrowDown, then ArrowDown.', expected: 'The menu opens on Value battle; in Learning tools ArrowDown goes from Study the photo to Pose and light (ARIA menus skip hidden items).', actual: `Games: the menu opens but the focus stays on the button (${g1.active}) and the next ArrowDown closes it (open: ${g2.gamesOpen}). Learning tools: ArrowDown from Study the photo stays on ${l1.active}, so Pose and light and How to use cannot be reached by arrows. js/app.js:2241 focuses menu.querySelector('.tab-item'), the hidden first item, and 2245-2246 walk every .tab-item, hidden ones included; focus() on a hidden button does nothing.`, cause: 'js/app.js:2241 and 2245-2246: the menu items are not filtered by hidden' });
    // the guide's "Go to Studio" with no Studio
    await tab(page, 'help');
    const goStudio = await page.evaluate(() => { const b = document.querySelector('[data-go="paint"]'); return { shown: b.getClientRects().length > 0, text: b.textContent }; });
    await click(page, '[data-go="paint"]'); await settle(page);
    const landed = { ...(await shell(page)), toast: (await toastState(page)).text, partNote: await visible(page, '.partfail-note') };
    t.check(!goStudio.shown || /Studio/.test(landed.toast), 'missing modules: the guide does not offer "Go to Studio" when the Studio did not start (or says why it lands elsewhere)', { goStudio, landed });
    if (goStudio.shown && !/Studio/.test(landed.toast)) t.finding({ title: 'With the Studio off the menu (painting.js failed), the guide still offers "Go to Studio", which opens Study the photo without a word', severity: 'low', steps: 'Serve the site with js/painting.js failing. Open How to use and press "Go to Studio" in the four-step path.', expected: 'The button leaves with the Studio, as the guard does for "Use my Studio painting" (guard.js:88), or the page says the Studio did not start.', actual: `"${goStudio.text}" is shown; pressing it opens ${landed.shown.join()} (switchTab's hidden-item fallback, js/app.js:2187) with no note beyond the standing "Part of Portrait Value Studio did not start" at the top.`, cause: 'js/guard.js:88 hides #artFromStudio only; js/app.js:2638-2642 route [data-go="paint"] to the fallback' });
    await clean(t, page, 'missing modules');
    await page.context().close();
  }
  {
    // both games missing: the Games group leaves the bar; the bar should not keep an empty column. And pose.html missing.
    const page = await openPage(site, { viewport: PHONE, block: [site.base + 'js/game.js', site.base + 'js/battle.js'] });
    dropOwn(page, /did not (load|finish loading)|ERR_FAILED/);
    const bar = await page.evaluate(() => { const nav = document.querySelector('.tabs').getBoundingClientRect(); const shown = [...document.querySelectorAll('.tabs > *')].filter((e) => !e.hidden && e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect()); const last = shown[shown.length - 1]; return { groups: shown.length, gamesHidden: document.querySelector('[data-group="games"]').hidden, emptyRight: Math.round(nav.right - last.right), cols: getComputedStyle(document.querySelector('.tabs')).gridTemplateColumns }; });
    t.check(bar.gamesHidden && bar.groups === 3, 'missing games: the Games group leaves the bar', bar);
    t.check(bar.emptyRight <= 2 && (await hscroll(page)) <= 0, 'missing games: the three sections left fill the bar (no empty column)', bar);
    if (bar.gamesHidden && bar.emptyRight > 2) t.finding({ title: 'With both games failed, the Games group leaves the tab bar but its column stays empty', severity: 'low', steps: 'Serve the site with js/game.js and js/battle.js failing (the guard hides the Games group). Look at the tab bar at 390 px (and 1400 px).', expected: 'Learning tools, Studio and Figure study share the bar.', actual: `The three sections keep a quarter of the bar each and a blank ${bar.emptyRight} px column is left on the right (grid-template-columns: ${bar.cols}).`, cause: 'styles.css:348 .tabs { grid-template-columns: repeat(4, minmax(0, 1fr)) } whatever the guard hides' });
    await screenshot(page, 'app-shell-phone-no-games');
    // pose.html answered 404 (a partial deploy): what the Pose tab shows
    await page.route(site.base + 'pose.html*', (r) => r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(site.root, '404.html'), 'utf8') }));
    await tab(page, 'pose', { wait: false });
    await page.waitForFunction(() => { const f = document.getElementById('poseFrame'); return f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.title; }, null, { timeout: 6000 }).catch(() => null);
    const pose = await page.evaluate(() => { const f = document.getElementById('poseFrame'); return { title: f.contentDocument && f.contentDocument.title, h: f.style.height, rect: Math.round(f.getBoundingClientRect().height), toast: document.getElementById('toast').textContent }; });
    t.note(`pose.html missing (a partial deploy, which the README warns breaks the page): the Pose tab frames "${pose.title}" at the stylesheet's ${pose.rect} px, the app says nothing ("${pose.toast}"), and the frame's "Open Portrait Value Studio" link would load the whole app inside the Pose tab.`);
    dropOwn(page, /status of 404/);
    await clean(t, page, 'missing games');
    await page.context().close();
  }

  // ---- mid-action: a photo loaded from the Help tab; tabs and the mode switched while the study is busy ----
  {
    const page = await openPage(site);
    await tab(page, 'help');
    const before = await page.evaluate(() => document.getElementById('source').textContent);
    const outcomes = [];
    for (let i = 0; i < 2; i++) {
      await loadPhoto(page, await makeImage(page, { width: 700, height: 900, name: `friend-${i}.jpg`, type: 'image/jpeg' }), { settle: 800 });
      outcomes.push({ ...(await shell(page)), toast: (await toastState(page)).text, source: await page.evaluate(() => document.getElementById('source').textContent) });
    }
    const told = outcomes.every((o) => o.shown.join() === 'tab-study' || /photo|loaded|Study/i.test(o.toast));
    t.check(told, 'help: Load photo while on the guide shows the study or says where the photo went', outcomes.map((o) => ({ shown: o.shown, toast: o.toast, source: o.source.slice(0, 40) })));
    if (!told) t.finding({ title: 'Load photo pressed on the How to use tab (or any tab without the pictures) gives no visible result', severity: 'medium', steps: 'Open How to use (desktop: the top bar with Load photo stays in view). Press Load photo and choose a portrait.', expected: 'The Study tab opens with the new photo, or a note says the photo is in Study the photo.', actual: `The guide stays open and no note appears; the studies change behind it (js/app.js:594-597, the input's change → loadFile 538 → useSource 544-561, never switches the tab or says where the photo went; the source line reads "${outcomes[0].source.slice(0, 60)}").`, cause: 'js/app.js:544-561: useSource toasts only about marks or a reduced size, and never opens the Study tab' });
    t.note(`help: before the load the source line read "${before.slice(0, 50)}".`);
    // tabs, and Simple/Advanced, switched while the study is busy with a big photo
    await tab(page, 'study');
    await page.setInputFiles('#file', await makeImage(page, { width: 3600, height: 3600, type: 'image/jpeg', name: 'big.jpg' }));
    await page.waitForFunction(() => !document.getElementById('busy').hidden, null, { timeout: 5000 }).catch(() => null);
    for (const name of ['paint', 'help', 'game', 'study']) await tab(page, name, { wait: false });
    await click(page, '[data-mode="advanced"]'); await click(page, '[data-mode="simple"]');
    await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 60000 }).catch(() => null);
    await sleep(800);
    const end = await page.evaluate(() => ({ src: document.getElementById('source').textContent.slice(0, 40), simple: document.body.classList.contains('mode-simple'), key: localStorage.getItem('portrait-value-studio.mode'), preset: (document.querySelector('input[name="detailPreset"]:checked') || {}).value, sliders: [document.getElementById('simplify').value, document.getElementById('merge').value].join('/'), header: document.getElementById('valuesState').textContent }));
    t.check(/big\.jpg/.test(end.src) && (await shell(page)).shown.join() === 'tab-study', 'busy: switching tabs while a big photo is processed ends on the Study tab with that photo', end);
    t.check(end.simple && end.key === 'simple' && end.preset === 'normal' && end.sliders === '3/4' && /Normal/.test(end.header), 'busy: Advanced then Simple while it works ends Simple, with the Detail preset, the sliders and the header agreeing', end);
    // a photo pasted while the Studio is open: the Studio's reference follows it
    await tab(page, 'paint'); await sleep(500);
    const ref0 = await page.evaluate(() => { const c = document.getElementById('ps-refCanvas'); return c.width + 'x' + c.height; });
    await pasteFile(page, await makeImage(page, { width: 500, height: 900, name: 'pasted.png', draw: 'noise' }));
    await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);
    const ref1 = await page.evaluate(() => { const c = document.getElementById('ps-refCanvas'); return c.width + 'x' + c.height; });
    t.check((await shell(page)).shown.join() === 'tab-paint' && ref1 !== ref0 && /pasted\.png/.test(await page.evaluate(() => document.getElementById('source').textContent)), 'paste on the Studio: the Studio stays open and its reference shows the pasted photo', { ref0, ref1 });
    await clean(t, page, 'mid-action');
    await page.context().close();
  }

  // ---- a tab left in the middle of a stroke (last: a page that hangs is closed, not reused) ----------
  {
    const page = await openPage(site);
    await page.click('#tabPaintBtn'); await waitShown(page, 'tab-paint'); await sleep(800); // the focus stays on the Studio button
    const b = await page.locator('#ps-paper').boundingBox();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4, { steps: 4 });
    const from = await page.evaluate(() => document.activeElement.id);
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); // the next section button, Figure study, with the mouse still down
    const opened = await page.evaluate(() => window.Studio.tab());
    const moved = await within(page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 3 }), 6000);
    const alive = moved && await within(page.evaluate(() => 1), 4000);
    t.check(opened === 'figure' && alive, 'mid-stroke: leaving the Studio by keyboard with the mouse still down leaves the page responsive', { from, opened, moved, alive });
    if (opened === 'figure' && !alive) t.finding({ title: 'Leaving the Studio while a stroke is held freezes the page: the next pointer move runs an endless loop', severity: 'high', steps: 'Desktop. Press the Studio section button (the focus stays on it), press the mouse on the paper and, holding it, press Tab and Enter (Figure study opens). Move the mouse.', expected: 'The stroke ends when the paper is hidden (or the move is ignored); the page keeps answering.', actual: 'The page stops answering at once (no script, no input; Chromium offers to kill the page). The paper keeps the pointer capture while hidden, so the move still reaches its pointermove handler; pos() divides by the hidden paper\'s width and height of 0 and gives Infinity, and segment() then stamps Math.ceil(Infinity / spacing) = Infinity dabs in a for loop that never ends.', cause: 'js/painting.js:336 (pos: (clientX - r.left) / r.width with r.width 0) and js/painting.js:329-331 (n = Math.ceil(d / spacing()) unbounded); nothing ends the stroke on studio:tab or releases the capture' });
    if (alive) { await page.mouse.up(); await clean(t, page, 'mid-stroke'); }
    await within(page.context().close(), 10000);
  }
  t.note('Not driven: Forget while another tab keeps the database open without reloading. The Studio opens the database only for each read or write and closes it again (painting.js dbPut/dbGet), so another tab holds no connection between saves; the multitab case covers Forget across two tabs.');
}
