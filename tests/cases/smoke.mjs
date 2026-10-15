// The critical path, as the launch plan's Phase 3 asks: every tab at two widths, every hash route, a photo
// by file input, a text drop, Pose and light, Figure study, the Studio's autosave, Forget, each script
// missing, three.js missing, the app inside another site's sandboxed frame, opened from disk, a lost
// WebGL context, axe on every tab, and the transfer sizes.
import zlib from 'node:zlib';
import { openPage, clean, tab, TABS, DESKTOP, PHONE, poseFrame, stroke, inked, storageKeys, click, text, visible, hscroll, screenshot, sleep, makeImage, loadPhoto, dropText, axe, ROOT } from '../lib.mjs';

export default async function smoke(t, site) {
  // every tab, both widths
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const page = await openPage(site, { viewport });
    for (const name of TABS) {
      await tab(page, name);
      t.check((await hscroll(page)) <= 0, `${label} ${name}: no horizontal scroll`, await hscroll(page));
      await screenshot(page, `${label}-${name}`);
    }
    const pf = poseFrame(page);
    const ps = pf ? await pf.evaluate(() => ({ started: !!window.__poseStarted, imgs: document.querySelectorAll('#poses button.has-img').length, blob: [...document.querySelectorAll('#poses img')].every((i) => i.src.startsWith('blob:')), fail: !document.getElementById('fail').hidden, embed: document.documentElement.classList.contains('embed') })) : null;
    t.check(ps && ps.started && ps.imgs === 30 && ps.blob && !ps.fail && ps.embed, `${label}: Pose frame up, 30 Blob pictures`, ps);
    t.check(/^\d+px$/.test(await page.evaluate(() => document.getElementById('poseFrame').style.height)), `${label}: Pose frame sized by its page`);
    const fig = await page.evaluate(() => ({ poses: document.querySelectorAll('#tab-figure [data-pose-id]').length, imgs: [...document.querySelectorAll('#tab-figure [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length, start: document.getElementById('fig-start').disabled }));
    t.check(fig.poses === 30 && fig.imgs === 30 && !fig.start, `${label}: Figure study has 30 poses with pictures, Start enabled`, fig);
    await clean(t, page, `${label} tabs`);
    await page.context().close();
  }

  // hash routes, a wrong one included
  for (const h of ['#check', '#game', '#paint', '#help', '#loomis', '#pose', '#figure', '#battle', '#nonsense']) {
    const page = await openPage(site, { url: h });
    const shown = await page.evaluate(() => [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id));
    const want = { '#check': 'tab-study', '#nonsense': 'tab-study' }[h] || 'tab-' + h.slice(1);
    t.check(shown.length === 1 && shown[0] === want, `route ${h} opens ${want}`, shown);
    if (h === '#check') t.check(await page.evaluate(() => document.getElementById('drawer-check').open === true), 'route #check opens the check drawer');
    if (h === '#pose' || h === '#figure') await sleep(5000);
    await clean(t, page, `route ${h}`);
    await page.context().close();
  }

  // a photo by file input, a text drop and a URL drop that must not navigate
  {
    const page = await openPage(site);
    const before = await page.evaluate(() => document.querySelector('#tab-study canvas') && document.querySelector('#tab-study canvas').toDataURL().length);
    await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg' }));
    const after = await page.evaluate(() => document.querySelector('#tab-study canvas') && document.querySelector('#tab-study canvas').toDataURL().length);
    t.check(before !== after, 'a photo from the file input redraws the study', { before, after });
    const url = page.url();
    await dropText(page, 'body', 'https://example.com/photo.jpg', 'https://example.com/photo.jpg');
    await sleep(800);
    t.check(page.url() === url, 'a dropped URL does not navigate the page', page.url());
    t.check(/photo|link|drag|drop/i.test(await text(page, '#toast') || ''), 'a dropped URL gets a hint', await text(page, '#toast'));
    await clean(t, page, 'photo and drops');
    await page.context().close();
  }

  // Pose and light on its own: lessons, arrows, a saved pose that survives a reload
  {
    const page = await openPage(site, { url: 'pose.html' });
    await page.waitForFunction(() => window.__poseStarted && document.querySelectorAll('#poses button.has-img').length >= 30, null, { timeout: 30000 }).catch(() => null);
    const s = await page.evaluate(() => { const api = window.PoseAndLight; const r = { imgs: document.querySelectorAll('#poses button.has-img').length, bold: document.querySelectorAll('#lightLesson b').length, lesson: document.getElementById('lightLesson').textContent.length, api: !!api }; if (api) { api.setMode('advanced', false); api.pick('shoulderR'); r.arrows = document.querySelectorAll('#arrows button svg').length; } return r; });
    t.check(s.imgs === 30 && s.bold >= 1 && s.lesson > 20 && s.api && s.arrows >= 4, 'pose.html alone: pictures, lesson with bold runs, arrows as SVG', s);
    await page.evaluate(() => { document.getElementById('libClose').click(); document.getElementById('savePose').click(); });
    t.check(/Saved/.test(await text(page, '#savePose')), 'Save this pose says saved', await text(page, '#savePose'));
    await page.reload({ waitUntil: 'load' }); await sleep(3000);
    const mine = await page.evaluate(() => document.querySelectorAll('#mine button.pose-btn').length);
    t.check(mine === 1, 'the saved pose is back after a reload', mine);
    t.check((await storageKeys(page)).every((k) => k.startsWith('pose-and-light.')), 'pose.html writes only pose-and-light. keys', await storageKeys(page));
    await clean(t, page, 'pose.html alone');
    await page.context().close();
  }

  // Figure study: a relaxed class, a stroke, Done, the card, Stop, the review
  {
    const page = await openPage(site);
    await tab(page, 'figure');
    await click(page, '#fig-start');
    await page.waitForFunction(() => { const s = document.querySelector('.fig-studio'); return s && !s.hidden; }, null, { timeout: 30000 }).catch(() => null);
    await sleep(2500);
    await stroke(page, '#fs-paper');
    t.check((await inked(page, '#fs-paper')) > 50, 'a stroke lands on the class paper', await inked(page, '#fs-paper'));
    await click(page, '#fig-done');
    await page.waitForFunction(() => !document.getElementById('fig-popup').hidden, null, { timeout: 10000 }).catch(() => null);
    await sleep(2500);
    const card = await page.evaluate(() => ({ shown: !document.getElementById('fig-popup').hidden, pct: document.getElementById('fig-pct').textContent, grade: document.getElementById('fig-grade').textContent, pose: (document.getElementById('fig-pose').getAttribute('src') || '').slice(0, 5) }));
    t.check(card.shown && /^\d+$/.test(card.pct) && card.grade && card.pose === 'blob:', 'the score card shows a percentage, a grade and the pose', card);
    t.check((await inked(page, '#fig-drawing')) > 50, 'the card shows the drawing', await inked(page, '#fig-drawing'));
    await click(page, '#fig-stop'); await sleep(2000);
    t.check(await visible(page, '#fig-review') && (await page.evaluate(() => document.querySelectorAll('#fig-cards canvas').length)) === 1, 'Stop class shows the review with one card');
    t.check((await inked(page, '#fig-cards canvas')) > 50, 'the review card shows the drawing');
    await clean(t, page, 'figure class');
    await page.context().close();
  }

  // Studio: draw, reload, the painting is back; Forget twice leaves no key and no record
  {
    const page = await openPage(site);
    await tab(page, 'paint'); await sleep(1500);
    t.check(/saved in this browser/.test(await text(page, '#toast') || ''), 'the first Studio visit says the painting is kept', await text(page, '#toast'));
    await stroke(page, '#ps-paper');
    const ink = await inked(page, '#ps-paper');
    t.check(ink > 100, 'a stroke lands on the paper', ink);
    await sleep(2500);
    await page.reload({ waitUntil: 'load' }); await sleep(800);
    await tab(page, 'paint'); await sleep(2500);
    t.check((await inked(page, '#ps-paper')) === ink, 'the painting is back after a reload', await inked(page, '#ps-paper'));
    t.check(/back from last time/.test(await text(page, '#toast') || ''), 'the Studio says the painting is back');
    await tab(page, 'help');
    await click(page, '#forgetBtn'); await sleep(300);
    t.check(/again/i.test(await text(page, '#forgetBtn')), 'Forget arms on the first tap', await text(page, '#forgetBtn'));
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
    await sleep(2000);
    const after = await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('portrait-value-studio'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); let record = 'no db'; if (db) { try { record = await new Promise((res) => { const tx = db.transaction('studio'); const g = tx.objectStore('studio').get('painting'); g.onsuccess = () => res(g.result ? 'record' : 'none'); g.onerror = () => res('error'); }); } catch (e) { record = 'no store'; } db.close(); } return { keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), record }; });
    t.check(after.keys.length === 0 && after.record !== 'record', 'after Forget and the reload: no key, no saved painting', after);
    await tab(page, 'paint'); await sleep(2500);
    t.check((await inked(page, '#ps-paper')) === 0, 'the paper is blank after Forget');
    await clean(t, page, 'studio and forget');
    await page.context().close();
  }

  // each script missing: the right note, no dead control
  const missing = [
    ['js/app.js', { note: 'nojs', tabs: 'none', help: 'block' }],
    ['js/game.js', { note: 'part', hidden: ['game'], sub: 'Value battle' }],
    ['js/subjects.js', { note: 'part', hidden: ['game'] }],
    ['js/painting.js', { note: 'part', hidden: ['paint', 'figure', 'loomis'] }],
    ['js/battle.js', { note: 'part', hidden: ['battle'] }],
    ['js/loomis.js', { note: 'part', hidden: ['loomis'] }],
    ['js/figure.js', { note: 'part', hidden: ['figure'] }],
    ['js/palette.js', { note: 'part', hidden: [] }],
    ['fonts.css', { note: 'none', hidden: [] }],
    ['js/guard.js', { note: 'none', hidden: [] }],
  ];
  for (const [file, want] of missing) {
    const page = await openPage(site, { block: [site.base + file], url: file === 'js/game.js' ? '#game' : '' });
    await sleep(1500);
    const s = await page.evaluate(() => ({ cls: document.documentElement.className.trim(), nojs: getComputedStyle(document.querySelector('.nojs-note')).display, part: getComputedStyle(document.querySelector('.partfail-note')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display, help: getComputedStyle(document.getElementById('tab-help')).display, hidden: [...document.querySelectorAll('[data-tab]')].filter((e) => e.hidden).map((e) => e.dataset.tab).sort(), shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id), gamesSub: (document.querySelector('.tab-group[data-group="games"] .tab-sub') || {}).textContent }));
    const noteOk = want.note === 'nojs' ? s.nojs === 'block' && s.part === 'none' : want.note === 'part' ? s.part === 'block' && s.nojs === 'none' : s.part === 'none' && s.nojs === 'none';
    t.check(noteOk, `${file} missing: the right note (${want.note})`, s);
    if (want.tabs) t.check(s.tabs === want.tabs && s.help === want.help, `${file} missing: tabs ${want.tabs}, guide ${want.help}`, s);
    if (want.hidden) t.check(JSON.stringify(s.hidden) === JSON.stringify(want.hidden.sort()), `${file} missing: tabs taken off ${JSON.stringify(want.hidden)}`, s.hidden);
    if (want.sub) t.check(s.gamesSub === want.sub, `${file} missing: the Games button names what is left`, s.gamesSub);
    t.check(s.shown.length === 1, `${file} missing: exactly one panel shows`, s.shown);
    t.check(page.log.pageerrors.length === 0, `${file} missing: no page error`, page.log.pageerrors);
    await page.context().close();
  }
  // three.js missing: Pose's failure panel without dead controls; Figure's note with Start off
  {
    const page = await openPage(site, { notFound: [site.base + 'js/vendor/three.min.js'] });
    await tab(page, 'pose'); await sleep(2000);
    const pf = poseFrame(page);
    const s = pf ? await pf.evaluate(() => ({ fail: !document.getElementById('fail').hidden, rail: getComputedStyle(document.querySelector('.rail')).display, bar: getComputedStyle(document.querySelector('.stage-bar')).display, failed: document.documentElement.classList.contains('failed') })) : null;
    t.check(s && s.fail && s.rail === 'none' && s.bar === 'none', 'three.js missing: Pose shows its note and no dead controls', s);
    await tab(page, 'figure'); await sleep(3000);
    const f = await page.evaluate(() => ({ note: document.getElementById('fig-libNote').textContent, start: document.getElementById('fig-start').disabled }));
    t.check(/could not be drawn/.test(f.note) && f.start, 'three.js missing: Figure study says so and keeps Start off', f);
    t.check(page.log.pageerrors.length === 0, 'three.js missing: no page error', page.log.pageerrors);
    await page.context().close();
  }

  // inside another site's sandboxed frame (opaque origin): the README's own test case
  {
    const page = await openPage(site, { sandbox: {}, url: 'index.html#pose' });
    await sleep(8000);
    const origin = await page.app.evaluate(() => self.origin);
    const pf = poseFrame(page);
    const s = { origin, height: await page.app.evaluate(() => document.getElementById('poseFrame').style.height), pose: pf ? await pf.evaluate(() => ({ started: !!window.__poseStarted, imgs: document.querySelectorAll('#poses button.has-img').length, fonts: document.fonts.status })) : null };
    t.check(origin === 'null', 'sandboxed embed: the app has an opaque origin', origin);
    t.check(/^\d+px$/.test(s.height) && s.pose && s.pose.imgs === 30 && s.pose.fonts === 'loaded', 'sandboxed embed: Pose sizes its frame, draws pictures, fonts load', s);
    await tab(page, 'figure');
    const fig = await page.app.evaluate(() => ({ poses: document.querySelectorAll('#tab-figure [data-pose-id]').length, imgs: [...document.querySelectorAll('#tab-figure [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length }));
    t.check(fig.poses === 30 && fig.imgs === 30, 'sandboxed embed: Figure study gets its pictures', fig);
    await clean(t, page, 'sandboxed embed');
    await page.context().close();
  }

  // opened from disk
  {
    const page = await site.browser.newPage({ viewport: DESKTOP });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
    const cons = []; page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) cons.push(m.text().slice(0, 120)); });
    await page.goto('file://' + ROOT + '/index.html', { waitUntil: 'load' }); await sleep(500);
    await tab(page, 'pose'); await tab(page, 'figure');
    const s = await page.evaluate(() => ({ height: document.getElementById('poseFrame').style.height, poses: document.querySelectorAll('#tab-figure [data-pose-id]').length }));
    t.check(/^\d+px$/.test(s.height) && s.poses === 30 && errs.length === 0 && cons.length === 0, 'from disk: the frames talk to the page', { ...s, errs, cons });
    await page.close();
  }

  // a lost WebGL context: no picture drawn while it is lost, all of them once it is back
  {
    const page = await openPage(site, { url: 'pose.html' });
    await sleep(900);
    const r = await page.evaluate(async () => {
      const c = document.getElementById('view'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const ext = gl && gl.getExtension('WEBGL_lose_context'); if (!ext) return null;
      const n = () => document.querySelectorAll('#poses button.has-img').length;
      const before = n(); ext.loseContext(); await new Promise((r) => setTimeout(r, 1500)); const during = n(); ext.restoreContext(); await new Promise((r) => setTimeout(r, 8000)); return { before, during, after: n() };
    });
    // pictures drawn before the loss may still be encoding when it strikes (one per 16 ms tick; a slow
    // runner has a few in flight): those arrive, nothing drawn after it does, and all 30 once it is back
    t.check(r && r.during - r.before <= 3 && r.after === 30, 'context lost: pictures wait (a few may still be encoding), then all 30 arrive', r);
    t.check(page.log.pageerrors.length === 0, 'context lost: no page error', page.log.pageerrors);
    await page.context().close();
  }

  // axe-core on every tab (a page that may load the tool: bypassCSP is for the tool only)
  {
    const page = await openPage(site, { bypassCSP: true });
    const serious = [];
    for (const name of TABS) {
      await tab(page, name);
      const v = await axe(page);
      const bad = v.filter((x) => x.impact === 'critical' || x.impact === 'serious');
      for (const x of bad) serious.push(`${name}: ${x.id} (${x.impact}) ${x.help} ×${x.count} e.g. ${x.nodes[0]}`);
      for (const x of v.filter((x) => x.impact !== 'critical' && x.impact !== 'serious')) t.note(`axe ${name}: ${x.id} (${x.impact}) ${x.help} ×${x.count} e.g. ${x.nodes[0]}`);
    }
    t.check(serious.length === 0, 'axe: no serious or critical issue on any tab', serious);
    await page.context().close();
  }

  // transfer sizes: a cold load of index.html, then opening Pose
  {
    const context = await site.browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    const sizes = new Map();
    page.on('response', async (r) => { try { const b = await r.body(); sizes.set(r.url(), { raw: b.length, gz: zlib.gzipSync(b).length }); } catch (e) { /* no body */ } });
    await page.goto(site.base, { waitUntil: 'networkidle' });
    const sum = () => [...sizes.values()].reduce((a, s) => ({ raw: a.raw + s.raw, gz: a.gz + s.gz }), { raw: 0, gz: 0 });
    const cold = sum();
    await tab(page, 'pose');
    const withPose = sum();
    t.note(`transfer: index.html cold load ${sizes.size} files, ${(cold.raw / 1024).toFixed(0)} KB raw / ${(cold.gz / 1024).toFixed(0)} KB gzip; after opening Pose ${(withPose.raw / 1024).toFixed(0)} KB raw / ${(withPose.gz / 1024).toFixed(0)} KB gzip`);
    t.check(cold.raw < 2 * 1024 * 1024, 'a cold load is under 2 MB raw', cold);
    await context.close();
  }
}
