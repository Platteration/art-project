// The app shell and everything cross-cutting: the tab menus by keyboard, the focus order, the Help tab's
// jump buttons and screenshots, Simple and Advanced across reloads and the Pose frame, dark mode and
// reduced motion on every tab, live resizes between 390 and 1400 on every tab, hash routing (back and
// forward), the old-browser note, storage blocked outright, saved state of hostile shape for every key
// the shell reads, the guard's reset offer, Forget during a game and a Figure class, the 404 page and
// the toast's lifetime. README: "Simple and Advanced", "How to use", "Settings", the guard parts of
// "Publishing"; source: js/app.js, js/guard.js, styles.css (.no-js/.old-browser/.load-failed/
// .part-failed/.all-failed), 404.html.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, clean, tab, TABS, DESKTOP, PHONE, poseFrame, stroke, inked, storageKeys, click, text, visible, hscroll, screenshot, sleep, makeImage, loadPhoto, ROOT } from '../lib.mjs';

const SAVED_FAILED = 'Your saved settings or painting could not be read.';
const APP_FAILED = 'Something went wrong in the app. If a control stops responding, reload the page.';
const PVS = 'portrait-value-studio.';

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
  hash: location.hash,
}));
const toastState = (page) => page.evaluate(() => { const t = document.getElementById('toast'); const b = t.querySelector('button'); return { text: t.textContent, show: t.classList.contains('show'), button: b ? b.textContent : null, disabled: b ? b.disabled : null }; });
const waitShown = (page, id, timeout = 3000) => page.waitForFunction((id) => { const p = document.getElementById(id); return p && !p.hidden; }, id, { timeout }).catch(() => null);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const atWidth = async (page, width, height = 900) => { await page.setViewportSize({ width, height }); await page.waitForFunction((w) => window.innerWidth === w, width, { timeout: 3000 }).catch(() => null); await settle(page); };
// the console line a deliberate StudioGuard.report() writes is the test's, not the page's
const dropOwn = (page, re) => { page.log.console = page.log.console.filter((m) => !re.test(m)); };
const navigate = (page, fn) => Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => null), fn()]);

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
    // edge: Shift+Tab from the open menu back to its button, then ArrowDown again: the menu should stay open (or open), not close
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Shift+Tab'); s = await shell(page);
    const backOnButton = s.active === 'tabGamesBtn' && s.gamesOpen;
    await page.keyboard.press('ArrowDown'); s = await shell(page);
    const stays = backOnButton && s.gamesOpen && (s.active === 'tabGameBtn' || s.active === 'tabBattleBtn');
    t.check(stays, `menus ${round}: ArrowDown on the button of an open menu moves into it rather than closing it`, s);
    if (!stays && round === 2) t.finding({ title: 'ArrowDown on the button of an already open menu closes the menu instead of moving into it', severity: 'low', steps: 'Focus Games, press ArrowDown (the menu opens, a item has focus), press Shift+Tab (focus returns to the Games button, the menu stays open), press ArrowDown again.', expected: 'The focus moves into the open menu (ARIA menu button pattern: Down Arrow opens the menu and moves focus to an item).', actual: `The menu closes (ArrowDown calls btn.click(), which toggles: js/app.js:2240 and 2235-2238); state ${JSON.stringify(s)}` });
    // edge: Tab out of the open menu: the menu should not stay open behind the focus
    await page.evaluate(() => document.querySelectorAll('.tab-menu').forEach((m) => { m.hidden = true; }));
    await page.focus('#tabLearnBtn'); await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    s = await shell(page);
    const left = s.active !== 'tabStudyBtn' && s.active !== 'tabLoomisBtn' && s.active !== 'tabPoseBtn' && s.active !== 'tabHelpBtn';
    t.check(left && !s.learnOpen, `menus ${round}: Tab out of the Learning menu closes it`, s);
    if (left && s.learnOpen && round === 2) t.finding({ title: 'Tab out of an open tab menu leaves the menu open behind the focus', severity: 'low', steps: 'Focus Learning tools, press ArrowDown (the menu opens), press Tab four times: the focus leaves the menu for the Studio button.', expected: 'The menu closes when the focus leaves it (a keyboard visitor otherwise has an open menu covering the page with nothing to close it but Escape).', actual: `The menu stays open with aria-expanded="true"; nothing closes it on focusout (js/app.js:2233-2246 handle only ArrowDown, ArrowUp and Escape; the pointerdown at 2247 is for the mouse). Focus on ${s.active}` });
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
    const invisible = await page.evaluate(() => { const out = []; for (let i = 0; i < 40; i++) { const e = document.activeElement; if (e && e !== document.body && e.id !== 'file' && (e.offsetWidth === 0 || e.closest('[hidden]'))) out.push(e.id || e.tagName); } return out; });
    t.check(invisible.length === 0, 'focus order: no stop on an invisible control', invisible);
    // Enter on Advanced switches the mode; Enter on Simple switches back
    await page.focus('[data-mode="advanced"]'); await page.keyboard.press('Enter');
    let s = await shell(page);
    t.check(!s.simple && (await page.evaluate(() => document.querySelector('[data-mode="advanced"]').getAttribute('aria-pressed'))) === 'true', 'keyboard: Enter on Advanced switches the mode', s);
    await page.focus('[data-mode="simple"]'); await page.keyboard.press('Space'); s = await shell(page);
    t.check(s.simple, 'keyboard: Space on Simple switches back', s);
    // on the Help tab the focus goes from the sections into the guide, never into a hidden panel
    await tab(page, 'help');
    await page.focus('#tabGamesBtn'); await page.keyboard.press('Tab');
    const next = await page.evaluate(() => { const e = document.activeElement; return { id: e.id || e.textContent.trim().slice(0, 30), inHelp: !!e.closest('#tab-help'), visible: e.offsetWidth > 0 }; });
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
    }));
    t.check(help.steps === 4 && help.goes.join() === 'study,paint,check', 'help: four steps with buttons to Study, Studio and Check a painting', help);
    t.note('help: step 2 (Look at the shapes) has no jump button; steps 1, 3 and 4 do. The README says "with buttons that jump to the part they describe".');
    const want = ['help-start', 'help-study', 'help-tools', 'help-loomis', 'help-pose', 'help-colors', 'help-studio', 'help-figure', 'help-check', 'help-game', 'help-battle', 'help-tips'];
    t.check(help.parts.map((p) => p.id).join() === want.join(), 'help: the twelve parts the README lists, in order', help.parts.map((p) => p.id));
    t.check(help.parts.every((p) => p.h3) && help.parts.every((p) => p.id === 'help-tips' || p.shots > 0) && help.forgetInTips, 'help: every part has a heading, every part but Good to know has a screenshot, Forget sits under Good to know', help.parts);
    // every screenshot: width and height given, from img/help/, an alt, and it loads at the size it claims
    const shots = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('#tab-help img')];
      imgs.forEach((i) => { i.loading = 'eager'; });
      await Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 8000); }))));
      return imgs.map((i) => ({ src: i.getAttribute('src'), w: i.getAttribute('width'), h: i.getAttribute('height'), nw: i.naturalWidth, nh: i.naturalHeight, alt: (i.alt || '').length }));
    });
    const bad = shots.filter((s) => !s.w || !s.h || !s.src.startsWith('img/help/') || !s.alt || s.nw !== +s.w || s.nh !== +s.h || s.nw === 0);
    t.check(shots.length >= 29 && bad.length === 0, `help: all ${shots.length} screenshots have width/height, an alt, come from img/help/ and load at the size they claim`, bad);
    t.check(fs.readdirSync(path.join(site.root, 'img', 'help')).filter((f) => f.endsWith('.jpg')).every((f) => shots.some((s) => s.src === 'img/help/' + f)), 'help: every file in img/help/ is shown by the guide', fs.readdirSync(path.join(site.root, 'img', 'help')));
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
    if (!focusKept) t.finding({ title: 'After a Help jump button is pressed by keyboard, the focus is lost (it stays on the button inside the now hidden guide)', severity: 'low', steps: 'Open How to use, Tab to "Go to Studio", press Enter.', expected: 'The focus moves to the Studio section button (as the menu items do, switchTab(name, true)) or into the Studio.', actual: `document.activeElement is ${after.id}${after.hiddenPanel ? ' inside the hidden help panel' : ''}: js/app.js:2635-2639 call switchTab(go) without focus, so the focus stays on a button that is display:none and the next Tab starts from the top of the page.` });
    await clean(t, page, 'help');
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
    await clean(t, page, 'mode in the app');
    // pose.html on its own keeps a choice of its own (README: pose-and-light.mode)
    const alone = await page.context().newPage();
    await alone.goto(site.base + 'pose.html', { waitUntil: 'load' }); await sleep(800);
    const own = await alone.evaluate(() => ({ simple: document.documentElement.classList.contains('simple'), appKey: localStorage.getItem('portrait-value-studio.mode') }));
    t.check(own.simple && own.appKey === 'advanced', 'mode: pose.html on its own starts Simple while the app is Advanced', own);
    await alone.evaluate(() => document.querySelector('[data-mode="advanced"]').click()); await sleep(200);
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
    // a host page switching with data-theme: the app and the frame follow
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await pf.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', null, { timeout: 3000 }).catch(() => null);
    const sw = { app: await dark(page), frame: await pf.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor })) };
    t.check(sw.app.scheme === 'light' && sw.app.bg === 'rgb(239, 231, 214)' && sw.frame.theme === 'light', 'dark: data-theme="light" on the host overrides the scheme in the app and the frame', sw);
    await clean(t, page, 'dark mode');
    await page.context().close();
  }

  // ---- reduced motion ------------------------------------------------------------------------
  {
    const page = await openPage(site, { reducedMotion: true });
    const rm = await page.evaluate(() => ({ toast: getComputedStyle(document.getElementById('toast')).transitionProperty, caretRule: getComputedStyle(document.querySelector('.drawer > summary'), '::after').transitionProperty, tabCaret: getComputedStyle(document.querySelector('.tab-caret')).transitionDuration }));
    t.check(rm.toast === 'none' && rm.caretRule === 'none', 'reduced motion: the toast and the drawer arrow do not animate', rm);
    if (rm.tabCaret !== '0s') t.note(`reduced motion: the menu caret still rotates over ${rm.tabCaret} (styles.css .tab-caret transition) and the section buttons keep their colour transitions; small, and not promised either way.`);
    await page.evaluate(() => window.Studio.toast('still'));
    t.check((await toastState(page)).show, 'reduced motion: a toast still appears');
    for (const name of ['help', 'paint', 'game']) await tab(page, name);
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
      t.finding({ title: 'A hash shortcut only works at page load: editing the address to #game (or Back/Forward between hashes) while the app is open changes nothing', severity: 'medium', steps: 'Open /#paint. Edit the address bar to /#game and press Enter (a same-document navigation), or press Back and Forward after that.', expected: 'The tab named by the hash opens, as it does when the address is first opened (the 404 page and the README offer these shortcuts as addresses).', actual: `The Studio stays open; the address says #game. js/app.js:2745-2752 read location.hash once in start(); there is no hashchange or popstate listener, and switchTab never writes the hash. Seen: ${JSON.stringify(results[0])}` });
    }
    // the hash does not follow the tab either: a reload returns to the hash's tab, not the one in use
    const page = await openPage(site, { url: '#help' });
    await tab(page, 'battle');
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    const s = await shell(page);
    t.note(`hash: after opening #help, going to Value battle and reloading, the page shows ${s.shown.join()} (the hash still says ${s.hash}); the hash never follows the tab in use, so a reload returns to the hash's tab.`);
    await clean(t, page, 'hash reload');
    await page.context().close();
  }

  // ---- the old-browser note: no ResizeObserver, both widths --------------------------------------
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const page = await openPage(site, { viewport });
    await page.addInitScript(() => { delete window.ResizeObserver; });
    await page.goto(site.base, { waitUntil: 'load' }); await sleep(800);
    const s = await page.evaluate(() => ({
      cls: document.documentElement.className.trim(),
      note: getComputedStyle(document.querySelector('.oldbrowser-note')).display, noteText: document.querySelector('.oldbrowser-note').textContent.slice(0, 60),
      nojs: getComputedStyle(document.querySelector('.nojs-note')).display,
      tabs: getComputedStyle(document.querySelector('.tabs')).display, actions: getComputedStyle(document.querySelector('.topbar-actions')).display, rail: getComputedStyle(document.querySelector('.rail')).display,
      help: getComputedStyle(document.getElementById('tab-help')).display, study: getComputedStyle(document.getElementById('tab-study')).display,
      steps: getComputedStyle(document.querySelector('.help-steps .btn')).display,
      forget: getComputedStyle(document.getElementById('forgetBtn')).display,
    }));
    t.check(s.cls.includes('old-browser') && s.note === 'block' && /too old/.test(s.noteText) && s.nojs === 'none', `old browser ${label}: the standing note says the browser is too old`, s);
    t.check(s.tabs === 'none' && s.actions === 'none' && s.rail === 'none' && s.study === 'none' && s.help === 'block' && s.steps === 'none' && s.forget !== 'none', `old browser ${label}: no controls, the guide reads, Forget still there`, s);
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
    await page.reload({ waitUntil: 'load' }); await sleep(4000);
    const pf = poseFrame(page);
    const s = await page.evaluate(() => ({ cls: document.documentElement.className.trim(), src: document.getElementById('poseFrame').getAttribute('src'), tab: window.Studio && window.Studio.tab() }));
    s.frame = pf ? await pf.evaluate(() => ({ ro: 'ResizeObserver' in window, started: !!window.__poseStarted, failed: document.documentElement.classList.contains('failed'), imgs: document.querySelectorAll('#poses button.has-img').length })).catch(() => 'gone') : null;
    t.check(s.cls.includes('old-browser') && s.tab === 'pose', 'old browser #pose: the note is up and the page opened on the Pose tab', s);
    t.note(`old browser #pose: the hidden Pose frame ${s.frame ? JSON.stringify(s.frame) : 'did not load'}.`);
    const ok = await clean(t, page, 'old browser #pose');
    if (!ok) t.finding({ title: 'In an old browser (no ResizeObserver) opened at #pose, the hidden Pose frame still loads and its script throws', severity: 'low', steps: 'In an init script delete window.ResizeObserver; open index.html#pose.', expected: 'With the old-browser note up and the tabs hidden, the Pose page is not loaded (or fails quietly like a missing three.js).', actual: `html class "${s.cls}", poseFrame src ${s.src}: start() still calls switchTab("pose") (js/app.js:2750) which sets the frame's src, and js/pose.js:1536 constructs a ResizeObserver without a guard, so the frame logs an uncaught ReferenceError.` });
    await page.context().close();
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
    t.note(`storage blocked (no IndexedDB): opening the Studio says "${note1.text}"; after a stroke the toast says "${after.toast.text}". The one-time "saved in this browser" note is rightly withheld (painting.js:860 needs dbOk), and nothing says the painting will not be kept.`);
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
    } else {
      t.check(s.simple, `hostile ${label}: a mode that is not exactly "advanced" reads as Simple`, s);
    }
    const say = await toastState(page);
    t.check(!/could not be read/.test(atLoad.text) && !/could not be read/.test(say.text), `hostile ${label}: no "could not be read" note (every reader falls back silently)`, { atLoad: atLoad.text, now: say.text });
    t.note(`hostile ${label}: toast at load "${atLoad.text}", after the tabs "${say.text}"; ${((Date.now() - t0) / 1000).toFixed(1)} s for ${tabs.length} tabs.`);
    if (label === 'huge arrays and extremes') {
      const unit = await page.evaluate(() => ({ value: document.getElementById('canvasSize').value, note: document.getElementById('toast').textContent }));
      t.note(`hostile: a saved canvas unit of 1e308 shows as "${unit.value}" in Unit on my canvas (app.js:1534 keeps any value over 0; the labels leave it out until the field is changed).`);
    }
    await clean(t, page, `hostile ${label}`);
    await page.context().close();
  }
  t.note('Which saved keys trigger the guard\'s "could not be read" note: none of the localStorage keys. Every reader (app.js restoreDrawers/restoreSmoothing/readPalette/loadCanvasSize, game.js/palette.js/battle.js/painting.js load(), figure.js load(), pose.js restore()) parses inside try/catch and falls back to its default, so the note with its reset offer is reached only through StudioGuard.report(err, { saved: true }) from a Studio restore() that rejects (painting.js:842), which a junk IndexedDB record does not do either: it says "could not be read, so this is a fresh paper" (painting.js:859).');

  // ---- the guard's reset offer: a junk saved painting, then the two-tap reset and what it clears -----
  {
    // (the keys are written by hand, not seeded through openPage: its seed runs again on every reload)
    const page = await openPage(site);
    await page.evaluate(() => { localStorage.setItem('portrait-value-studio.mode', 'advanced'); localStorage.setItem('portrait-value-studio.lean', '80'); localStorage.setItem('pose-and-light.mode', 'advanced'); localStorage.setItem('portrait-value-studio.gameBest', '{"a":1}'); });
    await page.reload({ waitUntil: 'load' }); await sleep(400);
    t.check(!(await shell(page)).simple, 'reset: the seeded Advanced mode is in force');
    await tab(page, 'paint'); await sleep(800);
    await stroke(page, '#ps-paper'); await sleep(2500); // the autosave lands
    const rec = await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('portrait-value-studio', 1); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); if (!db) return 'no db'; const v = await new Promise((res) => { const tx = db.transaction('studio'); const g = tx.objectStore('studio').get('painting'); g.onsuccess = () => res(g.result ? 'record' : 'none'); g.onerror = () => res('error'); }); db.close(); return v; });
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
    const gone = await page.evaluate(async () => { const keys = Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)); const db = await new Promise((res) => { const r = indexedDB.open('portrait-value-studio'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); let record = 'no db'; if (db) { try { record = await new Promise((res) => { const tx = db.transaction('studio'); const g = tx.objectStore('studio').get('painting'); g.onsuccess = () => res(g.result ? 'record' : 'none'); g.onerror = () => res('error'); }); } catch (e) { record = 'no store'; } db.close(); } return { keys, record, simple: document.body.classList.contains('mode-simple'), lean: document.getElementById('lean').value }; });
    t.check(gone.keys.length === 0 && gone.record !== 'record' && gone.simple, 'reset: after the second tap and the reload no key, no record, Simple again', gone);
    await tab(page, 'paint'); await sleep(1500);
    t.check((await inked(page, '#ps-paper')) === 0, 'reset: the paper is blank');
    await clean(t, page, 'reset offer');
    await page.context().close();
  }

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
    if (seen.every((x) => x.vanished)) t.finding({ title: 'The guard\'s reset offer is hidden early by an app note\'s timer that was still running', severity: 'low', steps: 'With the app loaded: Studio.toast("Copied #000000") (any app note, 1.8 s), then within that time StudioGuard.report(err, { saved: true }) (a saved-state failure). Wait 2 s.', expected: 'The note "Your saved settings or painting could not be read." with its reset button stays 20 s (guard.js:73).', actual: `The toast is hidden after about 1.8 s: app.js:165 keeps its own toastTimer and guard.js:71 clears only the guard's, so the earlier timer removes the class "show". The reverse happens too (a guard note's 6 s timer cuts a later app note). Seen: ${JSON.stringify(seen[0])}` });
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
    // the menus on a phone fit the screen
    await page.click('#tabLearnBtn'); await settle(page);
    const lm = await page.evaluate(() => { const r = document.getElementById('tabLearnMenu').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: window.innerWidth, items: [...document.querySelectorAll('#tabLearnMenu .tab-item')].every((b) => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= window.innerWidth && q.height > 30; }) }; });
    t.check(lm.left >= 0 && lm.right <= lm.w && lm.items && (await hscroll(page)) <= 0, 'phone: the Learning tools menu fits the screen', lm);
    await screenshot(page, 'app-shell-phone-learn-menu');
    await page.click('#tabGamesBtn'); await settle(page);
    const gm = await page.evaluate(() => { const r = document.getElementById('tabGamesMenu').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: window.innerWidth, open: !document.getElementById('tabGamesMenu').hidden, learn: !document.getElementById('tabLearnMenu').hidden }; });
    t.check(gm.open && !gm.learn && gm.left >= 0 && gm.right <= gm.w && (await hscroll(page)) <= 0, 'phone: the Games menu fits the screen and the other closed', gm);
    await page.keyboard.press('Escape');
    await clean(t, page, 'phone toast and menus');
    await page.context().close();
  }

  // ---- Forget during a game and during a Figure class; the arm times out ---------------------------
  {
    const page = await openPage(site);
    await tab(page, 'help');
    const idle = await text(page, '#forgetBtn');
    await click(page, '#forgetBtn');
    t.check(/Tap again/.test(await text(page, '#forgetBtn')), 'forget: the first tap arms', await text(page, '#forgetBtn'));
    const disarmed = await page.waitForFunction((idle) => document.getElementById('forgetBtn').textContent === idle, idle, { timeout: 7000 }).then(() => true).catch(() => false);
    t.check(disarmed, 'forget: an unconfirmed tap disarms after 5 s', await text(page, '#forgetBtn'));
    // during a game
    await tab(page, 'game');
    await page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 30000 }).catch(() => null);
    await click(page, '#gameStart');
    await page.waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
    const inGame = await page.evaluate(() => ({ play: !document.getElementById('gamePlay').hidden, keys: Object.keys(localStorage).filter((k) => k.startsWith('portrait-value-studio.')).length }));
    t.check(inGame.play && inGame.keys > 0, 'forget: a game is on and has written its settings', inGame);
    await tab(page, 'help');
    await click(page, '#forgetBtn'); await navigate(page, () => click(page, '#forgetBtn')); await sleep(2000);
    const afterGame = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), focus: document.body.classList.contains('game-focus'), play: !document.getElementById('gamePlay').hidden }));
    t.check(afterGame.keys.length === 0 && afterGame.shown.join() === 'tab-study' && !afterGame.focus && !afterGame.play, 'forget during a game: nothing kept, a fresh page on the Study tab', afterGame);
    await clean(t, page, 'forget during a game');
    // during a Figure class
    await tab(page, 'figure');
    await click(page, '#fig-start');
    await page.waitForFunction(() => { const s = document.querySelector('.fig-studio'); return s && !s.hidden; }, null, { timeout: 30000 }).catch(() => null);
    await sleep(1500);
    await stroke(page, '#fs-paper');
    const inClass = await page.evaluate(() => ({ draw: !document.querySelector('.fig-studio').hidden, focus: document.body.classList.contains('figure-focus'), keys: Object.keys(localStorage).filter((k) => k.startsWith('portrait-value-studio.')) }));
    t.check(inClass.draw && (await inked(page, '#fs-paper')) > 50, 'forget: a class is on with a stroke on its paper', inClass);
    await tab(page, 'help');
    await click(page, '#forgetBtn'); await navigate(page, () => click(page, '#forgetBtn')); await sleep(2000);
    const afterClass = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), focus: document.body.classList.contains('figure-focus'), draw: !document.querySelector('.fig-studio').hidden }));
    t.check(afterClass.keys.length === 0 && afterClass.shown.join() === 'tab-study' && !afterClass.focus && !afterClass.draw, 'forget during a Figure class: nothing kept, the class gone, a fresh page', afterClass);
    await clean(t, page, 'forget during a class');
    await page.context().close();
  }

  // ---- the 404 page: its links, its policy, both widths, dark ---------------------------------------
  {
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
  }

  // ---- mid-action: a photo loaded from the Help tab; tabs switched while the study is busy ------------
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
    t.check(told, 'help: Load photo while on the guide shows the study or says where the photo went', outcomes);
    if (!told) t.finding({ title: 'Load photo pressed on the How to use tab (or any tab without the pictures) gives no visible result', severity: 'medium', steps: 'Open How to use (desktop: the top bar with Load photo stays in view). Press Load photo and choose a portrait.', expected: 'The Study tab opens with the new photo, or a note says the photo is in Study the photo.', actual: `The guide stays open and no note appears; the studies change behind it (js/app.js:591-594 loadFile → useSource → prepareAndRun never switches the tab; the source line reads "${outcomes[0].source.slice(0, 60)}").` });
    t.note(`help: before the load the source line read "${before.slice(0, 50)}".`);
    // tabs switched while the study is busy with a big photo
    await tab(page, 'study');
    await page.setInputFiles('#file', await makeImage(page, { width: 3600, height: 3600, type: 'image/jpeg', name: 'big.jpg' }));
    await page.waitForFunction(() => !document.getElementById('busy').hidden, null, { timeout: 5000 }).catch(() => null);
    for (const name of ['paint', 'help', 'game', 'study']) await tab(page, name, { wait: false });
    await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 60000 }).catch(() => null);
    await sleep(800);
    const src = await page.evaluate(() => document.getElementById('source').textContent);
    t.check(/big\.jpg/.test(src) && (await shell(page)).shown.join() === 'tab-study', 'busy: switching tabs while a big photo is processed ends on the Study tab with that photo', src);
    await clean(t, page, 'mid-action');
    await page.context().close();
  }
}
