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
import { openPage, clean, tab, app, DESKTOP, PHONE, makeImage, textFile, brokenImage, svgImage, click, text, sleep, storageGet, storageKeys, PROTO_NAMES, screenshot } from '../lib.mjs';
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
    // Set frame again takes a new still (the fake camera's picture moves on)
    const p1 = await page.evaluate(() => { const c = document.getElementById('tr-ghost'); return c.toDataURL().length; });
    await sleep(700); await click(page, '#tr-setFrame');
    const p2 = await page.evaluate(() => document.getElementById('tr-ghost').toDataURL().length);
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
}
