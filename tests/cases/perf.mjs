// Performance and memory, measured rather than guessed. Each main interaction is timed with the browser's own
// instruments: the Long Tasks API in the page (every main-thread task over 50 ms, with its start), CDP
// Performance.getMetrics (script time, heap, DOM nodes and listeners), CDP Emulation.setCPUThrottlingRate (1 for
// this machine, 4 for a phone), the wall time of each real mouse event (Playwright returns when the page has
// handled it, so a blocked main thread shows as that call's latency), a double-frame probe for a click's time to
// the next painted frame, and /proc for the renderer's resident memory.
//
// The budgets are the ones that keep a page responsive: no single task over about 200 ms at full speed for an
// input response (a drag, a tap), and when work takes longer, a progress note painted before it starts (the
// page's own "Updating..." pill must be on screen, with a frame drawn, before any task over 100 ms; nothing but a
// shown pill can tell a visitor a frozen page is working). The README makes no timing promise of its own, so
// every number is recorded in the notes. Pose and light and Figure study draw with WebGL; in this harness that is
// SwiftShader, a software rasteriser that makes each frame cost 150-350 ms of main-thread time that a GPU does not,
// so for those two only the page's own script time is held to a budget and the task lengths are notes.
//
// Memory: each action is repeated 16-36 times after a warm-up and the JS heap (after a forced collection), the DOM
// node and listener counts, the live object URLs (URL.createObjectURL minus revokeObjectURL) and the live WebGL
// objects (created minus deleted, by kind) must not grow. The renderer's resident size is a note and a loose bound
// only: Chromium's own decoded-image cache grows it by about 3 MB per picture shown until it reaches a ceiling
// (measured here with a page that does nothing but show and drop 60 PNGs), so it cannot tell a leak from a cache.
//
// One finding per root cause, each confirmed by at least two runs of the same step (the check fails only when every
// run is over budget).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { openPage, clean, tab, app, poseFrame, makeImage, stroke, inked, click, sleep, DESKTOP } from '../lib.mjs';

// ---------------------------------------------------------------------------------------------------------------
// What runs inside every page and frame before the site's own scripts: long tasks, the "Updating..." pill, frames,
// live object URLs and live WebGL objects.
function instrument() {
  const pf = window.__pf = { lt: [], busy: [], raf: [], rafOn: false, looping: false, t0: 0, busyAtStart: false };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) pf.lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* no long task API */ }
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('busy');
    if (b) new MutationObserver(() => pf.busy.push({ t: performance.now(), hidden: b.hidden })).observe(b, { attributes: true, attributeFilter: ['hidden'] });
  });
  const live = new Set();
  window.__blobs = { live, made: 0, revoked: 0 };
  const mk = URL.createObjectURL.bind(URL), rv = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (b) => { const u = mk(b); live.add(u); window.__blobs.made++; return u; };
  URL.revokeObjectURL = (u) => { if (live.delete(u)) window.__blobs.revoked++; return rv(u); };
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window), ivs = window.__intervals = new Set();
  window.setInterval = (...a) => { const id = si(...a); ivs.add(id); return id; };
  window.clearInterval = (id) => { ivs.delete(id); return ci(id); };
  const gl = window.__gl = { made: {}, gone: {} };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const kind of ['Texture', 'Framebuffer', 'Renderbuffer', 'Buffer', 'Program', 'VertexArray']) {
      const make = C.prototype['create' + kind], drop = C.prototype['delete' + kind];
      if (!make || !drop) continue;
      C.prototype['create' + kind] = function (...a) { gl.made[kind] = (gl.made[kind] || 0) + 1; return make.apply(this, a); };
      C.prototype['delete' + kind] = function (...a) { if (a[0]) gl.gone[kind] = (gl.gone[kind] || 0) + 1; return drop.apply(this, a); };
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// A 12000 x 9000 PNG (108 megapixels) written to disk row by row, upscaled from a small painted portrait so it
// compresses to a few MB: a file that size would not fit through the page as a data URL, and building it in the
// page would itself take 430 MB.
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
async function writeBigPng(file, W, H) {
  const sw = 480, sh = Math.max(2, Math.round(480 * H / W)), src = new Uint8Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    let r = 138 - 80 * y / sh, g = 154 - 80 * y / sh, b = 166 - 114 * y / sh;
    const dx = (x - sw * 0.5) / (sw * 0.22), dy = (y - sh * 0.42) / (sh * 0.25), hx = (x - sw * 0.5) / (sw * 0.24), hy = (y - sh * 0.25) / (sh * 0.12);
    if (dx * dx + dy * dy < 1) { r = 201; g = 143; b = 106; }
    if (hx * hx + hy * hy < 1) { r = 107; g = 63; b = 42; }
    if (y > sh * 0.68) { r = 31; g = 42; b = 51; }
    const i = (y * sw + x) * 3; src[i] = r; src[i + 1] = g; src[i + 2] = b;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const z = zlib.createDeflate({ level: 1 }), parts = [];
  const done = new Promise((res, rej) => { z.on('data', (d) => parts.push(d)); z.on('end', res); z.on('error', rej); });
  const row = Buffer.alloc(1 + W * 3), kx = new Uint32Array(W);
  for (let x = 0; x < W; x++) kx[x] = Math.min(sw - 1, Math.floor(x * sw / W)) * 3;
  let last = -1;
  for (let y = 0; y < H; y++) {
    const sy = Math.min(sh - 1, Math.floor(y * sh / H));
    if (sy !== last) { for (let x = 0, o = 1; x < W; x++, o += 3) { const s = sy * sw * 3 + kx[x]; row[o] = src[s]; row[o + 1] = src[s + 1]; row[o + 2] = src[s + 2]; } last = sy; }
    if (!z.write(row)) await new Promise((r) => z.once('drain', r));
  }
  z.end(); await done;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.concat(parts)), chunk('IEND', Buffer.alloc(0))]));
}

// ---------------------------------------------------------------------------------------------------------------
// Instruments
async function perfPage(site, opts = {}) {
  const page = await openPage(site, opts);
  await page.addInitScript(instrument);
  await page.reload({ waitUntil: 'load' });
  await sleep(500);
  page.cdp = await page.context().newCDPSession(page);
  await page.cdp.send('Performance.enable');
  await page.cdp.send('HeapProfiler.enable').catch(() => null);
  return page;
}
const throttle = (page, rate) => page.cdp.send('Emulation.setCPUThrottlingRate', { rate });
const begin = (page) => app(page).evaluate(() => {
  const p = window.__pf, b = document.getElementById('busy');
  p.lt.length = 0; p.busy.length = 0; p.raf.length = 0; p.rafOn = true; p.t0 = performance.now(); p.busyAtStart = !!b && !b.hidden;
  if (!p.looping) { p.looping = true; (function loop() { if (!p.rafOn) { p.looping = false; return; } p.raf.push(performance.now()); requestAnimationFrame(loop); })(); }
});
const finish = (page) => app(page).evaluate(() => { const p = window.__pf; p.rafOn = false; return { t0: p.t0, busyAtStart: p.busyAtStart, lt: p.lt.slice(), busy: p.busy.slice(), raf: p.raf.slice() }; });
// the long tasks of a window: their lengths, the longest, and those over `floor` ms that began with no "Updating..."
// pill on screen (shown, and a frame drawn after it was shown and before the task began)
function summarise(r, floor = 100) {
  const lt = r.lt.filter((l) => l.s >= r.t0 - 1);
  const ev = r.busy.slice().sort((a, b) => a.t - b.t);
  if (r.busyAtStart) ev.unshift({ t: r.t0, hidden: false });
  const covered = (l) => { let since = null; for (const e of ev) { if (e.t > l.s) break; since = e.hidden ? null : (since === null ? e.t : since); } return since !== null && r.raf.some((x) => x >= since && x <= l.s); };
  const lens = lt.map((l) => Math.round(l.d));
  return { tasks: lens, max: lens.length ? Math.max(...lens) : 0, uncovered: lt.filter((l) => l.d >= floor && !covered(l)).map((l) => Math.round(l.d)), shown: ev.some((e) => !e.hidden) };
}
// runs act() with the CPU slowed by `rate`, and returns its wall time and the long tasks it caused
async function measure(page, rate, act, { settle = 450 } = {}) {
  await throttle(page, rate);
  try {
    await begin(page);
    const t0 = Date.now();
    const value = await act();
    const ms = Date.now() - t0;
    await sleep(settle);
    return { ms, value, ...summarise(await finish(page), K(100)) };
  } finally { await throttle(page, 1); }
}
// a click in the page, with the time its handler ran and the time to the next frame it let be drawn
const timedClick = (page, sel) => app(page).evaluate((s) => new Promise((res, rej) => {
  const el = document.querySelector(s); if (!el) { rej(new Error('no ' + s)); return; }
  const t0 = performance.now(); el.click(); const t1 = performance.now();
  requestAnimationFrame(() => { const t2 = performance.now(); setTimeout(() => res({ handler: Math.round(t1 - t0), toFrame: Math.round(t2 - t0) }), 0); });
}), sel);
const busyDone = (page, timeout = 180000) => app(page).waitForFunction(() => document.getElementById('busy').hidden, null, { timeout });
const setRange = (page, id, v) => app(page).evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
// the time each real mouse event took to be handled while a slider is dragged from `from` to `to`, pausing between
// steps like a hand (so each step's study re-run starts and the next event waits behind it)
async function dragRange(page, id, from, to, { steps = 4, pause = 170 } = {}) {
  const fr = app(page);
  const m = await fr.evaluate((id) => { const e = document.getElementById(id); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, min: +e.min, max: +e.max }; }, id);
  const xAt = (v) => m.x + 8 + (m.w - 16) * (v - m.min) / (m.max - m.min), y = m.y + m.h / 2, lat = [];
  const timed = async (f) => { const t = Date.now(); await f(); lat.push(Date.now() - t); };
  await page.mouse.move(xAt(from), y);
  await timed(() => page.mouse.down());
  for (let i = 1; i <= steps; i++) { await sleep(pause); await timed(() => page.mouse.move(xAt(from + (to - from) * i / steps), y)); }
  await sleep(pause);
  await timed(() => page.mouse.up());
  return { lat, max: Math.max(...lat), value: +(await fr.evaluate((id) => document.getElementById(id).value, id)) };
}
// the memory side of the page: collected heap, DOM, object URLs and WebGL objects (summed over its frames) and the
// renderer's resident size (every renderer of this browser, from /proc)
const rssOf = (pid) => { try { const m = /VmRSS:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')); return m ? +m[1] / 1048576 * 1024 : 0; } catch (e) { return 0; } };
async function rendererMB(bcdp) {
  try { const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo'); return Math.round(processInfo.filter((p) => p.type === 'renderer').reduce((s, p) => s + rssOf(p.id), 0)); } catch (e) { return -1; }
}
async function probe(page, bcdp) {
  const send = (m) => page.cdp.send(m).catch(() => null);
  await send('HeapProfiler.collectGarbage'); await send('HeapProfiler.collectGarbage');
  const heap = await send('Runtime.getHeapUsage'), dom = await send('Memory.getDOMCounters');
  const frames = await Promise.all(page.frames().map((f) => f.evaluate(() => ({ blobs: window.__blobs ? window.__blobs.live.size : 0, made: window.__blobs ? window.__blobs.made : 0, ivs: window.__intervals ? window.__intervals.size : 0, gl: window.__gl ? JSON.parse(JSON.stringify(window.__gl)) : null })).catch(() => null)));
  const gl = {};
  for (const f of frames) if (f && f.gl) for (const k of Object.keys(f.gl.made)) gl[k] = (gl[k] || 0) + f.gl.made[k] - (f.gl.gone[k] || 0);
  // the page's live typed arrays (every photo's pixels and Lab planes), ImageData, canvases and images, counted by the engine after a collection
  const live = {};
  for (const [name, expr] of [['typed', 'Object.getPrototypeOf(Float32Array.prototype)'], ['imageData', 'ImageData.prototype'], ['canvases', 'HTMLCanvasElement.prototype'], ['images', 'HTMLImageElement.prototype']]) {
    try {
      const proto = await page.cdp.send('Runtime.evaluate', { expression: expr });
      const q = await page.cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
      live[name] = (await page.cdp.send('Runtime.callFunctionOn', { objectId: q.objects.objectId, functionDeclaration: 'function () { return this.length; }', returnByValue: true })).result.value;
      await page.cdp.send('Runtime.releaseObject', { objectId: q.objects.objectId }).catch(() => null);
      await page.cdp.send('Runtime.releaseObject', { objectId: proto.result.objectId }).catch(() => null);
    } catch (e) { live[name] = -1; }
  }
  return { live, heap: heap ? Math.round(heap.usedSize / 1048576 * 10) / 10 : -1, nodes: dom ? dom.nodes : -1, listeners: dom ? dom.jsEventListeners : -1, blobs: frames.reduce((s, f) => s + (f ? f.blobs : 0), 0), intervals: frames.reduce((s, f) => s + (f ? f.ivs : 0), 0), made: frames.reduce((s, f) => s + (f ? f.made : 0), 0), gl, rss: await rendererMB(bcdp) };
}
const fmt = (p) => `heap ${p.heap} MB, live ${JSON.stringify(p.live)}, ${p.nodes} nodes, ${p.listeners} listeners, ${p.intervals} timers running, ${p.blobs} object URLs live (${p.made} made), WebGL ${JSON.stringify(p.gl)}, renderer ${p.rss} MB`;
const sameGl = (a, b) => Object.keys({ ...a, ...b }).every((k) => (a[k] || 0) === (b[k] || 0));
// a photo chosen and studied: the label names it and the "Updating…" pill has come up and gone since the file was chosen
// (a pill already down, with the label of the photo before, would otherwise be taken for the new photo being done)
async function loadFile(fr, file, pattern, timeout = 180000) {
  await fr.evaluate(() => { window.__pf.busy.length = 0; });
  await fr.setInputFiles('#file', file);
  await fr.waitForFunction((p) => { const b = window.__pf.busy; return b.length > 0 && b[b.length - 1].hidden && new RegExp(p).test(document.getElementById('source').textContent); }, pattern, { timeout });
}
// one section: a thrown error is one failed check, not the end of the case
// How much slower than a quiet machine the work runs right now (this box is shared with other test runs, and its load
// average was 5-28 on 4 cores while this case was written): the wall time a busy loop needs for the CPU time it gets.
// Every time budget below is multiplied by it (K), measured again at the start of each section, so a budget that holds on a
// quiet machine holds on a busy one, and a stall that is three times the budget on a quiet machine still is on a busy one.
let LOAD = 1;
const K = (ms) => Math.round(ms * LOAD);
function calibrate() {
  let wall = 0, cpu = 0;
  for (let i = 0; i < 3; i++) {
    const w0 = performance.now(), c0 = process.cpuUsage();
    let s = 0;
    while (performance.now() - w0 < 70) for (let j = 0; j < 20000; j++) s += Math.sqrt(j);
    const c = process.cpuUsage(c0);
    wall += performance.now() - w0; cpu += (c.user + c.system) / 1000 + (s < 0 ? 1 : 0);
  }
  LOAD = Math.max(1, Math.min(8, wall / Math.max(cpu, 1)));
  return LOAD;
}
const under = () => `(Times as measured while this machine ran about ${LOAD.toFixed(1)}x slower than a quiet one, from the CPU time a busy loop gets; divide by that for a quiet machine.)`;
const took = {};
async function segment(t, name, fn) {
  const t0 = Date.now();
  calibrate();
  try { await fn(); } catch (e) { t.check(false, `${name}: the section ran to its end`, String((e && e.message) || e).slice(0, 300)); }
  took[name] = `${Math.round((Date.now() - t0) / 1000)} s (budgets x${LOAD.toFixed(1)})`;
}
const ms = (n) => `${n} ms`;
const min = (a) => Math.min(...a);

export default async function perf(t, site) {
  // (PERF_VERBOSE=1 echoes every note as it is made: the report file is shared by whatever else is running)
  const note = (text) => { t.note(text); if (process.env.PERF_VERBOSE) process.stdout.write(`    NOTE ${String(text).slice(0, 700)}\n`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pvs-perf-'));
  const P4K = path.join(tmp, 'photo-4000x3000.jpg'), P12K = path.join(tmp, 'photo-12000x9000.png');
  const bcdp = await site.browser.newBrowserCDPSession();
  let softwareGl = true;
  try {
    // ---- fixtures: a 12 megapixel JPEG, and the 108 megapixel PNG
    {
      const page = await openPage(site);
      const f = await makeImage(page, { width: 4000, height: 3000, type: 'image/jpeg', quality: 0.9, name: 'photo-4000x3000.jpg' });
      fs.writeFileSync(P4K, f.buffer);
      softwareGl = await app(page).evaluate(() => { try { const gl = document.createElement('canvas').getContext('webgl'); const x = gl && gl.getExtension('WEBGL_debug_renderer_info'); return !gl || /swiftshader|llvmpipe|software|softpipe/i.test(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'software'); } catch (e) { return true; } });
      // how fast this machine is right now: a fixed amount of script, so the numbers below can be read against the load it was under
      const cal = await app(page).evaluate(() => { const t0 = performance.now(); let s = 0; for (let i = 0; i < 4e7; i++) s += Math.sqrt(i); return Math.round(performance.now() - t0) + (s < 0 ? 1 : 0); });
      note(`machine: ${os.cpus().length} cores, load average ${os.loadavg().map((x) => x.toFixed(2)).join(' / ')}; 40 million square roots take ${cal} ms (about 100 ms on a quiet core); WebGL here is ${softwareGl ? 'a software rasteriser (SwiftShader), so GPU frames cost main-thread time' : 'hardware'}`);
      await page.context().close();
    }
    const t0png = Date.now();
    await writeBigPng(P12K, 12000, 9000);
    note(`fixtures: ${path.basename(P4K)} ${(fs.statSync(P4K).size / 1024).toFixed(0)} KB; ${path.basename(P12K)} ${(fs.statSync(P12K).size / 1048576).toFixed(1)} MB (written in ${Date.now() - t0png} ms)`);

    // ======================================================================================================
    // The Study page: loading photos, the study re-run, the palette, Check my painting, Loomis, Studio, games
    // ======================================================================================================
    const page = await perfPage(site);
    const fr = app(page);
    const loadAndWait = async (file, pattern) => { await loadFile(fr, file, pattern); await sleep(300); };
    try {
      // ---- the page itself: first paint and the sample study
      await segment(t, 'page load', async () => {
        const ctx = await site.browser.newContext({ viewport: DESKTOP });
        const p = await ctx.newPage();
        await p.addInitScript(instrument);
        const cdp = await ctx.newCDPSession(p);
        const out = {};
        for (const rate of [1, 4]) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          const t1 = Date.now();
          await p.goto(site.base, { waitUntil: 'load' });
          const loadMs = Date.now() - t1;
          await p.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 60000 });
          await sleep(500);
          const r = await p.evaluate(() => ({ lt: window.__pf.lt.map((l) => Math.round(l.d)), fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || { startTime: -1 }).startTime) }));
          out[rate] = { loadMs, ready: Date.now() - t1, ...r };
        }
        await ctx.close();
        note(`page load: full speed ${ms(out[1].loadMs)} to the load event, first contentful paint ${out[1].fcp} ms, tasks over 50 ms ${JSON.stringify(out[1].lt)}; phone speed (4x) ${ms(out[4].loadMs)}, first paint ${out[4].fcp} ms, tasks ${JSON.stringify(out[4].lt)}`);
        t.check(out[1].fcp > 0 && out[1].fcp < K(1500), 'a visitor sees the page within 1.5 s at full speed (first contentful paint)', out[1].fcp);
        t.check(out[4].fcp > 0 && out[4].fcp < K(4000), 'a visitor sees the page within 4 s at phone speed (first contentful paint)', out[4].fcp);
        t.check(out[1].ready < K(6000), 'the sample study is ready within 6 s of opening the page at full speed', out[1].ready);
      });

      // ---- loading a 4000 x 3000 photo
      await segment(t, '12 megapixel photo', async () => {
        const runs = [];
        for (const rate of [1, 1, 4]) runs.push({ rate, ...(await measure(page, rate, () => loadFile(fr, P4K, '4000 × 3000'))) });
        const full = runs.filter((r) => r.rate === 1), phone = runs.find((r) => r.rate === 4);
        note(`4000 × 3000 JPEG: time to the studies ${full.map((r) => r.ms).join('/')} ms at full speed, ${phone.ms} ms at phone speed; tasks over 50 ms: ${JSON.stringify(full[0].tasks)} (full), ${JSON.stringify(phone.tasks)} (phone)`);
        t.check(await inked(page, '#cv-value') > 100 && await inked(page, '#cv-block') > 100, 'the 12 megapixel photo is studied: the value and color-block studies are drawn');
        t.check(full.every((r) => r.shown && r.uncovered.length === 0), 'the 12 megapixel photo shows Updating… (painted) before each task over 100 ms', full.map((r) => r.uncovered));
        t.check(phone.shown && phone.uncovered.length === 0, 'the same at phone speed', phone.uncovered);
        t.check(min(full.map((r) => r.ms)) < K(4000), 'the 12 megapixel photo is studied within 4 s at full speed', full.map((r) => r.ms));
        t.check(phone.ms < K(15000), 'the 12 megapixel photo is studied within 15 s at phone speed', phone.ms);
        t.check(min(full.map((r) => r.max)) <= K(2000), 'no single task over 2 s while the 12 megapixel photo is prepared at full speed', full.map((r) => r.max));
      });

      // ---- a 108 megapixel photo, reduced
      await segment(t, '108 megapixel photo', async () => {
        const heapBefore = (await probe(page, bcdp)).heap, rssBefore = await rendererMB(bcdp);
        let peak = rssBefore, stop = false;
        const sampler = (async () => { while (!stop) { peak = Math.max(peak, await rendererMB(bcdp)); await sleep(80); } })();
        const full = await measure(page, 1, () => loadFile(fr, P12K, '2800 × 2100'));
        stop = true; await sampler;
        const toast = await fr.evaluate(() => document.getElementById('toast').textContent);
        const heapAfter = (await probe(page, bcdp)).heap;
        const phone = await measure(page, 4, async () => { await loadFile(fr, P4K, '4000 × 3000'); await loadFile(fr, P12K, '2800 × 2100'); });
        note(`12000 × 9000 PNG (108 MP): ${full.ms} ms to the studies at full speed (tasks ${JSON.stringify(full.tasks)}); ${phone.ms} ms for a 12 MP photo and then this one at phone speed (tasks ${JSON.stringify(phone.tasks)}); renderer ${rssBefore} MB before, ${peak} MB at its peak while it was read; JS heap ${heapBefore} → ${heapAfter} MB; toast: ${toast}`);
        t.check(/very large photo \(12000 × 9000\) was reduced to 2800 × 2100/.test(toast), 'a 108 megapixel photo says it was reduced to 2800 × 2100', toast);
        t.check(await inked(page, '#cv-value') > 100, 'the 108 megapixel photo is studied');
        t.check(full.shown && full.uncovered.length === 0, 'Updating… is painted before each task over 100 ms while the 108 megapixel photo is read', full.uncovered);
        t.check(full.ms < K(8000), 'the 108 megapixel photo is studied within 8 s at full speed', full.ms);
        t.check(peak - rssBefore < 1200, 'reading the 108 megapixel photo takes under 1.2 GB more renderer memory at its peak', { before: rssBefore, peak });
        t.check(heapAfter - heapBefore < 20, 'the JS heap is no bigger after the 108 megapixel photo', { heapBefore, heapAfter });
        t.check(await fr.evaluate(() => new Promise((r) => { const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => r(performance.now() - t0), 0)); })) < K(300), 'the page answers within a frame or two once the 108 megapixel photo is done');
      });
      await clean(t, page, 'photo loading');

      // ---- the study re-run on a slider move (Advanced; Normal 900 px, edge-aware smoothing: the defaults)
      await segment(t, 'study re-run', async () => {
        await loadAndWait(P4K, '4000 × 3000');
        await click(page, '[data-mode="advanced"]'); await sleep(300);
        await fr.evaluate(() => { for (const id of ['drawer-values', 'drawer-colors']) document.getElementById(id).open = true; });
        await sleep(300);
        // Simplify dragged from 3 to 7 and back, twice over: each step starts a re-run, and the next mouse event waits behind it
        const drags = [];
        const w = await measure(page, 1, async () => { drags.push(await dragRange(page, 'simplify', 3, 7)); await busyDone(page); drags.push(await dragRange(page, 'simplify', 7, 3)); await busyDone(page); });
        const slow = await measure(page, 4, async () => { drags.push(await dragRange(page, 'simplify', 3, 7, { steps: 3 })); await busyDone(page); });
        await setRange(page, 'simplify', 3); await busyDone(page); await sleep(300);
        t.check(drags[0].value === 7 && drags[1].value === 3, 'the Simplify slider follows the mouse from 3 to 7 and back', drags.map((d) => d.value));
        const lat = drags.slice(0, 2).map((d) => d.max);
        note(`Simplify drag at 900 px, edge-aware: slowest mouse event ${lat.join('/')} ms at full speed, ${drags[2].max} ms at phone speed; study re-run tasks ${JSON.stringify(w.tasks)} (full), ${JSON.stringify(slow.tasks)} (phone)`);
        t.check(w.shown && w.uncovered.length === 0, 'each study re-run shows Updating… (painted) before it starts', w.uncovered);
        const ok = t.check(min(lat) <= K(200) && w.max <= K(200), 'dragging Simplify: the slowest mouse event of a drag and the longest study task are within 200 ms at full speed', { slowestEvent: lat, longestTask: w.max, tasks: w.tasks });
        t.check(slow.max <= K(800), 'the same at phone speed (4 × 200 ms)', { longestTask: slow.max, slowestEvent: drags[2].max });
        // the other controls: only the first stage is skipped when the blur radius is unchanged, the rest still runs
        const others = {};
        for (const [id, a, b] of [['merge', 7, 4], ['colors', 5, 3], ['t1', 40, 35], ['lean', 30, 0], ['g0', 8, 20]]) {
          const runs = [];
          for (const v of [a, b]) { const r = await measure(page, 1, async () => { await setRange(page, id, v); await busyDone(page); }); runs.push(r.max); }
          others[id] = runs;
        }
        note(`longest task per re-run, full speed, by control (two values each; a note and not a check: how long they take depends on the picture and on the load): ${JSON.stringify(others)}`);
                // the controls that re-run the study at once (runSoon(0)): the pill is raised in the same breath as the work begins, so no
        // frame is drawn between them; three tries each (a frame can fall between by chance), and a run counts as bare when a task
        // of 100 ms or more began with no painted pill
        const zero = {};
        const zeroTrial = async (label, act) => {
          const tries = [];
          for (let i = 0; i < 3; i++) { const r = await measure(page, 1, async () => { await act(i); await busyDone(page); }, { settle: 300 }); tries.push({ max: r.max, bare: r.uncovered.length > 0 }); }
          zero[label] = tries;
        };
        await zeroTrial('the Draw an outline checkbox', () => fr.evaluate(() => document.getElementById('outlines').click()));
        await zeroTrial('the Soft / Edge-aware smoothing choice', (i) => fr.evaluate((i) => document.querySelector(`input[name="smoothing"][value="${i % 2 ? 'edge' : 'soft'}"]`).click(), i));
        await fr.evaluate(() => document.querySelector('input[name="smoothing"][value="edge"]').click()); await busyDone(page); await sleep(300);
        await zeroTrial('Auto split', () => fr.evaluate(() => document.getElementById('autoSplit').click()));
        await zeroTrial('the Simple / Advanced switch', (i) => fr.evaluate((i) => document.querySelector(`[data-mode="${i % 2 ? 'advanced' : 'simple'}"]`).click(), i));
        await click(page, '[data-mode="advanced"]'); await busyDone(page); await sleep(300);
        note(`controls that re-run the study at once, per try (longest task, whether it began with no painted pill): ${JSON.stringify(zero)}`);
        const bare = {};
        for (const [label, tries] of Object.entries(zero)) {
          bare[label] = tries.filter((x) => x.bare).length;
          t.check(bare[label] <= 1, `${label} shows Updating… (painted) before its re-run starts (at least two tries of three)`, tries);
        }
        const bareLabels = Object.keys(bare).filter((k) => bare[k] >= 2);
        if (bareLabels.length >= 3) {
          const worstOf = Math.max(...Object.values(zero).flat().map((x) => x.max)), all = Object.values(zero).flat().filter((x) => x.max >= 100).map((x) => x.max);
          t.finding({
            severity: 'medium',
            title: `${bareLabels.length} of 4 controls that re-run the study at once (outline, smoothing, Auto split, Simple / Advanced) start a ${(Math.min(...all) / 1000).toFixed(1)}-${(worstOf / 1000).toFixed(1)} s task before the "Updating…" pill or the tapped control can be painted`,
            steps: '1. Load a photo (here 4000 × 3000) and choose Advanced. 2. Tap "Draw an outline around every shape", or Soft / Edge-aware under Smoothing, or Auto split, or switch Simple / Advanced. 3. Watch the control and the "Updating…" pill. (Timed in the page: a requestAnimationFrame callback logged between the pill being shown and the first task of 100 ms or more beginning, three tries each.)',
            expected: 'Work that takes longer than a moment shows progress first: the Updating… pill must be on screen (a frame drawn) before a task of several hundred ms blocks the page, as it is for the sliders, which wait 90 ms (js/app.js:274-280), and for a new photo, which waits two frames (js/app.js:392-410). The tapped control should also look pressed at once.',
            actual: `Tries in which the pill was shown but no frame was drawn before a task of 100 ms or more began: ${bareLabels.map((k) => `${k} ${bare[k]} of 3 (tasks ${zero[k].map((x) => x.max).join(', ')} ms)`).join('; ')}. The pill is shown and hidden inside one stretch of blocked main thread, so the visitor sees the page stop with nothing said and the tapped control not yet changed. Loading a painting into Check my painting takes the same path (see the notes). ${under()}`,
            cause: 'js/app.js:274-280: runSoon(delay) raises the pill and then calls setTimeout(run, delay); these four call runSoon(0) (js/app.js:675 outlines, 701 smoothing, 688 Auto split, 2720 setMode; also 693 the gray mode, 591 a painting loaded, 2665 its Fit choice), and a 0 ms timer fires before the next frame is drawn, so run() (Study.process, js/app.js:284) starts with the pill still unpainted. prepareAndRun (js/app.js:392-410) shows the right pattern (a frame, then another, then the work); runSoon(0) does not.',
          });
        }
        // Simple mode: the three Detail presets set Simplify and Merge together
        await click(page, '[data-mode="simple"]'); await sleep(500); await busyDone(page); await sleep(300);
        const presets = {};
        for (const p of ['soft', 'sharp', 'normal']) { const r = await measure(page, 1, async () => { await fr.evaluate((p) => document.querySelector(`input[name="detailPreset"][value="${p}"]`).click(), p); await sleep(150); await busyDone(page); }); presets[p] = r.max; }
        note(`Simple mode Detail presets, longest task at full speed: ${JSON.stringify(presets)}`);
        const okPresets = t.check(Math.max(...Object.values(presets)) <= K(200), 'choosing a Detail preset in Simple mode re-runs the study in under 200 ms at full speed', presets);
        const big = w.tasks.filter((x) => x >= K(100)), lo = Math.min(...big), hi = Math.max(...big), sec = (n) => (n / 1000).toFixed(1);
        if (!ok && !okPresets && lat.every((x) => x > K(200)) && big.length >= 2 && Math.min(...Object.values(presets)) > K(200)) {
          t.finding({
            severity: 'medium',
            title: `Every move of Simplify or choice of a Detail preset freezes the page for ${sec(lo)}-${sec(hi)} s (about ${sec(slow.max)} s on a phone): the whole study is one synchronous task`,
            steps: '1. Load any photo (here 4000 × 3000; the study is computed at the working size, so the photo\'s size does not matter). 2. Advanced, "Dark, middle, light": drag the Simplify slider from 3 to 7 with a real mouse, pausing a moment at each step; or, in Simple, tap Soft, Sharp and Normal under Detail. 3. Watch the slider thumb and the page while the studies update. (Timed with a real mouse through CDP, working size at its default 900 px, edge-aware smoothing.)',
            expected: 'The README makes no timing promise, so the budget is the one that keeps a page responsive: an input is answered within about 200 ms and work that takes longer is sliced, deferred or done in a worker, so the slider keeps following the hand while the studies update behind it.',
            actual: `Two drags of Simplify (3 to 7 and back, four steps each): the slowest mouse event of each took ${lat.join(' ms and ')} ms to be handled at full speed (the page was blocked that long) and the re-runs were single tasks of ${big.join(', ')} ms. At 4x CPU a single re-run took ${slow.max} ms (${slow.tasks.join(', ')}) and the slowest mouse event ${drags[2].max} ms. In Simple mode the Detail presets re-ran in one task of ${presets.soft} ms (Soft), ${presets.sharp} ms (Sharp) and ${presets.normal} ms (Normal). Even a gray value or a split, which change no shape, cost ${Math.min(...others.g0, ...others.t1)}-${Math.max(...others.g0, ...others.t1)} ms. The "Updating…" pill is painted first, so a visitor is told, but nothing can be moved while it is up. ${under()}`,
            cause: 'js/app.js:274-296: runSoon() waits 90 ms and run() calls Study.process() (js/processing.js:848) on the whole 900 px picture in one go: for Simplify the blur (edge-aware: the domain-transform filter, js/processing.js:159-232, two guided rounds over L*, a*, b*), then the value split, the merges, k-means in every value mass and the color rescue, all synchronously. The blur is cached only for the last (radius, smoothing) pair (js/processing.js:235-247), so any change of Simplify recomputes it, and every other control re-runs all the stages after it; nothing is sliced between rows or passes, so nothing can yield to input.',
          });
        }
        // the detail (working size) select re-prepares the photo
        await click(page, '[data-mode="advanced"]'); await sleep(300);
        const sizes = {};
        for (const s of ['1400', '600', '900']) { const r = await measure(page, 1, async () => { await fr.evaluate((s) => { const d = document.getElementById('detail'); d.value = s; d.dispatchEvent(new Event('change', { bubbles: true })); }, s); await sleep(200); await busyDone(page); }); sizes[s] = { max: r.max, ms: r.ms, uncovered: r.uncovered }; }
        note(`Working size changes (the photo re-prepared and re-run), longest task and time at full speed: ${JSON.stringify(sizes)}`);
        t.check(Object.values(sizes).every((x) => x.uncovered.length === 0), 'changing the Working size shows Updating… before its long tasks', sizes);
        t.check(sizes['600'].ms < K(2000), 'the 600 px ("fastest") working size answers within 2 s at full speed', sizes['600'].ms);
      });
      await clean(t, page, 'study re-run');

      // ---- the palette ranking and Suggest a palette
      await segment(t, 'palette ranking', async () => {
        await fr.evaluate(() => { document.getElementById('drawer-colors').open = false; }); await sleep(300);
        await setRange(page, 'colors', 4); await busyDone(page); await sleep(300); // a new study to rank
        const want = await fr.evaluate(() => window.Paints.PRESETS.length);
        const rank = (rate) => measure(page, rate, async () => {
          await fr.evaluate(() => { document.querySelector('#drawer-colors > summary').click(); });
          await fr.waitForFunction((n) => { const l = document.getElementById('presetList'); return l.children.length >= n && !l.hasAttribute('aria-busy'); }, want, { timeout: 120000 });
        });
        const r1 = await rank(1);
        const listed = await fr.evaluate(() => ({ n: document.getElementById('presetList').children.length, best: document.querySelectorAll('#presetList .preset-best').length, want: window.Paints.PRESETS.length }));
        note(`ranking the known palettes: ${r1.ms} ms, tasks over 50 ms ${JSON.stringify(r1.tasks)} (full speed)`);
        t.check(listed.n === listed.want && listed.best === 1, 'the known palettes are all ranked, with one "Best match"', listed);
        t.check(r1.max <= K(200), 'ranking the palettes holds no task over 200 ms at full speed', r1.tasks);
        t.check(r1.ms < K(3000), 'the palettes are ranked within 3 s at full speed', r1.ms);
        await fr.evaluate(() => { document.getElementById('drawer-colors').open = false; }); await sleep(300);
        await setRange(page, 'colors', 3); await busyDone(page); await sleep(300);
        const r4 = await rank(4);
        note(`ranking at phone speed: ${r4.ms} ms, tasks ${JSON.stringify(r4.tasks)}`);
        t.check(r4.max <= K(800), 'ranking the palettes holds no task over 800 ms at phone speed', r4.tasks);
        // Suggest a palette (My paints)
        await fr.evaluate(() => { const r = document.querySelector('input[name="paintSource"][value="mine"]'); if (r) r.click(); }); await sleep(400);
        const sg = async (rate) => measure(page, rate, async () => {
          await fr.evaluate(() => document.getElementById('suggestBtn').click());
          await fr.waitForFunction(() => /Suggest again/.test(document.getElementById('suggestBtn').textContent) && !document.getElementById('suggestBtn').disabled, null, { timeout: 120000 });
        });
        const s1 = await sg(1), s4 = await sg(4);
        note(`Suggest a palette: ${s1.ms} ms (tasks ${JSON.stringify(s1.tasks)}) at full speed, ${s4.ms} ms (tasks ${JSON.stringify(s4.tasks)}) at phone speed`);
        t.check(s1.max <= K(200) && s4.max <= K(800), 'Suggest a palette holds no task over 200 ms (full speed) or 800 ms (phone speed)', { full: s1.tasks, phone: s4.tasks });
        t.check(s1.ms < K(3000), 'a palette is suggested within 3 s at full speed', s1.ms);
        await fr.evaluate(() => { document.getElementById('drawer-colors').open = false; });
      });
      await clean(t, page, 'palettes');

      // ---- Check my painting
      await segment(t, 'check my painting', async () => {
        await fr.evaluate(() => { document.getElementById('drawer-values').open = false; document.getElementById('drawer-check').open = true; }); await sleep(500);
        const load = async (rate) => measure(page, rate, async () => {
          await fr.evaluate(() => { window.__pf.busy.length = 0; });
          await fr.setInputFiles('#artFile', P4K);
          await fr.waitForFunction(() => { const b = window.__pf.busy; return b.length > 0 && b[b.length - 1].hidden && !document.getElementById('checkBody').hidden && /4000 × 3000/.test(document.getElementById('artSource').textContent); }, null, { timeout: 180000 });
        });
        const l1 = await load(1);
        t.check(/^\d+$/.test(await fr.evaluate(() => document.getElementById('scoreColor').textContent.trim())), 'a 12 megapixel painting is scored (a color score is shown)', await fr.evaluate(() => document.getElementById('scoreColor').textContent));
        note(`Check my painting, loading a 4000 × 3000 painting: ${l1.ms} ms, tasks ${JSON.stringify(l1.tasks)} (full speed)`);
        const l4 = await load(4);
        note(`  ... at phone speed: ${l4.ms} ms, tasks ${JSON.stringify(l4.tasks)}; tasks over 100 ms that began with no painted Updating… pill: ${JSON.stringify(l1.uncovered)} (full), ${JSON.stringify(l4.uncovered)} (phone) (a painting is scored through runSoon(0), js/app.js:591)`);
        // the Line up sliders, dragged
        await fr.evaluate(() => { document.getElementById('alignPanel').open = true; }); await sleep(300);
        const runs = [];
        for (const [id, v] of [['alignX', 1.4], ['alignX', 0], ['alignScale', 103], ['alignScale', 100], ['alignRot', 1], ['alignRot', 0]]) {
          const r = await measure(page, 1, async () => { await setRange(page, id, v); await busyDone(page); });
          runs.push({ id, v, max: r.max, shown: r.shown, uncovered: r.uncovered });
        }
        const r4s = await measure(page, 4, async () => { await setRange(page, 'alignX', 1.4); await busyDone(page); });
        await setRange(page, 'alignX', 0); await busyDone(page);
        note(`Line up sliders, longest task per move at full speed: ${JSON.stringify(runs.map((x) => [x.id, x.v, x.max]))}; one move at phone speed ${r4s.max} ms`);
        t.check(runs.every((x) => x.shown && x.uncovered.length === 0), 'each Line up move shows Updating… (painted) before it re-scores', runs.map((x) => x.uncovered));
        const worst = runs.map((x) => x.max);
        const ok = t.check(min(worst) <= K(200), 'moving a Line up slider re-scores the painting in under 200 ms at full speed', worst);
        if (!ok && worst.every((x) => x > K(200))) {
          t.finding({
            severity: 'medium',
            title: `Every move of a Line up slider re-processes the painting in one ${(Math.min(...worst) / 1000).toFixed(1)}-${(Math.max(...worst) / 1000).toFixed(1)} s task (${(r4s.max / 1000).toFixed(1)} s on a phone), so lining a painting up by hand cannot be done by dragging`,
            steps: '1. Load a photo. 2. Open "How close did I get?" and load a photo of a painting (here the same 4000 × 3000 file). 3. Open "Line up the photo and fix its colors". 4. Drag Move left / right, Move up / down, Size or Rotate by even a step or two.',
            expected: 'A slider used to line one picture up with another has to follow the hand: the response to each input within about 200 ms, or the score re-run only when the hand rests, or on a cheaper preview.',
            actual: `Each of ${runs.length} slider moves held the main thread for ${worst.join(', ')} ms at full speed (and ${r4s.max} ms at 4x CPU); loading the painting is a single ${l1.max} ms task (${l4.max} ms at 4x). The pill is painted first, but the slider is frozen under it. ${under()}`,
            cause: 'js/app.js:2395-2438: checkSoon() waits 120 ms and runCheck() re-aligns the painting (alignArt, a canvas redraw), runs the whole Study.process() on it again (js/app.js:2418, js/processing.js:848: blur, split, merge, k-means, color rescue), then Study.compare() (js/processing.js:1071: the connected-component and difference pass) and repaints five canvases and the labels, all in one synchronous task. A move of the alignment changes the pixels that every stage reads, so nothing is reused.',
          });
        }
        await fr.evaluate(() => { document.getElementById('drawer-check').open = false; }); await sleep(300);
      });
      await clean(t, page, 'check my painting');

      // ---- Loomis head: eight marks locked, then a mark dragged
      await segment(t, 'loomis', async () => {
        await tab(page, 'loomis'); await sleep(1000);
        const fit = async (rate) => {
          await fr.evaluate(() => document.getElementById('lh-reset').click()); await sleep(300);
          const b = await fr.locator('#lh-overlay').boundingBox();
          const marks = [[0.4, 0.41], [0.6, 0.41], [0.42, 0.37], [0.58, 0.37], [0.5, 0.52], [0.5, 0.57], [0.5, 0.66], [0.5, 0.2]];
          const locks = [];
          const r = await measure(page, rate, async () => {
            for (const [mx, my] of marks) {
              await page.mouse.move(b.x + b.width * mx, b.y + b.height * my); await page.mouse.down(); await page.mouse.move(b.x + b.width * mx + 2, b.y + b.height * my + 2); await page.mouse.up();
              locks.push((await timedClick(page, '#lh-lock')).toFrame);
            }
          });
          const done = /adjust/i.test(await fr.evaluate(() => document.getElementById('lh-ask').textContent));
          const drag = [];
          const d = await measure(page, rate, async () => {
            await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.52);
            let t1 = Date.now(); await page.mouse.down(); drag.push(Date.now() - t1);
            for (let i = 1; i <= 20; i++) { t1 = Date.now(); await page.mouse.move(b.x + b.width * (0.5 + 0.004 * i), b.y + b.height * (0.52 + 0.003 * i)); drag.push(Date.now() - t1); }
            await page.mouse.up();
          });
          return { rate, done, locks, max: r.max, tasks: r.tasks, dragMax: Math.max(...drag), dragTask: d.max };
        };
        const a = await fit(1), c = await fit(4);
        note(`Loomis fit: lock-in click to frame ${JSON.stringify(a.locks)} ms, longest task ${a.max} ms; dragging a mark: slowest event ${a.dragMax} ms, longest task ${a.dragTask} ms (full speed); phone speed: locks ${JSON.stringify(c.locks)}, longest task ${c.max} ms, drag slowest event ${c.dragMax} ms, task ${c.dragTask} ms`);
        t.check(a.done && c.done, 'the eight marks fit a head ("Drag a dot or a line to adjust it")', [a.done, c.done]);
        t.check(Math.max(...a.locks) <= K(200) && a.max <= K(200), 'locking in eight marks holds no task over 200 ms at full speed', { locks: a.locks, longest: a.max });
        t.check(a.dragMax <= K(200) && a.dragTask <= K(200), 'dragging a mark refits the head within 200 ms an event at full speed', { slowest: a.dragMax, task: a.dragTask });
        t.check(c.max <= K(800) && c.dragTask <= K(800) && Math.max(...c.locks) <= K(800), 'the Loomis fit holds no task over 800 ms at phone speed', { locks: c.locks, longest: c.max, drag: c.dragTask });
      });
      await clean(t, page, 'loomis');

      // ---- Studio: a stroke and its autosave
      await segment(t, 'studio', async () => {
        await tab(page, 'paint'); await sleep(1200);
        const b = await fr.locator('#ps-paper').boundingBox();
        const oneStroke = async (rate, y0) => {
          const lat = [];
          const r = await measure(page, rate, async () => {
            let t1 = Date.now(); await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * y0); await page.mouse.down(); lat.push(Date.now() - t1);
            for (let i = 1; i <= 14; i++) { t1 = Date.now(); await page.mouse.move(b.x + b.width * (0.3 + 0.03 * i), b.y + b.height * (y0 + 0.01 * i)); lat.push(Date.now() - t1); }
            t1 = Date.now(); await page.mouse.up(); lat.push(Date.now() - t1);
          }, { settle: 150 });
          return { lat, max: Math.max(...lat), task: r.max };
        };
        const s1 = await oneStroke(1, 0.2), s4 = await oneStroke(4, 0.3);
        note(`Studio stroke (15 events): slowest event ${s1.max} ms, longest task ${s1.task} ms at full speed; ${s4.max} ms / ${s4.task} ms at phone speed`);
        t.check(s1.max <= K(200) && s1.task <= K(200), 'a Studio stroke is handled within 200 ms an event at full speed (the first event takes the undo snapshot)', { events: s1.max, task: s1.task });
        t.check(s4.max <= K(800) && s4.task <= K(800), 'a Studio stroke is handled within 800 ms an event at phone speed', { events: s4.max, task: s4.task });
        // the paper filled with strokes, then how long the autosave takes and what it holds the main thread for
        for (let i = 0; i < 24; i++) await stroke(page, '#ps-paper', [[0.05, 0.04 + i * 0.04], [0.95, 0.04 + i * 0.04]], { steps: 3 });
        const wrote = () => fr.evaluate(() => new Promise((res) => { const q = indexedDB.open('portrait-value-studio', 1); q.onerror = () => res(0); q.onsuccess = () => { try { const g = q.result.transaction('studio').objectStore('studio').get('painting'); g.onsuccess = () => { const v = g.result; q.result.close(); res(v && v.savedAt ? v.savedAt : 0); }; g.onerror = () => res(0); } catch (e) { res(0); } }; }));
        const before = await wrote();
        const at = await fr.evaluate(() => Date.now());
        const save = await measure(page, 1, async () => { await stroke(page, '#ps-paper', [[0.2, 0.5], [0.8, 0.52]], { steps: 3 }); for (let i = 0; i < 40 && (await wrote()) <= before; i++) await sleep(150); }, { settle: 300 });
        const after = await wrote();
        note(`Studio autosave of a painted paper: ${save.ms} ms from the last stroke until the record (savedAt ${after - at} ms after the stroke began); tasks over 50 ms during it ${JSON.stringify(save.tasks)}`);
        t.check(after > before, 'the painting is saved to the browser a moment after the stroke', { before, after });
        t.check(save.max <= K(200), 'the autosave of a painted paper holds no task over 200 ms at full speed', save.tasks);
        t.check(save.ms < K(6000), 'the painting is saved within 6 s of the stroke at full speed', save.ms);
        const u = await measure(page, 1, async () => { for (let i = 0; i < 15; i++) { await click(page, '#ps-undo'); } });
        note(`15 Undo taps on the painted paper: longest task ${u.max} ms`);
        t.check(u.max <= K(200), 'Undo on a painted paper holds no task over 200 ms at full speed', u.tasks);
      });
      await clean(t, page, 'studio');

      // ---- Paint by numbers: the board built when Games opens, the Start (target mixing), another painting
      await segment(t, 'paint by numbers', async () => {
        await tab(page, 'study'); await sleep(300);
        await loadAndWait(P4K, '4000 × 3000'); await sleep(500);
        const open = async (rate) => { await throttle(page, rate); try { await begin(page); const r = await timedClick(page, '[data-tab="game"]'); await app(page).waitForFunction(() => document.getElementById('gameStart') && !document.getElementById('gameStart').disabled && document.querySelector('#gamePalette option'), null, { timeout: 120000 }); await sleep(450); return { ...r, ...summarise(await finish(page)) }; } finally { await throttle(page, 1); } };
        const g1 = await open(1);
        note(`opening Games with a photo loaded (the board is built in the click): handler ${g1.handler} ms, to the next frame ${g1.toFrame} ms, tasks ${JSON.stringify(g1.tasks)} (full speed)`);
        const ok = t.check(g1.toFrame <= K(200), 'tapping Games switches to it within 200 ms at full speed', { handler: g1.handler, toFrame: g1.toFrame });
        // each level and the dealt painting build their own board
        const builds = { medium: g1.handler };
        for (const lv of ['easy', 'hard']) { const r = await measure(page, 1, async () => { builds[lv] = (await timedClick(page, `input[name="gameLevel"][value="${lv}"]`)).handler; await sleep(300); }); builds[lv + 'Task'] = r.max; }
        const paint = await timedClick(page, '#gameFromPainting'); builds.painting = paint.handler; await sleep(500);
        const again = await timedClick(page, '#gameReroll'); builds.anotherPainting = again.handler; await sleep(500);
        note(`Paint by numbers board builds, handler time at full speed: ${JSON.stringify(builds)}`);
        t.check(Math.max(builds.easy, builds.hard) <= K(200), 'choosing Easy or Hard rebuilds the board within 200 ms at full speed', builds);
        t.check(builds.painting <= K(200) && builds.anotherPainting <= K(200), 'A painting / Another painting deal a board within 200 ms at full speed', builds);
        await timedClick(page, '#gameFromPhoto'); await sleep(800);
        await tab(page, 'study'); await sleep(400);
        await loadAndWait(P4K, '4000 × 3000'); await sleep(400); // (a new study, so the board is built again)
        const g4 = await open(4);
        note(`  ... Games opened at phone speed: handler ${g4.handler} ms, to the frame ${g4.toFrame} ms, tasks ${JSON.stringify(g4.tasks)}`);
        if (!ok) {
          t.finding({
            severity: 'medium',
            title: `Tapping Games with a photo loaded freezes the page for ${(g1.handler / 1000).toFixed(1)} s (${(g4.handler / 1000).toFixed(1)} s on a phone) before the tab even switches, with no progress shown; Easy, Hard and A painting cost up to ${(Math.max(builds.easy, builds.hard, builds.painting, builds.anotherPainting) / 1000).toFixed(1)} s more`,
            steps: '1. Load a photo (here 4000 × 3000; any photo costs about the same, the board is built at the working size). 2. Open the Games menu and choose Paint by numbers (or tap Easy / Hard / A painting in its setup). 3. Watch the tab bar: the tab does not change until the board is built.',
            expected: 'A tap is answered within a frame or two (about 200 ms at most); work that takes longer shows progress first (as the Study tab\'s "Updating…" pill does before its own runs).',
            actual: `The click handler itself ran for ${g1.handler} ms at full speed (next frame ${g1.toFrame} ms; tasks ${g1.tasks.join(', ')}), and ${g4.handler} ms at 4x CPU; choosing Easy cost ${builds.easy} ms, Hard ${builds.hard} ms, A painting ${builds.painting} ms. The page cannot paint a pill because it never gets a frame. ${under()}`,
            cause: 'js/app.js:2232 dispatches studio:tab synchronously inside the tab\'s click handler; js/game.js:1722-1726 answers it with refreshSetup() (js/game.js:554-568), which calls buildBoard() (js/game.js:188) on the spot: Study.process() (js/game.js:190) over the whole study, three to six times for Easy (easyStudy, js/game.js:172-186), then the outline pass and placeNumbers() (js/game.js:228). Nothing is deferred to a frame after the tab has been shown, and no pill is raised.',
          });
        }
        // Start: the targets are mixed a few numbers a frame
        const hintSeen = [];
        await fr.evaluate(() => { const h = document.getElementById('gamePaletteHint'); window.__hints = []; if (h) new MutationObserver(() => window.__hints.push(h.textContent)).observe(h, { childList: true, characterData: true, subtree: true }); });
        const st = async (rate) => measure(page, rate, async () => {
          await fr.evaluate(() => document.getElementById('gameStart').click());
          await fr.waitForFunction(() => document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 120000 });
        });
        const s1 = await st(1);
        hintSeen.push(...await fr.evaluate(() => window.__hints.slice()));
        t.check(await fr.evaluate(() => document.querySelectorAll('#gameNumbers .game-number').length) > 0, 'Start painting deals the board');
        await click(page, '#gameQuit'); await sleep(150); await click(page, '#gameQuit'); await sleep(500);
        const s4 = await st(4);
        await click(page, '#gameQuit'); await sleep(150); await click(page, '#gameQuit'); await sleep(500);
        note(`Paint by numbers Start (mixing every number's target): ${s1.ms} ms, tasks ${JSON.stringify(s1.tasks)} at full speed; ${s4.ms} ms, tasks ${JSON.stringify(s4.tasks)} at phone speed; progress text seen ${hintSeen.length} times${hintSeen.length ? ` ("${hintSeen[0]}")` : ''}`);
        t.check(s1.max <= K(200), 'Start painting mixes the targets with no task over 200 ms at full speed', s1.tasks);
        t.check(s4.max <= K(800), 'Start painting mixes the targets with no task over 800 ms at phone speed', s4.tasks);
        t.check(s1.ms < K(3000), 'the game starts within 3 s of Start painting at full speed', s1.ms);
      });
      await clean(t, page, 'paint by numbers');

      // ---- Value battle: a game, ten rounds answered right
      await segment(t, 'value battle', async () => {
        await tab(page, 'battle'); await sleep(500);
        // the answer the round asks for, given through the page's own buttons, and the time to the next frame
        const answerRight = () => fr.evaluate(() => new Promise((res) => {
          const g = window.ValueBattle.state(), r = g.rounds[g.i], sw = (i) => document.querySelector(`.vb-swatch[data-index="${i}"]`);
          const t0 = performance.now();
          if (r.q.mode === 'pair') { if (r.answer === 'same') document.querySelector('.vb-choice[data-choice="same"]').click(); else sw(r.answer === 'left' ? 0 : 1).click(); }
          else if (r.q.mode === 'pick') sw(r.answer).click();
          else for (const i of r.answer) sw(i).click();
          requestAnimationFrame(() => setTimeout(() => res(Math.round(performance.now() - t0)), 0));
        }));
        const play = async (rate) => {
          const frames = []; let rounds = 0;
          const r = await measure(page, rate, async () => {
            frames.push((await timedClick(page, '#vb-start')).toFrame);
            await sleep(300);
            for (let i = 0; i < 10; i++) {
              if (!(await fr.evaluate(() => { const g = window.ValueBattle.state(); return !!g && !g.over && !g.answered; }))) break;
              frames.push(await answerRight()); rounds++; await sleep(150);
              if (await fr.evaluate(() => { const n = document.getElementById('vb-next'); return !!n && !n.hidden; })) { frames.push((await timedClick(page, '#vb-next')).toFrame); await sleep(150); }
            }
          });
          await click(page, '#vb-quit'); await sleep(150); await click(page, '#vb-quit'); await sleep(400);
          return { frames, rounds, max: Math.max(...frames), task: r.max };
        };
        const b1 = await play(1), b4 = await play(4);
        note(`Value battle (start, ten rounds answered right, Next after each): slowest start, answer or Next to the next frame ${b1.max} ms, longest task ${b1.task} ms at full speed; ${b4.max} ms / ${b4.task} ms at phone speed`);
        t.check(b1.rounds >= 8 && b4.rounds >= 8, 'ten battle rounds were played at each speed', [b1.rounds, b4.rounds]);
        t.check(b1.max <= K(200) && b1.task <= K(200), 'a battle start, answer or Next reaches the next frame within 200 ms at full speed', { frame: b1.max, task: b1.task });
        t.check(b4.max <= K(800) && b4.task <= K(800), 'a battle start, answer or Next reaches the next frame within 800 ms at phone speed', { frame: b4.max, task: b4.task });
      });
      await clean(t, page, 'value battle');

      // ---- Pose and light inside the app: the tab opening, a joint dragged, the lamp dragged, a snapshot
      await segment(t, 'pose and light', async () => {
        let up;
        const open = await measure(page, 1, async () => {
          await timedClick(page, '[data-tab="pose"]');
          const t1 = Date.now();
          for (let i = 0; i < 160; i++) { const f = poseFrame(page); if (f && await f.evaluate(() => !!window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30).catch(() => false)) break; await sleep(250); }
          up = Date.now() - t1;
        }, { settle: 600 });
        const pf = poseFrame(page);
        note(`Pose and light opening: its 30 pictures were up ${up} ms after the tab was tapped (full speed); tasks over 50 ms: ${open.tasks.length}, longest ${open.max} ms (${softwareGl ? 'software GL: shaders and frames are CPU here' : 'hardware GL'})`);
        t.check(up < K(20000), 'Pose and light is up with its 30 pictures within 20 s of the tap at full speed', up);
        await pf.evaluate(() => { document.getElementById('libClose').click(); }); await sleep(500);
        const handAt = async () => {
          const c = await pf.evaluate(() => { window.PoseAndLight.render(); return window.PoseAndLight.ctrls().find((q) => q.id === 'handR' && q.center); });
          if (!c) throw new Error('no right-hand control on the stage');
          const box = await pf.locator('#view').boundingBox();
          return { x: box.x + c.center.x, y: box.y + c.center.y };
        };
        const lampAt = async () => { const b = await pf.locator('#lampHandle').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
        const metrics = async () => Object.fromEntries((await page.cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
        const dragged = async (rate, label, where, dx, dy) => {
          const lat = []; let script = 0, taskTime = 0;
          const from = await where();
          const r = await measure(page, rate, async () => {
            const m0 = await metrics();
            await page.mouse.move(from.x, from.y); let t1 = Date.now(); await page.mouse.down(); lat.push(Date.now() - t1);
            for (let i = 1; i <= 20; i++) { t1 = Date.now(); await page.mouse.move(from.x + dx * i / 20, from.y + dy * i / 20); lat.push(Date.now() - t1); }
            await page.mouse.up();
            const m1 = await metrics();
            script = (m1.ScriptDuration - m0.ScriptDuration) * 1000; taskTime = (m1.TaskDuration - m0.TaskDuration) * 1000;
          }, { settle: 200 });
          return { label, rate, perMoveScript: Math.round(script / 21 * 10) / 10, perMoveTask: Math.round(taskTime / 21), slowest: Math.max(...lat), longest: r.max };
        };
        const j1 = await dragged(1, 'hand', handAt, 120, -100);
        await pf.evaluate(() => document.getElementById('undo').click()); await sleep(300);
        const j4 = await dragged(4, 'hand', handAt, -100, -90);
        const l1 = await dragged(1, 'lamp', lampAt, -150, 40);
        const l4 = await dragged(4, 'lamp', lampAt, 100, 30);
        note(`Pose and light drags, per mouse event: hand ${JSON.stringify(j1)} / ${JSON.stringify(j4)}; lamp ${JSON.stringify(l1)} / ${JSON.stringify(l4)}`);
        for (const d of [j1, l1]) t.check(d.perMoveScript <= K(25), `dragging the ${d.label} runs the page's own script for under 25 ms an event at full speed`, d);
        for (const d of [j4, l4]) t.check(d.perMoveScript <= K(80), `dragging the ${d.label} runs the page's own script for under 80 ms an event at phone speed`, d);
        if (!softwareGl) for (const d of [j1, l1]) t.check(d.longest <= K(200), `dragging the ${d.label} holds no task over 200 ms at full speed`, d);
        else note('(the task lengths of the Pose and light drags are not held to the 200 ms budget here: the WebGL frame is software-rendered on the main thread)');
        // the value look and a snapshot
        const sn = await measure(page, 1, async () => { await pf.evaluate(() => document.getElementById('snap').click()); await pf.waitForFunction(() => { const i = document.getElementById('snapImg'); return i.complete && i.src.startsWith('blob:') && i.naturalWidth > 0; }, null, { timeout: 60000 }); }, { settle: 300 });
        await pf.evaluate(() => document.getElementById('snapClose').click());
        note(`Pose and light Snapshot: ${sn.ms} ms, longest task ${sn.max} ms`);
        t.check(sn.ms < K(3000), 'a Pose and light Snapshot is ready within 3 s at full speed', sn.ms);
        if (!softwareGl) t.check(sn.max <= K(200), 'a Snapshot holds no task over 200 ms at full speed', sn.tasks);
      });
      await clean(t, page, 'pose and light');

      // ---- Figure study: a pose drawn, the drawing scored
      await segment(t, 'figure study', async () => {
        await tab(page, 'figure');
        const shown = []; const done = [];
        for (let k = 0; k < 3; k++) {
          const r = await measure(page, 1, async () => {
            await timedClick(page, k === 0 ? '#fig-start' : '#fig-nextPose');
            await fr.waitForFunction((k) => { const s = document.querySelector('.fig-studio'); return s && !s.hidden && document.getElementById('fig-say').textContent.startsWith('Pose ' + (k + 1)); }, k, { timeout: 120000 });
          }, { settle: 1200 });
          shown.push({ ms: r.ms, max: r.max });
          await stroke(page, '#fs-paper'); await sleep(700);
          let d;
          const sc = await measure(page, 1, async () => { d = await timedClick(page, '#fig-done'); await fr.waitForFunction(() => !document.getElementById('fig-result').hidden, null, { timeout: 60000 }); }, { settle: 600 });
          done.push({ handler: d.handler, max: sc.max });
          await sleep(700); // (the card takes no tap for 0.6 s)
        }
        // and one Done at phone speed
        await click(page, '#fig-nextPose');
        await fr.waitForFunction(() => document.getElementById('fig-say').textContent.startsWith('Pose 4'), null, { timeout: 120000 });
        await sleep(1500); await stroke(page, '#fs-paper'); await sleep(700);
        let d4; await measure(page, 4, async () => { d4 = await timedClick(page, '#fig-done'); await fr.waitForFunction(() => !document.getElementById('fig-result').hidden, null, { timeout: 90000 }); }, { settle: 600 });
        await sleep(700); await click(page, '#fig-stop'); await sleep(300); await click(page, '#fig-stop'); await sleep(1000);
        await fr.evaluate(() => { const b = document.getElementById('fig-new'); if (b && !b.hidden) b.click(); });
        note(`Figure study at full speed: pose shown ${JSON.stringify(shown)}; Done (composite, score, JPEG): ${JSON.stringify(done)}; at phone speed Done ran ${d4.handler} ms`);
        t.check(shown.every((x) => x.ms < K(4000)), 'each Figure study pose is drawn and shown within 4 s at full speed', shown);
        t.check(min(done.map((x) => x.handler)) <= K(400), 'Done scores and shows the card within 400 ms of the tap at full speed', done);
        t.check(d4.handler <= K(3000), 'Done answers within 3 s of the tap at phone speed', d4.handler);
        note(`Done holds the main thread for ${min(done.map((x) => x.handler))}-${Math.max(...done.map((x) => x.handler))} ms at full speed (js/figure.js:344-346 composites the page, scores it against the figure and encodes a JPEG in the click); the check allows twice the 200 ms budget`);
        if (!softwareGl) t.check(Math.max(...shown.map((x) => x.max)) <= K(200), 'drawing a pose picture holds no task over 200 ms at full speed', shown);
      });
      await clean(t, page, 'figure study');

      // ---- the page after the whole tour (a Pose and light frame, a Figure study frame and a played game behind it) is idle when left alone
      await segment(t, 'idle', async () => {
        await tab(page, 'study'); await sleep(1500);
        const metrics = async () => Object.fromEntries((await page.cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
        const m0 = await metrics(); await sleep(3000); const m1 = await metrics();
        const script = Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000 / 3), task = Math.round((m1.TaskDuration - m0.TaskDuration) * 1000 / 3);
        const timers = (await probe(page, bcdp)).intervals;
        note(`idle on the Study tab after the tour: ${script} ms of script and ${task} ms of main-thread tasks a second; ${timers} interval timers running`);
        t.check(script <= K(30) && task <= K(120), 'left alone, the page spends under 30 ms a second in script and 120 ms in tasks', { script, task });
        t.check(timers <= 1, 'left alone, at most one interval timer is running after games, classes and frames have been used', timers);
      });
    } finally { await page.context().close(); }

    // ======================================================================================================
    // Memory: the same actions over and over
    // ======================================================================================================

    // ---- photos loaded and replaced, a game and a battle over and over, strokes (one fresh page)
    {
      const m = await perfPage(site);
      const mf = app(m);
      const loadM = async (file, pattern) => { await loadFile(mf, file, pattern, 120000); await sleep(100); };
      try {
        await segment(t, 'photos replaced', async () => {
          // a few different pictures, so no decoded copy of the last one can be mistaken for the next
          const files = [[P4K, '4000 × 3000']];
          for (const [w, h, type] of [[1600, 1200, 'image/jpeg'], [900, 1600, 'image/png'], [2400, 1800, 'image/jpeg']]) {
            const f = await makeImage(m, { width: w, height: h, type, draw: 'portrait', name: `m-${w}x${h}.${type === 'image/png' ? 'png' : 'jpg'}` });
            const p = path.join(tmp, f.name); fs.writeFileSync(p, f.buffer); files.push([p, `${w} × ${h}`]);
          }
          const p0 = await probe(m, bcdp);
          for (let i = 0; i < 8; i++) await loadM(...files[i % files.length]);
          const p1 = await probe(m, bcdp);
          for (let i = 8; i < 24; i++) await loadM(...files[i % files.length]);
          const p2 = await probe(m, bcdp);
          note(`24 photos replaced: start ${fmt(p0)}; after 8 ${fmt(p1)}; after 24 ${fmt(p2)}`);
          t.check(p2.heap - p1.heap <= 6, 'the JS heap does not grow over 16 more photos (after a collection)', { after8: p1.heap, after24: p2.heap });
          t.check(p1.live.typed >= 0 && p2.live.typed - p1.live.typed <= 2 && p2.live.imageData - p1.live.imageData <= 2 && p2.live.canvases - p1.live.canvases <= 4 && p2.live.images - p1.live.images <= 2, 'no earlier photo is kept: the live typed arrays (pixels, Lab planes), ImageData, canvases and images are the same after 24 photos as after 8', { after8: p1.live, after24: p2.live });
          t.check(p2.nodes - p1.nodes <= 30 && p2.listeners - p1.listeners <= 30, 'DOM nodes and listeners do not grow over 16 more photos', { nodes: [p1.nodes, p2.nodes], listeners: [p1.listeners, p2.listeners] });
          t.check(p2.blobs === 0 && p2.made > 0, 'every object URL made to read a photo is let go of (none live after 24 photos)', { live: p2.blobs, made: p2.made });
          t.check(p2.rss < 0 || p2.rss - p1.rss <= 400, 'the renderer does not keep growing without bound over 16 more photos (loose bound: 400 MB)', { after8: p1.rss, after24: p2.rss });
        });

        await segment(t, 'games and battles', async () => {
          await tab(m, 'game'); await sleep(800);
          const play = async () => {
            await click(m, '#gameStart');
            await mf.waitForFunction(() => document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 60000 });
            await mf.evaluate(() => { const bs = document.querySelectorAll('#gamePaints button'); for (let k = 0; k < 6; k++) { const b = bs[k % Math.max(1, Math.min(3, bs.length))]; if (b) b.click(); } });
            await click(m, '#gameQuit'); await sleep(100); await click(m, '#gameQuit'); await sleep(250);
          };
          await play(); await play();
          const g0 = await probe(m, bcdp);
          for (let i = 0; i < 6; i++) await play();
          const gm = await probe(m, bcdp);
          for (let i = 0; i < 6; i++) await play();
          const g1 = await probe(m, bcdp);
          note(`14 Paint by numbers games started and quit: after 2 ${fmt(g0)}; after 8 ${fmt(gm)}; after 14 ${fmt(g1)}`);
          // (a leak grows in both halves; a one-off, such as a list drawn on the third game, only in the first)
          const leaks = (a, b, c, k, by) => b[k] - a[k] > by && c[k] - b[k] > by;
          t.check(g1.heap - g0.heap <= 5 && !leaks(g0, gm, g1, 'nodes', 10) && !leaks(g0, gm, g1, 'listeners', 10) && g1.nodes - g0.nodes <= 100, 'a game started and quit 12 more times leaves no heap, nodes or listeners behind', { heap: [g0.heap, g1.heap], nodes: [g0.nodes, gm.nodes, g1.nodes], listeners: [g0.listeners, gm.listeners, g1.listeners] });
          t.check(g1.blobs === g0.blobs && g1.intervals <= g0.intervals, 'a game started and quit leaves no object URL and no running timer behind', { objectURLs: [g0.blobs, g1.blobs], timers: [g0.intervals, g1.intervals] });
          await tab(m, 'battle'); await sleep(500);
          const fight = async () => {
            await click(m, '#vb-start'); await sleep(80);
            for (let k = 0; k < 4; k++) { await mf.evaluate(() => { const s = document.querySelector('.vb-swatch'); if (s) s.click(); }); await sleep(25); await mf.evaluate(() => { const n = document.getElementById('vb-next'); if (n && !n.hidden) n.click(); }); await sleep(25); }
            await click(m, '#vb-quit'); await sleep(60); await click(m, '#vb-quit'); await sleep(150);
          };
          await fight(); await fight();
          const b0 = await probe(m, bcdp);
          for (let i = 0; i < 9; i++) await fight();
          const bm = await probe(m, bcdp);
          for (let i = 0; i < 9; i++) await fight();
          const b1 = await probe(m, bcdp);
          note(`20 battles: after 2 ${fmt(b0)}; after 11 ${fmt(bm)}; after 20 ${fmt(b1)}`);
          t.check(b1.heap - b0.heap <= 5 && !leaks(b0, bm, b1, 'nodes', 10) && !leaks(b0, bm, b1, 'listeners', 10) && b1.nodes - b0.nodes <= 100 && b1.intervals <= b0.intervals, 'a battle started and quit 18 more times leaves no heap, nodes, listeners or running timers behind', { heap: [b0.heap, b1.heap], nodes: [b0.nodes, bm.nodes, b1.nodes], listeners: [b0.listeners, bm.listeners, b1.listeners], timers: [b0.intervals, b1.intervals] });
        });

        await segment(t, 'studio strokes', async () => {
          await tab(m, 'paint'); await sleep(1000);
          const line = async (i) => { const a = (i * 0.031) % 0.8 + 0.1, b2 = (i * 0.047) % 0.8 + 0.1; await stroke(m, '#ps-paper', [[a, b2], [b2, a]], { steps: 3 }); };
          for (let i = 0; i < 10; i++) await line(i);
          await sleep(1500);
          const s0 = await probe(m, bcdp);
          for (let i = 10; i < 40; i++) { await line(i); if (i % 10 === 9) for (let u = 0; u < 4; u++) await click(m, '#ps-undo'); }
          await sleep(1500);
          const s1 = await probe(m, bcdp);
          note(`40 strokes, 12 undone: after 10 ${fmt(s0)}; after 40 ${fmt(s1)}`);
          t.check(s1.heap - s0.heap <= 5, 'the JS heap does not grow over 30 more Studio strokes', { after10: s0.heap, after40: s1.heap });
          t.check(s1.live.imageData - s0.live.imageData <= 22 && s1.live.canvases - s0.live.canvases <= 4, 'the undo stack stays capped: at most twenty pictures of the paper are kept over 30 more strokes', { after10: s0.live, after40: s1.live });
          t.check(s1.nodes - s0.nodes <= 20 && s1.listeners - s0.listeners <= 20, 'DOM nodes and listeners do not grow over 30 more Studio strokes', { nodes: [s0.nodes, s1.nodes], listeners: [s0.listeners, s1.listeners] });
          t.check(s1.rss < 0 || s1.rss - s0.rss <= 160, 'the renderer does not keep growing over 30 more strokes (the undo stack is capped at 20 pictures)', { after10: s0.rss, after40: s1.rss });
        });

        await segment(t, 'figure classes', async () => {
          await tab(m, 'figure');
          const oneClass = async () => {
            await click(m, '#fig-start');
            for (let k = 0; k < 2; k++) {
              await mf.waitForFunction((k) => { const s = document.querySelector('.fig-studio'); return s && !s.hidden && document.getElementById('fig-say').textContent.startsWith('Pose ' + (k + 1)); }, k, { timeout: 90000 });
              await sleep(500); await stroke(m, '#fs-paper'); await sleep(250);
              await click(m, '#fig-done');
              await mf.waitForFunction(() => !document.getElementById('fig-result').hidden, null, { timeout: 60000 });
              await sleep(750); // (the card takes no tap for 0.6 s)
              if (!k) await click(m, '#fig-nextPose');
            }
            await click(m, '#fig-stop'); await sleep(250); await click(m, '#fig-stop'); await sleep(1100);
            await mf.evaluate(() => { const b = document.getElementById('fig-new'); if (b && !b.hidden) b.click(); }); await sleep(400);
          };
          await oneClass();
          const f1 = await probe(m, bcdp);
          for (let i = 0; i < 3; i++) await oneClass();
          const f2 = await probe(m, bcdp);
          note(`4 Figure study classes of 2 poses: after 1 ${fmt(f1)}; after 4 ${fmt(f2)}`);
          t.check(sameGl(f1.gl, f2.gl), "Pose and light's off-screen render targets (shotTargets) do not accumulate: the live WebGL objects are the same after 4 classes as after 1", { after1: f1.gl, after4: f2.gl });
          t.check(f2.heap - f1.heap <= 8 && f2.nodes - f1.nodes <= 80 && f2.listeners - f1.listeners <= 60 && f2.intervals <= f1.intervals, 'three more classes leave no heap, nodes, listeners or running timers behind', { heap: [f1.heap, f2.heap], nodes: [f1.nodes, f2.nodes], listeners: [f1.listeners, f2.listeners], timers: [f1.intervals, f2.intervals] });
          t.check(f2.blobs <= 110, 'the object URLs alive after 4 classes are the poses\' pictures and the last class (at most 30 library + 42 shots + a few), not one per class', { after1: f1.blobs, after4: f2.blobs });
          t.check(f2.rss < 0 || f2.rss - f1.rss <= 200, 'the renderer does not keep growing over 3 more classes (loose bound: 200 MB)', { after1: f1.rss, after4: f2.rss });
        });
        await clean(t, m, 'memory loops (app page)');
      } finally { await m.context().close(); }
    }

    // ---- Pose and light on its own page: snapshots, library pictures, saved poses
    {
      const p = await perfPage(site, { url: 'pose.html' });
      try {
        await p.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30, null, { timeout: 120000 });
        await p.evaluate(() => document.getElementById('libClose').click()); await sleep(500);
        await segment(t, 'pose snapshots', async () => {
          const snap = async () => {
            await p.evaluate(() => document.getElementById('snap').click());
            await p.waitForFunction(() => { const i = document.getElementById('snapImg'); return i.complete && i.naturalWidth > 0 && i.dataset.blobUrl; }, null, { timeout: 30000 });
            await p.evaluate(() => document.getElementById('snapClose').click());
          };
          for (let i = 0; i < 3; i++) await snap();
          const a = await probe(p, bcdp);
          for (let i = 0; i < 27; i++) await snap();
          const b = await probe(p, bcdp);
          note(`30 Pose and light snapshots: after 3 ${fmt(a)}; after 30 ${fmt(b)}`);
          t.check(b.blobs <= a.blobs + 1, 'only the last snapshot\'s object URL is alive after 30 snapshots', { after3: a.blobs, after30: b.blobs });
          t.check(sameGl(a.gl, b.gl), 'snapshots create no WebGL objects that are kept', { after3: a.gl, after30: b.gl });
          t.check(b.heap - a.heap <= 3 && b.nodes === a.nodes, 'the JS heap and the DOM do not grow over 27 snapshots', { heap: [a.heap, b.heap], nodes: [a.nodes, b.nodes] });
        });
        await segment(t, 'pose library', async () => {
          const pick = async (i) => { await p.evaluate((i) => { if (document.getElementById('library').hidden) document.getElementById('posesBtn').click(); const bs = document.querySelectorAll('#poses .pose-btn'); bs[i % bs.length].click(); }, i); await sleep(120); };
          for (let i = 0; i < 4; i++) await pick(i);
          const a = await probe(p, bcdp);
          for (let i = 4; i < 40; i++) await pick(i);
          const b = await probe(p, bcdp);
          note(`40 poses picked from the library: after 4 ${fmt(a)}; after 40 ${fmt(b)}`);
          t.check(b.blobs === a.blobs && sameGl(a.gl, b.gl), 'picking poses from the library makes no new pictures or WebGL objects', { objectURLs: [a.blobs, b.blobs], gl: [a.gl, b.gl] });
          t.check(b.heap - a.heap <= 3 && b.nodes === a.nodes && b.listeners === a.listeners, 'the JS heap, DOM nodes and listeners do not grow over 36 picks', { heap: [a.heap, b.heap], nodes: [a.nodes, b.nodes], listeners: [a.listeners, b.listeners] });
        });
        await segment(t, 'saved poses', async () => {
          // Save this pose sixteen times (the page keeps twelve), then remove what is left
          const save = async () => { await p.evaluate(() => document.getElementById('savePose').click()); await sleep(420); };
          const a = await probe(p, bcdp);
          for (let i = 0; i < 16; i++) await save();
          const mid = await probe(p, bcdp);
          const listed = await p.evaluate(() => document.querySelectorAll('#mine .pose-item').length);
          for (let i = 0; i < 14 && (await p.evaluate(() => !!document.querySelector('#mine .pose-x'))); i++) { await p.evaluate(() => document.querySelector('#mine .pose-x').click()); await sleep(120); }
          const left = await p.evaluate(() => document.querySelectorAll('#mine .pose-item').length);
          const b = await probe(p, bcdp);
          const leaked = b.blobs - a.blobs;
          note(`16 poses saved, then every one removed: before ${fmt(a)}; with ${listed} listed ${fmt(mid)}; none left (${left}) ${fmt(b)}; pictures kept: ${leaked}`);
          t.check(listed === 12 && left === 0, 'the page keeps twelve of sixteen saved poses, and all can be removed', { listed, left });
          const ok = t.check(leaked <= 1, 'with every saved pose removed, no saved pose\'s picture (object URL) is left behind', { before: a.blobs, withTwelve: mid.blobs, afterRemoving: b.blobs });
          t.check(sameGl(a.gl, b.gl) && sameGl(a.gl, mid.gl), 'saving and removing poses creates no WebGL objects that are kept (shotTargets stay at their two sizes)', { before: a.gl, afterSaving: mid.gl, afterRemoving: b.gl });
          if (!ok && leaked >= 10) {
            t.finding({
              severity: 'low',
              title: 'Every pose saved in Pose and light keeps its picture (a Blob URL) for the whole visit after the pose is removed or pushed out: one object URL per pose ever saved, never revoked',
              steps: '1. Open pose.html (or the Pose and light tab). 2. Press Save this pose sixteen times (the page keeps twelve: four are pushed out), then press the × on every listed pose. 3. Count the page\'s live object URLs (URL.createObjectURL minus URL.revokeObjectURL), before and after.',
              expected: 'A picture belongs to a pose in the library; when the pose is removed (or pushed out by the thirteenth) its Blob URL is revoked, as the Save dialog\'s and the snapshot\'s are, so the live URLs follow the poses on the page. (The README says the saved poses are "no pictures": joint angles and a viewpoint.)',
              actual: `Live object URLs before: ${a.blobs}; with twelve poses listed: ${mid.blobs} (+${mid.blobs - a.blobs} for sixteen saves); after every pose was removed (${left} listed): ${b.blobs} (+${leaked}). Each is a small JPEG of about 8 KB, so this is a slow leak, but it never stops: it grows with every pose saved or removed in a long visit. Figure study's picture cache for poses saved in Pose and light behaves the same way (js/figure.js:97-102 revokes a picture only when the same id sends a new one).`,
              cause: 'js/pose.js:1295-1303 (pumpThumbs) stores each drawn picture in the thumbs Map by pose id (js/pose.js:1328, "kept for the visit") and nothing ever revokes it or deletes the entry: the × handler (js/pose.js:1431-1441) and changeMine (js/pose.js:1380-1400, with its MINE_MAX push-out) remove the pose from the stored list and its button, not its entry in thumbs.',
            });
          }
        });
        await clean(t, p, 'pose page memory loops');
      } finally { await p.context().close(); }
    }
  } finally {
    note(`seconds per section: ${JSON.stringify(took)}`);
    try { await bcdp.detach(); } catch (e) { /* closed with the browser */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
