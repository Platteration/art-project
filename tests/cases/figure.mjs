// Figure study, played like a sceptical tester (README "Figure study"): the setup at its extremes (every
// pose out, a group out, one pose, the remembered class), a relaxed class on a small pool (a blank Done, a
// drawing traced from the pose's own joints, Clear then Undo, Ctrl+Z, the two tap guards measured inside
// the page, ten poses never the same twice running, ✕ twice and ✕ re-arming), the review (stars, the
// average, Save as PNG for each, the gesture hidden, Draw again, New class, Back to your drawings), a timed
// class (10 s to the chime and the red stretch, Pause/Resume, leaving the tab, the hidden page, 30 s with
// Done early), a pose saved in Pose and light (in the class, then deleted: Draw again), a reload during a
// class, hostile saved state for figureStudy and figureMixes, and the phone layout.
import { openPage, clean, tab, PHONE, stroke, inked, click, text, visible, hscroll, screenshot, sleep, storageGet, poseFrame } from '../lib.mjs';

const KEY = 'portrait-value-studio.figureStudy';
const MIXES = 'portrait-value-studio.figureMixes';
const GRADES = ['Keep drawing', 'Keep drawing', 'Getting there', 'Good gesture', 'Strong gesture!', 'Gesture master!'];
const starsFor = (pct) => [88, 78, 65, 50, 30].filter((min) => pct >= min).length;
const half = (v) => { const r = Math.round(v * 2) / 2, w = Math.floor(r); return r - w ? `${w || ''}½` : String(w); };

// ---- waits on the class's own state (never a bare sleep where a condition exists) ----
const poseShown = (page, n) => page.waitForFunction((n) => new RegExp('^Pose ' + n + ': ').test(document.getElementById('fig-say').textContent), n, { timeout: 30000 }).then(() => true).catch(() => false);
const cardUp = (page, timeout = 15000) => page.waitForFunction(() => !document.getElementById('fig-result').hidden, null, { timeout }).then(() => true).catch(() => false);
// the count-up has reached the number the stars' label names
const cardSettled = (page) => page.waitForFunction(() => { const m = /, (\d+)%/.exec(document.getElementById('fig-stars').getAttribute('aria-label') || ''); return !!m && document.getElementById('fig-pct').textContent === m[1]; }, null, { timeout: 5000 }).catch(() => null);
// a watch inside the page: when the card came up (for its 0.6 s guard), and the pose just shown
const watch = (page) => page.evaluate(() => {
  if (window.__figWatch) return;
  window.__figWatch = true; window.__cardAt = 0;
  const res = document.getElementById('fig-result');
  new MutationObserver(() => { if (!res.hidden) window.__cardAt = performance.now(); }).observe(res, { attributes: true, attributeFilter: ['hidden'] });
});
const guardOver = (page) => page.waitForFunction(() => window.__cardAt && performance.now() - window.__cardAt >= 650, null, { timeout: 5000 }).catch(() => null);
const doneGuardOver = (page) => page.waitForFunction(() => { const c = window.FigureStudy.state(); return c && c.shot && performance.now() - c.since >= 550; }, null, { timeout: 5000 }).catch(() => null);
const cardState = (page) => page.evaluate(() => ({
  shown: !document.getElementById('fig-result').hidden, kicker: document.getElementById('fig-kicker').textContent, pct: document.getElementById('fig-pct').textContent,
  grade: document.getElementById('fig-grade').textContent, label: document.getElementById('fig-stars').getAttribute('aria-label'), on: document.querySelectorAll('#fig-stars .game-star.is-on').length,
  tips: [...document.querySelectorAll('#fig-tips li')].map((l) => l.textContent), say: document.getElementById('fig-say').textContent, focus: document.activeElement && document.activeElement.id,
  pose: (document.getElementById('fig-pose').getAttribute('src') || '').slice(0, 5), poseAlt: document.getElementById('fig-pose').alt, inert: [...document.querySelector('.fig-studio').children].filter((e) => e.id !== 'fig-result').every((e) => e.inert),
}));
const setupState = (page) => page.evaluate(() => ({
  mix: document.getElementById('fig-mix').textContent, plan: document.getElementById('fig-plan').textContent, note: document.getElementById('fig-libNote').textContent,
  all: document.getElementById('fig-all').textContent, allHidden: document.getElementById('fig-all').hidden, start: document.getElementById('fig-start').disabled,
  timed: document.getElementById('fig-timed').checked, timesHidden: document.getElementById('fig-times').hidden, secs: (document.querySelector('input[name="figTime"]:checked') || {}).value,
  poses: document.querySelectorAll('#fig-poses [data-pose-id]').length, pictures: [...document.querySelectorAll('#fig-poses [data-pose-id] img')].filter((i) => i.src.startsWith('blob:')).length,
  inClass: [...document.querySelectorAll('#fig-poses [data-pose-id]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.poseId),
  groups: [...document.querySelectorAll('.fig-group-btn')].map((b) => [b.dataset.group, b.textContent, b.getAttribute('aria-label')]), heads: [...document.querySelectorAll('.fig-group h4')].map((h) => h.textContent),
  setup: !document.getElementById('fig-setup').hidden, review: !document.getElementById('fig-review').hidden, draw: !document.querySelector('.fig-studio').hidden, back: !document.getElementById('fig-back').hidden,
  stored: localStorage.getItem('portrait-value-studio.figureStudy'),
}));
const stateOf = (page) => page.evaluate(() => { const c = window.FigureStudy.state(); return c && { n: c.n, id: c.id, mode: c.mode, secs: c.secs, pool: c.pool, running: c.running, held: c.held, over: c.over, results: c.results.length }; });
const clockState = (page) => page.evaluate(() => { const c = document.getElementById('fig-clock'), p = document.getElementById('fig-pause'); return { clock: c.textContent, label: c.getAttribute('aria-label'), low: c.classList.contains('is-low'), paused: c.classList.contains('is-paused'), color: getComputedStyle(c).color, pauseHidden: p.hidden, pauseText: p.querySelector('.fig-btn-text').textContent, pauseLabel: p.getAttribute('aria-label'), held: p.classList.contains('is-held') }; });
// the pose library, restricted to some ids (every other pose taken out)
async function onlyPoses(page, ids) {
  await page.evaluate((ids) => {
    document.querySelectorAll('#fig-poses [data-pose-id]').forEach((b) => { const want = ids.includes(b.dataset.poseId); if ((b.getAttribute('aria-pressed') === 'true') !== want) b.click(); });
  }, ids);
}
// a drawing traced from the pose's own joints, where the reference would sit on the paper: a stick figure
// with the head as an oval, the shoulder and hip lines (what the gesture is made of)
async function trace(page) {
  const paths = await page.evaluate(() => {
    const s = window.FigureStudy.state().shot, W = 900, H = 1200, k = Math.min(W / s.w, H / s.h), ox = (W - s.w * k) / 2, oy = (H - s.h * k) / 2;
    const P = (n) => { const v = s.joints[n]; return [(ox + v[0] * s.w * k) / W, (oy + v[1] * s.h * k) / H]; };
    const chain = (...ns) => ns.map(P);
    const cr = P('crown'), ch = P('chin'), cx = (cr[0] + ch[0]) / 2, cy = (cr[1] + ch[1]) / 2, r = Math.hypot(cr[0] - ch[0], (cr[1] - ch[1]) * H / W) / 2, head = [];
    for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; head.push([cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * (W / H)]); }
    return [chain('crown', 'neck', 'chest', 'waist', 'pelvis'), chain('shoulderR', 'elbowR', 'wristR', 'handR'), chain('shoulderL', 'elbowL', 'wristL', 'handL'), chain('hipR', 'kneeR', 'ankleR', 'toeR'), chain('hipL', 'kneeL', 'ankleL', 'toeL'), chain('shoulderR', 'shoulderL'), chain('hipR', 'hipL'), head];
  });
  for (const p of paths) await stroke(page, '#fs-paper', p, { steps: 4 });
}
// a scribble over the whole sheet: the README says it is taken down to nothing
async function scribble(page) {
  const pts = [];
  for (let i = 0; i <= 36; i++) pts.push([i % 2 ? 0.88 : 0.12, 0.06 + i * 0.024]);
  await stroke(page, '#fs-paper', pts, { steps: 3 });
}
// Done, then the next card, with every guard waited out
async function endPose(page) { await doneGuardOver(page); await click(page, '#fig-done'); return cardUp(page); }
async function nextPose(page, n) { await guardOver(page); await click(page, '#fig-nextPose'); return poseShown(page, n); }
async function stopTwice(page) { await click(page, '#fig-end'); await click(page, '#fig-end'); await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null); }
const chimeSpy = (page) => page.evaluate(() => { if (window.__chimes === undefined) { window.__chimes = 0; window.GameSound.chime = () => { window.__chimes++; }; } return window.GameSound.on(); });
const chimes = (page) => page.evaluate(() => window.__chimes);
const dataUrls = (page) => page.evaluate(() => [...document.querySelectorAll('#fig-cards canvas')].map((c) => c.toDataURL()));
const download = (page, selector) => Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), click(page, selector)]).then(([d]) => d && d.suggestedFilename());

export default async function figure(t, site) {
  // ================= A. the setup, desktop =================
  const page = await openPage(site);
  await tab(page, 'figure');
  await watch(page);
  {
    const s = await setupState(page);
    t.check(s.poses === 30 && s.pictures === 30 && !s.start && s.setup && !s.review && !s.draw, 'the tab opens on the setup with 30 poses and pictures, Start enabled', s);
    t.check(/^All 30 poses are in the class/.test(s.mix) && /No time limit/.test(s.plan) && /A pose with a tick/.test(s.note) && s.all === 'Take them all out' && !s.allHidden && s.timesHidden && !s.timed, 'the setup says every pose is in, no time limit, and offers Take them all out', s);
    t.check(s.heads.join('|') === 'Standing|Moving and sport|Low to the floor|Dance' && s.groups.every(([g, txt, label]) => txt === 'Take these out' && /^Take out the /.test(label)), 'the four groups each have a Take these out button with its label', s.groups);
    t.check(s.stored === null, 'a visit that changes nothing stores nothing', s.stored);
    // every pose out
    await click(page, '#fig-all');
    const o = await setupState(page);
    t.check(o.start && o.inClass.length === 0 && o.mix === 'Every pose is out of the class. Tap one to put it back.' && o.plan === '' && o.all === 'Put them all back' && o.groups.every(([, txt]) => txt === 'Put these back'), 'Take them all out: Start off, the message says every pose is out, every button offers Put back', o);
    let stored = null; try { stored = JSON.parse(o.stored); } catch (e) { /* not JSON */ }
    t.check(stored && stored.mode === 'relaxed' && stored.secs === 30 && Array.isArray(stored.out) && stored.out.length === 30, 'the poses taken out are stored', o.stored);
    t.check(await page.evaluate(() => { const b = document.getElementById('fig-start'); b.click(); return !window.FigureStudy.state() && !document.getElementById('fig-setup').hidden; }), 'a disabled Start does nothing', await stateOf(page));
    // all back
    await click(page, '#fig-all');
    const b = await setupState(page);
    t.check(!b.start && b.inClass.length === 30 && /^All 30 poses/.test(b.mix) && b.all === 'Take them all out' && JSON.parse(b.stored).out.length === 0, 'Put them all back: every pose in again, the store emptied', b);
    // a group out, one of its poses back, the group out again, then back
    await click(page, '.fig-group-btn[data-group="standing"]');
    const g1 = await setupState(page);
    const standing = await page.evaluate(() => [...document.querySelectorAll('#fig-poses [data-pose-id]')].filter((x) => x.closest('.fig-group').querySelector('.fig-group-btn').dataset.group === 'standing').map((x) => x.dataset.poseId));
    t.check(standing.length === 7 && g1.inClass.length === 23 && standing.every((id) => !g1.inClass.includes(id)) && g1.mix === '23 of the 30 poses are in the class, in a random order.' && g1.groups[0][1] === 'Put these back' && g1.groups[0][2] === 'Put back the standing poses', 'Take these out on Standing takes its 7 poses out and says 23 of the 30', { standing, mix: g1.mix, group: g1.groups[0] });
    await click(page, `#fig-poses [data-pose-id="${standing[0]}"]`);
    const g2 = await setupState(page);
    t.check(g2.inClass.length === 24 && g2.inClass.includes(standing[0]) && g2.groups[0][1] === 'Take these out' && /^24 of the 30/.test(g2.mix), 'one standing pose tapped back: 24 in, the group button offers Take these out again', { n: g2.inClass.length, mix: g2.mix, group: g2.groups[0] });
    await click(page, '.fig-group-btn[data-group="standing"]');
    const g3 = await setupState(page);
    t.check(g3.inClass.length === 23 && g3.groups[0][1] === 'Put these back', 'the group button with one pose in takes the rest out', { n: g3.inClass.length, group: g3.groups[0] });
    await click(page, '.fig-group-btn[data-group="standing"]');
    const g4 = await setupState(page);
    t.check(g4.inClass.length === 30 && g4.groups[0][1] === 'Take these out' && /^All 30/.test(g4.mix), 'Put these back brings the whole group back', { n: g4.inClass.length, mix: g4.mix });
    // Timed, 10 s
    await click(page, '#fig-timed'); await click(page, '#fig-t10');
    const tm = await setupState(page);
    t.check(tm.timed && !tm.timesHidden && tm.secs === '10' && tm.plan === '10 s a pose, until you stop the class' && tm.stored === '{"mode":"timed","secs":10,"out":[]}', 'Timed at 10 s shows the times, says 10 s a pose and is stored', tm);
    await click(page, '#fig-t600');
    t.check((await setupState(page)).plan === '10 min a pose, until you stop the class', 'the plan names 10 min for the longest pose');
    await click(page, '#fig-relaxed');
    const rx = await setupState(page);
    t.check(!rx.timed && rx.timesHidden && /No time limit/.test(rx.plan) && rx.stored === '{"mode":"relaxed","secs":600,"out":[]}', 'back to Relaxed: the times hide, the plan says no time limit, the time chosen is kept', rx);
    await click(page, '#fig-t30');
    await clean(t, page, 'setup');
  }

  // ================= B. a relaxed class on three poses =================
  const ids = ['stand', 'relaxed', 'wave'];
  {
    await onlyPoses(page, ids);
    const s = await setupState(page);
    t.check(s.inClass.length === 3 && s.mix === '3 of the 30 poses are in the class, in a random order.' && JSON.parse(s.stored).out.length === 27, 'three poses in: the message counts them, 27 are stored as out', { mix: s.mix, n: s.inClass.length });
    // Done the instant the pose appears must do nothing (the 0.5 s guard), measured inside the page
    await page.evaluate(() => { window.__early = null; const el = document.getElementById('fig-say'); const mo = new MutationObserver(() => { if (/^Pose 1: /.test(el.textContent)) { mo.disconnect(); const dt = performance.now() - window.FigureStudy.state().since; document.getElementById('fig-done').click(); window.__early = { dt, cardHidden: document.getElementById('fig-result').hidden, over: window.FigureStudy.state().over }; } }); mo.observe(el, { childList: true, characterData: true, subtree: true }); });
    // a stroke while the first pose is still coming: the paper is locked and says so
    const lockedSay = await page.evaluate(() => { document.getElementById('fig-start').click(); const p = document.getElementById('fs-paper'); const r = p.getBoundingClientRect(); p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: r.left + 20, clientY: r.top + 20 })); return { toast: document.getElementById('toast').textContent, shot: !!window.FigureStudy.state().shot, draw: !document.querySelector('.fig-studio').hidden, setup: !document.getElementById('fig-setup').hidden }; });
    t.check(lockedSay.draw && !lockedSay.setup && !lockedSay.shot && lockedSay.toast === 'The next pose is coming', 'Start shows the paper at once; a stroke before the pose has come is refused with "The next pose is coming"', lockedSay);
    t.check(await poseShown(page, 1), 'the first pose comes');
    const early = await page.evaluate(() => window.__early);
    if (early && early.dt < 450) t.check(early.cardHidden && !early.over, `Done ${early.dt.toFixed(0)} ms after the pose appeared does nothing (the half-second guard)`, early);
    else t.note(`the Done guard could not be measured on pose 1 (the tap came ${early ? early.dt.toFixed(0) : '?'} ms after the pose)`);
    const p1 = await page.evaluate(() => ({ count: document.getElementById('fig-count').textContent, name: document.getElementById('fig-name').textContent, say: document.getElementById('fig-say').textContent, ref: document.getElementById('fs-refName').textContent, focus: document.activeElement && document.activeElement.id, ink: 0 }));
    const c1 = await clockState(page);
    t.check(p1.count === 'Pose 1' && ['Stand', 'Weight on one leg', 'Wave'].includes(p1.name), 'the bar names Pose 1 and one of the three poses', p1);
    t.check(p1.say === `Pose 1: ${p1.name}` && p1.ref === `${p1.name}, pose 1. Drawn from the Pose and light figure.` && p1.focus === 'fig-done', 'the live region and the reference name the pose; Done has focus', p1);
    t.check(c1.label === 'Time on this pose' && c1.pauseHidden && !c1.low && !c1.paused, 'a relaxed class: the clock counts time on this pose, no Pause button', c1);
    t.check(await page.waitForFunction(() => document.getElementById('fig-clock').textContent !== '0:00', null, { timeout: 4000 }).then(() => true).catch(() => false), 'the relaxed clock counts up', await text(page, '#fig-clock'));
    t.check((await inked(page, '#fs-paper')) === 0, 'the sheet starts blank', await inked(page, '#fs-paper'));
    // the hidden page stops a relaxed clock; back again it runs
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hid = await stateOf(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const back = await stateOf(page);
    t.check(hid && !hid.running && back && back.running, 'a hidden page stops the relaxed clock; it runs again when the page is back', { hid, back });
    // draw, Clear twice, Undo, Ctrl+Z
    await trace(page);
    const ink1 = await inked(page, '#fs-paper');
    t.check(ink1 > 500, 'a drawing traced from the pose lands on the sheet', ink1);
    await click(page, '#fs-clear');
    t.check(/Tap again to clear/.test(await text(page, '#toast')) && (await inked(page, '#fs-paper')) === ink1, 'Clear arms first and keeps the drawing', await text(page, '#toast'));
    await click(page, '#fs-clear');
    t.check((await inked(page, '#fs-paper')) === 0, 'Clear again blanks the sheet');
    await click(page, '#fs-undo');
    t.check((await inked(page, '#fs-paper')) === ink1, 'Undo after Clear brings the drawing back', await inked(page, '#fs-paper'));
    await stroke(page, '#fs-paper', [[0.1, 0.1], [0.2, 0.15]]);
    const ink2 = await inked(page, '#fs-paper');
    await page.keyboard.press('Control+z');
    t.check(ink2 > ink1 && (await inked(page, '#fs-paper')) === ink1, 'Ctrl+Z undoes the last stroke in the class', { ink1, ink2, after: await inked(page, '#fs-paper') });
    // Done, then Next pose and Stop class in the same instant: the card's 0.6 s guard
    const atomic = await page.evaluate(() => { document.getElementById('fig-done').click(); const shown = !document.getElementById('fig-result').hidden; document.getElementById('fig-nextPose').click(); const still = !document.getElementById('fig-result').hidden; document.getElementById('fig-stop').click(); return { shown, still, still2: !document.getElementById('fig-result').hidden, cls: !!window.FigureStudy.state(), n: window.FigureStudy.state() && window.FigureStudy.state().n }; });
    t.check(atomic.shown && atomic.still && atomic.still2 && atomic.cls && atomic.n === 1, 'Done shows the card; Next pose and Stop class in the same instant are not answered (the 0.6 s guard)', atomic);
    await cardSettled(page);
    const card = await cardState(page);
    const pct = +card.pct, stars = starsFor(pct);
    t.check(card.kicker === 'Pose 1 done' && /^\d+$/.test(card.pct) && pct >= 0 && pct <= 100 && card.on === stars && card.grade === GRADES[stars] && card.label === `${stars} out of 5 stars, ${pct}% gesture match`, 'the card: Pose 1 done, a percentage, the stars it earns, the word for them, the label', card);
    t.check(pct >= 65, 'a drawing traced from the pose\'s own joints earns at least three stars', { pct, tips: card.tips });
    t.check(card.pose === 'blob:' && card.poseAlt === `The pose: ${p1.name}` && (await inked(page, '#fig-drawing')) > 100 && card.tips.length >= 3 && /^Line of action: /.test(card.tips[0]) && card.tips.some((x) => /^(Your drawing|Well matched|Dashed|Extra marks|Off the figure): /.test(x)), 'the card shows the pose, the drawing with the gesture, and notes starting with the line of action', { pose: card.pose, alt: card.poseAlt, tips: card.tips });
    t.check(card.say === `Pose 1 done ${p1.name}: ${stars} out of 5 stars, ${pct}% gesture match. ${GRADES[stars]}`.replace(/([^!.])$/, '$1.') && card.focus === 'fig-nextPose' && card.inert, 'the live region reads the card; Next pose has focus; the studio behind is inert', { say: card.say, focus: card.focus, inert: card.inert });
    t.check(!(await clockState(page)).paused, 'the clock is not drawn as paused on the card (the pose is over)', await clockState(page));
    // another tab and back while the card is up: the card stays
    await tab(page, 'study'); await tab(page, 'figure');
    const after = await cardState(page);
    t.check(after.shown && (await setupState(page)).draw, 'leaving the tab and coming back during the card keeps the card up', { shown: after.shown });
    // Next pose: a fresh sheet
    t.check(await nextPose(page, 2), 'Next pose (after the guard) brings pose 2');
    const p2 = await page.evaluate(() => ({ count: document.getElementById('fig-count').textContent, card: !document.getElementById('fig-result').hidden, undo: document.getElementById('fs-undo').disabled, focus: document.activeElement && document.activeElement.id, clock: document.getElementById('fig-clock').textContent }));
    t.check(p2.count === 'Pose 2' && !p2.card && p2.undo && (await inked(page, '#fs-paper')) === 0 && p2.focus === 'fig-done' && /^0:0[0-2]$/.test(p2.clock), 'pose 2: a fresh sheet, nothing to undo, the clock from 0:00, Done focused', p2); // (read a moment after the pose starts: up to 0:02 on a loaded machine)
    // a blank sheet Done
    t.check(await endPose(page), 'Done with a blank sheet shows a card');
    await cardSettled(page);
    const blank = await cardState(page);
    t.check(blank.kicker === 'Pose 2 done' && blank.pct === '0' && blank.on === 0 && blank.grade === 'Nothing drawn' && blank.label === '0 out of 5 stars, 0% gesture match' && blank.tips.some((x) => x === 'Nothing drawn: the gesture is shown where the reference would sit.') && /: nothing drawn\.$/.test(blank.say), 'a blank sheet: 0%, no star, "Nothing drawn", the note says where the gesture sits', blank);
    // ten poses: never the same twice running (a scribble on pose 3 for a 0-star card)
    const names = [p1.name, await text(page, '#fig-name')];
    let scribbled = null;
    for (let n = 3; n <= 10; n++) {
      t.check(await nextPose(page, n), `Next pose brings pose ${n}`);
      names.push(await text(page, '#fig-name'));
      if (n === 3) { await scribble(page); }
      t.check(await endPose(page), `Done ends pose ${n}`);
      await cardSettled(page);
      if (n === 3) { scribbled = await cardState(page); }
    }
    t.check(names.length === 10 && names.every((x, i) => i === 0 || x !== names[i - 1]), 'ten poses in a row, never the same pose twice running', names.join(' > '));
    t.check(new Set(names).size === 3, 'all three poses of the class come up over ten poses', names.join(' > '));
    t.check(scribbled && scribbled.pct === '0' && scribbled.on === 0 && scribbled.grade === 'Keep drawing' && scribbled.tips.some((x) => /^(Extra marks|Dashed): /.test(x)), 'a scribble over the sheet earns nothing (README: taken down to nothing) and the notes say why', scribbled && { pct: scribbled.pct, grade: scribbled.grade, tips: scribbled.tips });
    // ✕ during a pose: once arms, three seconds later it re-arms, twice stops; a stroke under way is kept
    t.check(await nextPose(page, 11), 'pose 11 comes');
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    await click(page, '#fig-end');
    t.check((await text(page, '#toast')) === 'Tap ✕ again to stop the class' && !!(await stateOf(page)), '✕ once asks for a second tap and the class goes on', await text(page, '#toast'));
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
    await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => null);
    await sleep(3200); // (the re-arm is 3 s of wall clock: no condition to wait on)
    await click(page, '#fig-end');
    t.check((await text(page, '#toast')) === 'Tap ✕ again to stop the class' && !!(await stateOf(page)), '✕ after more than 3 s arms again instead of stopping', await text(page, '#toast'));
    await click(page, '#fig-end');
    await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null);
    const rv = await setupState(page);
    t.check(!(await stateOf(page)) && rv.review && !rv.setup && !rv.draw && (await text(page, '#toast')) === 'The class is over', '✕ twice ends the class and shows the review', { state: await stateOf(page), rv: { review: rv.review, setup: rv.setup, draw: rv.draw }, toast: await text(page, '#toast') });
    await clean(t, page, 'relaxed class');
  }

  // ================= C. the review =================
  let firstDataUrls;
  {
    const r = await page.evaluate(() => ({
      lede: document.getElementById('fig-reviewLede').textContent, focus: document.activeElement && document.activeElement.id, scrollY: window.scrollY,
      cards: [...document.querySelectorAll('#fig-cards .fig-card')].map((c) => ({ title: c.querySelector('figcaption strong').textContent, time: c.querySelector('figcaption span').textContent, rating: c.querySelector('.fig-rating').textContent, stars: c.querySelector('.fig-rating-stars').textContent, tips: c.querySelectorAll('.fig-tips li').length, img: (c.querySelector('img').getAttribute('src') || '').slice(0, 5), alt: c.querySelector('img').alt, canvasLabel: c.querySelector('canvas').getAttribute('aria-label'), save: c.querySelector('button').textContent })),
      pressed: [...document.querySelectorAll('[data-fig-gesture]')].map((b) => b.getAttribute('aria-pressed')).join(','),
    }));
    const starsOf = (rating) => (/(\d) out of 5 stars/.exec(rating) || [])[1];
    const stars = r.cards.map((c) => +(starsOf(c.rating) || 0));
    const avg = half(stars.reduce((a, b) => a + b, 0) / (stars.length || 1));
    t.check(r.cards.length === 3 && r.lede === `3 drawings from a relaxed class, ${avg} star${avg === '1' || avg === '½' ? '' : 's'} on average. Each is beside the pose it was drawn from, with the pose's gesture laid over it.`, 'the review: three drawings (the traced one, the scribble and the stroke ✕ cut short), the average stars in words', { lede: r.lede, stars });
    t.check(r.cards.every((c, i) => new RegExp(`^${i + 1}\\. `).test(c.title) && /^\d+:\d\d$/.test(c.time) && /^[★☆]{5}$/.test(c.stars) && /\d+% · /.test(c.rating) && c.tips >= 3 && c.img === 'blob:' && /^The pose: /.test(c.alt) && c.canvasLabel === `Your drawing of ${c.title.replace(/^\d+\. /, '')}, with the gesture over it` && c.save === 'Save as PNG'), 'each card: its number and pose, the time, five star glyphs, the percentage and word, notes, the pose picture, Save as PNG', r.cards);
    t.check(r.focus === 'fig-reviewTitle' && r.scrollY === 0 && r.pressed === 'true,false', 'the review title takes focus at the top of the page; Gestures shown is pressed', { focus: r.focus, scrollY: r.scrollY, pressed: r.pressed });
    const inks = await page.evaluate(() => [...document.querySelectorAll('#fig-cards canvas')].map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - d[0]) > 40 || Math.abs(d[i + 1] - d[1]) > 40) n++; return n; }));
    t.check(inks.length === 3 && inks.every((n) => n > 50), 'every review card shows marks', inks);
    firstDataUrls = await dataUrls(page);
    // the gesture hidden and shown again
    await click(page, '[data-fig-gesture="0"]');
    await page.waitForFunction((a) => document.querySelector('#fig-cards canvas').toDataURL() !== a, firstDataUrls[0], { timeout: 3000 }).catch(() => null);
    const hidden = await dataUrls(page);
    const h = await page.evaluate(() => ({ pressed: [...document.querySelectorAll('[data-fig-gesture]')].map((b) => b.getAttribute('aria-pressed')).join(','), labels: [...document.querySelectorAll('#fig-cards canvas')].map((c) => c.getAttribute('aria-label')) }));
    t.check(hidden.every((u, i) => u !== firstDataUrls[i]) && h.pressed === 'false,true' && h.labels.every((l) => /^Your drawing of [^,]+$/.test(l)), 'Hidden takes the gesture off every card and its label', h);
    const file2 = await download(page, '#fig-cards .fig-card:nth-child(2) button');
    t.check(/^figure-2-[a-z0-9-]+\.png$/.test(file2 || ''), 'Save as PNG on the second card downloads figure-2-<pose>.png', file2);
    await click(page, '[data-fig-gesture="1"]');
    await page.waitForFunction((a) => document.querySelector('#fig-cards canvas').toDataURL() === a, firstDataUrls[0], { timeout: 3000 }).catch(() => null);
    t.check(JSON.stringify(await dataUrls(page)) === JSON.stringify(firstDataUrls), 'Gestures shown draws the cards as before');
    const file1 = await download(page, '#fig-cards .fig-card:nth-child(1) button');
    t.check(/^figure-1-[a-z0-9-]+\.png$/.test(file1 || '') && !(await page.evaluate(() => document.getElementById('saveDialog').open)), 'Save as PNG on the first card downloads figure-1-<pose>.png, with no dialog at the top level', file1);
    // Draw again: the same class; ✕ twice with nothing drawn goes to the setup, the drawings stay
    await click(page, '#fig-again');
    t.check(await poseShown(page, 1), 'Draw again starts at pose 1');
    const again = await stateOf(page);
    t.check(again && again.mode === 'relaxed' && again.pool.length === 3 && again.pool.every((id) => ids.includes(id)), 'Draw again uses the same class: relaxed, the same three poses', again);
    await stopTwice(page);
    const s = await setupState(page);
    t.check(s.setup && !s.review && s.back && (await text(page, '#toast')) === 'The class is over' && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'fig-start', 'a class with nothing drawn goes straight back to the setup, with Back to your drawings offered and Start focused', { setup: s.setup, back: s.back, toast: await text(page, '#toast') });
    await click(page, '#fig-back');
    const b = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length, focus: document.activeElement && document.activeElement.id }));
    t.check(b.review && b.cards === 3 && b.focus === 'fig-reviewTitle', 'Back to your drawings returns to the three cards', b);
    await click(page, '#fig-new');
    const n = await setupState(page);
    t.check(n.setup && !n.review && n.back, 'New class shows the setup with Back to your drawings', { setup: n.setup, back: n.back });
    await clean(t, page, 'review');
  }

  // ================= D. a timed class: 10 s to the chime, Pause, leaving, 30 s with Done early =================
  {
    await click(page, '#fig-timed'); await click(page, '#fig-t10');
    const soundOn = await chimeSpy(page);
    t.check(soundOn, 'the games\' sound switch is on by default, so the chime plays', soundOn);
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'the timed class starts');
    const c0 = await clockState(page);
    t.check(c0.clock === '0:10' && c0.label === 'Time left' && !c0.pauseHidden && c0.pauseText === 'Pause' && c0.pauseLabel === 'Pause the clock' && !c0.low && !c0.paused, 'a timed class: 0:10 of time left, a Pause button', c0);
    t.check(await page.waitForFunction(() => document.getElementById('fig-clock').textContent === '0:09', null, { timeout: 3000 }).then(() => true).catch(() => false), 'the clock counts down');
    await click(page, '#fig-pause');
    const ph = await clockState(page);
    await sleep(1200); // (a held clock has no condition to wait on: it must not change)
    const ph2 = await clockState(page);
    const st = await stateOf(page);
    t.check(ph.pauseText === 'Resume' && ph.pauseLabel === 'Resume the clock' && ph.held && ph.paused && ph2.clock === ph.clock && st && !st.running && st.held, 'Pause holds the clock: the button turns to Resume, the clock stops', { ph, after: ph2.clock, st });
    await click(page, '#fig-pause');
    t.check(await page.waitForFunction((was) => document.getElementById('fig-clock').textContent !== was, ph.clock, { timeout: 3000 }).then(() => true).catch(() => false) && (await clockState(page)).pauseText === 'Pause', 'Resume runs the clock on again', await clockState(page));
    // leaving the tab holds a timed class until Resume
    await tab(page, 'study');
    const away = await stateOf(page);
    await tab(page, 'figure');
    const backOn = { ...(await stateOf(page)), ...(await clockState(page)), draw: (await setupState(page)).draw };
    t.check(away && !away.running && away.held && !backOn.running && backOn.held && backOn.pauseText === 'Resume' && backOn.draw, 'leaving the tab pauses a timed class; back on it, the clock waits for Resume', { away, back: backOn });
    await click(page, '#fig-pause');
    // the hidden page too
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hid = await stateOf(page);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const vis = { ...(await stateOf(page)), pauseText: (await clockState(page)).pauseText };
    t.check(hid && !hid.running && hid.held && !vis.running && vis.pauseText === 'Resume', 'the page hidden pauses a timed class, and it waits for Resume once visible', { hid, vis });
    await click(page, '#fig-pause');
    // the red last stretch, then the chime
    const lowAt = await page.waitForFunction(() => document.getElementById('fig-clock').classList.contains('is-low') && document.getElementById('fig-clock').textContent, null, { timeout: 12000 }).then((h) => h.jsonValue()).catch(() => null);
    const lowColor = await page.evaluate(() => getComputedStyle(document.getElementById('fig-clock')).color);
    const earth = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--earth)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    t.check(lowAt && lowColor === earth, 'the last stretch of the clock turns red', { lowAt, lowColor, earth });
    // README: the last fifth of a short pose, at least 3 seconds: 3 s of a 10 s pose
    t.check(lowAt === '0:03', 'README: the red stretch of a 10 s pose is its last 3 seconds (the last fifth, at least 3 s)', lowAt);
    if (lowAt !== '0:03' && lowAt !== null) {
      t.finding({ title: 'A 10 s pose turns red with 3 s left, not the last fifth (2 s) the README promises', severity: 'low', steps: 'Figure study > Timed > 10 s > Start drawing. Watch the clock: it turns red at 0:03.', expected: 'README "Figure study" 1: "The last stretch of the clock turns red (the last fifth of a short pose, the last 30 seconds of a long one)": 2 s of a 10 s pose, so red at 0:02.', actual: 'The clock turns red at 0:03 (30% of the pose). Every other time (30 s, 1 min, 5 min, 10 min) matches the README.', cause: 'js/figure.js:299 floors the red stretch at 3 s: Math.min(30, Math.max(3, cls.secs * 0.2)).' });
    }
    t.check(await cardUp(page, 12000), 'the time runs out and the card comes by itself');
    const tc = { ...(await cardState(page)), chimes: await chimes(page), clock: (await clockState(page)).clock };
    t.check(tc.kicker === 'Time’s up!' && tc.chimes === 1 && tc.clock === '0:00' && tc.grade === 'Nothing drawn', 'time up: the card says Time’s up!, the chime rang once, the clock stands at 0:00', tc);
    await guardOver(page); await click(page, '#fig-stop');
    await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null);
    const after = await setupState(page);
    t.check(after.setup && !after.review && after.back, 'Stop class with nothing drawn goes back to the setup, the drawings before still offered', { setup: after.setup, back: after.back });
    // 30 s, Done early
    await click(page, '#fig-t30');
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'a 30 s class starts');
    t.check((await clockState(page)).clock === '0:30', 'the clock starts at 0:30', await clockState(page));
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    const chimesBefore = await chimes(page);
    await page.waitForFunction(() => document.getElementById('fig-clock').textContent === '0:29', null, { timeout: 3000 }).catch(() => null);
    t.check(await endPose(page), 'Done ends a timed pose early');
    const early = { ...(await cardState(page)), chimes: await chimes(page), clock: (await clockState(page)).clock };
    await sleep(1200); // (a stopped clock has no condition to wait on: it must not change)
    const later = (await clockState(page)).clock;
    t.check(early.kicker === 'Pose 1 done' && early.chimes === chimesBefore && /^0:2[89]$/.test(early.clock) && later === early.clock, 'Done early: "Pose 1 done", no chime, the clock stops where it was', { kicker: early.kicker, chimes: early.chimes, before: chimesBefore, clock: early.clock, later });
    t.check(await nextPose(page, 2) && (await clockState(page)).clock === '0:30', 'the next pose starts from 0:30 again', await clockState(page));
    await stopTwice(page);
    const rv = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, lede: document.getElementById('fig-reviewLede').textContent, cards: document.querySelectorAll('#fig-cards .fig-card').length }));
    t.check(rv.review && rv.cards === 1 && /^1 drawing from a timed class, 30 s a pose, /.test(rv.lede), 'the review names a timed class at 30 s a pose, with its one drawing', rv);
    await clean(t, page, 'timed class');
  }

  // ================= E. a pose saved in Pose and light: in the class; deleted, Draw again =================
  {
    await tab(page, 'pose');
    const pf = poseFrame(page);
    const saved = pf ? await pf.evaluate(() => { document.getElementById('libClose').click(); document.getElementById('savePose').click(); return document.getElementById('savePose').textContent; }) : null;
    t.check(saved === 'Saved in the pose library', 'a pose is saved in Pose and light', saved);
    await tab(page, 'figure');
    await page.waitForFunction(() => document.querySelectorAll('#fig-poses [data-pose-id^="mine-"] img[src^="blob:"]').length === 1, null, { timeout: 20000 }).catch(() => null);
    const m = await setupState(page);
    const mine = await page.evaluate(() => { const b = document.querySelector('#fig-poses [data-pose-id^="mine-"]'); return b && { id: b.dataset.poseId, name: b.querySelector('.fig-pose-name').textContent, pressed: b.getAttribute('aria-pressed'), pic: b.classList.contains('has-img'), group: b.closest('.fig-group').querySelector('h4').textContent, btn: b.closest('.fig-group').querySelector('.fig-group-btn').getAttribute('aria-label') }; });
    t.check(m.poses === 31 && m.pictures === 31 && mine && mine.name === 'Your pose 1' && mine.pressed === 'true' && mine.pic && mine.group === 'Your poses' && mine.btn === 'Take out your saved poses' && m.heads[4] === 'Your poses', 'the saved pose appears in the setup under Your poses, with its picture, in the class', { poses: m.poses, pictures: m.pictures, mine, heads: m.heads });
    t.check(/^31 of the 31 poses|^All 31 poses/.test(m.mix) || /of the 31 poses/.test(m.mix), 'the message counts 31 poses now', m.mix);
    // a class of that one pose alone: it has to repeat
    await onlyPoses(page, [mine.id]);
    const one = await setupState(page);
    t.check(one.inClass.length === 1 && one.mix === '1 of the 31 poses is in the class.' && !one.start, 'one pose in the class: Start is on, the line reads as one pose', { mix: one.mix, n: one.inClass.length });
    t.check(one.mix !== '1 of the 31 poses are in the class, in a random order.', 'the message for one pose reads as one pose', one.mix);
    if (one.mix === '1 of the 31 poses are in the class, in a random order.') t.finding({ title: 'With one pose in the class the setup says "1 of the 31 poses are in the class, in a random order."', severity: 'low', steps: 'Figure study > Take them all out > tap one pose back in. Read the line under Poses.', expected: 'A sentence for one pose: "1 of the 31 poses is in the class." (and no random order to speak of).', actual: '"1 of the 31 poses are in the class, in a random order."', cause: 'js/figure.js:198 uses one template for every count above zero.' });
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1) && (await text(page, '#fig-name')) === 'Your pose 1', 'the class draws the saved pose', await text(page, '#fig-name'));
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    t.check(await endPose(page) && await nextPose(page, 2) && (await text(page, '#fig-name')) === 'Your pose 1', 'with one pose in the class, the same pose comes again', await text(page, '#fig-name'));
    await guardOver(page);
    await stopTwice(page);
    t.check((await setupState(page)).review && (await page.evaluate(() => document.querySelectorAll('#fig-cards .fig-card').length)) === 1, 'the review shows the one drawing of the saved pose');
    // the saved pose deleted in Pose and light, then Draw again on the review
    await tab(page, 'pose');
    const removed = pf ? await pf.evaluate(() => { const x = document.querySelector('#mine .pose-x'); if (!x) return null; x.click(); return document.querySelectorAll('#mine .pose-btn').length; }) : null;
    t.check(removed === 0, 'the saved pose is removed in Pose and light', removed);
    await tab(page, 'figure');
    await page.waitForFunction(() => document.querySelectorAll('#fig-poses [data-pose-id]').length === 30, null, { timeout: 20000 }).catch(() => null);
    const gone = await setupState(page);
    t.check(gone.poses === 30 && gone.review, 'back on the tab the list is 30 again and the review is still up', { poses: gone.poses, review: gone.review });
    const againSay = await page.evaluate(() => { const toast = document.getElementById('toast'); toast.textContent = ''; toast.classList.remove('show'); document.getElementById('fig-again').click(); return { cls: !!window.FigureStudy.state(), toast: toast.textContent, review: !document.getElementById('fig-review').hidden, draw: !document.querySelector('.fig-studio').hidden }; });
    await page.waitForFunction(() => window.FigureStudy.state() || document.getElementById('toast').classList.contains('show') || !document.querySelector('.fig-studio').hidden, null, { timeout: 1500 }).catch(() => null);
    const againLater = { ...(await setupState(page)), cls: !!(await stateOf(page)), toast: await text(page, '#toast') };
    const dead = !againSay.cls && !againLater.cls && !againLater.draw && !againLater.toast;
    t.check(!dead, 'Draw again with the class\'s only pose deleted says why it cannot start', { againSay, later: { cls: againLater.cls, draw: againLater.draw, toast: againLater.toast, review: againLater.review } });
    if (dead) t.finding({ title: 'Draw again does nothing, with no message, when every pose of the last class has been deleted in Pose and light', severity: 'medium', steps: 'Pose and light > Save this pose. Figure study > Take them all out, tap "Your pose 1" back in > Start drawing > draw a stroke > Done > ✕ twice (the review). Pose and light > open the library > × on Your pose 1 (removed). Figure study (the review is still up) > Draw again.', expected: 'A class starts, or the page says the pose is no longer in the library (and offers New class).', actual: 'Nothing happens: the review stays, no toast, no class. The button is dead.', cause: 'js/figure.js:227-228 startClass() filters the pool by byId() and returns silently when nothing is left; the review\'s Draw again (js/figure.js:1017) passes last.pool, which names only the deleted pose.' });
    await clean(t, page, 'saved pose');
  }

  // ================= F. a reload during a class =================
  {
    await click(page, '#fig-new');
    await click(page, '#fig-relaxed');
    await onlyPoses(page, ids);
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'a class for the reload starts');
    await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5], [0.45, 0.7]]);
    t.check(await endPose(page), 'a drawing is done before the reload');
    await page.reload({ waitUntil: 'load' });
    await sleep(300);
    await tab(page, 'figure');
    const s = await setupState(page);
    t.check(s.setup && !s.review && !s.back && !s.draw && !(await page.evaluate(() => !!window.FigureStudy.state())), 'after a reload the class and its drawings are gone and the setup shows, with no Back to your drawings', { setup: s.setup, review: s.review, back: s.back });
    t.check(!s.timed && s.inClass.length === 3 && s.mix === '3 of the 30 poses are in the class, in a random order.', 'the class, the time and the poses taken out are remembered across the reload', { timed: s.timed, n: s.inClass.length, mix: s.mix });
    const help = await page.evaluate(() => document.getElementById('tab-help').textContent);
    t.check(/keeps a class's drawings until you start another or close the page/.test(help), 'How to use says a class\'s drawings last until the page closes', help.length);
    t.note('A reload during a class loses its drawings silently: nothing on the Figure study tab itself says they are kept only until the page closes (How to use > Good to know does, index.html:1196), and the README calls it by design.');
    await clean(t, page, 'reload');
    await page.context().close();
  }

  // ================= G. hostile saved state: figureStudy =================
  {
    const all = ['stand', 'relaxed', 'wave', 'reach', 'think', 'hips', 'point', 'walk', 'run', 'lunge', 'jump', 'throw', 'kick', 'box', 'crouch', 'kneel', 'sit', 'dance', 'attitude', 'seconde', 'passe', 'penche', 'cambre', 'jete', 'reverence', 'flamenco', 'jazz', 'contemporary', 'spiral', 'hiphop'];
    const huge = Array.from({ length: 10000 }, (_, i) => (i === 0 ? 'stand' : i === 5000 ? 'wave' : i === 150 ? 'constructor' : 'junk-' + i));
    const cases = [
      ['a JSON string', '"nope"', { timed: false, secs: '30', inClass: 30 }],
      ['a number', 42, { timed: false, secs: '30', inClass: 30 }],
      ['an array', [1, 2, 3], { timed: false, secs: '30', inClass: 30 }],
      ['not JSON', 'nope{', { timed: false, secs: '30', inClass: 30 }],
      ['mode, secs and out of the wrong types', { mode: ['timed'], secs: { 10: true }, out: { length: 1e9, 0: 'stand' } }, { timed: false, secs: '30', inClass: 30 }],
      ['secs "constructor", out "constructor", mode "constructor"', { mode: 'constructor', secs: 'constructor', out: 'constructor' }, { timed: false, secs: '30', inClass: 30 }],
      ['secs "__proto__", mode "timed" as TIMED, out of junk and prototype names', { mode: 'TIMED', secs: '__proto__', out: [null, 5, {}, [], 'constructor', '__proto__', 'toString', 'stand'] }, { timed: false, secs: '30', inClass: 29, out: ['stand'] }],
      ['timed with secs as the string "10" and out with 10000 entries', { mode: 'timed', secs: '10', out: huge }, { timed: true, secs: '10', inClass: 29, out: ['stand'] }],
      ['timed, 600, every pose out', { mode: 'timed', secs: 600, out: all }, { timed: true, secs: '600', inClass: 0 }],
      ['timed with secs 10.5 (no such time)', { mode: 'timed', secs: 10.5, out: [] }, { timed: true, secs: '30', inClass: 30 }],
    ];
    for (const [label, value, want] of cases) {
      const t0 = Date.now();
      const page = await openPage(site, { storage: { [KEY]: value } });
      await tab(page, 'figure');
      const s = await setupState(page);
      const secs = (Date.now() - t0) / 1000;
      const okOut = want.out ? want.out.every((id) => !s.inClass.includes(id)) : true;
      t.check(s.poses === 30 && s.timed === want.timed && s.secs === want.secs && s.inClass.length === want.inClass && okOut && s.start === (want.inClass === 0) && s.timesHidden === !want.timed, `hostile figureStudy (${label}): ${want.timed ? 'Timed' : 'Relaxed'}, ${want.secs} s, ${want.inClass} poses in, Start ${want.inClass ? 'on' : 'off'}`, { timed: s.timed, secs: s.secs, inClass: s.inClass.length, start: s.start, mix: s.mix });
      t.check(want.inClass === 0 ? s.mix === 'Every pose is out of the class. Tap one to put it back.' && s.plan === '' : want.inClass === 30 ? /^All 30 poses/.test(s.mix) : s.mix === `${want.inClass} of the 30 poses are in the class, in a random order.`, `hostile figureStudy (${label}): the message counts the poses right`, { mix: s.mix, plan: s.plan });
      if (want.inClass) {
        await click(page, '#fig-start');
        t.check(await poseShown(page, 1), `hostile figureStudy (${label}): a class starts`);
        await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5]]);
        t.check((await inked(page, '#fs-paper')) > 50, `hostile figureStudy (${label}): a stroke lands`);
        await stopTwice(page);
        t.check((await setupState(page)).review, `hostile figureStudy (${label}): ✕ twice shows the review`);
      } else {
        await click(page, '#fig-all');
        t.check((await setupState(page)).inClass.length === 30 && !(await setupState(page)).start, `hostile figureStudy (${label}): Put them all back enables Start`);
      }
      if (value === cases[7][1]) { const stored = await storageGet(page, KEY); t.note(`figureStudy with 10000 entries in out: the tab was up ${secs.toFixed(1)} s after the page opened; the store afterwards holds ${stored ? stored.length : 0} characters`); }
      await clean(t, page, `hostile figureStudy (${label})`);
      await page.context().close();
    }
  }

  // ================= H. hostile saved state: figureMixes =================
  {
    const TWYO = { parts: [{ code: 'TW', amount: 1 }, { code: 'YO', amount: 0.5 }] };
    const cases = [
      ['a JSON string', '"nope"', 0],
      ['an object', { parts: [TWYO] }, 0],
      ['junk, prototype-name codes and bad amounts', [null, 1, 'x', { parts: 'TW' }, { parts: [] }, { parts: [{ code: 'constructor', amount: 1 }, { code: '__proto__', amount: 1 }, { code: 'TW', amount: '2' }, { code: 'TW', amount: NaN }, { code: 'TW', amount: 1e9 }, { code: 'YO', amount: 0.5 }] }, { parts: [{ code: 'TW', amount: 1 }], starter: true, c: 'hostile' }], 2],
      ['__proto__ and constructor as keys', '[{"__proto__": {"parts": [{"code":"TW","amount":1}]}, "constructor": 1, "parts": [{"code":"CRL","amount":1}]}]', 1],
      ['a huge array of 3000 mixes', Array.from({ length: 3000 }, () => TWYO), 3000],
    ];
    for (const [label, value, wantKept] of cases) {
      const t0 = Date.now();
      const page = await openPage(site, { storage: { [MIXES]: value } });
      await tab(page, 'figure');
      const s = await page.evaluate(() => { const st = window.FigureStudy.studio.state; return { kept: st.mixes.filter((m) => !m.starter).length, starters: st.mixes.filter((m) => m.starter).length, colors: st.mixes.every((m) => Array.isArray(m.c) && m.c.length === 3), codes: st.mixes.every((m) => m.parts.every((p) => /^[A-Z]+$/i.test(p.code) && p.amount > 0 && p.amount <= 100)) }; });
      t.check(s.kept === wantKept && s.starters === 8 && s.colors && s.codes, `hostile figureMixes (${label}): ${wantKept} kept mix${wantKept === 1 ? '' : 'es'} beside the eight starters, each with a color and real parts`, s);
      await click(page, '#fig-start');
      t.check(await poseShown(page, 1), `hostile figureMixes (${label}): a class starts`);
      await stroke(page, '#fs-paper', [[0.4, 0.3], [0.5, 0.5]]);
      t.check((await inked(page, '#fs-paper')) > 50, `hostile figureMixes (${label}): a stroke lands`);
      if (wantKept > 100) t.note(`figureMixes with 3000 mixes: the first pose was up ${((Date.now() - t0) / 1000).toFixed(1)} s after the page opened`);
      await stopTwice(page);
      await clean(t, page, `hostile figureMixes (${label})`);
      await page.context().close();
    }
  }

  // ================= I. the phone =================
  {
    const page = await openPage(site, { viewport: PHONE, url: '#figure' });
    await tab(page, 'figure');
    await watch(page);
    const s = await setupState(page);
    t.check(s.poses === 30 && s.pictures === 30 && !s.start && (await hscroll(page)) <= 0, 'phone: the setup with 30 pictures, no horizontal scroll', { poses: s.poses, pictures: s.pictures, hscroll: await hscroll(page) });
    await screenshot(page, 'figure-phone-setup');
    await onlyPoses(page, ids);
    await click(page, '#fig-timed'); await click(page, '#fig-t30');
    await click(page, '#fig-start');
    t.check(await poseShown(page, 1), 'phone: the class starts');
    const lay = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
      return { studio: box(document.querySelector('.fig-studio')), bar: inView(document.getElementById('fig-bar')), done: inView(document.getElementById('fig-done')), pause: inView(document.getElementById('fig-pause')), end: inView(document.getElementById('fig-end')), paper: inView(document.getElementById('fs-paper')), clock: inView(document.getElementById('fig-clock')), tabs: getComputedStyle(document.querySelector('.tabs')).display, pauseText: getComputedStyle(document.querySelector('#fig-pause .fig-btn-text')).display, labels: ['fig-pause', 'fig-done', 'fig-end'].map((id) => document.getElementById(id).getAttribute('aria-label')), focus: document.activeElement && document.activeElement.id };
    });
    t.check(lay.studio.x >= 0 && lay.studio.y >= 0 && lay.studio.w <= 390 && lay.studio.h <= 844 && lay.bar && lay.done && lay.pause && lay.end && lay.paper && lay.clock, 'phone: the studio fills the screen with the bar, the clock, Pause, Done, ✕ and the paper all in view', lay);
    t.check(lay.tabs === 'none' && lay.pauseText === 'none' && lay.labels.join('|') === 'Pause the clock|Done: see how this pose went|Stop the class', 'phone: the tabs step aside; Pause is an icon with its label', { tabs: lay.tabs, pauseText: lay.pauseText, labels: lay.labels });
    await screenshot(page, 'figure-phone-pose');
    await click(page, '#fig-pause');
    const held = await page.evaluate(() => ({ text: getComputedStyle(document.querySelector('#fig-pause .fig-btn-text')).display, word: document.querySelector('#fig-pause .fig-btn-text').textContent }));
    t.check(held.text !== 'none' && held.word === 'Resume', 'phone: a held clock shows the word Resume', held);
    await click(page, '#fig-pause');
    await stroke(page, '#fs-paper', [[0.3, 0.3], [0.5, 0.5], [0.4, 0.7]]);
    t.check((await inked(page, '#fs-paper')) > 50, 'phone: a stroke lands', await inked(page, '#fs-paper'));
    t.check(await endPose(page), 'phone: Done shows the card');
    await cardSettled(page);
    const card = await page.evaluate(() => {
      const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
      const pop = document.getElementById('fig-popup');
      return { popup: inView(pop), next: inView(document.getElementById('fig-nextPose')), stop: inView(document.getElementById('fig-stop')), drawing: inView(document.getElementById('fig-drawing')), scrollable: pop.scrollHeight > pop.clientHeight, grade: document.getElementById('fig-grade').textContent, hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    t.check(card.popup && card.next && card.stop && card.drawing && card.grade && card.hscroll <= 0, 'phone: the card fits the screen with the drawing, Next pose and Stop class in reach', card);
    await screenshot(page, 'figure-phone-card');
    await guardOver(page); await click(page, '#fig-stop');
    await page.waitForFunction(() => !window.FigureStudy.state(), null, { timeout: 5000 }).catch(() => null);
    const rv = await page.evaluate(() => ({ review: !document.getElementById('fig-review').hidden, cards: document.querySelectorAll('#fig-cards .fig-card').length, tabs: getComputedStyle(document.querySelector('.tabs')).display, hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, cardW: Math.round(document.querySelector('.fig-card').getBoundingClientRect().width) }));
    t.check(rv.review && rv.cards === 1 && rv.tabs !== 'none' && rv.hscroll <= 0 && rv.cardW <= 390, 'phone: Stop class shows the review, the tabs are back, no horizontal scroll', rv);
    await screenshot(page, 'figure-phone-review');
    const file = await download(page, '#fig-cards .fig-card button');
    t.check(/^figure-1-[a-z0-9-]+\.png$/.test(file || ''), 'phone: Save as PNG downloads the drawing', file);
    await click(page, '#fig-new');
    t.check((await setupState(page)).setup && (await hscroll(page)) <= 0, 'phone: New class returns to the setup without horizontal scroll');
    await clean(t, page, 'phone');
    await page.context().close();
  }
}
