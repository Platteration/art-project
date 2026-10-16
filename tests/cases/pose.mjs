// Pose and light, on its own page and inside the app: the library and every one of its 30 poses, each
// rig control dragged far past the figure (feet planted and free), the arrows by tap, hold and keyboard,
// Straighten and Copy to the other side, the lamp by drag, keyboard, presets and every slider at both
// ends, See it as with the splits at their ends and crossed, Show or hide, Front view, Start over,
// Snapshot, Undo past sixty steps, Save this pose past twelve, remove and Put back, a full storage,
// Simple and Advanced from the app's switch and the page's own (remembered), the window resized while
// open, Where you left off after a reload (one mid-drag), hostile saved state for every key the page
// reads, and the render protocol flooded from the app page; at 1400 × 900 and 390 × 844. Then, from the
// coverage review: the library's groups and pictures read back, the wrist and the arm under the pointer, the
// poles holding the hand and the foot, the heels lifting, the hips by arrows with the feet planted, the floor
// after Straighten and the arrows, a part dragged by itself, the view walked around and zoomed, a drag cut short
// or overtaken by the library, Simple's diamonds and what it resets, the lamp's light read from the stage's
// pixels, its handle behind the figure and behind the camera, gray snapshots, the frame's drawers, height and
// mode messages, an arrow held through a tab switch, the reference pictures' framing and tilts, a lost context
// in the render frame, a finger (tap, drag, pinch, swipe), two Pose and light pages and Forget my work, and
// WebGL turned off.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, newTab, clean, tab, poseFrame, renderFrame, sleep, DESKTOP, PHONE, hscroll, screenshot, axe, ROOT } from '../lib.mjs';

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
    // (held until it has gone on past a tap's six degrees, or 6 s: a busy machine draws the stage slowly, and a
    // fixed 1.2 s could end the hold before its repeat began)
    await page.mouse.move(held.x + 20, held.y + 20); await page.mouse.down(); await fr.waitForFunction((a) => Math.abs(window.PoseAndLight.pose.shoulderR.x - a) > 13, a1, { timeout: 6000 }).catch(() => null); await page.mouse.up();
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

    // ---- more of the rig, Advanced, Front view: the circles under the pointer, the poles, the feet, the hips
    //      by arrows, the floor, Copy for a whole limb, where the arrows sit, a part dragged by itself, the view
    //      walked around, and a drag cut short or overtaken by the library ------------------------------------
    {
      const keepPose = await poseJson(fr);
      const b = await fr.locator('#view').boundingBox();
      await pick(fr, 'stand');
      await fr.evaluate(() => { window.PoseAndLight.pick(null); document.getElementById('resetView').click(); });
      // the mouse over a hand's circle lights it and the cursor says so; over the background, neither
      const hr = await ctrl(fr, 'handR');
      await page.mouse.move(b.x + hr.center.x, b.y + hr.center.y, { steps: 2 });
      await fr.waitForFunction(() => document.querySelector('#rig > g.is-hot'), null, { timeout: 3000 }).catch(() => null);
      const hover = await fr.evaluate(() => ({ over: document.getElementById('view').classList.contains('is-over'), hot: [...document.querySelectorAll('#rig > g')].flatMap((g, i) => (g.classList.contains('is-hot') ? [window.PoseAndLight.ctrls()[i].id] : [])) }));
      const bg = await backgroundSpot(fr);
      await page.mouse.move(b.x + bg.x, b.y + bg.y, { steps: 2 });
      await fr.waitForFunction(() => !document.querySelector('#rig > g.is-hot'), null, { timeout: 3000 }).catch(() => null);
      const unhover = await fr.evaluate(() => ({ over: document.getElementById('view').classList.contains('is-over'), hot: document.querySelectorAll('#rig > g.is-hot').length }));
      t.check(hover.over && hover.hot.join() === 'handR' && !unhover.over && unhover.hot === 0, 'the mouse over the right hand\'s circle lights that circle and the cursor says it can be grabbed; over the background, neither', { hover, unhover });
      // a drag the browser cancels (pointercancel) ends there, keeping and saving what it moved
      {
        const hl = await ctrl(fr, 'handL'), p0 = await poseJson(fr);
        await page.mouse.move(b.x + hl.center.x, b.y + hl.center.y); await page.mouse.down(); await page.mouse.move(b.x + hl.center.x + 40, b.y + hl.center.y - 60, { steps: 2 });
        const p1 = await poseJson(fr);
        await fr.evaluate(() => document.getElementById('view').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true })));
        const dragging = await fr.evaluate(() => document.getElementById('view').classList.contains('is-dragging'));
        await page.mouse.move(b.x + hl.center.x + 100, b.y + hl.center.y - 100, { steps: 2 });
        const p2 = await poseJson(fr);
        await page.mouse.up();
        const savedPose = await fr.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('pose-and-light.v2')).pose));
        t.check(p1 !== p0 && p2 === p1 && !dragging && savedPose === p1 && !(await fr.evaluate(() => document.getElementById('undo').disabled)), 'a hand drag the browser cancels ends there: the move so far is kept and saved, Undo on, and the pointer moving on moves nothing', { moved: p1 !== p0, still: p2 === p1, dragging, saved: savedPose === p1 });
      }
      // the hand's circle: the wrist goes where the pointer goes, the hand keeping its twist
      await pick(fr, 'stand');
      {
        const h = await ctrl(fr, 'handR'), w0 = await screenOf(fr, 'wristR'), twist0 = await fr.evaluate(() => window.PoseAndLight.pose.wristR.y);
        await dragBy(page, fr, h.center, -60, -120, 8);            // (moves of 15 px: a jump of the elbow in one move is eased, js/pose.js:518)
        const w1 = await screenOf(fr, 'wristR');
        const near = { moved: [+(w1.x - w0.x).toFixed(1), +(w1.y - w0.y).toFixed(1)], twist: [twist0, await fr.evaluate(() => window.PoseAndLight.pose.wristR.y)], s: await scan(fr) };
        t.check(Math.hypot(near.moved[0] + 60, near.moved[1] + 120) < 6 && near.twist[0] === near.twist[1] && sane(near.s), 'Front view, Stand: the right hand\'s circle dragged 60 px out and 120 px up puts the wrist under the pointer (within 6 px), the hand keeping its twist', near);
        // the library's mark goes once the figure leaves the pose, and comes back with Undo
        const mark = await fr.evaluate(() => {
          const read = () => ({ note: document.getElementById('libNote').textContent, pressed: [...document.querySelectorAll('.pose-btn[aria-pressed="true"]')].map((x) => x.dataset.id).join() });
          document.getElementById('posesBtn').click(); const moved = read(); document.getElementById('libClose').click();
          document.getElementById('undo').click(); document.getElementById('posesBtn').click(); const undone = read(); document.getElementById('libClose').click();
          return { moved, undone };
        });
        t.check(mark.moved.note === 'Tap a pose to start from it' && mark.moved.pressed === '' && mark.undone.note === 'On the figure now: Stand' && mark.undone.pressed === 'stand', 'the library after the hand moved: no pose marked, "Tap a pose to start from it"; after Undo, Stand marked and named again', mark);
        // pulled far past its reach, the arm points straight at the pointer
        const h2 = await ctrl(fr, 'handR'), far = { x: h2.center.x - 400, y: h2.center.y - 450 };
        await dragBy(page, fr, h2.center, -400, -450, 10);
        const sh = await screenOf(fr, 'shoulderR'), w2 = await screenOf(fr, 'wristR');
        const d = Math.atan2(w2.y - sh.y, w2.x - sh.x) - Math.atan2(far.y - sh.y, far.x - sh.x);
        const off = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
        t.check(off < 8 && sane(await scan(fr)), 'the right hand\'s circle pulled far past the arm\'s reach: the arm points at the pointer (within 8°)', { off: +off.toFixed(1), sh, w2, far });
      }
      // the foot's oval: the ankle follows the pointer and the foot keeps its turn, flat on the floor
      await pick(fr, 'crouch');
      {
        const f = await ctrl(fr, 'footR'), a0 = await screenOf(fr, 'ankleR'), f0 = await footOf(fr, 'R');
        await dragBy(page, fr, f.center, -20, 0);
        const a1 = await screenOf(fr, 'ankleR'), f1 = await footOf(fr, 'R');
        const res = { moved: [+(a1.x - a0.x).toFixed(1), +(a1.y - a0.y).toFixed(1)], turned: +(await turnBetween(fr, f0.q, f1.q)).toFixed(3), heading: [f0.heading, f1.heading], low: +(await fr.evaluate(() => window.PoseAndLight.legLow('R'))).toFixed(4) };
        t.check(Math.hypot(res.moved[0] + 20, res.moved[1]) < 6 && res.turned < 0.05 && res.low >= -0.002, 'Crouch: the right foot\'s oval dragged 20 px out: the ankle follows the pointer and the foot keeps its turn on the floor', res);
      }
      // the hips ring pulled straight down from Stand, feet planted: the legs fold into a deep crouch, the balls of
      // the feet where they were, the heels lifting onto the toes once the ankles bend no further
      await pick(fr, 'stand');
      {
        const pel = await ctrl(fr, 'pelvis'), b0 = await balls(fr);
        await dragBy(page, fr, pel.pts[0], 0, b.height - 4 - pel.pts[0].y, 4);
        const b1 = await balls(fr);
        const deep = await fr.evaluate(() => { const api = window.PoseAndLight, T = window.THREE, o = { height: +api.pose.height.toFixed(3), knees: [api.pose.kneeR.x, api.pose.kneeL.x].map((x) => +x.toFixed(1)) }; for (const s of ['R', 'L']) { const q = api.worldQuat('ankle' + s), a = api.worldPos('ankle' + s); o[s] = { heel: +new T.Vector3(0, -0.04, -0.045).applyQuaternion(q).add(a).y.toFixed(4), ball: +new T.Vector3(0, -0.04, 0.158).applyQuaternion(q).add(a).y.toFixed(4), knee: +api.worldPos('knee' + s).y.toFixed(3) }; } return o; });
        const heelsUp = ['R', 'L'].every((s) => deep[s].heel > deep[s].ball + 0.05);
        t.note('From Crouch (hips at -0.49, knees at 125° of their 150°) the hips ring pulled straight down does not lower the hips at all, though from Stand the same pull folds the legs to -0.53 with the knees at 150°; Crouch\'s hips lean forward 18°, which may be what stops them, so this is not a finding');
        t.check(deep.height < -0.4 && dist3(b0.R, b1.R) < 0.03 && dist3(b0.L, b1.L) < 0.03 && heelsUp && deep.R.knee >= 0.048 && deep.L.knee >= 0.048 && sane(await scan(fr)), 'Stand, feet planted: the hips ring pulled straight down to the stage\'s bottom folds the legs into a deep crouch, the balls of the feet stay, the heels lift onto the toes, the knees stay off the floor', { ...deep, balls: [dist3(b0.R, b1.R), dist3(b0.L, b1.L)] });
      }
      // the elbow's diamond swings the elbow with the hand held still; the knee's the same with the foot
      await pick(fr, 'think');
      {
        const e = await ctrl(fr, 'elbowR');
        const at = () => fr.evaluate(() => ({ w: window.PoseAndLight.worldPos('wristR').toArray(), e: window.PoseAndLight.worldPos('elbowR').toArray() }));
        const p0 = await at();
        await dragBy(page, fr, e.center, 0, 70);
        const p1 = await at();
        t.check(dist3(p0.w, p1.w) < 0.005 && dist3(p0.e, p1.e) > 0.03 && sane(await scan(fr)), 'Think: the right elbow\'s diamond dragged 70 px down swings the elbow while the hand stays where it was', { hand: dist3(p0.w, p1.w), elbow: dist3(p0.e, p1.e) });
      }
      await pick(fr, 'relaxed');
      {
        const k = await ctrl(fr, 'kneeL'), f0 = await footOf(fr, 'L'), k0 = await fr.evaluate(() => window.PoseAndLight.worldPos('kneeL').toArray());
        await dragBy(page, fr, k.center, 40, 0);
        const f1 = await footOf(fr, 'L'), k1 = await fr.evaluate(() => window.PoseAndLight.worldPos('kneeL').toArray());
        const res = { knee: +dist3(k0, k1).toFixed(3), ankle: +dist3(f0.ankle, f1.ankle).toFixed(4), ball: +dist3(f0.ball, f1.ball).toFixed(3), heading: [f0.heading, f1.heading], ankleAngles: await fr.evaluate(() => window.PoseAndLight.pose.ankleL) };
        const still = res.ankle < 0.005 && res.ball < 0.01 && Math.abs(res.heading[1] - res.heading[0]) < 3;
        t.check(res.knee > 0.02 && still, 'Weight on one leg: the left knee\'s diamond dragged 40 px swings the knee while the foot stays where it was (ankle, ball of the foot and heading)', res);
        if (res.knee > 0.02 && !still) t.finding({ title: 'Dragging a knee\'s diamond turns the foot on the floor once the ankle reaches its limit', severity: 'medium', steps: 'pose.html, Advanced, pick "Weight on one leg" from Poses, drag the blue diamond on the left knee 40 px to the right (Walk\'s left knee, 50 px, does the same)', expected: 'The README: a diamond at each elbow swings the elbow "with the hand held still", "and does the same for the knees": the foot stays where it stands, as the hand does', actual: `The ankle stays (${res.ankle} m) but the foot turns from ${res.heading[0]}° to ${res.heading[1]}° on the floor and the ball of the foot slides ${res.ball} m; the ankle sits at its turn limit (${JSON.stringify(res.ankleAngles)})`, cause: 'js/pose.js:1878 footTurn() keeps the foot\'s turn only within the ankle\'s limits (setTurn clamps at ±25° turn, ±20° roll, js/pose.js:337, 466-482), and the check at js/pose.js:1880 stops the swing only when the ankle\'s position moves or the leg goes into the floor, not when the foot\'s turn changes' });
      }
      // the whole figure by its arrows with the feet planted: Lean bends the legs, Raise waits for bent legs
      await pick(fr, 'stand');
      {
        await fr.evaluate(() => { window.PoseAndLight.pick('root'); window.PoseAndLight.render(); });
        const b0 = await balls(fr);
        await pressArrow(page, fr, 'Lean forward', 3);
        const b1 = await balls(fr), lean = await scan(fr), rx = await fr.evaluate(() => window.PoseAndLight.pose.root.x);
        const raise = await fr.evaluate(() => { window.PoseAndLight.render(); return window.PoseAndLight.arrows().find((a) => a.label === 'Raise the body').disabled; });
        await pressArrow(page, fr, 'Lower the body', 5);
        const b2 = await balls(fr), lowered = await scan(fr), knees = await fr.evaluate(() => [window.PoseAndLight.worldPos('kneeR').y, window.PoseAndLight.worldPos('kneeL').y]);
        t.check(rx === 18 && sane(lean) && dist3(b0.R, b1.R) < 0.01 && dist3(b0.L, b1.L) < 0.01 && raise, 'Stand, feet planted, the whole figure picked: Lean forward three times by keyboard leans 18° with both feet where they stood; Raise the body is disabled while the legs are straight', { rx, lean, balls: [dist3(b0.R, b1.R), dist3(b0.L, b1.L)], raise });
        t.check(lowered.height < -0.1 && sane(lowered) && dist3(b0.R, b2.R) < 0.01 && dist3(b0.L, b2.L) < 0.01 && knees.every((y) => y >= 0.048), 'Lower the body five times, feet planted: the figure sinks into a crouch with both feet where they stood and the knees off the floor', { lowered, balls: [dist3(b0.R, b2.R), dist3(b0.L, b2.L)], knees });
        await fr.evaluate(() => document.getElementById('plantFeet').click());
        await pressArrow(page, fr, 'Lower the body', 2);
        const free = await scan(fr);
        await fr.evaluate(() => document.getElementById('plantFeet').click());
        t.check(Math.abs(free.height - lowered.height) < 0.005 && free.low >= -0.002, 'Lower the body with the feet free: the figure stays on the floor rather than sinking into it', { free, was: lowered.height });
      }
      // Straighten, Copy to the other side and the arrows on a leg, and the floor
      {
        const floor = {};
        await pick(fr, 'kneel');
        await fr.evaluate(() => { window.PoseAndLight.pick('kneeR'); document.getElementById('straighten').click(); });
        floor.kneelStraighten = (await scan(fr)).low;
        await fr.evaluate(() => document.getElementById('ground').click());
        floor.repaired = (await scan(fr)).low;
        await pick(fr, 'stand');
        await fr.evaluate(() => window.PoseAndLight.pick('ankleR'));
        await pressArrow(page, fr, 'Point the toes', 3);
        floor.pointToes = (await scan(fr)).low;
        await pick(fr, 'dance');
        await fr.evaluate(() => { window.PoseAndLight.pick('hipL'); document.getElementById('mirror').click(); });
        floor.arabesqueCopy = (await scan(fr)).low;
        t.check(floor.arabesqueCopy >= -0.002 && floor.arabesqueCopy <= 0.02, 'Arabesque: Copy to the other side on the standing leg leaves the figure on the floor', floor);
        t.check(Math.abs(floor.repaired - 0.002) < 1e-3, 'Put the feet on the floor brings a figure sunk into the floor back onto it', floor);
        const kneelOk = t.check(floor.kneelStraighten >= -0.002, 'Kneel: Straighten on the right shin (the one on the floor) keeps it above the floor', floor);
        const toesOk = t.check(floor.pointToes >= -0.002, 'Stand: Point the toes three times on the right foot keeps the toes above the floor', floor);
        if (!kneelOk || !toesOk) t.finding({ title: 'Straighten and the arrows put a leg through the floor', severity: 'medium', steps: 'pose.html, Advanced. (1) Poses → Kneel, tap the right shin (the one on the floor), press Straighten. (2) Poses → Stand, tap the right foot, press "Point the toes" three times', expected: 'The figure stays on the floor, as every drag keeps it (the rig\'s moves lift a sole that would dip, js/pose.js:1798-1825, and stop where a leg would go into the floor, js/pose.js:1876-1884), or stops where the floor stops it', actual: `(1) the straightened shin goes ${Math.abs(Math.min(0, floor.kneelStraighten)).toFixed(2)} m into the floor; (2) the toes go ${Math.abs(Math.min(0, floor.pointToes)).toFixed(3)} m into it. Both moves are remembered as they are (Undo, Where you left off); Put the feet on the floor repairs them`, cause: 'js/pose.js:999-1003: Straighten zeroes the part and calls applyPose() with no floor check (only the whole figure is grounded); js/pose.js:876-881: nudge() (every arrow) clamps the angle and calls applyPose() with no floor check unless the part is the hips' });
      }
      // Copy to the other side for a whole arm: the elbow and the hand come along, mirrored; none for the body
      await pick(fr, 'wave');
      {
        const cp = await fr.evaluate(() => { const api = window.PoseAndLight; api.pick('shoulderL'); document.getElementById('mirror').click(); const p = JSON.parse(JSON.stringify(api.pose)); api.pick('waist'); const waist = document.getElementById('mirror').hidden; api.pick('neck'); const neck = document.getElementById('mirror').hidden; api.pick(null); return { sL: p.shoulderL, sR: p.shoulderR, eL: p.elbowL, eR: p.elbowR, wL: p.wristL, wR: p.wristR, waist, neck }; });
        const m = (a, q) => q.x === a.x && q.y === -a.y && q.z === -a.z;
        t.check(m(cp.sL, cp.sR) && m(cp.eL, cp.eR) && m(cp.wL, cp.wR) && cp.waist && cp.neck && sane(await scan(fr)), 'Wave: Copy to the other side on the left upper arm mirrors the whole arm, elbow and hand included; the body and the head have no Copy', cp);
      }
      // where the arrows sit: never two the same way, 44 px apart, clear of the small rig controls, ◉ ⊗ named
      await pick(fr, 'stand');
      {
        const place = (part) => fr.evaluate((part) => {
          const api = window.PoseAndLight; api.pick(part); api.render();
          const ar = [...document.querySelectorAll('#arrows button')].map((x) => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(x.style.transform); const r = /rotate\(([-\d.e]+)rad\)/.exec((x.firstChild && x.firstChild.style.transform) || ''); return { label: x.getAttribute('aria-label'), x: m ? +m[1] : NaN, y: m ? +m[2] : NaN, rot: r ? +r[1] : null }; });
          const ctrls = api.ctrls().filter((c) => c.center && c.kind !== 'ring').map((c) => ({ x: c.center.x, y: c.center.y, r: 22 + (c.kind === 'hand' ? c.rad : c.kind === 'foot' ? 14 : 10) }));
          return { ar, ctrls, depth: !document.getElementById('partDepth').hidden };
        }, part);
        const judge = (r) => {
          let apart = Infinity, clear = Infinity, ways = Infinity;
          r.ar.forEach((a, i) => r.ar.slice(i + 1).forEach((q) => { apart = Math.min(apart, Math.hypot(a.x - q.x, a.y - q.y)); if (a.rot != null && q.rot != null) ways = Math.min(ways, Math.abs(Math.atan2(Math.sin(a.rot - q.rot), Math.cos(a.rot - q.rot))) * 180 / Math.PI); }));
          r.ar.forEach((a) => r.ctrls.forEach((c) => { clear = Math.min(clear, Math.hypot(a.x - c.x, a.y - c.y) - c.r); }));
          const toward = r.ar.filter((a) => / \(toward you\)$/.test(a.label)).length, away = r.ar.filter((a) => / \(away from you\)$/.test(a.label)).length;
          return { n: r.ar.length, apart: +apart.toFixed(1), clear: +clear.toFixed(1), ways: +ways.toFixed(1), toward, away, depth: r.depth, ok: r.ar.length === 6 && apart >= 43.5 && clear >= -0.5 && ways > 15 && toward === away && r.depth === toward > 0 };
        };
        const placed = { shoulderR: judge(await place('shoulderR')) };
        await fr.evaluate(() => { window.PoseAndLight.view.az = 90; window.PoseAndLight.placeCamera(); });
        placed.neck = judge(await place('neck'));
        placed.ankleL = judge(await place('ankleL'));
        t.check(Object.values(placed).every((p) => p.ok), 'the arrows of the right upper arm (front), the head and the left foot (side): six each, 44 px apart, no two straight ones the same way, clear of the hand, foot, elbow and knee controls, ◉ and ⊗ named "toward you" and "away from you" exactly when the note about them shows', placed);
        await fr.evaluate(() => { window.PoseAndLight.pick(null); document.getElementById('resetView').click(); });
      }
      // a part dragged by itself: the hips, tapped to pick them, then dragged sideways, turn the whole figure
      await pick(fr, 'stand');
      {
        const at = await spotOn(fr, 'root');
        if (!at) t.check(false, 'a spot on the hips that no rig control takes', 'none found');
        else {
          await page.mouse.click(b.x + at.x, b.y + at.y);
          const picked = await fr.evaluate(() => window.PoseAndLight.picked());
          const y0 = await fr.evaluate(() => window.PoseAndLight.pose.root.y), f0 = await footOf(fr, 'R');
          await dragBy(page, fr, at, 100, 0);
          const y1 = await fr.evaluate(() => window.PoseAndLight.pose.root.y), f1 = await footOf(fr, 'R');
          const turned = (await turnBetween(fr, f0.q, f1.q)) * 180 / Math.PI;
          t.check(picked === 'root' && Math.abs(y1 - y0 - 50) < 1 && Math.abs(turned - 50) < 2 && !(await fr.evaluate(() => document.getElementById('undo').disabled)), 'Advanced: a tap on the hips picks the whole figure, and the hips dragged 100 px sideways turn it 50°, the feet with it', { picked, y0, y1, feet: +turned.toFixed(1) });
        }
        // with the rig hidden, a tap 15 px beside the thin hand still picks it
        await fr.evaluate(() => { window.PoseAndLight.pick(null); document.getElementById('showRig').click(); });
        await pick(fr, 'stand');
        const beside = await fr.evaluate(() => {
          const api = window.PoseAndLight, T = window.THREE, v = document.getElementById('view');
          const sc = (p) => { const q = p.clone().project(api.camera); return { x: (q.x + 1) / 2 * v.clientWidth, y: (1 - q.y) / 2 * v.clientHeight }; };
          const a = sc(api.worldPos('wristR')), e = sc(api.tipWorld('wristR')), m = { x: (a.x + e.x) / 2, y: (a.y + e.y) / 2 };
          const len = Math.hypot(e.x - a.x, e.y - a.y), nx = -(e.y - a.y) / len, ny = (e.x - a.x) / len;
          const out = Math.abs(m.x + nx * 15 - v.clientWidth / 2) > Math.abs(m.x - nx * 15 - v.clientWidth / 2) ? 1 : -1;      // away from the body
          const p = { x: m.x + out * nx * 15, y: m.y + out * ny * 15 };
          const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(p.x / v.clientWidth * 2 - 1, -(p.y / v.clientHeight) * 2 + 1), api.camera);
          return { p, onFigure: ray.intersectObjects(api.parts, false).length > 0 };
        });
        await page.mouse.click(b.x + beside.p.x, b.y + beside.p.y);
        const pickedBeside = await fr.evaluate(() => window.PoseAndLight.picked());
        await fr.evaluate(() => { document.getElementById('showRig').click(); window.PoseAndLight.pick(null); });
        t.check(!beside.onFigure && pickedBeside === 'wristR', 'with the rig controls hidden, a tap 15 px beside the right hand (off the figure) still picks the hand', { ...beside, picked: pickedBeside });
      }
      // the background dragged: the camera walks around (left 300 px is 120°), its height held between -8° and 80°
      {
        await fr.evaluate(() => { window.PoseAndLight.pick(null); document.getElementById('resetView').click(); });
        const st = () => fr.evaluate(() => { const api = window.PoseAndLight; api.render(); return { view: { ...api.view }, picked: api.picked(), hand: api.ctrls().find((c) => c.id === 'handR').center, lamp: document.getElementById('lampHandle').dataset.x + ',' + document.getElementById('lampHandle').dataset.y, camY: +api.camera.position.y.toFixed(3), undo: document.getElementById('undo').disabled, saved: localStorage.getItem('pose-and-light.v2') }; });
        const o0 = await st();
        await dragBy(page, fr, { x: 8, y: b.height - 8 }, -300, -600);
        const o1 = await st();
        await dragBy(page, fr, { x: 8, y: 8 }, 0, 600);
        const o2 = await st();
        const inView = await fr.evaluate(() => { const api = window.PoseAndLight; return ['ankleR', 'ankleL', 'wristR', 'wristL'].map((j) => api.worldPos(j)).concat([api.tipWorld('neck')]).every((w) => { const p = w.project(api.camera); return Math.abs(p.x) < 1 && Math.abs(p.y) < 1; }); });
        const sum = (o) => ({ view: o.view, picked: o.picked, camY: o.camY, lamp: o.lamp, hand: o.hand && [Math.round(o.hand.x), Math.round(o.hand.y)] });
        t.check(Math.abs(o1.view.az - o0.view.az - 120) < 0.5 && o1.view.el === -8 && o1.picked === null && o1.camY > 0.25 && o1.lamp !== o0.lamp && Math.hypot(o1.hand.x - o0.hand.x, o1.hand.y - o0.hand.y) > 20 && o1.undo === o0.undo && o1.saved === o0.saved, 'the background dragged 300 px left and 600 px up: the camera walks 120° around and down to its lowest (-8°), above the floor, the rig and the lamp\'s handle redrawn, nothing picked, nothing remembered', [sum(o0), sum(o1)]);
        t.check(o2.view.el === 80 && inView && o2.picked === null && o2.saved === o0.saved, 'and dragged 600 px down: the camera stops at 80° above, the figure still in view', { ...sum(o2), inView });
        await fr.evaluate(() => document.getElementById('resetView').click());
      }
      // the library opened and a pose picked in the middle of a drag: the pose picked stays as picked
      await pick(fr, 'stand');
      {
        const h = await ctrl(fr, 'handR');
        await page.mouse.move(b.x + h.center.x, b.y + h.center.y); await page.mouse.down(); await page.mouse.move(b.x + h.center.x - 50, b.y + h.center.y - 80, { steps: 2 });
        await fr.evaluate(() => document.getElementById('posesBtn').focus());
        await page.keyboard.press('Enter');
        const opened = await fr.evaluate(() => !document.getElementById('library').hidden);
        await fr.evaluate(() => document.querySelector('#poses .pose-btn[data-id="walk"]').click());
        const walk = await poseJson(fr);
        await page.mouse.move(b.x + h.center.x - 120, b.y + h.center.y - 150, { steps: 2 });         // the pointer still down moves on
        await page.mouse.up();
        const after = await fr.evaluate((walk) => ({ kept: JSON.stringify(window.PoseAndLight.pose) === walk, hipR: window.PoseAndLight.pose.hipR.x, dragging: document.getElementById('view').classList.contains('is-dragging'), sheet: document.getElementById('library').hidden }), walk);
        t.check(opened && after.hipR === -26 && !after.dragging && after.sheet, 'Poses opened by keyboard in the middle of a hand drag, Walk picked: the figure takes Walk and the drag ends with the pointer', { opened, ...after });
        t.check(after.kept, 'and Walk stays as picked while the pointer, still down, moves on', after);
        if (!after.kept) t.finding({ title: 'A drag in flight keeps posing the figure after a pose is picked from the library', severity: 'medium', steps: 'pose.html, Advanced, Stand. Hold a hand\'s circle and drag it a little; without letting go, open Poses (Tab to it and Enter, or a second finger on a tablet) and pick Walk; move the pointer (still down) and let go', expected: 'The library takes over: picking Walk ends the drag, and the figure stands in Walk as the library shows it', actual: 'Walk\'s right arm keeps following the pointer that started the drag before the library opened, and the changed Walk is remembered (saved as Where you left off, a step of its own in Undo)', cause: 'js/pose.js:1358-1367 openLibrary() makes the canvas inert but leaves `drag` and the canvas\'s pointer capture (js/pose.js:1938) in place, so pointermove (js/pose.js:1968-2000) goes on calling ctrlMove() on the new pose, and end() (js/pose.js:2008-2009) remembers it' });
      }
      await fr.evaluate((p) => { const api = window.PoseAndLight; api.setPose(JSON.parse(p)); api.pick(null); Object.assign(api.view, { az: 32, el: 8, dist: 5.2 }); api.placeCamera(); api.render(); }, keepPose);
      await clean(t, page, 'standalone: more of the rig');
      lap('more of the rig');
    }

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
    // Simple: the knee's diamond after a foot is dragged, the thigh tapped; the chest ring after the head is
    // tapped; the head then dragged by itself; Advanced shows every control
    {
      const shownCtrls = () => fr.evaluate(() => { window.PoseAndLight.render(); return window.PoseAndLight.ctrls().filter((c) => c.center).map((c) => c.id).sort().join(' '); });
      await tapBackground(page, fr);
      const fR = await ctrl(fr, 'footR');
      await dragBy(page, fr, fR.center, 10, 0);
      const afterFoot = await shownCtrls();
      await tapBackground(page, fr);
      const afterTap = await shownCtrls();
      t.check(afterFoot === 'footL footR handL handR kneeR pelvis' && afterTap === 'footL footR handL handR pelvis', 'Simple: the right knee\'s diamond (and no other) appears once the right foot is dragged, and goes when the background is tapped', { afterFoot, afterTap });
      const b = await fr.locator('#view').boundingBox();
      const thigh = await spotOn(fr, 'hipL');
      if (thigh) await page.mouse.click(b.x + thigh.x, b.y + thigh.y);
      const afterThigh = { picked: await fr.evaluate(() => window.PoseAndLight.picked()), shown: await shownCtrls() };
      t.check(afterThigh.picked === 'hipL' && afterThigh.shown === 'footL footR handL handR kneeL pelvis', 'Simple: a tap on the left thigh picks it and brings up the left knee\'s diamond', afterThigh);
      const head = await spotOn(fr, 'neck');
      if (head) await page.mouse.click(b.x + head.x, b.y + head.y);
      const afterHead = await fr.evaluate(() => ({ picked: window.PoseAndLight.picked(), name: document.getElementById('partName').textContent, outlines: window.PoseAndLight.outlines(), arrows: document.querySelectorAll('#arrows button').length }));
      afterHead.shown = await shownCtrls();
      t.check(afterHead.picked === 'neck' && afterHead.name === 'Head' && afterHead.outlines >= 1 && afterHead.arrows === 0 && afterHead.shown === 'footL footR handL handR pelvis torso', 'Simple: a tap on the head picks the Head, outlined, no arrows, and brings up the chest ring', afterHead);
      if (head) {
        const n0 = await fr.evaluate(() => JSON.stringify(window.PoseAndLight.pose.neck));
        await dragBy(page, fr, head, 80, 0);
        const dragged = await fr.evaluate(() => ({ neck: window.PoseAndLight.pose.neck, undo: !document.getElementById('undo').disabled, how: [...document.querySelectorAll('#partHow span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent.slice(0, 20)) }));
        t.check(JSON.stringify(dragged.neck) !== n0 && sane(await scan(fr)) && dragged.undo && dragged.how.length === 1 && /^Drag it to move it/.test(dragged.how[0]), 'Simple: the picked head dragged 80 px by itself turns the head, Undo on, the how-to saying to drag it', dragged);
      }
      await fr.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
      t.check((await shownCtrls()) === 'elbowL elbowR footL footR handL handR kneeL kneeR pelvis torso', 'Advanced shows every rig control whatever was touched', await shownCtrls());
      await fr.evaluate(() => { window.PoseAndLight.pick(null); document.querySelector('[data-mode="simple"]').click(); });
    }
    await fr.evaluate(() => { document.querySelector('[data-mode="advanced"]').click(); document.getElementById('showStand').click(); document.getElementById('showLamp').click(); document.getElementById('plantFeet').click(); document.querySelector('[data-mode="simple"]').click(); });
    t.check(await fr.evaluate(() => document.getElementById('showStand').checked && document.getElementById('showLamp').checked && document.getElementById('plantFeet').checked && !document.getElementById('lampHandle').hidden && window.PoseAndLight.stand.visible), 'back to Simple: the stand, the lamp and planted feet go back to their defaults');
    // and the Light settings and the value splits set in Advanced, whose menus Simple hides
    {
      await fr.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
      for (const [id, v] of [['lFill', 0], ['lDist', 4.6], ['lSoft', 10]]) await setRange(fr, id, v);
      await fr.evaluate(() => document.getElementById('lookValues').click());
      await setRange(fr, 't1', 60, false); await setRange(fr, 't2', 95, false);
      await fr.evaluate(() => document.querySelector('[data-mode="simple"]').click());
      const kept = await fr.evaluate(() => ({ dist: window.PoseAndLight.light.dist, soft: window.PoseAndLight.light.soft, fill: window.PoseAndLight.light.fill, t1: document.getElementById('t1').value, t2: document.getElementById('t2').value, splits: document.getElementById('splitSum').textContent, menus: ['lightMore', 'splitFields'].map((id) => getComputedStyle(document.getElementById(id)).display) }));
      const reset = t.check(kept.dist === 2.6 && kept.soft === 3 && kept.fill === 40 && kept.t1 === '30' && kept.t2 === '58' && kept.splits === 'V 3.0 / 5.8', 'back to Simple: the Light settings (Distance, Shadow edge, Room light) and the value splits, whose menus are hidden, go back to their defaults', kept);
      if (!reset) t.finding({ title: 'Simple keeps the Light settings and the value splits set in Advanced, with their controls hidden', severity: 'medium', steps: 'pose.html, Advanced: Light settings → Room light 0%, Distance 4.6 m, Shadow edge Very soft; See it as Dark, middle, light → Where the values split → V 6.0 / 9.5; then press Simple (the same with the app\'s own Simple switch while Pose and light is open)', expected: 'The README: in Simple "the Rig controls, Light settings, value splits and Show or hide menus are hidden (their options go back to their defaults)": Room light 40%, Distance 2.6 m, Shadow edge Medium, splits V 3.0 / 5.8', actual: `In Simple the lamp keeps Distance ${kept.dist} m, Shadow edge ${kept.soft} and Room light ${kept.fill}%, and the splits stay at ${kept.splits}, while their menus are hidden (${kept.menus.join(', ')}): a visitor in Simple is left with a near-black shadow side or a two-value picture and nothing on the page to put it back`, cause: 'js/pose.js:2073: setMode() puts back only showRig, plantFeet, showStand and showLamp; light.dist, light.soft, light.fill and the t1/t2 splits are left as they were' });
      for (const [id, v] of [['lFill', 40], ['lDist', 2.6], ['lSoft', 3]]) await setRange(fr, id, v);
      await setRange(fr, 't1', 30, false); await setRange(fr, 't2', 58, false);
      await fr.evaluate(() => document.getElementById('lookColor').click());
    }
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
    // the presets: 5° off is still the preset, 10° off is Your own; each lesson's own words; From below with the
    // lamp far; Undo after a slider
    {
      await setRange(fr, 'lDist', 2.6);
      await fr.evaluate(() => { document.querySelector('#lights .btn[data-id="rembrandt"]').click(); document.getElementById('lampHandle').focus(); });
      const named = () => fr.evaluate(() => ({ name: document.getElementById('lightName').textContent, pressed: [...document.querySelectorAll('#lights .btn[aria-pressed="true"]')].map((x) => x.dataset.id).join(), lesson: document.getElementById('lightLesson').textContent, az: window.PoseAndLight.light.az, el: window.PoseAndLight.light.el }));
      await page.keyboard.press('ArrowRight');
      const near = await named();
      await page.keyboard.press('ArrowRight');
      const own = await named();
      t.check(near.name === 'Rembrandt' && near.pressed === 'rembrandt' && own.name === 'Your own' && own.pressed === '' && /shadow side/.test(own.lesson) && /cast shadow/.test(own.lesson), 'the light 5° off Rembrandt is still Rembrandt, its chip pressed; 10° off it is Your own, with the lesson on the shadow side and the cast shadow', { near, own });
      const words = { front: /flat/, rembrandt: /high and to one side/, side: /terminator/, rim: /behind/, top: /straight above/, under: /spooky/ };
      const lessons = await fr.evaluate(() => window.PoseAndLight.LIGHTS.map((l) => { document.querySelector(`#lights .btn[data-id="${l.id}"]`).click(); return [l.id, document.getElementById('lightLesson').textContent]; }));
      t.check(lessons.length === 6 && lessons.every(([id, text]) => words[id] && words[id].test(text)), 'each preset\'s lesson says its own thing: Front flat, Rembrandt high and to one side, Side the terminator, Rim from behind, Top straight above, From below spooky', lessons);
      await setRange(fr, 'lDist', 4.6);
      await fr.evaluate(() => document.querySelector('#lights .btn[data-id="under"]').click());
      const below = await named();
      const belowOk = t.check(below.name === 'From below' && below.pressed === 'under' && /spooky/.test(below.lesson), 'From below with the lamp at 4.6 m: the light is named From below, its chip pressed, its lesson shown', below);
      if (!belowOk) t.finding({ title: 'From below with the lamp far away reads "Your own": its chip is not pressed and its lesson not shown', severity: 'medium', steps: 'pose.html, Advanced, Light settings → Distance 4.6 m (the far end of its slider), then press From below', expected: 'The light is named From below, its chip stays pressed and its lesson shows, as for every other preset at any distance', actual: `The lamp goes as low as it can at that distance (${below.el}° up rather than -14°), and the panel names it "${below.name}", no chip pressed, with the lesson "${below.lesson.slice(0, 60)}…"`, cause: 'js/pose.js:1029 reachable() raises the height to the lowest the lamp can reach at that distance, and js/pose.js:1033 names a preset only within 6° of its own height (-14°), so the preset just pressed is not found' });
      await fr.evaluate(() => { document.getElementById('undo').click(); document.getElementById('undo').click(); });
      const undone = await fr.evaluate(() => ({ dist: window.PoseAndLight.light.dist, slider: document.getElementById('lDist').value, out: document.getElementById('lDistOut').textContent }));
      t.check(undone.dist === 2.6 && undone.slider === '2.6' && undone.out === '2.6 m', 'Undo after the Distance slider: the light, the slider and its readout are back at 2.6 m', undone);
    }
    // the lamp's handle straight behind the figure, and behind the camera; the mouse wheel
    {
      const b = await fr.locator('#view').boundingBox();
      await fr.evaluate(() => { window.PoseAndLight.pick(null); document.getElementById('resetView').click(); });
      await setRange(fr, 'lAz', 180); await setRange(fr, 'lEl', 10);
      const behind = await fr.evaluate(() => { window.PoseAndLight.render(); const h = document.getElementById('lampHandle'), cs = getComputedStyle(h); return { x: +h.dataset.x, y: +h.dataset.y, behind: h.classList.contains('is-behind'), events: cs.pointerEvents, opacity: +cs.opacity }; });
      const l0 = await fr.evaluate(() => JSON.stringify(window.PoseAndLight.light));
      await page.mouse.click(b.x + behind.x, b.y + behind.y);
      const through = { picked: await fr.evaluate(() => window.PoseAndLight.picked()), lightKept: (await fr.evaluate(() => JSON.stringify(window.PoseAndLight.light))) === l0 };
      t.check(behind.behind && behind.events === 'none' && behind.opacity < 1 && !!through.picked && through.lightKept, 'the lamp straight behind the figure: its handle dims, and a tap on it goes through to the figure (a part picked, the light as it was)', { behind, through });
      await fr.evaluate(() => window.PoseAndLight.pick(null));
      const spot = await fr.evaluate(() => {
        const api = window.PoseAndLight, T = window.THREE, v = document.getElementById('view'), r = v.getBoundingClientRect(), h = document.getElementById('lampHandle'), ray = new T.Raycaster();
        api.render();
        for (const rad of [18, 22, 14]) for (let k = 0; k < 24; k++) {
          const x = +h.dataset.x + rad * Math.cos(k * Math.PI / 12), y = +h.dataset.y + rad * Math.sin(k * Math.PI / 12);
          ray.setFromCamera(new T.Vector2(x / v.clientWidth * 2 - 1, -(y / v.clientHeight) * 2 + 1), api.camera);
          if (!ray.intersectObjects(api.parts, false).length && !api.ctrlAt({ clientX: r.left + x, clientY: r.top + y })) return { x, y };
        }
        return null;
      });
      let swung = null;
      if (spot) { const az0 = await fr.evaluate(() => window.PoseAndLight.light.az); await dragBy(page, fr, spot, 60, 10); swung = { az0, az1: await fr.evaluate(() => window.PoseAndLight.light.az), picked: await fr.evaluate(() => window.PoseAndLight.picked()) }; }
      t.check(swung && swung.az1 !== swung.az0 && swung.picked === null, 'and a drag starting just beside the dimmed handle, off the figure, moves the light', { spot, swung });
      const bg = await backgroundSpot(fr);
      await page.mouse.move(b.x + bg.x, b.y + bg.y);
      await page.mouse.wheel(0, 2000);
      await fr.waitForFunction(() => window.PoseAndLight.view.dist === 5.3, null, { timeout: 3000 }).catch(() => null);
      const out = await fr.evaluate(() => window.PoseAndLight.view.dist);
      await page.mouse.wheel(0, -4000);
      await fr.waitForFunction(() => window.PoseAndLight.view.dist === 2, null, { timeout: 3000 }).catch(() => null);
      const inn = await fr.evaluate(() => window.PoseAndLight.view.dist);
      t.check(out === 5.3 && inn === 2, 'the mouse wheel zooms out to 5.3 m and in to 2 m, and no further', { out, inn });
      await setRange(fr, 'lDist', 4.6); await setRange(fr, 'lAz', 0); await setRange(fr, 'lEl', 10);
      const offView = await fr.evaluate(() => { window.PoseAndLight.render(); const h = document.getElementById('lampHandle'), v = document.getElementById('view'), x = +h.dataset.x, y = +h.dataset.y; return { x, y, w: v.clientWidth, h: v.clientHeight, off: h.classList.contains('is-off'), dashed: getComputedStyle(h).borderStyle, edge: x <= 26.5 || x >= v.clientWidth - 26.5 || y <= 26.5 || y >= v.clientHeight - 26.5 }; });
      const hb = await fr.locator('#lampHandle').boundingBox();
      const az0 = await fr.evaluate(() => window.PoseAndLight.light.az);
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2 + 30, { steps: 3 }); await page.mouse.up();
      const az1 = await fr.evaluate(() => window.PoseAndLight.light.az);
      t.check(offView.off && offView.dashed === 'dashed' && offView.edge && az1 !== az0 && (await scan(fr)).bad.length === 0, 'zoomed in with the lamp behind the camera: its handle waits dashed at the stage\'s edge, and dragging it still swings the light', { offView, az0, az1 });
      await fr.evaluate(() => document.getElementById('resetView').click());
      await setRange(fr, 'lDist', 2.6);
    }
    // the lamp lights the figure: the stage's own pixels, with the lamp's bulb and line and the stand put away
    {
      await fr.evaluate(() => { window.PoseAndLight.pick(null); document.getElementById('resetView').click(); document.getElementById('showLamp').click(); document.getElementById('showStand').click(); });
      const lit = await fr.evaluate(() => {
        const api = window.PoseAndLight, T = window.THREE, v = document.getElementById('view');
        const c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const g = c.getContext('2d', { willReadFrequently: true });
        const frame = () => { api.render(); g.clearRect(0, 0, c.width, c.height); g.drawImage(v, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
        const L = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const set = (az, el, fill = 40) => { api.light.az = az; api.light.el = el; api.light.fill = fill; api.lightChanged(false); };
        // the figure's pixels: the wood, lit all round from the front
        set(0, 12, 100);
        const d0 = frame(), mask = []; let sx = 0;
        for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const i = (y * c.width + x) * 4; if (d0[i] - d0[i + 2] > 30 && d0[i] > 60) { mask.push([x, i]); sx += x; } }
        const cx = sx / Math.max(1, mask.length);
        const halves = (d) => { let l = 0, nl = 0, r = 0, nr = 0; for (const [x, i] of mask) { if (x < cx) { l += L(d, i); nl++; } else { r += L(d, i); nr++; } } return { left: +(l / nl).toFixed(1), right: +(r / nr).toFixed(1), all: +((l + r) / (nl + nr)).toFixed(1) }; };
        const o = { n: mask.length };
        set(0, 12); o.front = halves(frame());
        set(90, 8); o.side = halves(frame());
        set(-90, 8); o.otherSide = halves(frame());
        set(160, 30); o.rim = halves(frame());
        set(90, 8, 0); o.dark = halves(frame());
        set(90, 8, 100); o.bright = halves(frame());
        // the floor under Top light: a spot in the arm's cast shadow against the spot as far in front of the lamp
        set(0, 82);
        const lz = api.lamp.position.z, dt = frame();
        const patch = (p) => { const q = new T.Vector3(...p).project(api.camera); const px = Math.round((q.x + 1) / 2 * c.width), py = Math.round((1 - q.y) / 2 * c.height); let s = 0, n = 0; for (let y = py - 3; y <= py + 3; y++) for (let x = px - 3; x <= px + 3; x++) { s += L(dt, (y * c.width + x) * 4); n++; } return +(s / n).toFixed(1); };
        o.top = { shadow: patch([0.36, 0, -0.18]), open: patch([0.36, 0, 2 * lz + 0.18]) };
        set(45, 30);
        return o;
      });
      await fr.evaluate(() => { document.getElementById('showLamp').click(); document.getElementById('showStand').click(); document.querySelector('#lights .btn[data-id="rembrandt"]').click(); });
      t.check(lit.n > 1000 && lit.side.right - lit.side.left > 20 && lit.otherSide.left - lit.otherSide.right > 20, 'the stage\'s pixels, Front view: Side light from the figure\'s left lights the half of the figure on that side, and moved to the other side it lights the other half', lit);
      t.check(lit.rim.all < lit.front.all - 40, 'Rim light from behind leaves the figure much darker than Front light', { front: lit.front, rim: lit.rim });
      t.check(lit.bright.left - lit.dark.left > 40, 'Room light 0% leaves the shadow side near black, 100% lifts it', { dark: lit.dark, bright: lit.bright });
      t.check(lit.top.open - lit.top.shadow > 40, 'Top light casts the figure\'s shadow on the floor: a spot under the arm much darker than a spot as far from the lamp in the open', lit.top);
    }
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
    // a snapshot in Gray and in Dark, middle, light, with a part picked: the look as on the stage, the picked
    // part's yellow outline, none of the rig's red and blue (the controls are drawn over the stage, not in it)
    {
      const snapLook = async (look) => {
        await fr.evaluate((look) => { const img = document.getElementById('snapImg'); img.removeAttribute('src'); document.getElementById(look).click(); document.getElementById('snap').click(); }, look);
        await fr.waitForFunction(() => { const i = document.getElementById('snapImg'); return i.src.startsWith('blob:') && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => null);
        const r = await fr.evaluate(() => {
          const img = document.getElementById('snapImg'), c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
          let n = 0, yellow = 0, other = 0; const bins = new Set(), others = [];
          for (let i = 0; i < d.length; i += 16) {
            n++; const r = d[i], gr = d[i + 1], bl = d[i + 2], mx = Math.max(r, gr, bl), mn = Math.min(r, gr, bl);
            if (mx - mn <= 8) { bins.add(Math.round(r / 16)); continue; }
            if (mx < 48) continue;          // (a near-black pixel's hue is noise: the outline's dark edge reads 24° there)
            let hue = mx === r ? 60 * (((gr - bl) / (mx - mn)) % 6) : mx === gr ? 60 * ((bl - r) / (mx - mn) + 2) : 60 * ((r - gr) / (mx - mn) + 4);
            if (hue < 0) hue += 360;
            if (hue >= 25 && hue <= 70) yellow++; else { other++; if (others.length < 4) others.push([r, gr, bl]); }
          }
          return { n, yellow, other, others, grays: bins.size, w: c.width, stage: document.getElementById('view').width };
        });
        await fr.evaluate(() => document.getElementById('snapClose').click());
        return r;
      };
      await fr.evaluate(() => { window.PoseAndLight.pick('shoulderR'); window.PoseAndLight.render(); });
      const arrowsUp = await fr.evaluate(() => document.querySelectorAll('#arrows button').length);
      const gray = await snapLook('lookGray');
      const three = await snapLook('lookValues');
      t.check(arrowsUp === 6 && gray.w === gray.stage && gray.yellow > 0 && gray.other === 0 && three.other === 0 && three.grays <= 3, 'Snapshot with the right upper arm picked, in Gray and in Dark, middle, light: gray (or three grays) but for the picked part\'s yellow outline, none of the rig\'s red or blue', { arrowsUp, gray, three });
      await fr.evaluate(() => { document.getElementById('lookColor').click(); window.PoseAndLight.pick(null); });
    }
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
    // with the storage still full, a change to the figure cannot be kept for next time (Where you left off)
    {
      await fr.evaluate(() => { for (const size of [1 << 16, 1 << 12, 1 << 8, 16, 1]) for (let i = 0; i < 4000; i++) { try { localStorage.setItem(`junkx${size}_${i}`, 'x'.repeat(size)); } catch (e) { break; } } });
      await pick(fr, 'run');
      const lost = await fr.evaluate(() => ({ figure: window.PoseAndLight.pose.hipR.x, stored: ((JSON.parse(localStorage.getItem('pose-and-light.v2') || '{}').pose || {}).hipR || {}).x, said: [...document.querySelectorAll('.rail, .stage-bar, #hint')].map((e) => e.innerText).join(' ').match(/[^.]*(storage|not (be )?kept|could not be (saved|kept))[^.]*/i) }));
      if (lost.stored === lost.figure) t.note('storage full: the pose picked after the store was refilled was still written (the store had room for it), so Where you left off under a full store was not seen');
      else {
        const says = t.check(!!lost.said, 'storage full: a pose that cannot be kept for next time (Where you left off) is said so on the page', lost);
        if (!says) t.finding({ title: 'With the storage full, Where you left off silently stops following the figure', severity: 'low', steps: 'pose.html with localStorage full (fill it with other keys until setItem throws), pick Run from Poses, then reload', expected: 'The page says the pose cannot be kept for next time (as Save this pose says "storage is full"), or the next visit does not offer an older pose as "Where you left off"', actual: `The figure is in Run (right thigh ${lost.figure}°) but the stored pose is still the one before (right thigh ${lost.stored}°), and nothing on the stage or the rail says so: after a reload "Where you left off" offers the older pose`, cause: 'js/pose.js:748: save() swallows the failed setItem with no word to the visitor' });
      }
    }
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
    // what is kept, as the README's privacy table says: three keys, the saved poses as angles and a view, no pictures
    {
      const kept = await fr2.evaluate(() => { const mine = JSON.parse(localStorage.getItem('pose-and-light.mine.v1')), v2 = JSON.parse(localStorage.getItem('pose-and-light.v2')); return { keys: Object.keys(localStorage).sort(), mineKeys: mine.map((m) => Object.keys(m).sort().join()), mineSize: mine.map((m) => JSON.stringify(m).length), v2Keys: Object.keys(v2).sort().join(), pictures: /data:|blob:/.test(localStorage.getItem('pose-and-light.mine.v1') + localStorage.getItem('pose-and-light.v2')) }; });
      t.check(kept.keys.join() === 'pose-and-light.mine.v1,pose-and-light.mode,pose-and-light.v2' && kept.mineKeys.every((k) => k === 'id,p,view') && kept.mineSize.every((n) => n < 2000) && kept.v2Keys === 'light,pose' && !kept.pictures, 'what the page keeps: exactly its three keys, each saved pose as an id, angles and a view (no picture), the pose and light where you left off', kept);
    }
    // the picture of Where you left off is of the pose left off (Walk), not of the standing figure
    {
      const [cont] = await looks(fr2, '#continue img'), [stand] = await looks(fr2, '#poses .pose-btn[data-id="stand"] img');     // (both drawn: waited for above)
      t.check(cont && stand && cont.wood >= 20 && differs(cont, stand) > 0.1, 'the Where you left off picture shows the pose left off (Walk), unlike the Stand picture', cont && stand && { differs: +differs(cont, stand).toFixed(3), wood: cont.wood });
    }
    await screenshot(page, 'pose-desktop');
    await clean(t, page, 'standalone: reload');
    // the window narrowed to a phone's while the page is open, with a part picked and the library open
    {
      await fr2.evaluate(() => { window.PoseAndLight.pick('shoulderR'); document.getElementById('posesBtn').click(); });
      await page.setViewportSize(PHONE);
      await fr2.waitForFunction(() => document.getElementById('view').width < 500, null, { timeout: 5000 }).catch(() => null);
      const narrow = await fr2.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), sh = document.getElementById('library').getBoundingClientRect(); return { cols: getComputedStyle(document.querySelector('.tool')).gridTemplateColumns.split(' ').length, stage: Math.round(st.height), vh: innerHeight, covers: sh.left <= st.left + 1 && sh.right >= st.right - 1 && sh.top <= st.top + 1 && sh.bottom >= st.bottom - 1 }; });
      await fr2.evaluate(() => document.getElementById('libClose').click());
      const placed = await fr2.evaluate(() => { window.PoseAndLight.render(); const v = document.getElementById('view'), w = v.clientWidth, h = v.clientHeight, hd = document.getElementById('lampHandle'); const ar = [...document.querySelectorAll('#arrows button')].map((x) => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(x.style.transform); return m ? [+m[1], +m[2]] : null; }); return { n: ar.length, inside: ar.every((a) => a && a[0] >= 22 && a[0] <= w - 22 && a[1] >= 22 && a[1] <= h - 22), handle: +hd.dataset.x >= 26 && +hd.dataset.x <= w - 26 && +hd.dataset.y >= 26 && +hd.dataset.y <= h - 26, canvas: v.width === w && w < 400 }; });
      const sideways = await hscroll(page);
      t.check(narrow.cols === 1 && Math.abs(narrow.stage - Math.max(340, narrow.vh * 0.64)) < 2 && narrow.covers && placed.n === 6 && placed.inside && placed.handle && placed.canvas && sideways <= 0, 'the page on its own narrowed to 390 wide while open: one column, the stage 64% of the window, the open library still over the whole stage, then the arrows and the lamp\'s handle on the redrawn stage, no sideways scroll', { narrow, placed, sideways });
      await page.setViewportSize(DESKTOP);
      await fr2.evaluate(() => window.PoseAndLight.pick(null));
      await clean(t, page, 'standalone: narrowed while open');
    }
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
    // every drawer open: the frame grows to fit, with no scroll bar of its own, and shrinks back when they close
    {
      const h0 = await settledHeight(page);
      const inner = () => fr.evaluate(() => ({ scroll: document.documentElement.scrollHeight, view: window.innerHeight }));
      await fr.evaluate(() => { ['lightMore', 'rigMore', 'showMore'].forEach((id) => { document.getElementById(id).open = true; }); document.getElementById('lookValues').click(); document.getElementById('splitFields').open = true; });
      await page.waitForFunction((h) => document.getElementById('poseFrame').style.height !== h, h0, { timeout: 3000 }).catch(() => null);
      const h1 = await settledHeight(page), open = await inner();
      await fr.evaluate(() => { ['lightMore', 'rigMore', 'showMore', 'splitFields'].forEach((id) => { document.getElementById(id).open = false; }); document.getElementById('lookColor').click(); });
      await page.waitForFunction((h) => document.getElementById('poseFrame').style.height !== h, h1, { timeout: 3000 }).catch(() => null);
      const h2 = await settledHeight(page), shut = await inner();
      t.check(parseInt(h1, 10) > parseInt(h0, 10) && open.scroll <= open.view && parseInt(h1, 10) >= open.scroll && h2 === h0 && shut.scroll <= shut.view, 'in the app, Light settings, Rig controls, Show or hide and the value splits all open: the frame grows to fit with no scroll bar of its own, and shrinks back when they close', { h0, h1, open, h2, shut });
    }
    // the frame's height and mode messages, hostile: a height is held to 6000 px, junk ignored; a mode from a
    // window other than the app is ignored, and the app's own junk mode means Simple
    {
      const frameH = () => page.evaluate(() => document.getElementById('poseFrame').style.height);
      const h0 = await settledHeight(page);
      await fr.evaluate(() => window.parent.postMessage({ type: 'pose-and-light:height', height: 1e9 }, '*'));
      await page.waitForFunction(() => document.getElementById('poseFrame').style.height === '6000px', null, { timeout: 3000 }).catch(() => null);
      const huge = await frameH();
      for (const v of ['abc', -5, 0, null, 'NaN', 'Infinity']) await fr.evaluate((v) => window.parent.postMessage({ type: 'pose-and-light:height', height: v }, '*'), v);
      await fr.evaluate(() => window.parent.postMessage({ type: 'pose-and-light:height', height: 1234 }, '*'));          // (messages arrive in order)
      await page.waitForFunction(() => document.getElementById('poseFrame').style.height === '1234px', null, { timeout: 3000 }).catch(() => null);
      const sane1234 = await frameH();
      await fr.evaluate(() => { document.getElementById('lightMore').open = true; });
      await page.waitForFunction(() => document.getElementById('poseFrame').style.height !== '1234px', null, { timeout: 3000 }).catch(() => null);
      await fr.evaluate(() => { document.getElementById('lightMore').open = false; });
      await page.waitForFunction((h) => document.getElementById('poseFrame').style.height === h, h0, { timeout: 3000 }).catch(() => null);
      const told = await frameH();
      t.check(huge === '6000px' && sane1234 === '1234px' && told === h0, 'a height of 1e9 from the frame is held to 6000 px, text, negative, zero, null, NaN and Infinity are ignored, and the page\'s own next height puts the frame right', { huge, sane1234, told, h0 });
      // (an ignored message changes nothing to wait for: a timer queued after it in the frame runs once it is handled)
      const self = await fr.evaluate(() => new Promise((r) => { window.postMessage({ type: 'pose-and-light:mode', mode: 'simple' }, '*'); setTimeout(() => r(window.PoseAndLight.mode()), 100); }));
      await page.evaluate(() => document.getElementById('poseFrame').contentWindow.postMessage({ type: 'pose-and-light:mode', mode: 42 }, '*'));
      await fr.waitForFunction(() => window.PoseAndLight.mode() === 'simple', null, { timeout: 3000 }).catch(() => null);
      const junk = await fr.evaluate(() => window.PoseAndLight.mode());
      await page.evaluate(() => document.querySelector('[data-mode="simple"]').click());
      await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
      await fr.waitForFunction(() => window.PoseAndLight.mode() === 'advanced', null, { timeout: 3000 }).catch(() => null);
      t.check(self === 'advanced' && junk === 'simple' && (await fr.evaluate(() => window.PoseAndLight.mode())) === 'advanced', 'a mode message the frame sends itself is ignored; the app\'s mode 42 means Simple; the app\'s own switch puts Advanced back', { self, junk });
    }
    // the app's switch to Simple: the Light settings and the value splits set in Advanced go back too
    {
      const set = (id, v) => fr.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, [id, v]);
      await set('lFill', 0); await set('lDist', 4.6); await fr.evaluate(() => document.getElementById('lookValues').click()); await set('t1', 60);
      await page.evaluate(() => document.querySelector('[data-mode="simple"]').click());
      await fr.waitForFunction(() => document.documentElement.classList.contains('simple'), null, { timeout: 3000 }).catch(() => null);
      const kept = await fr.evaluate(() => ({ dist: window.PoseAndLight.light.dist, fill: window.PoseAndLight.light.fill, splits: document.getElementById('splitSum').textContent }));
      t.check(kept.dist === 2.6 && kept.fill === 40 && kept.splits === 'V 3.0 / 5.8', 'in the app, its switch to Simple puts the Light settings and the value splits back to their defaults (see the finding on Simple)', kept);
      await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
      await fr.waitForFunction(() => !document.documentElement.classList.contains('simple'), null, { timeout: 3000 }).catch(() => null);
      await set('lFill', 40); await set('lDist', 2.6); await set('t1', 30); await set('t2', 58);
      await fr.evaluate(() => document.getElementById('lookColor').click());
    }
    // the mouse wheel over the stage zooms the figure and does not scroll the app's page
    {
      await page.evaluate(() => window.scrollTo(0, 0));
      const b = await fr.locator('#view').boundingBox();
      const bg = await backgroundSpot(fr);
      await page.mouse.move(b.x + bg.x, b.y + bg.y);
      await page.mouse.wheel(0, 600);
      await fr.waitForFunction(() => window.PoseAndLight.view.dist > 5.25, null, { timeout: 3000 }).catch(() => null);
      const wheel = { dist: await fr.evaluate(() => window.PoseAndLight.view.dist), scrolled: await page.evaluate(() => window.scrollY), room: await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight) };
      t.check(wheel.dist === 5.3 && wheel.scrolled === 0 && wheel.room > 0, 'in the app, the mouse wheel over the stage zooms the view and leaves the app\'s page where it was', wheel);
      await fr.evaluate(() => document.getElementById('resetView').click());
    }
    // an arrow held down while the tab is switched away, and let go there
    {
      await fr.evaluate(() => { window.PoseAndLight.pick('shoulderR'); window.PoseAndLight.render(); });
      const ab = await fr.locator('#arrows button').first().boundingBox();
      const x0 = await fr.evaluate(() => window.PoseAndLight.pose.shoulderR.x);
      await page.mouse.move(ab.x + 20, ab.y + 20); await page.mouse.down();
      await fr.waitForFunction((x0) => Math.abs(window.PoseAndLight.pose.shoulderR.x - x0) > 10, x0, { timeout: 6000 }).catch(() => null);     // held: past a tap's 6°
      await tab(page, 'study', { wait: false });
      await page.mouse.up();
      const atUp = await fr.evaluate(() => window.PoseAndLight.pose.shoulderR.x);
      await tab(page, 'pose', { wait: false });
      await fr.waitForFunction(() => document.getElementById('view').width > 800, null, { timeout: 8000 }).catch(() => null);
      // a hold still running turns it 70° a second: wait (at most 1.5 s) for it to move on
      await fr.waitForFunction((x) => Math.abs(window.PoseAndLight.pose.shoulderR.x - x) > 5, atUp, { timeout: 1500 }).catch(() => null);
      const later = await fr.evaluate(() => ({ x: window.PoseAndLight.pose.shoulderR.x, held: document.querySelectorAll('#arrows .is-held').length }));
      const stopped = t.check(later.held === 0 && Math.abs(later.x - atUp) < 3, 'an arrow held while the tab is switched away and let go there stops moving the arm', { atUp, later });
      if (!stopped) t.finding({ title: 'An arrow held while the tab is switched away keeps moving the part after it is let go', severity: 'medium', steps: 'Portrait Value Studio, Pose and light tab, Advanced: pick a part (the right upper arm), hold one of its yellow arrows, switch to another tab (Learning tools → Study the photo; a second finger on a tablet) and let go there; come back to Pose and light', expected: 'The arrow stops when it is let go, as it does on the stage: the arm is where it was at that moment, and the move is remembered', actual: `The arrow is still marked held (${later.held}) and the arm goes on turning (${atUp.toFixed(0)}° when let go, ${later.x.toFixed(0)}° half a second after coming back), on to the joint's limit; the move is not remembered until something rebuilds the arrows`, cause: 'js/pose.js:836-852: the hold stops only on the button\'s own pointerup, pointercancel or lostpointercapture; let go while the frame is hidden (display: none), none of them reaches the button, and the 30 ms interval (js/pose.js:847) keeps calling run()' });
      await fr.evaluate(() => window.PoseAndLight.pick(null));                // a rebuild lets any held arrow go
    }
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
    // the reference pictures themselves: the figure filling the picture with a little room all round, the joints
    // on it, the hips' true tilt; a render asked by a window other than the app is not answered
    {
      await page.evaluate(() => { window.__full = {}; window.addEventListener('message', (e) => { const d = e.data; if (e.source === document.getElementById('fig-render').contentWindow && d && d.type === 'pose-and-light:shot' && typeof d.req === 'string' && d.req.startsWith('x-')) window.__full[d.req] = d; }); });
      await fr.evaluate(() => window.parent.document.getElementById('fig-render').contentWindow.postMessage({ type: 'pose-and-light:render', req: 'x-stranger', id: 'stand', w: 200, h: 250 }, '*'));     // from the Pose tab's frame
      for (const id of ['stand', 'relaxed', 'jump']) await post({ type: 'pose-and-light:render', req: 'x-' + id, id, w: 600, h: 750 });
      await page.waitForFunction(() => window.__full['x-jump'], null, { timeout: 30000 }).catch(() => null);
      const ref = await page.evaluate(async () => {
        const out = { stranger: !!window.__full['x-stranger'] };
        for (const id of ['stand', 'relaxed', 'jump']) {
          const d = window.__full['x-' + id];
          const m = d && /^data:image\/jpeg;base64,(.*)$/.exec(d.url || '');
          if (!m) { out[id] = null; continue; }
          const bin = atob(m[1]), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));          // (no data: picture in this page's policy)
          const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
          const px = g.getImageData(0, 0, c.width, c.height).data, wood = (i) => px[i] - px[i + 2] > 40 && px[i] > 50;
          let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
          for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (wood((y * c.width + x) * 4)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
          const at = (k) => { const j = d.joints[k]; return wood((Math.round(j[1] * c.height) * c.width + Math.round(j[0] * c.width)) * 4); };
          const fy = (k) => (d.joints[k][1] * c.height - y0) / (y1 - y0);
          out[id] = { w: c.width, h: c.height, room: { left: +(x0 / c.width).toFixed(3), right: +(1 - x1 / c.width).toFixed(3), top: +(y0 / c.height).toFixed(3), bottom: +(1 - y1 / c.height).toFixed(3) }, onFigure: ['pelvis', 'chest', 'head'].every(at), head: +fy('head').toFixed(2), toes: [+fy('toeR').toFixed(2), +fy('toeL').toFixed(2)], tilts: d.tilts };
        }
        return out;
      });
      const framed = (r) => r && r.w === 600 && r.h === 750 && r.room.top >= 0.03 && r.room.top <= 0.1 && r.room.bottom >= 0.03 && r.room.bottom <= 0.1 && r.room.left >= 0.03 && r.room.right >= 0.03 && Math.abs(r.room.left - r.room.right) < 0.05 && r.onFigure;
      t.check(framed(ref.stand) && framed(ref.relaxed) && ref.stand.head <= 0.2 && ref.stand.toes.every((y) => y >= 0.85), 'the reference picture of Stand and of Weight on one leg (600 × 750): the figure fills its height with 3-10% room above and below, centred, the pelvis, chest and head joints on the figure, the head at its top, the toes at its bottom', { stand: ref.stand, relaxed: ref.relaxed });
      t.check(ref.stand && ref.relaxed && Number.isFinite(ref.stand.tilts.hips) && Math.abs(ref.stand.tilts.hips) < 1 && Math.abs(ref.stand.tilts.shoulders) < 1 && Math.abs(ref.relaxed.tilts.hips) > 2, 'the tilts the picture comes with are the pose\'s own: none for Stand, the hips tilted for Weight on one leg', { stand: ref.stand && ref.stand.tilts, relaxed: ref.relaxed && ref.relaxed.tilts });
      t.check(ref.jump && Object.values(ref.jump.room).every((v) => v >= 0.02) && ref.jump.onFigure, 'the reference picture of Jump, lifted off the floor: the whole figure inside the picture', ref.jump);
      t.check(!ref.stranger, 'a render asked by the Pose tab\'s frame (not the render frame\'s parent) is not answered', ref.stranger);
      // the render frame's WebGL context lost: a render is answered with an error at once; back, a picture again
      await rf.evaluate(() => { const v = document.getElementById('view'); const gl = v.getContext('webgl2') || v.getContext('webgl'); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
      await post({ type: 'pose-and-light:render', req: 'x-lost', id: 'walk', w: 300, h: 300 });
      await page.waitForFunction(() => window.__full['x-lost'], null, { timeout: 5000 }).catch(() => null);
      const lost = await page.evaluate(() => { const d = window.__full['x-lost']; return d && { error: d.error, url: !!d.url }; });
      await rf.evaluate(() => window.__lose.restoreContext());
      await rf.waitForFunction(() => { const v = document.getElementById('view'); const gl = v.getContext('webgl2') || v.getContext('webgl'); return gl && !gl.isContextLost(); }, null, { timeout: 5000 }).catch(() => null);
      await rf.evaluate(() => new Promise((r) => setTimeout(r, 100)));     // (the restored event follows the context coming back)
      await post({ type: 'pose-and-light:render', req: 'x-back', id: 'walk', w: 300, h: 300 });
      await page.waitForFunction(() => window.__full['x-back'], null, { timeout: 15000 }).catch(() => null);
      const back = await page.evaluate(() => { const d = window.__full['x-back']; return d && { error: !!d.error, url: (d.url || '').slice(0, 15), joints: !!d.joints }; });
      t.check(lost && lost.error === true && !lost.url && back && !back.error && back.url === 'data:image/jpeg' && back.joints, 'the render frame\'s WebGL context lost: a render is answered with an error and no picture; once the context is back, with a picture and its joints', { lost, back });
    }
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
    // a finger, not a mouse: a wobbly tap still picks, a drag poses, a tap on the background lets go, the lamp
    // follows, a second finger turns a pose into a pinch, and a swipe on the stage does not scroll the page
    {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      await fr.evaluate(() => { window.scrollTo(0, 0); window.__fingers = new Set(); document.getElementById('view').addEventListener('pointerdown', (e) => window.__fingers.add(e.pointerType)); });
      await pick(fr, 'stand');
      await fr.evaluate(() => window.PoseAndLight.pick(null));
      const b = await fr.locator('#view').boundingBox();
      const h = await ctrl(fr, 'handR');
      await touch('touchStart', [[b.x + h.center.x, b.y + h.center.y]]); await touch('touchMove', [[b.x + h.center.x + 5, b.y + h.center.y + 2]]); await touch('touchEnd', []);
      const wobble = await fr.evaluate(() => ({ picked: window.PoseAndLight.picked(), fingers: [...window.__fingers].join() }));
      t.check(wobble.picked === 'wristR' && wobble.fingers === 'touch', 'phone, a finger: a tap on the right hand\'s circle that wobbles 5 px still picks the hand (a finger is allowed more than a mouse)', wobble);
      const p0 = await poseJson(fr), y0 = await fr.evaluate(() => window.scrollY);
      const h2 = await ctrl(fr, 'handR');
      await touch('touchStart', [[b.x + h2.center.x, b.y + h2.center.y]]);
      for (let i = 1; i <= 3; i++) await touch('touchMove', [[b.x + h2.center.x - 25 * i, b.y + h2.center.y - 40 * i]]);
      await touch('touchEnd', []);
      const fingerDrag = { moved: (await poseJson(fr)) !== p0, s: await scan(fr), scrolled: (await fr.evaluate(() => window.scrollY)) - y0, undo: !(await fr.evaluate(() => document.getElementById('undo').disabled)) };
      t.check(fingerDrag.moved && sane(fingerDrag.s) && fingerDrag.scrolled === 0 && fingerDrag.undo, 'phone, a finger drags the right hand 120 px up: the arm follows, sane, Undo on, the page still', fingerDrag);
      const bg = await backgroundSpot(fr);
      await touch('touchStart', [[b.x + bg.x, b.y + bg.y]]); await touch('touchEnd', []);
      t.check((await fr.evaluate(() => window.PoseAndLight.picked())) === null, 'phone, a finger taps the background: the hand is let go');
      const l0 = await fr.evaluate(() => JSON.stringify(window.PoseAndLight.light));
      const hb = await fr.locator('#lampHandle').boundingBox();
      await touch('touchStart', [[hb.x + hb.width / 2, hb.y + hb.height / 2]]);
      for (let i = 1; i <= 3; i++) await touch('touchMove', [[hb.x + hb.width / 2 - 20 * i, hb.y + hb.height / 2 + 15 * i]]);
      await touch('touchEnd', []);
      t.check((await fr.evaluate(() => JSON.stringify(window.PoseAndLight.light))) !== l0 && (await scan(fr)).bad.length === 0, 'phone, a finger drags the lamp\'s handle: the light moves');
      // a second finger in the middle of a hand drag: the hand goes back, and the two fingers zoom
      const before = await poseJson(fr), dist0 = await fr.evaluate(() => window.PoseAndLight.view.dist);
      const hl = await ctrl(fr, 'handL'), f1 = [b.x + hl.center.x, b.y + hl.center.y];
      await touch('touchStart', [f1]);
      for (let i = 1; i <= 2; i++) await touch('touchMove', [[f1[0] + 20 * i, f1[1] - 30 * i]]);
      const mid = (await poseJson(fr)) !== before;
      const a = [f1[0] + 40, f1[1] - 60], c0 = [a[0] + 30, a[1] + 30];
      await touch('touchStart', [a, c0]);
      for (let i = 1; i <= 3; i++) await touch('touchMove', [[a[0] - 20 * i, a[1] - 20 * i], [c0[0] + 20 * i, c0[1] + 20 * i]]);
      await touch('touchEnd', []);
      const pinch = { movedMidway: mid, back: (await poseJson(fr)) === before, dist0, dist: await fr.evaluate(() => window.PoseAndLight.view.dist), dragging: await fr.evaluate(() => document.getElementById('view').classList.contains('is-dragging')) };
      t.check(pinch.movedMidway && pinch.back && pinch.dist < dist0 && pinch.dist >= 2 && !pinch.dragging, 'phone, a second finger in the middle of a hand drag: the hand goes back to where it was, the two fingers spread zoom in (no closer than 2 m), and both lifted end it', pinch);
      // a swipe up on the stage's background moves the view, not the page; the same swipe on the rail scrolls it
      const s0 = await fr.evaluate(() => window.scrollY);
      await touch('touchStart', [[b.x + 12, b.y + b.height - 40]]);
      for (let i = 1; i <= 4; i++) await touch('touchMove', [[b.x + 12, b.y + b.height - 40 - 50 * i]]);
      await touch('touchEnd', []);
      await fr.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const onStage = (await fr.evaluate(() => window.scrollY)) - s0;
      const rail = await fr.locator('.rail').boundingBox();
      const ry = Math.min(rail.y + 60, PHONE.height - 20);
      await touch('touchStart', [[PHONE.width / 2, ry]]);
      for (let i = 1; i <= 4; i++) await touch('touchMove', [[PHONE.width / 2, ry - 50 * i]]);
      await touch('touchEnd', []);
      await fr.waitForFunction((s0) => window.scrollY !== s0, s0, { timeout: 3000 }).catch(() => null);
      const onRail = (await fr.evaluate(() => window.scrollY)) - s0;
      t.check(onStage === 0 && onRail > 0, 'phone, a finger swiping up on the stage turns the view and leaves the page where it is (the same swipe on the rail scrolls it)', { onStage, onRail });
      await fr.evaluate(() => window.scrollTo(0, 0));
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await cdp.detach();
    }
    // two quick taps on Save this pose: two poses, each its own
    {
      await fr.click('#savePose'); await fr.click('#savePose');
      const two = await fr.evaluate(() => JSON.parse(localStorage.getItem('pose-and-light.mine.v1') || '[]').map((m) => m.id));
      t.check(two.length === 2 && two[0] !== two[1], 'two quick taps on Save this pose save two poses with ids of their own', two);
    }
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
    // seen as Dark, middle, light while the window goes to a phone's width and back: the value view redrawn at each size
    {
      const values = () => fr.evaluate(() => { window.PoseAndLight.render(); const v = document.getElementById('view'), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, bins = new Set(); let colored = 0; for (let i = 0; i < d.length; i += 64) { if (Math.abs(d[i] - d[i + 1]) > 6 || Math.abs(d[i + 1] - d[i + 2]) > 6) colored++; bins.add(Math.round(d[i] / 16)); } return { w: v.width, bins: bins.size, colored }; });
      await fr.evaluate(() => document.getElementById('lookValues').click());
      await page.setViewportSize(PHONE);
      await fr.waitForFunction(() => document.getElementById('view').width < 500, null, { timeout: 5000 }).catch(() => null);
      const small = await values();
      await page.setViewportSize(DESKTOP);
      await fr.waitForFunction(() => document.getElementById('view').width > 800, null, { timeout: 5000 }).catch(() => null);
      const wide = await values();
      t.check(small.w < 500 && wide.w > 800 && [small, wide].every((v) => v.bins >= 2 && v.bins <= 3 && v.colored === 0), 'in the app, Dark, middle, light kept through a resize to 390 wide and back: two or three grays at each size, nothing stretched to color', { small, wide });
      await fr.evaluate(() => document.getElementById('lookColor').click());
    }
    await clean(t, page, 'phone embed');
    await page.context().close();
    lap('both phone pages');
  }

  // ---- Hostile saved state for every key the page reads ---------------------------------------------
  const hostile = [
    ['v2 of the wrong types', { 'pose-and-light.v2': { pose: 'constructor', light: [45] } }, { cont: true }],
    // (in Advanced, where the light's options keep what was saved, clamped; Simple puts them back to their defaults)
    ['v2 with NaN strings, huge angles and prototype names', { 'pose-and-light.v2': { pose: { root: { x: 'NaN', y: '1e308', z: -1e308 }, height: 'NaN', shift: { x: '1e308', z: 'NaN' }, constructor: { x: 1 }, __proto__: { polluted: 1 }, hipR: 'str', kneeL: [1, 2], neck: { x: 'Infinity', y: true, z: null }, waist: { x: { y: 1 } } }, light: { az: '1e308', el: 'NaN', dist: 0, soft: -5, fill: '1e308', __proto__: { az: 7 } } }, 'pose-and-light.mode': 'advanced' }, { cont: false, rootY: 180, az: -180, dist: 1.6, soft: 0, fill: 100 }],
    ['the same v2 opened in Simple', { 'pose-and-light.v2': { pose: { root: { x: 'NaN', y: '1e308', z: -1e308 }, height: 'NaN', shift: { x: '1e308', z: 'NaN' }, constructor: { x: 1 }, __proto__: { polluted: 1 }, hipR: 'str', kneeL: [1, 2], neck: { x: 'Infinity', y: true, z: null }, waist: { x: { y: 1 } } }, light: { az: '1e308', el: 'NaN', dist: 0, soft: -5, fill: '1e308', __proto__: { az: 7 } } } }, { cont: false, rootY: 180, az: -180, dist: 2.6, soft: 3, fill: 40 }],
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

  // ---- Two Pose and light pages open at once (the app's and one on its own), then Forget my work -----------
  {
    const page = await openPage(site);
    await page.evaluate(() => localStorage.setItem('pose-and-light.mode', 'advanced'));      // the page on its own was left in Advanced
    await tab(page, 'pose');
    const A = poseFrame(page);
    const modeA = { frame: await A.evaluate(() => window.PoseAndLight.mode()), app: await page.evaluate(() => (document.body.classList.contains('mode-simple') ? 'simple' : 'advanced')) };
    t.check(modeA.frame === 'simple' && modeA.app === 'simple', 'in the app (Simple), the Pose frame is Simple, whatever the page on its own was left in (its key says Advanced)', modeA);
    await A.click('#poses .pose-btn[data-id="walk"]');
    await A.click('#savePose');
    const B = await newTab(site, page, { url: 'pose.html' });
    await B.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#mine .pose-btn').length === 1 && !document.getElementById('continueWrap').hidden, null, { timeout: 30000 }).catch(() => null);
    await B.evaluate(() => { document.querySelector('#poses .pose-btn[data-id="run"]').click(); document.getElementById('savePose').click(); });
    const ids = () => page.evaluate(() => JSON.parse(localStorage.getItem('pose-and-light.mine.v1') || '[]').map((m) => m.id));
    const afterB = await ids();
    await A.evaluate(() => { document.getElementById('posesBtn').click(); document.querySelector('#poses .pose-btn[data-id="sit"]').click(); document.getElementById('savePose').click(); });
    const afterA = await ids();
    const both = t.check(afterB.length === 2 && afterA.length === 3 && afterB.every((id) => afterA.includes(id)), 'Pose and light open twice (the app\'s tab and pose.html): a pose saved in one does not drop the pose saved in the other', { afterB, afterA });
    if (!both) t.finding({ title: 'With Pose and light open twice, saving a pose in one throws away the pose saved in the other', severity: 'high', steps: '(1) In the app\'s Pose and light tab pick Walk and press Save this pose. (2) Open pose.html in another tab of the same browser (Your poses lists Walk); pick Run and press Save this pose. (3) Back in the app\'s tab pick Sit and press Save this pose. Reload either page and open Poses', expected: 'Your poses holds Walk, Run and Sit: each Save said "Saved in the pose library"', actual: `Your poses holds ${afterA.length}: Run, saved in the second page, is gone from the store (ids after step 2: ${afterB.join(', ')}; after step 3: ${afterA.join(', ')}).`, cause: 'js/pose.js:1288-1292 reads the saved poses once, when the page opens, and keepMine() (js/pose.js:1296) writes that list back whole on every save or removal; nothing reads the store again when another page has changed it (the only storage listener, js/pose.js:747, is for Forget)' });
    // Forget my work on this device, pressed in the app's Help: both pages start over with nothing kept
    await tab(page, 'help', { wait: false });
    const reloads = Promise.all([page.waitForNavigation({ timeout: 15000 }).then(() => true, () => false), B.waitForNavigation({ timeout: 15000 }).then(() => true, () => false)]);
    await page.evaluate(() => { const f = document.getElementById('forgetBtn'); f.click(); f.click(); });
    const [aReloaded, bReloaded] = await reloads;
    await B.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses .pose-btn').length === 30, null, { timeout: 30000 }).catch(() => null);
    const bAfter = await B.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => k.startsWith('pose-and-light.')), start: document.getElementById('library').classList.contains('is-start'), cont: document.getElementById('continueWrap').hidden, mine: document.getElementById('mineWrap').hidden, mode: window.PoseAndLight.mode(), hipR: window.PoseAndLight.pose.hipR.x }));
    t.check(aReloaded && bReloaded && bAfter.keys.length === 0 && bAfter.start && bAfter.cont && bAfter.mine && bAfter.mode === 'simple' && bAfter.hipR === 0, 'Forget my work, pressed in the app with pose.html open in another tab: both reload, no pose-and-light. key is left, and pose.html opens on its start screen with no Where you left off, no saved poses, in Simple', { aReloaded, bReloaded, ...bAfter });
    await tab(page, 'pose', { wait: false });
    let A2 = null;
    for (let i = 0; i < 40 && !A2; i++) { A2 = poseFrame(page); if (!A2) await sleep(250); }
    if (A2) await A2.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses .pose-btn').length === 30, null, { timeout: 30000 }).catch(() => null);
    const aAfter = A2 && await A2.evaluate(() => ({ start: document.getElementById('library').classList.contains('is-start'), cont: document.getElementById('continueWrap').hidden, mine: document.getElementById('mineWrap').hidden, hipR: window.PoseAndLight.pose.hipR.x }));
    t.check(aAfter && aAfter.start && aAfter.cont && aAfter.mine && aAfter.hipR === 0, 'and the app\'s Pose and light, opened again after Forget: the start screen with nothing from before', aAfter);
    await B.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    const bKeys = await B.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pose-and-light.')).sort());
    t.check(bKeys.join() === 'pose-and-light.mode', 'after Forget, Advanced pressed on pose.html keeps only that choice: none of the poses from before comes back', bKeys);
    await clean(t, page, 'Forget with two pages: the app');
    await clean(t, B, 'Forget with two pages: pose.html');
    await page.context().close();
    lap('two pages and Forget');
  }

  // ---- WebGL turned off (three.js loads, the context does not): the page's own panel; Figure study told at once
  {
    const page = await openPage(site);
    await page.context().addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : get.call(this, type, ...rest); }; });
    await page.reload({ waitUntil: 'load' });
    await tab(page, 'pose', { wait: false });
    await page.waitForFunction(() => { const d = document.getElementById('poseFrame').contentDocument; return !!d && !!d.getElementById('fail') && !d.getElementById('fail').hidden; }, null, { timeout: 10000 }).catch(() => null);
    const fr = poseFrame(page);
    const panel = () => ({ panel: !document.getElementById('fail').hidden, text: document.getElementById('fail').textContent, failed: document.documentElement.classList.contains('failed'), rail: getComputedStyle(document.querySelector('.rail')).display, bar: getComputedStyle(document.querySelector('.stage-bar')).display, top: getComputedStyle(document.querySelector('.top')).display, hint: document.getElementById('hint').hidden });
    const inApp = fr && await fr.evaluate(panel);
    t.check(inApp && inApp.panel && /WebGL turned off/.test(inApp.text) && inApp.failed && inApp.rail === 'none' && inApp.bar === 'none' && inApp.hint, 'WebGL off: the Pose tab says the 3D view could not start (WebGL turned off), with no controls left that would do nothing', inApp);
    await tab(page, 'figure', { wait: false });
    const t0 = Date.now();
    await page.waitForFunction(() => /could not be drawn/.test(document.getElementById('fig-libNote').textContent), null, { timeout: 30000 }).catch(() => null);
    const fig = { ms: Date.now() - t0, note: await page.evaluate(() => document.getElementById('fig-libNote').textContent.slice(0, 50)), start: await page.evaluate(() => document.getElementById('fig-start').disabled) };
    t.check(/could not be drawn/.test(fig.note) && fig.start && fig.ms < 5000, 'WebGL off: Figure study says at once (not after its 25 s wait) that the poses could not be drawn, with Start off', fig);
    const own = await newTab(site, page, { url: 'pose.html' });
    await own.waitForFunction(() => !document.getElementById('fail').hidden, null, { timeout: 10000 }).catch(() => null);
    const alone = await own.evaluate(panel);
    t.check(alone.panel && alone.top !== 'none' && alone.rail === 'none', 'WebGL off, pose.html on its own: the same panel, under its header', alone);
    const errors = [...page.log.console, ...own.log.console];
    if (errors.length && errors.every((e) => /THREE\.WebGLRenderer: Error creating WebGL context/.test(e))) t.finding({ title: 'With WebGL turned off, Pose and light writes an error to the console', severity: 'low', steps: 'Open pose.html, or the app\'s Pose and light tab, in a browser whose WebGL is off (Chromium with --disable-webgl: canvas.getContext("webgl") returns null)', expected: 'The page\'s own panel says the 3D view could not start, and nothing else goes wrong: no console error (every page of the site is held to none)', actual: `Each page that tries (${errors.length} here: the app's frame, its picture frame, pose.html) logs "${errors[0]}"`, cause: 'js/pose.js:42-44 finds out by constructing THREE.WebGLRenderer, and three.min.js logs the failure with console.error before throwing; asking canvas.getContext("webgl2") || canvas.getContext("webgl") first (and calling fail() on null) would say the same without the error' });
    await clean(t, page, 'WebGL off: the app');
    await clean(t, own, 'WebGL off: pose.html on its own');
    await page.context().close();
    lap('WebGL off');
  }

  // ---- pose.html with site data blocked (localStorage throws), on a phone drawing at twice its pixels, in dark
  //      mode; axe-core on the start screen, with a part's arrows up, and on the snapshot (the app's axe run never
  //      enters the frame) ----------------------------------------------------------------------------------------
  {
    const page = await openPage(site, { url: 'pose.html', viewport: PHONE, dark: true, bypassCSP: true });
    await page.context().addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: PHONE.width, height: PHONE.height, deviceScaleFactor: 2, mobile: false });
    await page.reload({ waitUntil: 'load' });
    const fr = page.mainFrame();
    await up(fr);
    const opened = await fr.evaluate(() => { let blocked = false; try { window.localStorage; } catch (e) { blocked = true; } const v = document.getElementById('view'); return { blocked, started: !!window.__poseStarted, imgs: document.querySelectorAll('#poses .pose-btn.has-img').length, simple: document.documentElement.classList.contains('simple'), start: document.getElementById('library').classList.contains('is-start'), cont: document.getElementById('continueWrap').hidden, w: v.width, cw: v.clientWidth, dpr: window.devicePixelRatio, ground: getComputedStyle(document.body).backgroundColor }; });
    t.check(opened.blocked && opened.started && opened.imgs === 30 && opened.simple && opened.start && opened.cont, 'site data blocked: pose.html starts all the same, its 30 pictures drawn, Simple, the start screen with nothing from last time', opened);
    t.check(opened.dpr === 2 && opened.w === opened.cw * 2 && opened.ground === 'rgb(21, 32, 25)', 'a phone at twice its pixels, in dark mode: the stage drawn at twice its size, the page on its dark ground', opened);
    const serious = (v) => v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
    const axeStart = serious(await axe(page));
    // Tab past the last pose of the start screen goes to the browser, not to a control behind the sheet
    await fr.evaluate(() => { const b = [...document.querySelectorAll('#library .pose-btn')]; b[b.length - 1].focus(); });
    await page.keyboard.press('Tab');
    const past = await fr.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, id: a.id, behind: !!a.closest('.rail, .stage-bar') || a.id === 'view' || a.id === 'lampHandle' }; });
    t.check(axeStart.length === 0 && !past.behind, 'the start screen: no serious axe-core violation, and Tab past its last pose does not reach the controls behind it', { axeStart, past });
    await pick(fr, 'stand');
    await fr.evaluate(() => document.getElementById('savePose').click());
    const saved = await fr.evaluate(() => ({ btn: document.getElementById('savePose').textContent, note: (document.getElementById('posesBtn').click(), document.getElementById('libNote').textContent), mine: document.querySelectorAll('#mine .pose-btn').length }));
    await fr.evaluate(() => document.getElementById('libClose').click());
    t.check(saved.mine === 1 && /visit only/.test(saved.btn), 'site data blocked: Save this pose keeps the pose for the visit, and says so', saved);
    const says = t.check(!/full/i.test(saved.btn + ' ' + saved.note) && !/Remove a saved pose/.test(saved.note), 'site data blocked: the page does not blame a full storage or ask for a saved pose to be removed', saved);
    if (!says) t.finding({ title: 'With site data blocked, Save this pose says the storage is full and asks for a pose to be removed', severity: 'low', steps: 'Open pose.html in a browser that blocks site data for it (localStorage throws SecurityError on access: cookies and site data blocked), pick a pose, press Save this pose, open Poses', expected: 'The page says the pose is kept for this visit only because this browser does not let the site keep it', actual: `The button says "${saved.btn}" and the library "${saved.note}": removing a saved pose cannot help, nothing is stored at all`, cause: 'js/pose.js:1296: keepMine() takes any failed write for a full storage, and js/pose.js:1348 says so on the button' });
    await fr.evaluate(() => { document.querySelector('[data-mode="advanced"]').click(); window.PoseAndLight.pick('shoulderR'); window.PoseAndLight.render(); });
    const adv = await fr.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return { mode: window.PoseAndLight.mode(), arrows: [...document.querySelectorAll('#arrows button')].filter((b) => { const r = b.getBoundingClientRect(); return r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom; }).length }; });
    const axeAdv = serious(await axe(page));
    t.check(adv.mode === 'advanced' && adv.arrows === 6 && axeAdv.length === 0, 'site data blocked, Advanced: the switch works, a part\'s six arrows on the stage, no serious axe-core violation', { adv, axeAdv });
    await fr.evaluate(() => document.getElementById('snap').click());
    await fr.waitForFunction(() => document.getElementById('snapImg').naturalWidth > 0, null, { timeout: 8000 }).catch(() => null);
    const snap = await fr.evaluate(() => ({ w: document.getElementById('snapImg').naturalWidth, stage: document.getElementById('view').width, shown: document.getElementById('snapImg').getBoundingClientRect().width, window: window.innerWidth }));
    const axeSnap = await fr.evaluate(() => window.axe.run(document.getElementById('snapDialog'), { resultTypes: ['violations'] }).then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)));
    t.check(snap.w === snap.stage && snap.shown <= snap.window && axeSnap.length === 0, 'Snapshot at twice the pixels: the picture as large as the stage is drawn, shown within the window, its dialog with no serious axe-core violation', { snap, axeSnap });
    await fr.evaluate(() => document.getElementById('snapClose').click());
    await clean(t, page, 'site data blocked, twice the pixels, dark');
    await page.context().close();
    lap('site data blocked, twice the pixels, dark');
  }

  // ---- README "Pose and light": three.js r128 self-hosted with its licence beside it; the rig's colours (right red, left blue,
  //      the body amber); "Copy to the other side mirrors it" on a whole leg; a Start over pressed with a hand's drag still down ----
  {
    const page = await openPage(site, { url: 'pose.html' });
    const fr = page.mainFrame();
    await up(fr);
    const lib = await fr.evaluate(() => ({ revision: window.THREE && window.THREE.REVISION, src: [...document.scripts].map((s) => s.getAttribute('src')).filter(Boolean) }));
    const licence = (() => { try { return /MIT License/.test(fs.readFileSync(path.join(ROOT, 'js', 'vendor', 'LICENSE-three.txt'), 'utf8')); } catch (e) { return false; } })();
    t.check(lib.revision === '128' && lib.src.includes('js/vendor/three.min.js') && licence, 'three.js is r128, self-hosted at js/vendor/three.min.js, with its MIT licence beside it', { revision: lib.revision, licence, src: lib.src });
    await fr.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    const cols = await fr.evaluate(() => { const c = {}; document.querySelectorAll('#rig path.over:not(.back)').forEach((p) => { const k = p.style.stroke || 'none'; c[k] = (c[k] || 0) + 1; }); return c; });
    t.check(cols['rgb(255, 93, 82)'] === 4 && cols['rgb(89, 176, 255)'] === 4 && cols['rgb(255, 179, 64)'] === 2 && Object.keys(cols).length === 3, 'the rig in Advanced: the right side\'s four controls red, the left side\'s four blue, the chest ring and the hips amber', cols);
    // Copy to the other side on a whole leg (the thigh picked, so its shin and foot go with it), on Kneel
    await pick(fr, 'kneel');
    await fr.evaluate(() => window.PoseAndLight.pick('hipR'));
    const mirrorShown = await fr.evaluate(() => !document.getElementById('mirror').hidden);
    await fr.evaluate(() => document.getElementById('mirror').click());
    const cp = await fr.evaluate(() => {
      const api = window.PoseAndLight, P = api.pose, same = (a, b) => ['x', 'y', 'z'].every((k) => Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-6);
      const m = (j) => ({ x: P[j + 'R'].x, y: -P[j + 'R'].y, z: -P[j + 'R'].z });
      return { hip: same(P.hipL, m('hip')), knee: same(P.kneeL, m('knee')), ankle: same(P.ankleL, m('ankle')), kneeY: [+api.worldPos('kneeR').y.toFixed(3), +api.worldPos('kneeL').y.toFixed(3)] };
    });
    const sc = await scan(fr);
    t.check(mirrorShown && cp.hip && cp.knee && cp.ankle && sane(sc, 0.02), 'Copy to the other side on a whole leg (Kneel, the right thigh picked): the left thigh, shin and foot take the right\'s, mirrored, and the figure stays on the floor', { mirrorShown, cp, sc });
    // a Start over pressed by keyboard while a hand is dragged with the mouse still down: the start screen opens and the pointer
    // that is still down moves nothing (the figure stays as Start over left it)
    await pick(fr, 'stand');
    const box = await fr.locator('#view').boundingBox();
    const h = await ctrl(fr, 'handR');
    await page.mouse.move(box.x + h.center.x, box.y + h.center.y); await page.mouse.down();
    await page.mouse.move(box.x + h.center.x - 50, box.y + h.center.y - 80, { steps: 2 });
    await fr.evaluate(() => document.getElementById('resetAll').focus());
    await page.keyboard.press('Enter');
    const atStart = await poseJson(fr);
    const libUp = await fr.evaluate(() => !document.getElementById('library').hidden);
    await page.mouse.move(box.x + h.center.x - 120, box.y + h.center.y - 150, { steps: 3 });
    await page.mouse.move(box.x + h.center.x - 200, box.y + h.center.y - 20, { steps: 3 });
    const afterMove = await poseJson(fr);
    const dragging = await fr.evaluate(() => document.getElementById('view').classList.contains('is-dragging'));
    await page.mouse.up();
    t.check(libUp && afterMove === atStart && !dragging, 'Start over pressed by keyboard in the middle of a hand drag (the mouse still down): the start screen opens and the pointer moves nothing', { libUp, moved: afterMove !== atStart, dragging });
    await clean(t, page, 'three.js, the rig colours, a whole leg, Start over mid-drag');
    await page.context().close();
    lap('three.js, colours, whole leg, Start over');
  }

  // ---- a saved state with 20,000 extra keys, and a saved pose whose id is 'continue' (the id Where you left off uses) ----
  {
    const seedPage = await openPage(site, { url: 'pose.html' });
    const seedFr = seedPage.mainFrame();
    await up(seedFr);
    await pick(seedFr, 'walk');
    const seed = await seedFr.evaluate(() => ({ v2: localStorage.getItem('pose-and-light.v2'), p: JSON.parse(JSON.stringify(window.PoseAndLight.pose)) }));
    await seedPage.context().close();
    const v2 = JSON.parse(seed.v2 || 'null') || {};
    for (let i = 0; i < 20000; i++) v2['junk' + i] = i;
    const page = await openPage(site, { url: 'pose.html', storage: { 'pose-and-light.v2': v2, 'pose-and-light.mine.v1': [{ id: 'continue', name: 'Odd id', p: seed.p }] } });
    const fr = page.mainFrame();
    const started = await fr.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30, null, { timeout: 40000 }).then(() => true).catch(() => false);
    const st = await fr.evaluate(() => ({ imgs: document.querySelectorAll('#poses button.has-img').length, mine: document.querySelectorAll('#mine .pose-btn').length, cont: !document.getElementById('continueWrap').hidden, lib: !document.getElementById('library').hidden }));
    t.check(started && st.imgs === 30 && st.mine === 1 && st.cont && st.lib, 'a saved state with 20,000 extra keys still starts: 30 pictures, the saved pose and Where you left off on the start screen', { started, ...st });
    await fr.evaluate(() => document.querySelector('#mine .pose-btn').click());
    const after = await fr.evaluate(() => ({ lib: !document.getElementById('library').hidden }));
    const sc = await scan(fr);
    t.check(!after.lib && sane(sc, 0.45), 'the saved pose whose id is continue picks: the sheet closes and the figure is sane', { after, sc });
    await clean(t, page, 'hostile saved state: 20,000 keys, an id of continue');
    await page.context().close();
    lap('20,000 keys, id continue');
  }
  t.note('Round 2, the gaps the last round left open. Driven now: a whole leg copied on Kneel; Start over pressed by keyboard in the middle of a hand drag (a probe also pressed Undo and opened Poses in the middle of a hand or knee drag, and the figure stayed where the drag left it after each, with the pointer still down); the rig colours; three.js r128 with its licence; a saved state with 20,000 extra keys and a saved pose whose id is continue. Left out with reasons: 36 (pose.html?render=1 and ?embed=1 opened at the top): render mode needs a frame (js/pose.js:17, window.parent !== window), so a top-level ?render=1 is the page itself, by design; embed is the app\'s own frame, and the README describes it framed; 37 (sixty renders at different sizes): not run, each render target is up to 2400 × 3000 in SwiftShader memory on a machine shared with other runs; the leak the code suggests (shotTargets is never disposed, js/pose.js:1081 and 1145) is read in code only, not measured here; 10 at phone width, 25 (Tab order after the sheet closes) and 35 (the standalone mode switch during a held arrow): not run for the time budget; 39 (two saves in one millisecond): replaced by two quick taps, pinned above. Also noted: a saved pose whose id is a library pose\'s (stand, or continue) is marked on the figure as well (the Pose and light case\'s note above; ids the page makes itself never collide).');
}
