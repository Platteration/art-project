// Touch and small screens, played as a phone and a tablet with a real touch screen (a context with hasTouch
// and isMobile, the fingers sent through CDP Input.dispatchTouchEvent so the browser's own gesture handling,
// touch-action and scrolling apply): 390 × 844 upright, 320 × 568, 844 × 390 on its side and a 768 × 1024
// tablet. Every section is reached by a finger at each size and checked for sideways spill; the Study
// tools by touch (the magnifier's tap, a swipe that scrolls, a line, a measure, a plumb point, and two
// fingers on a picture); the Studio's paper (a stroke, a pinch, a resting second finger, a turn of the
// phone mid-stroke, a window cut short as an on-screen keyboard does, a pinch-zoomed page); Paint by numbers
// (a shape and paints tapped, a paint held, the paints swiped, the reference dragged, a turn mid-round);
// Value battle (an answer by finger, a turn mid-round, a short window, a zoomed page); the Loomis head (a
// mark placed by finger across a turn); Pose and light in the app (a swipe on the stage, a pinch, a hand
// dragged); a Figure study pose drawn by finger and turned; the strips' tap targets against their own
// 44 px; and the safe areas (env(safe-area-inset-*), emulated with Emulation.setSafeAreaInsetsOverride:
// the home indicator's 34 px upright, the notch's 47 px either side and 21 px below on its side, as Safari
// gives a page that asks for viewport-fit=cover; the site is a browser page, display "browser", so the
// status bar is outside the page upright and no top inset is set).
import { clean, tab, click, sleep, PHONE, poseFrame, inked } from '../lib.mjs';

const SMALL = { width: 320, height: 568 }, SIDE = { width: 844, height: 390 }, TABLET = { width: 768, height: 1024 };
const NOISE = /GPU stall|GL Driver Message|SwiftShader|WebGL-0x/i;
const LABEL = { study: 'Study the photo', loomis: 'the Loomis head', pose: 'Pose and light', trace: 'Trace onto paper', help: 'How to use', paint: 'the Studio', figure: 'Figure study', game: 'Paint by numbers', battle: 'Value battle' };
const size = (vp) => `${vp.width} × ${vp.height}`;

// one block's failure is one failed check, not the end of the case; the time each took goes in the notes, and
// a page a failed block left open is closed with it
const live = new Set();
async function segment(t, name, fn) {
  const t0 = Date.now();
  try { await fn(); } catch (e) { t.check(false, `${name}: ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  for (const c of live) await c.close().catch(() => null);
  live.clear();
  t.note(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// a phone: a context with a touch screen and the mobile viewport, recording what openPage records (errors,
// console errors, policy violations, requests off the site), with a CDP session for the fingers. insets
// emulates the screen's safe areas before the page loads.
async function openTouch(site, { viewport = PHONE, url = '', insets = null } = {}) {
  const context = await site.browser.newContext({ viewport, hasTouch: true, isMobile: true });
  live.add(context);
  context.on('close', () => live.delete(context));
  const page = await context.newPage();
  const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  page.log = log;
  page.on('pageerror', (e) => log.pageerrors.push(String(e.stack || e.message).slice(0, 400)));
  page.on('console', (m) => { const x = m.text(); if (NOISE.test(x)) return; if (m.type() === 'error') log.console.push(x.slice(0, 300)); else if (m.type() === 'warning') log.warnings.push(x.slice(0, 300)); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) log.offsite.push(u); });
  page.on('requestfailed', (r) => { const u = r.url(); const why = (r.failure() || {}).errorText || ''; if (u.startsWith('blob:') || why === 'net::ERR_ABORTED') return; log.failed.push(u + ' ' + why); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${(e.blockedURI || '').slice(0, 60)} ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber}`); }); });
  page.cdp = await context.newCDPSession(page);
  if (insets) await page.cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  await page.goto(site.base + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Studio && Studio.result(), null, { timeout: 30000 }).catch(() => null);
  return page;
}
// the fingers: each point is [x, y] or [x, y, id]; a point's id is its place in the list unless given
const touch = (page, type, pts = []) => page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id], i) => ({ x, y, id: id === undefined ? i : id })) });
async function swipe(page, from, to, steps = 6) {
  await touch(page, 'touchStart', [from]);
  for (let i = 1; i <= steps; i++) await touch(page, 'touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
  await touch(page, 'touchEnd', []);
}
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// a swipe leaves the page gliding on (a fling): wait until it has held still for six frames
const settle = (page) => page.evaluate(() => new Promise((resolve) => { let last = window.scrollY, still = 0, n = 0; const step = () => { n++; if (window.scrollY === last) still++; else { still = 0; last = window.scrollY; } if (still >= 6 || n > 300) resolve(window.scrollY); else requestAnimationFrame(step); }; requestAnimationFrame(step); }));
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const round = (r) => r && [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)];
async function tapEl(page, sel) {
  await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'nearest' }); }, sel);
  const r = await rect(page, sel);
  if (!r || !r.w) throw new Error('nothing to tap at ' + sel);
  await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2);
}
// the phone turned (or the window changed): the new size, and the page's layout after it
async function turn(page, vp) {
  await page.setViewportSize(vp);
  await page.waitForFunction((w) => window.innerWidth === w, vp.width, { timeout: 5000 }).catch(() => null);
  await frames(page);
}
// an on-screen keyboard over a phone upright: the window cut to `height` while the screen stays 390 × 844
// (Emulation.setDeviceMetricsOverride; Playwright's own setViewportSize would move the screen with it)
const keyboard = (page, height, vp = PHONE) => page.cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height, deviceScaleFactor: 1, mobile: true, screenWidth: vp.width, screenHeight: vp.height, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
// a box that fills the window exactly (to the pixel)
const fills = (r, vp) => !!r && Math.abs(r.x) <= 1 && Math.abs(r.y) <= 1 && Math.abs(r.w - vp.width) <= 1 && Math.abs(r.h - vp.height) <= 1;

// what spills out sideways: every visible element whose box runs past the window's sides and is not clipped
// by a scrolling or clipping box of its own that stays inside the window
const spill = (page) => page.evaluate(() => {
  const W = window.innerWidth, out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('[hidden], .visually-hidden, .fig-render, dialog:not([open])')) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.right <= W + 1 && r.left >= -1) continue;
    let p = e.parentElement, clipped = false;
    while (p && p !== document.body) { const pc = getComputedStyle(p); if (pc.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); if (pr.right <= W + 1 && pr.left >= -1) { clipped = true; break; } } p = p.parentElement; }
    if (!clipped) out.push(`${e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0] : '')} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return { sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, out: out.slice(0, 8), n: out.length };
});

// opens a section the way a thumb does: back out of a full-screen tab through its strip's first icon (the
// header and tabs step aside there), then the section's tab, or its menu and the menu's item
async function tapTab(page, name) {
  for (let i = 0; i < 2; i++) {
    const st = await page.evaluate(() => { const vis = (e) => !!e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden'; return { tabs: vis(document.querySelector('.tabs')), exit: ['ps-exit', 'lh-exit', 'tr-exit', 'fs-exit'].find((id) => vis(document.getElementById(id))) || null }; });
    if (st.tabs || !st.exit) break;
    await tapEl(page, '#' + st.exit);
    await page.waitForFunction(() => document.querySelector('.tabs').getBoundingClientRect().width > 0, null, { timeout: 3000 }).catch(() => null);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (name === 'paint' || name === 'figure') await tapEl(page, `[data-tab="${name}"]`);
  else {
    const group = name === 'game' || name === 'battle' ? '#tabGamesBtn' : '#tabLearnBtn';
    if ((await page.evaluate((g) => document.querySelector(g).getAttribute('aria-expanded'), group)) !== 'true') await tapEl(page, group);
    await page.waitForFunction((n) => { const b = document.querySelector(`[data-tab="${n}"]`); return b && !b.closest('[hidden]') && b.getBoundingClientRect().width > 0; }, name, { timeout: 3000 }).catch(() => null);
    await tapEl(page, `[data-tab="${name}"]`);
  }
  const ok = await page.waitForFunction((n) => { const p = document.getElementById('tab-' + n); return p && !p.hidden; }, name, { timeout: 5000 }).then(() => true).catch(() => false);
  await up(page, name);
  return ok;
}
// the section is up: its frame and pictures, its pose list, its setup
async function up(page, name) {
  if (name === 'pose') {
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) { const f = poseFrame(page); if (f && await f.evaluate(() => !!window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30).catch(() => false)) break; await sleep(250); }
  } else if (name === 'figure') await page.waitForFunction(() => !document.getElementById('fig-start').disabled, null, { timeout: 40000 }).catch(() => null);
  else if (name === 'game') await page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 30000 }).catch(() => null);
  await frames(page);
}

// the controls of a pinned surface that sit in a safe area's band (insets as Emulation takes them)
const inBands = (page, scope, I) => page.evaluate(([scope, I]) => {
  const W = window.innerWidth, H = window.innerHeight, out = [];
  for (const e of document.querySelectorAll(scope)) {
    if (e.closest('[hidden]') || e.matches('.visually-hidden, input[type=file]')) continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
    const hit = [];
    if (I.top && r.top < I.top) hit.push(`top ${Math.round(r.top)}`);
    if (I.bottom && r.bottom > H - I.bottom) hit.push(`${Math.round(H - r.bottom)} from the bottom`);
    if (I.left && r.left < I.left) hit.push(`left ${Math.round(r.left)}`);
    if (I.right && r.right > W - I.right) hit.push(`${Math.round(W - r.right)} from the right`);
    if (hit.length) out.push(`${e.id ? '#' + e.id : (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 14) || e.className.split(' ')[0])} (${hit.join(', ')})`);
  }
  return out;
}, [scope, I]);
const CONTROLS = ':is(button, select, input:not([type=radio]):not([type=checkbox]):not([type=hidden]), label[for], summary)';

const PAINT_RGBA = () => { const c = document.getElementById('ps-paper'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, n = 0; for (let y = 0; y < c.height; y += 3) for (let x = 0; x < c.width; x += 3) { if (d[(y * c.width + x) * 4 + 3] > 40) { n++; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); } } return n ? { n, x: [+(minx / c.width).toFixed(3), +(maxx / c.width).toFixed(3)], y: [+(miny / c.height).toFixed(3), +(maxy / c.height).toFixed(3)] } : { n: 0 }; };
const paintBounds = (page) => page.evaluate(PAINT_RGBA);
const undoAll = (page, id = 'ps-undo') => page.evaluate((id) => { const u = document.getElementById(id); for (let i = 0; i < 25 && !u.disabled; i++) u.click(); }, id);

export default async function phone(t, site) {
  const seen = {}; // what one block measured that another block's finding reports
  // ---- every section reached by a finger at four sizes: nothing spills sideways, the full-screen tabs fill
  // the screen, and the strips' icons keep the 44 px their CSS gives them ----
  await segment(t, 'every section at four sizes', async () => {
    const page = await openTouch(site);
    const shortIcons = [];
    const menus = [];
    for (const vp of [PHONE, SMALL, SIDE, TABLET]) {
      if (vp !== PHONE) await turn(page, vp);
      for (const name of ['study', 'loomis', 'trace', 'help', 'paint', 'figure', 'game', 'battle', 'pose']) {
        // the menus, measured as a finger opens them (on the Study tab, before the section is opened)
        if (name === 'study' || name === 'game') {
          await tapTab(page, 'study');
          // as a visitor first sees it: the page at its top
          await page.evaluate(() => window.scrollTo(0, 0)); await settle(page);
          const group = name === 'study' ? '#tabLearnBtn' : '#tabGamesBtn';
          await tapEl(page, group);
          await page.waitForFunction(() => [...document.querySelectorAll('.tab-menu')].some((m) => !m.hidden), null, { timeout: 3000 }).catch(() => null);
          const m = await page.evaluate(() => { const m = [...document.querySelectorAll('.tab-menu')].find((x) => !x.hidden); if (!m) return null; return { items: [...m.querySelectorAll('[data-tab]')].map((b) => { const r = b.getBoundingClientRect(); return { tab: b.dataset.tab, top: Math.round(r.top), bottom: Math.round(r.bottom) }; }), H: window.innerHeight, W: window.innerWidth, right: Math.round(m.getBoundingClientRect().right), left: Math.round(m.getBoundingClientRect().left) }; });
          if (m) menus.push({ size: size(vp), group: name === 'study' ? 'Learning tools' : 'Games', below: m.items.filter((i) => i.bottom > m.H).map((i) => `${i.tab} ${i.top}-${i.bottom}`), inside: m.left >= 0 && m.right <= m.W });
          await tapEl(page, group); // closes it again
        }
        const opened = await tapTab(page, name);
        t.check(opened, `${size(vp)}: a finger opens ${LABEL[name]}`);
        const s = await spill(page);
        t.check(s.sideways <= 0 && s.n === 0, `${size(vp)}, ${LABEL[name]}: nothing runs off the side and the page does not scroll sideways`, s);
        if (name === 'paint' || name === 'loomis') {
          const root = await rect(page, name === 'paint' ? '#ps-root' : '#lh-root');
          const full = vp.width < 760 || vp.height < 560;
          t.check(full ? fills(root, vp) : root && root.x >= 0 && root.r <= vp.width && root.b <= vp.height + 1 && root.h >= 240, `${size(vp)}: ${LABEL[name]} ${full ? 'fills the screen' : 'sits inside the window below the tabs'}`, round(root));
          const icons = await page.evaluate((id) => [...document.querySelectorAll(`#${id} .ps-strip .ps-ic`)].filter((b) => b.getBoundingClientRect().width > 0).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.title, w: Math.round(r.width), h: Math.round(r.height) }; }), name === 'paint' ? 'ps-root' : 'lh-root');
          const short = icons.filter((i) => i.h < 44 || i.w < 24);
          if (short.length) shortIcons.push({ size: size(vp), tab: LABEL[name], icons: short.length, of: icons.length, sizes: [...new Set(short.map((i) => `${i.w}×${i.h}`))] });
          t.check(icons.length >= 7 && !short.length, `${size(vp)}: every icon on ${LABEL[name]}'s strip is at least 44 px tall (the strip's own height: 44px) and 24 px wide`, short.slice(0, 4));
        }
        if (name === 'trace') {
          // full screen where the Studio is, and every control of its strip on the screen, a finger's size
          const root = await rect(page, '#tr-root');
          const full = vp.width < 760 || vp.height < 560;
          t.check(full ? fills(root, vp) : root && root.x >= 0 && root.r <= vp.width && root.b <= vp.height + 1 && root.h >= 240, `${size(vp)}: ${LABEL[name]} ${full ? 'fills the screen' : 'sits inside the window below the tabs'}`, round(root));
          // the controls are a pop-up that starts closed: opened by its Tools button, as a finger does, and the zoom buttons count too
          if (await page.evaluate(() => document.getElementById('tr-strip').hidden)) await tapEl(page, '#tr-tools'); // (it stays open from an earlier size)
          await settle(page);
          const ctl = await page.evaluate(() => [...document.querySelectorAll('#tr-strip button, #tr-strip input[type=range], #tr-card button, .tr-zb')].filter((b) => b.getBoundingClientRect().width > 0 && !b.closest('[hidden]')).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, w: Math.round(r.width), h: Math.round(r.height), off: r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 }; }));
          const bad = ctl.filter((c) => c.off || (c.id !== 'tr-transparency' && c.id !== 'tr-size' && (c.h < 44 || c.w < 24)));
          t.check(ctl.length >= 9 && !bad.length, `${size(vp)}: every control of ${LABEL[name]} is on the screen, its buttons at least 44 px tall and 24 px wide`, bad.slice(0, 4).concat(bad.length ? [] : [`${ctl.length} controls`]));
        }
        if (name === 'help' && vp === PHONE) {
          // a strip of phone screenshots wider than the screen: a finger swipes it sideways, the page stays put
          const i = await page.evaluate(() => [...document.querySelectorAll('.help-shots')].findIndex((x) => x.scrollWidth > x.clientWidth + 100));
          await page.evaluate((i) => document.querySelectorAll('.help-shots')[i].scrollIntoView({ block: 'center' }), i);
          await settle(page);
          const hs = await page.evaluate((i) => { const r = document.querySelectorAll('.help-shots')[i].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, left: document.querySelectorAll('.help-shots')[i].scrollLeft, pageX: window.scrollX }; }, i);
          await swipe(page, [hs.x + hs.w * 0.8, hs.y + hs.h / 2], [hs.x + hs.w * 0.8 - 200, hs.y + hs.h / 2 + 8], 8);
          await settle(page);
          const after = await page.evaluate((i) => ({ left: document.querySelectorAll('.help-shots')[i].scrollLeft, pageX: window.scrollX, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }), i);
          t.check(i >= 0 && after.left > hs.left + 60 && after.pageX === 0 && after.sideways <= 0, 'How to use: a finger swipes a strip of screenshots sideways, and only the strip moves', { strip: i, before: hs.left, after });
        }
        if (name === 'study') {
          const tools = await page.evaluate(() => [...document.querySelectorAll('.toolstrip .tool-btn')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
          t.check(tools.length === 5 && tools.every(([w, h]) => w >= 44 && h >= 44), `${size(vp)}: the Study tool bar's five buttons are at least 44 × 44`, tools);
        }
      }
      await clean(t, page, `sizes ${size(vp)}`);
    }
    if (shortIcons.length) t.finding({
      title: 'The Studio\'s and the Loomis head\'s tool strip squeezes its icons to 26 px tall on a tablet and on a phone held sideways',
      severity: 'medium',
      steps: '1. Open the site on a 768 × 1024 tablet (an iPad upright) or a phone on its side (844 × 390); a 1400 × 900 window does the same. 2. Open the Studio (or Learning tools → Loomis head). 3. Look at the strip of icons down the left.',
      expected: 'Each icon keeps the 44 × 44 px the strip gives it (styles.css: .ps-ic { width: 42px; max-width: 44px; height: 44px }), as it does along the bottom of a phone held upright, so a finger can hit Undo without hitting Turn the paper or Clear.',
      actual: `The icons are packed 3 px apart at ${shortIcons.map((s) => `${s.size} (${s.tab}: ${s.icons} of ${s.of} icons ${s.sizes.join(', ')})`).join('; ')}; upright at 390 × 844 the same icons are 44 px tall.`,
      cause: 'styles.css:1410 gives .ps-ic both height: 44px and flex: 1 1 0. Along the bottom (a row) the flex basis works on the width; from 760 px wide (styles.css:1480) the strip becomes a column, so the zero flex basis now applies to the height and replaces the 44 px: each icon shrinks to its content (the 24 px icon and its border). A rule such as .ps-strip .ps-ic { flex: none } inside the min-width: 760px block would keep the 44 px.',
    });
    t.note(`menus as a finger opens them: ${JSON.stringify(menus)}`);
    const cut = menus.filter((m) => m.below.length || !m.inside);
    t.check(!cut.length, 'every item of the Learning tools and Games menus is on the screen when a finger opens them', cut);
    if (cut.length) t.finding({
      title: 'On a phone held sideways (and on a 320 × 568 phone) the Learning tools and Games menus open with items below the bottom of the screen',
      severity: 'low',
      steps: '1. Open the site on a phone held sideways (844 × 390), at the top of the page. 2. Tap Learning tools (or Games).',
      expected: 'The menu\'s choices are on the screen when it opens (the tabs sit about halfway down a landscape phone, so the menu could open upward, scroll the page to show itself, or be a sheet), as they are at 390 × 844.',
      actual: `Items below the bottom edge: ${cut.map((m) => `${m.size} ${m.group}: ${m.below.join(', ') || 'beside the screen'}`).join('; ')}. A swipe that starts on the menu scrolls them into reach, but any touch outside the menu closes it (js/app.js:2284).`,
      cause: 'styles.css:379 .tab-menu opens below its tab (top: calc(100% + 6px)) whatever room is left; js/app.js:2274 opens it and focusIn (js/app.js:2270) focuses the item of the section already open, which scrolls that one item into view and no other (from the Study tab, the items under it stay below the edge). On a phone on its side the header and tabs take the top 280 px of the 390 px window.',
    });
    await page.context().close();
  });

  // ---- the Study tools by touch ----
  await segment(t, 'the Study tools by touch', async () => {
    const page = await openTouch(site);
    const counts = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.toolstrip [data-tool]')].map((b) => [b.dataset.tool, +(b.dataset.count || 0)])));
    const onPhoto = async () => { await settle(page); await page.evaluate(() => { const r = document.getElementById('cv-orig').getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 120); }); await settle(page); const b = await rect(page, '#cv-orig'); return (fx, fy) => [b.x + b.w * fx, b.y + b.h * fy]; };
    let P = await onPhoto();
    // the magnifier (on at the start): a tap shows the loupe, keeps the color, and the loupe goes by itself
    const kept0 = await page.evaluate(() => document.querySelectorAll('#swatches > li').length);
    await touch(page, 'touchStart', [P(0.5, 0.4)]);
    const during = await page.evaluate(() => !document.getElementById('loupe').hidden);
    await touch(page, 'touchEnd', []);
    const gone = await page.waitForFunction(() => document.getElementById('loupe').hidden, null, { timeout: 3000 }).then(() => true).catch(() => false);
    const kept = await page.evaluate(() => document.querySelectorAll('#swatches > li').length);
    t.check(during && gone && kept === kept0 + 1, 'Magnifier: a finger\'s tap on the photo shows the loupe, keeps that color in Picked colors, and the loupe goes by itself', { during, gone, kept0, kept });
    // a swipe up on a picture with the magnifier on scrolls the page (the README: touching an image just scrolls when no drawing tool is on)
    const y0 = await page.evaluate(() => window.scrollY);
    await swipe(page, P(0.5, 0.8), P(0.5, 0.3));
    const scrolled = await page.waitForFunction((y0) => window.scrollY > y0 + 40, y0, { timeout: 3000 }).then(() => true).catch(() => false);
    t.check(scrolled, 'Magnifier: a finger swiping up on a picture scrolls the page', { from: y0, to: await page.evaluate(() => window.scrollY) });
    // Lines: a finger draws one line, the page holds still, the loupe above the finger shows the tilt
    await click(page, '.toolstrip [data-tool="line"]');
    P = await onPhoto();
    const y1 = await page.evaluate(() => window.scrollY);
    await touch(page, 'touchStart', [P(0.2, 0.3)]);
    for (let i = 1; i <= 6; i++) await touch(page, 'touchMove', [P(0.2 + i * 0.1, 0.3 + i * 0.05)]);
    const lp = await page.evaluate(() => { const l = document.getElementById('loupe'); const r = l.getBoundingClientRect(); return { shown: !l.hidden, text: l.textContent.replace(/\s+/g, ' ').trim(), box: [r.left, r.top, r.right, r.bottom] }; });
    await touch(page, 'touchEnd', []);
    const [fx, fy] = P(0.8, 0.6);
    const underFinger = lp.box[0] <= fx && fx <= lp.box[2] && lp.box[1] <= fy && fy <= lp.box[3];
    t.check((await counts()).line === 1 && (await page.evaluate(() => window.scrollY)) === y1 && lp.shown && /Tilt -?\d+°/.test(lp.text) && !underFinger, 'Lines: a finger draws one line, the page holds still, and the loupe shows its tilt clear of the finger', { counts: await counts(), lp, finger: [fx, fy] });
    // two fingers on the photo with Lines on (a pinch, as a visitor zooms a photo): only the first finger's line, or none
    const marks0 = await page.evaluate(() => Studio.marks().length);
    await touch(page, 'touchStart', [P(0.3, 0.5)]);
    await touch(page, 'touchMove', [P(0.31, 0.51)]);
    await touch(page, 'touchStart', [P(0.31, 0.51), P(0.7, 0.6)]);
    for (let i = 1; i <= 4; i++) await touch(page, 'touchMove', [P(0.31 - i * 0.04, 0.51 - i * 0.04), P(0.7 + i * 0.04, 0.6 + i * 0.04)]);
    await touch(page, 'touchEnd', []);
    await frames(page);
    const lines = await page.evaluate(() => Studio.marks());
    const added = lines.slice(marks0);
    // a line the first finger drew starts where it came down (0.3, 0.5)
    const stray = added.filter((l) => Math.hypot(l[0] - 0.3, l[1] - 0.5) > 0.03 && Math.hypot(l[2] - 0.3, l[3] - 0.5) > 0.03);
    t.check(added.length <= 1 && !stray.length, 'Lines: a two-finger pinch on the photo draws no line a finger did not draw (at most the first finger\'s own)', { added });
    const lineStray = stray[0];
    // Measure: a pinch as the first thing must not set the unit; a finger's drag does
    await click(page, '#lineClear');
    await click(page, '.toolstrip [data-tool="measure"]');
    P = await onPhoto();
    await touch(page, 'touchStart', [P(0.45, 0.45)]);
    await touch(page, 'touchStart', [P(0.45, 0.45), P(0.55, 0.55)]);
    for (let i = 1; i <= 5; i++) await touch(page, 'touchMove', [P(0.45 - i * 0.05, 0.45 - i * 0.05), P(0.55 + i * 0.05, 0.55 + i * 0.05)]);
    await touch(page, 'touchEnd', [[...P(0.2, 0.2), 0]]);
    await touch(page, 'touchEnd', []);
    await frames(page);
    const afterPinch = await page.evaluate(() => Studio.marks());
    t.check(afterPinch.length === 0 || afterPinch.every((m) => Math.hypot(m[0] - 0.45, m[1] - 0.45) < 0.03 || Math.hypot(m[2] - 0.45, m[3] - 0.45) < 0.03), 'Measure: a two-finger pinch as the first gesture makes no measure from one finger to the other (it would become the unit, 1 U)', afterPinch);
    if (lineStray || afterPinch.length) {
      t.finding({
        title: 'A two-finger pinch on a Study picture with Lines or Measure on draws a line from the second finger to the first; with Measure first, that stray line becomes the unit',
        severity: 'medium',
        steps: '1. On a phone (390 × 844, touch), Study the photo. 2. Press Lines in the tool bar. 3. Put a finger on the photo, then a second one, and spread them as if to zoom; lift both. 4. Press Measure, Clear measures if any, and pinch the same way; then drag a real measure with one finger.',
        expected: 'A second finger draws nothing (as the Studio\'s paper does: "a second finger (a pinch, a resting hand) draws nothing", js/painting.js:350), or the pinch cancels the line. The README: "The first length you drag is the unit".',
        actual: `Lines: a line ${lineStray ? `from (${lineStray[0].toFixed(2)}, ${lineStray[1].toFixed(2)}) to (${lineStray[2].toFixed(2)}, ${lineStray[3].toFixed(2)})` : '(none this run)'} is added; the first finger came down at (0.30, 0.50) and the second at (0.70, 0.60), so the line runs from where the second finger came down to where the first one lifted. Measure: the pinch adds ${afterPinch.length} measure(s) ${JSON.stringify(afterPinch.map((m) => m.map((v) => +v.toFixed(2))))}, the first of them the unit (1 U), so the visitor's own measures are labelled in a unit nobody chose.`,
        cause: 'js/app.js:934-946: pointerdown starts a new state.drawing for every pointer, replacing the first finger\'s line with one from the second finger; js/app.js:899-903 moves state.drawing\'s end for any pointer on that canvas (no pointerId kept), so the first finger drags the second\'s line; js/app.js:974-992 commits it when the first finger lifts (measures at 986, lines at 992).',
      });
    }
    // a measure by a finger is the unit; Plumb: a wobbly tap drops a point where the finger came down
    await click(page, '#measureClear');
    await swipe(page, P(0.3, 0.3), P(0.55, 0.3));
    const unit = await page.evaluate(() => Studio.marks());
    t.check(unit.length >= 1 && Math.abs(unit[0][0] - 0.3) < 0.02 && Math.abs(unit[0][2] - 0.55) < 0.02, 'Measure: a finger\'s drag makes the first measure, from where it came down to where it lifted', unit);
    await click(page, '#measureClear');
    await click(page, '.toolstrip [data-tool="plumb"]');
    P = await onPhoto();
    await touch(page, 'touchStart', [P(0.4, 0.6)]);
    await touch(page, 'touchMove', [[P(0.4, 0.6)[0] + 5, P(0.4, 0.6)[1] + 3]]);
    await touch(page, 'touchEnd', []);
    await frames(page);
    const plumb = await page.evaluate(() => Studio.marks());
    t.check((await counts()).plumb === 1 && plumb.some((m) => m[0] === m[2] && Math.abs(m[0] - 0.4) < 0.004), 'Plumb: a finger\'s tap that wobbles 6 px drops one point, where the finger came down', { counts: await counts(), plumb });
    // the point's ring dragged by a finger moves it; a tap on the ring takes it away (the README: "Drag a point's ring to move it; click the ring again to remove it")
    await swipe(page, P(0.4, 0.6), P(0.5, 0.65), 5);
    await frames(page);
    const moved = await page.evaluate(() => Studio.marks());
    t.check((await counts()).plumb === 1 && moved.some((m) => m[0] === m[2] && Math.abs(m[0] - 0.5) < 0.01), 'Plumb: a finger drags the point\'s ring to a new place', moved);
    await page.touchscreen.tap(...P(0.5, 0.65));
    await frames(page);
    t.check(!(await counts()).plumb, 'Plumb: a finger\'s tap on the ring takes the point away', await counts());
    await clean(t, page, 'Study by touch');
    await page.context().close();
  });

  // ---- the Studio's paper by touch ----
  await segment(t, 'the Studio by touch', async () => {
    const page = await openTouch(site, { url: '#paint' });
    await page.waitForFunction(() => document.getElementById('ps-paper').getBoundingClientRect().width > 0, null, { timeout: 5000 }).catch(() => null);
    await frames(page);
    let b = await rect(page, '#ps-paper');
    const P = (fx, fy) => [b.x + b.w * fx, b.y + b.h * fy];
    await swipe(page, P(0.2, 0.2), P(0.5, 0.2));
    const one = await paintBounds(page);
    t.check(one.n > 50 && one.x[0] >= 0.15 && one.x[1] <= 0.6 && one.y[1] <= 0.27, 'a finger paints a stroke where it moved', one);
    await undoAll(page);
    t.check((await paintBounds(page)).n === 0, 'Undo takes the stroke back');
    // a pinch on the paper: two fingers spread from the middle
    const zoom0 = await page.evaluate(() => document.getElementById('ps-zoomOut').textContent);
    await touch(page, 'touchStart', [P(0.45, 0.5)]);
    await touch(page, 'touchStart', [P(0.45, 0.5), P(0.55, 0.5)]);
    for (let i = 1; i <= 6; i++) await touch(page, 'touchMove', [P(0.45 - i * 0.04, 0.5 - i * 0.02), P(0.55 + i * 0.04, 0.5 + i * 0.02)]);
    await touch(page, 'touchEnd', []);
    await frames(page);
    const pinch = { ink: await paintBounds(page), zoom: await page.evaluate(() => document.getElementById('ps-zoomOut').textContent), scale: await page.evaluate(() => window.visualViewport.scale) };
    t.check(pinch.ink.n === 0, 'a two-finger pinch on the paper leaves no paint on it', pinch);
    if (pinch.ink.n) t.finding({
      title: 'A two-finger pinch on the Studio paper paints a streak with the first finger, and zooms nothing',
      severity: 'medium',
      steps: '1. On a phone (390 × 844, touch), open the Studio. 2. Put two fingers on the paper and spread them, as to zoom in on a phone.',
      expected: 'Two fingers do not paint: a pinch either zooms the paper (as Pose and light\'s stage does, which puts back what the first finger moved, js/pose.js:2114) or does nothing. The code means it: "a second finger (a pinch, a resting hand) draws nothing" (js/painting.js:350). The README\'s zoom is the sliders ("zoom up to four times with sliders"), so the pinch has nothing else to do.',
      actual: `The first finger's half of the pinch is painted (${pinch.ink.n} inked samples, x ${pinch.ink.x} y ${pinch.ink.y} of the paper); the zoom stays ${pinch.zoom} (was ${zoom0}) and the page cannot zoom either (the paper is touch-action: none). Undo takes it back, one step.`,
      cause: 'js/painting.js:351-367 starts a stroke on the first pointerdown and stamps a dab at once; js/painting.js:353 only ignores the second finger, so the first keeps painting while the two spread. Nothing takes back the first finger\'s stroke when a second finger joins within the first moments.',
    });
    await undoAll(page);
    // a resting second finger (a palm) after the stroke began: the first finger goes on painting, the palm draws nothing
    await touch(page, 'touchStart', [P(0.2, 0.6)]);
    await touch(page, 'touchMove', [P(0.25, 0.6)]);
    await touch(page, 'touchStart', [P(0.25, 0.6), P(0.85, 0.92)]);
    for (let i = 1; i <= 4; i++) await touch(page, 'touchMove', [P(0.25 + i * 0.05, 0.6), P(0.85 - i * 0.01, 0.92)]);
    await touch(page, 'touchEnd', [[...P(0.45, 0.6), 0]]);
    await touch(page, 'touchMove', [[...P(0.55, 0.6), 0]]);
    await touch(page, 'touchEnd', []);
    const palm = await paintBounds(page);
    t.check(palm.n > 50 && palm.y[0] >= 0.57 && palm.y[1] <= 0.64 && palm.x[1] >= 0.5 && palm.x[1] <= 0.6, 'a palm resting on the paper mid-stroke draws nothing, and the finger paints on after the palm lifts', palm);
    await undoAll(page);
    // the reference dragged by a finger to the paper's bottom left corner: it follows, and stays on the stage
    const f0 = await rect(page, '#ps-refFig .ps-frame');
    await swipe(page, [f0.x + f0.w / 2, f0.y + f0.h / 2], [f0.x + f0.w / 2 - 260, f0.y + f0.h / 2 + 460], 6);
    const f1 = await rect(page, '#ps-refFig'), st1 = await rect(page, '#ps-stage');
    t.check(f1.x < f0.x - 150 && f1.b > f0.b + 150 && f1.x >= st1.x - 1 && f1.b <= st1.b + 1 && (await paintBounds(page)).n === 0, 'a finger drags the reference to the paper\'s bottom left: it follows, stays on the stage and paints nothing', { from: round(f0), to: round(f1), stage: round(st1) });
    // the phone turned mid-stroke: the paper moves under the finger
    await touch(page, 'touchStart', [P(0.3, 0.3)]);
    await touch(page, 'touchMove', [P(0.35, 0.3)]);
    const before = await paintBounds(page);
    await turn(page, SIDE);
    await page.waitForFunction(() => document.getElementById('ps-root').getBoundingClientRect().width === 844, null, { timeout: 5000 }).catch(() => null);
    await touch(page, 'touchMove', [P(0.38, 0.3)]);
    await touch(page, 'touchMove', [P(0.40, 0.3)]);
    await touch(page, 'touchEnd', []);
    const after = await paintBounds(page);
    const side = { root: round(await rect(page, '#ps-root')), paper: round(await rect(page, '#ps-paperWrap')), strip: round(await rect(page, '#ps-root .ps-strip')) };
    t.check(fills(await rect(page, '#ps-root'), SIDE) && side.paper[0] >= 0 && side.paper[0] + side.paper[2] <= 844 && side.paper[1] + side.paper[3] <= 390, 'turned to 844 × 390: the Studio fills the screen with the paper inside it', side);
    const refSide = await rect(page, '#ps-refFig'), stSide = await rect(page, '#ps-stage');
    t.check(refSide.x >= stSide.x - 1 && refSide.y >= stSide.y - 1 && refSide.r <= stSide.r + 1 && refSide.b <= stSide.b + 1, 'turned to 844 × 390: the reference dragged to the corner is still on the stage', { ref: round(refSide), stage: round(stSide) });
    const jumped = after.n && (after.x[0] < before.x[0] - 0.05 || after.y[1] > before.y[1] + 0.05);
    t.check(!jumped, 'turned mid-stroke: no streak runs from the stroke to where the finger now sits on the moved paper', { before, after });
    if (jumped) t.note(`studio turned mid-stroke: ${JSON.stringify({ before, after, side })}`);
    seen.studioTurn = jumped ? { before, after, side } : null;
    await undoAll(page);
    await turn(page, PHONE);
    t.check(fills(await rect(page, '#ps-root'), PHONE) && Math.round((await rect(page, '#ps-root .ps-strip')).b) === 844, 'turned back upright: the Studio fills the screen, its strip along the bottom', round(await rect(page, '#ps-root .ps-strip')));
    // an on-screen keyboard: the window cut to 500 px tall (the screen still 844); then gone again
    await keyboard(page, 500);
    await page.waitForFunction(() => Math.round(document.getElementById('ps-root').getBoundingClientRect().height) === 500, null, { timeout: 5000 }).catch(() => null);
    const kb = { root: round(await rect(page, '#ps-root')), strip: round(await rect(page, '#ps-root .ps-strip')), paper: round(await rect(page, '#ps-paperWrap')) };
    t.check(fills(await rect(page, '#ps-root'), { width: 390, height: 500 }) && kb.strip[1] + kb.strip[3] === 500 && kb.paper[1] + kb.paper[3] <= kb.strip[1], 'with the window cut to 500 px (a keyboard up): the Studio fits it, strip at its bottom, paper above the strip', kb);
    await keyboard(page, 844);
    await page.waitForFunction(() => Math.round(document.getElementById('ps-root').getBoundingClientRect().height) === 844, null, { timeout: 5000 }).catch(() => null);
    t.check(fills(await rect(page, '#ps-root'), PHONE), 'the keyboard gone: the Studio fills the screen again', round(await rect(page, '#ps-root')));
    // the page pinch-zoomed by the browser and back
    await page.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await frames(page);
    await page.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await page.waitForFunction(() => window.visualViewport.scale === 1, null, { timeout: 3000 }).catch(() => null);
    await frames(page);
    t.check(fills(await rect(page, '#ps-root'), PHONE), 'the page zoomed to 2× and back: the Studio fills the screen again', round(await rect(page, '#ps-root')));
    b = await rect(page, '#ps-paper');
    await swipe(page, P(0.2, 0.8), P(0.6, 0.8));
    const last = await paintBounds(page);
    t.check(last.n > 50 && last.y[0] >= 0.75 && last.y[1] <= 0.85, 'after all that a finger still paints where it moves', last);
    await clean(t, page, 'Studio by touch');
    await page.context().close();
  });

  // ---- the Loomis head: a mark placed by finger, across a turn of the phone ----
  await segment(t, 'the Loomis head by touch', async () => {
    const page = await openTouch(site, { url: '#loomis' });
    await page.waitForFunction(() => window.Loomis && document.getElementById('lh-overlay').getBoundingClientRect().width > 0, null, { timeout: 10000 }).catch(() => null);
    await frames(page);
    const b = await rect(page, '#lh-overlay');
    const P = (fx, fy) => [b.x + b.w * fx, b.y + b.h * fy];
    await touch(page, 'touchStart', [P(0.4, 0.35)]);
    await touch(page, 'touchMove', [P(0.42, 0.36)]);
    const held = await page.evaluate(() => ({ pending: { ...Loomis.state.pending }, loupe: !document.getElementById('lh-loupe').hidden }));
    await turn(page, SIDE);
    await page.waitForFunction(() => { const r = document.getElementById('lh-root').getBoundingClientRect(); return r.width === 844 && r.height === 390; }, null, { timeout: 5000 }).catch(() => null);
    await touch(page, 'touchMove', [P(0.43, 0.37)]);
    const loupeSide = await page.evaluate(() => { const l = document.getElementById('lh-loupe').getBoundingClientRect(), o = document.getElementById('lh-overlay').getBoundingClientRect(); return { shown: !document.getElementById('lh-loupe').hidden, overPhoto: l.right > o.left && l.left < o.right && l.bottom > o.top && l.top < o.bottom }; });
    await touch(page, 'touchEnd', []);
    const placed = await page.evaluate(() => ({ ...Loomis.state.pending }));
    t.check(fills(await rect(page, '#lh-root'), SIDE), 'turned to 844 × 390 with a finger down: the Loomis head fills the screen', round(await rect(page, '#lh-root')));
    const kept = Math.hypot(placed.x - held.pending.x, placed.y - held.pending.y) < 0.05;
    t.check(held.loupe && kept, 'turned mid-placement: the mark stays near where the finger had put it, not flung to the photo\'s edge', { held, placed, loupeSide });
    if (!kept || seen.studioTurn) t.finding({
      title: 'Turning the phone in the middle of a drag keeps the drag going against the moved picture: a streak across the Studio paper, a Loomis mark thrown to the photo\'s corner',
      severity: 'low',
      steps: '1. On a phone upright (390 × 844, touch), open the Studio and start a stroke on the paper with one finger. 2. Turn the phone on its side (844 × 390) while the finger stays down, move it a little and lift it. 3. On the Loomis head, put a finger on the photo to place a mark and turn the phone the same way.',
      expected: 'A drag whose picture moves out from under the finger ends there (the page re-lays itself out on resize and orientationchange), so nothing is drawn or placed where the finger never was.',
      actual: `Studio: ${seen.studioTurn ? `the stroke from (0.30–0.37, 0.30) ran on to x ${seen.studioTurn.after.x} y ${seen.studioTurn.after.y} of the paper, a streak to its left edge, because the finger now sits left of the paper (now ${JSON.stringify(seen.studioTurn.side.paper)})` : 'no streak this run'}. Loomis: the pending mark went from (${held.pending.x.toFixed(2)}, ${held.pending.y.toFixed(2)}) to (${placed.x.toFixed(2)}, ${placed.y.toFixed(2)}), the photo's corner. (Measured with Chromium's touch emulation, which keeps the finger down through the turn; a browser that cancels the touch on rotation does not show it.)`,
      cause: 'js/painting.js:153-157 layout() re-pins and refits the paper but leaves the stroke (last, strokeId) going, so js/painting.js:376 joins the old point to the finger\'s new place on the moved paper; js/loomis.js:365 layout() does the same with drag_ (js/loomis.js:428 then clamps the finger, now off the photo, to its edge).',
    });
    await clean(t, page, 'Loomis by touch');
    await page.context().close();
  });

  // ---- Paint by numbers by touch ----
  await segment(t, 'Paint by numbers by touch', async () => {
    const page = await openTouch(site, { url: '#game' });
    await page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 30000 }).catch(() => null);
    await page.selectOption('#gamePalette', 'monet'); // ten paints: too many for a phone's width, so the paints scroll
    await page.waitForFunction(() => !document.getElementById('gameStart').disabled && document.getElementById('gamePalette').value === 'monet', null, { timeout: 30000 }).catch(() => null);
    await tapEl(page, '#gameStart');
    const started = await page.waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!t.check(started, 'a finger\'s tap on Start painting starts the game')) return;
    await settle(page);
    const st = () => page.evaluate(() => ({ parts: document.getElementById('gameMixParts').textContent.replace(/\s+/g, ' ').trim(), sel: (document.querySelector('#gameNumbers .game-number[aria-pressed="true"]') || {}).textContent || null, scrollLeft: Math.round(document.getElementById('gamePaints').scrollLeft), scrolls: document.getElementById('gamePlay').classList.contains('has-scroll'), pageY: window.scrollY }));
    const s0 = await st();
    // a shape tapped on the board chooses its number
    const cb = await rect(page, '#gameCanvas');
    await page.touchscreen.tap(cb.x + cb.w * 0.5, cb.y + cb.h * 0.85);
    await page.waitForFunction((s) => (document.querySelector('#gameNumbers .game-number[aria-pressed="true"]') || {}).textContent !== s, s0.sel, { timeout: 3000 }).catch(() => null);
    const s1 = await st();
    t.check(s0.scrolls && s1.sel && s1.sel !== s0.sel, 'a finger\'s tap on a shape chooses its number (the palette scrolls on a phone)', { s0, s1 });
    const paints = await page.evaluate(() => [...document.querySelectorAll('#gamePaints .game-paint')].map((b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, code: b.querySelector('.game-paint-code').textContent }; }));
    await page.touchscreen.tap(paints[1].x, paints[1].y);
    await page.waitForFunction(() => /\d/.test(document.getElementById('gameMixParts').textContent), null, { timeout: 3000 }).catch(() => null);
    const s2 = await st();
    t.check(s2.parts === `${paints[1].code} 1`, 'a finger\'s tap on a paint adds one part of it', s2.parts);
    await touch(page, 'touchStart', [[paints[2].x, paints[2].y]]);
    await page.waitForFunction((c) => new RegExp(c + '\\s([5-9]|\\d\\d)').test(document.getElementById('gameMixParts').textContent), paints[2].code, { timeout: 5000 }).catch(() => null);
    await touch(page, 'touchEnd', []);
    const s3 = await st();
    t.check(new RegExp(`${paints[2].code} ([5-9]|\\d\\d)`).test(s3.parts), 'a paint held by a finger keeps adding', s3.parts);
    // the paints swiped sideways, as the README offers ("or swipe the paints"): the row scrolls, the mix stays
    const p3 = paints[3];
    await touch(page, 'touchStart', [[p3.x, p3.y]]);
    for (let i = 1; i <= 8; i++) await touch(page, 'touchMove', [[p3.x - i * 25, p3.y]]);
    await touch(page, 'touchEnd', []);
    await page.waitForFunction((l) => document.getElementById('gamePaints').scrollLeft > l + 40, s3.scrollLeft, { timeout: 3000 }).catch(() => null);
    const s4 = await st();
    t.check(s4.scrollLeft > s3.scrollLeft + 40, 'a swipe on the paints scrolls them', { from: s3.scrollLeft, to: s4.scrollLeft });
    t.check(s4.parts === s3.parts, 'a swipe on the paints adds nothing to the mix', { before: s3.parts, after: s4.parts });
    if (s4.parts !== s3.parts) t.finding({
      title: 'Swiping the paints to scroll them (Paint by numbers, phone) adds a part of the paint the swipe started on to the mix',
      severity: 'medium',
      steps: '1. On a phone (390 × 844, touch), Games → Paint by numbers, choose Monet (ten paints, more than fit), Start painting. 2. Tap a shape, tap a paint or two. 3. Swipe the row of paints left to see the others.',
      expected: 'The README: "a palette too long for the screen gets a big scroll bar under it (drag the handle, tap the track to jump there, or swipe the paints)". A swipe scrolls; it is not a tap on a paint, and every part counts in the score.',
      actual: `The row scrolls (${s3.scrollLeft} → ${s4.scrollLeft} px) and the mix goes from "${s3.parts}" to "${s4.parts}": one part of ${p3.code}, the paint under the finger where the swipe began.`,
      cause: 'js/game.js:775-779: the paint\'s pointerdown adds the part at once (addPart(i)), before the touch is known to be a tap or a pan; when the browser takes the touch for scrolling it sends pointercancel, and js/game.js:781 only stops the hold\'s repeat (stop), it never takes the part back. Adding on pointerup (or taking the part back on pointercancel when the touch moved) would leave swipes alone; holding can keep its timer.',
    });
    // the big scroll bar: its handle dragged by a finger slides the paints; a tap at the track's left end goes back to the start
    const bar = await rect(page, '#gamePaintScroll'), thumb = await rect(page, '#gamePaintScroll > *');
    await swipe(page, [thumb.x + 10, thumb.y + thumb.h / 2], [thumb.x + 10 - 200, thumb.y + thumb.h / 2], 5);
    const back = await st();
    await swipe(page, [bar.x + 10, bar.y + bar.h / 2], [bar.x + 110, bar.y + bar.h / 2], 5);
    const slid = await st();
    await page.touchscreen.tap(bar.x + 12, bar.y + bar.h / 2);
    await frames(page);
    const start = await st();
    t.check(back.scrollLeft < s4.scrollLeft && slid.scrollLeft > back.scrollLeft + 40 && start.scrollLeft === 0 && start.parts === s4.parts, 'the paints\' scroll bar: a finger drags its handle to slide the paints, a tap on the track\'s start goes back there, and the mix is left alone', { swiped: s4.scrollLeft, back: back.scrollLeft, slid: slid.scrollLeft, start: start.scrollLeft, parts: start.parts });
    // the reference dragged by a finger stays over the board, the page still
    const r0 = await rect(page, '#gameRef');
    await swipe(page, [r0.x + r0.w / 2, r0.y + r0.h / 2], [r0.x + r0.w / 2 - 150, r0.y + r0.h / 2 + 200], 5);
    const r1 = await rect(page, '#gameRef'), board = await rect(page, '.game-board');
    t.check(r1.x < r0.x - 100 && r1.y > r0.y + 100 && r1.x >= board.x - 1 && r1.b <= board.b + 1 && (await st()).pageY === 0, 'a finger drags the reference across the board; it stays over the board and the page holds still', { from: round(r0), to: round(r1), board: round(board) });
    // turned mid-round: the bar, the painting, the paints and the amount row on the 844 × 390 screen; and back
    for (const vp of [SIDE, PHONE]) {
      await turn(page, vp);
      await page.waitForFunction((h) => { const a = document.querySelector('.game-amount').getBoundingClientRect(); return a.bottom <= h && a.bottom > h - 60; }, vp.height, { timeout: 5000 }).catch(() => null);
      const lay = await page.evaluate(() => { const q = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }; return { bar: q('.game-bar'), canvas: q('#gameCanvas'), paints: q('#gamePaints'), amount: q('.game-amount'), lock: q('#gameLock'), W: window.innerWidth, H: window.innerHeight, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      const inside = ['bar', 'canvas', 'paints', 'amount', 'lock'].every((k) => lay[k][0] >= 0 && lay[k][2] <= lay.W && lay[k][1] >= 0 && lay[k][3] <= lay.H);
      t.check(inside && lay.canvas[3] - lay.canvas[1] >= 150 && lay.sideways <= 0 && lay.bar[1] < lay.canvas[1] && lay.canvas[3] <= lay.paints[1], `turned to ${size(vp)} mid-round: the bar, the painting, the paints and the amount row are all on the screen, in that order`, lay);
    }
    t.check((await st()).parts === s4.parts, 'the turns leave the mix as it was', (await st()).parts);
    await clean(t, page, 'Paint by numbers by touch');
    await page.context().close();
  });

  // ---- Value battle by touch ----
  await segment(t, 'Value battle by touch', async () => {
    const page = await openTouch(site, { url: '#battle' });
    await page.waitForFunction(() => document.getElementById('vb-palette').options.length > 0, null, { timeout: 5000 }).catch(() => null);
    await tapEl(page, '#vb-start');
    await page.waitForFunction(() => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !document.getElementById('vb-play').hidden; }, null, { timeout: 5000 }).catch(() => null);
    await frames(page);
    const answerRight = async () => {
      const r = await page.evaluate(() => { const g = ValueBattle.state(), r = g.rounds[g.i]; return { mode: r.q.mode, answer: r.answer }; });
      const sels = r.mode === 'pair' ? [r.answer === 'same' ? '.vb-choice[data-choice="same"]' : `.vb-swatch[data-index="${r.answer === 'left' ? 0 : 1}"]`] : r.mode === 'pick' ? [`.vb-swatch[data-index="${r.answer}"]`] : r.answer.map((i) => `.vb-swatch[data-index="${i}"]`);
      for (const s of sels) await tapEl(page, s);
      return page.waitForFunction(() => ValueBattle.state().answered, null, { timeout: 3000 }).then(() => true).catch(() => false);
    };
    const ok = await answerRight();
    const g1 = await page.evaluate(() => ({ right: ValueBattle.state().right, streak: ValueBattle.state().streak }));
    t.check(ok && g1.streak === 1, 'a finger answers the first round right', g1);
    const buttons = await page.evaluate(() => [...document.querySelectorAll('#vb-swatches .vb-swatch, .vb-controls .btn')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.className.split(' ')[0], Math.round(r.width), Math.round(r.height)]; }));
    t.check(buttons.length >= 2 && buttons.every(([, w, h]) => w >= 44 && h >= 44), 'the colors and the answer row\'s buttons are at least 44 × 44 (the row\'s own min-height: 48px)', buttons);
    const layOf = () => page.evaluate(() => { const q = (s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }); return { board: q('#vb-play')[0], parts: [...q('.vb-swatch'), ...q('#vb-bar'), ...q('.vb-controls .btn'), ...q('#vb-question')], W: window.innerWidth, H: window.innerHeight }; });
    const allIn = (l) => !!l.board && l.parts.every((p) => p[0] >= 0 && p[1] >= 0 && p[2] <= l.W && p[3] <= l.H);
    for (const vp of [SIDE, PHONE]) {
      await turn(page, vp);
      await page.waitForFunction((vp) => { const r = document.getElementById('vb-play').getBoundingClientRect(); return Math.round(r.width) === vp.width && Math.round(r.height) === vp.height; }, vp, { timeout: 5000 }).catch(() => null);
      const l = await layOf();
      t.check(fills(await rect(page, '#vb-play'), vp) && allIn(l), `turned to ${size(vp)} mid-round: the board fills the screen with every color, the bar and the answer row on it`, l);
    }
    await keyboard(page, 500);
    await page.waitForFunction(() => Math.round(document.getElementById('vb-play').getBoundingClientRect().height) === 500, null, { timeout: 5000 }).catch(() => null);
    t.check(fills(await rect(page, '#vb-play'), { width: 390, height: 500 }) && allIn(await layOf()), 'the window cut to 500 px tall: the board fits it with everything on it', await layOf());
    await keyboard(page, 844);
    await page.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await frames(page);
    await page.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await page.waitForFunction(() => Math.round(document.getElementById('vb-play').getBoundingClientRect().height) === 844 && window.visualViewport.scale === 1, null, { timeout: 5000 }).catch(() => null);
    t.check(fills(await rect(page, '#vb-play'), PHONE) && allIn(await layOf()), 'the window whole again and the page zoomed and back: the board fills the 390 × 844 screen', await layOf());
    await tapEl(page, '#vb-next');
    await page.waitForFunction(() => { const g = ValueBattle.state(); return g.i === 1 && !g.answered; }, null, { timeout: 3000 }).catch(() => null);
    t.check(await answerRight(), 'after the turns a finger answers the next round');
    await clean(t, page, 'Value battle by touch');
    await page.context().close();
  });

  // ---- Pose and light in the app, and a Figure study pose, by touch ----
  await segment(t, 'Pose and light and Figure study by touch', async () => {
    const page = await openTouch(site);
    await tapTab(page, 'pose');
    const fr = poseFrame(page);
    await fr.evaluate(() => { const l = document.getElementById('library'); if (l && !l.hidden) document.querySelector('#poses .pose-btn[data-id="stand"]').click(); });
    await fr.waitForFunction(() => document.getElementById('library').hidden, null, { timeout: 5000 }).catch(() => null);
    // the stage in view
    await page.evaluate(() => { const f = document.querySelector('#tab-pose iframe').getBoundingClientRect(); window.scrollTo(0, window.scrollY + f.top - 8); });
    await frames(page);
    const fb = await rect(page, '#tab-pose iframe');
    const vb = await fr.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const at = (x, y) => [fb.x + vb.x + x, fb.y + vb.y + y];
    const y0 = await page.evaluate(() => window.scrollY);
    await swipe(page, at(12, vb.h - 40), at(12, vb.h - 240), 4);
    await frames(page);
    t.check((await page.evaluate(() => window.scrollY)) === y0, 'a finger swiping up on the figure\'s stage turns the view and leaves the app\'s page where it is', { y0, y: await page.evaluate(() => window.scrollY) });
    const h = (await fr.evaluate(() => { window.PoseAndLight.render(); return window.PoseAndLight.ctrls(); })).find((x) => x.id === 'handR');
    const pose0 = await fr.evaluate(() => JSON.stringify(window.PoseAndLight.pose));
    if (h && h.center) {
      await swipe(page, at(h.center.x, h.center.y), at(h.center.x - 60, h.center.y - 80), 4);
      t.check((await fr.evaluate(() => JSON.stringify(window.PoseAndLight.pose))) !== pose0 && (await page.evaluate(() => window.scrollY)) === y0, 'a finger drags the right hand\'s circle: the pose changes and the page holds still');
    } else t.check(false, 'the right hand\'s circle is on the stage to drag', h);
    const light0 = await fr.evaluate(() => JSON.stringify(window.PoseAndLight.light));
    const lamp = await fr.evaluate(() => { const r = document.getElementById('lampHandle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await swipe(page, [fb.x + lamp.x, fb.y + lamp.y], [fb.x + lamp.x + 60, fb.y + lamp.y + 45], 4);
    t.check((await fr.evaluate(() => JSON.stringify(window.PoseAndLight.light))) !== light0 && (await page.evaluate(() => window.scrollY)) === y0, 'a finger drags the lamp: the light moves and the page holds still');
    const dist0 = await fr.evaluate(() => window.PoseAndLight.view.dist);
    const c = at(vb.w / 2, vb.h * 0.12);
    await touch(page, 'touchStart', [[c[0] - 20, c[1]], [c[0] + 20, c[1] + 10]]);
    for (let i = 1; i <= 4; i++) await touch(page, 'touchMove', [[c[0] - 20 - i * 20, c[1] - i * 5], [c[0] + 20 + i * 20, c[1] + 10 + i * 5]]);
    await touch(page, 'touchEnd', []);
    const dist1 = await fr.evaluate(() => window.PoseAndLight.view.dist);
    t.check(dist1 < dist0 && (await page.evaluate(() => window.visualViewport.scale)) === 1, 'two fingers spread on the stage zoom the view in, and the page itself does not zoom', { dist0, dist1 });
    await clean(t, page, 'Pose and light by touch');
    // a Figure study pose drawn by finger, then the phone turned
    await tapTab(page, 'figure');
    await tapEl(page, '#fig-start');
    await page.waitForFunction(() => /^Pose 1: /.test(document.getElementById('fig-say').textContent), null, { timeout: 30000 }).catch(() => null);
    await frames(page);
    const pb = await rect(page, '#fs-paper');
    await swipe(page, [pb.x + pb.w * 0.4, pb.y + pb.h * 0.2], [pb.x + pb.w * 0.45, pb.y + pb.h * 0.75], 8);
    const ink = await inked(page, '#fs-paper');
    t.check(ink > 50 && fills(await rect(page, '#fs-root'), PHONE), 'Figure study: a finger draws on the pose\'s paper, which fills the phone\'s screen', { ink, root: round(await rect(page, '#fs-root')) });
    for (const vp of [SIDE, PHONE]) {
      await turn(page, vp);
      await page.waitForFunction((w) => Math.round(document.getElementById('fs-root').getBoundingClientRect().width) === w, vp.width, { timeout: 5000 }).catch(() => null);
      const lay = { root: round(await rect(page, '#fs-root')), paper: round(await rect(page, '#fs-paperWrap')), done: round(await rect(page, '#fig-done')), end: round(await rect(page, '#fig-end')) };
      const inside = ['paper', 'done', 'end'].every((k) => lay[k] && lay[k][0] >= 0 && lay[k][1] >= 0 && lay[k][0] + lay[k][2] <= vp.width && lay[k][1] + lay[k][3] <= vp.height);
      t.check(fills(await rect(page, '#fs-root'), vp) && inside && (await inked(page, '#fs-paper')) === ink, `Figure study turned to ${size(vp)} mid-pose: the studio fills the screen, Done, ✕ and the paper on it, the drawing kept`, lay);
    }
    await clean(t, page, 'Figure study by touch');
    await page.context().close();
  });

  // ---- the safe areas: what a notch, the rounded corners and the home indicator leave of the screen ----
  await segment(t, 'the safe areas', async () => {
    const results = {};
    for (const [label, vp, insets] of [['upright', PHONE, { top: 0, bottom: 34, left: 0, right: 0 }], ['on its side', SIDE, { top: 0, bottom: 21, left: 47, right: 47 }]]) {
      const page = await openTouch(site, { viewport: vp, insets });
      const got = await page.evaluate(() => getComputedStyle(document.getElementById('toast')).bottom);
      const res = results[label] = {};
      // the Study page at its top, then scrolled so the tool bar is pinned
      // (the page scrolls under the home indicator, as pages do: only the sides count for it)
      res['Study the photo'] = await inBands(page, `.topbar ${CONTROLS}, .tabs ${CONTROLS}, .rail ${CONTROLS}, .work ${CONTROLS}`, { ...insets, bottom: 0 });
      await page.evaluate(() => window.scrollTo(0, 900)); await frames(page);
      res['the pinned tool bar'] = await inBands(page, '.toolstrip .tool-btn', insets);
      await page.evaluate(() => window.scrollTo(0, 0));
      await tab(page, 'paint', { wait: false }); await frames(page);
      res['the Studio'] = await inBands(page, `#tab-paint ${CONTROLS}`, insets);
      await tab(page, 'loomis', { wait: false }); await frames(page);
      res['the Loomis head'] = await inBands(page, `#tab-loomis ${CONTROLS}`, insets);
      // Trace onto paper with the camera running and a photo over it (the card goes, the strip is all there is)
      await tab(page, 'trace', { wait: false }); await frames(page);
      await click(page, '#tr-start');
      await page.waitForFunction(() => document.getElementById('tr-video').videoWidth > 0, null, { timeout: 10000 }).catch(() => null);
      await click(page, '#tr-useStudy'); await frames(page);
      res['Trace onto paper'] = await inBands(page, `#tab-trace ${CONTROLS}`, insets);
      await tab(page, 'battle', { wait: false });
      await click(page, '#vb-start');
      await page.waitForFunction(() => window.ValueBattle && ValueBattle.state() && document.getElementById('vb-play').classList.contains('is-pinned'), null, { timeout: 5000 }).catch(() => null);
      await frames(page);
      res['Value battle'] = await inBands(page, `#vb-play ${CONTROLS}, #vb-play .vb-swatch`, insets);
      await click(page, '#vb-quit'); await click(page, '#vb-quit');
      await tab(page, 'game', { wait: false });
      await page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 30000 }).catch(() => null);
      await click(page, '#gameStart');
      await page.waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
      await frames(page);
      // the first screen of the game: the bar, the board, the paints and the amount row (the numbers are below, on the page)
      res['Paint by numbers'] = await inBands(page, `.game-bar ${CONTROLS}, #gameRefFig ${CONTROLS}, .game-ref ${CONTROLS}, #gamePaints ${CONTROLS}, .game-amount ${CONTROLS}, .game-paint-scroll`, insets);
      await click(page, '#gameQuit'); await click(page, '#gameQuit');
      await tab(page, 'figure', { wait: false });
      await page.waitForFunction(() => !document.getElementById('fig-start').disabled, null, { timeout: 40000 }).catch(() => null);
      await click(page, '#fig-start');
      await page.waitForFunction(() => /^Pose 1: /.test(document.getElementById('fig-say').textContent), null, { timeout: 30000 }).catch(() => null);
      await frames(page);
      res['a Figure study pose'] = await inBands(page, `#fig-bar ${CONTROLS}, #fs-root ${CONTROLS}`, insets);
      for (const [where, list] of Object.entries(res)) t.check(!list.length, `${label} (${Object.entries(insets).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}): no control of ${where} sits in the screen's unsafe edge`, list.slice(0, 8));
      t.note(`safe areas ${label}: the toast's bottom is ${got}`);
      await clean(t, page, `safe areas ${label}`);
      await page.context().close();
    }
    const up = results.upright['Paint by numbers'];
    if (up && up.length) t.finding({
      title: 'In Paint by numbers on a phone with a home indicator, the Amount slider and the quick undo sit under the home indicator',
      severity: 'low',
      steps: '1. Open the site upright in Chrome on an Android 15 phone with gesture navigation (Chrome draws a viewport-fit=cover page under the gesture bar and reports it as env(safe-area-inset-bottom)), or in Safari on an iPhone with Face ID once its toolbar has folded away (a 34 px inset). 2. Games → Paint by numbers → Start painting. 3. Look at the Amount row along the bottom of the screen.',
      expected: 'The page asks for the whole screen (viewport-fit=cover in index.html), and the Studio\'s strip, the battle board and the toast keep clear of the bottom inset with env(safe-area-inset-bottom). The README: "the timer bar, the painting and the palette fill the screen" — the safe part of it; a sideways drag of the slider on the home indicator switches apps on an iPhone.',
      actual: `With a 34 px bottom inset: ${up.join('; ')}.`,
      cause: 'styles.css:1046-1054 (.game-play under 1000 px) sizes the rows to 100dvh less 16 px and the fixed rows, with nothing for env(safe-area-inset-bottom); styles.css:1044 pads .game-focus .app by 8 px only.',
    });
    const side = results['on its side'];
    const bad = Object.entries(side || {}).filter(([, l]) => l.length);
    if (bad.length) t.finding({
      title: 'On a phone held sideways, the full-screen tabs\' controls (the Studio\'s, the Loomis head\'s and a Figure pose\'s strips, the battle\'s ✕, the game\'s Lock in and paints) and the page itself sit under the notch and in the rounded corners',
      severity: 'medium',
      steps: '1. Open the site in Safari on an iPhone with a notch or Dynamic Island, held sideways (844 × 390, the notch giving 47 px insets left and right). 2. Open the Studio, the Loomis head, Value battle (Start), Paint by numbers (Start painting) and a Figure study class; also look at the Study page.',
      expected: 'index.html asks for viewport-fit=cover, which tells Safari the page keeps its own content out of the notch: every control inside env(safe-area-inset-left/right), as the bottom strip, the toast and the busy pill already do with env(safe-area-inset-bottom/top).',
      actual: bad.map(([k, l]) => `${k}: ${l.slice(0, 5).join('; ')}${l.length > 5 ? ` and ${l.length - 5} more` : ''}`).join(' | '),
      cause: 'Nothing reads env(safe-area-inset-left) or env(safe-area-inset-right): styles.css:70 pads .app by max(16px, 2vw) only; js/painting.js:46-66 pin() gives the pinned studio, the Loomis head and the battle board the whole window; styles.css:1480 puts the strip 14 px from the left; styles.css:1658 and 1525 pad the battle board and the Figure bar by 12-14 px; styles.css:835-837 and 1044 the game\'s bar and page by 8-14 px.',
    });
  });
}
