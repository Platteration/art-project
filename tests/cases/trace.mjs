// Trace onto paper, played as someone tracing at a table: the tool opened from the Learning tools menu and from #trace;
// the camera started only on a tap (Chromium's fake camera, its permission granted by the launch flags), a live picture
// whose frames advance, the request it makes, the screen kept awake while it runs; a photo chosen (and the app's own
// refusals: not a picture, too small, an SVG that cannot be read back, a broken file) and the Study photo; Transparency
// through the overlay's computed opacity, remembered, and hostile saved values; Size, Fit, a mouse drag, a two-finger
// pinch (CDP Input.dispatchTouchEvent), the keyboard, Lock and Turn 90°; Set frame and Show frame (a non-blank still,
// over the camera and under the photo, at its strength); the camera stopped on leaving the tab and on the page going
// hidden, and back by itself where the permission is granted (else the card asks); the camera refused, not found, in use,
// an unknown failure, no mediaDevices, not a secure context, the site's Permissions-Policy saying camera=() and the app
// inside another site's frame; phones upright and sideways (every control on the screen and out of the safe areas, the
// photo kept in place across a turn) and the focus; with no page error, console error, policy violation or request off
// the site at every step.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { openPage, clean, tab, app, DESKTOP, PHONE, makeImage, textFile, brokenImage, svgImage, click, text, sleep, storageGet, storageKeys, PROTO_NAMES, screenshot, axe, newTab, dropFiles, pasteFile } from '../lib.mjs';
import { serve } from '../serve.mjs';

const SIDE = { width: 844, height: 390 };
const KEY = 'portrait-value-studio.trace';
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// one block's failure is one failed check, not the end of the case; every page it opened is closed with it
async function seg(t, name, fn) {
  const t0 = Date.now(), pages = [];
  try { await fn(pages); } catch (e) { t.check(false, `${name}: ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  for (const p of pages) await p.context().close().catch(() => null);
  t.note(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// what the page asked of the camera and the screen: every getUserMedia call (its constraints, its stream), a wake lock that
// records requests and releases, and a getUserMedia that fails with window.__gumError when that is set
const RECORD = () => {
  window.__gum = []; window.__streams = []; window.__wake = { requests: 0, releases: 0, held: 0 };
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => { window.__gum.push(JSON.stringify(c)); if (window.__gumError) return Promise.reject(new DOMException('made to fail', window.__gumError)); return orig(c).then((s) => { window.__streams.push(s); return s; }); };
  }
  try {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: (type) => { const l = new EventTarget(); l.type = type; l.released = false; window.__wake.requests++; window.__wake.held++; l.release = () => { if (!l.released) { l.released = true; window.__wake.held--; window.__wake.releases++; l.dispatchEvent(new Event('release')); } return Promise.resolve(); }; return Promise.resolve(l); } } });
  } catch (e) { /* no wake lock to stand in for */ }
};
// a page whose camera calls are recorded (the init script runs before the app's scripts on the reload)
async function recorded(site, opts = {}) {
  const page = await openPage(site, opts);
  // (a stand-in the case puts under the page goes first, so the record shows what the page itself asked for)
  if (opts.init) await page.addInitScript(opts.init);
  await page.addInitScript(RECORD);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.Studio && Studio.result() && window.Trace, null, { timeout: 30000 }).catch(() => null);
  return page;
}

const st = (page) => app(page).evaluate(() => {
  const g = (id) => document.getElementById('tr-' + id);
  const vis = (e) => !!e && !e.hidden && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const s = Trace.state, v = g('video'), track = s.stream && s.stream.getVideoTracks()[0];
  const photo = g('photo'), ghost = g('ghost');
  return {
    tab: Studio.tab(), live: !!s.stream, starting: s.starting, wanted: s.wanted, track: track ? track.readyState : null, src: !!v.srcObject, vw: v.videoWidth, vh: v.videoHeight,
    card: vis(g('card')), say: g('say').textContent, start: vis(g('start')), startOff: g('start').disabled, cam: g('camera').getAttribute('aria-label'), camOff: g('camera').disabled, camWhy: g('camera').getAttribute('aria-describedby'),
    status: g('status').textContent, photo: s.photo && { ...s.photo }, place: { ...s.place }, locked: s.locked, frame: s.frame, frameShown: s.frameShown,
    photoShown: vis(photo), opacity: +getComputedStyle(photo).opacity, transform: photo.style.transform, ghostShown: vis(ghost), ghostOpacity: +getComputedStyle(ghost).opacity,
    off: Object.fromEntries(['fit', 'lock', 'turn', 'setFrame', 'showFrame', 'size', 'switch'].map((k) => [k, g(k).disabled ? g(k).getAttribute('aria-describedby') || 'off' : null])),
    pressed: { lock: g('lock').getAttribute('aria-pressed'), show: g('showFrame').getAttribute('aria-pressed') },
    shown: { switch: vis(g('switch')), turn: vis(g('turn')), strength: vis(g('strength')), useStudy: vis(g('useStudy')), exit: vis(g('exit')) },
    transparency: g('transparencyOut').textContent, size: g('sizeOut').textContent, pct: Trace.sizePct(),
    wake: window.__wake ? { ...window.__wake } : null, gum: (window.__gum || []).length,
  };
});
// the photo's box and the camera picture's box, and where the photo's centre sits in the picture (fractions)
const boxes = (page) => app(page).evaluate(() => {
  const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const p = r('tr-photo'), w = r('tr-wrap'), s = r('tr-stage'), strip = r('tr-strip');
  return { photo: p, wrap: w, stage: s, strip, cx: (p.x + p.w / 2 - w.x) / w.w, cy: (p.y + p.h / 2 - w.y) / w.h, pw: p.w / w.w };
});
// how much a canvas's picture varies (0 for a blank or a flat one), and its mean color
const picture = (page, id) => app(page).evaluate((id) => {
  const c = document.getElementById(id); if (!c.width) return { w: 0, spread: 0 };
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sum = [0, 0, 0], lo = 255, hi = 0, opaque = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { n++; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; const l = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, l); hi = Math.max(hi, l); if (d[i + 3] > 200) opaque++; }
  return { w: c.width, h: c.height, spread: Math.round(hi - lo), mean: sum.map((v) => Math.round(v / n)), opaque: +(opaque / n).toFixed(2) };
}, id);
// a frame of the live video drawn into the page: its mean color and a fingerprint of a few rows, to tell frames apart
const videoFrame = (page) => app(page).evaluate(() => {
  const v = document.getElementById('tr-video'); if (!v.videoWidth) return null;
  const c = document.createElement('canvas'); c.width = 160; c.height = Math.round((160 * v.videoHeight) / v.videoWidth);
  const g = c.getContext('2d'); g.drawImage(v, 0, 0, c.width, c.height); const d = g.getImageData(0, 0, c.width, c.height).data;
  let sum = [0, 0, 0], n = 0, print = 0; for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++; print = (print * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2]) % 1000000007; }
  return { mean: sum.map((x) => Math.round(x / n)), print, time: v.currentTime };
});
const live = (page, timeout = 15000) => app(page).waitForFunction(() => window.Trace && Trace.state.stream && document.getElementById('tr-video').videoWidth > 0, null, { timeout }).then(() => true).catch(() => false);
const settled = (page) => app(page).evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const toastMatch = (page, re, timeout = 6000) => app(page).waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source, { timeout }).then(() => text(page, '#toast')).catch(async () => `(not shown; the toast says "${await text(page, '#toast')}")`);
const armToast = (page) => app(page).evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.classList.remove('show'); });
const setRange = (page, id, v) => app(page).evaluate(([id, v]) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
const active = (page) => app(page).evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'body' : a.id || a.tagName.toLowerCase(); });
// a file chosen with the tool's own Photo button (its input)
async function choose(page, file) { await armToast(page); await app(page).setInputFiles('#tr-file', file); }
async function startCamera(page) { await click(page, '#tr-start'); return live(page); }
// the fingers on a touch screen, through the browser's own input (CDP), so touch-action and pointer events apply
const touch = (cdp, type, pts = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
// the controls in a safe area's band (the phone case's rule: insets as Emulation takes them)
const inBands = (page, I) => page.evaluate((I) => {
  const W = innerWidth, H = innerHeight, out = [];
  for (const e of document.querySelectorAll('#tab-trace :is(button, input:not([type=file]), label[for], [tabindex="0"])')) {
    if (e.closest('[hidden]') || e.id === 'tr-hit') continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const hit = [];
    if (I.bottom && r.bottom > H - I.bottom) hit.push(`${Math.round(H - r.bottom)} from the bottom`);
    if (I.left && r.left < I.left) hit.push(`left ${Math.round(r.left)}`);
    if (I.right && r.right > W - I.right) hit.push(`${Math.round(W - r.right)} from the right`);
    if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) hit.push('off the screen');
    if (hit.length) out.push(`${e.id || e.textContent.trim().slice(0, 14)} (${hit.join(', ')})`);
  }
  return out;
}, I);

export default async function trace(t, site) {
  // ---- opened from the menu and from #trace; nothing starts by itself ----------------------------------------------
  await seg(t, 'the menu, the route and the first look', async (pages) => {
    const page = await recorded(site); pages.push(page);
    await click(page, '#tabLearnBtn');
    const item = await page.evaluate(() => { const b = document.getElementById('tabTraceBtn'); const items = [...document.querySelectorAll('#tabLearnMenu .tab-item')].map((x) => x.id); return { name: b.querySelector('span').textContent, small: b.querySelector('small').textContent, role: b.getAttribute('role'), order: items }; });
    t.check(item.name === 'Trace onto paper' && /photo over the camera/i.test(item.small) && item.role === 'menuitemradio' && item.order.join() === 'tabStudyBtn,tabLoomisBtn,tabPoseBtn,tabTraceBtn,tabHelpBtn', 'Learning tools lists Trace onto paper after Pose and light, with its one-line description', item);
    await page.click('#tabTraceBtn');
    await page.waitForFunction(() => !document.getElementById('tab-trace').hidden, null, { timeout: 5000 }).catch(() => null);
    await settled(page);
    let s = await st(page);
    const shell = await page.evaluate(() => ({ shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), sub: document.getElementById('tabLearnSub').textContent, checked: document.getElementById('tabTraceBtn').getAttribute('aria-checked'), body: document.body.classList.contains('tab-trace'), focus: document.activeElement && document.activeElement.id, rail: getComputedStyle(document.querySelector('.rail')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display }));
    t.check(shell.shown.join() === 'tab-trace' && shell.sub === 'Trace onto paper' && shell.checked === 'true' && shell.body && shell.rail === 'none' && shell.tabs !== 'none' && shell.focus === 'tabLearnBtn', 'the menu item opens the tool: its panel alone, the button names it, the rail steps aside, the focus on Learning tools (a wide screen)', shell);
    t.check(s.card && s.start && !s.live && !s.src && s.gum === 0 && s.cam === 'Start camera' && /camera picture stays on this device/.test(s.say), 'nothing starts on its own: the card offers Start camera and says the picture stays on the device; no camera was asked for', s);
    t.check(s.off.setFrame === 'tr-whyCamera' && s.off.showFrame === 'tr-whyCamera' && s.off.fit === 'tr-whyPhoto' && s.off.lock === 'tr-whyPhoto' && s.off.size === 'tr-whyPhoto' && !s.photoShown, 'before the camera and a photo: the frame buttons, Fit, Lock and Size are off, each with its reason', s.off);
    const why = await page.evaluate(() => ['whyCamera', 'whyFrame', 'whyPhoto', 'whyLocked'].map((k) => document.getElementById('tr-' + k).textContent));
    t.check(why.every((w) => w.length > 10), 'the reasons are words', why);
    t.check(s.shown.useStudy && !s.shown.switch && !s.shown.turn && !s.shown.strength && !s.shown.exit, 'Simple on a wide screen: Study photo offered; no Switch, Turn 90° or Frame strength; no ← (the tabs are there)', s.shown);
    t.check((await storageKeys(page)).filter((k) => k === KEY).length === 0, 'opening the tool stores nothing');
    await screenshot(page, 'trace-desktop-first');
    await clean(t, page, 'the menu');
    // the route, at a phone's width: the focus goes to Start camera (the header and tabs stepped aside)
    const p2 = await recorded(site, { url: '#trace', viewport: PHONE }); pages.push(p2);
    await settled(p2);
    s = await st(p2);
    const r2 = await p2.evaluate(() => ({ tabs: getComputedStyle(document.querySelector('.tabs')).display, top: getComputedStyle(document.querySelector('.topbar')).display, focus: document.activeElement && document.activeElement.id }));
    t.check(s.tab === 'trace' && s.card && s.start && r2.tabs === 'none' && r2.top === 'none' && r2.focus === 'tr-start' && s.shown.exit && s.gum === 0, '#trace on a phone: the tool fills the screen, the header and tabs step aside, ← is there, the focus on Start camera, nothing asked of the camera', { ...r2, exit: s.shown.exit, gum: s.gum });
    await clean(t, p2, 'the route');
  });

  // ---- the camera: started on a tap, a live picture, the request, the wake lock, stopped -----------------------------
  await seg(t, 'the camera', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    const on = await startCamera(page);
    let s = await st(page);
    const f1 = await videoFrame(page); await sleep(600); const f2 = await videoFrame(page);
    t.check(on && s.live && s.track === 'live' && s.vw > 0 && s.vh > 0 && !s.card && s.cam === 'Stop camera', 'Start camera: a live video from the camera, the card gone, the strip\'s button now stops it', { on, vw: s.vw, vh: s.vh, track: s.track, card: s.card });
    t.check(f1 && f2 && f2.time > f1.time && f2.print !== f1.print, 'the picture is live: its time runs on and its frames change', { f1, f2 });
    const asked = await page.evaluate(() => JSON.parse(window.__gum[0] || 'null'));
    t.check(asked && asked.audio === false && asked.video && asked.video.facingMode && asked.video.facingMode.ideal === 'environment' && asked.video.width.ideal === 1920 && asked.video.height.ideal === 1080, 'it asks for video only, the camera facing away from the screen (ideal), 1920 × 1080 (ideal)', asked);
    const lay = await boxes(page);
    t.check(near(lay.wrap.w / lay.wrap.h, s.vw / s.vh, 0.02) && lay.wrap.x >= lay.stage.x - 1 && lay.wrap.r <= lay.stage.r + 1 && lay.wrap.y >= lay.stage.y - 1 && lay.wrap.b <= lay.stage.b + 1 && (near(lay.wrap.w, lay.stage.w, 2) || near(lay.wrap.h, lay.stage.h, 2)), 'the whole camera picture shows, letterboxed: the view has its shape and fits the stage', { wrap: lay.wrap, stage: lay.stage, video: [s.vw, s.vh] });
    const fit = await page.evaluate(() => getComputedStyle(document.getElementById('tr-video')).objectFit);
    t.check(fit === 'contain', 'the video is drawn whole (object-fit: contain)', fit);
    t.check(s.wake && s.wake.requests === 1 && s.wake.held === 1, 'while the camera runs the screen is kept awake (one wake lock held)', s.wake);
    t.check(s.status === 'Choose a photo to put over the camera.' && !s.off.setFrame && s.off.showFrame === 'tr-whyFrame', 'with the camera on and no photo: the status line asks for one; Set frame on, Show frame off until a frame is set', { status: s.status, off: s.off });
    const stream = await page.evaluate(() => window.__streams.length);
    await click(page, '#tr-camera'); await settled(page);
    s = await st(page);
    const ended = await page.evaluate(() => window.__streams.every((x) => x.getTracks().every((tr) => tr.readyState === 'ended')));
    t.check(stream === 1 && ended && !s.live && !s.src && s.card && s.start && s.wake.held === 0 && s.wake.releases === 1 && s.cam === 'Start camera', 'Stop camera stops every track, lets the video go, releases the wake lock and shows the card again', { ended, s: { live: s.live, src: s.src, card: s.card, wake: s.wake } });
    // a wake lock the browser refuses: the camera still runs, and nothing is said in the console
    await page.evaluate(() => { navigator.wakeLock.request = () => Promise.reject(new DOMException('no', 'NotAllowedError')); });
    t.check(await startCamera(page), 'a refused wake lock does not stop the camera');
    // the camera stopped from outside (another app took it, a cable pulled): the card says so and offers Start camera
    await page.evaluate(() => { const tr = Trace.state.stream.getVideoTracks()[0]; tr.stop(); tr.dispatchEvent(new Event('ended')); });
    await settled(page);
    s = await st(page);
    t.check(!s.live && s.card && s.start && /stopped/.test(s.say), 'a camera that ends by itself: the card says it stopped and offers Start camera', s.say);
    await clean(t, page, 'the camera');
  });

  // ---- the photo: chosen, refused, the Study photo; Transparency ---------------------------------------------------
  await seg(t, 'the photo and Transparency', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await startCamera(page);
    await choose(page, await makeImage(page, { width: 600, height: 800, name: 'friend.png' }));
    await page.waitForFunction(() => Trace.state.photo, null, { timeout: 10000 }).catch(() => null);
    await settled(page);
    let s = await st(page), b = await boxes(page);
    const said = await toastMatch(page, /over the camera/);
    t.check(s.photoShown && s.photo && s.photo.name === 'friend.png' && /friend\.png is over the camera/.test(said), 'a chosen photo shows over the camera, and the toast says so', { photo: s.photo, said });
    t.check(near(b.cx, 0.5, 0.01) && near(b.cy, 0.5, 0.01) && b.photo.x >= b.wrap.x - 1 && b.photo.r <= b.wrap.r + 1 && b.photo.y >= b.wrap.y - 1 && b.photo.b <= b.wrap.b + 1 && (near(b.photo.w, b.wrap.w, 2) || near(b.photo.h, b.wrap.h, 2)) && s.size === '100%', 'it starts fitted to the camera picture and centred (Size 100%)', { b, size: s.size });
    t.check(!s.off.fit && !s.off.lock && !s.off.size && s.status === '', 'with a photo: Fit, Lock and Size come on, the status line is clear', { off: s.off, status: s.status });
    // the over-the-camera order: the video, then the frame, then the photo, then the layer that takes the touches
    const order = await page.evaluate(() => { const ids = ['tr-video', 'tr-ghost', 'tr-photo']; const els = ids.map((i) => document.getElementById(i)); const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); return { order: after(els[0], els[1]) && after(els[1], els[2]), hit: +getComputedStyle(document.getElementById('tr-hit')).zIndex, photoEvents: getComputedStyle(els[2]).pointerEvents }; });
    t.check(order.order && order.hit > 0 && order.photoEvents === 'none', 'the frame lies over the video and under the photo; the touches go to a layer on top', order);
    // Transparency: the overlay's computed opacity, the read-out, remembered
    for (const [v, want] of [[20, 0.8], [100, 0], [0, 1], [65, 0.35]]) {
      await setRange(page, 'tr-transparency', v); await settled(page);
      s = await st(page);
      t.check(near(s.opacity, want, 0.01) && s.transparency === `${v}%`, `Transparency ${v}%: the photo's opacity is ${want}`, { opacity: s.opacity, out: s.transparency });
    }
    const saved = JSON.parse(await storageGet(page, KEY));
    t.check(saved && saved.transparency === 65 && saved.frame === 40 && Object.keys(saved).length === 2, `Transparency is kept under ${KEY}, with the frame strength, and nothing else`, saved);
    // the refusals: the app's own checks and words; the photo over the camera stays
    const before = await picture(page, 'tr-photo');
    for (const [label, file, re] of [
      ['a text file', textFile('notes.txt'), /not an image/],
      ['a picture 10 px wide', await makeImage(page, { width: 10, height: 40, name: 'tiny.png' }), /too small to trace/],
      ['an SVG that holds HTML', svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><foreignObject width="200" height="200"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject></svg>', 'html.svg'), /cannot be read here/],
      ['a broken JPG', brokenImage('broken.jpg'), /could not be opened/],
      ['an empty file', { name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) }, /empty file/],
    ]) {
      await choose(page, file);
      const msg = await toastMatch(page, re);
      s = await st(page);
      const after = await picture(page, 'tr-photo');
      t.check(re.test(msg) && s.photo.name === 'friend.png' && after.spread === before.spread && after.mean.join() === before.mean.join(), `${label} is refused in words and the photo over the camera stays`, { msg, photo: s.photo.name });
    }
    // the Study photo; then Load photo (the app's own) while the tool is open: the Study photo and the overlay both take it
    await armToast(page); await click(page, '#tr-useStudy');
    s = await st(page);
    t.check(s.photo && s.photo.name === 'The sample portrait' && s.photo.w === 600 && /sample portrait is over the camera/.test(await toastMatch(page, /over the camera/)), 'Study photo puts the Study tab\'s photo (the sample) over the camera', s.photo);
    await armToast(page);
    await app(page).setInputFiles('#file', await makeImage(page, { width: 500, height: 700, name: 'loaded.png' }));
    await page.waitForFunction(() => Trace.state.photo && Trace.state.photo.name === 'loaded', null, { timeout: 15000 }).catch(() => null);
    s = await st(page);
    t.check(s.tab === 'trace' && s.live && s.photo && s.photo.name === 'loaded' && (await page.evaluate(() => Studio.sourceBase())) === 'loaded', 'Load photo while the tool is open: the tool stays, the camera runs on, and the photo is both the Study photo and over the camera', { tab: s.tab, live: s.live, photo: s.photo });
    // a reload keeps Transparency
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.Trace, null, { timeout: 15000 }).catch(() => null);
    s = await st(page);
    t.check(s.transparency === '65%' && (await page.evaluate(() => document.getElementById('tr-transparency').value)) === '65' && !s.photoShown && !s.live, 'a reload keeps Transparency (65%); the photo and the camera are not kept', { t: s.transparency, photo: s.photoShown, live: s.live });
    await clean(t, page, 'the photo');
  });

  // ---- saved values that are not what the tool writes --------------------------------------------------------------
  await seg(t, 'hostile saved values', async (pages) => {
    for (const [label, raw, want] of [
      ['a string', 'oops', [50, 40]], ['numbers as strings', '{"transparency":"80","frame":"20"}', [50, 40]], ['out of range', '{"transparency":-5,"frame":5000}', [50, 40]],
      ['a fraction', '{"transparency":30.4,"frame":79.6}', [30, 80]], ['an array', '[1,2]', [50, 40]], ['NaN', 'NaN', [50, 40]], ['null', 'null', [50, 40]],
      ['prototype names', `{"__proto__":{"transparency":10},"constructor":{"prototype":{"frame":11}},${PROTO_NAMES.map((n) => `"${n}":1`).filter((x) => !/__proto__|constructor/.test(x)).join(',')}}`, [50, 40]],
    ]) {
      const page = await openPage(site, { url: '#trace', storage: { [KEY]: raw } }); pages.push(page);
      await page.waitForFunction(() => window.Trace, null, { timeout: 15000 }).catch(() => null);
      const s = await page.evaluate(() => ({ t: Trace.settings.transparency, f: Trace.settings.frame, tOut: document.getElementById('tr-transparencyOut').textContent, junk: /NaN|undefined/.test(document.getElementById('tr-root').textContent), polluted: 'transparency' in Object.prototype || 'frame' in Object.prototype }));
      t.check(s.t === want[0] && s.f === want[1] && s.tOut === `${want[0]}%` && !s.junk && !s.polluted, `saved ${label}: Transparency ${want[0]}%, frame strength ${want[1]}%, nothing reads NaN or undefined`, s);
      t.check((await storageGet(page, KEY)) === raw, `saved ${label}: opening the tool does not write over it`);
      await clean(t, page, `saved ${label}`);
      await page.context().close(); pages.pop();
    }
  });

  // ---- Size, Fit, a drag, the keyboard, Lock and Turn 90° (desktop, the mouse) ---------------------------------------
  await seg(t, 'size, fit, drag, keys, lock and turn', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await startCamera(page);
    await click(page, '#tr-useStudy'); await settled(page);
    let b0 = await boxes(page);
    // the Size slider: a ratio scale, the read-out, the photo's width
    for (const pct of [50, 200, 400, 20]) {
      const v = await page.evaluate((p) => { const s = document.getElementById('tr-size'); return Math.round((+s.max * Math.log(p / 100 / 0.2)) / Math.log(20)); }, pct);
      await setRange(page, 'tr-size', v); await settled(page);
      const s = await st(page), b = await boxes(page);
      t.check(near(s.pct, pct, Math.max(2, pct * 0.02)) && s.size === `${s.pct}%` && near(b.pw / b0.pw, s.pct / 100, 0.02) && near(b.cx, 0.5, 0.01), `Size to ${pct}%: the photo is ${pct}% of its fitted width, about its centre`, { pct: s.pct, out: s.size, ratio: +(b.pw / b0.pw).toFixed(3) });
    }
    await setRange(page, 'tr-size', 0); let s = await st(page);
    t.check(s.pct === 20, 'Size runs from a fifth of the fitted size', s.pct);
    await setRange(page, 'tr-size', 200); s = await st(page);
    t.check(s.pct === 400, 'to four times it', s.pct);
    await click(page, '#tr-fit'); await settled(page);
    let b = await boxes(page); s = await st(page);
    t.check(s.pct === 100 && near(b.cx, 0.5, 0.005) && near(b.cy, 0.5, 0.005) && near(b.pw, b0.pw, 0.005), 'Fit: back to the fitted size and centred', { pct: s.pct, cx: b.cx, cy: b.cy });
    // a drag with the mouse moves it by as much as the pointer moved
    const H = await page.evaluate(() => { const r = document.getElementById('tr-hit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(H.x, H.y); await page.mouse.down(); await page.mouse.move(H.x + 80, H.y + 50, { steps: 6 }); await page.mouse.up(); await settled(page);
    b = await boxes(page);
    t.check(near((b.cx - 0.5) * b.wrap.w, 80, 2) && near((b.cy - 0.5) * b.wrap.h, 50, 2) && near(b.pw, b0.pw, 0.005), 'a mouse drag moves the photo with the pointer (80, 50 px), its size unchanged', { dx: (b.cx - 0.5) * b.wrap.w, dy: (b.cy - 0.5) * b.wrap.h });
    // a right-button drag does nothing
    const c1 = b.cx;
    await page.mouse.move(H.x, H.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(H.x - 60, H.y, { steps: 3 }); await page.mouse.up({ button: 'right' });
    t.check(near((await boxes(page)).cx, c1, 0.001), 'a right-button drag leaves it where it is');
    // the keyboard: Tab reaches the picture, the arrows move it (2 px, 20 with Shift), + and − size it
    await page.focus('#tr-hit');
    const k0 = await boxes(page), p0 = (await st(page)).pct;
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    const k1 = await boxes(page);
    await page.keyboard.press('+'); await page.keyboard.press('+');
    const p1 = (await st(page)).pct;
    await page.keyboard.press('-');
    const p2 = (await st(page)).pct;
    const fv = await page.evaluate(() => document.getElementById('tr-hit').matches(':focus-visible') && getComputedStyle(document.getElementById('tr-hit')).outlineStyle !== 'none');
    t.check(near((k1.cx - k0.cx) * k1.wrap.w, 10, 1) && near((k1.cy - k0.cy) * k1.wrap.h, -20, 1) && p1 > p0 && p2 < p1 && fv, 'from the keyboard: the arrows move the photo (5 × 2 px right, 20 px up with Shift), + and − size it, and the picture shows the focus', { dx: (k1.cx - k0.cx) * k1.wrap.w, dy: (k1.cy - k0.cy) * k1.wrap.h, p0, p1, p2, fv });
    // Lock: drags, the keys and the sliders leave it; the controls that move it say why they are off
    await click(page, '#tr-lock'); await settled(page);
    s = await st(page);
    const L0 = await boxes(page);
    t.check(s.locked && s.pressed.lock === 'true' && s.off.fit === 'tr-whyLocked' && s.off.size === 'tr-whyLocked' && s.off.turn === 'tr-whyLocked' && /Locked/.test(s.status), 'Lock: pressed, the status line says so, Fit, Size and Turn 90° off with the reason', { pressed: s.pressed, off: s.off, status: s.status });
    await page.mouse.move(H.x, H.y); await page.mouse.down(); await page.mouse.move(H.x - 120, H.y - 90, { steps: 5 }); await page.mouse.up();
    await page.focus('#tr-hit'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('+');
    await setRange(page, 'tr-size', 10);
    const L1 = await boxes(page);
    t.check(near(L1.cx, L0.cx, 0.0005) && near(L1.cy, L0.cy, 0.0005) && near(L1.pw, L0.pw, 0.0005), 'locked: a drag, the arrow keys, + and the Size slider leave it where it is', { before: [L0.cx, L0.cy, L0.pw], after: [L1.cx, L1.cy, L1.pw] });
    await click(page, '#tr-lock');
    await page.mouse.move(H.x, H.y); await page.mouse.down(); await page.mouse.move(H.x - 40, H.y, { steps: 3 }); await page.mouse.up();
    t.check(near(((await boxes(page)).cx - L1.cx) * L1.wrap.w, -40, 2) && !(await st(page)).locked, 'unlocked: it moves again');
    // Turn 90° (Advanced): a quarter turn, fitted to the picture turned
    t.check(!(await st(page)).shown.turn, 'Simple: no Turn 90°');
    await click(page, '[data-mode="advanced"]'); await settled(page);
    s = await st(page);
    t.check(s.shown.turn && s.shown.strength && !s.shown.switch, 'Advanced: Turn 90° and Frame strength appear (Switch only with a second camera)', s.shown);
    await click(page, '#tr-fit'); await click(page, '#tr-turn'); await settled(page);
    s = await st(page); b = await boxes(page);
    t.check(s.transform === 'rotate(90deg)' && s.pct === 100 && b.photo.x >= b.wrap.x - 1 && b.photo.r <= b.wrap.r + 1 && b.photo.y >= b.wrap.y - 1 && b.photo.b <= b.wrap.b + 1 && (near(b.photo.w, b.wrap.w, 2) || near(b.photo.h, b.wrap.h, 2)), 'Turn 90°: the photo turns a quarter and, fitted, fits the picture turned', { transform: s.transform, photo: b.photo, wrap: b.wrap });
    for (let i = 0; i < 3; i++) await click(page, '#tr-turn');
    t.check((await st(page)).transform === '', 'four quarter turns bring it back upright');
    // Simple again: the turn a trace is under way with stays; the Advanced controls go
    await click(page, '#tr-turn'); await click(page, '[data-mode="simple"]'); await settled(page);
    s = await st(page);
    t.check(s.transform === 'rotate(90deg)' && !s.shown.turn && !s.shown.strength, 'back in Simple a turned photo stays turned (a trace under way does not move); Turn 90° and Frame strength hide', { transform: s.transform, shown: s.shown });
    // the window resized: the photo keeps its place over the picture
    await click(page, '#tr-fit'); await setRange(page, 'tr-size', 140);
    await page.mouse.move(H.x, H.y); await page.mouse.down(); await page.mouse.move(H.x + 60, H.y - 30, { steps: 3 }); await page.mouse.up();
    const r0 = await boxes(page);
    await page.setViewportSize({ width: 1100, height: 760 }); await sleep(300); await settled(page);
    const r1 = await boxes(page);
    t.check(near(r1.cx, r0.cx, 0.01) && near(r1.cy, r0.cy, 0.01) && near(r1.pw, r0.pw, 0.01), 'a resized window keeps the photo where it was over the camera picture (its centre and width as fractions of it)', { before: [r0.cx, r0.cy, r0.pw], after: [r1.cx, r1.cy, r1.pw] });
    await clean(t, page, 'size, fit, drag, keys, lock and turn');
  });

  // ---- the frame: Set frame keeps a still of the camera's view, Show frame lays it over the live picture -------------
  await seg(t, 'the frame', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    const DBS = () => page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => `${d.name} v${d.version}`).sort().join() : ''));
    const dbs0 = await DBS();
    await startCamera(page);
    await click(page, '#tr-useStudy');
    let s = await st(page);
    t.check(!s.off.setFrame && s.off.showFrame === 'tr-whyFrame' && !s.frame, 'with the camera on: Set frame on, Show frame off until a frame is set', s.off);
    const v = await videoFrame(page);
    await armToast(page); await click(page, '#tr-setFrame');
    const g = await picture(page, 'tr-ghost');
    s = await st(page);
    t.check(s.frame && g.w > 0 && g.spread > 40 && g.opaque > 0.95 && v && g.mean.every((m, i) => near(m, v.mean[i], 40)) && !s.ghostShown && /Frame set/.test(await toastMatch(page, /Frame set/)), 'Set frame keeps a still of the camera picture (not blank, its colors), says so, and does not show it yet', { ghost: g, video: v && v.mean, shown: s.ghostShown });
    t.check(!s.off.showFrame && s.pressed.show === 'false', 'Show frame comes on', s.off);
    await click(page, '#tr-showFrame'); await settled(page);
    s = await st(page);
    t.check(s.ghostShown && near(s.ghostOpacity, 0.4, 0.01) && s.pressed.show === 'true' && /Frame on/.test(s.status), 'Show frame lays it over the camera, faint (40%), pressed, and the status line says what to do', { shown: s.ghostShown, opacity: s.ghostOpacity, status: s.status });
    const gb = await page.evaluate(() => { const g = document.getElementById('tr-ghost').getBoundingClientRect(), w = document.getElementById('tr-wrap').getBoundingClientRect(); return [g.left - w.left, g.top - w.top, g.width - w.width, g.height - w.height].map(Math.round); });
    t.check(gb.every((x) => Math.abs(x) <= 1) && (await page.evaluate(() => getComputedStyle(document.getElementById('tr-ghost')).objectFit)) === 'contain', 'the frame covers the camera picture exactly, drawn whole', gb);
    // Frame strength (Advanced) sets how strongly it shows; Simple uses the default
    await click(page, '[data-mode="advanced"]');
    await setRange(page, 'tr-strength', 70); await settled(page);
    s = await st(page);
    t.check(near(s.ghostOpacity, 0.7, 0.01) && JSON.parse(await storageGet(page, KEY)).frame === 70, 'Frame strength 70%: the frame shows at 0.7, and it is remembered', s.ghostOpacity);
    await click(page, '[data-mode="simple"]'); await settled(page);
    t.check(near((await st(page)).ghostOpacity, 0.4, 0.01), 'Simple shows the frame at the default 40%', (await st(page)).ghostOpacity);
    // Set frame again takes a new still: told apart by a fingerprint of its pixels (the video and the still drawn at one small
    // size), once the live picture has moved on from the first still (the fake camera's picture changes as time passes)
    await app(page).evaluate(() => {
      window.__fp = (src) => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 180;
        const g = c.getContext('2d'); g.drawImage(src, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2]) % 1000000007;
        return h;
      };
    });
    const p1 = await app(page).evaluate(() => window.__fp(document.getElementById('tr-ghost')));
    await app(page).waitForFunction((p) => window.__fp(document.getElementById('tr-video')) !== p, p1, { timeout: 8000 }).catch(() => null);
    await click(page, '#tr-setFrame');
    const p2 = await app(page).evaluate(() => window.__fp(document.getElementById('tr-ghost')));
    t.check(p1 !== p2 && (await st(page)).ghostShown, 'Set frame again takes a new still (shown, as the frame was on)', { p1, p2 });
    await click(page, '#tr-showFrame'); await settled(page);
    s = await st(page);
    t.check(!s.ghostShown && s.pressed.show === 'false' && !/Frame on/.test(s.status), 'Show frame again hides it', { shown: s.ghostShown, status: s.status });
    // the camera off: the frame controls go off with their reason, the frame is kept in memory for when it is back
    await click(page, '#tr-showFrame'); await click(page, '#tr-camera'); await settled(page);
    s = await st(page);
    t.check(s.off.setFrame === 'tr-whyCamera' && s.off.showFrame === 'tr-whyCamera' && !s.ghostShown && s.frame, 'camera off: Set frame and Show frame off, saying the camera must run; the frame kept', { off: s.off, frame: s.frame });
    await startCamera(page); s = await st(page);
    t.check(s.ghostShown && s.frameShown, 'the camera back on: the frame shows again as it was left', { shown: s.ghostShown });
    // nothing of the camera's picture is stored: the one key holds two numbers
    // (the Simple / Advanced switch pressed above keeps its own key, as it does on every tab)
    const keys = (await storageKeys(page)).filter((k) => k !== 'portrait-value-studio.mode');
    const longest = await page.evaluate(() => Math.max(0, ...Object.keys(localStorage).map((k) => localStorage.getItem(k).length)));
    const dbs = await DBS();
    t.check(keys.join() === KEY && JSON.stringify(Object.keys(JSON.parse(await storageGet(page, KEY)))) === '["transparency","frame"]' && longest < 100 && dbs === dbs0, 'nothing of the camera picture or the frame is stored: the tool\'s one key holds two numbers, and the databases are as they were', { keys, longest, dbs, dbs0 });
    await clean(t, page, 'the frame');
  });

  // ---- Switch camera: offered (in Advanced) only where the browser lists a second camera -----------------------------
  await seg(t, 'switch camera', async (pages) => {
    // a second camera listed beside the fake one; asked for by its id, the fake camera answers for it
    const SECOND = () => {
      const md = navigator.mediaDevices, list = md.enumerateDevices.bind(md), ask = md.getUserMedia.bind(md);
      md.enumerateDevices = () => list().then((all) => (all.some((d) => d.kind === 'videoinput' && d.deviceId) ? all.concat([{ kind: 'videoinput', deviceId: 'second-camera', label: 'Front camera', groupId: 'g2' }]) : all));
      md.getUserMedia = (c) => (c && c.video && c.video.deviceId && c.video.deviceId.exact === 'second-camera' ? ask({ audio: false, video: true }) : ask(c));
    };
    const page = await recorded(site, { url: '#trace', init: SECOND }); pages.push(page);
    let s = await st(page);
    t.check(!s.shown.switch, 'before the camera runs (the browser lists no camera ids yet), no Switch', s.shown);
    await startCamera(page);
    await page.waitForFunction(() => Trace.state.cameras.length === 2, null, { timeout: 5000 }).catch(() => null);
    s = await st(page);
    t.check(!s.shown.switch, 'two cameras listed, Simple: Switch stays out (it is an Advanced control)', s.shown);
    await click(page, '[data-mode="advanced"]'); await settled(page);
    s = await st(page);
    t.check(s.shown.switch && !s.off.switch, 'two cameras listed, Advanced: Switch is offered', { shown: s.shown.switch, off: s.off.switch });
    const before = s.gum;
    await click(page, '#tr-switch');
    const back = await live(page, 10000);
    const asked = await page.evaluate((n) => window.__gum.slice(n).map((x) => JSON.parse(x)), before);
    const ended = await page.evaluate(() => window.__streams.slice(0, -1).every((x) => x.getTracks().every((tr) => tr.readyState === 'ended')));
    t.check(back && asked.length === 1 && asked[0].video.deviceId && asked[0].video.deviceId.exact === 'second-camera' && ended && (await st(page)).wake.held === 1, 'Switch asks for the other camera by its id, the first one stopped, and the picture comes back (the screen still kept awake)', { asked, ended });
    // the camera Switch chose gone (unplugged): the default one is asked for instead, once
    await page.evaluate(() => { Trace.state.deviceId = 'gone-camera'; });
    await click(page, '#tr-camera'); await click(page, '#tr-camera');
    const again = await live(page, 10000);
    const last = await page.evaluate(() => window.__gum.slice(-2).map((x) => JSON.parse(x).video));
    t.check(again && last.length === 2 && last[0].deviceId && last[0].deviceId.exact === 'gone-camera' && last[1].facingMode && last[1].facingMode.ideal === 'environment', 'a chosen camera that has gone: the default camera is asked for instead, and the picture comes back', last);
    page.log.console = page.log.console.filter((m) => !/gone-camera|Requested device not found|OverconstrainedError/.test(m));
    await clean(t, page, 'switch camera');
  });

  // ---- leaving the tab, the page hidden, and coming back -----------------------------------------------------------
  await seg(t, 'leaving and coming back', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await startCamera(page);
    await click(page, '#tr-useStudy');
    await tab(page, 'study');
    let s = await st(page);
    const ended = await page.evaluate(() => window.__streams.every((x) => x.getTracks().every((tr) => tr.readyState === 'ended')));
    t.check(ended && !s.live && s.wake.held === 0 && s.wanted, 'leaving the tab stops every track and releases the wake lock (the camera is to come back)', { ended, live: s.live, wake: s.wake });
    // back, with the permission not granted for good (the fake prompt answers each time): the card asks for a tap
    await tab(page, 'trace'); await sleep(400);
    s = await st(page);
    t.check(!s.live && s.card && s.start && /stopped when you left/.test(s.say) && s.gum === 1 && s.photoShown, 'back, with the permission not kept: no new request; the card says the camera stopped when you left and offers Start camera; the photo is still there', { say: s.say, gum: s.gum });
    t.check(await startCamera(page), 'Start camera goes on from there');
    // the permission granted for the site: back on the tab, the camera starts by itself
    await page.context().grantPermissions(['camera'], { origin: site.base.replace(/\/$/, '') });
    await tab(page, 'help'); await tab(page, 'trace');
    const back = await live(page, 10000);
    s = await st(page);
    t.check(back && s.gum === 3 && !s.card && s.wake.held === 1, 'with the camera allowed for the site, coming back to the tab starts it again without a tap (and keeps the screen awake again)', { back, gum: s.gum, wake: s.wake });
    // the page hidden (another app, the screen locked) and shown again
    const hide = (h) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
    await hide(true); await settled(page);
    s = await st(page);
    const allEnded = await page.evaluate(() => window.__streams.every((x) => x.getTracks().every((tr) => tr.readyState === 'ended')));
    t.check(!s.live && allEnded && s.wake.held === 0, 'the page hidden: the camera stops, the wake lock goes', { live: s.live, allEnded, wake: s.wake });
    await hide(false);
    t.check(await live(page, 10000) && (await st(page)).wake.held === 1, 'the page shown again: the camera is back, the screen kept awake');
    // stopped on purpose: leaving and coming back does not start it
    await click(page, '#tr-camera'); const n = (await st(page)).gum;
    await tab(page, 'study'); await tab(page, 'trace'); await sleep(500);
    s = await st(page);
    t.check(!s.live && s.gum === n && s.card && !/stopped when you left/.test(s.say), 'a camera stopped with Stop camera stays off when the tab is left and opened again', { gum: s.gum, say: s.say });
    // the tab left while the browser is still asking: the answer does not turn the camera on behind the visitor's back
    await page.evaluate(() => { const md = navigator.mediaDevices, orig = md.getUserMedia; md.getUserMedia = (c) => new Promise((res, rej) => setTimeout(() => orig(c).then(res, rej), 700)); });
    await click(page, '#tr-start'); await tab(page, 'study'); await sleep(1200);
    const late = await page.evaluate(() => ({ live: !!Trace.state.stream, open: window.__streams.filter((x) => x.getTracks().some((tr) => tr.readyState === 'live')).length }));
    t.check(!late.live && late.open === 0, 'the tab left while the camera was being asked for: the late answer\'s tracks are stopped at once', late);
    await clean(t, page, 'leaving and coming back');
  });

  // ---- every failure in words ----------------------------------------------------------------------------------------
  await seg(t, 'failures in words', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    for (const [name, re] of [['NotAllowedError', /refused\. Allow the camera for this site in the browser's settings/], ['SecurityError', /refused/], ['NotFoundError', /No camera was found/], ['OverconstrainedError', /No camera was found/], ['NotReadableError', /in use by another app/], ['AbortError', /did not start \(AbortError\)/]]) {
      await page.evaluate((n) => { window.__gumError = n; }, name);
      await click(page, '#tr-start');
      await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('tr-say').textContent), re.source, { timeout: 5000 }).catch(() => null);
      const s = await st(page);
      t.check(re.test(s.say) && !s.live && s.card && s.start && !s.startOff && !s.camOff && s.cam === 'Start camera', `${name}: the card says so in words, and Start camera is there to try again`, s.say);
    }
    await page.evaluate(() => { window.__gumError = ''; });
    t.check(await startCamera(page) && !(await st(page)).card, 'after the failures, the camera starts when it can');
    await clean(t, page, 'failures');
    // no mediaDevices (an old or locked-down browser) and a page that is not a secure context: said at once, no dead button
    for (const [label, init, re] of [
      ['no mediaDevices', () => { Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => undefined }); }, /gives the page no camera.*https/],
      ['not a secure context', () => { Object.defineProperty(window, 'isSecureContext', { configurable: true, get: () => false }); }, /needs this site opened over https/],
    ]) {
      const p = await recorded(site, { url: '#trace', init }); pages.push(p);
      const s = await st(p);
      t.check(re.test(s.say) && !s.start && s.camOff && s.camWhy === 'tr-say' && s.gum === 0, `${label}: the card says why the camera cannot start here, with no Start camera; the strip's camera button is off and points to the reason`, { say: s.say, start: s.start, camOff: s.camOff, why: s.camWhy });
      await click(p, '#tr-camera');
      t.check((await st(p)).gum === 0, `${label}: nothing asks for a camera`);
      await clean(t, p, label);
    }
    // inside another site's frame that does not allow the camera
    const framed = await openPage(site, { url: '#trace', sandbox: { attrs: 'allow-scripts allow-modals' } }); pages.push(framed);
    await app(framed).waitForFunction(() => window.Trace, null, { timeout: 15000 }).catch(() => null);
    const f = await app(framed).evaluate(() => ({ say: document.getElementById('tr-say').textContent, start: !document.getElementById('tr-start').hidden, cam: document.getElementById('tr-camera').disabled }));
    t.check(/inside another site.*tab of its own/.test(f.say) && !f.start && f.cam, 'inside another site\'s frame without allow="camera": the card says to open the site in a tab of its own', f);
    await clean(t, framed, 'framed');
  });

  // ---- the site's Permissions-Policy ----------------------------------------------------------------------------------
  await seg(t, 'the Permissions-Policy', async (pages) => {
    const res = await fetch(site.base);
    const pp = res.headers.get('permissions-policy') || '';
    t.check(/(^|, )camera=\(self\)(,|$)/.test(pp) && /microphone=\(\)/.test(pp), 'the site is served with Permissions-Policy camera=(self), the microphone still off', pp);
    // a copy of the site whose host config says camera=(): the browser refuses the camera, and the page says so
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvs-trace-'));
    let other = null;
    try {
      const skip = new Set(['.git', 'node_modules', 'tests', '.claude', 'docs', '.github']);
      fs.cpSync(site.root, dir, { recursive: true, filter: (src) => !skip.has(path.basename(src)) || path.dirname(src) !== site.root });
      const h = fs.readFileSync(path.join(dir, '_headers'), 'utf8');
      fs.writeFileSync(path.join(dir, '_headers'), h.replace('camera=(self)', 'camera=()'));
      other = await serve(dir);
      const r2 = await fetch(other.base);
      t.check(/(^|, )camera=\(\)/.test(r2.headers.get('permissions-policy') || ''), 'the copy is served with camera=()', r2.headers.get('permissions-policy'));
      const page = await recorded({ ...site, base: other.base }, { url: '#trace' }); pages.push(page);
      const s = await st(page);
      const allowed = await page.evaluate(() => document.featurePolicy ? document.featurePolicy.allowsFeature('camera') : null);
      t.check(allowed === false && /refuse the camera.*Permissions-Policy/.test(s.say) && !s.start && s.camOff && s.gum === 0, 'under camera=() the browser refuses the camera, and the card says the site is set up to refuse it, with no Start camera and nothing asked', { allowed, say: s.say, start: s.start, gum: s.gum });
      // the browser itself refuses a request made anyway (what the page avoids by asking the policy first)
      const forced = await page.evaluate(() => navigator.mediaDevices.getUserMedia({ video: true }).then(() => 'granted', (e) => e.name));
      t.check(forced === 'NotAllowedError', 'a request made anyway under camera=() is refused by the browser (NotAllowedError)', forced);
      page.log.console = page.log.console.filter((m) => !/Permissions policy violation: camera/.test(m)); // the forced request's own message
      await clean(t, page, 'camera=()');
    } finally {
      if (other) await other.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---- from 320 to 1400 px wide, upright and on its side: every control on the screen, nothing spills sideways ------
  await seg(t, 'every size', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await click(page, '[data-mode="advanced"]');
    await startCamera(page); await click(page, '#tr-useStudy');
    for (const vp of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1400, height: 900 }, DESKTOP]) {
      await page.setViewportSize(vp); await sleep(250); await settled(page);
      const r = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight;
        const ctl = [...document.querySelectorAll('#tr-root button, #tr-root input[type=range]')].filter((b) => b.getBoundingClientRect().width > 0 && !b.closest('[hidden]'));
        const off = ctl.filter((b) => { const q = b.getBoundingClientRect(); return q.left < -1 || q.top < -1 || q.right > W + 1 || q.bottom > H + 1; }).map((b) => b.id);
        const st = document.getElementById('tr-stage').getBoundingClientRect(), w = document.getElementById('tr-wrap').getBoundingClientRect();
        return { n: ctl.length, off, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, wrapIn: w.left >= st.left - 1 && w.right <= st.right + 1 && w.top >= st.top - 1 && w.bottom <= st.bottom + 1 && w.width > 100 };
      });
      t.check(r.n >= 11 && !r.off.length && r.sideways <= 0 && r.wrapIn, `${vp.width} × ${vp.height}: every control on the screen, the camera picture inside the stage, no sideways scroll`, r);
    }
    await clean(t, page, 'every size');
  });

  // ---- a phone, upright and on its side: every control on the screen, a pinch, the turn, the safe areas, ← ------------
  await seg(t, 'phones', async (pages) => {
    for (const [label, vp, insets] of [['upright', PHONE, { top: 0, bottom: 34, left: 0, right: 0 }], ['on its side', SIDE, { top: 0, bottom: 21, left: 47, right: 47 }]]) {
      const context = await site.browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      page.log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
      page.on('pageerror', (e) => page.log.pageerrors.push(String(e.message).slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error') page.log.console.push(m.text().slice(0, 300)); });
      page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) page.log.offsite.push(u); });
      await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${e.blockedURI}`); }); });
      await page.addInitScript(RECORD);
      pages.push(page);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      await page.goto(site.base + '#trace', { waitUntil: 'load' });
      await page.waitForFunction(() => window.Trace && Studio.result(), null, { timeout: 30000 }).catch(() => null);
      const rootBox = await page.evaluate(() => { const r = document.getElementById('tr-root').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
      t.check(rootBox[0] === 0 && rootBox[1] === 0 && rootBox[2] === vp.width && rootBox[3] === vp.height, `${label}: the tool fills the screen`, rootBox);
      t.check(!(await inBands(page, insets)).length, `${label}, the card up: every control on the screen and clear of the notch, the corners and the home indicator`, await inBands(page, insets));
      // the camera, a photo, Advanced (the most controls)
      await page.touchscreen.tap(...(await page.evaluate(() => { const r = document.getElementById('tr-start').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
      t.check(await live(page), `${label}: a finger on Start camera starts it`);
      await click(page, '#tr-useStudy');
      await click(page, '[data-mode="advanced"]'); // (the switch steps aside with the header on a phone: pressed from the page)
      await settled(page);
      const lay = await boxes(page);
      const upright = vp.height > vp.width;
      t.check(upright ? lay.strip.y >= lay.stage.b - 1 && near(lay.strip.w, vp.width, 1) : lay.strip.r <= lay.stage.x + 1 && near(lay.strip.h, vp.height, 1), `${label}: the strip runs ${upright ? 'along the bottom' : 'down the side'}, the camera picture beside it`, { strip: lay.strip, stage: lay.stage });
      const bands = await inBands(page, insets);
      t.check(!bands.length, `${label}, the camera on, a photo, Advanced: every control on the screen and clear of the notch, the corners and the home indicator`, bands);
      const sizes = await page.evaluate(() => [...document.querySelectorAll('#tr-strip button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => { const r = b.getBoundingClientRect(); return [b.id, Math.round(r.width), Math.round(r.height)]; }));
      t.check(sizes.length >= 9 && sizes.every(([, w, h]) => w >= 32 && h >= 44), `${label}: every button of the strip is a finger's size (at least 32 × 44)`, sizes);
      await screenshot(page, `trace-phone-${label.replace(/ /g, '-')}`);
      // a two-finger pinch: twice the distance, twice the size, the spot between the fingers kept
      const H = await page.evaluate(() => { const r = document.getElementById('tr-wrap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const p0 = await boxes(page), s0 = await st(page);
      const a = [H.x - 30, H.y + 10], b = [H.x + 30, H.y + 10];
      await touch(cdp, 'touchStart', [a, b]);
      for (let i = 1; i <= 6; i++) { const k = 30 + (30 * i) / 6; await touch(cdp, 'touchMove', [[H.x - k, H.y + 10], [H.x + k, H.y + 10]]); }
      await touch(cdp, 'touchEnd', []);
      await settled(page);
      const p1 = await boxes(page), s1 = await st(page);
      // the photo's point that was under the fingers' midpoint is under it still
      const under = (bx, x, y) => [(x - bx.photo.x) / bx.photo.w, (y - bx.photo.y) / bx.photo.h];
      const u0 = under(p0, H.x, H.y + 10), u1 = under(p1, H.x, H.y + 10);
      t.check(near(p1.pw / p0.pw, 2, 0.08) && near(s1.pct / s0.pct, 2, 0.08) && near(u0[0], u1[0], 0.02) && near(u0[1], u1[1], 0.02), `${label}: a two-finger pinch out to twice the distance doubles the photo, the spot between the fingers staying put`, { ratio: +(p1.pw / p0.pw).toFixed(3), pct: [s0.pct, s1.pct], u0, u1 });
      // one finger moves it
      await touch(cdp, 'touchStart', [[H.x, H.y]]);
      for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [[H.x + 8 * i, H.y + 6 * i]]);
      await touch(cdp, 'touchEnd', []);
      const p2 = await boxes(page);
      t.check(near((p2.cx - p1.cx) * p2.wrap.w, 40, 2) && near((p2.cy - p1.cy) * p2.wrap.h, 30, 2), `${label}: one finger drags it`, { dx: (p2.cx - p1.cx) * p2.wrap.w, dy: (p2.cy - p1.cy) * p2.wrap.h });
      // locked: a pinch and a drag leave it
      await click(page, '#tr-lock');
      await touch(cdp, 'touchStart', [a, b]);
      for (let i = 1; i <= 4; i++) await touch(cdp, 'touchMove', [[a[0] - 10 * i, a[1]], [b[0] + 10 * i, b[1]]]);
      await touch(cdp, 'touchEnd', []);
      await touch(cdp, 'touchStart', [[H.x, H.y]]); await touch(cdp, 'touchMove', [[H.x - 50, H.y]]); await touch(cdp, 'touchEnd', []);
      const p3 = await boxes(page);
      t.check(near(p3.pw, p2.pw, 0.001) && near(p3.cx, p2.cx, 0.001) && near(p3.cy, p2.cy, 0.001), `${label}: locked, a pinch and a drag leave it where it is`, { before: [p2.cx, p2.pw], after: [p3.cx, p3.pw] });
      await click(page, '#tr-lock');
      // the phone turned: the photo keeps its place over the camera picture
      const other = upright ? SIDE : PHONE;
      await page.setViewportSize(other); await sleep(400); await settled(page);
      const p4 = await boxes(page);
      t.check(near(p4.cx, p3.cx, 0.01) && near(p4.cy, p3.cy, 0.01) && near(p4.pw, p3.pw, 0.01) && (await st(page)).live, `${label}, turned: the photo keeps its place and size over the camera picture, the camera runs on`, { before: [p3.cx, p3.cy, p3.pw], after: [p4.cx, p4.cy, p4.pw] });
      await page.setViewportSize(vp); await sleep(300);
      // ← leads back, with the focus on the section's button, and the camera goes off
      await page.focus('#tr-exit'); await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.getElementById('tab-study').hidden, null, { timeout: 5000 }).catch(() => null);
      const out = await page.evaluate(() => ({ shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), focus: document.activeElement && document.activeElement.id, tabs: getComputedStyle(document.querySelector('.tabs')).display, live: !!Trace.state.stream }));
      t.check(out.shown.join() === 'tab-study' && out.focus === 'tabLearnBtn' && out.tabs !== 'none' && !out.live, `${label}: ← leads back to Study the photo, the focus on Learning tools, the camera off`, out);
      await clean(t, page, `phone ${label}`);
    }
  });

  // ---- edge cases: the tool pushed the way hands, phones and files push it (the playtester's block, at the end of this file) ----
  await edgeCases(t, site);
  // ---- what the reviews of the build found, each pinned (the end of this file) ----------------------------------------------
  await reviewFixes(t, site);
}

// =====================================================================================================================
// Edge cases (the playtester's block). Each block is one `seg` and every page it opens closes with it. A finding is written
// only when its probe, run twice on fresh pages, shows the same defect both times (`twice`); a check on the same point
// fails with it, so a fix turns both green.
// =====================================================================================================================

// a grayscale PNG built here, so no canvas limit is in the way: 6000 x 4000, 16 x 30000 and the like
const CRC_TABLE = (() => { const tb = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
function grayPng(w, h, name = `gray-${w}x${h}.png`) {
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; // 8 bits a pixel, grayscale
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) { const o = y * (w + 1), row = ((y * 55) / h) | 0; for (let x = 0; x < w; x++) raw[o + 1 + x] = row + (((x * 200) / w) | 0); }
  return { name, mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', head), pngChunk('IDAT', zlib.deflateSync(raw, { level: 1 })), pngChunk('IEND', Buffer.alloc(0))]) };
}

// a probe is run on two fresh pages; it returns { bad, m } (the defect showed, and what was measured)
async function twice(probe) { const a = await probe(), b = await probe(); return { a, b, both: !!(a.bad && b.bad), m: { run1: a.m, run2: b.m } }; }

const INTRO_RE = /camera picture stays on this device/;
const SECOND_CAMERA = () => {
  const md = navigator.mediaDevices, list = md.enumerateDevices.bind(md), ask = md.getUserMedia.bind(md);
  md.enumerateDevices = () => list().then((all) => (!window.__noSecond && all.some((d) => d.kind === 'videoinput' && d.deviceId) ? all.concat([{ kind: 'videoinput', deviceId: 'second-camera', label: 'Front camera', groupId: 'g2' }]) : all));
  md.getUserMedia = (c) => (c && c.video && c.video.deviceId && c.video.deviceId.exact === 'second-camera' ? ask({ audio: false, video: true }) : ask(c));
};
// every stream's tracks, the wake lock's books, and how often the browser was asked
const tracks = (page) => app(page).evaluate(() => { const all = window.__streams.flatMap((s) => s.getTracks()); return { gum: window.__gum.length, streams: window.__streams.length, live: all.filter((x) => x.readyState === 'live').length, held: window.__wake.held, requests: window.__wake.requests, releases: window.__wake.releases }; });
// the browser slow to answer (the visitor reading its question), counted when asked
const slowCamera = (page, ms) => app(page).evaluate((ms) => { const md = navigator.mediaDevices, prev = md.getUserMedia.bind(md); window.__asked = 0; md.getUserMedia = (c) => { window.__asked++; return new Promise((res, rej) => setTimeout(() => prev(c).then(res, rej), ms)); }; }, ms);
// a wake lock granted only after a while
const slowWake = (page, ms) => app(page).evaluate((ms) => { navigator.wakeLock.request = () => new Promise((res) => setTimeout(() => { const l = new EventTarget(); l.released = false; window.__wake.requests++; window.__wake.held++; l.release = () => { if (!l.released) { l.released = true; window.__wake.held--; window.__wake.releases++; l.dispatchEvent(new Event('release')); } return Promise.resolve(); }; res(l); }, ms)); }, ms);
const hideDoc = (page, h) => app(page).evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
// what the browser says of the camera permission: 'granted', 'denied', 'prompt', or 'throws' (Safari's answer to an unknown name)
const permission = (page, how) => app(page).evaluate((how) => { const p = navigator.permissions, orig = p.query.bind(p); p.query = (d) => (d && d.name === 'camera' ? (how === 'throws' ? Promise.reject(new TypeError('camera is not a valid permission')) : Promise.resolve({ state: how, addEventListener() {}, removeEventListener() {} })) : orig(d)); }, how);
const flipTabs = (page, n) => app(page).evaluate((n) => { const go = (x) => document.querySelector(`[data-tab="${x}"]`).click(); for (let i = 0; i < n; i++) { go('study'); go('trace'); } }, n);
const allowCamera = (page, site) => page.context().grantPermissions(['camera'], { origin: site.base.replace(/\/$/, '') });
// a chosen file: waits for the photo to be over the camera, or for the app's words (file names are unique, so an old photo is not mistaken for the new)
async function chosen(page, file, timeout = 30000) {
  const t0 = Date.now();
  await choose(page, file);
  await app(page).waitForFunction((n) => (window.Trace.state.photo && Trace.state.photo.name === n) || /not an image|too small|cannot be read|could not be opened|empty file|no usable size|folder/.test(document.getElementById('toast').textContent), file.name, { timeout }).catch(() => null);
  const ms = Date.now() - t0; await settled(page); return ms;
}
// a phone with a touch screen: its own context, the page's record kept as the others' are, and a CDP session for real fingers
async function touchPage(site, vp = PHONE, url = '#trace') {
  const context = await site.browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  page.on('pageerror', (e) => page.log.pageerrors.push(String(e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') page.log.console.push(m.text().slice(0, 300)); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) page.log.offsite.push(u); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${e.blockedURI}`); }); });
  await page.addInitScript(RECORD);
  page.cdp = await context.newCDPSession(page);
  await page.goto(site.base + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Trace && Studio.result(), null, { timeout: 30000 }).catch(() => null);
  return page;
}
// one finger of a set the test makes itself (a trusted set only comes whole from CDP): the page's handlers read nothing but the pointer's id, kind and place
const finger = (page, type, id, x, y) => app(page).evaluate(([type, id, x, y]) => document.getElementById('tr-hit').dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true })), [type, id, x, y]);
const centre = (page, id = 'tr-wrap') => app(page).evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; }, id);
// two fingers about a point, spread from `from` px either side to `to`; one finger dragged by (dx, dy)
async function pinchBy(page, c, from, to, steps = 8) {
  await touch(page.cdp, 'touchStart', [[c.x - from, c.y], [c.x + from, c.y]]);
  for (let i = 1; i <= steps; i++) { const k = from + ((to - from) * i) / steps; await touch(page.cdp, 'touchMove', [[c.x - k, c.y], [c.x + k, c.y]]); }
  await touch(page.cdp, 'touchEnd', []); await settled(page);
}
async function dragBy(page, c, dx, dy, steps = 6) {
  await touch(page.cdp, 'touchStart', [[c.x, c.y]]);
  for (let i = 1; i <= steps; i++) await touch(page.cdp, 'touchMove', [[c.x + (dx * i) / steps, c.y + (dy * i) / steps]]);
  await touch(page.cdp, 'touchEnd', []); await settled(page);
}
const overlap = (b) => Math.max(0, Math.min(b.photo.r, b.wrap.r) - Math.max(b.photo.x, b.wrap.x)) * Math.max(0, Math.min(b.photo.b, b.wrap.b) - Math.max(b.photo.y, b.wrap.y));
const fitsPicture = (b) => b.photo.x >= b.wrap.x - 1 && b.photo.r <= b.wrap.r + 1 && b.photo.y >= b.wrap.y - 1 && b.photo.b <= b.wrap.b + 1;

async function edgeCases(t, site) {
  // ---- Start pressed twice fast, Stop while starting: the camera asked once, stopped when stopped ----------------------
  await seg(t, 'edge: Start and Stop raced', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await app(page).evaluate(() => { const b = document.getElementById('tr-start'); b.click(); b.click(); b.click(); });
    const on = await live(page); await sleep(400);
    let k = await tracks(page), s = await st(page);
    t.check(on && k.gum === 1 && k.streams === 1 && k.live === 1 && k.requests === 1 && k.held === 1, 'Start camera pressed three times in one breath asks the browser once: one stream, one live track, one wake lock', k);
    // a real double click (two mouse clicks), the camera stopped before
    await click(page, '#tr-camera'); await settled(page);
    const g0 = (await tracks(page)).gum;
    await page.dblclick('#tr-start');
    const on2 = await live(page); await sleep(300);
    k = await tracks(page);
    t.check(on2 && k.gum - g0 === 1 && k.live === 1 && k.held === 1, 'a real double click on Start camera asks once (the button is off, "Starting…", while the browser is asked)', { asked: k.gum - g0, live: k.live, held: k.held });
    // the strip's Camera pressed twice with the browser slow to answer: start, then stop while it is asked
    await click(page, '#tr-camera'); await settled(page);
    await slowCamera(page, 700);
    await app(page).evaluate(() => { const b = document.getElementById('tr-camera'); b.click(); b.click(); });
    await sleep(1700);
    k = await tracks(page); s = await st(page);
    const asked = await app(page).evaluate(() => window.__asked);
    t.check(!s.live && !s.starting && !s.wanted && s.card && s.start && !s.startOff && INTRO_RE.test(s.say) && k.live === 0 && k.held === 0 && asked === 1, 'Camera pressed twice while the browser is slow (start, then stop): the camera ends off, the late answer\'s tracks are stopped, the card says its introduction and offers Start camera', { live: s.live, wanted: s.wanted, say: s.say.slice(0, 50), k, asked });
    // Stop while starting: the card says it is starting, then is back to its introduction
    await click(page, '#tr-start'); await sleep(150);
    s = await st(page);
    t.check(s.starting && s.startOff && s.cam === 'Stop camera' && /Starting the camera/.test(s.say), 'while the browser is asked: the card says the camera is starting, Start camera is off, the strip\'s button reads Stop camera', { starting: s.starting, startOff: s.startOff, cam: s.cam, say: s.say.slice(0, 50) });
    await click(page, '#tr-camera'); await sleep(1500);
    s = await st(page); k = await tracks(page);
    t.check(!s.live && !s.src && !s.starting && !s.wanted && s.card && s.start && !s.startOff && INTRO_RE.test(s.say) && k.live === 0 && k.held === 0, 'Stop while starting: the card is back to its introduction with Start camera, the video has no source, the late answer\'s tracks are stopped, nothing is held', { live: s.live, src: s.src, say: s.say.slice(0, 50), k });
    // Start, Stop and Start again while the first answer is pending: the second request's camera is the one that runs
    const a0 = await app(page).evaluate(() => window.__asked);
    await click(page, '#tr-start'); await sleep(100); await click(page, '#tr-camera'); await click(page, '#tr-camera');
    await sleep(2300);
    s = await st(page); k = await tracks(page);
    const newest = await app(page).evaluate(() => Trace.state.stream === window.__streams[window.__streams.length - 1]);
    const a1 = await app(page).evaluate(() => window.__asked);
    t.check(s.live && s.src && k.live === 1 && k.held === 1 && newest && a1 - a0 === 2, 'Start, Stop, Start again while the first answer is still pending: one camera runs (the second request\'s), the first request\'s tracks are stopped, one wake lock', { live: s.live, k, newest, asked: a1 - a0 });
    // a refusal that comes after Stop is not put on the card (the visitor had stopped it)
    await click(page, '#tr-camera'); await settled(page);
    await app(page).evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise((_, rej) => setTimeout(() => rej(new DOMException('made to fail', 'NotAllowedError')), 600)); });
    await click(page, '#tr-start'); await sleep(100); await click(page, '#tr-camera'); await sleep(1200);
    s = await st(page);
    t.check(!/refused/.test(s.say) && INTRO_RE.test(s.say) && s.start && !s.live, 'a refusal that arrives after Stop is not put on the card: it says its introduction', s.say);
    await clean(t, page, 'start and stop raced');

    // ten starts and stops, the wake lock slow to be granted: it ends held when the camera runs and released when it does not
    const p2 = await recorded(site, { url: '#trace' }); pages.push(p2);
    await slowWake(p2, 120);
    for (const ms of [0, 40, 90, 150, 10, 200, 60, 120, 30, 80]) { await click(p2, '#tr-camera'); await sleep(ms + 60); await click(p2, '#tr-camera'); await sleep(30); }
    await sleep(1500);
    k = await tracks(p2);
    t.check(k.live === 0 && k.held === 0 && k.requests === k.releases && !(await st(p2)).live, 'ten quick starts and stops with a slow wake lock: nothing runs and no wake lock is left held (every lock granted was released)', k);
    t.check(await startCamera(p2), 'and the camera starts again after them');
    await sleep(700); k = await tracks(p2);
    t.check(k.live === 1 && k.held === 1 && k.requests === k.releases + 1, 'with the camera on again: one wake lock held, the others all released', k);
    await clean(t, p2, 'ten starts and stops');
  });

  // ---- Switch camera: with one camera, with two, raced; the frame of the camera switched away from ------------------------
  await seg(t, 'edge: Switch camera', async (pages) => {
    const one = await recorded(site, { url: '#trace' }); pages.push(one);
    await click(one, '[data-mode="advanced"]');
    await startCamera(one); await sleep(500);
    const sw = await app(one).evaluate(() => { const b = document.getElementById('tr-switch'), id = Trace.state.stream.id, n = window.__gum.length; b.click(); return { hidden: b.hidden, width: b.getBoundingClientRect().width, cams: Trace.state.cameras.length, asked: window.__gum.length - n, same: !!Trace.state.stream && Trace.state.stream.id === id }; });
    await sleep(600);
    let s = await st(one), k = await tracks(one);
    t.check(sw.hidden && sw.width === 0 && sw.cams === 1 && sw.asked === 0 && sw.same && s.live && k.live === 1, 'Advanced with one camera: Switch is not offered (hidden, no box); pressing it anyway asks for nothing and leaves the same camera running', { ...sw, live: s.live, k });
    await clean(t, one, 'switch with one camera');
    // a browser that will not list its cameras
    const none = await recorded(site, { url: '#trace', init: () => { navigator.mediaDevices.enumerateDevices = () => Promise.reject(new DOMException('no', 'NotAllowedError')); } }); pages.push(none);
    await click(none, '[data-mode="advanced"]');
    t.check(await startCamera(none), 'a browser that refuses to list the cameras: the camera starts all the same');
    await sleep(400);
    s = await st(none);
    t.check(!s.shown.switch && (await app(none).evaluate(() => Trace.state.cameras.length)) === 0, 'and Switch is not offered', s.shown);
    await clean(t, none, 'cameras not listed');
    // two cameras: Switch pressed twice in one breath, and with the camera off
    const two = await recorded(site, { url: '#trace', init: SECOND_CAMERA }); pages.push(two);
    await click(two, '[data-mode="advanced"]'); await startCamera(two);
    await two.waitForFunction(() => Trace.state.cameras.length === 2, null, { timeout: 5000 }).catch(() => null);
    const g0 = (await tracks(two)).gum;
    await app(two).evaluate(() => { const b = document.getElementById('tr-switch'); b.click(); b.click(); });
    const back = await live(two, 10000); await sleep(500);
    k = await tracks(two);
    const olderEnded = await app(two).evaluate(() => window.__streams.slice(0, -1).every((x) => x.getTracks().every((tr) => tr.readyState === 'ended')));
    t.check(back && k.gum - g0 === 1 && k.live === 1 && k.held === 1 && olderEnded, 'Switch pressed twice in one breath: one new request, one camera running, the old one stopped, one wake lock', { asked: k.gum - g0, k, olderEnded });
    // a camera unplugged and plugged in again while the camera runs (devicechange): Switch goes and comes back, the camera runs on
    await app(two).evaluate(() => { window.__noSecond = true; navigator.mediaDevices.dispatchEvent(new Event('devicechange')); });
    await sleep(300);
    s = await st(two);
    const gone = !s.shown.switch && s.live;
    await app(two).evaluate(() => { window.__noSecond = false; navigator.mediaDevices.dispatchEvent(new Event('devicechange')); });
    await sleep(300);
    s = await st(two);
    t.check(gone && s.shown.switch && s.live, 'the second camera unplugged while the camera runs (devicechange): Switch goes, the camera runs on; plugged in again, Switch is back', { gone, back: s.shown.switch, live: s.live });
    await click(two, '#tr-camera'); await settled(two);
    s = await st(two); const g1 = (await tracks(two)).gum;
    await click(two, '#tr-switch'); await sleep(300);
    t.check(s.shown.switch && s.off.switch === 'tr-whyCamera' && (await tracks(two)).gum === g1 && !(await st(two)).live, 'with the camera off, Switch is off with its reason, and pressing it anyway starts nothing', { shown: s.shown.switch, off: s.off.switch });
    await clean(t, two, 'switch with two cameras');
    // the frame kept from one camera is not laid over the other camera's picture
    const probe = async () => {
      const p = await recorded(site, { url: '#trace', init: SECOND_CAMERA }); pages.push(p);
      await click(p, '[data-mode="advanced"]'); await startCamera(p);
      await p.waitForFunction(() => Trace.state.cameras.length === 2, null, { timeout: 5000 }).catch(() => null);
      await click(p, '#tr-setFrame'); await click(p, '#tr-showFrame');
      const before = await st(p);
      await click(p, '#tr-switch'); await live(p, 10000); await sleep(400);
      const after = await st(p);
      return { bad: after.frame && after.ghostShown, m: { before: { frame: before.frame, shown: before.ghostShown }, after: { frame: after.frame, frameShown: after.frameShown, ghostShown: after.ghostShown, showFrameOff: after.off.showFrame, status: after.status } } };
    };
    const r = await twice(probe);
    t.check(!r.both, 'after Switch the first camera\'s frame is not left over the second camera\'s picture (dropped, or the visitor is asked to set it again)', r.m);
    if (r.both) t.finding({ title: 'Switch camera keeps the frame of the camera that was switched away from, still shown over the other camera\'s picture', severity: 'low', steps: 'Open #trace on a device with two cameras, in Advanced. Start camera, Set frame, Show frame (the still shows over the live picture). Press Switch.', expected: 'README, Trace onto paper: Set frame keeps the camera\'s picture of that moment, the paper as it was lined up, and Show frame lays that still over the live picture so the phone can be moved until the paper\'s edges line up with it. After Switch the picture is another camera\'s, so no movement of the phone can line the old still up with it: the still should be dropped (Set frame / Show frame off until a new one is set), or the visitor told to set it again.', actual: `After Switch the old still is still set and shown: ${JSON.stringify(r.m)}`, cause: 'js/trace.js 168-177, switchCamera() changes state.deviceId and restarts the stream but never touches state.frame / state.frameShown (js/trace.js 55-70); render() then keeps ghost.hidden false (js/trace.js 481).' });
  });

  // ---- leaving for another tab and back: the camera's tracks end, then it is resumed; what was set up stays -----------------
  await seg(t, 'edge: leaving and coming back', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await allowCamera(page, site);
    await startCamera(page); await click(page, '#tr-useStudy');
    await setRange(page, 'tr-size', 150);
    const H = await centre(page, 'tr-hit');
    await page.mouse.move(H.x, H.y); await page.mouse.down(); await page.mouse.move(H.x + 70, H.y - 25, { steps: 4 }); await page.mouse.up();
    const selected = await app(page).evaluate(() => String(getSelection()));
    await click(page, '#tr-lock'); await click(page, '#tr-setFrame'); await click(page, '#tr-showFrame'); await settled(page);
    const set = await st(page), still = await page.evaluate(() => document.getElementById('tr-ghost').toDataURL().length);
    let k = await tracks(page); const g0 = k.gum;
    await flipTabs(page, 6);
    await live(page, 10000); await sleep(800);
    k = await tracks(page); let s = await st(page);
    t.check(s.live && k.gum - g0 === 1 && k.live === 1 && k.held === 1, 'the tab left and opened six times in a breath, the camera allowed: one new request, one camera running, one wake lock', { asked: k.gum - g0, k });
    const still2 = await page.evaluate(() => document.getElementById('tr-ghost').toDataURL().length);
    t.check(JSON.stringify(s.place) === JSON.stringify(set.place) && s.photo && s.photo.name === set.photo.name && s.locked && s.frame && s.frameShown && s.ghostShown && still2 === still, 'what was set up stays: the photo, its place and size, Lock, the frame (the same still) and Show frame', { place: s.place, was: set.place, locked: s.locked, frame: s.frame, shown: s.ghostShown, still: [still, still2] });
    // the tab left while the browser is still being asked, and opened again at once (the camera allowed): the second request's camera runs, the first's tracks end
    await click(page, '#tr-camera'); await settled(page);
    await slowCamera(page, 700);
    await click(page, '#tr-camera'); await sleep(100);
    await app(page).evaluate(() => { document.querySelector('[data-tab="study"]').click(); });
    await sleep(100);
    await app(page).evaluate(() => { document.querySelector('[data-tab="trace"]').click(); });
    await sleep(2300);
    k = await tracks(page); s = await st(page);
    const asked = await app(page).evaluate(() => window.__asked);
    t.check(s.live && k.live === 1 && k.held === 1 && asked === 2, 'the tab left and opened again while the browser was still being asked: one camera runs (the request made on return), the first request\'s tracks are stopped', { live: s.live, k, asked });
    // a drag and a double click on the photo select no text of the page
    await page.dblclick('#tr-hit'); await page.mouse.move(H.x, H.y); await page.mouse.down(); await page.mouse.move(H.x - 300, H.y + 200, { steps: 4 }); await page.mouse.up();
    const selected2 = await app(page).evaluate(() => String(getSelection()));
    t.check(selected === '' && selected2 === '', 'dragging the photo and double-clicking it select no text of the page', { selected, selected2 });
    // the permission taken back while away: the card asks for a tap, nothing is requested
    await permission(page, 'denied');
    await tab(page, 'study'); await tab(page, 'trace'); await sleep(500);
    s = await st(page);
    t.check(!s.live && s.card && s.start && /stopped when you left/.test(s.say), 'the camera permission gone while away (the browser says denied): back on the tab the card says the camera stopped and offers Start camera', { live: s.live, say: s.say.slice(0, 60) });
    // a browser that cannot answer the question (Safari throws for the name 'camera')
    await startCamera(page);
    const g2 = (await tracks(page)).gum;
    await permission(page, 'throws');
    await tab(page, 'study'); await tab(page, 'trace'); await sleep(500);
    s = await st(page);
    t.check(!s.live && s.card && s.start && (await tracks(page)).gum === g2, 'a browser whose permission query throws: back on the tab the card offers Start camera, nothing is requested behind the visitor\'s back', { live: s.live, start: s.start });
    await clean(t, page, 'leaving and coming back');
  });

  // ---- the page hidden and shown (visibilitychange, pagehide) -----------------------------------------------------------
  await seg(t, 'edge: page hidden and shown', async (pages) => {
    // the permission not kept (the browser asks each time): shown again, the card asks for a tap
    const a = await recorded(site, { url: '#trace' }); pages.push(a);
    await startCamera(a); await click(a, '#tr-useStudy');
    await hideDoc(a, true); await settled(a);
    let k = await tracks(a), s = await st(a);
    t.check(!s.live && k.live === 0 && k.held === 0 && s.wanted, 'the page hidden: every track ends, the wake lock goes, the camera is still wanted', { live: s.live, k });
    await hideDoc(a, false); await sleep(500);
    s = await st(a); const g1 = (await tracks(a)).gum;
    t.check(!s.live && s.card && s.start && /stopped when you left/.test(s.say) && s.photoShown && g1 === 1, 'shown again with the permission not kept: the card says the camera stopped and offers Start camera, no request is made, the photo stays', { say: s.say.slice(0, 60), gum: g1 });
    t.check(await startCamera(a), 'Start camera goes on from there');
    // the page hidden and shown twice over: asked once
    await hideDoc(a, true); await hideDoc(a, true); await hideDoc(a, false); await hideDoc(a, false); await sleep(400);
    t.check(!(await st(a)).live && (await tracks(a)).live === 0, 'hidden twice and shown twice with the permission not kept: the camera stays off, the card asks');
    // a synthetic pagehide (a page going into the back/forward cache): the tracks end and the card offers Start camera
    await click(a, '#tr-start'); await live(a);
    await app(a).evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))); await settled(a);
    s = await st(a); k = await tracks(a);
    t.check(!s.live && k.live === 0 && k.held === 0 && s.card && s.start, 'pagehide: every track ends and the card offers Start camera', { live: s.live, k });
    await clean(t, a, 'page hidden, permission not kept');

    // the permission kept (granted for the site)
    const b = await recorded(site, { url: '#trace' }); pages.push(b);
    await allowCamera(b, site);
    await startCamera(b);
    // hidden while the browser is being asked: the late answer's tracks end; shown again, the camera comes back, once
    await click(b, '#tr-camera'); await settled(b);
    await slowCamera(b, 600);
    await click(b, '#tr-start'); await sleep(100); await hideDoc(b, true); await sleep(1100);
    k = await tracks(b); s = await st(b);
    t.check(!s.live && k.live === 0 && k.held === 0, 'the page hidden while the browser was being asked: the late answer\'s tracks are stopped at once', { live: s.live, k });
    await hideDoc(b, false);
    const back = await live(b, 10000); await sleep(400);
    k = await tracks(b);
    const asked = await app(b).evaluate(() => window.__asked);
    t.check(back && k.live === 1 && k.held === 1 && asked === 2, 'shown again (the camera allowed): it comes back by itself, one camera, one wake lock', { back, k, asked });
    // hidden twice, shown twice: one request, not two
    await hideDoc(b, true); await hideDoc(b, true); await sleep(200);
    const a1 = await app(b).evaluate(() => window.__asked);
    await hideDoc(b, false); await hideDoc(b, false);
    await live(b, 10000); await sleep(800);
    k = await tracks(b);
    const a2 = await app(b).evaluate(() => window.__asked);
    t.check(k.live === 1 && k.held === 1 && a2 - a1 === 1, 'hidden twice and shown twice (the camera allowed): one request on the way back, one camera, one wake lock', { asked: a2 - a1, k });
    // the wake lock slow to be granted and the page hidden at once: it is let go when it arrives
    await click(b, '#tr-camera'); await settled(b);
    await slowWake(b, 800);
    await click(b, '#tr-camera'); await live(b, 10000);
    await hideDoc(b, true); await sleep(1400);
    k = await tracks(b);
    t.check(k.live === 0 && k.held === 0, 'the page hidden before the slow wake lock is granted: the lock is released when it arrives, none is left held', k);
    await hideDoc(b, false); await live(b, 10000); await sleep(1600);
    t.check((await tracks(b)).held === 1, 'and shown again: the screen is kept awake again');
    // hidden and shown while another tab is open: the camera does not start
    await tab(b, 'study'); const g3 = (await tracks(b)).gum;
    await hideDoc(b, true); await hideDoc(b, false); await sleep(600);
    k = await tracks(b);
    t.check(k.gum === g3 && k.live === 0 && !(await st(b)).live, 'the page hidden and shown while another tab is open: the camera stays off, nothing is requested', { gum: [g3, k.gum], live: k.live });
    await clean(t, b, 'page hidden, permission kept');
  });

  // ---- Set frame before any frame and right after Start; Show frame with none set; the picture changing shape ---------------
  await seg(t, 'edge: Set frame and Show frame', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    const ghostSize = () => app(page).evaluate(() => { const g = document.getElementById('tr-ghost'); return `${g.width}x${g.height}`; });
    const g0 = await ghostSize();
    // before the camera: both off with their reason; pressed anyway, nothing happens
    await app(page).evaluate(() => { document.getElementById('tr-setFrame').click(); document.getElementById('tr-showFrame').click(); });
    let s = await st(page);
    t.check(s.off.setFrame === 'tr-whyCamera' && s.off.showFrame === 'tr-whyCamera' && !s.frame && !s.frameShown && !s.ghostShown && (await ghostSize()) === g0 && s.pressed.show === 'false' && !/Frame set/.test((await text(page, '#toast')) || ''), 'before the camera: Set frame and Show frame are off, each with its reason; pressed anyway they keep nothing and show nothing', { off: s.off, frame: s.frame, ghost: [g0, await ghostSize()] });
    // the camera on and no frame set: Show frame is off with its reason
    await startCamera(page);
    await app(page).evaluate(() => { document.getElementById('tr-showFrame').click(); });
    s = await st(page);
    t.check(!s.off.setFrame && s.off.showFrame === 'tr-whyFrame' && !s.frameShown && !s.ghostShown && s.pressed.show === 'false' && !/Frame on/.test(s.status), 'camera on, no frame set: Set frame is on, Show frame is off with its reason; pressed anyway it shows nothing and the status line does not say Frame on', { off: s.off, status: s.status });
    // a frame set, the page hidden and shown: kept, and shown again as left, not taken again
    await allowCamera(page, site);
    await click(page, '#tr-setFrame'); await click(page, '#tr-showFrame');
    const still = await app(page).evaluate(() => document.getElementById('tr-ghost').toDataURL().length);
    await hideDoc(page, true); await settled(page);
    s = await st(page);
    t.check(!s.live && !s.ghostShown && s.frame && s.off.setFrame === 'tr-whyCamera' && s.off.showFrame === 'tr-whyCamera', 'the page hidden: the camera is off, so the frame is not shown and both frame buttons say the camera must run; the frame is kept', { live: s.live, shown: s.ghostShown, off: s.off });
    await hideDoc(page, false); await live(page, 10000); await sleep(400);
    s = await st(page);
    const still2 = await app(page).evaluate(() => document.getElementById('tr-ghost').toDataURL().length);
    t.check(s.live && s.frame && s.frameShown && s.ghostShown && still2 === still, 'shown again: the camera is back and the same frame shows as it was left (it is not taken again)', { still, still2 });
    await clean(t, page, 'frame before and after');

    // Set frame at the first instant its button is on (the picture's metadata has just come): a still with a picture in it
    const early = await recorded(site, { url: '#trace' }); pages.push(early);
    await app(early).evaluate(() => { const v = document.getElementById('tr-video'); v.addEventListener('loadedmetadata', () => { const b = document.getElementById('tr-setFrame'); window.__early = { off: b.disabled, ready: v.readyState, w: v.videoWidth }; if (!b.disabled) b.click(); }, { once: true }); });
    await startCamera(early); await sleep(400);
    const e = await app(early).evaluate(() => window.__early), g = await picture(early, 'tr-ghost');
    t.check(e && (e.off || (g.spread > 40 && g.opaque > 0.95)), 'Set frame pressed in the very handler where the picture\'s size arrives keeps a real still (or the button was still off then): never a blank one', { early: e, ghost: g });
    await clean(t, early, 'frame at the first instant');

    // the camera's picture changes shape under a frame (a phone turned on Android gives a new size; here 16:9 becomes 4:3)
    const probe = async () => {
      const p = await recorded(site, { url: '#trace' }); pages.push(p);
      await startCamera(p); await click(p, '#tr-setFrame'); await click(p, '#tr-showFrame'); await settled(p);
      const applied = await app(p).evaluate(async () => { try { await Trace.state.stream.getVideoTracks()[0].applyConstraints({ width: { exact: 640 }, height: { exact: 480 } }); return 'ok'; } catch (err) { return String(err); } });
      await app(p).waitForFunction(() => document.getElementById('tr-video').videoWidth === 640, null, { timeout: 8000 }).catch(() => null);
      await sleep(500); await settled(p);
      const m = await app(p).evaluate(() => {
        const w = document.getElementById('tr-wrap').getBoundingClientRect(), gh = document.getElementById('tr-ghost'), v = document.getElementById('tr-video'), k = Math.min(w.width / gh.width, w.height / gh.height);
        return { video: [v.videoWidth, v.videoHeight], wrap: [Math.round(w.width), Math.round(w.height)], stillIs: [gh.width, gh.height], stillDrawn: [Math.round(gh.width * k), Math.round(gh.height * k)], shown: !gh.hidden, frame: Trace.state.frame };
      });
      const covers = Math.abs(m.stillDrawn[0] - m.wrap[0]) <= 2 && Math.abs(m.stillDrawn[1] - m.wrap[1]) <= 2;
      return { applied, bad: applied === 'ok' && m.video[0] === 640 && m.shown && !covers, m: { applied, ...m, covers } };
    };
    const r = await twice(probe);
    if (r.m.run1.applied !== 'ok') t.note(`the fake camera would not change its size (${r.m.run1.applied}): the frame-after-a-new-shape check did not apply`);
    t.check(!r.both, 'when the camera\'s picture changes shape under a shown frame, the frame is not drawn smaller than the picture it is meant to line up with (it is dropped, or taken again)', r.m);
    if (r.both) t.finding({ title: 'A frame set from a 16:9 picture stays over the camera when the picture becomes 4:3, drawn as a smaller letterboxed still', severity: 'low', steps: 'Open #trace, Start camera, Set frame, Show frame. Change the stream\'s size under it (a phone turned on its side gives a new size; in a test: track.applyConstraints({ width: { exact: 640 }, height: { exact: 480 } })).', expected: 'README, Trace onto paper: Show frame lays the still over the live picture so the phone can be moved until the paper\'s edges line up with it. With the picture another shape, a still of the old shape cannot line up: it should be dropped (or the visitor asked to set it again), not left over the picture.', actual: `The camera picture re-fits to its new shape but the frame stays in the old one, drawn whole inside it (object-fit: contain) and smaller than the picture: ${JSON.stringify(r.m)}`, cause: 'js/trace.js 428: the video\'s resize event only calls fitView() and render(); state.frame and the still on #tr-ghost (js/trace.js 201-213) are not compared with the new videoWidth / videoHeight, and styles.css 1672 draws the still with object-fit: contain.' });
  });

  // ---- photos: sizes, shapes, files that are not pictures, SVGs, many replaced, dropped and pasted ----------------------------
  await seg(t, 'edge: photos', async (pages) => {
    const COUNT_URLS = () => { window.__urls = { made: 0, revoked: 0, open: new Set() }; const c = URL.createObjectURL.bind(URL), r = URL.revokeObjectURL.bind(URL); URL.createObjectURL = (o) => { const u = c(o); window.__urls.made++; window.__urls.open.add(u); return u; }; URL.revokeObjectURL = (u) => { window.__urls.revoked++; window.__urls.open.delete(u); return r(u); }; };
    const page = await recorded(site, { url: '#trace', init: COUNT_URLS }); pages.push(page);
    await startCamera(page);
    for (const [label, w, h] of [['6000 × 4000 (24 MP, the app\'s own limit)', 6000, 4000], ['8000 × 6000 (48 MP)', 8000, 6000], ['16 × 16 (the smallest allowed)', 16, 16], ['16 × 4000 (very tall)', 16, 4000], ['16 × 30000 (absurdly tall)', 16, 30000], ['4000 × 16 (very wide)', 4000, 16], ['30000 × 16 (absurdly wide)', 30000, 16], ['3000 × 400 (a panorama)', 3000, 400]]) {
      const file = grayPng(w, h);
      const ms = await chosen(page, file);
      const s = await st(page), b = await boxes(page), said = (await text(page, '#toast')) || '';
      const k = Math.min(b.wrap.w / w, b.wrap.h / h), want = [w * k, h * k];
      t.check(s.photo && s.photo.name === file.name && Math.max(s.photo.w, s.photo.h) <= 2048 && s.photo.w >= 1 && s.photo.h >= 1 && !s.off.fit && !s.off.size && !s.off.lock && ms < 20000, `${label}: accepted and over the camera, kept to 2048 px a side, Fit, Lock and Size on (${ms} ms)`, { photo: s.photo, off: s.off, ms });
      t.check(fitsPicture(b) && near(b.photo.w, want[0], 1.5) && near(b.photo.h, want[1], 1.5) && near(b.cx, 0.5, 0.01) && near(b.cy, 0.5, 0.01), `${label}: fitted whole inside the camera picture, in its own shape, centred`, { box: [b.photo.w, b.photo.h].map((v) => +v.toFixed(2)), want: want.map((v) => +v.toFixed(2)) });
      if (w * h > 24e6) t.check(/very large photo \(\d+ × \d+\) was reduced to/.test(said), `${label}: the app says a very large photo was reduced`, said);
      await setRange(page, 'tr-size', 200); await settled(page);
      const big = await st(page), bb = await boxes(page);
      await click(page, '#tr-fit'); await settled(page);
      const fit = await st(page), fb = await boxes(page), words = (await text(page, '#tr-root')) || '';
      t.check(big.pct === 400 && bb.photo.w > 0 && bb.photo.h > 0 && Number.isFinite(bb.photo.w + bb.photo.h) && fit.pct === 100 && near(fb.cx, 0.5, 0.005) && !/NaN|undefined/.test(words), `${label}: Size to the largest is 400% with a finite box, and Fit brings it back to 100% and the middle, with no NaN on the page`, { big: big.pct, box: [bb.photo.w, bb.photo.h], fit: fit.pct });
    }
    // refused in words, the photo over the camera stays
    const keep = (await st(page)).photo.name, before = await picture(page, 'tr-photo');
    for (const [label, file, re] of [
      ['a 1 × 1 picture', grayPng(1, 1, 'one.png'), /too small to trace \(1 × 1 px\)/],
      ['a 15 × 15 picture', grayPng(15, 15, 'fifteen.png'), /too small to trace \(15 × 15 px\)/],
      ['a 15 × 400 picture (one side under 16 px)', grayPng(15, 400, 'narrow.png'), /too small to trace \(15 × 400 px\)/],
      ['a 400 × 15 picture', grayPng(400, 15, 'flat.png'), /too small to trace \(400 × 15 px\)/],
      ['a PDF', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n') }, /not an image/],
      ['a text file with no type', { name: 'notes', mimeType: 'application/octet-stream', buffer: Buffer.from('just words') }, /could not be opened/],
      ['a text file named .png and typed as a PNG', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('just words') }, /could not be opened/],
      ['a phone\'s HEIC the browser cannot open', { name: 'IMG_0001.heic', mimeType: 'image/heic', buffer: Buffer.from('\0\0\0\x18ftypheic not really') }, /HEIC photos from a phone open in Safari/],
      ['a folder (no size, no type)', { name: 'Photos', mimeType: '', buffer: Buffer.alloc(0) }, /empty file or a folder/],
    ]) {
      await chosen(page, file, 8000);
      const said = (await text(page, '#toast')) || '', s = await st(page), after = await picture(page, 'tr-photo');
      t.check(re.test(said) && s.photo.name === keep && after.spread === before.spread && after.mean.join() === before.mean.join(), `${label} is refused in words and the photo over the camera stays as it was`, { said: said.slice(0, 120), photo: s.photo.name });
    }
    // an SVG with a foreignObject: refused as the Study tab refuses it, the Study photo and the overlay untouched
    const FO = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><foreignObject width="200" height="200"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject></svg>';
    await chosen(page, svgImage(FO, 'html-in-it.svg'), 8000);
    const traceSays = (await text(page, '#toast')) || '';
    const studyOf = () => app(page).evaluate(() => { const s = Studio.source(); return { base: Studio.sourceBase(), w: s && (s.naturalWidth || s.width), sample: Studio.isSample() }; });
    const studyBefore = await studyOf();
    await tab(page, 'study'); await armToast(page);
    await app(page).setInputFiles('#file', svgImage(FO, 'html-in-it.svg'));
    const studySays = await toastMatch(page, /cannot be read here/);
    t.check(/cannot be read here/.test(traceSays) && traceSays === studySays && JSON.stringify(await studyOf()) === JSON.stringify(studyBefore) && (await st(page)).photo.name === keep, 'an SVG with a foreignObject is refused with the Study tab\'s own words, and neither the Study photo nor the overlay changes', { trace: traceSays.slice(0, 90), study: studySays.slice(0, 90), study_photo: [studyBefore, await studyOf()] });
    await tab(page, 'trace'); await startCamera(page);
    // what is accepted besides PNGs: a plain SVG (the browser gives it 300 × 150), a JPG, a WebP, a PNG with no type
    for (const [label, file, want] of [['a plain SVG with no size', svgImage(undefined, 'plain.svg'), [300, 150]], ['a JPG', await makeImage(page, { width: 200, height: 300, type: 'image/jpeg', name: 'photo.jpg' }), [200, 300]], ['a WebP', await makeImage(page, { width: 220, height: 120, type: 'image/webp', name: 'photo.webp' }), [220, 120]], ['a PNG with no type (read by its content)', { ...grayPng(64, 48, 'untyped'), mimeType: 'application/octet-stream' }, [64, 48]]]) {
      await chosen(page, file);
      const s = await st(page);
      t.check(s.photo && s.photo.name === file.name && s.photo.w === want[0] && s.photo.h === want[1], `${label} is accepted over the camera at its own size`, s.photo);
    }
    // a phone's JPEG that is stored sideways with an EXIF orientation of 6 (turn it a quarter): over the camera as the browser shows it, 300 × 200, not 200 × 300
    const jpg = (await makeImage(page, { width: 200, height: 300, type: 'image/jpeg', name: 'upright.jpg' })).buffer;
    const exif = Buffer.from([0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
    await chosen(page, { name: 'sideways.jpg', mimeType: 'image/jpeg', buffer: Buffer.concat([jpg.subarray(0, 2), exif, jpg.subarray(2)]) });
    const sideways = (await st(page)).photo;
    t.check(sideways && sideways.name === 'sideways.jpg' && sideways.w === 300 && sideways.h === 200, 'a JPEG with EXIF orientation 6 goes over the camera turned as the browser shows it (300 × 200, not 200 × 300)', sideways);
    // a chooser closed with nothing chosen
    const was = JSON.stringify((await st(page)).photo);
    await app(page).evaluate(() => { const i = document.getElementById('tr-file'); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(200);
    t.check(JSON.stringify((await st(page)).photo) === was, 'a photo chooser closed with nothing chosen changes nothing');
    // many replaced: thirty one after another, twelve in one task (the last chosen wins), then refusals among them
    const small = grayPng(64, 64);
    for (let i = 0; i < 30; i++) await app(page).setInputFiles('#tr-file', { ...small, name: `seq${i}.png` });
    await sleep(1200);
    await app(page).evaluate(async (b64) => {
      const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const input = document.getElementById('tr-file');
      for (let i = 0; i < 12; i++) { const dt = new DataTransfer(); dt.items.add(new File([bytes], `race${i}.png`, { type: 'image/png' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
    }, small.buffer.toString('base64'));
    await sleep(1500);
    for (const f of [textFile('x.txt'), brokenImage('x.jpg'), grayPng(5, 5, 'five.png')]) { await app(page).setInputFiles('#tr-file', f); await sleep(300); }
    await sleep(500);
    const u = await app(page).evaluate(() => ({ made: window.__urls.made, revoked: window.__urls.revoked, open: window.__urls.open.size, photo: Trace.state.photo.name }));
    t.check(u.made >= 45 && u.open === 0 && u.made === u.revoked && u.photo === 'race11.png', 'thirty photos one after another, twelve in one task and three refused: every object URL made was revoked (none piling up), and the last chosen is the photo', u);
    // dropped and pasted while the tool is open: the Study photo and the overlay both take it; the camera runs on
    const hint = await app(page).evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, cancelable: true })); const h = document.getElementById('dropHint'), r = { hidden: h.hidden, text: h.textContent.trim() }; window.dispatchEvent(new DragEvent('dragleave')); return r; });
    t.check(!hint.hidden && /Drop the photo to trace it/.test(hint.text), 'a file dragged over the tool says "Drop the photo to trace it"', hint);
    await dropFiles(page, 'body', [grayPng(500, 300, 'dropped.png')]);
    await app(page).waitForFunction(() => Trace.state.photo && Trace.state.photo.name === 'dropped', null, { timeout: 15000 }).catch(() => null);
    let s = await st(page);
    t.check(s.tab === 'trace' && s.live && s.photo && s.photo.name === 'dropped' && (await app(page).evaluate(() => Studio.sourceBase())) === 'dropped', 'a photo dropped on the open tool is the Study photo and over the camera, the camera running on', { tab: s.tab, live: s.live, photo: s.photo });
    await armToast(page);
    await dropFiles(page, 'body', [textFile('dropped.txt')]);
    const dropSays = await toastMatch(page, /not an image/);
    t.check(/not an image/.test(dropSays) && (await st(page)).photo.name === 'dropped', 'a text file dropped on it is refused in words and the photo stays', dropSays);
    await pasteFile(page, grayPng(500, 300, 'pasted.png'));
    s = await st(page);
    t.check(s.photo && /^(pasted|Pasted image)/i.test(s.photo.name) && s.live, 'a picture pasted while the tool is open goes over the camera too', s.photo);
    await clean(t, page, 'photos');

    // a very long file name: its toast stays on the screen
    const ph = await recorded(site, { url: '#trace', viewport: PHONE }); pages.push(ph);
    const longName = `${'x'.repeat(250)}.png`;
    await choose(ph, { ...grayPng(100, 100), name: longName });
    await sleep(500);
    const rect = await app(ph).evaluate(() => { const el = document.getElementById('toast'), r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: innerWidth, shown: el.classList.contains('show'), chars: el.textContent.length, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    t.check(rect.shown && rect.l >= 0 && rect.r <= rect.w && rect.scroll <= 0, 'a 254-character file name: the toast saying it is over the camera stays inside the phone\'s screen and the page does not scroll sideways', rect);
    await clean(t, ph, 'a long file name');

    // a photo placed before the camera starts keeps its place over the picture when the camera comes
    const pre = await recorded(site, { url: '#trace' }); pages.push(pre);
    await click(pre, '#tr-useStudy'); await settled(pre);
    s = await st(pre);
    t.check(s.photoShown && !s.live && fitsPicture(await boxes(pre)), 'a photo chosen before the camera starts shows, fitted to the stage (there is no camera picture yet)', { shown: s.photoShown, live: s.live });
    // (the card sits in the middle of the stage until the camera runs: the drag starts near its corner)
    const H = await app(pre).evaluate(() => { const r = document.getElementById('tr-hit').getBoundingClientRect(); return { x: r.left + r.width * 0.12, y: r.top + r.height * 0.2 }; });
    await pre.mouse.move(H.x, H.y); await pre.mouse.down(); await pre.mouse.move(H.x + 90, H.y + 40, { steps: 4 }); await pre.mouse.up();
    const b1 = await boxes(pre);
    t.check(b1.cx > 0.55 && b1.cy > 0.5, 'the photo dragged before the camera started (the card is up in the middle of the stage): it moved with the pointer', { cx: b1.cx, cy: b1.cy });
    await startCamera(pre); await sleep(300); await settled(pre);
    const b2 = await boxes(pre);
    t.check(near(b2.cx, b1.cx, 0.01) && near(b2.cy, b1.cy, 0.01) && near(b2.pw, b1.pw, 0.01), 'the camera started after the photo was placed: the photo keeps its place and size as fractions of the picture', { before: [b1.cx, b1.cy, b1.pw], after: [b2.cx, b2.cy, b2.pw] });
    await clean(t, pre, 'a photo before the camera');

    // a big file chosen and Study photo pressed before the file has been read: which photo is over the camera in the end? (observed, not asserted: the README is silent)
    const slow = grayPng(8000, 6000, 'slow.png');
    const order = async () => {
      const p = await recorded(site, { url: '#trace' }); pages.push(p);
      await startCamera(p);
      return app(p).evaluate(async (b64) => {
        const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const input = document.getElementById('tr-file'), dt = new DataTransfer(); dt.items.add(new File([bytes], 'slow.png', { type: 'image/png' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('tr-useStudy').click();
        const first = Trace.state.photo && Trace.state.photo.name;
        await new Promise((r) => setTimeout(r, 3000));
        return { afterStudyPhoto: first, settled: Trace.state.photo && Trace.state.photo.name };
      }, slow.buffer.toString('base64'));
    };
    const o1 = await order(), o2 = await order();
    t.note(`a big file chosen and then Study photo pressed before the file was read: the photo over the camera is ${o1.afterStudyPhoto} at once and ${o1.settled} once the file has been read (run 1), ${o2.afterStudyPhoto} then ${o2.settled} (run 2): the file read last replaces the Study photo pressed after it, and nothing shows while a big photo is being read`);
  });

  // ---- the Learning tools and Games menus open over the tool, and their items are what a click reaches ---------------------------
  await seg(t, 'edge: menus over the tool', async (pages) => {
    for (const vp of [DESKTOP, { width: 1024, height: 768 }, { width: 800, height: 600 }]) {
      const page = await recorded(site, { url: '#trace', viewport: vp }); pages.push(page);
      await startCamera(page); await click(page, '#tr-useStudy');
      for (const btn of ['#tabLearnBtn', '#tabGamesBtn']) {
        const at = await app(page).evaluate((b) => { const r = document.querySelector(b).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, btn);
        await page.mouse.click(...at); await sleep(300);
        const r = await app(page).evaluate((b) => {
          const btnEl = document.querySelector(b), menu = document.getElementById(btnEl.getAttribute('aria-controls'));
          return { open: btnEl.getAttribute('aria-expanded'), items: [...menu.querySelectorAll('.tab-item:not([hidden])')].map((it) => { const q = it.getBoundingClientRect(), hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return [it.id, !!hit && it.contains(hit)]; }) };
        }, btn);
        t.check(r.open === 'true' && r.items.length >= 2 && r.items.every(([, ok]) => ok), `${vp.width} wide, the camera running: the ${btn === '#tabLearnBtn' ? 'Learning tools' : 'Games'} menu opens over the tool and every item is what a click at its middle reaches`, r);
        await page.keyboard.press('Escape'); await sleep(200);
      }
      // a real click on an item leaves the tool (the camera goes off), a real click on Trace onto paper comes back
      await page.mouse.click(...(await app(page).evaluate(() => { const r = document.querySelector('#tabLearnBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }))); await sleep(300);
      await page.mouse.click(...(await app(page).evaluate(() => { const r = document.getElementById('tabStudyBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }))); await sleep(500);
      let s = await st(page);
      t.check(s.tab === 'study' && !s.live, `${vp.width} wide: a click on Study the photo in the menu leaves the tool, and the camera goes off`, { tab: s.tab, live: s.live });
      await page.mouse.click(...(await app(page).evaluate(() => { const r = document.querySelector('#tabLearnBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }))); await sleep(300);
      await page.mouse.click(...(await app(page).evaluate(() => { const r = document.getElementById('tabTraceBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }))); await sleep(500);
      s = await st(page);
      t.check(s.tab === 'trace' && s.photoShown, `${vp.width} wide: a click on Trace onto paper in the menu comes back to the tool, the photo still over it`, { tab: s.tab, photo: s.photoShown });
      await clean(t, page, `menus at ${vp.width}`);
    }
  });

  // ---- pinch to the smallest and the largest, drag off the screen, Fit back, Lock (a phone, real fingers through CDP) --------
  await seg(t, 'edge: pinch, drag off the screen, Fit and Lock', async (pages) => {
    const page = await touchPage(site); pages.push(page);
    await page.touchscreen.tap(...(await app(page).evaluate(() => { const r = document.getElementById('tr-start').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
    t.check(await live(page), 'a finger on Start camera starts it');
    await click(page, '#tr-useStudy'); await settled(page);
    const C = await centre(page);
    const sizeNow = () => app(page).evaluate(() => ({ pct: Trace.sizePct(), slider: document.getElementById('tr-size').value, out: document.getElementById('tr-sizeOut').textContent }));
    const place = () => app(page).evaluate(() => JSON.stringify(Trace.state.place));
    const sane = () => app(page).evaluate(() => Object.values(Trace.state.place).every((v) => typeof v !== 'number' || Number.isFinite(v)) && Trace.state.place.cx >= 0 && Trace.state.place.cx <= 1 && Trace.state.place.cy >= 0 && Trace.state.place.cy <= 1 && Trace.sizePct() >= 20 && Trace.sizePct() <= 400);
    // the smallest and the largest size
    await pinchBy(page, C, 150, 2);
    let z = await sizeNow(), b = await boxes(page);
    t.check(z.pct === 20 && z.out === '20%' && z.slider === '0' && b.photo.w > 0 && Number.isFinite(b.photo.w), 'a pinch to nothing stops at the smallest size: 20% of fitted, Size at its start, the read-out 20%', { z, w: b.photo.w });
    await pinchBy(page, C, 100, 5);
    t.check((await sizeNow()).pct === 20, 'a second pinch inward leaves it at 20%');
    await pinchBy(page, C, 10, 185); await pinchBy(page, C, 10, 185);
    z = await sizeNow(); b = await boxes(page);
    t.check(z.pct === 400 && z.out === '400%' && z.slider === '200' && Number.isFinite(b.photo.w + b.photo.h) && await sane(), 'two pinches outward stop at the largest size: 400%, Size at its end, the read-out 400%, the box finite', { z, box: [b.photo.w, b.photo.h] });
    await pinchBy(page, C, 10, 185);
    t.check((await sizeNow()).pct === 400 && await sane(), 'a third pinch outward leaves it at 400%');
    // two fingers that land on the very same spot and spread (a zero distance to start from)
    await click(page, '#tr-fit');
    for (const [type, id, x, y] of [['pointerdown', 1, C.x, C.y], ['pointerdown', 2, C.x, C.y], ['pointermove', 2, C.x + 60, C.y], ['pointerup', 2, C.x + 60, C.y], ['pointerup', 1, C.x, C.y]]) await finger(page, type, id, x, y);
    await settled(page);
    t.check(await sane(), 'two fingers that touch down on the same spot and then spread: the size and the place stay finite and in range', await place());
    // dragged far off the screen, every way: the photo's middle stops at the picture's edge and part of it is still over the picture
    await click(page, '#tr-fit');
    for (const [dx, dy, way] of [[600, 0, 'right'], [-1300, 0, 'left'], [0, 1500, 'down'], [0, -1500, 'up']]) {
      await dragBy(page, C, dx, dy); b = await boxes(page);
      t.check(b.cx >= -0.002 && b.cx <= 1.002 && b.cy >= -0.002 && b.cy <= 1.002 && overlap(b) > 0, `dragged far off the screen ${way}: the photo's middle stops at the picture's edge, and part of the photo is still over the picture`, { cx: +b.cx.toFixed(3), cy: +b.cy.toFixed(3), visible: Math.round(overlap(b)) });
    }
    await pinchBy(page, C, 150, 2); await dragBy(page, C, -1500, -1500); b = await boxes(page);
    t.check(overlap(b) > 0 && (await sizeNow()).pct === 20, 'the smallest size dragged into a corner: still part of it over the picture', { cx: b.cx, cy: b.cy, visible: Math.round(overlap(b)) });
    await click(page, '#tr-fit'); z = await sizeNow(); b = await boxes(page);
    t.check(z.pct === 100 && near(b.cx, 0.5, 0.005) && near(b.cy, 0.5, 0.005) && Math.abs(+z.slider - 107) <= 1 && (await app(page).evaluate(() => Trace.state.place.fitted)), 'Fit after all of it: 100%, in the middle, fitted again, Size back at its middle mark', { z, cx: b.cx, cy: b.cy });
    // the keyboard held down: the arrows stop at the edge, + and − at the limits
    await page.focus('#tr-hit');
    for (let i = 0; i < 150; i++) { await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowUp'); }
    b = await boxes(page);
    t.check(near(b.cx, 0, 0.002) && near(b.cy, 0, 0.002), 'the arrow keys held down walk the photo to the picture\'s corner and no further', { cx: b.cx, cy: b.cy });
    for (let i = 0; i < 150; i++) await page.keyboard.press('+');
    const up = (await sizeNow()).pct;
    for (let i = 0; i < 300; i++) await page.keyboard.press('-');
    t.check(up === 400 && (await sizeNow()).pct === 20 && await sane(), '+ held down stops at 400%, − held down at 20%', { up, down: (await sizeNow()).pct });
    // a turned photo at the extremes (Turn 90° is an Advanced control)
    await app(page).evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    await click(page, '#tr-fit'); await click(page, '#tr-turn');
    await pinchBy(page, C, 10, 185); await pinchBy(page, C, 10, 185);
    z = await sizeNow(); b = await boxes(page);
    t.check(z.pct === 400 && Number.isFinite(b.photo.w + b.photo.h) && await sane(), 'a turned photo pinched to the largest: 400%, a finite box, in range', { z });
    await pinchBy(page, C, 185, 2); await pinchBy(page, C, 185, 2);
    t.check((await sizeNow()).pct === 20 && await sane(), 'and pinched back to the smallest: 20%');
    await click(page, '#tr-fit'); for (let i = 0; i < 3; i++) await click(page, '#tr-turn');
    t.check((await st(page)).transform === '' && (await sizeNow()).pct === 100, 'Fit and three more turns: upright again at 100%');
    // Lock: nothing moves it, whoever the fingers are
    await pinchBy(page, C, 40, 80); await dragBy(page, C, 30, -10);
    await click(page, '#tr-lock'); await settled(page);
    let s = await st(page);
    const before = await place();
    await pinchBy(page, C, 20, 120); await dragBy(page, C, -90, 40);
    for (const [type, id, x, y] of [['pointerdown', 1, C.x - 20, C.y], ['pointerdown', 2, C.x + 20, C.y], ['pointermove', 2, C.x + 120, C.y], ['pointermove', 1, C.x - 100, C.y + 30], ['pointerup', 2, 0, 0], ['pointerup', 1, 0, 0]]) await finger(page, type, id, x, y);
    await page.focus('#tr-hit');
    for (const key of ['ArrowLeft', 'ArrowDown', 'Shift+ArrowRight', '+', '-', '=']) await page.keyboard.press(key);
    await setRange(page, 'tr-size', 5);
    await app(page).evaluate(() => { document.getElementById('tr-turn').click(); document.getElementById('tr-fit').click(); });
    t.check(s.locked && (await place()) === before, 'Lock: real fingers pinching and dragging, fingers of the test\'s own, the arrow keys, + − =, the Size slider, Turn 90° and Fit all leave the photo exactly where it was', { locked: s.locked, before, after: await place() });
    // Lock pressed in the middle of a pinch: what the fingers do afterwards does nothing
    await click(page, '#tr-lock'); await click(page, '#tr-fit'); await settled(page);
    const p0 = (await sizeNow()).pct;
    await finger(page, 'pointerdown', 1, C.x - 30, C.y); await finger(page, 'pointerdown', 2, C.x + 30, C.y); await finger(page, 'pointermove', 2, C.x + 90, C.y);
    const mid = (await sizeNow()).pct;
    await click(page, '#tr-lock');
    const atLock = await place();
    await finger(page, 'pointermove', 2, C.x + 150, C.y); await finger(page, 'pointermove', 1, C.x - 100, C.y + 20); await finger(page, 'pointerup', 2, C.x + 150, C.y); await finger(page, 'pointerup', 1, C.x - 100, C.y + 20);
    t.check(mid > p0 && (await place()) === atLock && (await st(page)).locked, 'Lock pressed in the middle of a pinch: the pinch had sized the photo until then, and the fingers that go on (and lift) change nothing', { p0, mid, atLock, after: await place() });
    // a finger lifted in the middle of a pinch leaves the other one dragging, with no jump
    await click(page, '#tr-lock'); await click(page, '#tr-fit'); await settled(page);
    await finger(page, 'pointerdown', 1, C.x - 30, C.y); await finger(page, 'pointerdown', 2, C.x + 30, C.y); await finger(page, 'pointermove', 2, C.x + 60, C.y); await finger(page, 'pointerup', 2, C.x + 60, C.y);
    const b3 = await boxes(page);
    await finger(page, 'pointermove', 1, C.x - 30 + 40, C.y + 25);
    const b4 = await boxes(page);
    await finger(page, 'pointerup', 1, C.x + 10, C.y + 25);
    t.check(near((b4.cx - b3.cx) * b4.wrap.w, 40, 2) && near((b4.cy - b3.cy) * b4.wrap.h, 25, 2) && near(b4.pw, b3.pw, 0.0005), 'one finger lifted in the middle of a pinch: the finger that stays drags the photo by as much as it moves, the size unchanged', { dx: (b4.cx - b3.cx) * b4.wrap.w, dy: (b4.cy - b3.cy) * b4.wrap.h });
    // a gesture the browser cancels ends there
    await finger(page, 'pointerdown', 1, C.x, C.y); await finger(page, 'pointermove', 1, C.x + 20, C.y); await finger(page, 'pointercancel', 1, C.x + 20, C.y);
    const b5 = await boxes(page);
    await finger(page, 'pointermove', 1, C.x + 80, C.y);
    t.check(near((await boxes(page)).cx, b5.cx, 0.0005), 'a drag the browser cancels (pointercancel) ends there: a later move of that finger does nothing');
    // Lock stays when the tab is left and opened again; a new photo starts unlocked
    await click(page, '#tr-lock'); const atTab = await place();
    await tab(page, 'study'); await tab(page, 'trace');
    s = await st(page);
    t.check(s.locked && s.pressed.lock === 'true' && (await place()) === atTab, 'the tab left and opened again: the photo is still locked, in the same place', { locked: s.locked });
    await chosen(page, grayPng(120, 160, 'fresh.png'));
    s = await st(page);
    t.check(!s.locked && s.pressed.lock === 'false' && s.place.fitted && s.photo.name === 'fresh.png', 'a new photo starts fitted and unlocked (README: "A new photo starts fitted to the camera\'s picture, centred and unlocked")', { locked: s.locked, fitted: s.place.fitted });
    await clean(t, page, 'pinch, drag, Lock');
  });

  // ---- the phone turned: upright, on its side, upright, quickly ------------------------------------------------------------
  await seg(t, 'edge: the phone turned', async (pages) => {
    const page = await touchPage(site); pages.push(page);
    await page.touchscreen.tap(...(await app(page).evaluate(() => { const r = document.getElementById('tr-start').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
    await live(page); await click(page, '#tr-useStudy');
    await app(page).evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    await setRange(page, 'tr-size', 150);
    const C = await centre(page);
    await dragBy(page, C, 120, -50);
    await click(page, '#tr-turn'); await click(page, '#tr-setFrame'); await click(page, '#tr-showFrame'); await click(page, '#tr-lock'); await settled(page);
    const frac = async () => {
      const b = await boxes(page);
      const v = await app(page).evaluate(() => { const g = document.getElementById('tr-ghost').getBoundingClientRect(), w = document.getElementById('tr-wrap').getBoundingClientRect(), vid = document.getElementById('tr-video'); return { ghost: [Math.round(g.width - w.width), Math.round(g.height - w.height)], aspect: w.width / w.height, vaspect: vid.videoWidth / vid.videoHeight, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, pct: Trace.sizePct() }; });
      return { cx: b.cx, cy: b.cy, pw: b.pw, ...v };
    };
    const A = await frac(), g0 = (await tracks(page)).gum;
    const same = (f) => near(f.cx, A.cx, 0.01) && near(f.cy, A.cy, 0.01) && near(f.pw, A.pw, 0.01) && Math.abs(f.pct - A.pct) <= 1;
    for (const [label, vp] of [['on its side', SIDE], ['upright again', PHONE], ['on its side again', SIDE], ['upright once more', PHONE]]) {
      await page.setViewportSize(vp); await sleep(400); await settled(page);
      const f = await frac(), s = await st(page);
      t.check(same(f) && near(f.aspect, f.vaspect, 0.02) && Math.abs(f.ghost[0]) <= 1 && Math.abs(f.ghost[1]) <= 1 && f.sideways <= 0 && s.live && s.locked && s.ghostShown && s.transform === 'rotate(90deg)' && (await tracks(page)).gum === g0, `${label} (${vp.width} × ${vp.height}): the turned, locked photo keeps its place and size over the camera picture (centre and width as fractions of it), the picture keeps its shape, the frame still covers it, the camera runs on without a new request`, { was: [A.cx, A.cy, A.pw, A.pct], now: [f.cx, f.cy, f.pw, f.pct], aspect: [f.aspect, f.vaspect], ghost: f.ghost, sideways: f.sideways });
    }
    // turned eight times in a breath
    for (let i = 0; i < 8; i++) await page.setViewportSize(i % 2 ? PHONE : SIDE);
    await sleep(700); await settled(page);
    let f = await frac();
    t.check(same(f) && (await st(page)).live, 'turned eight times without a pause: the photo is where it was when it settles, the camera runs', { was: [A.cx, A.cy, A.pw], now: [f.cx, f.cy, f.pw] });
    await app(page).evaluate(() => { window.dispatchEvent(new Event('orientationchange')); }); await sleep(300); await settled(page);
    f = await frac();
    t.check(same(f), 'an orientationchange event with nothing resized changes nothing', { was: [A.cx, A.cy, A.pw], now: [f.cx, f.cy, f.pw] });
    await clean(t, page, 'the phone turned');
  });

  // ---- Simple and Advanced ------------------------------------------------------------------------------------------------------
  await seg(t, 'edge: Simple and Advanced', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await startCamera(page); await click(page, '#tr-useStudy'); await click(page, '#tr-setFrame'); await click(page, '#tr-showFrame');
    const reach = () => app(page).evaluate(() => ['tr-turn', 'tr-strength', 'tr-switch'].map((id) => { const e = document.getElementById(id); e.focus(); return [id, document.activeElement === e, e.offsetParent === null]; }));
    let r = await reach();
    t.check(r.every(([, focused, gone]) => !focused && gone), 'Simple: Turn 90°, Frame strength and Switch are out of the page (no box) and cannot take the focus', r);
    await app(page).evaluate(() => { const m = (x) => document.querySelector(`[data-mode="${x}"]`).click(); for (let i = 0; i < 10; i++) { m('advanced'); m('simple'); } m('advanced'); });
    await settled(page); r = await reach();
    const s = await st(page);
    t.check(s.shown.turn && s.shown.strength && !s.shown.switch && r[0][1] && r[1][1] && !r[2][1], 'Simple and Advanced switched ten times over, ending in Advanced: Turn 90° and Frame strength are there and take the focus; Switch (one camera) is not', { shown: s.shown, reach: r });
    await setRange(page, 'tr-strength', 70); await click(page, '#tr-turn'); await settled(page);
    await click(page, '[data-mode="simple"]'); await settled(page);
    let q = await st(page);
    t.check(near(q.ghostOpacity, 0.4, 0.01) && q.transform === 'rotate(90deg)' && !q.shown.turn && !q.shown.strength, 'to Simple with Frame strength 70 set and the photo turned: the frame is at 40%, the turn stays', { op: q.ghostOpacity, transform: q.transform });
    await click(page, '#tr-fit'); await settled(page);
    const fb = await boxes(page);
    t.check(fitsPicture(fb) && (near(fb.photo.w, fb.wrap.w, 2) || near(fb.photo.h, fb.wrap.h, 2)), 'Fit in Simple with the photo turned fits the turned photo to the picture', { photo: fb.photo, wrap: fb.wrap });
    await click(page, '[data-mode="advanced"]'); await settled(page);
    q = await st(page);
    t.check(near(q.ghostOpacity, 0.7, 0.01) && q.shown.strength, 'back in Advanced the Frame strength set before (70%) is in use again', { op: q.ghostOpacity });
    // the mode is remembered across a reload
    await page.reload({ waitUntil: 'load' }); await app(page).waitForFunction(() => window.Trace, null, { timeout: 15000 }).catch(() => null);
    t.check(!(await app(page).evaluate(() => document.body.classList.contains('mode-simple'))) && (await st(page)).shown.turn, 'Advanced is still there after a reload (Turn 90° offered)');
    await click(page, '[data-mode="simple"]'); await page.reload({ waitUntil: 'load' }); await app(page).waitForFunction(() => window.Trace, null, { timeout: 15000 }).catch(() => null);
    t.check((await app(page).evaluate(() => document.body.classList.contains('mode-simple'))) && !(await st(page)).shown.turn, 'and Simple is still there after a reload (no Turn 90°)');
    // every control on the screen in either mode, at small sizes, upright and on its side
    await startCamera(page); await click(page, '#tr-useStudy');
    for (const mode of ['simple', 'advanced']) {
      await click(page, `[data-mode="${mode}"]`);
      for (const vp of [{ width: 320, height: 568 }, { width: 568, height: 320 }, PHONE, SIDE]) {
        await page.setViewportSize(vp); await sleep(250); await settled(page);
        const m = await app(page).evaluate(() => {
          const W = innerWidth, H = innerHeight;
          const ctl = [...document.querySelectorAll('#tr-root button, #tr-root input[type=range]')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]'));
          const off = ctl.filter((e) => { const q = e.getBoundingClientRect(); return q.left < -1 || q.top < -1 || q.right > W + 1 || q.bottom > H + 1; }).map((e) => e.id);
          return { n: ctl.length, off, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        t.check(m.n >= (mode === 'simple' ? 9 : 11) && !m.off.length && m.sideways <= 0, `${mode === 'simple' ? 'Simple' : 'Advanced'} at ${vp.width} × ${vp.height}: every control on the screen, no sideways scroll`, m);
      }
    }
    await clean(t, page, 'Simple and Advanced');
  });

  // ---- Forget my work while tracing ---------------------------------------------------------------------------------------------
  await seg(t, 'edge: Forget my work while tracing', async (pages) => {
    // what a page about to be left still holds, read after the app's own pagehide handlers (they are in before 'load')
    const WATCH = () => { window.addEventListener('load', () => { window.addEventListener('pagehide', () => { if (window.top !== window) return; try { const all = window.__streams.flatMap((x) => x.getTracks()); const prev = JSON.parse(sessionStorage.getItem('__leaving') || '[]'); prev.push({ streams: window.__streams.length, live: all.filter((x) => x.readyState === 'live').length, held: window.__wake.held }); sessionStorage.setItem('__leaving', JSON.stringify(prev)); } catch (e) { /* no storage */ } }); }); };
    const forgetTwice = async (p) => {
      await click(p, '#forgetBtn');
      await p.waitForFunction(() => /again/i.test(document.getElementById('forgetBtn').textContent), null, { timeout: 3000 }).catch(() => null);
      await Promise.all([p.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => null), click(p, '#forgetBtn')]);
    };
    const reopened = async (p) => { await app(p).waitForFunction(() => window.Trace && Studio.result(), null, { timeout: 30000 }).catch(() => null); await sleep(900); };
    // pressed in another tab of the site while this one traces with the camera running
    const A = await recorded(site, { url: '#trace', init: WATCH }); pages.push(A);
    await allowCamera(A, site);
    await startCamera(A); await setRange(A, 'tr-transparency', 65);
    const saved = await storageGet(A, KEY);
    const B = await newTab(site, A, { url: '#help' }); pages.push(B);
    const reloaded = A.waitForEvent('load', { timeout: 20000 }).then(() => true, () => false);
    await forgetTwice(B);
    const did = await reloaded; await reopened(A);
    let s = await st(A);
    const left = await app(A).evaluate(() => JSON.parse(sessionStorage.getItem('__leaving') || '[]'));
    t.check(saved && JSON.parse(saved).transparency === 65 && did && (await storageKeys(A)).length === 0 && (await storageGet(A, KEY)) === null, 'Forget pressed in another tab while this one traces: this tab reloads and the tool\'s key (and every other) is gone', { saved, did, keys: await storageKeys(A) });
    t.check(left.length >= 1 && left[0].streams >= 1 && left[0].live === 0 && left[0].held === 0, 'the camera was stopped and the wake lock released as this tab was left (read after its handlers ran)', left);
    t.check(!s.live && s.gum === 0 && s.card && s.start && s.transparency === '50%' && (await app(A).evaluate(() => document.getElementById('tr-transparency').value)) === '50', 'the reopened tool asks for nothing (no camera request, no photo), says Start camera, and Transparency is back at 50%', { live: s.live, gum: s.gum, transparency: s.transparency });
    t.check((await storageKeys(B)).length === 0, 'the tab that pressed Forget has no key left either', await storageKeys(B));
    await clean(t, A, 'forget from another tab');
    // pressed in this tab, from the guide, after tracing (the camera was stopped on leaving the tool, and is still wanted)
    const C = await recorded(site, { url: '#trace', init: WATCH }); pages.push(C);
    await startCamera(C); await setRange(C, 'tr-transparency', 30);
    const kept = JSON.parse((await storageGet(C, KEY)) || 'null');
    await tab(C, 'help');
    await forgetTwice(C); await reopened(C);
    s = await st(C);
    const left2 = await app(C).evaluate(() => JSON.parse(sessionStorage.getItem('__leaving') || '[]'));
    t.check(kept && kept.transparency === 30 && (await storageKeys(C)).length === 0 && !s.live && s.gum === 0 && s.transparency === '50%' && left2.every((x) => x.live === 0 && x.held === 0), 'Forget pressed from the guide after tracing: every key is gone, the camera does not come back by itself, Transparency is at 50%', { kept, keys: await storageKeys(C), live: s.live, gum: s.gum, left: left2 });
    await sleep(800);
    t.check((await storageKeys(C)).length === 0, 'nothing writes the tool\'s key again after Forget (a second later it is still gone)', await storageKeys(C));
    await clean(t, C, 'forget from the guide');
  });

  // ---- reduced motion, dark mode, storage that throws -----------------------------------------------------------------------------
  await seg(t, 'edge: reduced motion', async (pages) => {
    const run = async (reduced) => {
      const p = await recorded(site, { url: '#trace', reducedMotion: reduced }); pages.push(p);
      await startCamera(p); await click(p, '#tr-useStudy'); await click(p, '#tr-setFrame'); await click(p, '#tr-showFrame'); await click(p, '#tr-lock'); await click(p, '#tr-lock'); await setRange(p, 'tr-size', 150); await settled(p);
      const m = await app(p).evaluate(() => {
        const zero = (d) => !d || /^0s(, 0s)*$/.test(d);
        const moving = [...document.querySelectorAll('#tab-trace *, #toast')].map((e) => { const cs = getComputedStyle(e); return { id: e.id || String(e.className) || e.tagName, transition: cs.transitionDuration, animation: cs.animationName }; }).filter((x) => !zero(x.transition) || (x.animation && x.animation !== 'none'));
        return { mq: matchMedia('(prefers-reduced-motion: reduce)').matches, moving, running: document.getAnimations().length };
      });
      return { m, s: await st(p), p };
    };
    const r = await run(true);
    t.check(r.m.mq && r.m.moving.length === 0 && r.m.running === 0 && r.s.live && r.s.photoShown && r.s.ghostShown && r.s.pressed.show === 'true', 'reduced motion: nothing in the tool or its toast has a transition or an animation, none is running, and the tool works all the same (camera, photo, frame)', r.m);
    await clean(t, r.p, 'reduced motion');
    const n = await run(false);
    t.check(!n.m.mq && n.m.moving.some((x) => x.id === 'toast'), 'with motion allowed the toast does transition (so the reduced-motion check above is not vacuous)', n.m.moving);
    await clean(t, n.p, 'motion allowed');
  });

  await seg(t, 'edge: dark mode', async (pages) => {
    const got = {};
    for (const dark of [false, true]) {
      const p = await recorded(site, { url: '#trace', dark }); pages.push(p);
      const card = await app(p).evaluate(CONTRAST);
      await startCamera(p); await click(p, '#tr-useStudy'); await click(p, '[data-mode="advanced"]'); await click(p, '#tr-lock'); await click(p, '#tr-showFrame'); await click(p, '#tr-setFrame'); await click(p, '#tr-showFrame'); await settled(p);
      const on = await app(p).evaluate(CONTRAST);
      got[dark ? 'dark' : 'light'] = { card, on };
      const low = Object.entries({ ...card.ratios, ...on.ratios }).filter(([, v]) => v < 4.5).map(([k, v]) => `${k} ${v}`);
      t.check(low.length === 0, `${dark ? 'dark' : 'light'} mode: every text of the tool reads at 4.5 : 1 or better (the card, the strip's labels, the sliders, a pressed button, the status line over a white paper)`, { low, ratios: { ...card.ratios, ...on.ratios } });
      await screenshot(p, `trace-edge-${dark ? 'dark' : 'light'}`);
      await clean(t, p, `${dark ? 'dark' : 'light'} mode`);
    }
    t.check(got.light.card.stage < 0.2 && got.light.card.strip > 0.7 && got.dark.card.strip < 0.2 && got.dark.card.page < 0.2 && got.light.card.page > 0.5, 'dark mode takes hold of the tool: the strip and the page are dark in the dark scheme and light in the light one (the camera\'s stage is dark in both)', { light: [got.light.card.strip, got.light.card.page], dark: [got.dark.card.strip, got.dark.card.page], stage: got.light.card.stage });
    // axe over the tool as a visitor sees it: the card up, then the camera on with a photo, a frame and Lock; light and dark, wide and phone
    const found = [];
    for (const dark of [false, true]) for (const vp of [DESKTOP, PHONE]) {
      const p = await recorded(site, { url: '#trace', dark, viewport: vp, bypassCSP: true }); pages.push(p);
      const up = await axe(p);
      await startCamera(p); await click(p, '#tr-useStudy'); await click(p, '[data-mode="advanced"]'); await click(p, '#tr-setFrame'); await click(p, '#tr-showFrame'); await click(p, '#tr-lock'); await settled(p); await sleep(300);
      const on = await axe(p);
      for (const [state, list] of [['card up', up], ['camera on', on]]) for (const v of list) if (v.nodes.some((n) => /#tr-|\.tr-|#tab-trace/.test(n))) found.push({ at: `${dark ? 'dark' : 'light'} ${vp.width}, ${state}`, id: v.id, impact: v.impact, nodes: v.nodes.filter((n) => /#tr-|\.tr-|#tab-trace/.test(n)).slice(0, 3) });
    }
    const serious = found.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    t.check(serious.length === 0, 'axe-core finds no serious or critical issue in the tool (card up and camera on; light and dark; 1400 and 390 wide)', serious.length ? serious : found);
    if (found.length && !serious.length) t.note(`axe, lesser issues in the tool: ${JSON.stringify(found).slice(0, 600)}`);
  });

  await seg(t, 'edge: storage that throws', async (pages) => {
    const page = await recorded(site, { url: '#trace', init: () => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; Storage.prototype.getItem = function () { throw new DOMException('denied', 'SecurityError'); }; } }); pages.push(page);
    await startCamera(page); await click(page, '#tr-useStudy');
    await setRange(page, 'tr-transparency', 30); await setRange(page, 'tr-strength', 60); await settled(page);
    const s = await st(page);
    t.check(s.live && s.photoShown && near(s.opacity, 0.7, 0.01) && s.transparency === '30%', 'storage that throws on every read and write: the tool runs, and the sliders work for the visit', { live: s.live, opacity: s.opacity, transparency: s.transparency });
    await clean(t, page, 'storage that throws');
  });

  // ---- seeded random use: the invariants hold whatever the order -------------------------------------------------------------------
  await seg(t, 'edge: seeded random use', async (pages) => {
    for (const [seed, granted] of [[11, false], [12, true]]) {
      const r = await fuzzRun(site, pages, seed, 70, granted);
      t.check(r.bad.length === 0 && r.errors.length === 0, `70 seeded random steps (seed ${seed}, camera ${granted ? 'allowed' : 'asked each time'}): never two live tracks, the camera on only while its tab is open and the page shown, the wake lock held exactly while it runs, the card, the frame and the buttons in step with it, the photo within its limits, no page error`, { violations: r.bad.slice(0, 4), errors: r.errors, ops: r.counts });
      if (r.bad.length) {
        const again = await fuzzRun(site, pages, seed, 70, granted);
        if (again.bad.length) t.finding({ title: `Random use (seed ${seed}) breaks an invariant of the camera or its screen lock`, severity: 'medium', steps: `node tests/run.mjs --only trace: the seeded sequence of ${r.bad[0].log.join(', ')} (and the steps before it) with the camera ${granted ? 'allowed for the site' : 'asked each time'}.`, expected: 'README: the camera is on only between Start camera and Stop camera, never while the tab is closed or the page out of sight; the screen is kept awake while it runs.', actual: JSON.stringify(r.bad.slice(0, 3)), cause: 'see the violation and the steps before it; reproduced on a second run of the same seed' });
      }
    }
  });
}

// the worst reading of every text pair of the tool in the scheme the page is in, as the page paints them (passed to evaluate)
const CONTRAST = () => {
  const num = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2); };
  const q = (s) => document.querySelector(s), cs = (e, p) => getComputedStyle(e)[p];
  const ratios = {};
  const put = (name, fg, bg) => { const f = num(fg), b = num(bg); if (f.length >= 3 && b.length >= 3) ratios[name] = ratio(f, b); };
  put('strip labels (Photo)', cs(q('#tr-choose .tr-cap'), 'color'), cs(q('#tr-strip'), 'backgroundColor'));
  put('slider labels', cs(q('.tr-range label'), 'color'), cs(q('#tr-strip'), 'backgroundColor'));
  put('slider read-outs', cs(q('.tr-range output'), 'color'), cs(q('#tr-strip'), 'backgroundColor'));
  if (!q('#tr-card').hidden) {
    put('card title', cs(q('.tr-title'), 'color'), cs(q('#tr-card'), 'backgroundColor'));
    put('card words', cs(q('#tr-say'), 'color'), cs(q('#tr-card'), 'backgroundColor'));
    put('Start camera', cs(q('#tr-start'), 'color'), cs(q('#tr-start'), 'backgroundColor'));
  }
  if (q('#tr-lock').getAttribute('aria-pressed') === 'true') put('a pressed button (Lock)', cs(q('#tr-lock'), 'color'), cs(q('#tr-lock'), 'backgroundColor'));
  if (q('#tr-status').textContent) { const b = num(cs(q('#tr-status'), 'backgroundColor')), a = b.length > 3 ? b[3] : 1; ratios['status line over white'] = ratio(num(cs(q('#tr-status'), 'color')), [0, 1, 2].map((i) => b[i] * a + 255 * (1 - a))); }
  return { ratios, strip: +lum(num(cs(q('#tr-strip'), 'backgroundColor'))).toFixed(3), page: +lum(num(cs(document.body, 'backgroundColor'))).toFixed(3), stage: +lum(num(cs(q('#tr-stage'), 'backgroundColor'))).toFixed(3) };
};

// ten steps' worth of a visitor, seeded: the camera, the frame, the photo, the tabs, the page's visibility, the window, the fingers.
// After each pause the invariants are read; `bad` holds every one that failed, with the steps before it.
async function fuzzRun(site, pages, seed, steps, granted) {
  const page = await recorded(site, { url: '#trace', init: SECOND_CAMERA }); pages.push(page);
  if (granted) await allowCamera(page, site);
  await app(page).evaluate(() => {
    const md = navigator.mediaDevices, prev = md.getUserMedia.bind(md); md.getUserMedia = (c) => (window.__delay ? new Promise((res, rej) => setTimeout(() => prev(c).then(res, rej), window.__delay)) : prev(c));
    const wprev = navigator.wakeLock.request.bind(navigator.wakeLock); navigator.wakeLock.request = (x) => (window.__wdelay ? new Promise((res, rej) => setTimeout(() => wprev(x).then(res, rej), window.__wdelay)) : wprev(x));
  });
  let a = seed;
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const img = grayPng(120, 90, 'f.png');
  const tabOp = (n) => app(page).evaluate((n) => document.querySelector(`[data-tab="${n}"]`).click(), n);
  const ops = {
    start: () => click(page, '#tr-start'), cam: () => click(page, '#tr-camera'), setFrame: () => click(page, '#tr-setFrame'), showFrame: () => click(page, '#tr-showFrame'),
    photo: () => app(page).setInputFiles('#tr-file', { ...img, name: `p${Math.floor(rnd() * 1e4)}.png` }), study: () => click(page, '#tr-useStudy'), lock: () => click(page, '#tr-lock'), fit: () => click(page, '#tr-fit'), turn: () => click(page, '#tr-turn'), sw: () => click(page, '#tr-switch'),
    size: () => setRange(page, 'tr-size', Math.floor(rnd() * 201)), transp: () => setRange(page, 'tr-transparency', Math.floor(rnd() * 101)),
    flip: () => app(page).evaluate(() => { document.querySelector('[data-tab="study"]').click(); document.querySelector('[data-tab="trace"]').click(); }), away: () => tabOp('study'), back: () => tabOp('trace'),
    hide: () => hideDoc(page, true), show: () => hideDoc(page, false),
    mode: () => click(page, `[data-mode="${pick(['simple', 'advanced'])}"]`),
    delay: () => app(page).evaluate(([d, w]) => { window.__delay = d; window.__wdelay = w; }, [pick([0, 0, 300, 900]), pick([0, 0, 120])]),
    fail: () => app(page).evaluate((e) => { window.__gumError = e; }, pick(['', '', 'NotAllowedError', 'NotFoundError'])),
    resize: () => page.setViewportSize(pick([DESKTOP, PHONE, SIDE])),
    drag: async () => { const b = await app(page).evaluate(() => { const r = document.getElementById('tr-hit').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }); if (!b[2]) return; await page.mouse.move(b[0] + b[2] / 2, b[1] + b[3] / 2); await page.mouse.down(); await page.mouse.move(b[0] + b[2] * rnd(), b[1] + b[3] * rnd(), { steps: 3 }); await page.mouse.up(); },
    keys: async () => { await page.focus('#tr-hit').catch(() => null); await page.keyboard.press(pick(['ArrowLeft', 'ArrowUp', '+', '-', 'Shift+ArrowRight'])); },
  };
  const weights = { start: 3, cam: 4, setFrame: 3, showFrame: 3, photo: 3, study: 2, lock: 2, sw: 2, size: 2, flip: 3, away: 2, back: 3, hide: 2, show: 3, delay: 2, drag: 2, keys: 2 };
  const bag = Object.keys(ops).flatMap((n) => Array(weights[n] || 1).fill(n));
  const free = new Set(['flip', 'away', 'back', 'hide', 'show', 'delay', 'fail', 'resize', 'mode']);
  const bad = [], errors = [], counts = {}, log = [];
  const check = async (i) => {
    await sleep(1200); await settled(page);
    const s = await app(page).evaluate(() => {
      const v = document.getElementById('tr-video'), all = window.__streams.flatMap((x) => x.getTracks()), on = !!Trace.state.stream, active = Studio.tab() === 'trace';
      const w = document.getElementById('tr-wrap').getBoundingClientRect(), stg = document.getElementById('tr-stage').getBoundingClientRect(), pl = Trace.state.place;
      return {
        on, active, live: all.filter((x) => x.readyState === 'live').length, held: window.__wake.held, starting: Trace.state.starting, hiddenDoc: document.hidden,
        srcOk: on ? v.srcObject === Trace.state.stream : !v.srcObject, cardHidden: document.getElementById('tr-card').hidden, ghost: !document.getElementById('tr-ghost').hidden, frame: Trace.state.frame, shown: Trace.state.frameShown,
        setOff: document.getElementById('tr-setFrame').disabled, vw: v.videoWidth, pl: { ...pl }, pct: Trace.sizePct(), photo: !!Trace.state.photo, locked: Trace.state.locked, lockPressed: document.getElementById('tr-lock').getAttribute('aria-pressed'),
        wrapIn: !active || (w.left >= stg.left - 1 && w.right <= stg.right + 1 && w.top >= stg.top - 1 && w.bottom <= stg.bottom + 1),
      };
    });
    const v = [];
    if (s.live > 1) v.push(`${s.live} live tracks`);
    if (s.live !== (s.on ? 1 : 0)) v.push(`${s.live} live tracks but the tool's stream is ${s.on ? 'set' : 'not set'}`);
    if (!s.active && s.on) v.push('camera on while another tab is open');
    if (s.hiddenDoc && s.on) v.push('camera on while the page is hidden');
    if (s.held > 1) v.push(`wake lock held ${s.held} times`);
    if (s.on && !s.hiddenDoc && s.held !== 1) v.push(`camera on, page shown, wake lock held ${s.held} times`);
    if (!s.on && s.held !== 0) v.push(`camera off, wake lock held ${s.held} times`);
    if (s.starting) v.push('still starting after the pause');
    if (!s.srcOk) v.push('video source out of step with the stream');
    if (s.active && s.cardHidden !== s.on) v.push(`card ${s.cardHidden ? 'hidden' : 'shown'} while the camera is ${s.on ? 'on' : 'off'}`);
    if (s.ghost !== (s.on && s.frame && s.shown)) v.push(`frame ${s.ghost ? 'shown' : 'hidden'} with camera ${s.on}, frame ${s.frame}, Show frame ${s.shown}`);
    if (s.active && s.setOff !== !(s.on && s.vw > 0)) v.push(`Set frame ${s.setOff ? 'off' : 'on'} with camera ${s.on}, picture ${s.vw}`);
    if (!s.wrapIn) v.push('camera picture outside its stage');
    if (!(s.pl.cx >= 0 && s.pl.cx <= 1 && s.pl.cy >= 0 && s.pl.cy <= 1 && Number.isFinite(s.pl.w) && s.pct >= 20 && s.pct <= 400)) v.push(`photo place out of range ${JSON.stringify([s.pl, s.pct])}`);
    if (s.lockPressed !== String(s.photo && s.locked)) v.push('Lock pressed out of step with the photo');
    if (v.length) bad.push({ step: i, v, log: log.slice(-6) });
  };
  let hidden = false;
  for (let i = 0; i < steps; i++) {
    const n = pick(bag); log.push(n); counts[n] = (counts[n] || 0) + 1;
    // a visitor reaches the tool's controls only on its tab and with the page shown
    const usable = await app(page).evaluate(() => Studio.tab() === 'trace' && !document.hidden);
    if (!free.has(n) && !usable) { log.pop(); counts[n]--; continue; }
    try { await ops[n](); } catch (e) { errors.push(`${n}: ${String(e && e.message).slice(0, 80)}`); }
    if (n === 'hide') hidden = true; if (n === 'show') hidden = false;
    if (n === 'hide' || n === 'show' || rnd() < 0.3 || i === steps - 1) { if (hidden) { await hideDoc(page, false); hidden = false; log.push('show'); } await check(i); }
  }
  for (const m of page.log.pageerrors.concat(page.log.console)) errors.push(m.slice(0, 120));
  return { bad, errors, counts };
}

// =====================================================================================================================
// The reviews' findings, pinned: the focus when the camera starts, a lens that will not open, the photo's size when the
// camera's picture takes another shape, Set frame before a picture is there, the strip and the toast on a small phone.
// =====================================================================================================================

// a second camera that is listed but never opens (some phones list lenses that do not), counted by the page's record
const BROKEN_LENS = () => {
  const md = navigator.mediaDevices, list = md.enumerateDevices.bind(md), ask = md.getUserMedia.bind(md);
  md.enumerateDevices = () => list().then((all) => (all.some((d) => d.kind === 'videoinput' && d.deviceId) ? all.concat([{ kind: 'videoinput', deviceId: 'second-camera', label: 'Back lens', groupId: 'g2' }]) : all));
  md.getUserMedia = (c) => (c && c.video && c.video.deviceId && c.video.deviceId.exact === 'second-camera' ? Promise.reject(new DOMException('another app has it', 'NotReadableError')) : ask(c));
};
const focusKey = async (page, selector, key = 'Enter') => { await page.focus(selector); await page.keyboard.press(key); };

async function reviewFixes(t, site) {
  // ---- the keyboard's focus is never dropped to the page by Start camera or Switch -------------------------------------
  await seg(t, 'review: the focus when the camera starts', async (pages) => {
    const page = await recorded(site, { url: '#trace', init: SECOND_CAMERA }); pages.push(page);
    await click(page, '[data-mode="advanced"]');
    await focusKey(page, '#tr-start');
    t.check(await live(page, 10000), 'Enter on Start camera starts the camera');
    await settled(page);
    let s = await st(page);
    t.check(!s.card && (await active(page)) === 'tr-camera', 'after Enter on Start camera the card has gone and the focus is on Camera (now Stop camera), not on the page', { card: s.card, focus: await active(page) });
    // Switch from the keyboard: the button is off while the camera changes over, and has the focus again after
    await page.waitForFunction(() => Trace.state.cameras.length === 2, null, { timeout: 5000 }).catch(() => null);
    const g0 = (await tracks(page)).gum;
    await focusKey(page, '#tr-switch');
    await page.waitForFunction((n) => window.__gum.length > n && Trace.state.stream && !Trace.state.starting, g0, { timeout: 10000 }).catch(() => null);
    await settled(page);
    t.check((await tracks(page)).gum === g0 + 1 && (await st(page)).live && (await active(page)) === 'tr-switch', 'after Enter on Switch the camera has changed over and the focus is on Switch', { asked: (await tracks(page)).gum - g0, focus: await active(page) });
    // a refusal: the card stays, and the focus is on Start camera again (it was off while the browser was asked)
    await click(page, '#tr-camera'); await settled(page);
    await app(page).evaluate(() => { window.__gumError = 'NotAllowedError'; });
    await focusKey(page, '#tr-start');
    await app(page).waitForFunction(() => /refused/.test(document.getElementById('tr-say').textContent), null, { timeout: 8000 }).catch(() => null);
    await settled(page);
    s = await st(page);
    t.check(!s.live && s.card && s.start && !s.startOff && (await active(page)) === 'tr-start', 'a refused camera: the card says so and the focus is on Start camera, ready to try again', { say: s.say.slice(0, 40), focus: await active(page) });
    await app(page).evaluate(() => { window.__gumError = null; });
    // the visitor moves the focus while the browser is asked: the answer does not take it back
    await slowCamera(page, 900);
    await focusKey(page, '#tr-start');
    await page.focus('#tr-choose');
    await live(page, 10000); await settled(page);
    t.check((await st(page)).live && (await active(page)) === 'tr-choose', 'a visitor who moved the focus to Photo while the browser was being asked keeps it there when the camera comes on', { focus: await active(page) });
    // a mouse press on Start camera puts the focus on Camera too, without a keyboard ring
    await click(page, '#tr-camera'); await settled(page);
    await page.click('#tr-start');
    await live(page, 10000); await settled(page);
    const ring = await app(page).evaluate(() => ({ id: document.activeElement && document.activeElement.id, visible: document.activeElement.matches(':focus-visible') }));
    t.check(ring.id === 'tr-camera' && !ring.visible, 'a mouse press on Start camera: the focus is on Camera, with no keyboard focus ring', ring);
    await clean(t, page, 'the focus when the camera starts');
  });

  // ---- a lens that is listed but will not open: the default camera instead, not a button that asks for it again --------
  await seg(t, 'review: a lens that will not open', async (pages) => {
    const page = await recorded(site, { url: '#trace', init: BROKEN_LENS }); pages.push(page);
    await click(page, '[data-mode="advanced"]');
    await startCamera(page);
    await page.waitForFunction(() => Trace.state.cameras.length === 2, null, { timeout: 5000 }).catch(() => null);
    await click(page, '#tr-setFrame'); await click(page, '#tr-showFrame');
    const g0 = (await tracks(page)).gum;
    await click(page, '#tr-switch');
    await app(page).waitForFunction((n) => window.__gum.length >= n + 2 && Trace.state.stream && !Trace.state.starting, g0, { timeout: 10000 }).catch(() => null);
    await settled(page);
    let s = await st(page);
    const asked = await page.evaluate((n) => window.__gum.slice(n).map((x) => JSON.parse(x).video), g0);
    const dev = await app(page).evaluate(() => Trace.state.deviceId);
    t.check(s.live && !s.card && dev === '' && asked.length === 2 && asked[0].deviceId && asked[0].deviceId.exact === 'second-camera' && asked[1].facingMode && asked[1].facingMode.ideal === 'environment', 'Switch to a lens that will not open (NotReadableError): the default camera is asked for next and runs, with no error left on the card and no lens remembered', { live: s.live, card: s.card, dev, asked });
    t.check(!s.frame && !s.ghostShown && (await tracks(page)).live === 1 && (await tracks(page)).held === 1, 'and the frame of the first camera is let go, one camera runs, one screen lock is held', { frame: s.frame, k: await tracks(page) });
    // Start camera after a stop asks for the default camera, not the lens again
    await click(page, '#tr-camera'); await settled(page);
    const g1 = (await tracks(page)).gum;
    await startCamera(page);
    const next = await page.evaluate((n) => window.__gum.slice(n).map((x) => JSON.parse(x).video), g1);
    t.check(next.length === 1 && next[0].facingMode && next[0].facingMode.ideal === 'environment', 'Start camera after that asks for the default camera once, as at the first start', next);
    // a chosen lens that will not open at Start (it worked before): the default one, and a frame taken from the lens goes
    await click(page, '#tr-setFrame');
    await app(page).evaluate(() => { Trace.state.deviceId = 'second-camera'; });
    await click(page, '#tr-camera'); await settled(page);
    await click(page, '#tr-camera');
    await live(page, 10000); await settled(page);
    s = await st(page);
    t.check(s.live && !s.frame && (await app(page).evaluate(() => Trace.state.deviceId)) === '', 'Start camera with a remembered lens that will not open: the default camera runs, and the frame taken from the lens is let go', { live: s.live, frame: s.frame });
    // asked again and again, it never gets stuck
    for (let i = 0; i < 3; i++) { await click(page, '#tr-switch'); await settled(page); await sleep(300); }
    await live(page, 10000);
    t.check((await st(page)).live && (await tracks(page)).live === 1, 'Switch pressed three more times: the camera is on, one stream live', await tracks(page));
    await clean(t, page, 'a lens that will not open');
  });

  // ---- the photo keeps its size (the Size read-out) when the camera's picture takes another shape --------------------------
  await seg(t, 'review: a size kept across a new picture shape', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    await click(page, '[data-mode="advanced"]');
    // with no photo: the Size slider reads 100% to a screen reader too
    const none = await app(page).evaluate(() => { const e = document.getElementById('tr-size'); return { text: e.getAttribute('aria-valuetext'), out: document.getElementById('tr-sizeOut').textContent, off: e.disabled }; });
    t.check(none.off && none.text === '100% of the fitted size' && none.out === '100%', 'with no photo the Size slider says 100% of the fitted size (not its raw number)', none);
    // a photo sized before the camera runs keeps its size when the camera's picture gives the view its shape
    await click(page, '#tr-useStudy'); await setRange(page, 'tr-size', 150); await settled(page);
    const before = await st(page), b0 = await boxes(page);
    await startCamera(page); await sleep(400); await settled(page);
    let s = await st(page), b = await boxes(page);
    t.check(near(s.pct, before.pct, 1) && near(b.cx, b0.cx, 0.01) && near(b.cy, b0.cy, 0.01) && s.size === before.size, 'a photo sized with the camera off keeps its Size (and its centre over the view) when the camera comes on and gives the view its shape', { before: [before.pct, b0.cx, b0.cy], after: [s.pct, b.cx, b.cy], size: [before.size, s.size] });
    // the picture 16:9 becoming 4:3 (a phone turned gives a new size too)
    await drag(page, 50, -30);
    s = await st(page); b = await boxes(page);
    const pct = s.pct, cx = b.cx, cy = b.cy;
    const applied = await app(page).evaluate(async () => { try { await Trace.state.stream.getVideoTracks()[0].applyConstraints({ width: { exact: 640 }, height: { exact: 480 } }); return 'ok'; } catch (err) { return String(err); } });
    await app(page).waitForFunction(() => document.getElementById('tr-video').videoWidth === 640, null, { timeout: 8000 }).catch(() => null);
    await sleep(400); await settled(page);
    s = await st(page); b = await boxes(page);
    if (applied !== 'ok') t.note(`the fake camera would not change its size (${applied}): the size-kept check did not apply`);
    t.check(applied !== 'ok' || (s.vw === 640 && near(s.pct, pct, 1) && near(b.cx, cx, 0.01) && near(b.cy, cy, 0.01)), 'the camera\'s picture changing shape (16:9 to 4:3): the photo keeps its Size read-out and its centre over the picture', { applied, video: [s.vw, s.vh], pct: [pct, s.pct], centre: [[cx, cy], [b.cx, b.cy]] });
    // a fitted photo stays fitted
    await click(page, '#tr-fit'); await settled(page);
    await app(page).evaluate(async () => { await Trace.state.stream.getVideoTracks()[0].applyConstraints({ width: { exact: 1280 }, height: { exact: 720 } }).catch(() => null); });
    await app(page).waitForFunction(() => document.getElementById('tr-video').videoWidth === 1280, null, { timeout: 8000 }).catch(() => null);
    await sleep(400); await settled(page);
    s = await st(page); b = await boxes(page);
    t.check(s.place.fitted && s.pct === 100 && fitsPicture(b) && (near(b.photo.w, b.wrap.w, 2) || near(b.photo.h, b.wrap.h, 2)), 'a fitted photo stays fitted when the picture changes shape again', { fitted: s.place.fitted, pct: s.pct });
    await clean(t, page, 'a size kept across a new picture shape');
    async function drag(pg, dx, dy) { const C = await centre(pg); await pg.mouse.move(C.x, C.y); await pg.mouse.down(); await pg.mouse.move(C.x + dx, C.y + dy, { steps: 4 }); await pg.mouse.up(); await settled(pg); }
  });

  // ---- Set frame waits for a picture, not just a size -----------------------------------------------------------------
  await seg(t, 'review: Set frame waits for a picture', async (pages) => {
    const page = await recorded(site, { url: '#trace' }); pages.push(page);
    // the video says it has its size but no picture yet (readyState 1, as before its first frame arrives)
    await app(page).evaluate(() => { window.__ready = 1; Object.defineProperty(document.getElementById('tr-video'), 'readyState', { configurable: true, get: () => window.__ready }); });
    await startCamera(page); await sleep(500); await settled(page);
    let s = await st(page);
    const g0 = await app(page).evaluate(() => { const g = document.getElementById('tr-ghost'); return `${g.width}x${g.height}`; });
    await app(page).evaluate(() => document.getElementById('tr-setFrame').click());
    t.check(s.live && s.vw > 0 && s.off.setFrame === 'tr-whyCamera' && !(await st(page)).frame && (await app(page).evaluate(() => { const g = document.getElementById('tr-ghost'); return `${g.width}x${g.height}`; })) === g0, 'the camera has told its size but has no picture yet: Set frame is off with its reason, and pressed anyway it keeps nothing', { off: s.off.setFrame, size: s.vw });
    await app(page).evaluate(() => { window.__ready = 4; document.getElementById('tr-video').dispatchEvent(new Event('loadeddata')); });
    await settled(page);
    s = await st(page);
    await click(page, '#tr-setFrame');
    const g = await picture(page, 'tr-ghost');
    t.check(!s.off.setFrame && (await st(page)).frame && g.spread > 40 && g.opaque > 0.95, 'once the picture is there (loadeddata) Set frame comes on and keeps a real still', { off: s.off.setFrame, ghost: g });
    await clean(t, page, 'Set frame waits for a picture');
  });

  // ---- the strip, the sliders and the toast on small phones ------------------------------------------------------------------
  await seg(t, 'review: the strip on small phones', async (pages) => {
    const open = async (vp, mode) => {
      const context = await site.browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
      await context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { /* none */ } }, ['portrait-value-studio.mode', mode]);
      const page = await context.newPage();
      page.log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
      page.on('pageerror', (e) => page.log.pageerrors.push(String(e.message).slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error') page.log.console.push(m.text().slice(0, 300)); });
      page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) page.log.offsite.push(u); });
      await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${e.blockedURI}`); }); });
      await page.addInitScript(SECOND_CAMERA);
      await page.addInitScript(RECORD);
      pages.push(page);
      await page.goto(site.base + '#trace', { waitUntil: 'load' });
      await page.waitForFunction(() => window.Trace && Studio.result(), null, { timeout: 30000 }).catch(() => null);
      await startCamera(page); await page.waitForFunction(() => Trace.state.cameras.length === 2, null, { timeout: 5000 }).catch(() => null);
      await click(page, '#tr-useStudy'); await sleep(300); await settled(page);
      return page;
    };
    const measure = (page) => app(page).evaluate(() => {
      const shown = (e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none';
      const W = innerWidth, H = innerHeight;
      const btns = [...document.querySelectorAll('#tr-strip button')].filter(shown).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, off: r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1 }; });
      const ranges = [...document.querySelectorAll('#tr-strip input[type=range]')].filter(shown).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, h: Math.round(r.height * 10) / 10, off: r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1 }; });
      // a caption with one word must stay on one line (a long cell breaks it in the middle otherwise)
      const caps = [...document.querySelectorAll('#tr-strip .tr-cap')].filter(shown).map((c) => { const rg = document.createRange(); rg.selectNodeContents(c); const lines = new Set([...rg.getClientRects()].map((q) => Math.round(q.top))).size; return { text: c.textContent, lines, one: !/\s/.test(c.textContent.trim()) }; });
      const wrap = document.getElementById('tr-wrap').getBoundingClientRect();
      return { btns, ranges, caps, wrapH: Math.round(wrap.height), capsHidden: [...document.querySelectorAll('#tr-strip .tr-cap')].filter((c) => !c.closest('[hidden]') && getComputedStyle(c.closest('button')).display !== 'none' && c.getBoundingClientRect().width === 0).length, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    for (const [w, h, modes] of [[320, 568, ['simple', 'advanced']], [360, 640, ['simple', 'advanced']], [375, 667, ['simple', 'advanced']], [390, 844, ['simple', 'advanced']], [430, 932, ['advanced']], [844, 390, ['advanced']], [568, 320, ['advanced']]]) {
      for (const mode of modes) {
        const page = await open({ width: w, height: h }, mode);
        const m = await measure(page);
        const small = w < 375 || (mode === 'advanced' && w <= 480 && h > w);
        t.check(m.btns.length >= (mode === 'simple' ? 8 : 10) && m.btns.every((x) => !x.off && x.w >= 40 && x.h >= 40), `${w} × ${h}, ${mode}: every button of the strip is on the screen and at least 40 × 40`, m.btns.filter((x) => x.off || x.w < 40 || x.h < 40));
        t.check(m.ranges.length >= (mode === 'simple' ? 2 : 3) && m.ranges.every((x) => !x.off && x.h >= 40), `${w} × ${h}, ${mode}: every slider is on the screen and at least 40 px tall`, m.ranges);
        t.check(m.capsHidden === 0 && m.caps.length >= m.btns.length - 1 && m.caps.filter((x) => x.one).every((x) => x.lines === 1) && m.sideways <= 0 && m.wrapH >= 100, `${w} × ${h}, ${mode}: every button shows its caption, no one-word caption is broken across lines, the camera picture keeps room, no sideways scroll`, { caps: m.caps.filter((x) => x.one && x.lines !== 1), shown: m.caps.length, buttons: m.btns.length, hidden: m.capsHidden, wrapH: m.wrapH, sideways: m.sideways });
        if (small) await screenshot(page, `trace-strip-${w}x${h}-${mode}`);
        await clean(t, page, `strip ${w} x ${h} ${mode}`);
        await page.context().close().catch(() => null);
      }
    }
    // the toast on a 320 px phone: as wide as its words allow (not half the screen), clear of the card's button
    const page = await open({ width: 320, height: 568 }, 'simple');
    await armToast(page); await click(page, '#tr-setFrame');
    await toastMatch(page, /Frame set/);
    await click(page, '#tr-camera'); await settled(page); await sleep(300);
    const r = await app(page).evaluate(() => {
      const t = document.getElementById('toast'), b = document.getElementById('tr-start'), q = t.getBoundingClientRect(), s = b.getBoundingClientRect();
      const ix = Math.max(0, Math.min(q.right, s.right) - Math.max(q.left, s.left)), iy = Math.max(0, Math.min(q.bottom, s.bottom) - Math.max(q.top, s.top));
      return { shown: t.classList.contains('show'), w: Math.round(q.width), h: Math.round(q.height), left: Math.round(q.left), right: Math.round(q.right), covers: +((ix * iy) / (s.width * s.height)).toFixed(2), vw: innerWidth };
    });
    t.check(r.shown && r.w >= 240 && r.left >= 0 && r.right <= r.vw && r.covers === 0, 'on a 320 px phone the Frame note is as wide as the picture allows (not half the screen), inside the screen, and does not cover the card\'s Start camera button', r);
    await clean(t, page, 'the toast on a small phone');
  });
}
