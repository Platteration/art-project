// Value battle, played like a sceptical tester (README: "Value battle"; source js/battle.js): the setup with
// every palette, count and mode (and what Simple mode changes: nothing here); rounds answered by tap, by
// arrow key and by digit, Both the same on a tie and on a non-tie, the three- and four-color questions with
// Start the round over, the miss pop-up's words and chips, the flourish every five, the score pop-up, the
// stars and New best; the clock (1, 2 and 5 minutes), its auto-advance and its pause while the answer shows,
// time's up; the sound switch; ✕ twice; the pinned board at both widths (the whole board on one phone screen);
// thirty rounds read off the page for the closing difficulty and the floor; hostile saved state for the five
// keys; and the orderings: a double answer, two keys at once, keys while the pop-up shows, Enter on the pop-up,
// a tab switch, a resize, a reload and Forget mid-round, and My paints changed on the Study tab between battles.
import { openPage, clean, tab, PHONE, DESKTOP, click, text, visible, hscroll, screenshot, sleep, storageGet, storageKeys, axe } from '../lib.mjs';

const K = { palette: 'portrait-value-studio.battlePalette', count: 'portrait-value-studio.battleCount', mode: 'portrait-value-studio.battleMode', best: 'portrait-value-studio.battleBest', mine: 'portrait-value-studio.myPaints', sound: 'portrait-value-studio.gameSound' };
const PRESETS = ['zorn', 'zorn-blue', 'primary', 'cmy', 'split', 'reilly', 'schmid', 'rembrandt', 'sorolla', 'monet'];
const PAIR_ASK = ['Which color is darker in value?', 'Which color is lighter in value?', 'Which color is cooler in tone?', 'Which color is warmer in tone?'];
const MANY_ASK = ['Tap the color with the darkest value.', 'Tap the color with the lightest value.', 'Tap the colors in order, from darkest to lightest.'];
const GRADES = ['Keep looking', 'Warming up', 'Getting there', 'Good eye', 'Sharp eye!', 'Eagle eye!'];
const STARS = [20, 12, 8, 5, 2];
const starsFor = (streak) => STARS.filter((m) => streak >= m).length;

// ---- helpers of this case -------------------------------------------------------------------------------

// the setup's controls, then Start; resolves once the board shows its swatches
async function start(page, { palette = 'zorn', count = '2', mode = 'streak', timeout = 5000 } = {}) {
  await page.evaluate(([p, c, m]) => {
    const sel = document.getElementById('vb-palette');
    if (sel.value !== p) { sel.value = p; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    document.querySelector(`input[name="vbCount"][value="${c}"]`).click();
    document.querySelector(`input[name="vbMode"][value="${m}"]`).click();
    document.getElementById('vb-start').click();
  }, [palette, count, mode]);
  await page.waitForFunction(() => !document.getElementById('vb-play').hidden && document.querySelectorAll('.vb-swatch').length > 0, null, { timeout }).catch(() => null);
}
// the round as the page holds it (ValueBattle.state() is the live game, exposed for tests), with the line
// the page should say for a right answer, built the way battle.js builds it
const round = (page) => page.evaluate(() => {
  const g = window.ValueBattle && ValueBattle.state(); if (!g) return null;
  const r = g.rounds[g.i]; if (!r) return { i: g.i, none: true };
  const L = ['A', 'B', 'C', 'D'];
  const v = (c) => `V ${(c.L / 10).toFixed(1)}`;
  const tl = (c) => (c.warmth > 0.35 ? 'warm' : c.warmth < -0.35 ? 'cool' : 'in between');
  const side = { left: 'The left one', right: 'The right one', same: 'Both' };
  let why;
  if (r.q.mode === 'pair') {
    const [a, b] = r.colors;
    if (r.q.kind === 'value') { if (r.answer === 'same') why = `Both are the same value: ${v(a)} and ${v(b)}. Different colors, equal in light and dark.`; else { const win = r.answer === 'left' ? a : b, lose = r.answer === 'left' ? b : a; why = `${side[r.answer]} is ${r.q.key}: ${v(win)} against ${v(lose)}.`; } }
    else if (r.answer === 'same') why = `Both lean the same way: ${tl(a)}. The difference is in value, not temperature.`;
    else why = `${side[r.answer]} is ${r.q.key}: it leans more toward ${r.q.key === 'warmer' ? 'orange and yellow' : 'blue and green'} than the other.`;
  } else { const vals = r.colors.map((c, i) => `${L[i]} ${v(c)}`).join(', '); why = r.q.mode === 'pick' ? `${L[r.answer]} is the ${r.q.key}. The values: ${vals}.` : `Darkest to lightest: ${r.answer.map((i) => L[i]).join(', ')}. The values: ${vals}.`; }
  const lv = ValueBattle.levelAt(g.i);
  const m = (c) => (r.q.kind === 'value' ? c.L : c.warmth);
  let d = null;
  if (r.n === 2) d = Math.abs(m(r.colors[1]) - m(r.colors[0]));
  else { const s = r.colors.slice().sort((x, y) => x.L - y.L); d = r.q.mode === 'order' ? Math.min(...s.slice(1).map((c, i) => c.L - s[i].L)) : r.q.dir < 0 ? s[1].L - s[0].L : s[r.n - 1].L - s[r.n - 2].L; }
  return { i: g.i, n: r.n, key: r.q.key, kind: r.q.kind, mode: r.q.mode, ask: r.q.ask, answer: r.answer, Ls: r.colors.map((c) => +c.L.toFixed(2)), labels: r.colors.map(v), warmth: r.colors.map((c) => +c.warmth.toFixed(3)), chroma: r.colors.map((c) => +c.chroma.toFixed(1)), why, d, lo: lv[r.q.kind][0], hi: lv[r.q.kind][1], gap: lv.gap, same: lv.same, answered: g.answered, streak: g.streak, right: g.right, over: g.over, left: g.left, seconds: g.seconds, picked: g.picked.slice() };
});
// what the board and its pop-ups show
const board = (page) => page.evaluate(() => {
  const $ = (id) => document.getElementById('vb-' + id);
  const g = window.ValueBattle && ValueBattle.state();
  return { game: !!g, over: !!(g && g.over), setup: $('setup').hidden, play: $('play').hidden, miss: $('miss').hidden, popup: $('popup').hidden, round: $('round').textContent, score: $('score').textContent, time: $('time').textContent, timeHidden: $('time').hidden, question: $('question').textContent, answer: $('answer').textContent, answerCls: $('answer').className, swatches: document.querySelectorAll('.vb-swatch').length, letters: [...document.querySelectorAll('.vb-letter')].map((l) => l.textContent), lettersShown: [...document.querySelectorAll('.vb-letter')].some((l) => getComputedStyle(l).display !== 'none'), sameShown: getComputedStyle(document.querySelector('.vb-choice[data-choice="same"]')).display !== 'none', sameChosen: document.querySelector('.vb-choice[data-choice="same"]').classList.contains('is-chosen'), undo: $('undo').hidden, next: $('next').hidden, nextText: $('next').textContent, answerRings: [...document.querySelectorAll('.vb-swatch.is-answer')].map((b) => +b.dataset.index), wrongRings: [...document.querySelectorAll('.vb-swatch.is-wrong')].map((b) => +b.dataset.index), badges: [...document.querySelectorAll('.vb-swatch')].map((b) => { const x = b.querySelector('.vb-badge'); return x.hidden ? '' : x.textContent; }), pulse: $('round').classList.contains('is-pulse'), milestone: $('round').classList.contains('is-milestone'), dataMode: document.getElementById('tab-battle').dataset.mode, kicker: $('kicker').textContent, pct: $('pct').textContent, label: $('pctLabel').textContent, grade: $('grade').textContent, newBest: !$('newBest').hidden, stars: document.querySelectorAll('#vb-stars .game-star.is-on').length, starsAria: $('stars').getAttribute('aria-label'), missWhy: $('missWhy').textContent, missNext: $('missNext').textContent, chips: [...document.querySelectorAll('#vb-missChips .vb-chip')].map((c) => ({ text: c.querySelector('.vb-chip-text').textContent, bg: c.querySelector('.vb-chip-color').style.background })), active: document.activeElement && (document.activeElement.id || document.activeElement.className), focus: document.body.classList.contains('battle-focus'), pinned: $('play').classList.contains('is-pinned'), best: $('best').textContent, paletteText: document.getElementById('vb-palette').selectedOptions[0] ? document.getElementById('vb-palette').selectedOptions[0].text : '', options: [...document.getElementById('vb-palette').options].map((o) => o.text), toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : '' };
});
// answer the round as the page holds it: right or wrong, by element click, by a real tap or by key
const press = (page, keys) => keys.reduce((p, k) => p.then(() => page.keyboard.press(k)), Promise.resolve());
async function answer(page, right, how = 'click') {
  const r = await round(page);
  let picks; // swatch indexes to tap, or 'same'
  if (r.mode === 'pair') picks = right ? (r.answer === 'same' ? 'same' : [r.answer === 'left' ? 0 : 1]) : (r.answer === 'same' ? [0] : 'same');
  else if (r.mode === 'pick') picks = [right ? r.answer : (r.answer + 1) % r.n];
  else picks = right ? r.answer : r.answer.slice().reverse();
  if (how === 'key') { if (picks === 'same') await press(page, ['ArrowDown']); else if (r.mode === 'pair') await press(page, picks.map((i) => (i === 0 ? 'ArrowLeft' : 'ArrowRight'))); else await press(page, picks.map((i) => String(i + 1))); }
  else if (how === 'tap') { if (picks === 'same') await page.locator('.vb-choice[data-choice="same"]').click(); else for (const i of picks) await page.locator(`.vb-swatch[data-index="${i}"]`).click(); }
  else await page.evaluate((picks) => { if (picks === 'same') document.querySelector('.vb-choice[data-choice="same"]').click(); else picks.forEach((i) => document.querySelector(`.vb-swatch[data-index="${i}"]`).click()); }, picks);
  return r;
}
const next = (page) => click(page, '#vb-next');
// the pop-up's button by a real click: the id is doubled in the markup (see the first step), so the board's copy
const closeMiss = (page) => page.locator('#vb-board #vb-missNext').click();
const waitRound = (page, n) => page.waitForFunction((n) => document.getElementById('vb-score').textContent === `Round ${n}`, n, { timeout: 4000 }).then(() => true).catch(() => false);
const waitShown = (page, sel) => page.waitForFunction((s) => !document.querySelector(s).hidden, sel, { timeout: 4000 }).then(() => true).catch(() => false);
const waitPct = (page, n) => page.waitForFunction((n) => document.getElementById('vb-pct').textContent === String(n), n, { timeout: 4000 }).then(() => true).catch(() => false);
// the quit guard arms by the page's clock: ✕ within the first 3 s of the page's life is a bug checked on its own
const afterThree = (page) => page.waitForFunction(() => performance.now() > 3100, null, { timeout: 5000 }).catch(() => null);
async function quit(page) { await afterThree(page); await click(page, '#vb-quit'); await click(page, '#vb-quit'); await page.waitForFunction(() => !document.getElementById('vb-setup').hidden, null, { timeout: 3000 }).catch(() => null); }
const rects = (page, sels) => page.evaluate((sels) => { const W = innerWidth, H = innerHeight; const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), in: b.left >= -0.5 && b.top >= -0.5 && b.right <= W + 0.5 && b.bottom <= H + 0.5 && b.width > 0 && b.height > 0 }; }; const out = { W, H, scrollH: document.documentElement.scrollHeight, bodyOverflow: getComputedStyle(document.body).overflow, tabs: getComputedStyle(document.querySelector('.tabs')).display, topbar: getComputedStyle(document.querySelector('.topbar')).display }; for (const s of sels) out[s] = [...document.querySelectorAll(s)].map(r); return out; }, sels);
const allIn = (lay, sels) => sels.every((s) => lay[s].length > 0 && lay[s].every((x) => x.in));

export default async function battleMore(t, site) {
  // ---- the setup: palettes, counts, modes, Simple and Advanced, the best line ----------------------------
  {
    const page = await openPage(site, { url: '#battle' });
    let b = await board(page);
    t.check(!b.setup && b.play && b.options.length === 10 && !b.options.some((o) => /My paints/.test(o)), 'the #battle route opens the setup with the ten known palettes and no My paints (none ticked)', b.options);
    t.check(JSON.stringify(await page.evaluate(() => [...document.getElementById('vb-palette').options].map((o) => o.value))) === JSON.stringify(PRESETS), 'the palettes are the README\'s ten in order');
    const radios = await page.evaluate(() => ({ count: document.querySelector('input[name="vbCount"]:checked').value, mode: document.querySelector('input[name="vbMode"]:checked').value }));
    t.check(radios.count === 'mix' && radios.mode === 'streak', 'the defaults are Mix and Streak', radios);
    t.check(b.best === 'No streak yet for these settings.', 'with nothing played the best line says no streak yet', b.best);
    t.check((await storageKeys(page)).length === 0, 'opening the setup writes nothing', await storageKeys(page));
    for (const [m, want] of [['60', 'No score yet for these settings.'], ['120', 'No score yet for these settings.'], ['300', 'No score yet for these settings.'], ['streak', 'No streak yet for these settings.']]) {
      await page.evaluate((m) => document.querySelector(`input[name="vbMode"][value="${m}"]`).click(), m);
      t.check((await text(page, '#vb-best')) === want, `mode ${m}: the best line says ${want}`, await text(page, '#vb-best'));
    }
    const saved = await page.evaluate((K) => [localStorage.getItem(K.mode), localStorage.getItem(K.count)], K);
    t.check(saved[0] === '"streak"' && saved[1] === null, 'a mode chosen is saved as JSON; a count not touched is not written', saved);
    // Simple mode (the default) and Advanced offer the battle the same palettes: the README narrows only the Study tab
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click());
    const adv = await page.evaluate(() => [...document.getElementById('vb-palette').options].map((o) => o.value));
    await page.evaluate(() => document.querySelector('[data-mode="simple"]').click());
    const simple = await page.evaluate(() => [...document.getElementById('vb-palette').options].map((o) => o.value));
    t.check(adv.length === 10 && simple.length === 10, 'Simple and Advanced both offer all ten palettes to the battle', { adv: adv.length, simple: simple.length });
    t.note('Simple mode narrows the Study tab to three palettes and hides My paints; the battle (and Paint by numbers) list all ten in both modes, and a My paints set ticked earlier in Advanced is still offered in Simple');
    // the duplicate pop-up markup
    const dup = await page.evaluate(() => ({ miss: document.querySelectorAll('#vb-miss').length, popup: document.querySelectorAll('#vb-popup').length, where: [...document.querySelectorAll('#vb-popup')].map((e) => e.parentElement.id) }));
    if (!t.check(dup.miss === 1 && dup.popup === 1, 'the board has one miss pop-up and one score pop-up (unique ids)', dup)) t.finding({ title: 'The battle tab carries a second, dead copy of the miss and score pop-ups with the same ids', severity: 'low', steps: 'Open the site, Games → Value battle, and count the elements with id vb-miss, vb-popup, vb-missNext, vb-again, vb-settings, vb-kicker or vb-pct (document.querySelectorAll).', expected: 'One of each, inside the board (#vb-board).', actual: `Two of each: one inside #vb-board and one as a direct child of #tab-battle (${JSON.stringify(dup.where)}), always hidden. index.html lines 958-981 close the board and the play view and then repeat the two pop-ups (lines 960-979) before a stray </main> (line 981); the copies never show, but duplicate ids are invalid markup and aria-labelledby="vb-kicker" / "vb-missKicker" now name two elements.` });
    await clean(t, page, 'setup');

    // ---- two colors, Streak: tap, keys, double answers, Both the same, the miss, the score ---------------
    await start(page, { count: '2' });
    b = await board(page);
    t.check(b.setup && !b.play && b.pinned && b.focus, 'Start hides the setup and pins the board', { setup: b.setup, play: b.play, pinned: b.pinned, focus: b.focus });
    t.check(b.swatches === 2 && !b.lettersShown && b.sameShown && b.undo && b.next && b.dataMode === 'pair', 'a two-color round: two unlettered swatches, Both the same shown, no undo or next', { swatches: b.swatches, lettersShown: b.lettersShown, sameShown: b.sameShown, undo: b.undo, next: b.next, mode: b.dataMode });
    t.check(b.round === 'Streak 0' && b.score === 'Round 1' && b.timeHidden, 'the bar says Streak 0, Round 1, no clock in Streak mode', { round: b.round, score: b.score, timeHidden: b.timeHidden });
    t.check(b.question === PAIR_ASK[0], 'the first two-color question asks which is darker', b.question);
    const lay = await rects(page, ['#vb-board', '.vb-swatch', '#vb-question', '#vb-choices', '#vb-bar']);
    const tabsBottom = await page.evaluate(() => document.querySelector('.tabs').getBoundingClientRect().bottom);
    t.check(allIn(lay, ['#vb-board', '.vb-swatch', '#vb-question', '#vb-choices', '#vb-bar']) && lay['#vb-board'][0].t >= tabsBottom && lay.bodyOverflow === 'hidden', 'desktop: the pinned board sits below the tabs, inside the window, the page does not scroll', { board: lay['#vb-board'][0], tabsBottom: Math.round(tabsBottom), overflow: lay.bodyOverflow });
    // round 1 by a real tap
    let r = await answer(page, true, 'tap');
    b = await board(page);
    t.check(b.answer === `Right! ${r.why}` && /is-right/.test(b.answerCls), 'round 1 right by tap: the line says Right! with the values', { line: b.answer, want: r.why });
    t.check(b.round === 'Streak 1' && b.pulse && !b.next && b.nextText === 'Next ▸' && b.active === 'vb-next' && !b.sameShown, 'a right answer counts the streak, pulses it, shows Next ▸ and focuses it, hides Both the same', { round: b.round, pulse: b.pulse, next: b.next, active: b.active, sameShown: b.sameShown });
    const rings = r.answer === 'same' ? [0, 1] : [r.answer === 'left' ? 0 : 1];
    t.check(JSON.stringify(b.answerRings) === JSON.stringify(rings) && b.wrongRings.length === 0, 'the right swatch is ringed in gold, none in red', { rings: b.answerRings, want: rings });
    // a double tap: the second tap changes nothing
    await page.evaluate(() => { document.querySelector('.vb-swatch[data-index="0"]').click(); document.querySelector('.vb-swatch[data-index="1"]').click(); document.querySelector('.vb-choice[data-choice="same"]').click(); });
    const b2 = await board(page);
    t.check(b2.round === 'Streak 1' && b2.answer === b.answer && b2.miss, 'answering again in the same round does nothing', { round: b2.round, same: b2.answer === b.answer });
    await press(page, ['Enter']);
    t.check(await waitRound(page, 2), 'Enter on Next ▸ deals round 2');
    b = await board(page);
    t.check(b.question === PAIR_ASK[1] && b.answer === '' && b.answerRings.length === 0 && b.sameShown && b.next, 'round 2 asks which is lighter, the line and rings cleared, Both the same back', { q: b.question, line: b.answer, rings: b.answerRings });
    // round 2 by key; two keys at once count once
    r = await answer(page, true, 'key');
    b = await board(page);
    t.check(b.answer === `Right! ${r.why}` && b.round === 'Streak 2', 'round 2 right by arrow key (or ArrowDown for the tie)', { line: b.answer, want: r.why, round: b.round });
    await page.evaluate(() => { for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowDown']) document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
    t.check((await board(page)).round === 'Streak 2', 'more keys after the answer change nothing');
    await press(page, ['Enter']); await waitRound(page, 3);
    // rounds 3 and 4: cooler and warmer, by key ('=' is the other key for the tie)
    for (const k of [2, 3]) {
      r = await round(page);
      t.check(r.ask === PAIR_ASK[k] && r.chroma.every((c) => c >= 10), `round ${k + 1} asks ${PAIR_ASK[k].split(' ').slice(-3).join(' ')} with colors that have a temperature (chroma ≥ 10)`, { ask: r.ask, chroma: r.chroma });
      if (r.answer === 'same') await press(page, ['=']); else await answer(page, true, 'key');
      b = await board(page);
      t.check(b.answer === `Right! ${r.why}`, `round ${k + 1} right: the line says ${r.answer === 'same' ? 'both lean the same way' : 'which leans where'}`, { line: b.answer, want: r.why });
      await press(page, ['Enter']); await waitRound(page, k + 3);
    }
    // the streak flourish at five
    r = await round(page);
    await answer(page, true);
    b = await board(page);
    t.check(b.round === 'Streak 5' && b.milestone, 'the fifth right answer gets the flourish (is-milestone on the counter)', { round: b.round, milestone: b.milestone });
    await next(page); await waitRound(page, 6);
    r = await answer(page, true); b = await board(page);
    t.note(`after the flourish at five the counter keeps the is-milestone class (and its gold color) through streak 6: ${b.milestone}; the animation itself plays once per five`);
    await next(page); await waitRound(page, 7);
    // Both the same on a non-tie (play on to a round whose answer is not a tie), then the miss pop-up
    let played = 6;
    for (let k = 0; k < 6; k++) { r = await round(page); if (r.answer !== 'same') break; await answer(page, true); played++; await next(page); await waitRound(page, played + 1); }
    t.check(r.answer !== 'same', 'a round without a tie came up to miss on purpose', r.answer);
    await page.locator('.vb-choice[data-choice="same"]').click();
    t.check(await waitShown(page, '#vb-miss'), 'Both the same on a non-tie shows the miss pop-up');
    b = await board(page);
    t.check(b.missWhy === r.why && /Not quite/.test(await text(page, '#vb-missKicker')), 'the pop-up says Not quite and the right answer in words', { why: b.missWhy, want: r.why });
    const order = r.kind === 'value' ? [0, 1].sort((x, y) => r.Ls[x] - r.Ls[y]) : [0, 1];
    const wantChips = order.map((i) => (i === 0 ? 'Left' : 'Right') + (r.kind === 'value' ? r.labels[i] : (r.warmth[i] > 0.35 ? 'warm' : r.warmth[i] < -0.35 ? 'cool' : 'in between')));
    t.check(JSON.stringify(b.chips.map((c) => c.text)) === JSON.stringify(wantChips), 'the chips lay the colors out in order with their values or leans', { chips: b.chips.map((c) => c.text), want: wantChips });
    t.check(b.sameChosen && b.missNext === 'See the score' && b.active === 'vb-missNext', 'the chosen button is marked, the pop-up offers See the score and has the focus', { chosen: b.sameChosen, btn: b.missNext, active: b.active });
    await press(page, ['ArrowLeft', 'ArrowRight', '1', '=']);
    const b3 = await board(page);
    t.check(!b3.miss && b3.round === `Streak ${played}` && b3.popup, 'arrow and digit keys while the pop-up shows do nothing', { miss: b3.miss, round: b3.round });
    await closeMiss(page);
    t.check(await waitShown(page, '#vb-popup') && await waitPct(page, played), 'See the score shows the score pop-up counting up to the streak');
    b = await board(page);
    const stars = starsFor(played);
    t.check(b.kicker === `Streak over after round ${played + 1}` && b.label === 'in a row' && b.stars === stars && b.grade === GRADES[stars] && b.newBest && b.starsAria === `${stars} out of 5 stars, ${played} in a row` && b.active === 'vb-again', `the score pop-up: streak over after round ${played + 1}, ${stars} star(s), ${GRADES[stars]}, New best!, Play again focused`, { kicker: b.kicker, label: b.label, stars: b.stars, grade: b.grade, newBest: b.newBest, aria: b.starsAria, active: b.active });
    t.check(JSON.stringify(JSON.parse(await storageGet(page, K.best))) === JSON.stringify({ 'zorn:2:streak': played }), 'the best is saved under palette:count:mode', await storageGet(page, K.best));
    // ✕ on the score pop-up goes straight to the settings
    await click(page, '#vb-quit');
    b = await board(page);
    t.check(!b.setup && b.play && !b.game && !b.focus && !b.pinned && b.best === `Your best streak here: ${played} in a row.`, '✕ on the score goes to the setup, unpinned, with the best line', { setup: b.setup, play: b.play, best: b.best });
    // out on the first round: nothing saved, no New best, Play again starts at once
    await start(page, { count: '2' });
    await answer(page, false);
    await closeMiss(page);
    await waitShown(page, '#vb-popup'); await waitPct(page, 0);
    b = await board(page);
    t.check(b.kicker === 'Out on the first round' && b.pct === '0' && b.stars === 0 && b.grade === GRADES[0] && !b.newBest, 'a miss on round 1: Out on the first round, 0, no star, Keep looking, no New best', { kicker: b.kicker, pct: b.pct, stars: b.stars, grade: b.grade, newBest: b.newBest });
    t.check(JSON.parse(await storageGet(page, K.best))['zorn:2:streak'] === played, 'a worse game leaves the best alone');
    await click(page, '#vb-again');
    b = await board(page);
    t.check(b.popup && !b.play && b.setup && b.round === 'Streak 0' && b.score === 'Round 1' && b.swatches === 2, 'Play again starts a new game straight away', { popup: b.popup, round: b.round, score: b.score });
    // Enter to close the miss pop-up (the keyboard way) must show the score like the mouse does
    await answer(page, true); await next(page); await waitRound(page, 2);
    await answer(page, false); await waitShown(page, '#vb-miss');
    await press(page, ['Enter']);
    await sleep(150);
    b = await board(page);
    const enterOk = !b.popup && b.over && b.kicker === 'Streak over after round 2';
    t.check(enterOk, 'Enter on the miss pop-up (Streak) shows the score pop-up', { popup: b.popup, over: b.over, play: b.play, round: b.round, score: b.score, kicker: b.kicker });
    if (!enterOk) t.finding({ title: 'Enter on the miss pop-up fires its button twice: in Streak mode the score pop-up is skipped and a new game starts; on the clock a round is skipped', severity: 'medium', steps: 'Games → Value battle, 2 colors, Streak, Start. Answer one round right, Next, answer the next round wrong. With the pop-up ("Not quite … See the score") up, press Enter. Then the same on the clock: 1 min, miss a round, press Enter on "Next ▸".', expected: 'Enter does what the focused See the score button does once: the score pop-up with the stars and New best (Streak), or the next round (clock), as a mouse click gives.', actual: `Streak: no score pop-up; the board shows a fresh game at Round 1, Streak 0 (seen: popup hidden ${b.popup}, score "${b.score}", round "${b.round}"), so the stars and any New best! are never seen (the best is still saved). Clock: the round after the miss is skipped (Round 1 → Round 3). Cause: battle.js line 387 clicks #vb-missNext on keydown, and the button, focused by showMiss (line 369), also gets the browser's own click for Enter; in Streak mode finish() has by then focused Play again (line 429), which takes that second click and starts a new game; on the clock the second click lands on missNext again and deals one more round.` });
    // ✕ twice to quit, and the 3-second window re-arms
    if (!(await board(page)).game || (await board(page)).over) await start(page, { count: '2' });
    await afterThree(page);
    await click(page, '#vb-quit');
    b = await board(page);
    t.check(b.setup && !b.play && b.toast === 'Tap ✕ again to quit this battle', 'the first ✕ keeps playing and says to tap again', { setup: b.setup, toast: b.toast });
    await sleep(3200); // the arm lasts 3 s: a ✕ after that must ask again (no condition to wait on)
    await click(page, '#vb-quit');
    b = await board(page);
    t.check(b.setup && !b.play && b.toast === 'Tap ✕ again to quit this battle', 'a ✕ more than 3 s later asks again instead of quitting', { setup: b.setup, toast: b.toast });
    await click(page, '#vb-quit');
    b = await board(page);
    t.check(!b.setup && b.play && !b.game && !b.focus && !b.pinned, 'the second ✕ within 3 s quits to the setup', { setup: b.setup, game: b.game, focus: b.focus });
    t.check((await page.evaluate(() => document.getElementById('vb-play').style.cssText)) === '', 'quitting clears the pinned sizes');
    await clean(t, page, 'two colors');

    // ---- three and four colors: darkest, lightest, order, Start the round over, the miss, Mix -------------
    await start(page, { count: '3' });
    b = await board(page);
    t.check(b.swatches === 3 && b.lettersShown && JSON.stringify(b.letters) === '["A","B","C"]' && !b.sameShown && b.dataMode === 'pick' && b.question === MANY_ASK[0], 'three colors: lettered A B C, no Both the same, darkest asked first', { swatches: b.swatches, letters: b.letters, sameShown: b.sameShown, q: b.question });
    await press(page, ['4']);
    t.check(!(await round(page)).answered, 'the 4 key does nothing in a three-color round');
    r = await answer(page, true, 'key'); b = await board(page);
    t.check(b.answer === `Right! ${r.why}` && JSON.stringify(b.answerRings) === JSON.stringify([r.answer]), 'darkest by digit key: Right! with every value, the darkest ringed', { line: b.answer, want: r.why, rings: b.answerRings });
    await next(page); await waitRound(page, 2);
    r = await round(page);
    t.check(r.ask === MANY_ASK[1], 'the second three-color question asks the lightest', r.ask);
    await answer(page, true, 'tap'); b = await board(page);
    t.check(b.answer === `Right! ${r.why}`, 'lightest by tap: Right! with every value', { line: b.answer, want: r.why });
    await next(page); await waitRound(page, 3);
    r = await round(page);
    t.check(r.ask === MANY_ASK[2] && r.mode === 'order', 'the third asks for the order darkest to lightest', r.ask);
    await press(page, [String(r.answer[0] + 1)]);
    b = await board(page);
    t.check(b.badges[r.answer[0]] === '1' && !b.undo && (await text(page, '#vb-undo')) === 'Start the round over' && !(await round(page)).answered, 'the first tap numbers its swatch 1 and offers Start the round over', { badges: b.badges, undo: b.undo });
    await press(page, [String(r.answer[0] + 1)]);
    b = await board(page);
    t.check(b.badges.filter(Boolean).length === 1 && JSON.stringify((await round(page)).picked) === JSON.stringify([r.answer[0]]), 'tapping the same swatch again is ignored', { badges: b.badges });
    await page.locator('#vb-undo').click();
    b = await board(page);
    t.check(b.badges.every((x) => x === '') && b.undo && (await round(page)).picked.length === 0, 'Start the round over clears the numbers and hides itself', { badges: b.badges, undo: b.undo });
    await answer(page, true, 'tap'); b = await board(page);
    t.check(b.answer === `Right! ${r.why}` && b.undo && JSON.stringify(b.badges) === JSON.stringify(r.answer.map(() => '').map((_, i) => String(r.answer.indexOf(i) + 1))) && b.round === 'Streak 3', 'the order tapped in full answers the round: Right! Darkest to lightest, the numbers kept', { line: b.answer, want: r.why, badges: b.badges, undo: b.undo });
    await next(page); await waitRound(page, 4);
    await answer(page, true); await next(page); await waitRound(page, 5);
    await answer(page, true); b = await board(page);
    t.check(b.round === 'Streak 5' && b.milestone, 'the flourish at five in a three-color game too', { round: b.round, milestone: b.milestone });
    await next(page); await waitRound(page, 6);
    r = await round(page);
    t.check(r.mode === 'order', 'round 6 asks the order again (the three questions cycle)', r.ask);
    await answer(page, false); // reversed
    t.check(await waitShown(page, '#vb-miss'), 'a wrong order shows the miss pop-up');
    b = await board(page);
    const orderL = [0, 1, 2].sort((x, y) => r.Ls[x] - r.Ls[y]);
    t.check(b.missWhy === r.why && JSON.stringify(b.chips.map((c) => c.text)) === JSON.stringify(orderL.map((i) => 'ABC'[i] + r.labels[i])) && JSON.stringify(b.badges) === JSON.stringify([0, 1, 2].map((i) => String(r.answer.indexOf(i) + 1))) && b.wrongRings.length === 0 && b.answerRings.length === 3, 'the miss pop-up names the right order, the chips run darkest to lightest with letters and values, the swatches show the right numbers', { why: b.missWhy, chips: b.chips.map((c) => c.text), badges: b.badges });
    await closeMiss(page); await waitShown(page, '#vb-popup'); await waitPct(page, 5);
    b = await board(page);
    t.check(b.stars === 2 && b.grade === GRADES[2] && b.newBest && JSON.parse(await storageGet(page, K.best))['zorn:3:streak'] === 5, 'a streak of 5: two stars, Getting there, New best, saved under zorn:3:streak', { stars: b.stars, grade: b.grade, best: await storageGet(page, K.best) });
    await click(page, '#vb-settings');
    b = await board(page);
    t.check(!b.setup && b.best === 'Your best streak here: 5 in a row.', 'Change settings shows the setup with the new best', b.best);
    await start(page, { count: '4' });
    b = await board(page);
    const four = await rects(page, ['.vb-swatch']);
    t.check(b.swatches === 4 && JSON.stringify(b.letters) === '["A","B","C","D"]' && new Set(four['.vb-swatch'].map((x) => x.t)).size === 1, 'four colors: A to D in one row on a wide screen', { letters: b.letters, tops: four['.vb-swatch'].map((x) => x.t) });
    r = await answer(page, true, 'tap'); b = await board(page);
    t.check(b.answer === `Right! ${r.why}`, 'four colors: darkest by tap, the line names all four values', { line: b.answer });
    await screenshot(page, 'battle-more-desktop-four');
    await quit(page);
    await start(page, { count: 'mix' });
    const counts = [];
    for (let k = 0; k < 6; k++) { r = await round(page); counts.push(r.n); await answer(page, true); await next(page); await waitRound(page, k + 2); }
    t.check(JSON.stringify(counts.slice(0, 3).sort()) === '[2,3,4]' && JSON.stringify(counts.slice(3).sort()) === '[2,3,4]', 'Mix deals two, three and four in every three rounds', counts);
    await quit(page);
    await clean(t, page, 'three and four colors');

    // ---- thirty rounds: the gaps the page reports close in and never pass the floor -----------------------
    await start(page, { count: '2' });
    const log = [];
    let tieDiffers = null;
    for (let k = 0; k < 30; k++) {
      r = await round(page);
      await answer(page, true);
      b = await board(page);
      const got = b.answer.match(/V (\d+\.\d)/g) || [];
      log.push({ i: r.i, key: r.key, kind: r.kind, answer: r.answer, d: +r.d.toFixed(2), lo: +r.lo.toFixed(2), hi: +r.hi.toFixed(2), labels: r.labels, line: b.answer, ok: b.answer === `Right! ${r.why}`, reported: got });
      if (r.kind === 'value' && r.answer === 'same' && r.labels[0] !== r.labels[1] && !tieDiffers) tieDiffers = { round: r.i + 1, line: b.answer, Ls: r.Ls };
      await next(page); await waitRound(page, k + 2);
    }
    const value = log.filter((x) => x.kind === 'value' && x.answer !== 'same'), temp = log.filter((x) => x.kind === 'temp' && x.answer !== 'same');
    t.check(log.every((x) => x.ok), 'every one of the thirty lines says Right! with the values the page holds', log.filter((x) => !x.ok).slice(0, 3));
    t.check(value.every((x) => x.d >= x.lo - 1e-6 && x.d <= x.hi + 1e-6), 'every value round sits in its round\'s L* band', value.filter((x) => !(x.d >= x.lo - 1e-6 && x.d <= x.hi + 1e-6)));
    t.check(value.every((x) => x.d >= 1.6) && temp.every((x) => x.d >= 0.08), 'no round is closer than the floor (1.6 L*, 0.08 in warmth)', { minValue: Math.min(...value.map((x) => x.d)), minTemp: Math.min(...temp.map((x) => x.d)) });
    const early = value.filter((x) => x.i < 6).map((x) => x.d), late = value.filter((x) => x.i >= 24).map((x) => x.d);
    t.check(early.length && late.length && Math.max(...late) < Math.min(...early) && Math.max(...late) <= 6, 'the gaps close in: every value gap from round 25 on is under the smallest of the first six, and at most 6 L*', { early, late });
    const apart = (x) => x.reported.length === 2 && Math.abs(+x.reported[0] - +x.reported[1]) >= 0.0999;
    t.check(value.every(apart), 'the values the line reports (0-10 scale) differ by at least 0.1 whenever the answer is not a tie', value.filter((x) => !apart(x)));
    t.note(`thirty rounds, Zorn, two colors: value gaps (L*) by round ${JSON.stringify(value.map((x) => [x.i + 1, x.d]))}; temperature gaps (warmth) ${JSON.stringify(temp.map((x) => [x.i + 1, x.d, x.lo]))}; ties dealt ${log.filter((x) => x.answer === 'same').length}`);
    const tempShort = temp.filter((x) => x.d < x.lo - 1e-6);
    if (tempShort.length) t.note(`with Zorn the early temperature rounds cannot meet the README's "clearly different in temperature": the whole usable pool spans about 0.44 in warmth while the first rounds ask for 0.6 (battle.js EASY.temp, line 98), so makePair's fallback (lines 125-130) deals the nearest pair (${JSON.stringify(tempShort.map((x) => [x.i + 1, x.d, x.lo]))}); the same holds for Rembrandt's earths; a palette with a blue meets the band. The pairs are still a yellow against a red, so the eye can tell them apart; noted, not failed`);
    b = await board(page);
    t.check(b.round === 'Streak 30' && b.milestone, 'thirty in a row, with the flourish at thirty', { round: b.round, milestone: b.milestone });
    await answer(page, false); await waitShown(page, '#vb-miss'); await closeMiss(page); await waitShown(page, '#vb-popup'); await waitPct(page, 30);
    b = await board(page);
    t.check(b.stars === 5 && b.grade === GRADES[5] && b.newBest && b.kicker === 'Streak over after round 31', 'thirty in a row: five stars, Eagle eye!, New best', { stars: b.stars, grade: b.grade, newBest: b.newBest, kicker: b.kicker });
    // a tie whose two values read differently on the 0-10 scale: measured on the dealt rounds (makeRound is
    // pure and exposed), so the check does not depend on the dice of this one game
    const sweep = await page.evaluate(() => { const VB = ValueBattle; const pool = VB.mixPool(Paints.PRESETS[0].paints, 220); const v = (c) => (c.L / 10).toFixed(1); let same = 0, differ = 0; const ex = []; for (const rd of [0, 12, 24, 40]) { const lv = VB.levelAt(rd); for (let k = 0; k < 600; k++) { const r = VB.makeRound(pool, lv, VB.QUESTIONS[k % 2], 2); if (r.answer !== 'same') continue; same++; if (v(r.colors[0]) !== v(r.colors[1])) { differ++; if (ex.length < 3) ex.push(`V ${v(r.colors[0])} and V ${v(r.colors[1])} (${Math.abs(r.colors[0].L - r.colors[1].L).toFixed(2)} L* apart)`); } } } return { same, differ, ex }; });
    const tieOk = sweep.differ === 0;
    t.check(tieOk, 'a Both the same value round names two values that read the same on the 0-10 scale', { ...sweep, inThisGame: tieDiffers });
    if (!tieOk) t.finding({ title: 'A "Both the same" value round can explain itself with two different values ("Both are the same value: V 6.0 and V 6.1")', severity: 'medium', steps: `Games → Value battle, Zorn, 2 colors, Streak. Play until a darker/lighter round whose answer is Both the same (about one value round in five) and press Both the same, or miss it to read the pop-up. ${tieDiffers ? `In this run round ${tieDiffers.round} said "${tieDiffers.line}".` : 'Dealt rounds measured with ValueBattle.makeRound: ' + sweep.ex.join('; ') + '.'}`, expected: 'The README says a tie is "paired so the colors really are the same in what is asked (equal value …)", and the line shows values that read equal on the scale it shows, or says they are within a hair.', actual: `${sweep.differ} of ${sweep.same} tie rounds dealt (${Math.round(100 * sweep.differ / sweep.same)}%) show two different values: a tie is any pair under 0.9 L* apart (battle.js line 108, SAME.value) while the values are shown to 0.1 on the 0-10 scale, i.e. 1 L* steps (line 243, vLabel), so a pair 0.3 to 0.9 L* apart often straddles a step. The miss pop-up's chips show the same two values under "Both are the same value".` });
    await clean(t, page, 'thirty rounds');

    // ---- the clock: 1, 2 and 5 minutes, auto-advance, the pause while a miss shows, time's up -------------
    await click(page, '#vb-settings');
    for (const [m, shown] of [['120', '2:00'], ['300', '5:00']]) {
      await start(page, { count: '2', mode: m });
      b = await board(page);
      t.check(!b.timeHidden && b.time === shown && b.round === '0 right', `the ${+m / 60}-minute clock starts at ${shown} with 0 right`, { time: b.time, round: b.round });
      await quit(page);
    }
    await start(page, { count: '2', mode: '60' });
    b = await board(page);
    t.check(b.time === '1:00' && !b.timeHidden, 'the 1-minute clock starts at 1:00', b.time);
    await answer(page, true);
    const t0 = Date.now();
    const auto = await waitRound(page, 2);
    t.check(auto && Date.now() - t0 < 2500 && (await board(page)).round === '1 right', 'on the clock a right answer moves on by itself (no Next needed)', { ms: Date.now() - t0, round: (await board(page)).round });
    r = await answer(page, false); await waitShown(page, '#vb-miss');
    const p1 = await page.evaluate(() => ({ time: document.getElementById('vb-time').textContent, left: ValueBattle.state().left }));
    await sleep(1200); // the clock must stand still while the answer shows: no condition to wait on, so a short wait
    const p2 = await page.evaluate(() => ({ time: document.getElementById('vb-time').textContent, left: ValueBattle.state().left }));
    b = await board(page);
    t.check(p1.left === p2.left && p1.time === p2.time && b.missNext === 'Next ▸' && b.missWhy === r.why, 'the clock pauses while the miss shows, whose button says Next ▸', { p1, p2, btn: b.missNext });
    await closeMiss(page);
    t.check(await waitRound(page, 3), 'Next ▸ deals round 3');
    const resumed = await page.waitForFunction((was) => document.getElementById('vb-time').textContent !== was, p2.time, { timeout: 5000 }).then(() => true).catch(() => false);
    t.check(resumed, 'the clock runs again after the pop-up closes', await text(page, '#vb-time'));
    // Enter on the clock's miss pop-up must deal exactly one round
    await answer(page, false); await waitShown(page, '#vb-miss');
    await press(page, ['Enter']); await sleep(150);
    b = await board(page);
    t.check(b.miss && b.score === 'Round 4', 'Enter on the miss pop-up (clock) deals round 4, not more', { score: b.score, miss: b.miss });
    // time's up mid-round: the round is void, the score by right answers a minute
    await page.evaluate(() => { ValueBattle.state().left = 0.3; });
    t.check(await waitShown(page, '#vb-popup') && await waitPct(page, 1), 'when the clock runs out mid-round the score pops up');
    b = await board(page);
    t.check(/^Time's up · \d+ missed$/.test(b.kicker) && b.label === 'right' && b.pct === '1' && b.stars === 1 && b.grade === GRADES[1] && b.time === '0:00' && b.newBest, "Time's up with the misses counted, 1 right, one star (1 a minute), Warming up, New best", { kicker: b.kicker, label: b.label, pct: b.pct, stars: b.stars, grade: b.grade, time: b.time, newBest: b.newBest });
    await click(page, '#vb-settings');
    t.check((await text(page, '#vb-best')) === 'Your best here: 1 right in 1 minute.' && JSON.parse(await storageGet(page, K.best))['zorn:2:60'] === 1, 'the clock\'s best line: right in 1 minute, saved under zorn:2:60', await text(page, '#vb-best'));
    // the clock out just as a miss shows: closing the answer ends the game
    await start(page, { count: '2', mode: '60' });
    await answer(page, false); await waitShown(page, '#vb-miss');
    await page.evaluate(() => { ValueBattle.state().left = 0; });
    await closeMiss(page);
    t.check(await waitShown(page, '#vb-popup'), 'with no time left, closing the answer ends the game');
    b = await board(page);
    t.check(b.kicker === "Time's up · 1 missed" && b.pct === '0' && !b.newBest, "Time's up · 1 missed, 0 right, no New best", { kicker: b.kicker, pct: b.pct, newBest: b.newBest });
    await click(page, '#vb-settings');
    await clean(t, page, 'the clock');

    // ---- the sound switch: the game's, which covers the battle's clicks and chime --------------------------
    await page.evaluate(() => { window.__nodes = 0; for (const n of ['createOscillator', 'createBufferSource']) { const o = AudioContext.prototype[n]; AudioContext.prototype[n] = function () { window.__nodes++; return o.apply(this, arguments); }; } });
    await start(page, { count: '2' });
    await answer(page, true, 'tap');
    await sleep(200);
    const onNodes = await page.evaluate(() => window.__nodes);
    t.check((await page.evaluate(() => GameSound.on())) && onNodes > 0, 'with the sound on, a tap on a swatch makes a sound (audio nodes created)', onNodes);
    await page.evaluate(() => document.getElementById('gameSound').click());
    t.check(!(await page.evaluate(() => GameSound.on())) && (await storageGet(page, K.sound)) === 'false', 'the game\'s speaker switch turns the sound off and remembers it', await storageGet(page, K.sound));
    await next(page); await waitRound(page, 2);
    await page.evaluate(() => { window.__nodes = 0; });
    await answer(page, true, 'tap'); await sleep(200);
    t.check((await page.evaluate(() => window.__nodes)) === 0, 'with the sound off a tap and a right answer\'s chime make no sound', await page.evaluate(() => window.__nodes));
    await page.evaluate(() => document.getElementById('gameSound').click());
    t.check(await page.evaluate(() => GameSound.on()), 'the switch turns the sound back on');
    t.note('the battle board has no speaker button of its own: the switch that covers it is the one in the Paint by numbers bar (#gameSound), reachable only while a Paint by numbers game is on, so on a phone a battle cannot be silenced from the board');
    await quit(page);
    await clean(t, page, 'sound');
    await page.context().close();
  }

  // ---- ✕ within the first 3 seconds of the page ----------------------------------------------------------
  {
    const page = await openPage(site, { url: '#battle' });
    await start(page, { count: '2' });
    const at = await page.evaluate(() => performance.now());
    if (at < 2900) {
      await click(page, '#vb-quit');
      const b = await board(page);
      const ok = b.setup && !b.play && b.toast === 'Tap ✕ again to quit this battle';
      t.check(ok, 'a single ✕ right after the page opened asks to tap again, like any other time', { at: Math.round(at), setup: b.setup, play: b.play, game: b.game, toast: b.toast });
      if (!ok) t.finding({ title: 'In the first 3 seconds after the page opens, one tap on ✕ quits the battle with no "tap again"', severity: 'low', steps: 'Open the site at #battle (or reload it there) and within 3 seconds press Start the battle, then tap ✕ once.', expected: 'The toast "Tap ✕ again to quit this battle" and the game goes on, as it does later (the README: tap ✕ twice).', actual: `The battle ends at once and the setup shows (here ${Math.round(at)} ms after the page opened, no toast). Cause: battle.js line 434 starts quitArmed at 0, and line 437 arms only when performance.now() - quitArmed > 3000, so for the page's first 3 s the guard reads as already armed.` });
    } else t.note(`the page took ${Math.round(at)} ms to reach Start, past the 3 s window the early-✕ check needs; not checked this run`);
    await clean(t, page, 'early quit');
    await page.context().close();
  }

  // ---- the phone: the whole board on one screen for every count, the pop-ups inside it -------------------
  {
    const page = await openPage(site, { url: '#battle', viewport: PHONE });
    t.check((await hscroll(page)) <= 0 && !(await board(page)).setup, 'phone: the setup shows without horizontal scroll');
    // (the answer line and the answer row are empty, zero-width boxes until something fills them: not listed)
    const sels = ['#vb-board', '#vb-bar', '#vb-round', '#vb-quit', '#vb-question', '.vb-swatch'];
    for (const count of ['4', '3', '2']) {
      await start(page, { count });
      let lay = await rects(page, sels.concat(['.vb-choice[data-choice="same"]']));
      const inside = allIn(lay, sels) && (count !== '2' || lay['.vb-choice[data-choice="same"]'][0].in);
      t.check(inside && lay['#vb-board'][0].t === 0 && lay['#vb-board'][0].b === 844 && lay['#vb-board'][0].l === 0 && lay['#vb-board'][0].r === 390 && lay.scrollH <= 844 && lay.bodyOverflow === 'hidden', `phone, ${count} colors: the board fills the 390 × 844 screen and everything on it is inside, no scroll`, { board: lay['#vb-board'][0], swatches: lay['.vb-swatch'], question: lay['#vb-question'], choices: lay['#vb-choices'], scrollH: lay.scrollH });
      t.check(lay.tabs === 'none' && lay.topbar === 'none', `phone, ${count} colors: the tabs and header step aside`, { tabs: lay.tabs, topbar: lay.topbar });
      if (count === '4') t.check(new Set(lay['.vb-swatch'].map((x) => x.t)).size === 2 && lay['.vb-swatch'].every((x) => x.r - x.l >= 100), 'phone, 4 colors: two rows of two, each at least 100 px', lay['.vb-swatch'].map((x) => [x.t, x.r - x.l]));
      if (count === '3') {
        t.check(new Set(lay['.vb-swatch'].map((x) => x.t)).size === 1, 'phone, 3 colors: one row of three', lay['.vb-swatch'].map((x) => x.t));
        await answer(page, true); await next(page); await waitRound(page, 2); await answer(page, true); await next(page); await waitRound(page, 3);
        lay = await rects(page, sels.concat(['#vb-undo']));
        await press(page, ['1']);
        const withUndo = await rects(page, ['#vb-undo', '#vb-question']);
        t.check(allIn(lay, sels) && withUndo['#vb-undo'][0].in && withUndo['#vb-question'][0].in && withUndo['#vb-question'][0].r <= 390, 'phone: the order question and Start the round over fit on the screen', { question: withUndo['#vb-question'][0], undo: withUndo['#vb-undo'][0] });
        await screenshot(page, 'battle-more-phone-order');
      }
      await answer(page, false); await waitShown(page, '#vb-miss');
      lay = await rects(page, ['#vb-miss', '#vb-missNext', '.vb-chip']);
      t.check(allIn(lay, ['#vb-miss', '#vb-missNext', '.vb-chip']), `phone, ${count} colors: the miss pop-up and its chips sit inside the screen`, { miss: lay['#vb-miss'][0], chips: lay['.vb-chip'].length });
      if (count === '4') await screenshot(page, 'battle-more-phone-miss');
      await closeMiss(page); await waitShown(page, '#vb-popup');
      lay = await rects(page, ['#vb-popup', '#vb-again', '#vb-settings', '#vb-stars']);
      t.check(allIn(lay, ['#vb-popup', '#vb-again', '#vb-settings', '#vb-stars']), `phone, ${count} colors: the score pop-up sits inside the screen`, lay['#vb-popup'][0]);
      await click(page, '#vb-settings');
    }
    const after = await rects(page, ['#vb-setup']);
    t.check(after.tabs !== 'none' && after.topbar !== 'none' && !(await board(page)).focus && (await hscroll(page)) <= 0, 'phone: after the game the tabs and header are back, no horizontal scroll', { tabs: after.tabs, topbar: after.topbar });
    await clean(t, page, 'phone');
    await page.context().close();
  }

  // ---- hostile saved state for the five keys, on the #battle route ----------------------------------------
  {
    // the right types with values the setup has no row for, and best entries of the wrong type
    // (the record is written as JSON text so that "__proto__" is an own key of the saved object)
    const page = await openPage(site, { url: '#battle', storage: { [K.count]: '"7"', [K.mode]: '"90"', [K.palette]: '"constructor"', [K.best]: '{"zorn:mix:streak":"constructor","zorn:2:streak":[1,2],"zorn:3:streak":{"a":1},"zorn:4:streak":-5,"zorn:2:60":true,"zorn:3:60":"7","__proto__":{"zorn:4:60":99},"constructor":5,"toString":"x"}', [K.mine]: ['TW', 'TW', 'constructor', '__proto__', 'hasOwnProperty', 1, {}, null, 'YO'] } });
    let b = await board(page);
    const radios = await page.evaluate(() => ({ count: (document.querySelector('input[name="vbCount"]:checked') || {}).value || null, mode: (document.querySelector('input[name="vbMode"]:checked') || {}).value || null, palette: document.getElementById('vb-palette').value }));
    t.check(radios.palette === 'zorn' && !b.setup, 'a saved palette named constructor falls back to Zorn', radios);
    const radioOk = radios.count === 'mix' && radios.mode === 'streak';
    t.check(radioOk, 'a saved count "7" and mode "90" fall back to Mix and Streak in the setup', radios);
    if (!radioOk) t.finding({ title: 'A saved count or mode the setup has no row for leaves no row chosen, while the game silently plays Mix and Streak', severity: 'low', steps: 'With localStorage portrait-value-studio.battleCount set to "7" (the JSON string) and portrait-value-studio.battleMode to "90", open the site at #battle.', expected: 'Mix and Streak chosen, as for a value of the wrong type (battle.js load(), line 34) or no value at all.', actual: `No Colors in a round and no Mode row is chosen (${JSON.stringify(radios)}); Start then plays Mix and Streak (count() and mode(), lines 170-172, fall back when nothing is checked). Cause: renderSetup() lines 181-183 set each radio's checked to value === saved, with no fallback when none matches.` });
    t.check(b.options.includes('My paints (2)'), 'My paints with duplicates, prototype names, numbers and objects is offered with the two real codes', b.options);
    const bestOk = b.best === 'No streak yet for these settings.';
    t.check(bestOk, 'a best entry of the wrong type (a string) reads as no best', b.best);
    const bests = [];
    for (const [c, m] of [['2', 'streak'], ['3', 'streak'], ['4', 'streak'], ['2', '60'], ['3', '60'], ['4', '60']]) { await page.evaluate(([c, m]) => { document.querySelector(`input[name="vbCount"][value="${c}"]`).click(); document.querySelector(`input[name="vbMode"][value="${m}"]`).click(); }, [c, m]); bests.push(await text(page, '#vb-best')); }
    t.check(bests[2] === 'No streak yet for these settings.' || bests[2] === 'Your best streak here: 0 in a row.' ? true : false, 'a negative best is not shown as a streak', bests[2]);
    t.check(bests[5] === 'No score yet for these settings.', 'a best under a prototype-named key in the record does not leak into a real key', bests[5]);
    // a game under the key whose entry is "constructor": one right, then a miss
    await start(page, { count: 'mix', mode: 'streak' });
    await answer(page, true); await next(page); await waitRound(page, 2);
    await answer(page, false); await waitShown(page, '#vb-miss'); await closeMiss(page); await waitShown(page, '#vb-popup'); await waitPct(page, 1);
    b = await board(page);
    const store = JSON.parse(await storageGet(page, K.best));
    const savedOk = b.newBest && store['zorn:mix:streak'] === 1;
    t.check(savedOk, 'a streak of 1 over a best that is not a number is a New best and is saved', { newBest: b.newBest, entry: store['zorn:mix:streak'] });
    if (!bestOk || !savedOk) t.finding({ title: 'A best score of the wrong type is shown word for word in the setup and blocks every later best for those settings', severity: 'low', steps: 'Set localStorage portrait-value-studio.battleBest to {"zorn:mix:streak":"constructor","zorn:2:streak":[1,2],"zorn:3:streak":{"a":1},"zorn:4:streak":-5} and open the site at #battle; read the best line for each count; then play Mix / Streak, get one right and miss.', expected: 'An entry that is not a number counts as no best ("No streak yet for these settings."), and the streak of 1 is a New best and is saved over it.', actual: `The setup says "${bests[0]}", "${bests[1]}", "${bests[2]}" and (Mix) "constructor in a row"; after the game New best is ${b.newBest ? 'shown' : 'hidden'} and the entry is still ${JSON.stringify(store['zorn:mix:streak'])}. Cause: load() (battle.js line 34) checks the record's type but not its entries; showBest() (line 188) prints the entry as it is, and finish() (line 411) saves only when score > bests[key], which is false against a string, an array or an object.` });
    await clean(t, page, 'hostile values');
    await page.context().close();
  }
  {
    // the wrong types entirely, and a record of sixty bests
    const sixty = {}; for (let i = 0; i < 60; i++) sixty[`p${i}:2:streak`] = i + 1;
    const page = await openPage(site, { url: '#battle', storage: { [K.count]: 7, [K.mode]: true, [K.palette]: ['zorn'], [K.best]: sixty, [K.mine]: '"TW"' } });
    let b = await board(page);
    const radios = await page.evaluate(() => ({ count: (document.querySelector('input[name="vbCount"]:checked') || {}).value || null, mode: (document.querySelector('input[name="vbMode"]:checked') || {}).value || null, palette: document.getElementById('vb-palette').value }));
    t.check(radios.count === 'mix' && radios.mode === 'streak' && radios.palette === 'zorn' && !b.options.some((o) => /My paints/.test(o)) && b.best === 'No streak yet for these settings.', 'a count, mode, palette and My paints of the wrong type fall back to the defaults', { radios, options: b.options.length, best: b.best });
    await start(page, { count: '2' });
    await answer(page, true); await next(page); await waitRound(page, 2); await answer(page, false); await waitShown(page, '#vb-miss'); await closeMiss(page); await waitShown(page, '#vb-popup');
    const keys = Object.keys(JSON.parse(await storageGet(page, K.best)));
    t.check(keys.length === 50 && keys[keys.length - 1] === 'zorn:2:streak' && !keys.includes('p0:2:streak') && keys.includes('p11:2:streak'), 'a record of sixty bests is pruned to the fifty most recent when a new one is saved', { n: keys.length, first: keys[0], last: keys[keys.length - 1] });
    t.note('battle bests are pruned to fifty keys like the game\'s photo bests (battle.js line 37), though a battle best is one of at most 11 palettes × 4 counts × 4 modes; the README promises the fifty-limit for photos only');
    await clean(t, page, 'hostile types');
    await page.context().close();
  }
  {
    // two whites in My paints: a set the setup accepts (two ticks) but the pool cannot mix
    const page = await openPage(site, { url: '#battle', storage: { [K.mine]: ['TW', 'LW'] } });
    let b = await board(page);
    t.check(b.options.includes('My paints (2)'), 'two whites ticked: My paints (2) is offered', b.options);
    await start(page, { palette: 'mine', count: '2', timeout: 1500 });
    b = await board(page);
    const whitesOk = page.log.pageerrors.length === 0 && (b.swatches === 2 || !b.setup);
    t.check(whitesOk, 'Start with two whites either deals a round or says the paints cannot make colors', { errors: page.log.pageerrors.map((e) => e.split('\n')[0]), swatches: b.swatches, setup: b.setup, play: b.play });
    if (!whitesOk) t.finding({ title: 'My paints of two whites crashes Start the battle: a page error, an empty board and the guard\'s "did not start" note', severity: 'high', steps: 'Advanced, Study tab, Colors and paints, My paints, Choose my paints, tick Titanium White and Lead White only, Done. Games → Value battle, Palette: My paints (2), Start the battle.', expected: 'A battle (white mixes differ a little in value), or a word in the setup that these paints make no colors to compare, with Start disabled.', actual: `${page.log.pageerrors[0] ? page.log.pageerrors[0].split('\n')[0] : 'a page error'}; the setup is hidden and the board shows with no swatches, and the guard's note says part of the site did not start and to reload. Cause: mixPool (battle.js line 65) makes nothing when no paint is a color, so makePair's usable list is empty and its fallback (lines 127-129) pairs undefined, which measure() (line 110) reads at line 132.` });
    await clean(t, page, 'two whites');
    await page.context().close();
  }
  {
    // white and black: a value-only set, fine until the first temperature question
    const page = await openPage(site, { url: '#battle', storage: { [K.mine]: ['TW', 'IB'] } });
    await start(page, { palette: 'mine', count: '2' });
    const seen = [];
    for (let k = 0; k < 3 && page.log.pageerrors.length === 0; k++) { const r = await round(page); seen.push([r.key, r.chroma]); await answer(page, true); await next(page).catch(() => null); await sleep(150); }
    const b = await board(page);
    const bwOk = page.log.pageerrors.length === 0 && b.score === 'Round 4';
    t.check(bwOk, 'white and black: the game goes on past the temperature questions (which it says never come for gray colors)', { errors: page.log.pageerrors.map((e) => e.split('\n')[0]), seen, score: b.score, question: b.question, next: b.next });
    if (!bwOk) t.finding({ title: 'My paints of a white and a black (a value-only palette) crashes at the third round: the board freezes with a dead Next ▸ and the guard says to reload', severity: 'high', steps: 'Advanced, Study tab, Colors and paints, My paints, Choose my paints, tick Titanium White and Ivory Black only, Done. Games → Value battle, Palette: My paints (2), 2 colors, Streak, Start. Answer the first two rounds (darker, lighter) and press Next ▸ each time.', expected: 'The README: "colors too gray to have a temperature never get a temperature question", so round 3 is another value question (or the setup says this palette makes no colors with a temperature).', actual: `Round 3 never shows: "${page.log.pageerrors[0] ? page.log.pageerrors[0].split('\n')[0] : 'a page error'}" when Next ▸ is pressed after round 2 (every mix has chroma under 10: ${JSON.stringify(seen.map((s) => s[1]))}), the board stays on round 2 with Next ▸ showing and doing nothing, and the guard's note says part of the site did not start and to reload. Cause: makePair (battle.js line 113) keeps only colors with chroma ≥ 10 for a temperature question, and with none left its fallback (lines 127-129) pairs undefined, which measure() (line 110) reads at line 132; nothing skips the temperature questions for a gray palette (nextRound, line 238, deals the four pair questions in turn).` });
    await clean(t, page, 'white and black');
    await page.context().close();
  }

  // ---- My paints ticked on the Study tab, changed between two battles -------------------------------------
  {
    const page = await openPage(site);
    const tick = async (codes, untick = []) => {
      await tab(page, 'study');
      await page.evaluate(() => { document.querySelector('[data-mode="advanced"]').click(); document.getElementById('drawer-colors').open = true; document.getElementById('srcMine').click(); });
      await page.waitForFunction(() => !document.getElementById('minePane').hidden, null, { timeout: 3000 }).catch(() => null);
      await click(page, '#mineEdit');
      await page.waitForFunction(() => document.getElementById('paintDialog').open && document.querySelectorAll('#paintCats input').length > 0, null, { timeout: 3000 }).catch(() => null);
      await page.evaluate(([codes, untick]) => { for (const c of codes) { const b = document.querySelector(`#paintCats input[value="${c}"]`); if (!b.checked) b.click(); } for (const c of untick) { const b = document.querySelector(`#paintCats input[value="${c}"]`); if (b.checked) b.click(); } }, [codes, untick]);
      await click(page, '#paintDialogDone');
      await page.waitForFunction(() => !document.getElementById('paintDialog').open, null, { timeout: 3000 }).catch(() => null);
    };
    await tick(['TW']);
    await tab(page, 'battle');
    let b = await board(page);
    t.check(!b.options.some((o) => /My paints/.test(o)) && JSON.parse(await storageGet(page, K.mine)).length === 1, 'one paint ticked: no My paints in the battle', b.options);
    await tick(['TW', 'YO']);
    await tab(page, 'battle');
    b = await board(page);
    t.check(b.options.includes('My paints (2)'), 'two paints ticked on the Study tab: My paints (2) is offered', b.options);
    await tick(['TW', 'YO', 'CRL']);
    await tab(page, 'battle');
    b = await board(page);
    t.check(b.options.includes('My paints (3)') && !b.options.includes('My paints (2)'), 'a third tick renames it My paints (3)', b.options);
    await start(page, { palette: 'mine', count: '2' });
    const codes = await page.evaluate(() => [...new Set(ValueBattle.state().pool.flatMap((c) => c.recipe.split(' · ').map((s) => s.split(' ')[0])))].sort());
    t.check(JSON.stringify(codes) === '["CRL","TW","YO"]', 'a battle with My paints mixes from the ticked paints only', codes);
    await answer(page, true); await next(page); await waitRound(page, 2);
    await answer(page, false); await waitShown(page, '#vb-miss'); await closeMiss(page); await waitShown(page, '#vb-popup'); await waitPct(page, 1);
    t.check(JSON.parse(await storageGet(page, K.best))['mine:2:streak'] === 1, 'the best is filed under mine:2:streak', await storageGet(page, K.best));
    // with the score pop-up still up, the ticks change on the Study tab (down to one paint), then back
    await tick([], ['YO', 'CRL']);
    await tab(page, 'battle');
    b = await board(page);
    t.check(!b.popup && b.pinned, 'back on the battle tab the score pop-up is still up and the board pinned', { popup: b.popup, pinned: b.pinned });
    await click(page, '#vb-settings');
    b = await board(page);
    const listOk = !b.options.some((o) => /My paints/.test(o));
    t.check(listOk, 'Change settings after the ticks dropped to one: My paints is no longer offered', { options: b.options, selected: b.paletteText, best: b.best });
    await start(page, { palette: await page.evaluate(() => document.getElementById('vb-palette').value), count: '2' });
    const codes2 = await page.evaluate(() => [...new Set(ValueBattle.state().pool.flatMap((c) => c.recipe.split(' · ').map((s) => s.split(' ')[0])))].sort());
    const selected = await page.evaluate(() => document.getElementById('vb-palette').selectedOptions[0].text);
    const playsWhatItSays = /My paints/.test(selected) ? codes2.every((c) => ['TW'].includes(c)) : true;
    t.check(playsWhatItSays, 'the battle mixes from the palette the setup names', { selected, codes: codes2 });
    await answer(page, true); await next(page); await waitRound(page, 2); await answer(page, false); await waitShown(page, '#vb-miss'); await closeMiss(page); await waitShown(page, '#vb-popup'); await waitPct(page, 1);
    const store = JSON.parse(await storageGet(page, K.best));
    if (!listOk || !playsWhatItSays) t.finding({ title: 'After the ticked paints change on the Study tab, Change settings still offers the old "My paints (3)", and Start then silently plays Zorn under that name', severity: 'medium', steps: 'Advanced, Study tab, Colors and paints, My paints, Choose my paints: tick TW, YO and CRL, Done. Games → Value battle, Palette: My paints (3), 2 colors, Streak, Start; one right, one wrong, See the score (leave the score up). Study tab: Choose my paints, untick YO and CRL, Done. Value battle tab, Change settings, Start the battle.', expected: 'The setup lists the palettes afresh: no My paints with one paint ticked (or "My paints (n)" with the new count), and the battle mixes from the palette the setup names.', actual: `The setup still says "${selected}"${b.best ? ` with the best line "${b.best}"` : ''}, and the battle deals mixes of ${JSON.stringify(codes2)} (Zorn's paints); its best is filed under ${JSON.stringify(Object.keys(store).filter((k) => /:2:streak$/.test(k)))}. Cause: Change settings (battle.js line 432) and ✕ call showBest() but not renderSetup(), which runs only on a tab switch with no game (lines 459-463); paletteNow() (line 174) then finds no "mine" in the fresh list and falls back to the first palette, Zorn, without a word.` });
    // ✕ on the score, then no ticks at all: the next visit to the tab rebuilds the list
    await click(page, '#vb-quit');
    await tab(page, 'study');
    await page.evaluate(() => { document.getElementById('srcMine').click(); });
    await click(page, '#mineEdit'); await page.waitForFunction(() => document.getElementById('paintDialog').open, null, { timeout: 3000 }).catch(() => null);
    await click(page, '#paintNone'); await click(page, '#paintDialogDone');
    await tab(page, 'battle');
    b = await board(page);
    t.check(!b.options.some((o) => /My paints/.test(o)) && (await page.evaluate(() => document.getElementById('vb-palette').value)) === 'zorn' && JSON.parse(await storageGet(page, K.mine)).length === 0, 'with no game on, coming back to the tab after Untick all rebuilds the list: My paints gone, Zorn selected', { options: b.options, value: await page.evaluate(() => document.getElementById('vb-palette').value) });
    await clean(t, page, 'my paints');
    await page.context().close();
  }

  // ---- mid-round: a tab switch, a resize, keys off the tab, a reload, Forget; axe on the board -------------
  {
    const page = await openPage(site, { url: '#battle', bypassCSP: true });
    await page.evaluate(() => localStorage.setItem('portrait-value-studio.battleBest', JSON.stringify({ 'zorn:2:streak': 3 })));
    await start(page, { count: '2' });
    const q = await text(page, '#vb-question');
    const v = await axe(page);
    const serious = v.filter((x) => x.impact === 'critical' || x.impact === 'serious');
    const axeOk = serious.length === 0;
    t.check(axeOk, 'axe: no serious or critical issue on the board while a round is on', serious);
    if (!axeOk) t.finding({ title: 'The streak counter on the board fails the contrast axe asks for (serious), while the rest of the site passes', severity: 'low', steps: 'Games → Value battle, Start the battle, run axe-core on the page (tests/lib.mjs axe()).', expected: 'No serious or critical issue, as the smoke case holds every tab to (it runs axe with the setup showing, before a game is on).', actual: `${serious.map((x) => `${x.id} (${x.impact}) on ${x.nodes.join(', ')}`).join('; ')}: the counter is #f3eee2 at 1.15rem bold (styles.css line 1655, .vb-round) on the board's #8c8a86 (line 1652, .vb-board), about 2.9:1 where 4.5:1 is asked for text under 24 px.` });
    await tab(page, 'study');
    await press(page, ['ArrowLeft', 'ArrowRight', 'ArrowDown', '1']);
    let b = await board(page);
    t.check(!b.focus && !b.pinned && b.game && !(await round(page)).answered && (await page.evaluate(() => document.getElementById('vb-play').style.cssText)) === '', 'on another tab the board is unpinned, the game kept, and the keys do nothing', { focus: b.focus, pinned: b.pinned, answered: (await round(page)).answered });
    await tab(page, 'battle');
    b = await board(page);
    t.check(b.focus && b.pinned && !b.play && b.question === q && b.score === 'Round 1', 'back on the tab the same round is there, pinned again', { question: b.question, q, score: b.score });
    await press(page, ['Enter']);
    t.check((await board(page)).score === 'Round 1' && !(await round(page)).answered, 'Enter with nothing answered does nothing');
    await page.setViewportSize(PHONE);
    await page.waitForFunction(() => document.getElementById('vb-board').getBoundingClientRect().width === 390, null, { timeout: 3000 }).catch(() => null);
    let lay = await rects(page, ['#vb-board', '.vb-swatch', '#vb-choices', '#vb-bar']);
    t.check(allIn(lay, ['#vb-board', '.vb-swatch', '#vb-choices', '#vb-bar']) && lay['#vb-board'][0].r === 390 && lay['#vb-board'][0].b === 844 && lay.tabs === 'none', 'resized to a phone mid-round: the board refits to the 390 × 844 screen', { board: lay['#vb-board'][0], swatches: lay['.vb-swatch'] });
    await page.setViewportSize(DESKTOP);
    await page.waitForFunction(() => document.getElementById('vb-board').getBoundingClientRect().width > 1000, null, { timeout: 3000 }).catch(() => null);
    lay = await rects(page, ['#vb-board', '.vb-swatch', '#vb-choices']);
    const tabsBottom = await page.evaluate(() => document.querySelector('.tabs').getBoundingClientRect().bottom);
    t.check(allIn(lay, ['#vb-board', '.vb-swatch', '#vb-choices']) && lay['#vb-board'][0].t >= tabsBottom && lay.tabs !== 'none', 'resized back: the board sits below the tabs again, inside the window', { board: lay['#vb-board'][0], tabsBottom: Math.round(tabsBottom) });
    await answer(page, true, 'tap');
    t.check((await board(page)).round === 'Streak 1', 'the round answered after the resizes counts');
    // a reload mid-round: the settings remembered, nothing of the game
    await page.reload({ waitUntil: 'load' }); await sleep(500);
    b = await board(page);
    const radios = await page.evaluate(() => ({ count: document.querySelector('input[name="vbCount"]:checked').value, mode: document.querySelector('input[name="vbMode"]:checked').value }));
    t.check(!b.setup && b.play && !b.game && radios.count === '2' && JSON.parse(await storageGet(page, K.best))['zorn:2:streak'] === 3 && b.best === 'Your best streak here: 3 in a row.', 'a reload mid-round: the setup with the count remembered, the best untouched, no game', { setup: b.setup, radios, best: b.best });
    // Forget mid-battle, from the Help tab (the tabs are in view on a wide screen)
    await start(page, { count: '2' });
    await answer(page, true); await next(page); await waitRound(page, 2);
    await tab(page, 'help');
    await click(page, '#forgetBtn'); await sleep(200);
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
    await sleep(800);
    const after = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), game: !!(window.ValueBattle && ValueBattle.state()) }));
    await tab(page, 'battle');
    b = await board(page);
    const radios2 = await page.evaluate(() => ({ count: document.querySelector('input[name="vbCount"]:checked').value, mode: document.querySelector('input[name="vbMode"]:checked').value }));
    t.check(after.keys.length === 0 && !after.game && !b.setup && b.best === 'No streak yet for these settings.' && radios2.count === 'mix', 'Forget mid-battle: after the reload no key is left, the game is gone, the setup is back at its defaults', { ...after, best: b.best, radios: radios2 });
    await clean(t, page, 'mid-round');
    await page.context().close();
  }
}
