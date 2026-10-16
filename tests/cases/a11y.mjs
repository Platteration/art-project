// Accessibility across the whole site, played as a keyboard-only and screen-reader visitor: every tab, every drawer,
// menu, dialog, sheet, pop-up and game screen. The expectation is what the README says and what a visitor who cannot
// use a pointer, or cannot see the screen, reasonably expects:
//   - everything reachable and operable from the keyboard alone, in a sensible order, with no trap; Escape closes what
//     it opened, and focus goes back to what opened a dialog, sheet or menu
//   - the focus always shows (:focus-visible with a ring), never sits on something hidden, inert or covered, and is
//     never dropped on the page after an action
//   - every control has a name, and the name holds the words it shows (axe-core's label-content-name-mismatch)
//   - results reach a screen reader (live regions, or the name or description of what the focus lands on): answers,
//     scores, toasts, errors
//   - aria-pressed / aria-expanded / aria-checked follow what is shown
//   - axe-core finds nothing serious or critical in light and dark, at 1400 × 900 and 390 × 844, in every tab's main
//     states (setup, playing, result), in Pose and light (embedded and pose.html on its own) and in Figure study
//   - reduced motion means no movement animation
// Names are read from Chromium's own accessibility tree (CDP Accessibility.getPartialAXTree), not guessed from markup.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, clean, tab, click, axe, poseFrame, stroke, app, ROOT, DESKTOP, PHONE, textFile } from '../lib.mjs';

const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const ONLY = process.env.A11Y_ONLY ? new RegExp(process.env.A11Y_ONLY) : null;

// one block's failure is one failed check; the page it opened is closed whatever happens
async function segment(t, name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  const pages = [];
  try { await fn(pages); } catch (e) { t.check(false, `${name}: ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  for (const p of pages) await p.context().close().catch(() => null);
  t.note(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---- reading the focus ------------------------------------------------------------------------------------------

// What the visitor sees of the focused element (followed into same-origin frames: the Pose page is one): an id to
// tell stops apart, whether it is :focus-visible, whether a ring is drawn (an outline on it, on the label that stands
// in for a visually hidden input, or on a child's pseudo-element as the compare handle does), whether it is on screen
// and on top, and whether it sits in something hidden or inert. (No eval here: the pages run under the site's policy.)
const probe = () => {
  let el = document.activeElement;
  while (el && el.tagName === 'IFRAME') { let d = null; try { d = el.contentDocument; } catch (e) { d = null; } if (!d || !d.activeElement || d.activeElement === d.body) break; el = d.activeElement; }
  if (!el || el.tagName === 'BODY' || el === document.documentElement) return { body: true };
  const win = el.ownerDocument.defaultView;
  win.__a11yIds = win.__a11yIds || new WeakMap(); win.__a11yN = win.__a11yN || 0;
  let id = win.__a11yIds.get(el); if (!id) { id = (win === window ? 't' : 'f') + (++win.__a11yN); win.__a11yIds.set(el, id); }
  const cs = win.getComputedStyle(el);
  const tiny = (e) => { const r = e.getBoundingClientRect(); return r.width <= 2 || r.height <= 2 || win.getComputedStyle(e).opacity === '0'; };
  const labels = el.labels ? [...el.labels] : [];
  const proxy = /^(radio|checkbox|file)$/.test(el.type || '') && tiny(el) && labels.length ? labels[0] : el;
  const ringOn = (e, pseudo) => { const s = win.getComputedStyle(e, pseudo); const a = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(s.outlineColor); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1 && !(a && +a[1] === 0); };
  const ring = [el, ...labels].some((e) => ringOn(e, null)) || [...el.children].some((c) => ringOn(c, '::after') || ringOn(c, '::before'));
  const r = proxy.getBoundingClientRect();
  // in a frame, the box is placed in the top window as well (the app's page scrolls with the frame in it)
  const frameEl = win === window ? null : win.frameElement;
  const fr = frameEl ? frameEl.getBoundingClientRect() : { left: 0, top: 0 };
  const inView = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth
    && (!frameEl || (r.bottom + fr.top > 0 && r.top + fr.top < innerHeight && r.right + fr.left > 0 && r.left + fr.left < innerWidth));
  const cx = Math.min(win.innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(win.innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = el.ownerDocument.elementFromPoint(cx, cy);
  const onTop = !!top && (proxy.contains(top) || el.contains(top) || labels.some((l) => l.contains(top)));
  const hidden = !!el.closest('[hidden], [inert], [aria-hidden="true"]') || cs.visibility === 'hidden' || (el.checkVisibility ? !el.checkVisibility() : false);
  return {
    id, tag: el.tagName.toLowerCase(), elId: el.id, cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 40),
    text: (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    fv: el.matches(':focus-visible'), ring, inView, onTop, top: top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${String(top.className).slice(0, 25)}` : null, hidden,
    inFrame: !!frameEl, frameShown: !frameEl || fr.height > 0,
  };
};
// the same, for Chromium's accessibility tree (an expression run through CDP, which the page's policy does not cover)
const DEEP_ACTIVE = `(() => { let a = document.activeElement; while (a && a.tagName === 'IFRAME') { let d = null; try { d = a.contentDocument; } catch (e) { d = null; } if (!d || !d.activeElement || d.activeElement === d.body) break; a = d.activeElement; } return a && a.tagName !== 'BODY' && a !== document.documentElement ? a : null; })()`;
const focusNow = (page) => page.evaluate(probe);
// a box may still be scrolling into view when first read (a paint scrolled to in its row): read it again a frame later
async function focusSettled(page) {
  let x = await focusNow(page);
  for (let i = 0; i < 4 && !x.body && (!x.inView || !x.onTop); i++) { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); x = await focusNow(page); }
  return x;
}
const label = (x) => (x.body ? 'the page itself' : `${x.tag}${x.elId ? '#' + x.elId : ''} "${x.text}"${x.hidden ? ' (hidden)' : ''}`);
// where the focus is once the page has drawn again (a focused control hidden by an action loses the focus then)
async function focusAfter(page) { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); return focusNow(page); }

// Chromium's accessibility tree for the focused element: its role, name and description, and its ancestors'
async function axSession(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('Accessibility.enable');
  return cdp;
}
const v = (n, k) => (n && n[k] && n[k].value != null ? String(n[k].value) : '');
async function axFocused(cdp) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: DEEP_ACTIVE });
  if (!result || !result.objectId) return null;
  try {
    const { node } = await cdp.send('DOM.describeNode', { objectId: result.objectId });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: true });
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const me = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId) || nodes[0];
    const out = { role: v(me, 'role'), name: v(me, 'name'), description: v(me, 'description'), ignored: !!(me && me.ignored), ancestors: [] };
    for (let p = me && byId.get(me.parentId); p; p = byId.get(p.parentId)) out.ancestors.push({ role: v(p, 'role'), name: v(p, 'name'), description: v(p, 'description') });
    return out;
  } finally { await cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => null); }
}
// What a screen reader is given by an action: the text of every live region on screen (status, alert, aria-live) that
// changed since liveMark() was called before the action (a region is read when it changes, not for what it already
// held), and the name and description of the focused element and of the group or dialog it sits in.
const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
const liveMark = (page) => page.evaluate((sel) => { window.__liveBefore = new Map([...document.querySelectorAll(sel)].map((e) => [e, e.textContent.replace(/\s+/g, ' ').trim()])); }, LIVE);
async function announced(page, cdp) {
  const live = await page.evaluate((sel) => [...document.querySelectorAll(sel)]
    .filter((e) => (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : true) && !e.closest('[hidden]'))
    .map((e) => [e, e.textContent.replace(/\s+/g, ' ').trim()])
    .filter(([e, x]) => x && !(window.__liveBefore && window.__liveBefore.get(e) === x)).map(([, x]) => x), LIVE);
  const f = cdp ? await axFocused(cdp) : null;
  const around = f ? f.ancestors.filter((a) => /^(group|dialog|alertdialog|region)$/.test(a.role)).flatMap((a) => [a.name, a.description]) : [];
  return [...live, ...(f ? [f.name, f.description] : []), ...around].filter(Boolean).join(' | ');
}

// Press Tab from where the focus is, up to max times, and read every stop. The walk ends when it is back at its first
// stop (it went round the page: no trap), or when one element keeps the focus for three presses (a trap).
async function walk(page, { cdp = null, max = 60, shift = false } = {}) {
  const stops = [];
  let first = null, cycled = false, trapped = false, same = 0, last = null;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
    const x = await focusSettled(page);
    if (!x.body && cdp) { const ax = await axFocused(cdp).catch(() => null); x.name = ax ? ax.name : null; x.role = ax ? ax.role : null; x.axIgnored = ax ? ax.ignored : null; }
    if (!x.body && x.id === last) { if (++same >= 2) { trapped = true; stops.push(x); break; } } else same = 0;
    last = x.body ? null : x.id;
    if (!x.body && first && x.id === first) { cycled = true; break; }
    if (!x.body && !first) first = x.id;
    stops.push(x);
  }
  return { stops, cycled, trapped };
}
// the checks every walk must pass
function checkWalk(t, where, w, { names = false } = {}) {
  const real = w.stops.filter((x) => !x.body);
  t.check(real.length > 0 && w.cycled && !w.trapped, `${where}: Tab goes through the page and comes back round, with no trap`, { stops: real.length, cycled: w.cycled, trapped: w.trapped, last: label(w.stops[w.stops.length - 1] || { body: true }) });
  const noRing = real.filter((x) => !x.fv || !x.ring);
  t.check(noRing.length === 0, `${where}: every Tab stop shows a focus ring (:focus-visible, with an outline)`, noRing.map(label));
  const unseen = real.filter((x) => x.hidden || !x.inView || !x.onTop || !x.frameShown);
  t.check(unseen.length === 0, `${where}: every Tab stop is on screen, on top, and not inside anything hidden or inert`, unseen.map((x) => `${label(x)} (${x.hidden ? 'hidden' : !x.inView ? 'out of view' : !x.onTop ? 'under ' + x.top : 'frame hidden'})`));
  if (names) {
    const nameless = real.filter((x) => x.name !== undefined && (!x.name || !x.name.trim() || x.axIgnored));
    t.check(nameless.length === 0, `${where}: every Tab stop has a name a screen reader reads`, nameless.map((x) => `${label(x)} role=${x.role}`));
  }
  return real;
}

// press a key with the focus on an element first (as a visitor who has tabbed there)
async function keyOn(page, selector, key = 'Enter', frame = null) {
  const fr = frame || app(page);
  if (frame && frame !== page.mainFrame()) await page.evaluate((u) => { const f = [...document.querySelectorAll('iframe')].find((x) => x.contentWindow && x.contentWindow.location.href === u); if (f) f.focus(); }, frame.url());
  await fr.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.focus(); }, selector);
  await page.keyboard.press(key);
}
const focusIs = (page, selector, frame = null) => (frame || app(page)).evaluate((s) => { const e = document.querySelector(s); return !!e && document.activeElement === e; }, selector);
// press Tab (or Shift+Tab) until the focus is on an element the selector matches, at most max times: whether it got there
async function pressTo(page, selector, { key = 'Tab', max = 30, frame = null } = {}) {
  const on = () => (frame || app(page)).evaluate((s) => !!document.activeElement && document.activeElement.matches(s), selector);
  for (let i = 0; i < max; i++) { if (await on()) return true; await page.keyboard.press(key); }
  return on();
}
const attr = (page, selector, name, frame = null) => (frame || app(page)).evaluate(([s, n]) => { const e = document.querySelector(s); return e ? e.getAttribute(n) : null; }, [selector, name]);
const shown = (page, selector, frame = null) => (frame || app(page)).evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && (e.checkVisibility ? e.checkVisibility() : true); }, selector);
const waitFor = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
// the page's clock moved forward (the battle's and the class's clocks read performance.now), so a long wait needs none
const skewClock = (page) => page.evaluate(() => { if (window.__skew) return; const real = performance.now.bind(performance); let skew = 0; performance.now = () => real() + skew; window.__skew = (ms) => { skew += ms; }; });
// press a button until the page takes it (Figure's Done waits half a second after a pose shows, its card's buttons 0.6 s)
async function pressUntil(page, selector, done, { key = 'Enter', tries = 20 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (key) await keyOn(page, selector, key); else await click(page, selector);
    if (await waitFor(page, done, null, 400)) return true;
  }
  return false;
}
// the pop-ups' entrances (count, stars, grade, New best!) have ended: what axe reads is what stays on screen
const settled = (page) => waitFor(page, () => !document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().endTime !== Infinity), null, 10000);
// running animations that move something (transform, translate, scale, rotate, or a box's place)
const MOVING = () => document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'pending').map((a) => {
  const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
  const props = [...new Set(kf.flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))];
  if (a.transitionProperty) props.push(a.transitionProperty);
  const el = a.effect && a.effect.target;
  return { what: el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).slice(0, 30)}${a.effect.pseudoElement || ''}` : '?', kind: a.constructor.name, name: a.animationName || a.transitionProperty || '', props };
}).filter((x) => x.props.some((p) => /transform|translate|scale|rotate|^(top|left|right|bottom|inset)$/.test(p)));

export default async function a11y(t, site) {
  const seen = new Set(); // findings already written, for a defect a later block meets again
  // =================================================================================================================
  // The shell: the header, the sections and their menus, the Study tab's tools, drawers and dialog, the guide
  // =================================================================================================================
  await segment(t, 'study and sections (desktop)', async (pages) => {
    const page = await openPage(site); pages.push(page);
    const cdp = await axSession(page);
    const w = await walk(page, { cdp });
    const real = checkWalk(t, 'Study the photo, desktop', w, { names: true });
    const order = real.slice(0, 7).map((x) => x.name);
    t.check(/^Simple$/.test(order[0]) && /^Advanced$/.test(order[1]) && /^Load photo$/.test(order[2]) && /^Learning tools/.test(order[3]) && /^Studio/.test(order[4]) && /^Figure study/.test(order[5]) && /^Games/.test(order[6]), 'Study tab: Tab starts with the header (Simple, Advanced, Load photo), then the four sections in the order they are shown', order);

    // ---- the Learning tools menu, from the keyboard ----
    await keyOn(page, '#tabLearnBtn', 'Enter');
    await waitFor(page, () => !document.getElementById('tabLearnMenu').hidden);
    const open = { expanded: await attr(page, '#tabLearnBtn', 'aria-expanded'), focus: await focusIs(page, '#tabStudyBtn'), checked: await attr(page, '#tabStudyBtn', 'aria-checked') };
    t.check(open.expanded === 'true' && open.focus && open.checked === 'true', 'Learning tools: Enter opens the menu (aria-expanded) with the focus on the page that is open (aria-checked)', open);
    const look = (sel) => page.evaluate((s) => { const e = document.querySelector(s); const c = getComputedStyle(e); return { outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`, bg: c.backgroundColor, color: c.color, shadow: c.boxShadow, deco: c.textDecorationLine, border: c.borderColor, focused: document.activeElement === e, fv: e.matches(':focus-visible') }; }, sel);
    const studyFocused = await look('#tabStudyBtn');
    await page.keyboard.press('ArrowDown');
    const loomisFocused = await look('#tabLoomisBtn'), studyAfter = await look('#tabStudyBtn');
    await page.keyboard.press('ArrowUp');
    const loomisAfter = await look('#tabLoomisBtn');
    const differs = (a, b) => ['outline', 'bg', 'color', 'shadow', 'deco', 'border'].some((k) => a[k] !== b[k]);
    t.check(loomisFocused.focused && differs(loomisFocused, loomisAfter), 'Learning tools: an item shows when it has the focus (ArrowDown moves it)', { focused: loomisFocused, after: loomisAfter });
    const visibleOnChecked = studyFocused.focused && studyFocused.fv && differs(studyFocused, studyAfter);
    if (!t.check(visibleOnChecked, 'Learning tools: the item the menu opens on (the page that is open) shows that it has the focus', { focused: studyFocused, unfocused: studyAfter })) {
      t.finding({
        title: 'The section menus open with an invisible focus: the open page\'s item looks the same focused or not',
        severity: 'medium',
        steps: '1. Open the site (any width), press Tab four times to reach Learning tools. 2. Press Enter (or ArrowDown). The menu opens and the focus is put on "Study the photo", the page that is open. 3. Look for the focus. Same with Games once Value battle or Paint by numbers is open, and every time a menu is reopened.',
        expected: 'The focus is always visible (WCAG 2.4.7): the item with the focus looks different from the same item without it, as every other control on the site does with its outline.',
        actual: `Focused, "Study the photo" has outline ${studyFocused.outline}, background ${studyFocused.bg}, color ${studyFocused.color}; unfocused (after ArrowDown), outline ${studyAfter.outline}, background ${studyAfter.bg}, color ${studyAfter.color}: identical. Other items do change (background ${loomisAfter.bg} → ${loomisFocused.bg}), so the focus appears only after the first ArrowDown.`,
        cause: 'styles.css:383 gives .tab-item:focus-visible "outline: none" and the --ground background as its only sign of focus, and styles.css:384 (.tab-item[aria-checked="true"], same specificity, later) paints the checked item --accent over it, so the checked item has no focus style at all. js/app.js:2270 (focusIn) puts the focus on exactly that item when the menu opens.',
      });
    }
    await page.keyboard.press('Escape');
    const closed = { hidden: await page.evaluate(() => document.getElementById('tabLearnMenu').hidden), expanded: await attr(page, '#tabLearnBtn', 'aria-expanded'), focus: await focusIs(page, '#tabLearnBtn') };
    t.check(closed.hidden && closed.expanded === 'false' && closed.focus, 'Learning tools: Escape closes the menu (aria-expanded false) and gives the focus back to its button', closed);
    // Tab goes on through the items (they are buttons) and, past the last, out of the group, which closes the menu
    await page.keyboard.press('ArrowDown');
    await waitFor(page, () => !document.getElementById('tabLearnMenu').hidden);
    let inMenu = 0;
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.querySelector('.tab-group[data-group="learn"]').contains(document.activeElement)))) break; inMenu++; }
    const tabbedOut = { hidden: await page.evaluate(() => document.getElementById('tabLearnMenu').hidden), expanded: await attr(page, '#tabLearnBtn', 'aria-expanded'), itemsTabbed: inMenu, focus: label(await focusNow(page)) };
    t.check(tabbedOut.hidden && tabbedOut.expanded === 'false' && /Studio/.test(tabbedOut.focus), 'Learning tools: Tab out of the open menu (past its last item) closes it and goes on to Studio', tabbedOut);
    t.note(`Learning tools: with the menu open, Tab stops on ${inMenu} of its items before leaving it (they are plain buttons; the arrows move between them too)`);
    // Games: Enter on Value battle opens it; the section button keeps the focus and says which page it shows
    await keyOn(page, '#tabGamesBtn', 'Enter');
    await waitFor(page, () => !document.getElementById('tabGamesMenu').hidden);
    await page.keyboard.press('ArrowDown');
    const onBattle = await focusIs(page, '#tabBattleBtn');
    await page.keyboard.press('Enter');
    await waitFor(page, () => !document.getElementById('tab-battle').hidden);
    const picked = { onBattle, focus: await focusIs(page, '#tabGamesBtn'), current: await attr(page, '#tabGamesBtn', 'aria-current'), checked: await attr(page, '#tabBattleBtn', 'aria-checked'), study: await attr(page, '#tabStudyBtn', 'aria-checked'), learn: await attr(page, '#tabLearnBtn', 'aria-current'), name: (await axFocused(cdp) || {}).name };
    t.check(picked.onBattle && picked.focus && picked.current === 'true' && picked.checked === 'true' && picked.study === 'false' && picked.learn === 'false' && /Value battle/.test(picked.name), 'Games: Enter on Value battle opens it, the focus goes back to Games, which is current and is named with the page it shows', picked);
    await keyOn(page, '#tabLearnBtn', 'Enter'); await waitFor(page, () => !document.getElementById('tabLearnMenu').hidden); await page.keyboard.press('Enter');
    await waitFor(page, () => !document.getElementById('tab-study').hidden);

    // ---- the tool bar, the Grid, the mode switch and the block view say what they are set to ----
    await keyOn(page, '[data-tool="line"]', 'Enter');
    const lineOn = await page.evaluate(() => ({ line: document.querySelector('[data-tool="line"]').getAttribute('aria-pressed'), sample: document.querySelector('[data-tool="sample"]').getAttribute('aria-pressed'), options: !!document.querySelector('#toolOptions .line-tools') && getComputedStyle(document.querySelector('#toolOptions .line-tools')).display !== 'none' }));
    await page.keyboard.press('Enter');
    const lineOff = await attr(page, '[data-tool="line"]', 'aria-pressed');
    t.check(lineOn.line === 'true' && lineOn.sample === 'false' && lineOn.options && lineOff === 'false', 'Tool bar: Enter on Lines turns it on (aria-pressed, the Magnifier off, its options shown) and Enter again turns it off', { lineOn, lineOff });
    const grid = [];
    for (let i = 0; i < 3; i++) { await keyOn(page, '#gridBtn', 'Enter'); grid.push({ name: (await axFocused(cdp) || {}).name, badge: await page.evaluate(() => { const b = document.getElementById('gridBadge'); return b.hidden ? '' : b.textContent; }) }); }
    t.check(/3 × 3/.test(grid[0].name) && /4 × 4/.test(grid[1].name) && /off/.test(grid[2].name) && grid[2].badge === '', 'Grid: each press says the grid it now shows in the button\'s name (3 × 3, 4 × 4, off)', grid);
    await keyOn(page, '[data-mode="advanced"]', 'Enter');
    const adv = { adv: await attr(page, '[data-mode="advanced"]', 'aria-pressed'), simple: await attr(page, '[data-mode="simple"]', 'aria-pressed'), body: await page.evaluate(() => !document.body.classList.contains('mode-simple')) };
    await keyOn(page, '[data-mode="simple"]', 'Enter');
    t.check(adv.adv === 'true' && adv.simple === 'false' && adv.body && (await attr(page, '[data-mode="simple"]', 'aria-pressed')) === 'true', 'Simple / Advanced: the pressed button is the mode shown', adv);
    await keyOn(page, '#blockViewPalette', 'Enter');
    const pal = { palette: await attr(page, '#blockViewPalette', 'aria-pressed'), photo: await attr(page, '[data-block-view="photo"]', 'aria-pressed') };
    await keyOn(page, '[data-block-view="photo"]', 'Enter');
    t.check(pal.palette === 'true' && pal.photo === 'false' && (await attr(page, '[data-block-view="photo"]', 'aria-pressed')) === 'true', 'Big color shapes: the Photo / palette switch says which is shown', pal);

    // ---- Picked colors from the keyboard: add, remove one, clear ----
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; document.getElementById('drawer-swatches').open = true; });
    await liveMark(page);
    await keyOn(page, '#addBlocks', 'Enter');
    await waitFor(page, () => document.querySelectorAll('#swatches .swatch').length > 2);
    const toastSaid = await announced(page, null);
    t.check(/Added \d+ block colors?/.test(toastSaid), 'Picked colors: Add block colors is said in the status line (a live region)', toastSaid);
    const n0 = await page.evaluate(() => document.querySelectorAll('#swatches .swatch').length);
    await keyOn(page, '#swatches .swatch-remove', 'Enter');
    const afterRemove = { n: await page.evaluate(() => document.querySelectorAll('#swatches .swatch').length), focus: await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('swatch-remove')), name: (await axFocused(cdp) || {}).name };
    t.check(afterRemove.n === n0 - 1 && afterRemove.focus && /^Remove #[0-9a-f]{6}$/i.test(afterRemove.name), 'Picked colors: × removes one color and the focus moves to the next ×, named for its color', { n0, ...afterRemove });
    await keyOn(page, '#palClear', 'Enter');
    await page.keyboard.press('Enter');
    await waitFor(page, () => document.querySelectorAll('#swatches .swatch').length === 0, null, 5000);
    const cleared = await focusAfter(page);
    const clearOk = !cleared.body && !cleared.hidden;
    if (!t.check(clearOk, 'Picked colors: after Clear (twice) the focus is still on something in the drawer, not dropped on the page', label(cleared))) {
      t.finding({
        title: 'Clearing the picked colors from the keyboard drops the focus on the page',
        severity: 'low',
        steps: '1. Study tab, open Colors and paints and press Add block colors to picked colors. 2. Open Picked colors, Tab to Clear, press Enter, then Enter again ("Click again to clear"). 3. Press Tab or read where the focus is.',
        expected: 'The focus stays in the drawer (its header, or the empty note), as it does when a single color is removed with ×: "keep keyboard focus in the list" (js/app.js:1130).',
        actual: `The colors are cleared and every palette button is disabled, Clear with them; document.activeElement is ${label(cleared)}, so the next Tab starts again from the top of the page and a screen reader is told nothing.`,
        cause: 'js/app.js:1144 (renderPalette) disables Sort, Copy, Save and Clear when the list is empty, including the Clear button that has the focus, and the Clear handler (js/app.js:1203-1216) moves the focus nowhere, unlike the × handler (js/app.js:1124-1134).',
      });
    }

    // ---- My paints: a modal dialog ----
    await keyOn(page, '[data-mode="advanced"]', 'Enter');
    await keyOn(page, '#srcPreset', 'ArrowRight');
    await waitFor(page, () => !document.getElementById('minePane').hidden);
    await keyOn(page, '#mineEdit', 'Enter');
    await waitFor(page, () => document.getElementById('paintDialog').open);
    const inDialog = await page.evaluate(() => document.getElementById('paintDialog').contains(document.activeElement));
    await page.keyboard.press('Escape');
    await waitFor(page, () => !document.getElementById('paintDialog').open, null, 3000);
    const back = { open: await page.evaluate(() => document.getElementById('paintDialog').open), focus: await focusIs(page, '#mineEdit') };
    t.check(inDialog && !back.open && back.focus, 'My paints: the dialog opens with the focus in it, Escape closes it and the focus is back on Choose my paints', { inDialog, ...back });
    await keyOn(page, '#srcPreset', 'Space');
    await keyOn(page, '[data-mode="simple"]', 'Enter');

    // ---- an error is said in the status line ----
    await liveMark(page);
    await page.setInputFiles('#file', textFile());
    await waitFor(page, () => /not an image/.test(document.getElementById('toast').textContent), null, 8000);
    const err = await announced(page, null);
    t.check(/not an image/.test(err), 'Load photo with a text file: the error is said in the status line (role=status)', err);

    // ---- the guide ----
    await tab(page, 'help');
    await keyOn(page, '#tabLearnBtn', 'Escape');
    const wh = await walk(page, { cdp, max: 80 });
    checkWalk(t, 'How to use, desktop', wh, { names: true });
    await keyOn(page, '#tab-help [data-go="paint"]', 'Enter');
    await waitFor(page, () => !document.getElementById('tab-paint').hidden);
    t.check(await focusIs(page, '#tabPaintBtn'), 'How to use: Go to Studio opens the Studio with the focus on its section button', label(await focusNow(page)));
    await clean(t, page, 'study and sections');
  });

  // =================================================================================================================
  // The Studio's sheets
  // =================================================================================================================
  await segment(t, 'Studio sheets (desktop)', async (pages) => {
    const page = await openPage(site); pages.push(page);
    const cdp = await axSession(page);
    await tab(page, 'paint');
    await waitFor(page, () => window.PaintStudio && document.querySelectorAll('#ps-paints .ps-paint').length > 0, null, 20000);
    await keyOn(page, '#tabPaintBtn', 'Escape');
    checkWalk(t, 'Studio, desktop', await walk(page, { cdp }), { names: true });
    const SHEETS = [['#ps-colorBtn', '#ps-paintSheet', 'Paints and mixing'], ['#ps-refBtn', '#ps-refSheet', 'Reference'], ['#ps-canvasBtn', '#ps-canvasSheet', 'Canvas'], ['#ps-viewBtn', '#ps-viewSheet', 'Zoom and pan']];
    const rows = [];
    for (const [btn, sheet, name] of SHEETS) {
      await keyOn(page, btn, 'Enter');
      const opened = { shown: await shown(page, sheet), expanded: await attr(page, btn, 'aria-expanded') };
      await page.keyboard.press('Tab');
      const next = await focusNow(page);
      const intoSheet = await page.evaluate((s) => document.querySelector(s).contains(document.activeElement), sheet);
      // into the sheet by hand, then Escape
      await page.evaluate((s) => { const f = [...document.querySelector(s).querySelectorAll('button:not([disabled]), input:not([disabled]), select')].find((e) => e.offsetParent); if (f) f.focus(); }, sheet);
      await page.keyboard.press('Escape');
      const esc = { hidden: !(await shown(page, sheet)), expanded: await attr(page, btn, 'aria-expanded'), focus: label(await focusAfter(page)), backOnIcon: await focusIs(page, btn) };
      rows.push({ name, opened, tabTo: label(next), intoSheet, esc });
    }
    t.check(rows.every((r) => r.opened.shown && r.opened.expanded === 'true' && r.esc.hidden && r.esc.expanded === 'false'), 'Studio: each strip icon opens its sheet from the keyboard (aria-expanded true) and Escape closes it (aria-expanded false)', rows.map((r) => [r.name, r.opened, r.esc.hidden, r.esc.expanded]));
    if (!t.check(rows.every((r) => r.intoSheet), 'Studio: Tab from the icon that opened a sheet goes into that sheet', rows.map((r) => `${r.name} → ${r.tabTo}`))) {
      t.finding({
        title: 'A Studio sheet opened from the keyboard is not next in the Tab order: Tab goes on along the strip, and the sheet is only reached backwards',
        severity: 'medium',
        steps: '1. Open the Studio. 2. Tab to Paints and mixing (or Reference, Canvas, Zoom and pan) and press Enter: the sheet opens over the paper. 3. Press Tab.',
        expected: 'The next Tab goes into the sheet that just opened (its first control), so a keyboard visitor can use what they opened; a screen reader user is taken to it.',
        actual: `Tab goes to the next icon on the strip instead: ${rows.map((r) => `${r.name} → ${r.tabTo}`).join('; ')}. The sheet comes before the strip in the page, so it is reached only with Shift+Tab, past every strip icon before it.`,
        cause: 'index.html:452-595 places the six sheets (section.ps-sheet) before the strip (nav.ps-strip, index.html:596), and js/painting.js:539 (openSheet) only unhides the sheet and sets aria-expanded; it never moves the focus into it.',
      });
    }
    const escBad = rows.filter((r) => !r.esc.backOnIcon);
    // the × and Lock in
    await keyOn(page, '#ps-canvasBtn', 'Enter');
    await keyOn(page, '#ps-canvasSheet .ps-x', 'Enter');
    const afterX = { hidden: !(await shown(page, '#ps-canvasSheet')), focus: label(await focusAfter(page)), backOnIcon: await focusIs(page, '#ps-canvasBtn') };
    await keyOn(page, '#ps-colorBtn', 'Enter');
    await keyOn(page, '#ps-paints .ps-paint', 'Enter');
    const well = await page.evaluate(() => document.getElementById('ps-wellParts').textContent);
    await keyOn(page, '#ps-lock', 'Enter');
    const afterLock = { hidden: !(await shown(page, '#ps-paintSheet')), focus: label(await focusAfter(page)), backOnIcon: await focusIs(page, '#ps-colorBtn'), well };
    await keyOn(page, '#ps-canvasBtn', 'Enter');
    const saved = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await keyOn(page, '#ps-save', 'Enter');
    const download = await saved;
    const afterSave = { hidden: !(await shown(page, '#ps-canvasSheet')), focus: label(await focusAfter(page)), backOnIcon: await focusIs(page, '#ps-canvasBtn'), file: download ? download.suggestedFilename() : null };
    const dropped = [...escBad.map((r) => `Escape in ${r.name} → ${r.esc.focus}`), ...(afterX.backOnIcon ? [] : [`× in Canvas → ${afterX.focus}`]), ...(afterLock.backOnIcon ? [] : [`Lock in → ${afterLock.focus}`]), ...(afterSave.backOnIcon ? [] : [`Save as PNG (${afterSave.file || 'no download'}) → ${afterSave.focus}`])];
    if (!t.check(dropped.length === 0, 'Studio: closing a sheet (Escape, its ×, Lock in, Save as PNG) gives the focus back to the icon that opened it', dropped)) {
      t.finding({
        title: 'Closing a Studio sheet from the keyboard (Escape, ×, Lock in, Save as PNG) drops the focus on the page',
        severity: 'medium',
        steps: '1. Open the Studio, Tab to Paints and mixing, press Enter. 2. Shift+Tab into the sheet (or click into it) and press Escape; or Tab to the sheet\'s × and press Enter; or tap a paint and press Lock in; or press Save as PNG in the Canvas sheet. Same for the Brushes, Reference, Canvas and Zoom sheets, and in Figure study\'s copy of the Studio.',
        expected: 'Focus goes back to the strip icon that opened the sheet (the usual pattern for a disclosure or non-modal dialog, and what the site does for its menus and modal dialogs), so the visitor can carry on from there.',
        actual: `${dropped.join('; ')}. The sheet is hidden around the focused control, so the focus is lost (document.activeElement is the body once the page has drawn again): the next Tab starts from the top of the page, and a screen reader says nothing.`,
        cause: 'js/painting.js:538 (closeSheets) hides every sheet and resets aria-expanded but never moves the focus; it is what Escape (js/painting.js:548), the × buttons (js/painting.js:540), Lock in (js/painting.js:799) and Save as PNG (js/painting.js:267) call.',
      });
      seen.add('sheets');
    }
    // the brush row says which brush is in hand
    await keyOn(page, '#ps-brushBtn', 'Enter');
    await waitFor(page, () => !document.getElementById('ps-brushSheet').hidden, null, 3000);
    await keyOn(page, '#ps-brushSheet [data-brush="round"]', 'Enter');
    const brush = await page.evaluate(() => [...document.querySelectorAll('#ps-brushSheet [data-brush]')].map((b) => `${b.dataset.brush}=${b.getAttribute('aria-pressed')}`).concat([`roundOpts=${!document.getElementById('ps-roundOpts').hidden}`]));
    t.check(brush.includes('round=true') && brush.filter((x) => /=true$/.test(x)).length === 2 && brush.includes('roundOpts=true'), 'Studio: Enter on a brush presses it (aria-pressed) and shows its options', brush);
    await page.keyboard.press('Escape');
    await clean(t, page, 'Studio sheets');
  });

  // =================================================================================================================
  // A phone: the pages that step aside, and their way back
  // =================================================================================================================
  await segment(t, 'phone: Study, Studio and Loomis head', async (pages) => {
    const page = await openPage(site, { viewport: PHONE }); pages.push(page);
    const cdp = await axSession(page);
    checkWalk(t, 'Study the photo, phone', await walk(page, { cdp }), { names: true });
    await tab(page, 'paint');
    await waitFor(page, () => window.PaintStudio && document.querySelectorAll('#ps-paints .ps-paint').length > 0, null, 20000);
    checkWalk(t, 'Studio, phone', await walk(page, { cdp }), { names: true });
    await keyOn(page, '#ps-exit', 'Enter');
    await waitFor(page, () => !document.getElementById('tab-study').hidden, null, 5000);
    const studioBack = await focusAfter(page);
    await tab(page, 'loomis');
    await waitFor(page, () => document.getElementById('lh-ask').textContent.length > 0, null, 10000);
    const lw = await walk(page, { cdp });
    checkWalk(t, 'Loomis head, phone', lw, { names: true });
    // the photo takes no focus and no key places a mark: the whole tool waits for a pointer
    const onStage = lw.stops.filter((x) => !x.body && /^lh-(overlay|photo|stage|wrap)$/.test(x.elId));
    // the keys a visitor would try on the photo, with the focus on the page (not on ← or Load a photo, which they would press)
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    for (const k of ['Enter', 'Space', 'ArrowRight']) await page.keyboard.press(k);
    const lh = await page.evaluate(() => ({ ask: document.getElementById('lh-ask').textContent, lock: document.getElementById('lh-lock').disabled, overlayTab: document.getElementById('lh-overlay').tabIndex, stops: [...document.querySelectorAll('#lh-root button, #lh-root [tabindex]')].filter((b) => !b.disabled && b.offsetParent).map((b) => b.getAttribute('aria-label') || b.textContent.trim()) }));
    if (!t.check(onStage.length > 0 || !lh.lock, 'Loomis head: a keyboard visitor can place the first mark (the photo takes the focus, or a key places a mark and Lock in comes on)', { ...lh, onStage: onStage.map(label) })) {
      t.finding({
        title: 'The Loomis head cannot be used from the keyboard: no mark can be placed, so Lock in never comes on',
        severity: 'medium',
        steps: '1. Learning tools → Loomis head (any width). 2. Use only the keyboard: Tab through the tab, press Enter, Space or the arrows anywhere.',
        expected: 'Everything is operable from the keyboard (WCAG 2.1.1; placing a point is not a freehand path): the photo takes the focus and the arrows move a crosshair that Enter or Lock in places, or another key-driven way to set each feature.',
        actual: `The card asks for "${lh.ask}" with Lock in disabled (${lh.lock}); the photo (#lh-overlay, tabIndex ${lh.overlayTab}) is not focusable and the only enabled controls on the tab are ${JSON.stringify(lh.stops)}. No key places a mark, so none of the eight steps, the fitted head, Draw it in the Studio or Save can be reached.`,
        cause: 'js/loomis.js:406 places marks from pointerdown on the overlay canvas only; index.html:411 gives #lh-overlay no tabindex and no key handler exists in js/loomis.js (its only keyboard code is keepFocus, js/loomis.js:303-311). Lock in stays disabled until a pointer has marked the feature (js/loomis.js:288: disabled = !state.pending).',
      });
    }
    // the photo from the keyboard (README: "the arrow keys move a crosshair over it (two pixels a press, twenty with Shift,
    // with the loupe), and Enter or Space taps where it is"): Tab reaches it, the keys move the crosshair, Enter places the
    // mark there (the loupe goes, as on a pointer's release), and Lock in comes on and, pressed from the keyboard, takes it
    const lhNow = () => page.evaluate(() => ({ pending: Loomis.state.pending && { ...Loomis.state.pending }, step: Loomis.state.step, eye: Loomis.state.points.leftEye || null, lock: !document.getElementById('lh-lock').disabled, loupe: !document.getElementById('lh-loupe').hidden, focus: document.activeElement && document.activeElement.id, fv: document.getElementById('lh-overlay').matches(':focus-visible') }));
    const near = (p, x, y) => !!p && Math.abs(p.x - x) < 1e-4 && Math.abs(p.y - y) < 1e-4;
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    // (a key is pressed only where it was meant to land: on whatever else had the focus it could leave the tab)
    const reached = await pressTo(page, '#lh-overlay', { max: 40 });
    const wrapPx = await page.evaluate(() => { const w = document.getElementById('lh-wrap'); return { w: w.clientWidth, h: w.clientHeight }; });
    if (reached) {
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Shift+ArrowDown');
    }
    const aimed = await lhNow();
    if (reached) await page.keyboard.press('Enter');
    const marked = await lhNow();
    const at = { x: 0.5 + 6 / wrapPx.w, y: 0.5 + 20 / wrapPx.h };
    t.check(reached && aimed.fv && aimed.loupe && !aimed.pending && near(marked.pending, at.x, at.y) && marked.step === 0 && marked.lock && !marked.loupe,
      'Loomis head: Tab reaches the photo (:focus-visible), the arrow keys move its crosshair from the middle with the loupe, and Enter places the mark there: Lock in comes on and the loupe goes', { reached, aimed, marked, expected: at });
    const toLock = marked.lock && (await pressTo(page, '#lh-lock', { key: 'Shift+Tab', max: 8 }));
    if (toLock) await page.keyboard.press('Enter');
    const locked = await lhNow();
    t.check(toLock && locked.step === 1 && near(locked.eye, at.x, at.y) && !locked.pending, 'Loomis head: Lock in, reached by Shift+Tab and pressed with Enter, takes the mark placed from the keyboard (the left eye) and asks for the next', { toLock, locked });
    // Enter acts where the crosshair is drawn: back on the photo it starts in the middle (nothing pending), a tap takes it
    // to the tap (so Enter leaves the tapped mark where it is), and Start over puts it back in the middle (Start over is
    // clicked by script here, so the photo keeps the focus through it, as it does when a new photo resets the head)
    const backOn = locked.step === 1 && (await pressTo(page, '#lh-overlay', { max: 8 }));
    const aims = { backOn };
    if (backOn) {
      await page.keyboard.press('Enter');
      aims.fresh = await lhNow();
      const box = await page.evaluate(() => { const r = document.getElementById('lh-overlay').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      await page.mouse.click(box.x + 0.3 * box.w, box.y + 0.3 * box.h);
      aims.tapped = await lhNow();
      aims.tapKept = aims.tapped.focus === 'lh-overlay';
      if (aims.tapKept || (await pressTo(page, '#lh-overlay', { max: 40 }))) await page.keyboard.press('Enter');
      aims.afterTap = await lhNow();
      for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowLeft');
      await click(page, '#lh-reset');
      if ((await lhNow()).focus === 'lh-overlay') await page.keyboard.press('Enter');
      aims.afterReset = await lhNow();
    }
    const { fresh, tapped, afterTap, afterReset } = aims, tap = tapped && tapped.pending;
    t.check(backOn && near(fresh.pending, 0.5, 0.5) && !!tap && Math.abs(tap.x - 0.3) < 0.02 && Math.abs(tap.y - 0.3) < 0.02
      && near(afterTap.pending, tap.x, tap.y) && afterReset.focus === 'lh-overlay' && afterReset.step === 0 && near(afterReset.pending, 0.5, 0.5),
      'Loomis head: Enter acts where the crosshair is: in the middle when the photo takes the focus with nothing pending, on the tapped point after a tap, and in the middle again after Start over', aims);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await keyOn(page, '#lh-exit', 'Enter');
    await waitFor(page, () => !document.getElementById('tab-study').hidden, null, 5000);
    const loomisBack = await focusAfter(page);
    if (!t.check(!studioBack.body && !loomisBack.body, 'Phone: the strip\'s ← (Leave the studio, Leave the Loomis head) puts the focus on the page it opens, not on nothing', { studio: label(studioBack), loomis: label(loomisBack) })) {
      t.finding({
        title: 'On a phone, the Studio\'s and the Loomis head\'s ← button drops the focus on the page',
        severity: 'low',
        steps: '1. Open the site at 390 × 844. 2. Open the Studio (or the Loomis head); the header and tabs step aside. 3. Tab to the strip\'s first icon (Leave the studio / Leave the Loomis head) and press Enter.',
        expected: 'Focus goes to the section opened, as a menu item and the guide\'s Go to buttons do ("the focus goes to the section opened (as a menu item\'s does)", js/app.js:2699-2700).',
        actual: `Study opens, and document.activeElement is ${label(studioBack)} after the Studio's ← and ${label(loomisBack)} after the Loomis head's: the button pressed was hidden with its page, so a screen reader says nothing and the next Tab starts at the top of the page.`,
        cause: 'js/painting.js:554 and js/loomis.js:331 call Studio.go(\'study\'), which is switchTab(name) with no focus argument (js/app.js:2776); switchTab moves the focus only when asked (js/app.js:2221).',
      });
    }
    await clean(t, page, 'phone');
  });

  // =================================================================================================================
  // Paint by numbers, from the keyboard
  // =================================================================================================================
  await segment(t, 'Paint by numbers (keyboard)', async (pages) => {
    const page = await openPage(site); pages.push(page);
    const cdp = await axSession(page);
    await tab(page, 'game');
    await waitFor(page, () => !document.getElementById('gameStart').disabled, null, 60000);
    checkWalk(t, 'Paint by numbers setup, desktop', await walk(page, { cdp }), { names: true });
    await keyOn(page, '#gameStart', 'Enter');
    await waitFor(page, () => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, 30000);
    t.check(await focusIs(page, '#gameLock'), 'Paint by numbers: Start painting puts the focus in the game (on Lock in portrait), not on the page', label(await focusNow(page)));
    checkWalk(t, 'Paint by numbers playing, desktop', await walk(page, { cdp }), { names: true });
    await liveMark(page);
    await keyOn(page, '#gamePaints .game-paint', 'Enter');
    const mix = await announced(page, null);
    const parts = await page.evaluate(() => document.getElementById('gameMixParts').textContent.replace(/\s+/g, ' ').trim());
    t.check(/[A-Za-z]+ \d/.test(parts) && mix.includes(parts), 'Paint by numbers: Enter on a paint adds it, and the mix is said (a live region)', { parts, said: mix });
    await keyOn(page, '#gameRefToggle', 'Enter');
    const refOff = { expanded: await attr(page, '#gameRefToggle', 'aria-expanded'), shown: await shown(page, '#gameRefFig .matte') };
    await page.keyboard.press('Enter');
    const refOn = { expanded: await attr(page, '#gameRefToggle', 'aria-expanded'), shown: await shown(page, '#gameRefFig .matte') };
    t.check(refOff.expanded === 'false' && !refOff.shown && refOn.expanded === 'true' && refOn.shown, 'Paint by numbers: Reference hides and shows the reference and says so (aria-expanded)', { refOff, refOn });
    await keyOn(page, '#gameSound', 'Enter');
    const soundOff = await attr(page, '#gameSound', 'aria-pressed');
    await page.keyboard.press('Enter');
    t.check(soundOff === 'false' && (await attr(page, '#gameSound', 'aria-pressed')) === 'true', 'Paint by numbers: the sound button says whether the sound is on (aria-pressed)', soundOff);
    await keyOn(page, '#gameCopy', 'Enter');
    const copying = { pressed: await attr(page, '#gameCopy', 'aria-pressed'), bar: await shown(page, '#gameCopyBar') };
    await page.keyboard.press('Escape');
    const stopped = { pressed: await attr(page, '#gameCopy', 'aria-pressed'), bar: await shown(page, '#gameCopyBar'), focus: label(await focusNow(page)) };
    t.check(copying.pressed === 'true' && copying.bar && stopped.pressed === 'false' && !stopped.bar && !/the page itself/.test(stopped.focus), 'Paint by numbers: Copy mix is pressed while copying, and Escape stops it with the focus kept', { copying, stopped });
    // lock in: the score card
    await liveMark(page);
    await keyOn(page, '#gameLock', 'Enter');
    await waitFor(page, () => { const m = /(\d+)% color match/.exec(document.getElementById('gameStars').getAttribute('aria-label') || ''); return !document.getElementById('gameResult').hidden && m && document.getElementById('gamePct').textContent === m[1]; }, null, 30000);
    const stars = await attr(page, '#gameStars', 'aria-label');
    const said = await announced(page, cdp);
    t.check(await focusIs(page, '#gameAnalyze'), 'Paint by numbers: the score card takes the focus (on Analyze)', label(await focusNow(page)));
    const gameScoreSaid = said.includes(stars);
    t.check(gameScoreSaid, 'Paint by numbers: the score (its stars and color match) is said when the card comes up', { stars, said });
    await keyOn(page, '#gameAnalyze', 'Enter');
    t.check((await attr(page, '#gameAnalyze', 'aria-expanded')) === 'true' && (await shown(page, '#gameAnalysis')), 'Paint by numbers: Analyze opens the details and says so (aria-expanded)', await attr(page, '#gameAnalyze', 'aria-expanded'));
    await keyOn(page, '#gamePopupClose', 'Enter');
    t.check(!(await shown(page, '#gamePopup')) && (await focusIs(page, '#gameShowScore')), 'Paint by numbers: × hides the score card and the focus goes to Show score', label(await focusNow(page)));
    await keyOn(page, '#gameCompare', 'Enter');
    await waitFor(page, () => document.getElementById('gameCompare').getAttribute('aria-pressed') === 'true', null, 3000);
    // (the reveal sweeps in from the right and ends exactly in the middle: the handle is the visitor's after that)
    await waitFor(page, () => document.getElementById('gameFinalWrap').style.getPropertyValue('--cut') === '50%', null, 5000);
    await keyOn(page, '#gameFinalHandle', 'ArrowLeft');
    const now0 = +(await attr(page, '#gameFinalHandle', 'aria-valuenow'));
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    const now1 = +(await attr(page, '#gameFinalHandle', 'aria-valuenow'));
    const handle = await focusNow(page);
    await page.keyboard.press('Home'); const home = await attr(page, '#gameFinalHandle', 'aria-valuenow');
    await page.keyboard.press('End'); const end = await attr(page, '#gameFinalHandle', 'aria-valuenow');
    t.check(now1 < now0 && home === '0' && end === '100' && handle.fv && handle.ring, 'Paint by numbers: Compare with target\'s divider moves with the arrow keys, Home and End (aria-valuenow follows) and shows its focus', { now0, now1, home, end, ring: handle.ring });
    await keyOn(page, '#gameShowScore', 'Enter');
    t.check(await focusIs(page, '#gameAnalyze'), 'Paint by numbers: Show score brings the card back with the focus on it', label(await focusNow(page)));
    await keyOn(page, '#gamePopup [data-game="again"]', 'Enter');
    await waitFor(page, () => document.getElementById('againDialog').open, null, 3000);
    const inAgain = await focusIs(page, '#againSame');
    await page.keyboard.press('Escape');
    await waitFor(page, () => !document.getElementById('againDialog').open, null, 3000);
    t.check(inAgain && (await focusIs(page, '#gamePopup [data-game="again"]')), 'Paint by numbers: Play again\'s dialog opens on Same photo, and Escape gives the focus back to Play again', label(await focusNow(page)));
    await keyOn(page, '#gamePopup [data-game="new"]', 'Enter');
    t.check(await focusIs(page, '#gameFromPhoto'), 'Paint by numbers: Change settings puts the focus on the setup\'s first choice', label(await focusNow(page)));
    // the score finding is written with the battle's, below
    t.__gameScore = gameScoreSaid ? null : { said, stars };
    await clean(t, page, 'Paint by numbers');
  });

  // =================================================================================================================
  // Value battle, from the keyboard
  // =================================================================================================================
  await segment(t, 'Value battle (keyboard)', async (pages) => {
    const page = await openPage(site); pages.push(page);
    const cdp = await axSession(page);
    await skewClock(page);
    await tab(page, 'battle');
    await click(page, '#vbCount2'); await click(page, '#vbModeStreak');
    checkWalk(t, 'Value battle setup, desktop', await walk(page, { cdp }), { names: true });
    const answerOf = () => page.evaluate(() => { const g = ValueBattle.state(); return g.rounds[g.i].answer; });
    const keyFor = (a) => (a === 'same' ? '=' : a === 'left' ? 'ArrowLeft' : 'ArrowRight');
    const wrongKey = (a) => (a === 'same' ? 'ArrowLeft' : '=');
    await keyOn(page, '#vb-start', 'Enter');
    await waitFor(page, () => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0; }, null, 5000);
    const first = await axFocused(cdp);
    t.check((await focusIs(page, '.vb-swatch[data-index="0"]')) && first && first.name === 'The left one', 'Value battle: Start puts the focus on the first color, which a screen reader calls the left one (README)', first && first.name);
    await page.keyboard.press('Tab');
    const second = await axFocused(cdp);
    t.check(second && second.name === 'The right one', 'Value battle: the second color is named the right one', second && second.name);
    checkWalk(t, 'Value battle playing, desktop', await walk(page, { cdp, max: 30 }), { names: true });
    await keyOn(page, '.vb-swatch[data-index="0"]', 'Shift');
    // a right answer, said; then Next
    await liveMark(page);
    await page.keyboard.press(keyFor(await answerOf()));
    await waitFor(page, () => ValueBattle.state().answered, null, 3000);
    const right = await announced(page, cdp);
    t.check(/^Right! /.test(await page.evaluate(() => document.getElementById('vb-answer').textContent)) && /Right! /.test(right), 'Value battle: a right answer is said (the answer line is a live region)', right);
    t.check(await focusIs(page, '#vb-next'), 'Value battle: after a right answer the focus is on Next ▸', label(await focusNow(page)));
    await liveMark(page);
    await page.keyboard.press('Enter');
    await waitFor(page, () => { const g = ValueBattle.state(); return g.i === 1 && !g.answered; }, null, 3000);
    const afterNext = await focusAfter(page);
    const nextSaid = await announced(page, cdp);
    const question = await page.evaluate(() => document.getElementById('vb-question').textContent);
    const nextOk = !afterNext.body && !afterNext.hidden;
    if (!t.check(nextOk, 'Value battle: after Next ▸ the focus is on the new round (its first color), not dropped on the page', label(afterNext))) {
      t.finding({
        title: 'Value battle drops the focus on the page at every new round (after Next ▸, and on the clock after each right answer)',
        severity: 'medium',
        steps: '1. Games → Value battle, Start the battle (the focus is on the left color). 2. Answer a round right with the arrow keys: the focus moves to Next ▸. 3. Press Enter. (On the clock, the next round comes by itself 0.65 s after a right answer.)',
        expected: 'Each new round puts the focus where Start and Play again put it: on the first color ("Start (and Play again) puts the focus on the first color", README), so the focus stays visible and a screen reader reads the round.',
        actual: `Round 2 comes up with document.activeElement = ${label(afterNext)}: no color or button shows a focus ring, the next Tab leaves the board, and nothing reads the new question ("${question}"); what a screen reader has at that moment: "${nextSaid.slice(0, 200)}". The arrow keys still answer (they work on the bare page), so the game goes on, blind.`,
        cause: 'js/battle.js:297-323 (showRound) replaces the swatches and hides Next ▸ (js/battle.js:320), the focused button, without moving the focus; only start() focuses the first color (js/battle.js:253). The question (#vb-question) is not a live region either (index.html:930).',
      });
    }
    // a miss: the pop-up with the right answer
    await keyOn(page, '.vb-swatch[data-index="0"]', 'Shift');
    const ans = await answerOf();
    await liveMark(page);
    await page.keyboard.press(wrongKey(ans));
    await waitFor(page, () => !document.getElementById('vb-miss').hidden, null, 3000);
    const why = await page.evaluate(() => document.getElementById('vb-missWhy').textContent);
    const missSaid = await announced(page, cdp);
    t.check(await focusIs(page, '#vb-missNext'), 'Value battle: a miss puts the focus on the pop-up\'s button (See the score)', label(await focusNow(page)));
    if (!t.check(why && missSaid.includes(why), 'Value battle: a miss\'s answer in words is said when the pop-up comes up', { why, said: missSaid })) {
      t.finding({
        title: 'Value battle: the right answer after a miss never reaches a screen reader',
        severity: 'medium',
        steps: '1. Games → Value battle, Start the battle. 2. Answer a round wrong (Both the same on a non-tie, or a color on a tie). 3. Listen with a screen reader (or read the accessibility tree) as the miss pop-up comes up.',
        expected: 'The miss "pops up the right answer in words" (README) for everyone: the explanation is in a live region, or is the description of the pop-up or of the button the focus lands on, as Figure study\'s card does (aria-describedby plus a live line).',
        actual: `The focus lands on "See the score" inside a group named "Not quite"; the words "${why}" are in neither, and the answer line (the board's live region) is emptied on a miss. What a screen reader has: "${missSaid.slice(0, 200)}".`,
        cause: 'index.html:939 gives #vb-miss role="group" with aria-labelledby="vb-missKicker" only; js/battle.js:403-423 (showMiss) writes #vb-missWhy, which is neither live nor referenced by aria-describedby, and js/battle.js:390 sets #vb-answer (aria-live) to \'\' when the answer is wrong.',
      });
    }
    await liveMark(page);
    await page.keyboard.press('Enter');
    await waitFor(page, () => !document.getElementById('vb-popup').hidden && ValueBattle.state().over, null, 5000);
    const streakStars = await attr(page, '#vb-stars', 'aria-label');
    const streakSaid = await announced(page, cdp);
    t.check(await focusIs(page, '#vb-again'), 'Value battle: the score pop-up takes the focus (on Play again)', label(await focusNow(page)));
    const streakScoreSaid = streakSaid.includes(streakStars);
    t.check(streakScoreSaid, 'Value battle (Streak): the score (its stars and streak) is said when the pop-up comes up', { stars: streakStars, said: streakSaid });
    await page.keyboard.press('Enter');
    await waitFor(page, () => { const g = ValueBattle.state(); return g && !g.over && g.i === 0; }, null, 5000);
    t.check(await focusIs(page, '.vb-swatch[data-index="0"]'), 'Value battle: Play again puts the focus on the first color (README)', label(await focusNow(page)));
    // ✕ twice from the keyboard
    await liveMark(page);
    await keyOn(page, '#vb-quit', 'Enter');
    const armed = await announced(page, null);
    await page.keyboard.press('Enter');
    await waitFor(page, () => !document.getElementById('vb-setup').hidden, null, 3000);
    t.check(/Tap ✕ again to quit/.test(armed) && (await focusIs(page, '#vb-palette')), 'Value battle: ✕ says to press it again (status line), and the second press goes back to the setup with the focus on the palette', { armed, focus: label(await focusNow(page)) });
    // on the clock: the score after time runs out (the clock moved on, not waited for)
    await click(page, '#vbMode1');
    await keyOn(page, '#vb-start', 'Enter');
    await waitFor(page, () => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !g.over; }, null, 5000);
    await page.keyboard.press(keyFor(await answerOf()));
    await waitFor(page, () => ValueBattle.state().right === 1, null, 3000);
    await liveMark(page);
    await page.evaluate(() => window.__skew(61000));
    await waitFor(page, () => !document.getElementById('vb-popup').hidden && ValueBattle.state().over, null, 5000);
    const timedStars = await attr(page, '#vb-stars', 'aria-label');
    const timedSaid = await announced(page, cdp);
    const rightN = await page.evaluate(() => ValueBattle.state().right);
    const timedScoreSaid = timedSaid.includes(timedStars);
    t.check(timedScoreSaid, 'Value battle (1 min): the score (right answers and stars) is said when time is up', { stars: timedStars, said: timedSaid });
    // three colors are lettered, and named by their letters
    await keyOn(page, '#vb-settings', 'Enter');
    await click(page, '#vbCount3'); await click(page, '#vbModeStreak');
    await keyOn(page, '#vb-start', 'Enter');
    await waitFor(page, () => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !g.over; }, null, 5000);
    const names3 = [];
    for (let i = 0; i < 3; i++) { names3.push((await axFocused(cdp) || {}).name); await page.keyboard.press('Tab'); }
    const letters = await page.evaluate(() => [...document.querySelectorAll('#vb-swatches .vb-letter')].map((e) => e.textContent));
    t.check(names3.join() === 'Color A,Color B,Color C' && letters.join() === 'A,B,C', 'Value battle: three colors are lettered A, B, C and named Color A, B, C', { names3, letters });
    // the finding for both games' score cards
    const gameScore = t.__gameScore;
    if (gameScore || !streakScoreSaid || !timedScoreSaid) {
      t.finding({
        title: 'The games\' score pop-ups never say the score to a screen reader: only the pop-up\'s title and a button are read',
        severity: 'medium',
        steps: '1. Paint by numbers: Start painting, Lock in portrait. 2. Value battle: play Streak until a miss and press See the score; or play 1 min until time is up. 3. Listen with a screen reader (or read the accessibility tree) as each score pop-up comes up.',
        expected: 'The result is announced, as Figure study\'s card does for its own score (a live line saying "Pose 1 done Kneel: 2 out of 5 stars, 47% gesture match. Getting there." plus aria-describedby on the card): the stars, the match or the number right, and New best!.',
        actual: `The focus moves to a button inside a role="group" named only by the pop-up's title, and the score is in neither: ${gameScore ? `Paint by numbers reads "${gameScore.said.slice(0, 120)}" while the card shows "${gameScore.stars}"; ` : ''}Value battle (Streak) reads "${streakSaid.slice(0, 120)}" while it shows "${streakStars}"; on the clock it reads "${timedSaid.slice(0, 120)}" while it shows "${timedStars}" (${rightN} right) — the number right is never said.`,
        cause: 'index.html:830 (#gamePopup) and index.html:947 (#vb-popup) are role="group" with aria-labelledby on the kicker alone, and the score (#gamePct / #vb-pct, the stars\' role="img" label written at js/game.js:1391 and js/battle.js:476) is neither live nor referenced by aria-describedby; js/game.js:1417 and js/battle.js:490 just move the focus to Analyze / Play again. Compare js/figure.js:934 (the live #fig-say) and index.html:676 (aria-describedby="fig-stars fig-grade").',
      });
    }
    await clean(t, page, 'Value battle');
  });

  // =================================================================================================================
  // Figure study, from the keyboard
  // =================================================================================================================
  await segment(t, 'Figure study (keyboard)', async (pages) => {
    const page = await openPage(site); pages.push(page);
    const cdp = await axSession(page);
    await tab(page, 'figure', { timeout: 120000 });
    await keyOn(page, '#tabFigureBtn', 'Escape');
    checkWalk(t, 'Figure study setup, desktop', await walk(page, { cdp, max: 80 }), { names: true });
    // a pose's tick is its pressed state
    const before = await attr(page, '#tab-figure .fig-pose', 'aria-pressed');
    await keyOn(page, '#tab-figure .fig-pose', 'Enter');
    const outNow = await attr(page, '#tab-figure .fig-pose', 'aria-pressed');
    await page.keyboard.press('Enter');
    t.check(before === 'true' && outNow === 'false' && (await attr(page, '#tab-figure .fig-pose', 'aria-pressed')) === 'true', 'Figure study: a pose in the class is pressed, and Enter takes it out and puts it back', { before, outNow });
    // Timed, chosen with the arrow keys
    await keyOn(page, '#fig-relaxed', 'ArrowRight');
    t.check(await page.evaluate(() => document.getElementById('fig-timed').checked && !document.getElementById('fig-times').hidden), 'Figure study: the arrow keys choose Timed, and its times show');
    await keyOn(page, '#fig-start', 'Enter');
    await waitFor(page, () => { const s = window.FigureStudy && FigureStudy.state(); return s && s.shot; }, null, 60000);
    t.check(await focusIs(page, '#fig-done'), 'Figure study: Start drawing puts the focus on Done', label(await focusNow(page)));
    const clock = await page.evaluate(() => ({ role: document.getElementById('fig-clock').getAttribute('role'), label: document.getElementById('fig-clock').getAttribute('aria-label') }));
    t.check(clock.role === 'timer' && clock.label === 'Time left', 'Figure study: a timed pose\'s clock is a timer called Time left', clock);
    await keyOn(page, '#fig-pause', 'Enter');
    const paused = { name: (await axFocused(cdp) || {}).name, text: await page.evaluate(() => document.querySelector('#fig-pause .fig-btn-text').textContent) };
    await page.keyboard.press('Enter');
    const resumed = { name: (await axFocused(cdp) || {}).name, text: await page.evaluate(() => document.querySelector('#fig-pause .fig-btn-text').textContent) };
    t.check(/^Resume/.test(paused.name) && paused.text === 'Resume' && /^Pause/.test(resumed.name) && resumed.text === 'Pause', 'Figure study: Pause turns to Resume and back, in its name as on the button', { paused, resumed });
    checkWalk(t, 'Figure study drawing, desktop', await walk(page, { cdp, max: 45 }), { names: true });
    // the studio copy's sheet, closed with Escape
    await keyOn(page, '#fs-colorBtn', 'Enter');
    const fsOpen = await shown(page, '#fs-paintSheet');
    await page.evaluate(() => { const b = document.querySelector('#fs-paintSheet button:not([disabled])'); if (b) b.focus(); });
    await page.keyboard.press('Escape');
    const fsBack = { open: fsOpen, closed: !(await shown(page, '#fs-paintSheet')), focus: label(await focusAfter(page)), onIcon: await focusIs(page, '#fs-colorBtn') };
    if (!t.check(fsBack.open && fsBack.closed && fsBack.onIcon, 'Figure study: Escape in the drawing\'s Paints sheet closes it with the focus back on its icon', fsBack) && !seen.has('sheets')) {
      t.finding({
        title: 'Figure study: closing a sheet of the drawing\'s studio with Escape drops the focus on the page',
        severity: 'medium',
        steps: '1. Figure study: Start drawing. 2. Tab to Paints and mixing on the strip, press Enter, move into the sheet, press Escape.',
        expected: 'The focus goes back to the icon that opened the sheet.',
        actual: `The sheet closes and the focus is on ${fsBack.focus}.`,
        cause: 'js/painting.js:538 (closeSheets), shared by Figure study\'s copy of the Studio, hides the sheet without moving the focus.',
      });
    }
    // draw, Done, the card
    await stroke(page, '#tab-figure canvas[aria-label="Drawing paper"]', [[0.5, 0.15], [0.5, 0.45], [0.42, 0.8]]);
    await liveMark(page);
    await pressUntil(page, '#fig-done', () => !document.getElementById('fig-result').hidden);
    await waitFor(page, () => !document.getElementById('fig-result').hidden && /out of 5 stars|nothing drawn/.test(document.getElementById('fig-say').textContent), null, 30000);
    const cardSaid = await announced(page, cdp);
    const cardStars = await attr(page, '#fig-stars', 'aria-label');
    t.check(await focusIs(page, '#fig-nextPose'), 'Figure study: the card after a pose takes the focus (on Next pose)', label(await focusNow(page)));
    t.check(cardSaid.includes(cardStars), 'Figure study: the card\'s stars and gesture match are said (live line and the card\'s description)', { stars: cardStars, said: cardSaid.slice(0, 300) });
    const poseImg = await page.evaluate(() => document.getElementById('fig-pose').alt);
    t.check(/^The pose: /.test(poseImg), 'Figure study: the card\'s picture of the pose is named', poseImg);
    const behind = await page.evaluate(() => [...document.querySelectorAll('#tab-figure .ps-strip button')].every((b) => b.closest('[inert]')));
    t.check(behind, 'Figure study: the studio behind the card is inert (its strip takes no focus)');
    await pressUntil(page, '#fig-stop', () => !document.getElementById('fig-review').hidden); // (the card's buttons wait 0.6 s, README)
    t.check(await focusIs(page, '#fig-reviewTitle'), 'Figure study: Stop class shows the drawings with the focus on their heading', label(await focusNow(page)));
    await keyOn(page, '[data-fig-gesture="0"]', 'Enter');
    const pill = { hidden: await attr(page, '[data-fig-gesture="0"]', 'aria-pressed'), shownBtn: await attr(page, '[data-fig-gesture="1"]', 'aria-pressed'), canvas: await attr(page, '#fig-cards canvas', 'aria-label') };
    t.check(pill.hidden === 'true' && pill.shownBtn === 'false' && !/gesture over it/.test(pill.canvas || ''), 'Figure study: Hidden is pressed and each drawing\'s name drops the gesture', pill);
    await keyOn(page, '#fig-new', 'Enter');
    await waitFor(page, () => !document.getElementById('fig-setup').hidden, null, 5000);
    const afterNew = await focusAfter(page);
    if (!t.check(!afterNew.body && !afterNew.hidden, 'Figure study: New class shows the setup with the focus on it, not dropped on the page', label(afterNew))) {
      t.finding({
        title: 'Figure study: New class drops the focus on the page',
        severity: 'low',
        steps: '1. Figure study: Start drawing, draw something, Done, then Stop class (the drawings show, with the focus on their heading). 2. Tab to New class and press Enter.',
        expected: 'The setup opens with the focus in it (its first choice, Relaxed), as Paint by numbers\' Change settings does (js/game.js:1653 and 1657, "focus goes to its first choice") and as Value battle\'s does (js/battle.js:497).',
        actual: `The setup shows and document.activeElement is ${label(afterNew)}: the New class button was hidden with the drawings, so a screen reader says nothing and the next Tab starts at the top of the page.`,
        cause: 'js/figure.js:1026: the New class handler calls show(\'setup\'), showSetup() and scrollTo(0, 0) and moves the focus nowhere.',
      });
    }
    await clean(t, page, 'Figure study');
  });

  // =================================================================================================================
  // Pose and light: in the app's frame, and pose.html on its own
  // =================================================================================================================
  await segment(t, 'Pose and light (keyboard)', async (pages) => {
    const page = await openPage(site); pages.push(page);
    const cdp = await axSession(page);
    // opened from the menu by the keyboard
    await keyOn(page, '#tabLearnBtn', 'Enter');
    await waitFor(page, () => !document.getElementById('tabLearnMenu').hidden);
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await tab(page, 'pose', { timeout: 120000 });
    const f = poseFrame(page);
    if (!f) throw new Error('the Pose frame did not appear');
    const inLibrary = () => f.evaluate(() => { const a = document.activeElement; return !!a && a.classList.contains('pose-btn') && !!a.closest('#library'); }).catch(() => false);
    let into = await focusNow(page), tabs = 0;
    while (!(into.inFrame && (await inLibrary())) && tabs < 6) { await page.keyboard.press('Tab'); tabs++; into = await focusNow(page); }
    t.check(into.inFrame && (await inLibrary()), 'Pose and light: the focus reaches the library\'s poses in the frame (the rest waits behind it) by the next Tab stops after the sections', { focus: label(into), tabs });
    // the frame is one part of the app's page: Shift+Tab from the start sheet's first pose goes back to the app around it
    // (pose.html on its own keeps the Tab inside the sheet, below), and Tab comes back to the poses
    await page.keyboard.press('Shift+Tab');
    const outOfFrame = await focusNow(page);
    await page.keyboard.press('Tab');
    const backIn = (await focusNow(page)).inFrame && (await inLibrary());
    t.check(!outOfFrame.body && !outOfFrame.inFrame && backIn, 'Pose and light in the app: Shift+Tab from the start sheet\'s first pose goes to the app around the frame, and Tab comes back to the poses', { out: label(outOfFrame), backIn });
    await page.keyboard.press('Enter');
    await waitFor(f, () => document.getElementById('library').hidden, null, 5000);
    const pickedP = { libHidden: await f.evaluate(() => document.getElementById('library').hidden), focus: await focusIs(page, '#posesBtn', f), expanded: await attr(page, '#posesBtn', 'aria-expanded', f) };
    t.check(pickedP.libHidden && pickedP.focus && pickedP.expanded === 'false', 'Pose and light: Enter on a pose closes the library with the focus on Poses (aria-expanded false)', pickedP);
    const fw = await walk(page, { cdp, max: 50 });
    checkWalk(t, 'Pose and light in the app, desktop', fw, { names: true });
    await keyOn(page, '#posesBtn', 'Enter', f);
    await waitFor(f, () => !document.getElementById('library').hidden, null, 3000);
    const libOpen = { expanded: await attr(page, '#posesBtn', 'aria-expanded', f), focusPressed: await f.evaluate(() => { const a = document.activeElement; return !!a && a.getAttribute('aria-pressed') === 'true' && !!a.closest('#library'); }) };
    await page.keyboard.press('Escape');
    await waitFor(f, () => document.getElementById('library').hidden, null, 3000);
    const libClosed = { hidden: await f.evaluate(() => document.getElementById('library').hidden), expanded: await attr(page, '#posesBtn', 'aria-expanded', f), focus: await focusIs(page, '#posesBtn', f) };
    t.check(libOpen.expanded === 'true' && libOpen.focusPressed && libClosed.hidden && libClosed.expanded === 'false' && libClosed.focus, 'Pose and light: Poses opens the library on the pose now on the figure, and Escape closes it back onto Poses', { libOpen, libClosed });
    // the lamp
    const light0 = await f.evaluate(() => document.getElementById('lightName').textContent);
    await keyOn(page, '#lampHandle', 'ArrowLeft', f);
    await page.keyboard.press('ArrowLeft');
    const light1 = await f.evaluate(() => document.getElementById('lightName').textContent);
    t.check(light0 !== light1, 'Pose and light: the arrow keys move the lamp', { light0, light1 });
    // a part of the figure: Advanced, then look for any way to pick one from the keyboard
    await keyOn(page, '[data-mode="advanced"]', 'Enter');
    await waitFor(f, () => window.PoseAndLight && PoseAndLight.mode() === 'advanced', null, 10000);
    await keyOn(page, '#lampHandle', 'Shift', f);
    const aw = await walk(page, { cdp, max: 60 });
    const names = aw.stops.filter((x) => !x.body && x.inFrame).map((x) => x.name || x.text);
    const arrows = await f.evaluate(() => document.querySelectorAll('#arrows button').length);
    const pickable = await f.evaluate(() => ({ canvasTab: document.getElementById('view').tabIndex, rigHidden: document.getElementById('rig').getAttribute('aria-hidden') }));
    const partStops = names.filter((n) => /hand|foot|elbow|knee|hip|chest|head|arm|leg|body|part/i.test(n || '') && !/feet on the floor/i.test(n));
    if (!t.check(partStops.length > 0 || arrows > 0, 'Pose and light (Advanced): a part of the figure can be picked from the keyboard, so its arrows can move it', { arrows, ...pickable, stops: names })) {
      t.finding({
        title: 'Pose and light: no part of the figure can be picked or moved from the keyboard, so posing is pointer-only',
        severity: 'medium',
        steps: '1. Open Pose and light (in the app or pose.html), choose a pose, switch to Advanced. 2. Using only the keyboard, Tab through the page and try to pick a hand, an elbow, the hips or any part.',
        expected: '"Any part can also be tapped to pick it and moved with arrows, joint by joint" (README) has a keyboard way in: the parts (or the rig\'s controls) are focusable, or a list picks one, and its arrows (already buttons, with Enter and Space handled at js/pose.js:902) then move it (WCAG 2.1.1).',
        actual: `The Tab stops are only ${JSON.stringify(names.slice(0, 24))}: the lamp, the pose library and the side cards. The figure canvas has tabIndex ${pickable.canvasTab}, the rig is aria-hidden="${pickable.rigHidden}", and no arrows appear (#arrows has ${arrows} buttons), so a keyboard visitor can only take a whole pose from the library and move the lamp.`,
        cause: 'js/pose.js:822 (pick) is reached only from the canvas\'s pointer handlers (js/pose.js:2109, 2178-2181); pose.html:28 gives the canvas no tabindex, pose.html:31 hides the rig controls from assistive tech, and js/pose.js:907 (buildArrows) builds the arrow buttons only for a picked part.',
      });
    }
    // the Pick a part list (README: "chosen by name under Pick a part in the Pose card (the keyboard's way to pick one)"):
    // ArrowDown on the closed list picks the first part, its arrows show, Shift+Tab reaches one, and Enter and Space on it
    // move the figure (window.PoseAndLight.pose)
    if (await f.evaluate(() => !!document.getElementById('partPick'))) await keyOn(page, '#partPick', 'ArrowDown', f);
    const listed = await f.evaluate(() => ({ list: !!document.getElementById('partPick'), picked: PoseAndLight.picked(), value: document.getElementById('partPick') && document.getElementById('partPick').value, name: document.getElementById('partName').textContent, arrows: PoseAndLight.arrows().filter((a) => !a.hidden).length }));
    const toArrow = listed.arrows > 0 && (await pressTo(page, '#arrows button', { key: 'Shift+Tab', max: 12, frame: f }));
    const moves = { toArrow };
    if (toArrow) {
      moves.arrow = await f.evaluate(() => document.activeElement.getAttribute('aria-label'));
      for (const key of ['Enter', 'Space']) {
        const before = await f.evaluate(() => JSON.stringify(PoseAndLight.pose));
        await page.keyboard.press(key);
        moves[key] = await f.evaluate((b) => JSON.stringify(PoseAndLight.pose) !== b, before);
      }
    }
    t.check(listed.list && !!listed.picked && listed.picked === listed.value && listed.name !== 'Nothing picked' && listed.arrows > 0 && toArrow && moves.Enter && moves.Space,
      'Pose and light (Advanced): a part chosen in the Pick a part list from the keyboard is picked and shows its arrows; Shift+Tab reaches an arrow, and Enter and Space on it move the figure', { ...listed, ...moves });
    await keyOn(page, '[data-mode="simple"]', 'Enter');
    await clean(t, page, 'Pose and light in the app');

    // pose.html on its own: the start sheet is modal; Snapshot is a dialog
    const sp = await openPage(site, { url: 'pose.html' }); pages.push(sp);
    const scdp = await axSession(sp);
    await waitFor(sp, () => window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30, null, 120000);
    const startFocus = await sp.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('#library') && a.classList.contains('pose-btn'); });
    t.check(startFocus, 'pose.html: the page opens on the pose library with the focus on its first pose', label(await focusNow(sp)));
    const back1 = await walk(sp, { max: 3, shift: true });
    const outside = back1.stops.filter((x) => !x.body).filter((x) => !/pose-btn|sheet-x/.test(x.cls));
    const modal = await sp.evaluate(() => ({ modal: document.getElementById('library').getAttribute('aria-modal'), headerInert: !!document.querySelector('.top').closest('[inert]') }));
    if (!t.check(outside.length === 0, 'pose.html: the start sheet is modal (aria-modal): Shift+Tab from its first pose stays in it, nothing behind it takes the focus', { ...modal, reached: outside.map(label) })) {
      t.finding({
        title: 'pose.html: the focus leaves the modal pose library for the header behind it',
        severity: 'low',
        steps: '1. Open pose.html on its own (a fresh visit opens on "Choose a pose to start", with the focus on the first pose). 2. Press Shift+Tab.',
        expected: 'The sheet is a modal dialog (role="dialog" aria-modal="true", and "the rest of the page waiting until a pose is picked", README): the focus stays inside it, as it does for everything else behind it, which is inert.',
        actual: `Shift+Tab goes to ${outside.map(label).join(' then ')}, the Simple / Advanced switch in the page header, which a screen reader in the modal is told does not exist; the header is not inert (${modal.headerInert}).`,
        cause: 'js/pose.js:1492 (behindSheet) makes the canvas, hint, picked note, rig, arrows, lamp, stage bar and rail inert while the sheet is open, but not the page header (.top) that pose.html shows on its own (pose.css:157 hides it only when embedded).',
      });
    }
    // ... and the Tab goes round inside it, never off the page: Shift+Tab from its first pose is on its last, and Tab from
    // there is back on the first
    const ends = () => { const b = [...document.querySelectorAll('#library .pose-btn')].filter((x) => x.getClientRects().length); const a = document.activeElement; return { first: a === b[0], last: a === b[b.length - 1], inSheet: !!a && !!a.closest('#library'), on: a ? a.getAttribute('aria-label') || a.tagName : null, poses: b.length }; };
    await sp.evaluate(() => document.querySelector('#poses .pose-btn').focus());
    await sp.keyboard.press('Shift+Tab');
    const wrapBack = await sp.evaluate(ends);
    await sp.keyboard.press('Tab');
    const wrapOn = await sp.evaluate(ends);
    t.check(wrapBack.last && wrapOn.first, 'pose.html: the Tab goes round inside the start sheet: Shift+Tab from its first pose is on its last, and Tab from there is back on its first (never off the page)', { wrapBack, wrapOn });
    await sp.evaluate(() => document.querySelector('#poses .pose-btn').focus());
    await sp.keyboard.press('Enter');
    await waitFor(sp, () => document.getElementById('library').hidden, null, 5000);
    checkWalk(t, 'pose.html, desktop', await walk(sp, { cdp: scdp }), { names: true });
    await keyOn(sp, '#snap', 'Enter');
    await waitFor(sp, () => document.getElementById('snapDialog').open, null, 5000);
    const inSnap = await sp.evaluate(() => document.getElementById('snapDialog').contains(document.activeElement));
    await sp.keyboard.press('Escape');
    await waitFor(sp, () => !document.getElementById('snapDialog').open, null, 3000);
    t.check(inSnap && (await focusIs(sp, '#snap')), 'pose.html: Snapshot opens a dialog with the focus in it, and Escape gives the focus back to Snapshot', label(await focusNow(sp)));
    const snapName = await sp.evaluate(() => document.getElementById('snapImg').alt);
    t.check(/snapshot/i.test(snapName), 'pose.html: the snapshot picture is named', snapName);
    await clean(t, sp, 'pose.html');
  });

  // =================================================================================================================
  // The save dialog, which shows only inside another site's frame
  // =================================================================================================================
  await segment(t, 'save dialog in a frame', async (pages) => {
    const page = await openPage(site, { sandbox: { attrs: 'allow-scripts allow-modals' } }); pages.push(page);
    const fr = app(page);
    await keyOn(page, '[data-save="orig"]', 'Enter');
    await waitFor(fr, () => document.getElementById('saveDialog').open, null, 10000);
    const inside = await fr.evaluate(() => document.getElementById('saveDialog').contains(document.activeElement));
    const img = await fr.evaluate(() => { const i = document.getElementById('saveImg'); return { alt: i.alt, name: document.getElementById('saveName').textContent }; });
    await page.keyboard.press('Escape');
    await waitFor(fr, () => !document.getElementById('saveDialog').open, null, 3000);
    t.check(inside && (await focusIs(page, '[data-save="orig"]')), 'Save PNG in a frame: the dialog opens with the focus in it, and Escape gives the focus back to Save PNG', label(await fr.evaluate(probe)));
    t.note(`save dialog: the picture to save has alt "${img.alt}" and the line under it reads "${img.name}"`);
    await clean(t, page, 'save dialog');
  });

  // =================================================================================================================
  // Reduced motion: nothing moves
  // =================================================================================================================
  await segment(t, 'reduced motion', async (pages) => {
    const page = await openPage(site, { reducedMotion: true }); pages.push(page);
    // each action and its animations are read in one go: getAnimations() flushes the styles, so a 0.15 s transition
    // started by the action is seen however busy the machine
    const act = (fn) => page.evaluate(`(() => { (${fn})(); return (${MOVING})(); })()`);
    const moved = {};
    moved.menu = await act(() => document.getElementById('tabLearnBtn').click());
    await page.keyboard.press('Escape');
    moved.drawer = await act(() => document.querySelector('#drawer-values summary').click());
    await tab(page, 'battle');
    await click(page, '#vbCount2'); await click(page, '#vbModeStreak');
    // a game: a wrong color tapped (the swatch's own pulse is turned off), the miss, the score, Play again, ✕'s toast
    moved.start = await act(() => document.getElementById('vb-start').click());
    const ans = await page.evaluate(() => { const g = ValueBattle.state(); return g.rounds[g.i].answer; });
    moved.answer = await act(`() => document.querySelector('.vb-swatch[data-index="${ans === 'left' ? 1 : 0}"]').click()`);
    await waitFor(page, () => !document.getElementById('vb-miss').hidden, null, 3000);
    moved.miss = await page.evaluate(MOVING);
    moved.score = await act(() => document.getElementById('vb-missNext').click());
    moved.again = await act(() => document.getElementById('vb-again').click());
    moved.toast = await act(() => document.getElementById('vb-quit').click());
    const app0 = Object.entries(moved).filter(([, list]) => list.length);
    t.check(app0.length === 0, 'Reduced motion (the app): opening a menu and a drawer, a color tapped, the battle\'s miss and score pop-ups, Play again and a toast move nothing', app0);
    // Both the same, pressed once: nothing moves when the next round shows it again
    await act(() => document.getElementById('vb-quit').click());
    await waitFor(page, () => !document.getElementById('vb-setup').hidden, null, 3000);
    await click(page, '#vb-start');
    await waitFor(page, () => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !g.over; }, null, 5000);
    const same = await page.evaluate(() => { const g = ValueBattle.state(); return g.rounds[g.i].answer === 'same'; });
    const pressed = await act(() => document.querySelector('.vb-choice').click());
    await waitFor(page, () => ValueBattle.state().answered, null, 3000);
    let next;
    if (same) next = await act(() => document.getElementById('vb-next').click());
    else {
      await waitFor(page, () => !document.getElementById('vb-miss').hidden, null, 3000);
      await page.evaluate(() => document.getElementById('vb-missNext').click());
      await waitFor(page, () => !document.getElementById('vb-popup').hidden, null, 3000);
      next = await act(() => document.getElementById('vb-again').click());
    }
    const nextRound = await page.evaluate(() => { const g = ValueBattle.state(); return { i: g.i, n: g.rounds[g.i].n, choiceShown: getComputedStyle(document.querySelector('.vb-choice')).display !== 'none', cls: document.querySelector('.vb-choice').className }; });
    const pulsing = next.filter((m) => /vb-choice/.test(m.what));
    if (!t.check(pulsing.length === 0, 'Reduced motion (Value battle): once Both the same has been pressed, the next round shows it without a pulse', { pressedWasRight: same, onPress: pressed, next, nextRound })) {
      t.finding({
        title: 'Value battle: once pressed, Both the same pulses again at the start of every round, and reduced motion does not stop it',
        severity: 'low',
        steps: '1. Turn on "Reduce motion" in the system settings (the pulse also replays without it). 2. Games → Value battle, two colors, Start. 3. Press Both the same once (right on a tie, or wrong: then See the score and Play again). 4. Watch the button as each later two-color round comes up.',
        expected: 'Nothing moves with reduced motion (the stylesheet already means it: styles.css:1699 sets .vb-choice.is-pulse { animation: none } under prefers-reduced-motion), and without it a press pulses once, as a tapped swatch does.',
        actual: `At the next round (${same ? 'after Next ▸' : 'after Play again'}) the button, still carrying "${nextRound.cls}", starts ${pulsing.map((m) => `the ${m.name} animation (${m.props.join('/')})`).join(', ')}, a scale to 1.05 and back, with prefers-reduced-motion: reduce; it replays every time the button comes back, round after round.`,
        cause: 'js/battle.js:318 (showRound) clears is-chosen from the button but not is-pulse (added by pulse(), js/battle.js:326), so the CSS animation restarts each time the hidden button is displayed again; and styles.css:1710 repeats ".vb-choice.is-pulse { animation: vb-pulse-btn 0.3s ease-out; }" after the reduced-motion rule at styles.css:1699, which it overrides (same specificity, later).',
      });
    }
    await clean(t, page, 'reduced motion: app');
    const sp = await openPage(site, { url: 'pose.html', reducedMotion: true }); pages.push(sp);
    await waitFor(sp, () => window.__poseStarted, null, 60000);
    await sp.evaluate(() => document.querySelector('#poses .pose-btn').click());
    await sp.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    // (a section that has just appeared has no style to move from: let it be drawn once first)
    await waitFor(sp, () => { const e = document.querySelector('#rigMore summary'); return !!e && e.checkVisibility() && document.getElementById('library').hidden; }, null, 5000);
    await sp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const poseMoved = await sp.evaluate(`(() => { document.querySelector('#rigMore summary').click(); return (${MOVING})(); })()`);
    if (!t.check(poseMoved.length === 0, 'Reduced motion (pose.html): opening Rig controls moves nothing', poseMoved)) {
      t.finding({
        title: 'pose.html turns its folding sections\' arrow with a transition even when reduced motion is asked for',
        severity: 'low',
        steps: '1. Turn on "Reduce motion" in the system settings. 2. Open Pose and light, switch to Advanced, open Rig controls (or Light settings, Where the values split, Show or hide).',
        expected: 'No movement animation with reduced motion, as the app\'s own drawers do: styles.css:1381 turns the same chevron\'s transition off under prefers-reduced-motion.',
        actual: `Opening Rig controls starts ${poseMoved.map((m) => `a ${m.kind} of ${m.name || m.props.join('/')} on ${m.what}`).join(', ')} (a 0.15 s rotation).`,
        cause: 'pose.css:110 gives .more > summary::after "transition: transform 0.15s", and pose.css:154, its only prefers-reduced-motion rule, sets scroll-behavior alone.',
      });
    }
    await clean(t, sp, 'reduced motion: pose.html');
  });

  // =================================================================================================================
  // axe-core in light and dark, at desktop and phone width, in every tab's main states
  // =================================================================================================================
  await segment(t, 'axe: every state, light and dark, desktop and phone', async (pages) => {
    const page = await openPage(site, { bypassCSP: true }); pages.push(page);
    const serious = [], minor = new Set(), mismatch = [], labelled = [], states = [];
    const run = async (pg, what, frameOf = null) => {
      states.push(what);
      for (const [w, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) for (const scheme of ['light', 'dark']) {
        await pg.setViewportSize(vp); await pg.emulateMedia({ colorScheme: scheme });
        await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const fr = frameOf ? frameOf() : null;
        for (const x of await axe(pg, { frame: fr })) {
          if (x.impact === 'serious' || x.impact === 'critical') serious.push(`${what} (${w}, ${scheme}): ${x.id} ${x.help} ×${x.count} e.g. ${x.nodes[0]}`);
          else minor.add(`${x.id} (${x.impact}) ${x.help} e.g. ${x.nodes[0]}`);
        }
      }
      await pg.setViewportSize(DESKTOP); await pg.emulateMedia({ colorScheme: 'light' });
      // a control's name holds the words it shows (axe's label-content-name-mismatch, off by default as experimental)
      const fr = (frameOf ? frameOf() : null) || app(pg);
      if (!(await fr.evaluate(() => !!window.axe))) await fr.evaluate(AXE_SRC);
      const r = await fr.evaluate(() => window.axe.run(document, { runOnly: ['label-content-name-mismatch'], resultTypes: ['violations'] }).then((x) => x.violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160) })))));
      for (const n of r) {
        const info = await fr.evaluate((sel) => { const e = document.querySelector(sel); return e ? { name: e.getAttribute('aria-label') || '', text: e.innerText.replace(/\s+/g, ' ').trim(), first: (e.innerText.split('\n').map((x) => x.trim()).find(Boolean) || '') } : null; }, n.target).catch(() => null);
        if (!info) continue;
        // the words that label it are its first line (a palette's "Zorn" over "7 / 11" and its note): a name that holds
        // them passes (WCAG 2.5.3 asks for the label, not every word near it); the rest are told in a note
        const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (norm(info.name).includes(norm(info.first))) labelled.push(`${what}: "${info.text}" named "${info.name}"`);
        else mismatch.push({ where: what, target: n.target, ...info });
      }
    };
    await run(page, 'Study (Simple)');
    await click(page, '[data-mode="advanced"]');
    await page.evaluate(() => document.querySelectorAll('.drawer').forEach((d) => { d.open = true; }));
    await waitFor(page, () => !document.getElementById('checkBody').hidden, null, 30000);
    await click(page, '[data-tool="measure"]');
    await run(page, 'Study (Advanced, every drawer open, the painting scored, Measure on)');
    await click(page, '#srcMine'); await waitFor(page, () => !document.getElementById('minePane').hidden, null, 3000);
    await click(page, '#mineEdit'); await waitFor(page, () => document.getElementById('paintDialog').open, null, 3000);
    await run(page, 'My paints dialog');
    await click(page, '#paintDialogDone'); await click(page, '#srcPreset'); await click(page, '[data-tool="sample"]');
    await click(page, '[data-mode="simple"]');
    await click(page, '#tabGamesBtn');
    await run(page, 'Games menu open');
    await page.keyboard.press('Escape');
    await tab(page, 'loomis'); await run(page, 'Loomis head');
    await tab(page, 'help'); await run(page, 'How to use');
    await tab(page, 'paint');
    await waitFor(page, () => window.PaintStudio && document.querySelectorAll('#ps-paints .ps-paint').length > 0, null, 20000);
    await click(page, '#ps-colorBtn'); await run(page, 'Studio with the Paints sheet');
    await page.keyboard.press('Escape');
    // Figure study: setup, drawing, the card, the drawings
    await tab(page, 'figure', { timeout: 120000 });
    await run(page, 'Figure study setup');
    await click(page, '#fig-start');
    await waitFor(page, () => { const s = window.FigureStudy && FigureStudy.state(); return s && s.shot; }, null, 60000);
    await run(page, 'Figure study drawing');
    await stroke(page, '#tab-figure canvas[aria-label="Drawing paper"]', [[0.5, 0.15], [0.5, 0.45], [0.42, 0.8]]);
    await pressUntil(page, '#fig-done', () => !document.getElementById('fig-result').hidden, { key: null });
    await waitFor(page, () => !document.getElementById('fig-result').hidden && /out of 5 stars|nothing drawn/.test(document.getElementById('fig-say').textContent), null, 30000);
    await settled(page);
    await run(page, 'Figure study card');
    await pressUntil(page, '#fig-stop', () => !document.getElementById('fig-review').hidden, { key: null });
    await run(page, 'Figure study drawings');
    // Paint by numbers: setup, playing, the score card, the analysis, Play again's dialog
    await tab(page, 'game');
    await waitFor(page, () => !document.getElementById('gameStart').disabled, null, 60000);
    await run(page, 'Paint by numbers setup');
    await click(page, '#gameStart');
    await waitFor(page, () => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, 30000);
    await page.evaluate(() => { const b = document.querySelectorAll('.game-paint'); b[0].click(); b[1].click(); });
    await run(page, 'Paint by numbers playing');
    await click(page, '#gameLock');
    await waitFor(page, () => { const m = /(\d+)% color match/.exec(document.getElementById('gameStars').getAttribute('aria-label') || ''); return !document.getElementById('gameResult').hidden && m && document.getElementById('gamePct').textContent === m[1]; }, null, 30000);
    await settled(page);
    await run(page, 'Paint by numbers score card');
    await click(page, '#gameAnalyze'); await click(page, '#gamePopupClose'); await click(page, '#gameCompare');
    await waitFor(page, () => document.getElementById('gameFinalWrap').style.getPropertyValue('--cut') === '50%', null, 5000);
    await run(page, 'Paint by numbers analysis and Compare with target');
    await click(page, '#gameShowScore'); await click(page, '#gamePopup [data-game="again"]');
    await waitFor(page, () => document.getElementById('againDialog').open, null, 3000);
    await run(page, 'Play again dialog');
    await click(page, '#againCancel');
    // Value battle: setup, a round, the miss, the score
    await tab(page, 'battle');
    await run(page, 'Value battle setup');
    await click(page, '#vbCount2'); await click(page, '#vbModeStreak'); await click(page, '#vb-start');
    await waitFor(page, () => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0; }, null, 5000);
    await run(page, 'Value battle playing');
    const ans = await page.evaluate(() => { const g = ValueBattle.state(); return g.rounds[g.i].answer; });
    await page.evaluate((a) => (a === 'same' ? document.querySelector('.vb-swatch').click() : document.querySelector('.vb-choice').click()), ans);
    await waitFor(page, () => !document.getElementById('vb-miss').hidden, null, 3000);
    await settled(page);
    await run(page, 'Value battle miss');
    await click(page, '#vb-missNext');
    await waitFor(page, () => !document.getElementById('vb-popup').hidden, null, 3000);
    await settled(page);
    await run(page, 'Value battle score');
    // Pose and light in the frame: the start sheet, a pose, Advanced
    await tab(page, 'pose', { timeout: 120000 });
    await run(page, 'Pose and light frame, start sheet', () => poseFrame(page));
    await poseFrame(page).evaluate(() => document.querySelector('#poses .pose-btn').click());
    await waitFor(poseFrame(page), () => document.getElementById('library').hidden, null, 5000);
    await run(page, 'Pose and light frame, posed', () => poseFrame(page));
    await click(page, '[data-mode="advanced"]');
    await waitFor(poseFrame(page), () => window.PoseAndLight && PoseAndLight.mode() === 'advanced', null, 10000);
    await poseFrame(page).evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await run(page, 'Pose and light frame, Advanced with every section open', () => poseFrame(page));
    await clean(t, page, 'axe tour');
    // pose.html on its own
    const sp = await openPage(site, { url: 'pose.html', bypassCSP: true }); pages.push(sp);
    await waitFor(sp, () => window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30, null, 120000);
    await run(sp, 'pose.html start sheet');
    await sp.evaluate(() => document.querySelector('#poses .pose-btn').click());
    await waitFor(sp, () => document.getElementById('library').hidden, null, 5000);
    await run(sp, 'pose.html posed');
    await sp.evaluate(() => document.getElementById('posesBtn').click());
    await run(sp, 'pose.html library');
    await sp.evaluate(() => { document.getElementById('libClose').click(); document.getElementById('snap').click(); });
    await waitFor(sp, () => document.getElementById('snapDialog').open, null, 5000);
    await run(sp, 'pose.html snapshot');
    await sp.evaluate(() => { document.getElementById('snapClose').click(); document.querySelector('[data-mode="advanced"]').click(); document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
    await run(sp, 'pose.html Advanced with every section open');
    await clean(t, sp, 'axe tour: pose.html');

    t.check(serious.length === 0, `axe: no serious or critical issue in ${states.length} states, each in light and dark at 1400 × 900 and 390 × 844`, serious);
    if (serious.length) t.finding({ title: `axe-core reports ${serious.length} serious or critical issue${serious.length > 1 ? 's' : ''}`, severity: 'medium', steps: 'Run axe-core (tests/lib.mjs axe()) on the states listed in the check, in the scheme and width given.', expected: 'No serious or critical axe issue in any state, light or dark, at either width.', actual: serious.slice(0, 6).join(' / '), cause: 'See each rule\'s nodes in the check detail.' });
    for (const m of minor) t.note(`axe (not serious): ${m}`);
    t.note(`axe states: ${states.join('; ')}`);
    const paints = mismatch.filter((m) => /game-paint|data-index/.test(m.target) || /^Add /.test(m.name || ''));
    const groups = mismatch.filter((m) => /fig-group-btn|data-group/.test(m.target) || /poses$/.test(m.name || ''));
    if (labelled.length) t.note(`axe label-content-name-mismatch also lists ${labelled.length} controls whose name holds their label (the first line) but not every word shown with it, e.g. ${[...new Set(labelled)].slice(0, 3).join('; ')}`);
    if (!t.check(mismatch.length === 0, 'Every control\'s name holds the words that label it (its first visible line; axe label-content-name-mismatch, every state)', mismatch.slice(0, 12))) {
      const ex = (list) => list.slice(0, 3).map((m) => `"${m.text}" is named "${m.name}"`).join(', ');
      t.finding({
        title: 'Some buttons are named in words they do not show, so voice control cannot press them by what they say',
        severity: 'low',
        steps: '1. Paint by numbers: Start painting; the paints are buttons showing their code (LW, YO, …). 2. Figure study: each group of the pose library has a button showing "Take these out" / "Put these back". 3. With voice control say "click LW" or "click Take these out", or read each button\'s accessible name.',
        expected: 'A control\'s accessible name contains the words it shows (WCAG 2.5.3 Label in Name), e.g. "LW, add Lead White" or "Take these out: the standing poses".',
        actual: `${paints.length ? `Paint by numbers: ${ex(paints)} (${paints.length} paints). ` : ''}${groups.length ? `Figure study: ${ex(groups)} (${groups.length} buttons). ` : ''}${mismatch.filter((m) => !paints.includes(m) && !groups.includes(m)).map((m) => `${m.where}: "${m.text}" named "${m.name}"`).join('; ')}`.trim(),
        cause: 'js/game.js:756 sets aria-label `Add ${paint.name}` over a button whose visible text is the paint\'s code (js/game.js:762-765); js/figure.js:196 sets aria-label "Take out the standing poses" while js/figure.js:195 writes "Take these out" on the button.',
      });
    }
  });
}
