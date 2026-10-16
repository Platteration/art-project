// Pose and light, on its own page and inside the app: the library and every one of its 30 poses, each
// rig control dragged far past the figure (feet planted and free), the arrows by tap, hold and keyboard,
// Straighten and Copy to the other side, the lamp by drag, keyboard, presets and every slider at both
// ends, See it as with the splits at their ends and crossed, Show or hide, Front view, Start over,
// Snapshot, Undo past sixty steps, Save this pose past twelve, remove and Put back, a full storage,
// Simple and Advanced from the app's switch and the page's own (remembered), the window resized while
// open, Where you left off after a reload (one mid-drag), hostile saved state for every key the page
// reads, and the render protocol flooded from the app page; at 1400 × 900 and 390 × 844.
import { openPage, clean, tab, poseFrame, renderFrame, sleep, DESKTOP, PHONE, hscroll, screenshot } from '../lib.mjs';

// the page is up: started, with all 30 pictures drawn
const up = (fr, timeout = 30000) => fr.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30, null, { timeout }).catch(() => null);
// the figure as the page holds it: no NaN anywhere, every angle inside its joint's limits, and where it stands
const scan = (fr) => fr.evaluate(() => {
  const api = window.PoseAndLight, p = api.pose, bad = [], out = [];
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object') for (const [a, x] of Object.entries(v)) { if (!Number.isFinite(x)) bad.push(k + '.' + a); const s = api.SPEC[k]; if (s) { const ax = s.axes.find((q) => q.axis === a); const [lo, hi] = ax ? [ax.min, ax.max] : [0, 0]; if (x < lo - 1e-6 || x > hi + 1e-6) out.push(`${k}.${a}=${x}`); } }
    else if (!Number.isFinite(v)) bad.push(k);
  }
  for (const [k, x] of Object.entries(api.light)) if (!Number.isFinite(x)) bad.push('light.' + k);
  return { bad, out, low: +api.lowestPoint().toFixed(4), height: +p.height.toFixed(4), shift: { x: +p.shift.x.toFixed(3), z: +p.shift.z.toFixed(3) }, az: +api.light.az.toFixed(1), el: +api.light.el.toFixed(1) };
});
const sane = (s, lowMax = 0.02) => s.bad.length === 0 && s.out.length === 0 && s.low >= -0.002 && s.low <= lowMax;
const poseJson = (fr) => fr.evaluate(() => JSON.stringify(window.PoseAndLight.pose));
const ctrl = async (fr, id) => (await fr.evaluate(() => { window.PoseAndLight.render(); return window.PoseAndLight.ctrls(); })).find((x) => x.id === id);
// a pointer drag on the stage: from a point in canvas pixels, through points as fractions of the canvas
// (outside 0..1 is off the stage), with the mouse, as a visitor drags
async function drag(page, fr, from, through, steps = 8) {
  const loc = fr.locator('#view');
  await loc.scrollIntoViewIfNeeded().catch(() => null);
  const b = await loc.boundingBox();
  if (!b) throw new Error('no canvas box');
  await page.mouse.move(b.x + from.x, b.y + from.y);
  await page.mouse.down();
  for (const [fx, fy] of through) await page.mouse.move(b.x + fx * b.width, b.y + fy * b.height, { steps });
  await page.mouse.up();
  return b;
}
const pick = (fr, id) => fr.evaluate((id) => { if (document.getElementById('library').hidden) document.getElementById('posesBtn').click(); const b = document.querySelector(`#poses .pose-btn[data-id="${id}"]`); if (!b) throw new Error('no pose ' + id); b.click(); }, id);
// the ball of each foot, in the room (a planted foot may lift its heel, but its ball stays put)
const balls = (fr) => fr.evaluate(() => { const api = window.PoseAndLight, T = window.THREE, r = {}; for (const s of ['R', 'L']) { const v = new T.Vector3(0, -0.04, 0.158).applyQuaternion(api.worldQuat('ankle' + s)).add(api.worldPos('ankle' + s)); r[s] = [v.x, v.y, v.z]; } return r; });
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const setRange = (fr, id, v, change = true) => fr.evaluate(([id, v, change]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); if (change) el.dispatchEvent(new Event('change')); return { value: el.value, out: document.getElementById(id + 'Out').textContent }; }, [id, v, change]);
// a tap on the stage's background: a corner (not the buttons') farthest from the lamp's handle, the arrows
// and the rig controls
async function tapBackground(page, fr) {
  const b = await fr.locator('#view').boundingBox();
  const at = await fr.evaluate(() => {
    const v = document.getElementById('view'), w = v.clientWidth, h = v.clientHeight;
    const busy = [{ x: +document.getElementById('lampHandle').dataset.x, y: +document.getElementById('lampHandle').dataset.y }];
    document.querySelectorAll('#arrows button').forEach((a) => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(a.style.transform); if (m) busy.push({ x: +m[1], y: +m[2] }); });
    window.PoseAndLight.ctrls().forEach((c) => { if (c.center) busy.push(c.center); });
    const room = (p) => Math.min(...busy.map((q) => Math.hypot(q.x - p[0], q.y - p[1])));
    return [[8, 8], [w - 8, 8], [8, h - 8], [8, h / 2], [w / 2, 8]].sort((p, q) => room(q) - room(p))[0];
  });
  await page.mouse.click(b.x + at[0], b.y + at[1]);
}
const STORAGE_NOTE = /storage/i;
// the app's frame height once the page has stopped telling it a new one
async function settledHeight(page) {
  let h = '';
  for (let i = 0; i < 12; i++) { const now = await page.evaluate(() => document.getElementById('poseFrame').style.height); if (now === h) break; h = now; await sleep(250); }
  return h;
}

// ---- for the checks added from the coverage review ------------------------------------------------
// where a joint lands on the stage, in the canvas's CSS pixels
const screenOf = (fr, joint) => fr.evaluate((j) => { const api = window.PoseAndLight, v = document.getElementById('view'); const p = api.worldPos(j).project(api.camera); return { x: (p.x + 1) / 2 * v.clientWidth, y: (1 - p.y) / 2 * v.clientHeight }; }, joint);
// a point on a part (canvas pixels), as near its middle as can be, that no rig control takes: a tap there picks
// the part, and a drag there moves it once it is picked
const spotOn = (fr, joint) => fr.evaluate((joint) => {
  const api = window.PoseAndLight, T = window.THREE, v = document.getElementById('view'), r = v.getBoundingClientRect();
  api.render();
  const ray = new T.Raycaster(), box = new T.Box3();
  api.parts.filter((m) => m.userData.joint === joint).forEach((m) => box.expandByObject(m));
  const c = box.getCenter(new T.Vector3()).project(api.camera), cx = (c.x + 1) / 2 * v.clientWidth, cy = (1 - c.y) / 2 * v.clientHeight;
  for (let rad = 0; rad < 60; rad += 3) {
    for (let k = 0; k < 16; k++) {
      const x = cx + rad * Math.cos(k * Math.PI / 8), y = cy + rad * Math.sin(k * Math.PI / 8);
      ray.setFromCamera(new T.Vector2(x / v.clientWidth * 2 - 1, -(y / v.clientHeight) * 2 + 1), api.camera);
      const h = ray.intersectObjects(api.parts, false)[0];
      if (h && h.object.userData.joint === joint && !api.ctrlAt({ clientX: r.left + x, clientY: r.top + y })) return { x, y };
      if (rad === 0) break;
    }
  }
  return null;
}, joint);
// a foot: its heading on the floor and how far its sole tilts (degrees), its ankle, and the ball of the foot
const footOf = (fr, s) => fr.evaluate((s) => { const api = window.PoseAndLight, T = window.THREE, q = api.worldQuat('ankle' + s), a = api.worldPos('ankle' + s); const f = new T.Vector3(0, 0, 1).applyQuaternion(q), u = new T.Vector3(0, 1, 0).applyQuaternion(q); return { heading: +(Math.atan2(f.x, f.z) / Math.PI * 180).toFixed(1), tilt: +(Math.acos(Math.min(1, u.y)) / Math.PI * 180).toFixed(1), ankle: a.toArray(), ball: new T.Vector3(0, -0.04, 0.158).applyQuaternion(q).add(a).toArray(), q: q.toArray() }; }, s);
const turnBetween = (fr, q0, q1) => fr.evaluate(([a, b]) => new window.THREE.Quaternion(...a).angleTo(new window.THREE.Quaternion(...b)), [q0, q1]);
// a mouse drag from a point on the canvas by an offset, in a few steps (each step waits for a frame here)
async function dragBy(page, fr, from, dx, dy, steps = 3) {
  const b = await fr.locator('#view').boundingBox();
  await page.mouse.move(b.x + from.x, b.y + from.y); await page.mouse.down();
  await page.mouse.move(b.x + from.x + dx, b.y + from.y + dy, { steps }); await page.mouse.up();
}
// a picked part's arrow (its label starts so) pressed n times by keyboard, as a visitor tabbing to it would
async function pressArrow(page, fr, label, n) {
  const found = await fr.evaluate((l) => { window.PoseAndLight.render(); const b = [...document.querySelectorAll('#arrows button')].find((x) => x.getAttribute('aria-label').startsWith(l)); if (!b) return false; b.focus(); return true; }, label);
  for (let i = 0; found && i < n; i++) await page.keyboard.press('Enter');
  return found;
}
// the stage's background, as tapBackground finds it (canvas pixels)
const backgroundSpot = (fr) => fr.evaluate(() => {
  const v = document.getElementById('view'), w = v.clientWidth, h = v.clientHeight;
  const busy = [{ x: +document.getElementById('lampHandle').dataset.x, y: +document.getElementById('lampHandle').dataset.y }];
  document.querySelectorAll('#arrows button').forEach((a) => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(a.style.transform); if (m) busy.push({ x: +m[1], y: +m[2] }); });
  window.PoseAndLight.ctrls().forEach((c) => { if (c.center) busy.push(c.center); });
  const room = (p) => Math.min(...busy.map((q) => Math.hypot(q.x - p[0], q.y - p[1])));
  const at = [[8, 8], [w - 8, 8], [8, h - 8], [8, h / 2], [w / 2, 8]].sort((p, q) => room(q) - room(p))[0];
  return { x: at[0], y: at[1] };
});
// pictures as 32 × 40 gray samples, to tell one from another (Blob pictures are this page's own: readable)
const looks = (fr, selector) => fr.evaluate((sel) => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 40; const g = c.getContext('2d', { willReadFrequently: true });
  return [...document.querySelectorAll(sel)].map((img) => {
    g.clearRect(0, 0, 32, 40); g.drawImage(img, 0, 0, 32, 40);
    const d = g.getImageData(0, 0, 32, 40).data, gray = [];
    let wood = 0;
    for (let i = 0; i < d.length; i += 4) { gray.push(Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])); if (d[i] - d[i + 2] > 30 && d[i] > 60) wood++; }
    const btn = img.closest('.pose-btn');
    return { id: btn && btn.dataset.id, gray, wood };
  });
}, selector);
const differs = (a, b) => a.gray.filter((v, i) => Math.abs(v - b.gray[i]) > 24).length / a.gray.length;
// the README's library, group by group
const LIBRARY = [['Standing', ['Stand', 'Weight on one leg', 'Wave', 'Reach', 'Think', 'Hands on hips', 'Point']], ['Moving and sport', ['Walk', 'Run', 'Lunge', 'Jump', 'Throw', 'Kick', 'Box']], ['Low to the floor', ['Crouch', 'Kneel', 'Sit']], ['Dance', ['Arabesque', 'Attitude', 'À la seconde', 'Passé', 'Penché', 'Cambré', 'Grand jeté', 'Révérence', 'Flamenco', 'Jazz', 'Floor reach', 'Spiral', 'Hip-hop']]];
// a page in a context of its own (for options openPage does not take), recorded as openPage records
async function openOwn(site, contextOpts, url, init) {
  const context = await site.browser.newContext(contextOpts);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const log = { pageerrors: [], console: [], csp: [], offsite: [], failed: [], warnings: [] };
  page.log = log;
  page.on('pageerror', (e) => log.pageerrors.push(String(e.stack || e.message).slice(0, 400)));
  page.on('console', (m) => { const x = m.text(); if (/GPU stall|GL Driver Message|SwiftShader|WebGL-0x/i.test(x)) return; if (m.type() === 'error') log.console.push(x.slice(0, 300)); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(site.base) && !u.startsWith('blob:') && !u.startsWith('data:')) log.offsite.push(u); });
  page.on('requestfailed', (r) => { const u = r.url(); const why = (r.failure() || {}).errorText || ''; if (u.startsWith('blob:') || why === 'net::ERR_ABORTED') return; log.failed.push(u + ' ' + why); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${(e.blockedURI || '').slice(0, 60)} ${(e.sourceFile || '').split('/').pop()}:${e.lineNumber}`); }); });
  await page.goto(site.base + url, { waitUntil: 'load' });
  return page;
}

export default async function pose(t, site) {
  const started = Date.now();
  const lap = (what) => t.note(`${what}: ${((Date.now() - started) / 1000).toFixed(0)} s in`);
  // ---- The page on its own at 1400 × 900: the start screen, the keyboard, every pose -------------------
  {
    const page = await openPage(site, { url: 'pose.html' });
    const fr = page.mainFrame();
    // before the pictures are drawn: a button shows its pose's name; drawing them leaves the figure as it was
    await fr.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses .pose-btn').length === 30, null, { timeout: 30000 }).catch(() => null);
    const early = await fr.evaluate(() => { const b = [...document.querySelectorAll('#poses .pose-btn')].reverse().find((x) => !x.classList.contains('has-img')); if (!b) return null; const n = b.querySelector('.pose-name'), r = n.getBoundingClientRect(), cs = getComputedStyle(n); return { id: b.dataset.id, name: n.textContent, label: b.getAttribute('aria-label'), shown: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && r.width > 0 && r.height > 0 }; });
    const sceneNow = () => fr.evaluate(() => { const api = window.PoseAndLight; return JSON.stringify({ pose: api.pose, light: api.light, stand: api.stand.visible, lamp: api.lamp.position.toArray(), target: api.TARGET.toArray(), shown: api.scene.children.filter((o) => o.type === 'Group' || o.type === 'Line').map((o) => o.visible) }); });
    const sceneBefore = await sceneNow();
    await up(fr);
    if (early) t.check(early.shown && early.name === early.label, 'a library button whose picture is not drawn yet shows its pose\'s name', early);
    else t.note('every library picture was drawn before the page could be read: the name shown until a picture arrives was not seen');
    t.check((await sceneNow()) === sceneBefore, 'drawing the 30 pictures off screen leaves the figure, the light, the stand and the lamp as they were', (await sceneNow()).slice(0, 200));
    const s0 = await fr.evaluate(() => ({ imgs: document.querySelectorAll('#poses button.has-img').length, blob: [...document.querySelectorAll('#poses img')].every((i) => i.src.startsWith('blob:')), title: document.getElementById('libTitle').textContent, note: document.getElementById('libNote').textContent, start: document.getElementById('library').classList.contains('is-start'), close: getComputedStyle(document.getElementById('libClose')).display, cont: document.getElementById('continueWrap').hidden, mine: document.getElementById('mineWrap').hidden, inert: document.querySelector('.rail').hasAttribute('inert') && document.getElementById('view').hasAttribute('inert'), focus: document.activeElement.dataset.id, hint: document.getElementById('hint').hidden, simple: document.documentElement.classList.contains('simple'), expanded: document.getElementById('posesBtn').getAttribute('aria-expanded') }));
    t.check(s0.imgs === 30 && s0.blob, 'standalone: 30 poses with Blob pictures', s0);
    t.check(s0.start && s0.title === 'Choose a pose to start' && /Pick a pose to begin/.test(s0.note) && s0.close === 'none' && s0.cont && s0.mine && s0.inert && s0.expanded === 'true', 'standalone: opens on the start screen with no close button, the page behind it waiting, nothing from last time', s0);
    t.check(s0.focus === 'stand' && s0.simple, 'standalone: focus on the first pose, Simple to start', s0);
    // the library's four groups, the poses in each as the README lists them, each button named alike everywhere
    const groups = await fr.evaluate(() => [...document.querySelectorAll('#poses .lib-group')].map((g) => [g.querySelector('h3').textContent, [...g.querySelectorAll('.pose-btn')].map((b) => ({ label: b.getAttribute('aria-label'), title: b.title, name: b.querySelector('.pose-name').textContent }))]));
    t.check(JSON.stringify(groups.map(([h, bs]) => [h, bs.map((b) => b.label)])) === JSON.stringify(LIBRARY) && groups.every(([, bs]) => bs.every((b) => b.title === b.label && b.name === b.label)), 'the library: Standing, Moving and sport, Low to the floor and Dance, each with the poses the README lists in its order, each button\'s name, label and title alike', groups.map(([h, bs]) => h + ': ' + bs.map((b) => b.label).join(', ')));
    // each picture is a picture of its own pose: thirty different pictures, each of a figure, Jump and Crouch unlike Stand
    {
      const pics = await looks(fr, '#poses .pose-btn img');
      const byId = Object.fromEntries(pics.map((p) => [p.id, p]));
      const distinct = new Set(pics.map((p) => p.gray.map((v) => v >> 4).join())).size;
      const flat = pics.filter((p) => new Set(p.gray.map((v) => v >> 4)).size <= 2 || p.wood < 20).map((p) => p.id);
      const unlike = { jump: byId.jump && byId.stand && +differs(byId.jump, byId.stand).toFixed(3), crouch: byId.crouch && byId.stand && +differs(byId.crouch, byId.stand).toFixed(3) };
      t.check(pics.length === 30 && distinct >= 25 && flat.length === 0 && unlike.jump > 0.1 && unlike.crouch > 0.1, 'the 30 pictures are pictures of their own poses: at least 25 different ones, none blank, each with the wooden figure in it, Jump and Crouch unlike Stand', { n: pics.length, distinct, flat, unlike });
    }
    await page.keyboard.press('Escape');
    t.check(await fr.evaluate(() => !document.getElementById('library').hidden), 'the start screen does not close on Escape');
    await page.keyboard.press('Enter');
    const s1 = await fr.evaluate(() => ({ hidden: document.getElementById('library').hidden, hint: document.getElementById('hint').hidden, focus: document.activeElement.id, expanded: document.getElementById('posesBtn').getAttribute('aria-expanded'), inert: document.querySelector('.rail').hasAttribute('inert'), undo: document.getElementById('undo').disabled }));
    t.check(s1.hidden && !s1.hint && s1.focus === 'posesBtn' && s1.expanded === 'false' && !s1.inert, 'Enter on the focused pose picks it: the sheet closes, the tips show, focus goes to Poses', s1);
    const pills = await fr.evaluate(() => [...document.querySelectorAll('#hint span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent));
    t.check(pills.join(' | ') === 'Drag a colored control to pose | Tap a part to pick it | Drag the lamp to move the light | Drag the background to walk around', 'the tips on the stage in Simple: drag a control, tap a part to pick it, drag the lamp, drag the background', pills);
    await tapBackground(page, fr);
    t.check(await fr.evaluate(() => document.getElementById('hint').hidden), 'the first touch on the stage puts the tips away');
    const ids =await fr.evaluate(() => window.PoseAndLight.POSES.map((p) => p.id));
    t.check(ids.length === 30, 'the library holds 30 poses', ids.length);
    const broken = [];
    for (const id of ids) {
      await pick(fr, id);
      const s = await scan(fr);
      const lib = await fr.evaluate(() => ({ hidden: document.getElementById('library').hidden, undo: document.getElementById('undo').disabled }));
      if (!sane(s, 0.45) || !lib.hidden) broken.push({ id, ...s, ...lib });    // Jump and Grand jeté are lifted off the floor
    }
    t.check(broken.length === 0, 'every one of the 30 poses: no NaN, every angle in its limits, on the floor, the sheet closed', broken);
    await fr.evaluate(() => document.getElementById('posesBtn').click());
    const s2 = await fr.evaluate(() => ({ note: document.getElementById('libNote').textContent, pressed: [...document.querySelectorAll('.pose-btn[aria-pressed="true"]')].map((b) => b.dataset.id), title: document.getElementById('libTitle').textContent, focus: document.activeElement.dataset.id, close: getComputedStyle(document.getElementById('libClose')).display }));
    t.check(s2.note === 'On the figure now: Hip-hop' && s2.pressed.join() === 'hiphop' && s2.title === 'Pose library' && s2.focus === 'hiphop' && s2.close !== 'none', 'the library reopened says which pose is on the figure, marks it and focuses it', s2);
    await fr.dblclick('#poses .pose-btn[data-id="hiphop"]');
    t.check(await fr.evaluate(() => document.getElementById('library').hidden), 'a double tap on a pose picks it once and closes the sheet');
    await fr.evaluate(() => window.PoseAndLight.pick(null));          // the second tap landed on the stage behind the sheet
    await fr.evaluate(() => document.getElementById('posesBtn').click());
    await page.keyboard.press('Escape');
    t.check(await fr.evaluate(() => document.getElementById('library').hidden && document.activeElement.id === 'posesBtn'), 'Escape closes the library and gives focus back to Poses');
    await clean(t, page, 'standalone: library');
    lap('library');

    // ---- the rig controls, far past the figure, Advanced ------------------------------------------------
    await fr.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    t.check(await fr.evaluate(() => !document.documentElement.classList.contains('simple') && localStorage.getItem('pose-and-light.mode') === 'advanced' && document.querySelector('[data-mode="advanced"]').getAttribute('aria-pressed') === 'true'), 'the page\'s own switch goes to Advanced and remembers it');
    await pick(fr, 'stand');
    const moves = [['handR', [[1, 0], [1.4, -0.4]]], ['elbowR', [[0, 1], [-0.3, 1.3]]], ['footL', [[1, 0], [1.3, -0.3]]], ['kneeR', [[0, 0.5], [-0.4, 0.5]]], ['torso', [[0, 0], [-0.3, -0.3]]]];
    for (const [id, through] of moves) {
      const c = await ctrl(fr, id);
      t.check(c && c.center, `${id}: the control is on the stage`, c && c.center);
      if (!c || !c.center) continue;
      const before = await poseJson(fr);
      await drag(page, fr, id === 'torso' ? c.pts[12] : c.center, through);
      const s = await scan(fr);
      t.check(sane(s) && before !== await poseJson(fr) && !(await fr.evaluate(() => document.getElementById('undo').disabled)), `${id} dragged far past the figure: the pose changed and stays sane`, s);
    }
    // the hips ring with the feet planted: the balls of the feet stay put
    {
      await pick(fr, 'crouch');
      const c = await ctrl(fr, 'pelvis');
      const b0 = await balls(fr), before = await poseJson(fr);
      await drag(page, fr, c.pts[0], [[1, 1], [1.4, 1.4]]);
      const b1 = await balls(fr), s = await scan(fr);
      t.check(sane(s) && dist3(b0.R, b1.R) < 0.03 && dist3(b0.L, b1.L) < 0.03 && before !== await poseJson(fr), 'the hips ring dragged far, feet planted: the hips move, both feet stay where they stood', { s, moved: [dist3(b0.R, b1.R), dist3(b0.L, b1.L)] });
      t.check((await fr.evaluate(() => document.getElementById('rigSum').textContent)) === 'feet planted', 'Rig controls says feet planted');
      await fr.evaluate(() => document.getElementById('plantFeet').click());
      t.check((await fr.evaluate(() => document.getElementById('rigSum').textContent)) === 'feet free', 'Keep the feet planted off: Rig controls says feet free');
      const c2 = await ctrl(fr, 'pelvis');
      const b2 = await balls(fr);
      await drag(page, fr, c2.pts[0], [[0, 0], [-0.4, -0.4]]);
      const b3 = await balls(fr), s3 = await scan(fr);
      t.check(sane(s3, 1) && (dist3(b2.R, b3.R) > 0.05 || dist3(b2.L, b3.L) > 0.05), 'feet free: the hips ring carries the feet along, above the floor', { s3, moved: [dist3(b2.R, b3.R), dist3(b2.L, b3.L)] });
    }
    // the whole figure picked: the height arrows, Put the feet on the floor, Straighten
    await pick(fr, 'stand');
    await fr.evaluate(() => { window.PoseAndLight.pick('root'); window.PoseAndLight.render(); });
    const rootArrows = await fr.evaluate(() => window.PoseAndLight.arrows().map((a) => a.label));
    t.check(rootArrows.length === 8 && rootArrows.includes('Raise the body') && rootArrows.includes('Lower the body') && await fr.evaluate(() => document.getElementById('mirror').hidden && document.getElementById('partName').textContent === 'Hips (the whole body)'), 'the whole figure picked: eight arrows, no Copy to the other side', rootArrows);
    for (let i = 0; i < 6; i++) await fr.evaluate(() => { const b = [...document.querySelectorAll('#arrows button')].find((x) => x.getAttribute('aria-label') === 'Raise the body'); b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    const lifted = await scan(fr);
    t.check(lifted.height > 0.09 && lifted.low > 0.09, 'Raise the body six times by keyboard, feet free: the figure is lifted off the floor', lifted);
    await fr.evaluate(() => document.getElementById('ground').click());
    const grounded = await scan(fr);
    t.check(Math.abs(grounded.low - 0.002) < 1e-3, 'Put the feet on the floor brings it down to the floor', grounded);
    await fr.evaluate(() => document.getElementById('ground').click());
    t.check(Math.abs((await scan(fr)).low - 0.002) < 1e-3, 'Put the feet on the floor again changes nothing');
    await fr.evaluate(() => { window.PoseAndLight.pose.root.x = 20; window.PoseAndLight.pose.height = 0.05; window.PoseAndLight.applyPose(); document.getElementById('straighten').click(); });
    const straight = await fr.evaluate(() => ({ r: window.PoseAndLight.pose.root, h: window.PoseAndLight.pose.height, low: window.PoseAndLight.lowestPoint() }));
    t.check(straight.r.x === 0 && straight.r.y === 0 && straight.r.z === 0 && Math.abs(straight.h) < 1e-6 && Math.abs(straight.low - 0.002) < 1e-3, 'Straighten on the whole figure: upright, at its height, on the floor', straight);
    await fr.evaluate(() => document.getElementById('plantFeet').click());
    // a part picked: the arrows by tap, by holding, by keyboard, to the limit
    await fr.evaluate(() => { window.PoseAndLight.pick('shoulderR'); window.PoseAndLight.render(); });
    const part = await fr.evaluate(() => ({ name: document.getElementById('partName').textContent, label: document.getElementById('picked').textContent, how: document.getElementById('partHow').hidden, buttons: document.getElementById('partButtons').hidden, mirror: document.getElementById('mirror').hidden, outline: window.PoseAndLight.outlines(), arrows: window.PoseAndLight.arrows().map((a) => a.label + (a.disabled ? '!' : '')), svg: document.querySelectorAll('#arrows button svg').length }));
    t.check(part.name === 'Right upper arm' && part.label === 'Right upper arm' && !part.how && !part.buttons && !part.mirror && part.outline >= 1 && part.arrows.length === 6 && part.svg === 6, 'the right upper arm picked: named, outlined, six arrows with icons, Straighten and Copy shown', part);
    const first = await fr.locator('#arrows button').first().boundingBox();
    const a0 = await fr.evaluate(() => window.PoseAndLight.pose.shoulderR.x);
    await page.mouse.click(first.x + 20, first.y + 20);
    const a1 = await fr.evaluate(() => window.PoseAndLight.pose.shoulderR.x);
    t.check(Math.abs(Math.abs(a1 - a0) - 6) < 1e-6, 'a tap on an arrow moves the part six degrees', [a0, a1]);
    const held = await fr.locator('#arrows button').first().boundingBox();          // the arrows follow the part's end
    await page.mouse.move(held.x + 20, held.y + 20); await page.mouse.down(); await sleep(1200); await page.mouse.up();
    const a2 = await fr.evaluate(() => window.PoseAndLight.pose.shoulderR.x);
    t.check(Math.abs(a2 - a1) > 7, 'an arrow held keeps the part moving past the six degrees of a tap', [a1, a2]);   // (how far depends on how fast the stage draws here)
    await fr.evaluate(() => document.querySelector('#arrows button').focus());
    await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    const a3 = await fr.evaluate(() => window.PoseAndLight.pose.shoulderR.x);
    t.check(Math.abs(Math.abs(a3 - a2) - 12) < 1e-6 && await fr.evaluate(() => document.activeElement.className === 'arrow'), 'Enter and Space on a focused arrow each move it six degrees, focus kept', [a2, a3]);
    await fr.waitForFunction((x) => (localStorage.getItem('pose-and-light.v2') || '').includes(`"x":${x}`), a3, { timeout: 3000 }).catch(() => null);
    t.check(await fr.evaluate((x) => (localStorage.getItem('pose-and-light.v2') || '').includes(`"x":${x}`), a3), 'a keyboard move is saved once the key rests', await fr.evaluate(() => (localStorage.getItem('pose-and-light.v2') || '').slice(0, 80)));
    await fr.evaluate(() => { window.PoseAndLight.pose.shoulderR.x = -170; window.PoseAndLight.applyPose(); window.PoseAndLight.render(); });   // near the limit, so a few taps reach it
    let taps = 0;
    while (taps < 6 && !(await fr.evaluate(() => { window.PoseAndLight.render(); return document.querySelector('#arrows button').disabled; }))) { const bb = await fr.locator('#arrows button').first().boundingBox(); await page.mouse.click(bb.x + 20, bb.y + 20); taps++; }   // (an arrow is marked at its limit when the stage is next drawn)
    const lim = await fr.evaluate(() => ({ x: window.PoseAndLight.pose.shoulderR.x, dis: document.querySelector('#arrows button').disabled, other: window.PoseAndLight.arrows()[1].disabled }));
    t.check(lim.x === -180 && lim.dis && !lim.other && taps === 2, 'tapped to the limit: the angle stops at it and that arrow is disabled, its opposite not', { ...lim, taps });
    await page.keyboard.press('Enter');
    t.check((await fr.evaluate(() => window.PoseAndLight.pose.shoulderR.x)) === -180, 'Enter on the disabled arrow does nothing');
    // Copy to the other side, Straighten
    await fr.evaluate(() => { window.PoseAndLight.pick('wristL'); const p = window.PoseAndLight.pose; p.wristL = { x: 20, y: 30, z: -40 }; window.PoseAndLight.applyPose(); document.getElementById('mirror').click(); });
    const mir = await fr.evaluate(() => ({ L: window.PoseAndLight.pose.wristL, R: window.PoseAndLight.pose.wristR }));
    t.check(mir.R.x === 20 && mir.R.y === -30 && mir.R.z === 40 && mir.L.x === 20, 'Copy to the other side mirrors the hand onto the other', mir);
    await fr.evaluate(() => document.getElementById('straighten').click());
    const str = await fr.evaluate(() => window.PoseAndLight.pose.wristL);
    t.check(str.x === 0 && str.y === 0 && str.z === 0, 'Straighten zeroes the picked part', str);
    await tapBackground(page, fr);
    const let_go = await fr.evaluate(() => ({ picked: window.PoseAndLight.picked(), name: document.getElementById('partName').textContent, arrows: document.querySelectorAll('#arrows button').length, empty: document.getElementById('partEmpty').hidden, outline: window.PoseAndLight.outlines() }));
    t.check(let_go.picked === null && let_go.name === 'Nothing picked' && let_go.arrows === 0 && !let_go.empty && let_go.outline === 0, 'a tap on the background lets the part go', let_go);
    await clean(t, page, 'standalone: rig and arrows');
    lap('rig and arrows');

    // ---- Simple: fewer controls, the diamond of the arm last touched, no arrows ------------------------
    await fr.evaluate(() => document.querySelector('[data-mode="simple"]').click());
    const simpleCtrls = await fr.evaluate(() => { window.PoseAndLight.render(); return window.PoseAndLight.ctrls().filter((c) => c.center).map((c) => c.id).sort().join(' '); });
    t.check(simpleCtrls === 'footL footR handL handR pelvis', 'Simple shows the hand, foot and hip controls only', simpleCtrls);
    {
      const c = await ctrl(fr, 'handL');
      await drag(page, fr, c.center, [[0.6, 0.2]], 10);
      t.check((await ctrl(fr, 'elbowL')).center != null, 'Simple: the elbow diamond appears once that arm is touched');
      await tapBackground(page, fr);
      t.check((await ctrl(fr, 'elbowL')).center == null, 'Simple: the diamond goes when the background is tapped');
      const h = await ctrl(fr, 'handR');
      const b = await fr.locator('#view').boundingBox();
      await page.mouse.click(b.x + h.center.x, b.y + h.center.y);
      const sp = await fr.evaluate(() => ({ picked: window.PoseAndLight.picked(), arrows: document.querySelectorAll('#arrows button').length, how: [...document.querySelectorAll('#partHow span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent.slice(0, 20)), rig: getComputedStyle(document.getElementById('rigMore')).display, light: getComputedStyle(document.getElementById('lightMore')).display, show: getComputedStyle(document.getElementById('showMore')).display }));
      t.check(sp.picked === 'wristR' && sp.arrows === 0 && sp.how.length === 1 && /Drag it to move it/.test(sp.how[0]) && sp.rig === 'none' && sp.light === 'none' && sp.show === 'none', 'Simple: a tap on a control picks its part, with no arrows and the menus hidden', sp);
    }
    await fr.evaluate(() => { document.querySelector('[data-mode="advanced"]').click(); document.getElementById('showStand').click(); document.getElementById('showLamp').click(); document.getElementById('plantFeet').click(); document.querySelector('[data-mode="simple"]').click(); });
    t.check(await fr.evaluate(() => document.getElementById('showStand').checked && document.getElementById('showLamp').checked && document.getElementById('plantFeet').checked && !document.getElementById('lampHandle').hidden && window.PoseAndLight.stand.visible), 'back to Simple: the stand, the lamp and planted feet go back to their defaults');
    await fr.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    await clean(t, page, 'standalone: simple');

    // ---- the lamp: presets, sliders at both ends, keyboard, drags to every edge -------------------------
    const presets = [['front', 'Front', '0° around, 12° up'], ['rembrandt', 'Rembrandt', '45° around, 30° up'], ['side', 'Side', '90° around, 8° up'], ['rim', 'Rim', '160° around, 30° up'], ['top', 'Top', '0° around, 82° up'], ['under', 'From below', '10° around, -14° up']];
    const presetBad = [];
    for (const [id, name, sum] of presets) {
      await fr.evaluate((id) => document.querySelector(`#lights .btn[data-id="${id}"]`).click(), id);
      const r = await fr.evaluate(() => ({ name: document.getElementById('lightName').textContent, lesson: document.getElementById('lightLesson').textContent.length, bold: document.querySelectorAll('#lightLesson b').length, sum: document.getElementById('lightSum').textContent, pressed: [...document.querySelectorAll('#lights .btn[aria-pressed="true"]')].map((b) => b.dataset.id).join(), az: document.getElementById('lAz').value, el: document.getElementById('lEl').value }));
      if (r.name !== name || r.lesson < 40 || r.bold < 1 || r.sum !== sum || r.pressed !== id || `${r.az}° around, ${r.el}° up` !== sum) presetBad.push({ id, ...r });
    }
    t.check(presetBad.length === 0, 'every light preset: named, pressed, a lesson with a bold run, the sliders and the summary agreeing', presetBad);
    const ends = [];
    for (const [id, lo, hi] of [['lAz', -180, 180], ['lEl', -20, 85], ['lDist', 1.6, 4.6], ['lSoft', 0, 10], ['lFill', 0, 100]]) {
      for (const v of [lo, hi]) {
        const r = await setRange(fr, id, v);
        const s = await scan(fr);
        const l = await fr.evaluate(() => ({ ...window.PoseAndLight.light, name: document.getElementById('lightName').textContent, lampY: window.PoseAndLight.lamp.position.y }));
        ends.push({ id, v, ...r, az: l.az, el: l.el, dist: l.dist, soft: l.soft, fill: l.fill, lampY: +l.lampY.toFixed(2), name: l.name, bad: s.bad });
      }
    }
    t.check(ends.every((e) => e.bad.length === 0 && e.lampY > 0.29 && e.out.length > 0), 'every light slider at both ends: the lamp stays above the floor, a readout for each', ends);
    t.check(ends.every((e) => e.id !== 'lEl' || e.v !== -20 || (e.value === e.out.replace('°', '') && +e.value === e.el)), 'Height at its low end: the slider is pulled to the height the lamp can reach and the readout says the same', ends.filter((e) => e.id === 'lEl'));
    const az180 = ends.find((e) => e.id === 'lAz' && e.v === 180);
    const azAgrees = az180 && az180.out === `${az180.value}°`;
    t.check(azAgrees, 'Around the figure at its right end: the slider and its readout agree', az180);
    if (!azAgrees) t.finding({ title: 'Around the figure slider at 180° reads "-180°"', severity: 'low', steps: 'pose.html, Advanced, open Light settings, drag "Around the figure" to its right end (180°)', expected: 'The readout says 180°, the value the slider shows (or the slider is set to the -180° it reads, as Height is pulled to the height the lamp can reach)', actual: `The slider sits at ${az180 && az180.value} while the readout says ${az180 && az180.out}: js/pose.js:1027 wraps the azimuth to -180 and js/pose.js:1031 leaves the slider at the value it came from` });
    // slider spam: two hundred moves in a burst, then the readout and the lamp match the last one
    await fr.evaluate(() => { const el = document.getElementById('lAz'); for (let i = 0; i < 200; i++) { el.value = (i * 37) % 360 - 180; el.dispatchEvent(new Event('input')); } el.dispatchEvent(new Event('change')); });
    const spam = await fr.evaluate(() => ({ v: +document.getElementById('lAz').value, az: window.PoseAndLight.light.az, out: document.getElementById('lAzOut').textContent }));
    t.check(spam.v === spam.az && spam.out === `${spam.az}°` && (await scan(fr)).bad.length === 0, 'two hundred slider moves in a burst: the readout and the lamp follow the last', spam);
    // keyboard: Shift+Tab from Poses lands on the lamp's handle, the arrow keys move the light, held to its ends
    await fr.evaluate(() => document.querySelector('#lights .btn[data-id="rembrandt"]').click());
    await fr.evaluate(() => document.getElementById('posesBtn').focus());
    await page.keyboard.press('Shift+Tab');
    t.check(await fr.evaluate(() => document.activeElement.id === 'lampHandle'), 'Shift+Tab from Poses reaches the lamp handle', await fr.evaluate(() => document.activeElement.id));
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
    const kl = await fr.evaluate(() => ({ az: window.PoseAndLight.light.az, el: window.PoseAndLight.light.el, name: document.getElementById('lightName').textContent }));
    t.check(kl.az === 55 && kl.el === 20 && kl.name === 'Your own', 'the arrow keys move the light five degrees, fifteen with Shift, and the light is Your own', kl);
    for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowUp');          // 20 + 8 × 15 asks for 140: it stops at 85
    const top = await scan(fr);
    for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowDown');       // asks for -65: it stops at the floor
    const low = await scan(fr);
    for (let i = 0; i < 14; i++) await page.keyboard.press('Shift+ArrowLeft');       // 55 - 210: round the back
    const round = await scan(fr);
    t.check(top.el === 85 && low.el >= -20 && low.el < 0 && round.az >= -180 && round.az <= 180 && round.bad.length === 0, 'held to its ends by keyboard: the light stops at the top, at the floor, and wraps around', { top, low, round });
    await fr.waitForFunction(() => (localStorage.getItem('pose-and-light.v2') || '').includes('"light"'), null, { timeout: 2000 }).catch(() => null);
    // drags to every corner and edge, far beyond the stage
    const lampBad = [];
    for (const [fx, fy] of [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5], [0, 0], [1, 1]]) {
      const hb = await fr.locator('#lampHandle').boundingBox();
      if (!hb) { lampBad.push({ fx, fy, handle: 'not on the stage' }); continue; }
      const b = await fr.locator('#view').boundingBox();
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + fx * b.width, b.y + fy * b.height, { steps: 10 });
      await page.mouse.move(b.x + (fx - 0.5) * 3 * b.width, b.y + (fy - 0.5) * 3 * b.height, { steps: 4 });
      await page.mouse.up();
      const s = await scan(fr);
      const h = await fr.evaluate(() => { const h = document.getElementById('lampHandle'), bar = document.querySelector('.stage-bar'), v = document.getElementById('view'); return { x: +h.dataset.x, y: +h.dataset.y, w: v.clientWidth, h: v.clientHeight, barL: bar.offsetLeft, barT: bar.offsetTop, name: document.getElementById('lightName').textContent }; });
      const onStage = h.x >= 26 && h.x <= h.w - 26 && h.y >= 26 && h.y <= h.h - 26 && !(h.x > h.barL - 26 && h.y > h.barT - 27);
      if (s.bad.length || s.el < -20 || s.el > 85 || s.az < -180 || s.az > 180 || !onStage) lampBad.push({ fx, fy, s, h });
    }
    t.check(lampBad.length === 0, 'the lamp dragged to every edge, two corners and far beyond: sane angles, the handle on the stage and clear of the buttons', lampBad);
    await fr.evaluate(() => document.querySelector('#lights .btn[data-id="rembrandt"]').click());
    // Show or hide
    const shown = await fr.evaluate(() => { const r = {}; document.getElementById('showStand').click(); r.a = document.getElementById('showSum').textContent; r.standOff = !window.PoseAndLight.stand.visible; document.getElementById('showLamp').click(); r.b = document.getElementById('showSum').textContent; r.handleHidden = document.getElementById('lampHandle').hidden; document.getElementById('showStand').click(); r.c = document.getElementById('showSum').textContent; document.getElementById('showLamp').click(); r.d = document.getElementById('showSum').textContent; r.handleBack = !document.getElementById('lampHandle').hidden; document.getElementById('showRig').click(); window.PoseAndLight.render(); r.rig = document.getElementById('rigSum').textContent; r.rigGone = getComputedStyle(document.getElementById('rig')).display === 'none'; document.getElementById('showRig').click(); window.PoseAndLight.render(); r.rigBack = document.getElementById('rigSum').textContent + (getComputedStyle(document.getElementById('rig')).display === 'none' ? ' (still gone)' : ''); return r; });
    t.check(shown.a === 'stand hidden' && shown.standOff && shown.b === 'stand and lamp hidden' && shown.handleHidden && shown.c === 'lamp hidden' && shown.d === 'all shown' && shown.handleBack && shown.rig === 'hidden' && shown.rigGone && shown.rigBack === 'feet planted', 'Show or hide: each switch does what it says and the menus say what is set', shown);
    await clean(t, page, 'standalone: lamp');
    lap('simple and lamp');

    // ---- See it as, Snapshot, Undo past sixty, Front view, Start over ----------------------------------
    await fr.evaluate(() => window.PoseAndLight.pick(null));          // a picked part's outline stays yellow in Gray, as designed
    const pixels = () => fr.evaluate(() => { window.PoseAndLight.render(); const v = document.getElementById('view'); const c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const g = c.getContext('2d'); g.drawImage(v, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, colored = 0; const bins = new Set(); for (let i = 0; i < d.length; i += 64) { n++; if (Math.abs(d[i] - d[i + 1]) > 6 || Math.abs(d[i + 1] - d[i + 2]) > 6) colored++; bins.add(Math.round(d[i] / 16)); } return { n, colored, bins: bins.size }; });
    const col = await pixels();
    await fr.evaluate(() => document.getElementById('lookGray').click());
    const gray = await pixels();
    const grayUi = await fr.evaluate(() => ({ split: document.getElementById('splitFields').hidden, checked: document.querySelector('input[name="look"]:checked').id }));
    await fr.evaluate(() => document.getElementById('lookValues').click());
    const vals = await pixels();
    const valsUi = await fr.evaluate(() => ({ split: document.getElementById('splitFields').hidden, sum: document.getElementById('splitSum').textContent, o1: document.getElementById('t1Out').textContent, o2: document.getElementById('t2Out').textContent }));
    t.check(col.colored > col.n * 0.01 && gray.colored === 0 && grayUi.split && grayUi.checked === 'lookGray' && vals.colored === 0 && vals.bins <= 3 && !valsUi.split && valsUi.sum === 'V 3.0 / 5.8' && valsUi.o1 === 'V 3.0' && valsUi.o2 === 'V 5.8', 'See it as: Color is colored, Gray is gray, Dark middle light has three values and shows its splits', { col, gray, grayUi, vals, valsUi });
    const splits = [];
    for (const [id, v] of [['t1', 60], ['t2', 30], ['t1', 5], ['t2', 95], ['t2', 30], ['t1', 60]]) {
      await setRange(fr, id, v, false);
      const r = await fr.evaluate(() => ({ t1: +document.getElementById('t1').value, t2: +document.getElementById('t2').value, o1: document.getElementById('t1Out').textContent, o2: document.getElementById('t2Out').textContent, sum: document.getElementById('splitSum').textContent }));
      const px = await pixels();
      splits.push({ id, v, ...r, bins: px.bins, colored: px.colored });
    }
    t.check(splits.every((s) => s.t2 >= s.t1 + 5 && s.o1 === `V ${(s.t1 / 10).toFixed(1)}` && s.o2 === `V ${(s.t2 / 10).toFixed(1)}` && s.sum === `V ${(s.t1 / 10).toFixed(1)} / ${(s.t2 / 10).toFixed(1)}` && s.bins <= 3 && s.colored === 0), 'the splits at their ends and crossed: the other one moves to keep five apart, the readouts follow, the picture keeps at most three values', splits);
    await fr.evaluate(() => document.getElementById('lookColor').click());
    t.check((await pixels()).colored > 0 && await fr.evaluate(() => document.getElementById('splitFields').hidden), 'back to Color: colored, the splits folded away');
    // Snapshot: the dialog and its picture, twice, closed by its button and by Escape
    await fr.evaluate(() => document.getElementById('snap').click());
    await fr.waitForFunction(() => document.getElementById('snapImg').src.startsWith('blob:') && document.getElementById('snapImg').naturalWidth > 0, null, { timeout: 8000 }).catch(() => null);
    const snap = await fr.evaluate(() => ({ open: document.getElementById('snapDialog').open, src: document.getElementById('snapImg').src.slice(0, 5), w: document.getElementById('snapImg').naturalWidth, h: document.getElementById('snapImg').naturalHeight, cw: document.getElementById('view').width, ch: document.getElementById('view').height, text: document.querySelector('#snapDialog p').textContent }));
    t.check(snap.open && snap.src === 'blob:' && snap.w === snap.cw && snap.h === snap.ch && /save it/.test(snap.text), 'Snapshot opens a dialog with a picture the size of the stage and says how to save it', snap);
    await fr.evaluate(() => document.getElementById('snapClose').click());
    t.check(await fr.evaluate(() => !document.getElementById('snapDialog').open), 'Close closes the snapshot');
    await fr.evaluate(() => document.getElementById('snap').click());
    await fr.waitForFunction(() => document.getElementById('snapImg').naturalWidth > 0, null, { timeout: 8000 }).catch(() => null);
    t.check(await fr.evaluate(() => document.getElementById('snapDialog').open), 'a second Snapshot opens again');
    await page.keyboard.press('Escape');
    t.check(await fr.evaluate(() => !document.getElementById('snapDialog').open), 'Escape closes the snapshot');
    // Undo past sixty steps
    const seq = await fr.evaluate((ids) => { const seq = []; for (let i = 0; i < 66; i++) { document.querySelector(`#lights .btn[data-id="${ids[i % 6]}"]`).click(); seq.push(window.PoseAndLight.light.az + '/' + window.PoseAndLight.light.el); } return seq; }, presets.map((p) => p[0]));
    await fr.dblclick('#undo');
    t.check((await fr.evaluate(() => window.PoseAndLight.light.az + '/' + window.PoseAndLight.light.el)) === seq[63], 'a double tap on Undo undoes two steps', seq.slice(62));
    const undos = 2 + await fr.evaluate(() => { let n = 0; while (n < 100 && !document.getElementById('undo').disabled) { document.getElementById('undo').click(); n++; } return n; });
    const after = await fr.evaluate(() => window.PoseAndLight.light.az + '/' + window.PoseAndLight.light.el);
    t.check(undos === 60 && after === seq[5], 'Undo after 66 changes: sixty steps back, then disabled, the light as after the sixth change', { undos, after, want: seq[5] });
    await fr.evaluate(() => document.getElementById('undo').click());
    t.check((await fr.evaluate(() => window.PoseAndLight.light.az + '/' + window.PoseAndLight.light.el)) === seq[5], 'a tap on the disabled Undo changes nothing');
    // Front view, Start over, Undo after it
    await pick(fr, 'walk');
    await fr.evaluate(() => { const v = window.PoseAndLight.view; v.az = 120; v.el = 40; window.PoseAndLight.placeCamera(); document.getElementById('resetView').click(); });
    const view = await fr.evaluate(() => ({ ...window.PoseAndLight.view }));
    t.check(view.az === 0 && view.el === 8, 'Front view turns the camera to the front', view);
    await fr.evaluate(() => document.getElementById('resetAll').click());
    const over = await fr.evaluate(() => ({ title: document.getElementById('libTitle').textContent, start: document.getElementById('library').classList.contains('is-start'), cont: document.getElementById('continueWrap').hidden, close: getComputedStyle(document.getElementById('libClose')).display, hipR: window.PoseAndLight.pose.hipR.x, az: window.PoseAndLight.light.az, el: window.PoseAndLight.light.el, view: window.PoseAndLight.view.az, picked: window.PoseAndLight.picked(), inert: document.querySelector('.rail').hasAttribute('inert') }));
    t.check(over.title === 'Choose a pose to start' && over.start && over.cont && over.close === 'none' && over.hipR === 0 && over.az === 45 && over.el === 30 && over.view === 32 && over.picked === null && over.inert, 'Start over: the figure stands, the light is Rembrandt, the view as at first, and the start screen is back', over);
    await page.keyboard.press('Escape');
    t.check(await fr.evaluate(() => !document.getElementById('library').hidden), 'the start screen after Start over does not close on Escape');
    await pick(fr, 'run');
    await fr.evaluate(() => document.getElementById('undo').click());
    t.check((await fr.evaluate(() => window.PoseAndLight.pose.hipR.x)) === 0, 'Undo after Start over goes back to the standing figure');
    await fr.evaluate(() => document.getElementById('undo').click());
    t.check((await fr.evaluate(() => window.PoseAndLight.pose.hipR.x)) === -26, 'Undo again goes back to the pose before Start over (Walk)');
    await clean(t, page, 'standalone: see it as, snapshot, undo, start over');
    lap('see it as, snapshot, undo, start over');

    // ---- Save this pose thirteen times, remove and Put back, a full storage ---------------------------
    const msgs = [];
    for (let i = 0; i < 13; i++) { await fr.click('#savePose'); msgs.push(await fr.evaluate(() => document.getElementById('savePose').textContent)); await sleep(30); }
    t.check(msgs.slice(0, 12).every((m) => m === 'Saved in the pose library') && msgs[12] === 'Saved in the pose library; the oldest of your twelve made room', 'Save this pose thirteen times: twelve say saved, the thirteenth says the oldest made room', msgs);
    await fr.waitForFunction(() => document.querySelectorAll('#mine .pose-btn.has-img').length >= 12, null, { timeout: 30000 }).catch(() => null);
    const mine = await fr.evaluate(() => ({ n: document.querySelectorAll('#mine .pose-btn').length, imgs: document.querySelectorAll('#mine .pose-btn.has-img').length, ids: new Set([...document.querySelectorAll('#mine .pose-btn')].map((b) => b.dataset.id)).size, stored: JSON.parse(localStorage.getItem('pose-and-light.mine.v1')).length, names: [...document.querySelectorAll('#mine .pose-btn')].map((b) => b.getAttribute('aria-label')), wrap: document.getElementById('mineWrap').hidden, x: document.querySelectorAll('#mine .pose-x').length }));
    t.check(mine.n === 12 && mine.imgs === 12 && mine.ids === 12 && mine.stored === 12 && mine.names[0] === 'Your pose 1' && mine.names[11] === 'Your pose 12' && !mine.wrap && mine.x === 12, 'twelve of your poses, each with a picture, a distinct id and a Remove button, twelve in storage', mine);
    await fr.evaluate(() => document.getElementById('posesBtn').click());
    const saidSaved = await fr.evaluate(() => ({ note: document.getElementById('libNote').textContent, pressed: [...document.querySelectorAll('.pose-btn[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label')).join() }));
    t.check(saidSaved.note === 'On the figure now: Your pose 12' && saidSaved.pressed === 'Your pose 12', 'the library says the figure holds your pose 12 and marks it', saidSaved);
    await fr.evaluate(() => document.querySelectorAll('#mine .pose-x')[2].click());
    const removed = await fr.evaluate(() => ({ n: document.querySelectorAll('#mine .pose-btn').length, back: document.getElementById('mineBack').hidden, focus: document.activeElement.getAttribute('aria-label'), stored: JSON.parse(localStorage.getItem('pose-and-light.mine.v1')).length }));
    t.check(removed.n === 11 && !removed.back && removed.focus === 'Remove your pose 3' && removed.stored === 11, 'Remove: eleven left, Put back offered, focus on the next Remove', removed);
    await fr.evaluate(() => document.getElementById('mineBack').click());
    const back = await fr.evaluate(() => ({ n: document.querySelectorAll('#mine .pose-btn').length, back: document.getElementById('mineBack').hidden, stored: JSON.parse(localStorage.getItem('pose-and-light.mine.v1')).length, third: document.querySelectorAll('#mine .pose-btn')[2].dataset.id === JSON.parse(localStorage.getItem('pose-and-light.mine.v1'))[2].id }));
    t.check(back.n === 12 && back.back && back.stored === 12 && back.third, 'Put back: twelve again, in its old place, Put back gone', back);
    for (let i = 0; i < 12; i++) await fr.evaluate(() => { const x = document.querySelector('#mine .pose-x'); if (x) x.click(); });
    const none = await fr.evaluate(() => ({ n: document.querySelectorAll('#mine .pose-btn').length, back: document.getElementById('mineBack').hidden, wrap: document.getElementById('mineWrap').hidden, focus: document.activeElement.id, stored: localStorage.getItem('pose-and-light.mine.v1') }));
    t.check(none.n === 0 && !none.back && !none.wrap && none.focus === 'mineBack' && none.stored === '[]', 'all twelve removed: the group stays with Put back, focused, storage empty', none);
    await fr.evaluate(() => { document.getElementById('mineBack').click(); document.getElementById('libClose').click(); });
    t.check(await fr.evaluate(() => document.querySelectorAll('#mine .pose-btn').length === 1 && document.getElementById('library').hidden), 'the last one put back');
    // the storage full: the button says so; the library's note should say so too, and the removal
    const filled = await fr.evaluate(() => { let n = 0; for (const size of [1 << 20, 1 << 16, 1 << 12, 1 << 8, 16, 1]) for (let i = 0; i < 4000; i++) { try { localStorage.setItem(`junk${size}_${i}`, 'x'.repeat(size)); n++; } catch (e) { break; } } return n; });
    await fr.click('#savePose');
    const full = await fr.evaluate(() => ({ btn: document.getElementById('savePose').textContent, note: document.getElementById('libNote').textContent, n: document.querySelectorAll('#mine .pose-btn').length, stored: JSON.parse(localStorage.getItem('pose-and-light.mine.v1')).length }));
    t.check(full.n === 2 && full.stored === 1 && /storage is full/.test(full.btn), 'storage full: Save this pose keeps the pose for the visit and the button says storage is full', { filled, ...full });
    const noteSaysFull = STORAGE_NOTE.test(full.note);
    t.check(noteSaysFull, 'storage full: the library note says the pose could not be stored', full.note);
    await fr.waitForFunction(() => document.getElementById('savePose').textContent === 'Save this pose', null, { timeout: 8000 }).catch(() => null);   // the button's own message passes
    await fr.evaluate(() => { document.getElementById('posesBtn').click(); document.querySelector('#mine .pose-x').click(); });
    const fullRemove = await fr.evaluate(() => ({ note: document.getElementById('libNote').textContent, n: document.querySelectorAll('#mine .pose-btn').length, stored: JSON.parse(localStorage.getItem('pose-and-light.mine.v1')).length, storedIds: JSON.parse(localStorage.getItem('pose-and-light.mine.v1')).map((q) => q.id), shownIds: [...document.querySelectorAll('#mine .pose-btn')].map((b) => b.dataset.id), btn: document.getElementById('savePose').textContent }));
    // removing the stored pose frees its room, so the smaller list may now be written: then the note rightly
    // shows the figure; a write that still fails keeps the storage-full note
    const written = fullRemove.storedIds.join() === fullRemove.shownIds.join();
    const removeSaysFull = written || STORAGE_NOTE.test(fullRemove.note) || STORAGE_NOTE.test(fullRemove.btn);
    t.check(removeSaysFull, 'storage full: removing a pose either goes through (storage matches the list) or says it could not be written back', fullRemove);
    if (!noteSaysFull || !removeSaysFull) t.finding({ title: 'The "storage is full" library note is overwritten at once, and a removal that could not be stored says nothing', severity: 'medium', steps: 'pose.html with localStorage full (fill it with other keys until setItem throws), pick a pose, press Save this pose; then open Poses and press × on a saved pose', expected: 'The library note reads "Your poses could not be saved: browser storage is full. Remove a saved pose and try again." (js/pose.js:1290), after the save and after the removal, so the visitor knows the removal will not hold either', actual: `After Save the note reads "${full.note}" (the button alone says storage is full, for six seconds); after the removal the note reads "${fullRemove.note}" and the button "${fullRemove.btn}", while storage still holds ${fullRemove.stored} pose(s) and the page shows ${fullRemove.n}: keepMine() writes the note (js/pose.js:1290) and markLibrary() (js/pose.js:1254) overwrites it in the same click (savePose: choose() at js/pose.js:1340; the × button at js/pose.js:1310)` });
    await fr.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('junk')).forEach((k) => localStorage.removeItem(k)); document.getElementById('libClose').click(); });
    await clean(t, page, 'standalone: saved poses');
    lap('saved poses');

    // ---- a reload: Where you left off first, the mode remembered; a reload in the middle of a drag -----
    await pick(fr, 'walk');
    {
      const c = await ctrl(fr, 'handR');
      const b = await fr.locator('#view').boundingBox();
      await page.mouse.move(b.x + c.center.x, b.y + c.center.y); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.1, { steps: 5 });
    }
    await page.reload({ waitUntil: 'load' });
    await page.mouse.up();
    const fr2 = page.mainFrame();
    await up(fr2);
    await fr2.waitForFunction(() => document.querySelectorAll('#continue .pose-btn.has-img').length === 1, null, { timeout: 15000 }).catch(() => null);
    const again = await fr2.evaluate(() => ({ simple: document.documentElement.classList.contains('simple'), pressed: document.querySelector('[data-mode][aria-pressed="true"]').dataset.mode, cont: document.getElementById('continueWrap').hidden, contImg: document.querySelectorAll('#continue .pose-btn.has-img').length, first: document.querySelector('.sheet-body .lib-group:not([hidden]) h3').textContent, title: document.getElementById('libTitle').textContent, focus: document.activeElement.getAttribute('aria-label'), hipR: window.PoseAndLight.pose.hipR.x, mine: document.querySelectorAll('#mine .pose-btn').length, undo: document.getElementById('undo').disabled, light: window.PoseAndLight.light.az }));
    t.check(!again.simple && again.pressed === 'advanced', 'after a reload the page is Advanced, as remembered', again);
    t.check(!again.cont && again.contImg === 1 && again.first === 'Where you left off' && again.title === 'Choose a pose to start' && again.focus === 'Where you left off' && again.hipR === -26 && again.mine === 1 && again.undo, 'after a reload mid-drag: Where you left off first, with a picture and focus, the pose saved before the drag, your pose kept', again);
    await fr2.evaluate(() => document.querySelector('#continue .pose-btn').click());
    t.check(await fr2.evaluate(() => document.getElementById('library').hidden && window.PoseAndLight.pose.hipR.x === -26 && !document.getElementById('hint').hidden), 'Where you left off keeps the pose and closes the sheet');
    t.check((await fr2.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith('pose-and-light.')))).length === 0, 'the page writes only pose-and-light. keys', await fr2.evaluate(() => Object.keys(localStorage)));
    await screenshot(page, 'pose-desktop');
    await clean(t, page, 'standalone: reload');
    await page.context().close();
    lap('reload');
  }

  // ---- Inside the app at 1400 × 900: the frame follows the app's switch and theme, resizes, and the
  //      render protocol flooded (with 500 hostile saved poses in storage) --------------------------------
  {
    const big = []; for (let i = 0; i < 500; i++) big.push({ id: 'm' + i, p: { root: { y: i * 1e6, x: 'NaN' }, height: -1e9, shift: { x: 'abc', z: 1e300 }, neck: 'str' }, view: { az: 1e308, el: '1e308' } });
    const page = await openPage(site, { storage: { 'portrait-value-studio.mode': 'advanced', 'pose-and-light.mine.v1': big } });
    await tab(page, 'pose');
    const fr = poseFrame(page);
    t.check(!!fr, 'the Pose tab opens its frame');
    const emb = await fr.evaluate(() => ({ embed: document.documentElement.classList.contains('embed'), simple: document.documentElement.classList.contains('simple'), top: getComputedStyle(document.querySelector('.top')).display, stage: getComputedStyle(document.getElementById('stage')).height, imgs: document.querySelectorAll('#poses button.has-img').length, mine: document.querySelectorAll('#mine .pose-btn').length, mode: localStorage.getItem('pose-and-light.mode') }));
    t.check(emb.embed && !emb.simple && emb.top === 'none' && emb.stage === '675px' && emb.imgs === 30 && emb.mine === 12 && emb.mode === null, 'embedded: no header, the stage sized from the app\'s window, Advanced as the app was before the frame loaded, twelve of 500 hostile saved poses, no mode key of its own', emb);
    t.check(/^\d+px$/.test(await page.evaluate(() => document.getElementById('poseFrame').style.height)), 'the frame is sized by its page');
    await page.evaluate(() => document.querySelector('[data-mode="simple"]').click());
    await fr.waitForFunction(() => document.documentElement.classList.contains('simple'), null, { timeout: 3000 }).catch(() => null);
    t.check(await fr.evaluate(() => document.documentElement.classList.contains('simple')), 'the app\'s switch to Simple reaches the frame');
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    await fr.waitForFunction(() => !document.documentElement.classList.contains('simple'), null, { timeout: 3000 }).catch(() => null);
    t.check(await fr.evaluate(() => !document.documentElement.classList.contains('simple') && localStorage.getItem('pose-and-light.mode') === null), 'and back to Advanced, still without writing the page\'s own mode key');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await fr.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 3000 }).catch(() => null);
    t.check(await fr.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'), 'the frame follows the app\'s theme');
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await fr.click('#poses .pose-btn[data-id="walk"]');
    await fr.evaluate(() => { window.PoseAndLight.pick('shoulderR'); window.PoseAndLight.render(); });
    const h0 = await settledHeight(page);                               // the rail grew for the picked part, and the frame with it
    await page.setViewportSize(PHONE);
    await fr.waitForFunction(() => document.getElementById('view').width < 500, null, { timeout: 5000 }).catch(() => null);
    await sleep(400);
    const ph = await fr.evaluate(() => { const v = document.getElementById('view'); const w = v.clientWidth, h = v.clientHeight; const arrows = [...document.querySelectorAll('#arrows button')].map((b) => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(b.style.transform); return m ? [+m[1], +m[2]] : null; }); return { stage: getComputedStyle(document.getElementById('stage')).height, cw: w, w: v.width, h: v.height, cols: getComputedStyle(document.querySelector('.tool')).gridTemplateColumns.split(' ').length, arrows: arrows.length, inside: arrows.every((a) => a && a[0] >= 22 && a[0] <= w - 22 && a[1] >= 22 && a[1] <= h - 22) }; });
    const h1 = await page.evaluate(() => document.getElementById('poseFrame').style.height);
    t.check(ph.stage === '523px' && ph.cw < 400 && ph.w === ph.cw && ph.h === 523 && ph.cols === 1 && ph.arrows === 6 && ph.inside && h1 !== h0 && (await hscroll(page)) <= 0, 'resized to 390 wide while open: one column, the stage 62% of the window, the canvas redrawn to size, the arrows on the stage, the frame regrown, no sideways scroll', { ph, h0, h1 });
    await page.setViewportSize(DESKTOP);
    await fr.waitForFunction(() => document.getElementById('view').width > 800, null, { timeout: 5000 }).catch(() => null);
    await page.waitForFunction((h) => document.getElementById('poseFrame').style.height === h, h0, { timeout: 5000 }).catch(() => null);
    const dt = await fr.evaluate(() => ({ stage: getComputedStyle(document.getElementById('stage')).height, cw: document.getElementById('view').clientWidth, w: document.getElementById('view').width }));
    t.check(dt.stage === '675px' && dt.w === dt.cw && dt.cw > 800 && (await page.evaluate(() => document.getElementById('poseFrame').style.height)) === h0, 'and back to 1400: the stage and the frame as before', dt);
    await fr.evaluate(() => window.PoseAndLight.pick(null));
    // a hand dragged in the embed, and the tab switched in the middle of the drag
    {
      const c = await ctrl(fr, 'handL');
      const b = await fr.locator('#view').boundingBox();
      const before = await poseJson(fr);
      await page.mouse.move(b.x + c.center.x, b.y + c.center.y); await page.mouse.down(); await page.mouse.move(b.x + b.width - 5, b.y + 5, { steps: 8 });
      await tab(page, 'study', { wait: false });
      await page.mouse.move(100, 100, { steps: 3 }); await page.mouse.up();
      await tab(page, 'pose');
      // the frame redraws at the tab's size a frame or two after the switch: wait for that, not for time
      await fr.waitForFunction(() => document.getElementById('view').width > 800, null, { timeout: 8000 }).catch(() => null);
      const s = await scan(fr);
      t.check(sane(s) && before !== await poseJson(fr) && await fr.evaluate(() => document.getElementById('view').width > 800 && !document.getElementById('undo').disabled), 'a hand dragged in the embed, the tab switched mid-drag and back: the pose moved and stays sane, the stage redrawn, Undo on', s);
    }
    await fr.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // the stage settled at its size
    await fr.evaluate(() => document.getElementById('snap').click());
    await fr.waitForFunction(() => document.getElementById('snapImg').naturalWidth > 0, null, { timeout: 8000 }).catch(() => null);
    t.check(await fr.evaluate(() => document.getElementById('snapDialog').open && document.getElementById('snapImg').naturalWidth === document.getElementById('view').width), 'Snapshot in the embed shows the picture');
    await fr.evaluate(() => document.getElementById('snapClose').click());
    await clean(t, page, 'embedded');
    lap('embedded');

    // the render protocol: hostile messages from the app page, then a flood of list requests
    await tab(page, 'figure');
    const rf = renderFrame(page);
    t.check(!!rf, 'the Figure study opens the render frame');
    const figBefore = await page.evaluate(() => ({ poses: document.querySelectorAll('#tab-figure [data-pose-id]').length, imgs: [...document.querySelectorAll('#tab-figure [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length }));
    t.check(figBefore.poses === 42 && figBefore.imgs === 42, 'Figure study lists the 30 poses and the twelve hostile saved ones, each with a picture', figBefore);
    await page.evaluate(() => { window.__shots = []; window.addEventListener('message', (e) => { if (e.source === document.getElementById('fig-render').contentWindow && e.data && e.data.type !== 'pose-and-light:thumb') window.__shots.push({ type: e.data.type, req: e.data.req, id: e.data.id, w: e.data.w, h: e.data.h, error: e.data.error, url: typeof e.data.url === 'string' ? e.data.url.slice(0, 15) : null, joints: e.data.joints ? Object.values(e.data.joints).every((j) => Array.isArray(j) && j.length === 3 && j.every(Number.isFinite)) : null, poses: e.data.poses && e.data.poses.length }); }); });
    const post = (m) => page.evaluate((m) => document.getElementById('fig-render').contentWindow.postMessage(m, '*'), m);
    await post({ type: 'pose-and-light:render', req: 'huge', id: 'stand', w: 1e9, h: 1e9 });
    await post({ type: 'pose-and-light:render', req: 'neg', id: 'walk', w: -5, h: 'abc' });
    await post({ type: 'pose-and-light:render', req: 'unk', id: 'nope', w: 600, h: 750 });
    await post({ type: 'pose-and-light:render', req: 'proto', id: '__proto__', w: 600, h: 750 });
    await post({ type: 'pose-and-light:render', req: 'noid' });
    await post({ type: 'pose-and-light:render', req: 'nan', id: 'run', w: NaN, h: null });
    await post({ type: 'pose-and-light:render', req: 'mine', id: 'm499', w: 300, h: 300 });
    for (const junk of ['a string', 42, null, { type: 5 }, { type: 'pose-and-light:nothing' }, [], { type: 'pose-and-light:mode', mode: 'advanced' }]) await post(junk);
    for (let i = 0; i < 50; i++) await post({ type: 'pose-and-light:list' });
    const t0 = Date.now();
    const alive = await page.evaluate(() => 1 + 1).catch(() => null);
    t.check(alive === 2 && Date.now() - t0 < 2000, 'the app page answers at once after the flood', Date.now() - t0);
    await page.waitForFunction(() => window.__shots.filter((s) => s.type === 'pose-and-light:shot').length >= 7 && window.__shots.filter((s) => s.type === 'pose-and-light:list').length >= 50, null, { timeout: 60000 }).catch(() => null);
    const shots = await page.evaluate(() => window.__shots);
    const shot = (req) => shots.find((s) => s.type === 'pose-and-light:shot' && s.req === req);
    const lists = shots.filter((s) => s.type === 'pose-and-light:list');
    t.check(lists.length === 50 && lists.every((l) => l.poses === 42), 'fifty list requests get fifty lists of 42 poses', lists.length);
    const huge = shot('huge'), neg = shot('neg'), nan = shot('nan'), own = shot('mine');
    t.check(huge && huge.w === 1200 && huge.h === 1500 && huge.url === 'data:image/jpeg' && huge.joints === true, 'a render with a huge size is drawn at the largest size allowed, with joints', huge);
    t.check(neg && neg.w === 80 && neg.h === 750 && neg.joints === true && nan && nan.w === 600 && nan.h === 750 && nan.joints === true, 'a negative, a text, a NaN and a null size fall back to the smallest or the default', { neg, nan });
    t.check(own && own.w === 300 && own.joints === true, 'a hostile saved pose renders with finite joints', own);
    t.check(['unk', 'proto', 'noid'].every((r) => shot(r) && shot(r).error === true && !shot(r).url), 'an unknown, a prototype-named and a missing id are answered with an error, no picture', ['unk', 'proto', 'noid'].map(shot));
    await page.waitForFunction(() => [...document.querySelectorAll('#tab-figure [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length === 42, null, { timeout: 30000 }).catch(() => null);
    const figAfter = await page.evaluate(() => ({ poses: document.querySelectorAll('#tab-figure [data-pose-id]').length, imgs: [...document.querySelectorAll('#tab-figure [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length, start: document.getElementById('fig-start').disabled }));
    t.check(figAfter.poses === 42 && figAfter.imgs === 42 && !figAfter.start, 'after the flood Figure study still has every pose with a picture and Start on', figAfter);
    await clean(t, page, 'render protocol');
    await page.context().close();
    lap('render protocol');
  }

  // ---- The page on its own at 390 × 844, and inside the app at that width ------------------------------
  {
    const page = await openPage(site, { url: 'pose.html', viewport: PHONE });
    const fr = page.mainFrame();
    await up(fr);
    const lay = await fr.evaluate(() => ({ cols: getComputedStyle(document.querySelector('.tool')).gridTemplateColumns.split(' ').length, stage: parseFloat(getComputedStyle(document.getElementById('stage')).height), lib: getComputedStyle(document.querySelector('#poses .library')).gridTemplateColumns.split(' ').length, imgs: document.querySelectorAll('#poses button.has-img').length }));
    t.check(lay.cols === 1 && lay.stage >= 340 && lay.lib >= 2 && lay.imgs === 30 && (await hscroll(page)) <= 0, 'phone: one column, the stage at least 340 tall, the library in columns, no sideways scroll', lay);
    await pick(fr, 'crouch');
    await fr.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    const phoneBad = [];
    for (const [id, through] of [['footR', [[1, 0], [1.5, -0.5]]], ['kneeL', [[0, 0.5], [-0.5, 0.5]]], ['torso', [[1, 0], [1.5, -0.5]]], ['handL', [[0, 1], [-0.5, 1.5]]], ['elbowL', [[1, 1], [1.5, 1.5]]]]) {
      const c = await ctrl(fr, id);
      if (!c || !c.center) { phoneBad.push({ id, off: true }); continue; }
      const before = await poseJson(fr);
      await drag(page, fr, id === 'torso' ? c.pts[12] : c.center, through);
      const s = await scan(fr);
      if (!sane(s) || before === await poseJson(fr)) phoneBad.push({ id, s });
    }
    t.check(phoneBad.length === 0, 'phone: a foot, a knee, the chest ring, a hand and an elbow dragged far off the stage: the pose moves and stays sane', phoneBad);
    {
      const hb = await fr.locator('#lampHandle').boundingBox();
      const b = await fr.locator('#view').boundingBox();
      await page.mouse.move(hb.x + 23, hb.y + 23); await page.mouse.down(); await page.mouse.move(b.x + b.width - 10, b.y + b.height - 10, { steps: 10 }); await page.mouse.up();
      const h = await fr.evaluate(() => { const h = document.getElementById('lampHandle'), bar = document.querySelector('.stage-bar'); return { x: +h.dataset.x, y: +h.dataset.y, barL: bar.offsetLeft, barT: bar.offsetTop }; });
      t.check(!(h.x > h.barL - 26 && h.y > h.barT - 27) && (await scan(fr)).bad.length === 0, 'phone: the lamp dragged into the buttons\' corner keeps its handle above them', h);
    }
    await fr.evaluate(() => document.getElementById('snap').click());
    await fr.waitForFunction(() => document.getElementById('snapImg').naturalWidth > 0, null, { timeout: 8000 }).catch(() => null);
    t.check(await fr.evaluate(() => document.getElementById('snapDialog').open && document.getElementById('snapImg').getBoundingClientRect().width <= window.innerWidth), 'phone: the snapshot fits the window');
    await fr.evaluate(() => document.getElementById('snapClose').click());
    await screenshot(page, 'pose-phone');
    await clean(t, page, 'phone standalone');
    await page.context().close();
  }
  {
    const page = await openPage(site, { viewport: PHONE });
    await tab(page, 'pose');
    const fr = poseFrame(page);
    const emb = await fr.evaluate(() => ({ stage: getComputedStyle(document.getElementById('stage')).height, cw: document.getElementById('view').clientWidth, imgs: document.querySelectorAll('#poses button.has-img').length }));
    t.check(emb.stage === '523px' && emb.cw > 300 && emb.cw < 390 && emb.imgs === 30 && (await hscroll(page)) <= 0, 'phone embed: the stage 62% of the window, the canvas inside it, no sideways scroll', emb);
    await fr.click('#poses .pose-btn[data-id="sit"]');
    const c = await ctrl(fr, 'handR');
    const before = await poseJson(fr);
    await drag(page, fr, c.center, [[0, 0], [-0.5, -0.5]]);
    const s = await scan(fr);
    t.check(sane(s) && before !== await poseJson(fr), 'phone embed: a hand dragged off the top left moves the arm and stays sane', s);
    await page.setViewportSize(DESKTOP);
    await fr.waitForFunction(() => document.getElementById('view').width > 800, null, { timeout: 5000 }).catch(() => null);
    t.check(await fr.evaluate(() => document.getElementById('view').width === document.getElementById('view').clientWidth && getComputedStyle(document.getElementById('stage')).height === '675px'), 'phone embed widened to 1400: the stage and canvas regrow');
    await clean(t, page, 'phone embed');
    await page.context().close();
    lap('both phone pages');
  }

  // ---- Hostile saved state for every key the page reads ---------------------------------------------
  const hostile = [
    ['v2 of the wrong types', { 'pose-and-light.v2': { pose: 'constructor', light: [45] } }, { cont: true }],
    ['v2 with NaN strings, huge angles and prototype names', { 'pose-and-light.v2': { pose: { root: { x: 'NaN', y: '1e308', z: -1e308 }, height: 'NaN', shift: { x: '1e308', z: 'NaN' }, constructor: { x: 1 }, __proto__: { polluted: 1 }, hipR: 'str', kneeL: [1, 2], neck: { x: 'Infinity', y: true, z: null }, waist: { x: { y: 1 } } }, light: { az: '1e308', el: 'NaN', dist: 0, soft: -5, fill: '1e308', __proto__: { az: 7 } } } }, { cont: false, rootY: 180, az: -180, dist: 1.6, soft: 0, fill: 100 }],
    ['v2 broken JSON, picked before the pictures are done', { 'pose-and-light.v2': '{"pose":' }, { cont: true, early: 'run' }],
    ['mine not an array, mode a prototype name', { 'pose-and-light.mine.v1': { a: 1 }, 'pose-and-light.mode': 'constructor' }, { cont: true, mine: 0, simple: true }],
    ['mine with junk entries and library ids, mode an object', { 'pose-and-light.mine.v1': [null, 1, 'x', { id: 5, p: {} }, { id: 'nop' }, { id: 'ok', p: 'str' }, { id: 'ok2', p: [] }, { id: 'stand', p: { root: { y: 1e9 } }, view: 'x' }, { id: '__proto__', p: { __proto__: { x: 1 } }, view: { az: 'NaN', el: -1e9 } }, { id: 'constructor', p: { constructor: { x: 1 } } }], 'pose-and-light.mode': { a: 1 } }, { cont: true, mine: 4, simple: true }],
    ['mine broken JSON, mode advanced', { 'pose-and-light.mine.v1': '[{', 'pose-and-light.mode': 'advanced' }, { cont: true, mine: 0, simple: false }],
  ];
  for (const [label, storage, want] of hostile) {
    const page = await openPage(site, { url: 'pose.html', storage });
    const fr = page.mainFrame();
    await fr.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses .pose-btn').length === 30, null, { timeout: 30000 }).catch(() => null);
    if (want.early) { await pick(fr, want.early); await up(fr); }
    // the pictures of last time's pose and of the saved poses, which come first; the library's 30 need not be waited for
    await fr.waitForFunction(() => (document.getElementById('continueWrap').hidden || document.querySelectorAll('#continue .pose-btn.has-img').length === 1) && document.querySelectorAll('#mine .pose-btn:not(.has-img)').length === 0, null, { timeout: 20000 }).catch(() => null);
    const s = await scan(fr);
    const ui = await fr.evaluate(() => ({ started: !!window.__poseStarted, cont: document.getElementById('continueWrap').hidden, contImg: document.querySelectorAll('#continue .pose-btn.has-img').length, mine: document.querySelectorAll('#mine .pose-btn').length, mineImgs: document.querySelectorAll('#mine .pose-btn.has-img').length, simple: document.documentElement.classList.contains('simple'), rootY: window.PoseAndLight.pose.root.y, dist: window.PoseAndLight.light.dist, soft: window.PoseAndLight.light.soft, fill: window.PoseAndLight.light.fill, lAz: document.getElementById('lAz').value, sum: document.getElementById('lightSum').textContent, hipR: window.PoseAndLight.pose.hipR.x, title: document.getElementById('libTitle').textContent }));
    const ok = ui.started && s.bad.length === 0 && s.out.length === 0 && ui.cont === want.cont && (want.cont || ui.contImg === 1) && ui.mine === ui.mineImgs
      && (want.mine === undefined || ui.mine === want.mine) && (want.simple === undefined || ui.simple === want.simple)
      && (want.rootY === undefined || ui.rootY === want.rootY) && (want.az === undefined || (s.az === want.az && +ui.lAz === want.az)) && (want.dist === undefined || ui.dist === want.dist) && (want.soft === undefined || ui.soft === want.soft) && (want.fill === undefined || ui.fill === want.fill)
      && (!want.early || ui.hipR === -70);
    t.check(ok, `hostile ${label}: the page starts, nothing NaN, every angle clamped, the start screen as expected`, { s, ui });
    if (want.mine) {
      const picks = [];
      for (let i = 0; i < want.mine; i++) {
        await fr.evaluate((i) => { if (document.getElementById('library').hidden) document.getElementById('posesBtn').click(); document.querySelectorAll('#mine .pose-btn')[i].click(); }, i);
        const ps = await scan(fr);
        const note = await fr.evaluate(() => { document.getElementById('posesBtn').click(); const n = document.getElementById('libNote').textContent; const pressed = document.querySelectorAll('.pose-btn[aria-pressed="true"]').length; document.getElementById('libClose').click(); return { n, pressed }; });
        picks.push({ i, bad: ps.bad, out: ps.out, low: ps.low, ...note });
      }
      t.check(picks.every((p) => p.bad.length === 0 && p.out.length === 0 && /^On the figure now: Your pose \d+$/.test(p.n)), `hostile ${label}: each saved pose can be picked, stays sane and is named`, picks);
      if (picks.some((p) => p.pressed > 1)) t.note(`${label}: a saved pose whose id is a library pose's ("stand") is marked on the figure together with the library's Stand (both carry data-id "stand", js/pose.js:1253); ids the page makes itself never collide`);
    }
    await clean(t, page, `hostile ${label}`);
    await page.context().close();
  }
  lap('hostile saved state');
  t.note('A hostile saved pose with height -1e9 is clamped to the lowest height (-0.95) and shown as saved, sunk into the floor until Put the feet on the floor; a pose the page saved itself is never below the floor');
}
