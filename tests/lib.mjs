// Shared helpers for the test cases in tests/cases/. Everything here drives the real site in headless
// Chromium (SwiftShader for WebGL) served by tests/serve.mjs, with the policy enforced as a header.
//
//   withSite(opts, async (site) => { ... })      a server on a free port and a browser; site = { base, browser, root }
//   openPage(site, { viewport, url, storage, block, dark, sandbox })   a page with page.log (errors, violations, requests)
//   clean(t, page, label)                         records checks: no page error, console error, violation, off-site request
//   tab(page, name)                               opens a tab (study, loomis, pose, trace, help, paint, figure, game, battle) and waits for it
//   makeImage(page, { width, height, type, draw }), loadPhoto(page, file), dropFiles(...), dropText(...), pasteFile(...)
//   stroke(page, selector, points), inked(page, selector), storageKeys(page), screenshot(page, name), axe(page)
//   checker()  →  t.check(ok, name, detail) / t.finding({ title, severity, steps, expected, actual }) / t.note(text)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DESKTOP = { width: 1400, height: 900 };
export const PHONE = { width: 390, height: 844 };
export const TABS = ['study', 'loomis', 'pose', 'trace', 'help', 'paint', 'figure', 'game', 'battle'];
export const PROTO_NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
const NOISE = /GPU stall|GL Driver Message|SwiftShader|WebGL-0x/i;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withSite(opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const root = opts.root || process.env.PVS_ROOT || ROOT;
  const site = await serve(root);
  // a fake camera, its permission granted (Trace onto paper): nothing else asks for a camera
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try { return await fn({ base: site.base, browser, root }); } finally { await browser.close(); await site.close(); }
}

// A page that records everything the site must never do. opts: viewport (DESKTOP), url ('' or 'pose.html'
// or '#paint'), storage ({ key: value } written to localStorage before any script runs; a non-string value
// is JSON-encoded), block (glob patterns answered with a network failure), notFound (patterns answered 404),
// dark (prefers-color-scheme), reducedMotion, bypassCSP (only for tooling like axe), sandbox (the page inside
// another origin's <iframe sandbox="..."> instead of top level: returns the outer page, with page.app = the frame).
export async function openPage(site, opts = {}) {
  const { viewport = DESKTOP, url = '', storage = null, block = [], notFound = [], dark = false, reducedMotion = false, bypassCSP = false, sandbox = null, waitUntil = 'load' } = opts;
  const context = await site.browser.newContext({ viewport, colorScheme: dark ? 'dark' : 'light', reducedMotion: reducedMotion ? 'reduce' : 'no-preference', bypassCSP });
  const page = await context.newPage();
  const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  page.log = log;
  page.on('pageerror', (e) => log.pageerrors.push(String(e.stack || e.message).slice(0, 400)));
  page.on('console', (m) => { const t = m.text(); if (NOISE.test(t)) return; if (m.type() === 'error') log.console.push(t.slice(0, 300)); else if (m.type() === 'warning') log.warnings.push(t.slice(0, 300)); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:' + site.base) && !u.startsWith('blob:null') && !u.startsWith('data:') && !(sandbox && u.startsWith(sandbox.base))) log.offsite.push(u); });
  // (a request a navigation cut short, and a Blob picture let go of, are not failures)
  page.on('requestfailed', (r) => { const u = r.url(); const why = (r.failure() || {}).errorText || ''; if (u.startsWith('blob:') || why === 'net::ERR_ABORTED' || block.some((b) => matchGlob(b, u))) return; log.failed.push(u + ' ' + why); });
  await page.addInitScript((seed) => {
    document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${(e.blockedURI || '').slice(0, 60)} ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber}`); });
    if (seed) { try { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { /* storage off */ } }
  }, storage);
  for (const b of block) await page.route(b, (r) => r.abort());
  for (const b of notFound) await page.route(b, (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' }));
  if (sandbox) {
    // another origin: a second loopback server whose only page frames the app
    const target = site.base + (url || 'index.html');
    const html = `<!doctype html><title>embedder</title><iframe id="app" src="${target}" sandbox="${sandbox.attrs || 'allow-scripts allow-modals'}" style="width:${viewport.width - 40}px;height:${viewport.height - 40}px;border:0"></iframe>`;
    const embedder = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
    await new Promise((r) => embedder.listen(0, '127.0.0.1', r));
    sandbox.base = `http://127.0.0.1:${embedder.address().port}/`;
    context.on('close', () => embedder.close());
    await page.goto(sandbox.base, { waitUntil });
    for (let i = 0; i < 40 && !page.app; i++) { page.app = page.frames().find((f) => f.url().startsWith(site.base)); if (!page.app) await sleep(250); }
    if (!page.app) throw new Error('the embedded app frame never appeared');
    await page.app.waitForLoadState('load').catch(() => null);
  } else {
    await page.goto(site.base + url, { waitUntil });
  }
  await sleep(300);
  return page;
}
function matchGlob(glob, url) { return new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$').test(url); }

// another tab of the same site in the same browser context (the same storage), recorded like the first
export async function newTab(site, page, { url = '' } = {}) {
  const p = await page.context().newPage();
  const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  p.log = log;
  p.on('pageerror', (e) => log.pageerrors.push(String(e.stack || e.message).slice(0, 400)));
  p.on('console', (m) => { const t = m.text(); if (NOISE.test(t)) return; if (m.type() === 'error') log.console.push(t.slice(0, 300)); else if (m.type() === 'warning') log.warnings.push(t.slice(0, 300)); });
  p.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) log.offsite.push(u); });
  p.on('requestfailed', (r) => { const u = r.url(); const why = (r.failure() || {}).errorText || ''; if (u.startsWith('blob:') || why === 'net::ERR_ABORTED') return; log.failed.push(u + ' ' + why); });
  await p.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${(e.blockedURI || '').slice(0, 60)} ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber}`); }); });
  await p.goto(site.base + url, { waitUntil: 'load' });
  await sleep(300);
  return p;
}

// every policy violation seen by the page and its frames
export async function violations(page) {
  const out = [];
  for (const fr of page.frames()) {
    try { const v = await fr.evaluate(() => window.__csp || []); for (const x of new Set(v)) out.push((fr === page.mainFrame() ? 'top' : fr.url().split('/').pop().slice(0, 30)) + ': ' + x); } catch (e) { /* a frame that went away */ }
  }
  return out;
}

// The checker a case fills in. A check is an expectation (ok or not); a finding is a defect or an edge
// case the site does not handle, described so someone can reproduce it; a note is context for the report.
export function checker(name) {
  const t = { name, checks: [], findings: [], notes: [] };
  t.check = (ok, title, detail) => { t.checks.push({ ok: !!ok, title, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) }); if (!ok) process.stdout.write(`    FAIL ${title}${detail !== undefined ? ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}\n`); return !!ok; };
  t.finding = (f) => { t.findings.push({ severity: 'medium', ...f }); process.stdout.write(`    FINDING [${f.severity || 'medium'}] ${f.title}\n`); };
  t.note = (text) => { t.notes.push(String(text)); };
  return t;
}

// the four things a page must never show, as checks; also clears what it saw so the next step starts clean
export async function clean(t, page, label) {
  const csp = await violations(page);
  const log = page.log;
  const ok = t.check(log.pageerrors.length === 0, `${label}: no page error`, log.pageerrors)
    & t.check(log.console.length === 0, `${label}: no console error`, log.console)
    & t.check(csp.length === 0, `${label}: no policy violation`, csp)
    & t.check(log.offsite.length === 0, `${label}: no request off the site`, log.offsite)
    & t.check(log.failed.length === 0, `${label}: no failed request`, log.failed);
  log.pageerrors.length = log.console.length = log.offsite.length = log.failed.length = 0;
  for (const fr of page.frames()) { try { await fr.evaluate(() => { window.__csp = []; }); } catch (e) { /* gone */ } }
  return !!ok;
}

const frameOf = (page, part) => page.frames().find((f) => f.url().includes(part));
export const poseFrame = (page) => frameOf(page, 'embed=1');
export const renderFrame = (page) => frameOf(page, 'render=1');
export const app = (page) => page.app || page.mainFrame();

// open a tab the way a visitor does (through its menu item) and wait until it is up
export async function tab(page, name, { wait = true, timeout = 30000 } = {}) {
  const fr = app(page);
  await fr.evaluate((n) => { const b = document.querySelector(`[data-tab="${n}"]`); if (!b) throw new Error('no tab ' + n); b.click(); }, name);
  await fr.waitForFunction((n) => { const p = document.getElementById('tab-' + n); return p && !p.hidden; }, name, { timeout: 5000 }).catch(() => null);
  if (!wait) return;
  if (name === 'pose') {
    await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => null);
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const f = poseFrame(page); if (f) { const up = await f.evaluate(() => !!window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30 || !document.getElementById('fail').hidden).catch(() => false); if (up) return; } await sleep(250); }
  } else if (name === 'figure') {
    // the pose list, then every picture (they stream in one at a time), or the note that none can be drawn
    await fr.waitForFunction(() => { const b = document.querySelectorAll('#tab-figure [data-pose-id]'); return (b.length > 0 && [...b].every((x) => { const i = x.querySelector('img'); return i && i.src.startsWith('blob:'); })) || /could not be drawn/.test(document.getElementById('fig-libNote').textContent); }, null, { timeout }).catch(() => null);
  } else {
    await sleep(300);
  }
}

// an image drawn in the page (a canvas), returned as the file a file input or a drop takes
export async function makeImage(page, { width = 600, height = 800, type = 'image/png', quality = 0.9, name, draw = 'portrait' } = {}) {
  const fr = app(page);
  const dataUrl = await fr.evaluate(async ([w, h, type, q, draw]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (draw === 'portrait') {
      const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#8a9aa6'); grad.addColorStop(1, '#3b4a52'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c98f6a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.42, w * 0.22, h * 0.25, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6b3f2a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.25, w * 0.24, h * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2e2420'; g.fillRect(w * 0.4, h * 0.4, w * 0.05, h * 0.02); g.fillRect(w * 0.55, h * 0.4, w * 0.05, h * 0.02);
      g.fillStyle = '#9c5a4a'; g.fillRect(w * 0.45, h * 0.54, w * 0.1, h * 0.02);
      g.fillStyle = '#1f2a33'; g.fillRect(w * 0.2, h * 0.68, w * 0.6, h * 0.32);
    } else if (draw === 'flat') { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); }
    else if (draw === 'transparent') { g.fillStyle = 'rgba(200,60,60,1)'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2); g.fill(); }
    else if (draw === 'noise') { const d = g.createImageData(w, h); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }
    else if (draw === 'white') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    else if (draw === 'black') { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    return c.toDataURL(type, q);
  }, [width, height, type, quality, draw]);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[m[1]] || 'bin';
  return { name: name || `test-${width}x${height}.${ext}`, mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}
// a file that is not an image (or a broken one)
export const textFile = (name = 'notes.txt', text = 'not a picture') => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
export const brokenImage = (name = 'broken.jpg') => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from('\xff\xd8\xff\xe0 not really a jpeg', 'binary') });
export const svgImage = (svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>', name = 'drawing.svg') => ({ name, mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });

// the Load photo input; resolves once the study has been redrawn (or after a wait, for a rejected file)
export async function loadPhoto(page, file, { selector = '#file', settle = 2500 } = {}) {
  const fr = app(page);
  await fr.setInputFiles(selector, file);
  await fr.waitForFunction(() => { const b = document.getElementById('busy'); return !b || b.hidden; }, null, { timeout: 30000 }).catch(() => null);
  await sleep(settle);
}
// a drop onto an element: files, or text / a URL as another tab's drag would carry
async function dispatchDrop(page, selector, items) {
  const fr = app(page);
  await fr.evaluate(async ([sel, items]) => {
    const el = document.querySelector(sel); if (!el) throw new Error('no ' + sel);
    const dt = new DataTransfer();
    for (const it of items) {
      if (it.file) { const bin = atob(it.file.b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); dt.items.add(new File([bytes], it.file.name, { type: it.file.mimeType })); }
      else dt.setData(it.type, it.data);
    }
    for (const type of ['dragenter', 'dragover', 'drop']) { const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }); el.dispatchEvent(e); }
  }, [selector, items]);
}
export const dropFiles = (page, selector, files) => dispatchDrop(page, selector, files.map((f) => ({ file: { name: f.name, mimeType: f.mimeType, b64: f.buffer.toString('base64') } })));
export const dropText = (page, selector, text, url) => dispatchDrop(page, selector, [{ type: 'text/plain', data: text }].concat(url ? [{ type: 'text/uri-list', data: url }] : []));
// a paste with a file on the clipboard (as a screenshot pasted from the clipboard would be)
export async function pasteFile(page, file) {
  await app(page).evaluate(async (f) => {
    const bin = atob(f.b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([bytes], f.name, { type: f.mimeType }));
    document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }, { name: file.name, mimeType: file.mimeType, b64: file.buffer.toString('base64') });
  await sleep(2500);
}

// a pointer stroke across an element: points are fractions of its box, default a diagonal
export async function stroke(page, selector, points = [[0.3, 0.3], [0.5, 0.5], [0.7, 0.65]], { steps = 8, frame = null, button = 'left' } = {}) {
  const loc = (frame || app(page)).locator(selector).first();
  await loc.scrollIntoViewIfNeeded().catch(() => null); // a phone's page is taller than its window
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box for ' + selector);
  const at = (p) => [b.x + b.width * p[0], b.y + b.height * p[1]];
  const [x0, y0] = at(points[0]);
  await page.mouse.move(x0, y0); await page.mouse.down({ button });
  for (let i = 1; i < points.length; i++) { const [x, y] = at(points[i]); await page.mouse.move(x, y, { steps }); await sleep(16); }
  await page.mouse.up({ button });
  return b;
}
// how much of a canvas differs from its first pixel (0 = blank)
export const inked = (page, selector, frame = null) => (frame || app(page)).evaluate((s) => { const c = document.querySelector(s); if (!c || !c.getContext) return -1; const g = c.getContext('2d'); if (!g) return -1; const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) { if (d[i + 3] > 0 && (Math.abs(d[i] - d[0]) > 40 || Math.abs(d[i + 1] - d[1]) > 40 || Math.abs(d[i + 2] - d[2]) > 40)) n++; } return n; }, selector);
export const storageKeys = (page, prefix = /^(portrait-value-studio|pose-and-light)\./) => app(page).evaluate((p) => Object.keys(localStorage).filter((k) => new RegExp(p).test(k)), prefix.source);
export const storageGet = (page, key) => app(page).evaluate((k) => localStorage.getItem(k), key);
export const hscroll = (page) => app(page).evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]).then(([a, b]) => a - b);
export const text = (page, selector) => app(page).evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, selector);
export const visible = (page, selector) => app(page).evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && r.width > 0 && r.height > 0; }, selector);
export const click = (page, selector) => app(page).evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.click(); }, selector);
export const toastText = (page) => text(page, '#toast');

export async function screenshot(page, name) {
  const dir = path.join(ROOT, 'tests', 'screens'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name.replace(/[^a-z0-9._-]+/gi, '-') + '.png');
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// axe-core over the page as it stands (needs a page opened with bypassCSP: true, so the script can be added)
export async function axe(page, { frame = null } = {}) {
  const src = fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  const fr = frame || app(page);
  await fr.evaluate(src);
  // colors are measured as they end up: a tab that just lost or gained aria-current is still in its 0.15 s
  // color transition, and a contrast sampled halfway is not what the visitor reads (CSS transitions only:
  // an endless animation would never finish)
  await fr.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && typeof CSSTransition !== 'undefined' && a instanceof CSSTransition), null, { timeout: 3000 }).catch(() => null);
  const r = await fr.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) , count: v.nodes.length }));
}
