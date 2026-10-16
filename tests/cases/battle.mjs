// Value battle, played like a sceptical tester. The README's "Value battle" section is the expectation:
// the setup (every palette, My paints with 0/1/2 ticks, 2/3/4/mix, Streak and the 1/2/5 minute clock),
// rounds answered by tap and by key, Both the same on a tie and on a non-tie, the three- and four-color
// questions with Start the round over, the flourish every five, the miss pop-up with the colors in order,
// the score pop-up and its stars, New best, the clock pausing while a miss is read, the sound switch, ✕
// twice, the board pinned to one phone screen, thirty rounds closing in and never under the floor, every
// saved key of a hostile shape, a palette that mixes nothing, and both widths. The game is read through
// window.ValueBattle.state(), which battle.js exposes for tests, so a round can be answered right on purpose.
import { openPage, clean, tab, click, text, visible, screenshot, storageGet, hscroll, axe, sleep, DESKTOP, PHONE } from '../lib.mjs';

const K = { palette: 'portrait-value-studio.battlePalette', count: 'portrait-value-studio.battleCount', mode: 'portrait-value-studio.battleMode', best: 'portrait-value-studio.battleBest', mine: 'portrait-value-studio.myPaints' };
const QUESTION = { darker: 'Which color is darker in value?', lighter: 'Which color is lighter in value?', cooler: 'Which color is cooler in tone?', warmer: 'Which color is warmer in tone?', darkest: 'Tap the color with the darkest value.', lightest: 'Tap the color with the lightest value.', order: 'Tap the colors in order, from darkest to lightest.' };
const SAME = { value: 0.9, temp: 0.05 };
const FLOOR = { value: 1.6, temp: 0.08, gap: 2.2 };
const STARS = [20, 12, 8, 5, 2], TIMED_STARS = [10, 7, 5, 3, 1];
const GRADES = ['Keep looking', 'Warming up', 'Getting there', 'Good eye', 'Sharp eye!', 'Eagle eye!'];
const BEST_LINE = /^(No (streak|score) yet for these settings\.|Your best streak here: \d+ in a row\.|Your best here: \d+ right in [125] minutes?\.)$/;

// the round as the page holds it, with the gap the level asks about and the level of that round
const state = (page) => page.evaluate(() => {
  const g = window.ValueBattle && ValueBattle.state();
  if (!g) return null;
  const r = g.rounds[g.i];
  const out = { i: g.i, answered: g.answered, over: g.over, streak: g.streak, right: g.right, missed: g.missed, left: g.left, seconds: g.seconds, count: g.count, hasTemp: g.hasTemp };
  if (!r) return out;
  const m = (c) => (r.q.kind === 'value' ? c.L : c.warmth);
  const byL = r.colors.slice().sort((a, b) => a.L - b.L);
  let gap;
  if (r.n === 2) gap = Math.abs(m(r.colors[1]) - m(r.colors[0]));
  else if (r.q.mode === 'order') gap = Math.min(...byL.slice(1).map((c, k) => c.L - byL[k].L));
  else gap = r.q.dir < 0 ? byL[1].L - byL[0].L : byL[r.n - 1].L - byL[r.n - 2].L;
  const lv = ValueBattle.levelAt(g.i);
  // a pair's band is the round's own (r.band): the temperature ladder is scaled to the palette's reach, so a warm-only
  // palette deals temperature pairs below the level's nominal gap
  return { ...out, n: r.n, mode: r.q.mode, kind: r.q.kind, key: r.q.key, answer: r.answer, gap, lv: { lo: r.n === 2 ? (r.band ? r.band[0] : lv[r.q.kind][0]) : lv.gap, hi: r.n === 2 ? (r.band ? r.band[1] : lv[r.q.kind][1]) : Infinity }, L: r.colors.map((c) => c.L), labels: r.colors.map((c) => `V ${(c.L / 10).toFixed(1)}`), chroma: r.colors.map((c) => c.chroma) };
});
const ui = (page) => page.evaluate(() => {
  const $ = (id) => document.getElementById('vb-' + id);
  const shown = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  return { setup: shown($('setup')), play: shown($('play')), pinned: $('play').classList.contains('is-pinned'), focus: document.body.classList.contains('battle-focus'), round: $('round').textContent, score: $('score').textContent, time: $('time').textContent, timeShown: shown($('time')), question: $('question').textContent, swatches: document.querySelectorAll('#vb-swatches .vb-swatch').length, letters: [...document.querySelectorAll('#vb-swatches .vb-letter')].map((e) => getComputedStyle(e).display !== 'none'), answer: $('answer').textContent, answerCls: $('answer').className, same: shown(document.querySelector('.vb-choice')), sameDisabled: document.querySelector('.vb-choice').disabled, sameChosen: document.querySelector('.vb-choice').classList.contains('is-chosen'), undo: shown($('undo')), next: shown($('next')), nextText: $('next').textContent, miss: shown($('miss')), missKicker: $('missKicker').textContent, missWhy: $('missWhy').textContent, chips: [...document.querySelectorAll('#vb-missChips .vb-chip')].map((c) => c.querySelector('.vb-chip-text').textContent), missNext: $('missNext').textContent, popup: shown($('popup')), kicker: $('kicker').textContent, pct: $('pct').textContent, label: $('pctLabel').textContent, stars: document.querySelectorAll('#vb-stars .game-star.is-on').length, starsLabel: $('stars').getAttribute('aria-label'), grade: $('grade').textContent, newBest: shown($('newBest')), best: $('best').textContent, milestone: $('round').classList.contains('is-milestone'), active: document.activeElement && document.activeElement.id, rings: [...document.querySelectorAll('#vb-swatches .vb-swatch')].map((s) => (s.classList.contains('is-answer') ? 'A' : '') + (s.classList.contains('is-wrong') ? 'W' : '') + (s.classList.contains('is-pulse') ? 'P' : '')), badges: [...document.querySelectorAll('#vb-swatches .vb-badge')].map((b) => (b.hidden ? '' : b.textContent)), toast: document.getElementById('toast').textContent, count: (document.querySelector('input[name="vbCount"]:checked') || {}).value || null, modeSel: (document.querySelector('input[name="vbMode"]:checked') || {}).value || null, palette: $('palette').value, options: [...$('palette').options].map((o) => o.value + '=' + o.text) };
});
async function setup(page, { palette, count, mode } = {}) {
  await page.waitForFunction(() => document.getElementById('vb-palette').options.length > 0, null, { timeout: 3000 }).catch(() => null);
  if (palette) await page.selectOption('#vb-palette', palette, { timeout: 3000 });
  if (count) await click(page, `#vbCount${count === 'mix' ? 'Mix' : count}`);
  if (mode) await click(page, `#vbMode${{ streak: 'Streak', 60: '1', 120: '2', 300: '5' }[mode]}`);
}
async function start(page) {
  await click(page, '#vb-start');
  await page.waitForFunction(() => { const g = window.ValueBattle && ValueBattle.state(); return g && g.i === 0 && !document.getElementById('vb-play').hidden; }, null, { timeout: 5000 }).catch(() => null);
}
const waitAnswered = (page) => page.waitForFunction(() => { const g = ValueBattle.state(); return g && g.answered; }, null, { timeout: 3000 }).catch(() => null);
const waitRound = (page, i) => page.waitForFunction((i) => { const g = ValueBattle.state(); return g && (g.over || (g.i >= i && !g.answered)); }, i, { timeout: 3000 }).catch(() => null);
async function next(page) { const s = await state(page); await click(page, '#vb-next'); await waitRound(page, s.i + 1); }
// answers the round shown: right or wrong, by a DOM tap, a real mouse click or the keys. A wrong pair
// answer is Both the same on a non-tie and the left swatch on a tie (the README's two cases), unless
// wrongWith asks for a swatch.
async function answer(page, right, via = 'tap', { wrongWith = null } = {}) {
  const s = await state(page);
  if (!s || s.answered || s.over) return s;
  const tapEl = (i) => (via === 'mouse' ? page.locator(`.vb-swatch[data-index="${i}"]`).click() : page.evaluate((i) => document.querySelector(`.vb-swatch[data-index="${i}"]`).click(), i));
  if (s.mode === 'pair') {
    const want = right ? s.answer : s.answer === 'same' ? 'left' : wrongWith === 'swatch' ? (s.answer === 'left' ? 'right' : 'left') : 'same';
    if (via === 'key') await page.keyboard.press(want === 'same' ? '=' : want === 'left' ? 'ArrowLeft' : 'ArrowRight');
    else if (want === 'same') await click(page, '.vb-choice[data-choice="same"]');
    else await tapEl(want === 'left' ? 0 : 1);
  } else if (s.mode === 'pick') {
    const i = right ? s.answer : (s.answer + 1) % s.n;
    if (via === 'key') await page.keyboard.press(String(i + 1)); else await tapEl(i);
  } else {
    const order = right ? s.answer : s.answer.slice().reverse();
    for (const i of order) { if (via === 'key') await page.keyboard.press(String(i + 1)); else await tapEl(i); }
  }
  await waitAnswered(page);
  return s;
}
const within = (s) => s.answer === 'same' ? s.gap < SAME[s.kind] + 1e-9 : s.gap >= s.lv.lo - 1e-6 && s.gap <= s.lv.hi + 1e-6;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const vOf = (label) => +label.replace(/^V /, '');
const nondecreasing = (a) => a.every((v, i) => !i || v >= a[i - 1]);
// how the page reports the gap: the V labels in the answer line, e.g. "V 4.9 against V 2.7"
const reported = (line) => { const m = /V (\d+\.\d) (?:against|and) V (\d+\.\d)/.exec(line); return m ? Math.abs(+m[1] - +m[2]) * 10 : null; };
const noError = (t, page, label) => t.check(page.log.pageerrors.length === 0, `${label}: no page error`, page.log.pageerrors);

export default async function battle(t, site) {
  // ---- the setup: palettes, My paints with 0/1/2 ticks, the defaults, the best line, settings kept ----
  {
    const page = await openPage(site);
    await tab(page, 'battle');
    let u = await ui(page);
    t.check(u.options.length === 10 && !u.options.some((o) => o.startsWith('mine=')), 'setup: the ten preset palettes and no My paints with nothing ticked', u.options);
    t.check(u.palette === 'zorn' && u.count === 'mix' && u.modeSel === 'streak', 'setup: Zorn, Mix and Streak are the defaults', [u.palette, u.count, u.modeSel]);
    t.check(u.best === 'No streak yet for these settings.' && u.setup && !u.play, 'setup: no streak yet, the board hidden', u.best);
    await setup(page, { mode: '60' }); u = await ui(page);
    t.check(u.best === 'No score yet for these settings.', 'setup: the clock says no score yet', u.best);
    await setup(page, { palette: 'primary', count: '3', mode: '120' });
    const saved = { palette: await storageGet(page, K.palette), count: await storageGet(page, K.count), mode: await storageGet(page, K.mode) };
    t.check(saved.palette === '"primary"' && saved.count === '"3"' && saved.mode === '"120"', 'setup: palette, count and mode are saved as chosen', saved);
    await page.reload({ waitUntil: 'load' }); await sleep(400); await tab(page, 'battle'); u = await ui(page);
    t.check(u.palette === 'primary' && u.count === '3' && u.modeSel === '120', 'setup: the choice is back after a reload', [u.palette, u.count, u.modeSel]);
    // My paints: one tick is no palette, two are, duplicates and unknown codes count once
    for (const [mine, want] of [[['TW'], null], [['TW', 'YO'], 'My paints (2)'], [['TW', 'TW', 'YO', 'nope', 'IB'], 'My paints (3)']]) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [K.mine, mine]);
      await tab(page, 'study'); await tab(page, 'battle'); u = await ui(page);
      const opt = u.options.find((o) => o.startsWith('mine='));
      t.check(want ? opt === 'mine=' + want : !opt, `setup: My paints ${JSON.stringify(mine)} → ${want || 'no My paints palette'}`, u.options.slice(-2));
    }
    await clean(t, page, 'setup');
    await page.context().close();
  }

  // ---- Streak, two colors, the Three primaries: thirty rounds by tap and by key, the tie, the flourish, the miss, the score ----
  {
    const page = await openPage(site);
    await tab(page, 'battle');
    await setup(page, { palette: 'primary', count: '2', mode: 'streak' });
    await start(page);
    let u = await ui(page), s = await state(page);
    t.check(u.play && !u.setup && u.focus && u.pinned && !u.timeShown, 'streak: the board shows, pinned, no clock', { play: u.play, focus: u.focus, pinned: u.pinned, time: u.timeShown });
    t.check(u.round === 'Streak 0' && u.score === 'Round 1' && u.question === QUESTION.darker && u.swatches === 2 && u.same && !u.next && !u.undo, 'streak round 1: Streak 0, Round 1, the darker question, two colors, Both the same', { round: u.round, score: u.score, q: u.question, n: u.swatches });
    t.check(u.letters.every((shown) => !shown), 'two colors carry no letters', u.letters);
    const geo = await page.evaluate(() => { const p = document.getElementById('vb-play').getBoundingClientRect(), tabs = document.querySelector('.tabs').getBoundingClientRect(); return { top: p.top, tabsBottom: tabs.bottom, bottom: p.bottom, h: innerHeight, boardScroll: document.getElementById('vb-board').scrollHeight, boardClient: document.getElementById('vb-board').clientHeight }; });
    t.check(geo.top >= geo.tabsBottom && geo.bottom <= geo.h + 1 && geo.boardScroll <= geo.boardClient + 1, 'desktop: the board is pinned below the sections and nothing in it is clipped', geo);
    // round 1 by a real click on the right color
    const r1 = await answer(page, true, 'mouse'); u = await ui(page);
    t.check(u.answer.startsWith('Right!') && u.answerCls.includes('is-right'), 'a right tap says Right! and explains', u.answer);
    t.check(u.rings.some((r) => r.includes('A')) && (r1.answer === 'same' || u.rings[r1.answer === 'left' ? 0 : 1].includes('P')), 'the right color is ringed gold and the tapped one pulses', { rings: u.rings, answer: r1.answer });
    t.check(u.round === 'Streak 1' && u.next && u.nextText === 'Next ▸' && u.active === 'vb-next' && u.sameDisabled, 'after a right answer: Streak 1, Next ▸ shown and focused, Both the same off', { round: u.round, next: u.next, active: u.active });
    if (r1.answer !== 'same') t.check(Math.abs(reported(u.answer) - r1.gap) < 1.01, 'the answer line reports the two values the round was dealt with', { line: u.answer, gap: r1.gap });
    await page.keyboard.press('Enter'); await waitRound(page, 1); u = await ui(page); s = await state(page);
    t.check(s.i === 1 && u.score === 'Round 2' && u.question === QUESTION.lighter && !u.next && u.answer === '', 'Enter on Next ▸ moves on exactly one round, to the lighter question', { i: s.i, score: u.score, q: u.question });
    // rounds 2 to 30: keys and taps in turn, Both the same on a tie, the flourish at 5 and 10
    const rounds = [r1]; let ties = 0, flourish = { at5: null, at10: null, at4: null }, order = true, keyLine = true;
    for (let i = 1; i < 30; i++) {
      s = await state(page);
      if (s.key !== ['darker', 'lighter', 'cooler', 'warmer'][i % 4]) order = false;
      if (s.answer === 'same') ties++;
      rounds.push(s);
      await answer(page, true, i % 2 ? 'key' : 'tap');
      u = await ui(page);
      if (!u.answer.startsWith('Right!')) keyLine = false;
      if (s.answer === 'same' && !(u.sameChosen && /^Right! Both/.test(u.answer))) keyLine = false;
      if (i === 3) flourish.at4 = u.milestone; if (i === 4) flourish.at5 = u.milestone; if (i === 9) flourish.at10 = u.milestone;
      await next(page);
    }
    s = await state(page); u = await ui(page);
    t.check(s.i === 30 && s.streak === 30 && u.round === 'Streak 30' && u.score === 'Round 31', 'thirty right answers: Streak 30, Round 31', { i: s.i, streak: s.streak, round: u.round });
    t.check(order, 'the two-color questions come in turn: darker, lighter, cooler, warmer', rounds.map((r) => r.key).join(','));
    t.check(keyLine, 'every answer by key or tap, Both the same included, was taken as right', rounds.map((r) => r.answer).join(','));
    t.check(flourish.at5 && flourish.at10 && !flourish.at4, 'the streak flourishes at 5 and 10, not at 4', flourish);
    if (ties) t.check(true, `Both the same was the right answer on ${ties} tie${ties === 1 ? '' : 's'} in thirty rounds`); else t.note('streak 2: no tie came up in thirty rounds, so Both the same on a tie was not seen here');
    const dealt = rounds.map((r) => ({ i: r.i, key: r.key, answer: r.answer, gap: +r.gap.toFixed(2), lo: +r.lv.lo.toFixed(2), hi: +r.lv.hi.toFixed(2) }));
    const off = dealt.filter((r, k) => !within(rounds[k]));
    t.check(off.length === 0, 'thirty rounds: every pair is dealt inside its round\'s level (a tie under the same-threshold)', off);
    const underFloor = rounds.filter((r) => r.answer !== 'same' && r.gap < FLOOR[r.kind] - 1e-6).map((r) => ({ i: r.i, key: r.key, gap: r.gap }));
    t.check(underFloor.length === 0, 'thirty rounds: no gap under the floor the eye can still tell apart', underFloor);
    const early = rounds.filter((r) => r.i < 10 && r.kind === 'value' && r.answer !== 'same').map((r) => r.gap), late = rounds.filter((r) => r.i >= 20 && r.kind === 'value' && r.answer !== 'same').map((r) => r.gap);
    t.check(early.length && late.length && mean(late) < mean(early), 'the value gaps close in: rounds 21-30 are tighter than rounds 1-10 on average', { early: early.map((g) => +g.toFixed(1)), late: late.map((g) => +g.toFixed(1)) });
    const lv24 = await page.evaluate(() => ValueBattle.levelAt(24));
    t.check(lv24.value[0] === 2.5 && lv24.value[1] === 6 && lv24.gap === 3.5, 'by round 24 the level is the README\'s hair apart: 2.5 to 6 L*, 3.5 between neighbours', lv24);
    const honest = rounds.filter((r) => r.answer === 'same' && r.kind === 'value' && r.labels[0] !== r.labels[1]);
    t.check(honest.length === 0, 'a value tie shows the same V on both colors', honest.map((r) => r.labels));
    // round 31: Both the same on a non-tie (or a color on a tie) is the miss: the pop-up with the colors in order
    const r31 = await answer(page, false, 'tap'); u = await ui(page);
    t.check(u.miss && u.missKicker === 'Not quite' && u.missNext === 'See the score' && u.active === 'vb-missNext' && u.answer === '', 'a miss pops up Not quite with See the score focused', { miss: u.miss, kicker: u.missKicker, btn: u.missNext, active: u.active });
    const why = r31.answer === 'same' ? /^Both (are the same value: V \d\.\d and V \d\.\d\.|lean the same way: )/ : r31.kind === 'value' ? /^The (left|right) one is (darker|lighter): V \d\.\d against V \d\.\d\.$/ : /^The (left|right) one is (cooler|warmer): it leans more toward/;
    t.check(why.test(u.missWhy), 'the miss says the right answer in words with the values or the leans', u.missWhy);
    const chipV = u.chips.map((c) => /V (\d\.\d)/.exec(c)).map((m) => m && +m[1]);
    t.check(u.chips.length === 2 && u.chips.every((c) => /^(Left|Right)/.test(c)) && (r31.kind === 'value' ? chipV.every((v) => v != null) && nondecreasing(chipV) : u.chips.every((c) => /(warm|cool|in between)$/.test(c))), 'the miss lays the colors out as Left and Right, darkest to lightest with their values (or their leans)', u.chips);
    if (r31.answer !== 'same') t.check(u.sameChosen && u.rings.filter((r) => r.includes('A')).length === 1, 'Both the same on a non-tie: the button is marked chosen and the right color ringed', { chosen: u.sameChosen, rings: u.rings });
    else t.check(u.rings.every((r) => r.includes('A')) && !u.rings.some((r) => r.includes('W')), 'a color on a tie: both colors ringed gold, none red', u.rings);
    await click(page, '#vb-missNext'); await sleep(200); u = await ui(page);
    t.check(u.popup && !u.miss && u.kicker === 'Streak over after round 31' && u.label === 'in a row' && u.active === 'vb-again', 'See the score: the score pops up for round 31 with Play again focused', { popup: u.popup, kicker: u.kicker, label: u.label, active: u.active });
    await page.waitForFunction(() => document.getElementById('vb-pct').textContent === '30', null, { timeout: 3000 }).catch(() => null); u = await ui(page);
    t.check(u.pct === '30' && u.stars === 5 && u.grade === GRADES[5] && u.newBest && u.starsLabel === '5 out of 5 stars, 30 in a row', 'thirty in a row: 30 counts up, five stars, Eagle eye!, New best!', { pct: u.pct, stars: u.stars, grade: u.grade, newBest: u.newBest, label: u.starsLabel });
    await click(page, '#vb-settings'); await sleep(200); u = await ui(page);
    t.check(u.setup && !u.play && !u.focus && u.best === 'Your best streak here: 30 in a row.', 'Change settings: the setup is back with the best streak', { setup: u.setup, best: u.best });
    t.check(JSON.parse(await storageGet(page, K.best) || '{}')['primary:2:streak'] === 30, 'the best is saved under palette:count:mode', await storageGet(page, K.best));
    // a shorter streak is no new best; out on the first round; Play again from the pop-up
    await start(page);
    for (let i = 0; i < 3; i++) { await answer(page, true); await next(page); }
    const missed = await answer(page, false, 'tap', { wrongWith: 'swatch' }); u = await ui(page);
    // a tie (Both the same was right) rings both colors gold, the one tapped among them; otherwise the wrong
    // color is ringed red beside the right one in gold
    const ringsOk = missed.answer === 'same'
      ? u.rings.every((r) => r.includes('A')) && !u.rings.some((r) => r.includes('W'))
      : u.rings.filter((r) => r.includes('W')).length === 1 && u.rings.filter((r) => r.includes('A')).length === 1;
    t.check(ringsOk, 'a miss rings the right colors in gold and a wrong one in red (on a tie, both gold)', { tie: missed.answer === 'same', rings: u.rings });
    await click(page, '#vb-missNext'); await page.waitForFunction(() => document.getElementById('vb-pct').textContent === '3', null, { timeout: 3000 }).catch(() => null); u = await ui(page);
    t.check(u.kicker === 'Streak over after round 4' && u.pct === '3' && u.stars === STARS.filter((m) => 3 >= m).length && u.grade === GRADES[1] && !u.newBest, 'three in a row: one star, Warming up, no New best', { kicker: u.kicker, pct: u.pct, stars: u.stars, grade: u.grade, newBest: u.newBest });
    await click(page, '#vb-again'); await waitRound(page, 0); u = await ui(page);
    t.check(!u.popup && u.play && u.score === 'Round 1' && u.round === 'Streak 0', 'Play again starts over at round 1', { popup: u.popup, score: u.score });
    await answer(page, false); await click(page, '#vb-missNext'); await sleep(1400); u = await ui(page);
    t.check(u.kicker === 'Out on the first round' && u.pct === '0' && u.stars === 0 && u.grade === GRADES[0] && !u.newBest, 'a miss on round 1: Out on the first round, no star, Keep looking', { kicker: u.kicker, pct: u.pct, stars: u.stars, grade: u.grade });
    await click(page, '#vb-settings'); await sleep(200); u = await ui(page);
    t.check(u.best === 'Your best streak here: 30 in a row.', 'the best streak stands after two lower games', u.best);
    await clean(t, page, 'streak with two colors');

    // ---- three colors: letters, the keys 1-3, Start the round over, a wrong order's pop-up; Enter on See the score ----
    await setup(page, { count: '3' }); await start(page); u = await ui(page); s = await state(page);
    t.check(u.swatches === 3 && u.letters.every(Boolean) && u.question === QUESTION.darkest && !u.same, 'three colors: lettered swatches, the darkest question, no Both the same', { n: u.swatches, letters: u.letters, q: u.question, same: u.same });
    t.check(await page.evaluate(() => [...document.querySelectorAll('.vb-swatch')].map((b) => b.getAttribute('aria-label')).join(',')) === 'Color A,Color B,Color C', 'the swatches are named Color A, B, C');
    await page.keyboard.press('4'); await sleep(150); s = await state(page);
    t.check(!s.answered, 'the key 4 does nothing in a three-color round', s.answered);
    await answer(page, true, 'key'); u = await ui(page);
    t.check(u.answer.startsWith('Right!') && /^Right! [ABC] is the darkest\. The values: A V \d\.\d, B V \d\.\d, C V \d\.\d\.$/.test(u.answer), 'a key answers the darkest and the line gives every value', u.answer);
    await next(page); s = await state(page);
    t.check(s.key === 'lightest', 'round 2 asks for the lightest', s.key);
    await answer(page, true, 'tap'); await next(page); s = await state(page);
    t.check(s.key === 'order' && (await ui(page)).question === QUESTION.order, 'round 3 asks for the order', s.key);
    await page.evaluate(() => document.querySelector('.vb-swatch[data-index="0"]').click()); await sleep(100);
    await page.evaluate(() => document.querySelector('.vb-swatch[data-index="0"]').click()); await sleep(100); u = await ui(page);
    t.check(u.badges[0] === '1' && u.badges.filter(Boolean).length === 1 && u.undo && !(await state(page)).answered, 'the first tap numbers a swatch 1, a second tap on it is ignored, Start the round over shows', { badges: u.badges, undo: u.undo });
    await page.evaluate(() => document.querySelector('.vb-swatch[data-index="1"]').click()); await sleep(100); u = await ui(page);
    t.check(u.badges[1] === '2', 'the second tap numbers the next swatch 2', u.badges);
    await click(page, '#vb-undo'); await sleep(100); u = await ui(page);
    t.check(u.badges.every((b) => !b) && !u.undo && !(await state(page)).answered, 'Start the round over clears the numbers and hides itself', { badges: u.badges, undo: u.undo });
    await answer(page, true, 'tap'); u = await ui(page);
    t.check(/^Right! Darkest to lightest: [ABC], [ABC], [ABC]\. The values:/.test(u.answer) && !u.undo && u.badges.every(Boolean), 'the right order is taken and explained', u.answer);
    await next(page); await answer(page, true); await next(page); await answer(page, true); await next(page); s = await state(page);
    t.check(s.key === 'order', 'round 6 is an order again', s.key);
    const r6 = await answer(page, false); u = await ui(page);
    t.check(u.miss && /^Darkest to lightest: [ABC], [ABC], [ABC]\. The values: A V/.test(u.missWhy), 'a wrong order pops up the right order', u.missWhy);
    const chipV3 = u.chips.map((c) => +/V (\d\.\d)/.exec(c)[1]);
    t.check(u.chips.length === 3 && u.chips.every((c) => /^[ABC]V/.test(c)) && nondecreasing(chipV3), 'the pop-up lays A, B, C out darkest to lightest with their values', u.chips);
    t.check(r6.answer.every((idx, k) => u.badges[idx] === String(k + 1)), 'the swatches are numbered with the right order after the miss', { badges: u.badges, answer: r6.answer });
    // Enter on See the score must show the score once, not start a new game
    await page.keyboard.press('Enter'); await sleep(500); u = await ui(page); s = await state(page);
    if (!t.check(u.popup && s.over && !u.miss && u.kicker === 'Streak over after round 6', 'Enter on See the score shows the score and stays there', { popup: u.popup, over: s.over, kicker: u.kicker, round: u.score })) t.finding({ title: 'Enter on See the score skips the score pop-up and starts a new game', severity: 'high', steps: 'Streak mode, any count. Miss a round. With See the score focused (as it is), press Enter.', expected: 'The score pops up and stays until Play again or Change settings is pressed.', actual: `The score pop-up shows for a frame and a new game begins at round 1 (popup ${u.popup}, over ${s.over}, ${u.score}).`, cause: 'js/battle.js:395 clicks See the score on keydown and the key\'s own activation then lands on Play again, which finish() focused (js/battle.js:437)' });
    await click(page, '#vb-settings'); await sleep(200);
    await clean(t, page, 'three colors');

    // ---- four colors and the mix: the bag of three, thirty rounds, the neighbours' gap ----
    await setup(page, { count: '4' }); await start(page); u = await ui(page);
    t.check(u.swatches === 4 && u.letters.every(Boolean) && (await page.evaluate(() => document.querySelector('.vb-swatch[data-index="3"]').getAttribute('aria-label'))) === 'Color D', 'four colors: A to D', { n: u.swatches });
    const r4 = await state(page);
    if (r4.mode === 'pick') { await page.keyboard.press(String(r4.answer + 1)); await waitAnswered(page); t.check((await state(page)).answered && (await ui(page)).answer.startsWith('Right!'), 'the key 4 answers a four-color round', (await ui(page)).answer); }
    await click(page, '#vb-quit'); await click(page, '#vb-quit'); await sleep(200);
    await setup(page, { count: 'mix' }); await start(page);
    const mixed = []; let mixOrder = true;
    for (let i = 0; i < 30; i++) {
      s = await state(page); mixed.push(s);
      const manyIdx = mixed.filter((r) => r.n > 2).length - 1; // this round's place among the three- and four-color rounds
      if (s.n > 2 && s.key !== ['darkest', 'lightest', 'order'][manyIdx % 3]) mixOrder = false;
      await answer(page, true, i % 3 === 0 ? 'key' : 'tap'); await next(page);
    }
    const bags = [0, 1, 2].map((k) => mixed.slice(k * 3, k * 3 + 3).map((r) => r.n).sort().join(''));
    t.check(bags.every((b) => b === '234'), 'the mix deals two, three and four colors in every three rounds', mixed.map((r) => r.n).join(''));
    t.check(mixOrder, 'the three- and four-color questions come in turn: darkest, lightest, order', mixed.filter((r) => r.n > 2).map((r) => r.key).join(','));
    const manyOff = mixed.filter((r) => r.n > 2 && r.gap < r.lv.lo - 1e-6).map((r) => ({ i: r.i, n: r.n, key: r.key, gap: +r.gap.toFixed(2), want: +r.lv.lo.toFixed(2) }));
    t.check(manyOff.length === 0, 'mix, thirty rounds: every three- and four-color round keeps its level\'s gap between the values that matter', manyOff);
    const pairOff = mixed.filter((r) => r.n === 2 && !within(r)).map((r) => ({ i: r.i, key: r.key, gap: +r.gap.toFixed(2), lo: +r.lv.lo.toFixed(2), hi: +r.lv.hi.toFixed(2) }));
    t.check(pairOff.length === 0, 'mix, thirty rounds: every pair inside its level', pairOff);
    t.check(mixed.every((r) => r.n === 2 ? r.answer === 'same' || r.gap >= FLOOR[r.kind] - 1e-6 : r.gap >= FLOOR.gap - 1e-6), 'mix, thirty rounds: nothing under the floor', mixed.map((r) => +r.gap.toFixed(2)));
    // only a minimum gap is asked of a three- or four-color set, so the closing in shows in what the game will deal: two hundred order rounds at round 30 against round 1
    const closing = await page.evaluate(() => { const pool = ValueBattle.state().pool, q = ValueBattle.QUESTIONS.find((x) => x.key === 'order'); const tightest = (round) => { let m = Infinity; for (let k = 0; k < 200; k++) { const s = ValueBattle.makeRound(pool, ValueBattle.levelAt(round), q, 4).colors.slice().sort((a, b) => a.L - b.L); m = Math.min(m, ...s.slice(1).map((c, i) => c.L - s[i].L)); } return +m.toFixed(2); }; return { round1: tightest(0), round30: tightest(29), want1: ValueBattle.levelAt(0).gap, want30: +ValueBattle.levelAt(29).gap.toFixed(2) }; });
    t.check(closing.round1 >= closing.want1 && closing.round30 >= closing.want30 && closing.round30 < closing.want1, 'mix: the neighbours\' gaps close in: round 30 deals sets no round 1 would', closing);
    t.check((await state(page)).streak === 30, 'thirty right in the mix', (await state(page)).streak);
    await clean(t, page, 'four colors and the mix');
    await page.context().close();
  }

  // ---- the clock: 1 minute played out, the pause while a miss is read, auto-next, Enter once, the time-up score; 2 and 5 minutes ----
  {
    const page = await openPage(site);
    await tab(page, 'battle');
    await setup(page, { palette: 'primary', count: '2', mode: '60' });
    await start(page); let u = await ui(page), s = await state(page);
    t.check(u.timeShown && u.time === '1:00' && u.round === '0 right' && s.seconds === 60, 'the 1 minute clock starts at 1:00 with 0 right', { time: u.time, round: u.round });
    await answer(page, true, 'mouse'); u = await ui(page);
    t.check(u.round === '1 right' && u.next, 'on the clock a right answer counts and shows Next ▸', { round: u.round, next: u.next });
    await waitRound(page, 1); s = await state(page);
    t.check(s.i === 1 && !s.answered, 'on the clock the next round comes by itself', s.i);
    // a miss pauses the clock; Enter on Next ▸ moves on one round and the clock runs again
    const missed = await answer(page, false); u = await ui(page);
    t.check(u.miss && u.missNext === 'Next ▸', 'a miss on the clock pops up with Next ▸', { miss: u.miss, btn: u.missNext });
    const t0 = { time: u.time, left: (await state(page)).left }; await sleep(1300); const t1 = { time: (await ui(page)).time, left: (await state(page)).left };
    t.check(t0.time === t1.time && t0.left === t1.left, 'the clock pauses while the answer is read', { t0, t1 });
    const tied = missed.answer === 'same', chips = u.chips;
    t.check(chips.length === 2 && chips.every((c) => /^(Left|Right)/.test(c)), 'the miss on the clock lays the colors out too', chips);
    await page.keyboard.press('Enter'); await waitRound(page, 2); s = await state(page);
    t.check(s.i === 2 && !s.answered && !(await ui(page)).miss, 'Enter on Next ▸ in the miss pop-up moves on exactly one round', { i: s.i });
    await page.waitForFunction((was) => document.getElementById('vb-time').textContent !== was, t1.time, { timeout: 2500 }).catch(() => null);
    t.check((await ui(page)).time !== t1.time, 'the clock runs again after the miss', { before: t1.time, after: (await ui(page)).time });
    // the rest of the minute: right answers with a miss every tenth round; Both the same on a non-tie and a color on a tie when they come
    let sawNonTie = tied ? null : u.missWhy, sawTie = tied ? u.missWhy : null, sawLow = null, flourish5 = null, right = 1, misses = 1;
    const deadline = Date.now() + 80000;
    while (Date.now() < deadline) {
      s = await state(page);
      if (!s || s.over) break;
      if (s.answered) { await page.waitForFunction((i) => { const g = ValueBattle.state(); return !g || g.over || g.i > i; }, s.i, { timeout: 3000 }).catch(() => null); continue; }
      const low = (await ui(page)).time; if (/^0:(0\d|10)$/.test(low) && !sawLow) sawLow = { time: low, isLow: await page.evaluate(() => document.getElementById('vb-time').classList.contains('is-low')) };
      const wrong = s.i % 10 === 5 || (!sawTie && s.answer === 'same') || (!sawNonTie && s.answer !== 'same' && s.i % 10 === 7);
      await answer(page, !wrong, s.i % 2 ? 'key' : 'tap');
      const took = await state(page);
      if (!took || !took.answered) continue; // the minute ran out under the tap: the round is void, and so is the tap
      if (wrong) {
        misses++; const uu = await ui(page);
        if (s.answer === 'same' && !sawTie) sawTie = uu.missWhy; else if (s.answer !== 'same' && !sawNonTie) sawNonTie = uu.missWhy;
        await click(page, '#vb-missNext');
      } else { right++; if (right === 5) flourish5 = (await ui(page)).milestone; }
    }
    s = await state(page); u = await ui(page);
    t.check(s && s.over && u.popup, 'the minute runs out and the score pops up', { over: s && s.over, popup: u.popup, right: s && s.right, i: s && s.i });
    t.check(s.right === right && s.missed === misses, 'the right answers and misses are counted as played', { page: [s.right, s.missed], test: [right, misses] });
    await page.waitForFunction((n) => document.getElementById('vb-pct').textContent === String(n), s.right, { timeout: 3000 }).catch(() => null); u = await ui(page);
    const stars = TIMED_STARS.filter((m) => s.right >= m).length;
    t.check(u.kicker === `Time's up · ${misses} missed` && u.label === 'right' && u.pct === String(s.right) && u.stars === stars && u.grade === GRADES[stars] && u.newBest && u.starsLabel === `${stars} out of 5 stars, ${s.right} right`, 'time\'s up: the misses, the right answers, stars a minute, the grade, New best', { kicker: u.kicker, label: u.label, pct: u.pct, stars: u.stars, grade: u.grade, newBest: u.newBest });
    t.check(sawLow && sawLow.isLow, 'the last ten seconds are marked low', sawLow);
    t.check(flourish5 === true, 'on the clock the fifth right answer flourishes', flourish5);
    if (sawNonTie) t.check(/^The (left|right) one is (darker|lighter|cooler|warmer)/.test(sawNonTie), 'Both the same on a non-tie: the pop-up names the side that wins', sawNonTie); else t.note('clock: no non-tie miss was dealt in the minute');
    if (sawTie) t.check(/^Both (are the same value|lean the same way)/.test(sawTie), 'a color on a tie: the pop-up says both are the same', sawTie); else t.note('clock: no tie came up in the minute, so a color on a tie was not seen here');
    await click(page, '#vb-settings'); await sleep(200); u = await ui(page);
    t.check(u.best === `Your best here: ${s.right} right in 1 minute.`, 'the setup shows the best on the 1 minute clock', u.best);
    for (const [mode, time, word] of [['120', '2:00', '2 minutes'], ['300', '5:00', '5 minutes']]) {
      await setup(page, { mode }); u = await ui(page);
      t.check(u.best === 'No score yet for these settings.', `${word}: no score yet`, u.best);
      await start(page); u = await ui(page);
      t.check(u.timeShown && u.time === time, `the ${word} clock starts at ${time}`, u.time);
      await answer(page, true); await waitRound(page, 1);
      await click(page, '#vb-quit'); await click(page, '#vb-quit'); await sleep(200); u = await ui(page);
      t.check(u.setup && !u.play && !(await state(page)), `${word}: ✕ twice quits to the setup`, { setup: u.setup, play: u.play });
    }
    await clean(t, page, 'the clock');
    await page.context().close();
  }

  // ---- ✕ twice (also in the page's first seconds), another tab mid-game, a reload, the sound switch, double taps ----
  {
    const page = await openPage(site, { url: '#battle' });
    await setup(page, { palette: 'primary', count: '2', mode: 'streak' });
    await start(page);
    await click(page, '#vb-quit'); await sleep(150); let u = await ui(page);
    t.check(u.play && !!(await state(page)) && u.toast === 'Tap ✕ again to quit this battle', 'one ✕ in the page\'s first seconds only asks again', { play: u.play, toast: u.toast });
    // the second tap must come within three seconds of the first: later, it only asks again
    const armedAt = await page.evaluate(() => performance.now());
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
    await page.waitForFunction((at) => performance.now() - at > 3100, armedAt, { timeout: 6000 }).catch(() => null);
    await click(page, '#vb-quit'); await sleep(150); u = await ui(page);
    t.check(u.play && u.toast === 'Tap ✕ again to quit this battle', 'a ✕ more than three seconds after the first asks again rather than quitting', { play: u.play, toast: u.toast });
    await click(page, '#vb-quit'); await sleep(150); u = await ui(page);
    t.check(u.setup && !u.play && !u.focus && !u.pinned && !(await state(page)) && (await page.evaluate(() => document.getElementById('vb-play').getAttribute('style') || '')) === '', 'the second ✕ quits: the setup, no focus class, the board unpinned', { setup: u.setup, focus: u.focus, pinned: u.pinned });
    await start(page); await answer(page, false); await click(page, '#vb-missNext'); await sleep(200);
    await click(page, '#vb-quit'); await sleep(150); u = await ui(page);
    t.check(u.setup && !u.popup, 'after the game is over one ✕ leaves', { setup: u.setup, popup: u.popup });
    // another tab mid-game: the board unpins, the keys are quiet, the game waits
    await start(page); await answer(page, true); await next(page); const s1 = await state(page);
    await tab(page, 'study'); u = await ui(page);
    t.check(!u.focus && !u.pinned && !!(await state(page)), 'leaving the tab mid-game unpins the board and keeps the game', { focus: u.focus, pinned: u.pinned });
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('='); await sleep(150);
    t.check(!(await state(page)).answered, 'the arrow keys do nothing on another tab', (await state(page)).answered);
    await tab(page, 'battle'); u = await ui(page); const s2 = await state(page);
    t.check(u.focus && u.pinned && s2.i === s1.i && !s2.answered && u.score === `Round ${s1.i + 1}`, 'back on the tab the same round waits, pinned again', { i: s2.i, score: u.score });
    await page.reload({ waitUntil: 'load' }); await sleep(400); await tab(page, 'battle'); u = await ui(page);
    t.check(u.setup && !u.play && u.count === '2' && u.palette === 'primary', 'a reload mid-game lands on the setup with the settings kept', { setup: u.setup, count: u.count, palette: u.palette });
    // the sound switch (Paint by numbers') covers the battle's clicks, chime and vibration
    await page.evaluate(() => { window.__snd = 0; window.__vib = 0; for (const name of ['createOscillator', 'createBufferSource']) { const f = AudioContext.prototype[name]; AudioContext.prototype[name] = function () { window.__snd++; return f.call(this); }; } const v = navigator.vibrate; navigator.vibrate = function () { window.__vib++; return v ? v.apply(this, arguments) : true; }; });
    await start(page); await answer(page, true, 'mouse'); await sleep(200);
    let snd = await page.evaluate(() => [window.__snd, window.__vib, GameSound.on()]);
    t.check(snd[2] === true && snd[0] >= 5 && snd[1] >= 1, 'with the sound on, a right tap clicks, chimes and buzzes', snd);
    await next(page);
    await tab(page, 'game'); await click(page, '#gameSound'); await sleep(200);
    const pressed = await page.evaluate(() => document.getElementById('gameSound').getAttribute('aria-pressed'));
    await tab(page, 'battle'); await page.evaluate(() => { window.__snd = 0; window.__vib = 0; });
    await answer(page, true, 'mouse'); await sleep(200); snd = await page.evaluate(() => [window.__snd, window.__vib, GameSound.on()]);
    t.check(pressed === 'false' && snd[2] === false && snd[0] === 0 && snd[1] === 0, 'with the sound off, a tap is silent and still', { pressed, snd });
    await next(page);
    await tab(page, 'game'); await click(page, '#gameSound'); await tab(page, 'battle'); await page.evaluate(() => { window.__snd = 0; });
    await answer(page, true, 'mouse'); await sleep(200);
    t.check((await page.evaluate(() => window.__snd)) >= 5, 'switched back on, the sound returns', await page.evaluate(() => window.__snd));
    await next(page);
    // double taps: the same color twice, Next twice, Start twice
    const sd = await state(page);
    const idx = sd.mode === 'pair' ? (sd.answer === 'right' ? 1 : 0) : sd.mode === 'pick' ? sd.answer : sd.answer[0];
    await page.evaluate((i) => { const b = document.querySelector(`.vb-swatch[data-index="${i}"]`); b.click(); b.click(); }, idx); await sleep(200);
    const sdd = await state(page);
    t.check(sdd.i === sd.i && (sd.mode === 'order' ? !sdd.answered : sdd.answered) && sdd.streak <= sd.streak + 1, 'a color tapped twice counts once', { before: sd.streak, after: sdd.streak, answered: sdd.answered });
    if (!sdd.answered) await answer(page, true);
    await page.evaluate(() => { const b = document.getElementById('vb-next'); b.click(); b.click(); }); await sleep(200);
    t.check((await state(page)).i === sd.i + 1, 'Next ▸ tapped twice moves one round', (await state(page)).i);
    await click(page, '#vb-quit'); await click(page, '#vb-quit'); await sleep(200);
    await page.evaluate(() => { const b = document.getElementById('vb-start'); b.click(); b.click(); }); await sleep(300); u = await ui(page);
    t.check(u.play && u.score === 'Round 1' && (await state(page)).i === 0, 'Start tapped twice starts one game at round 1', u.score);
    await clean(t, page, 'quit, tabs, reload, sound, double taps');
    await page.context().close();
  }

  // ---- the phone: the whole board on one 390 × 844 screen for 2, 3 and 4 colors, the pop-ups inside it, Enter once ----
  {
    const page = await openPage(site, { viewport: PHONE });
    await tab(page, 'battle');
    t.check((await hscroll(page)) <= 0, 'phone: the setup has no horizontal scroll', await hscroll(page));
    await setup(page, { palette: 'primary', mode: 'streak' });
    // every piece of the board with a box is inside the screen; a swatch must have one (the answer row is empty in a three- or four-color round)
    const fit = () => page.evaluate(() => { const vw = innerWidth, vh = innerHeight; const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; }; const sized = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const inside = (e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1; }; const swatches = [...document.querySelectorAll('.vb-swatch')].map((_, i) => `.vb-swatch[data-index="${i}"]`); const els = ['#vb-bar', '#vb-quit', '#vb-question', '#vb-choices', ...swatches]; return { play: box(document.getElementById('vb-play')), vw, vh, scrollH: document.documentElement.scrollHeight, boardScroll: document.getElementById('vb-board').scrollHeight, boardClient: document.getElementById('vb-board').clientHeight, outside: els.filter((s) => sized(document.querySelector(s)) && !inside(document.querySelector(s))), unsized: ['#vb-bar', '#vb-quit', '#vb-question', ...swatches].filter((s) => !sized(document.querySelector(s))), topbar: getComputedStyle(document.querySelector('.topbar')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display, hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    for (const count of ['4', '3', '2']) {
      await setup(page, { count }); await start(page);
      const f = await fit();
      t.check(f.play.x === 0 && f.play.y === 0 && f.play.r === f.vw && f.play.b === f.vh && f.scrollH <= f.vh && f.boardScroll <= f.boardClient + 1 && f.outside.length === 0 && f.unsized.length === 0 && f.topbar === 'none' && f.tabs === 'none' && f.hscroll <= 0, `phone, ${count} colors: the whole board on one screen, nothing clipped, no scroll, the top bar and tabs away`, f);
      if (count === '4') await screenshot(page, 'battle-phone-4');
      if (count !== '2') { await click(page, '#vb-quit'); await click(page, '#vb-quit'); await sleep(200); }
    }
    await answer(page, false); await sleep(400);
    const missFit = await page.evaluate(() => { const r = document.getElementById('vb-miss').getBoundingClientRect(); return { inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, h: Math.round(r.height), chips: document.querySelectorAll('.vb-chip').length }; });
    t.check(missFit.inside && missFit.chips === 2, 'phone: the miss pop-up sits inside the screen', missFit);
    await screenshot(page, 'battle-phone-miss');
    await page.keyboard.press('Enter'); await sleep(500); let u = await ui(page); const s = await state(page);
    if (!t.check(u.popup && s.over && !u.miss, 'phone: Enter on See the score shows the score and stays there', { popup: u.popup, over: s.over, score: u.score })) t.finding({ title: 'Enter on See the score skips the score pop-up and starts a new game (phone)', severity: 'high', steps: 'On a 390 × 844 window: Streak mode, miss a round, press Enter with See the score focused.', expected: 'The score pops up and stays.', actual: `A new game begins (popup ${u.popup}, over ${s.over}, ${u.score}).`, cause: 'js/battle.js:395 and js/battle.js:437' });
    const popFit = await page.evaluate(() => { const r = document.getElementById('vb-popup').getBoundingClientRect(); return { inside: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, h: Math.round(r.height) }; });
    t.check(popFit.inside, 'phone: the score pop-up sits inside the screen', popFit);
    await click(page, '#vb-settings'); await sleep(200);
    await setup(page, { mode: '60' }); await start(page); u = await ui(page);
    const timeIn = await page.evaluate(() => { const r = document.getElementById('vb-time').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && r.top >= 0; });
    t.check(u.timeShown && u.time === '1:00' && timeIn, 'phone: the clock sits in the bar on screen', { time: u.time, timeIn });
    await click(page, '#vb-quit'); await click(page, '#vb-quit'); await sleep(200);
    await clean(t, page, 'phone');
    await page.context().close();
  }

  // ---- a keyboard visitor whose focus left See the score (Shift+Tab) and presses Enter ----
  {
    const page = await openPage(site);
    await tab(page, 'battle'); await setup(page, { palette: 'primary', count: '2', mode: 'streak' }); await start(page);
    await answer(page, false); await page.keyboard.press('Shift+Tab'); await sleep(100);
    const focused = await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.className));
    await page.keyboard.press('Enter'); await sleep(500); const u = await ui(page), s = await state(page);
    if (!t.check(u.popup && s.over && !u.miss, 'Enter with the focus moved off See the score still shows the score and stays there', { focused, popup: u.popup, over: s.over, score: u.score })) t.finding({ title: 'Enter on the miss pop-up with the focus elsewhere starts a new game instead of showing the score', severity: 'medium', steps: 'Streak mode. Miss a round. Press Tab or Shift+Tab once (the focus leaves See the score: a swatch, or a section button), then Enter.', expected: 'The score pops up and stays until Play again or Change settings is pressed.', actual: `The score pop-up shows for a frame and a new game begins at round 1 (focus was on ${focused}; popup ${u.popup}, over ${s.over}, ${u.score}).`, cause: 'js/battle.js:395 clicks See the score on the keydown when it is not focused; finish() then focuses Play again (js/battle.js:437), and the same key press activates it' });
    await clean(t, page, 'Enter with the focus elsewhere');
    await page.context().close();
  }

  // ---- every palette: four two-color rounds and the first round's ease, dealt eighty times ----
  {
    const page = await openPage(site);
    await tab(page, 'battle');
    const ids = (await ui(page)).options.map((o) => o.split('=')[0]);
    for (const id of ids) {
      await setup(page, { palette: id, count: '2', mode: 'streak' }); await start(page);
      const seen = [];
      for (let i = 0; i < 4; i++) { const s = await state(page); seen.push(s); await answer(page, true); if (i < 3) await next(page); }
      const u = await ui(page);
      t.check(seen.length === 4 && seen.every((s) => s.n === 2) && (await state(page)).streak === 4 && u.answer.startsWith('Right!'), `${id}: four rounds answered right`, { keys: seen.map((s) => s.key), streak: (await state(page)).streak });
      await click(page, '#vb-quit'); await click(page, '#vb-quit'); await sleep(150);
      // round 1 dealt eighty times for each question: what the README calls easy
      const ease = await page.evaluate((id) => {
        const pal = window.Paints.PRESETS.find((p) => p.id === id); const pool = ValueBattle.mixPool(pal.paints, 220); const lv = ValueBattle.levelAt(0);
        const out = {};
        for (const q of ValueBattle.QUESTIONS) {
          const n = q.mode === 'pair' ? 2 : 4; let total = 0, met = 0, worst = Infinity;
          for (let k = 0; k < 80; k++) {
            const r = ValueBattle.makeRound(pool, lv, q, n);
            if (n === 2) { if (r.answer === 'same') continue; const m = (c) => (q.kind === 'value' ? c.L : c.warmth); const d = Math.abs(m(r.colors[0]) - m(r.colors[1])); total++; const want = r.band ? r.band[0] : lv[q.kind][0]; if (d >= want - 1e-9) met++; worst = Math.min(worst, d); }
            else { const s = r.colors.slice().sort((a, b) => a.L - b.L); const gap = q.mode === 'order' ? Math.min(...s.slice(1).map((c, i) => c.L - s[i].L)) : q.dir < 0 ? s[1].L - s[0].L : s[3].L - s[2].L; total++; if (gap >= lv.gap - 1e-9) met++; worst = Math.min(worst, gap); }
          }
          out[q.key] = { total, met, worst: +worst.toFixed(3), want: +(q.kind === 'temp' ? lv.temp[0] : n === 2 ? lv.value[0] : lv.gap).toFixed(2) };
        }
        const w = pool.filter((c) => c.chroma >= 10).map((c) => c.warmth); out.warmth = [+Math.min(...w).toFixed(2), +Math.max(...w).toFixed(2)];
        return out;
      }, id);
      const short = Object.entries(ease).filter(([k, v]) => k !== 'warmth' && v.met < v.total);
      if (!t.check(short.length === 0, `${id}: the first round is dealt at the easy level for every question`, ease)) {
        const temp = short.every(([k]) => k === 'cooler' || k === 'warmer');
        t.finding({ title: `${id}: the first temperature rounds are never easy`, severity: 'medium', steps: `Palette ${id}, 2 colors, Streak. Play to round 3 (Which color is cooler in tone?) and round 4 (warmer). Or deal round 1 eighty times through ValueBattle.makeRound with levelAt(0) and the cooler question.`, expected: 'The README: the first round is easy, "clearly different in temperature" (a warmth gap of at least 0.6 on the page\'s -1 to 1 scale, closing to 0.12-0.3 by round 24).', actual: `${temp ? 'Every' : 'A'} non-tie deal falls short: ${short.map(([k, v]) => `${k} ${v.met}/${v.total} met, the gaps ${v.worst}-${v.want}`).join('; ')}. The palette's colorful mixes span warmth ${ease.warmth[0]} to ${ease.warmth[1]}, so no pair is 0.6 apart and the fallback deals the nearest pair it has, as hard as round ${temp ? Math.round(24 * (0.6 - (ease.warmth[1] - ease.warmth[0])) / 0.48) : '?'} from round 3 on.`, cause: 'js/battle.js:127-131: when no pair meets the level, makePair takes the closest it can rather than skipping the temperature question for this palette (as js/battle.js:246 does for a gray pool)' });
      }
    }
    await clean(t, page, 'every palette');
    await page.context().close();
  }

  // ---- My paints that mix nothing: two whites (a note, no game), white and black (value questions only) ----
  {
    const page = await openPage(site, { storage: { [K.mine]: ['TW', 'LW'] } });
    await tab(page, 'battle'); await setup(page, { palette: 'mine', count: '2', mode: 'streak' });
    await click(page, '#vb-start'); await sleep(400); let u = await ui(page);
    const toastOk = /makes no colors to compare/.test(u.toast);
    if (!t.check(u.setup && !u.play && !(await state(page)) && toastOk && page.log.pageerrors.length === 0, 'two whites as My paints: Start says the palette makes no colors, no game, no error', { setup: u.setup, play: u.play, toast: u.toast, errors: page.log.pageerrors })) t.finding({ title: 'My paints of two whites starts a battle that crashes', severity: 'high', steps: 'Tick only Titanium White and Lead White in Colors and paints (or save ["TW","LW"] under portrait-value-studio.myPaints). Value battle, palette My paints (2), 2 colors, Start.', expected: 'A note that the palette mixes no colors to compare, and the setup stays.', actual: `setup ${u.setup}, play ${u.play}, toast "${u.toast}", errors ${JSON.stringify(page.log.pageerrors)}`, cause: 'js/battle.js:65 mixes nothing without a non-white, and the round is dealt from an empty pool' });
    for (const count of ['3', '4', 'mix']) { await setup(page, { count }); await click(page, '#vb-start'); await sleep(250); u = await ui(page); t.check(u.setup && !u.play && page.log.pageerrors.length === 0, `two whites, ${count}: no game and no error`, { setup: u.setup, errors: page.log.pageerrors }); }
    await clean(t, page, 'two whites');
    await page.context().close();
    const grays = await openPage(site, { storage: { [K.mine]: ['TW', 'IB'] } });
    await tab(grays, 'battle'); await setup(grays, { palette: 'mine', count: '2', mode: 'streak' }); await start(grays);
    const keys = [];
    for (let i = 0; i < 6; i++) { const s = await state(grays); if (!s || s.over) break; keys.push(s.key); await answer(grays, true); await next(grays); }
    if (!t.check(keys.length === 6 && keys.every((k) => k === 'darker' || k === 'lighter') && (await state(grays)).streak === 6 && grays.log.pageerrors.length === 0, 'white and black as My paints: six value rounds, never a temperature question, no error', { keys, errors: grays.log.pageerrors })) t.finding({ title: 'A white-and-black My paints palette crashes on its first temperature round', severity: 'high', steps: 'Tick only Titanium White and Ivory Black in Colors and paints. Value battle, My paints (2), 2 colors, Streak. Answer rounds 1 and 2, press Next ▸.', expected: 'The README: colors too gray to have a temperature never get a temperature question.', actual: `rounds ${keys.join(', ')}; errors ${JSON.stringify(grays.log.pageerrors.map((e) => e.split('\n')[0]))}`, cause: 'js/battle.js:113-114 and :246' });
    await clean(t, grays, 'white and black');
    await grays.context().close();
  }

  // ---- hostile saved state for every key the battle reads ----
  {
    const seeds = [
      ['numbers and an unparsable string', { [K.palette]: 5, [K.count]: 2, [K.mode]: 60, [K.best]: [1, 2], [K.mine]: 'TW' }],
      ['prototype names', { [K.palette]: '"constructor"', [K.count]: '"__proto__"', [K.mode]: '"constructor"', [K.best]: '{"__proto__":{"primary:2:streak":99},"constructor":5,"hasOwnProperty":1,"zorn:mix:streak":"lots"}', [K.mine]: '["constructor","__proto__","valueOf",5,null,{},[],"TW","TW","YO"]' }],
      ['the wrong type entirely', { [K.palette]: '{"a":1}', [K.count]: '[2]', [K.mode]: '{}', [K.best]: '"x"', [K.mine]: '{"0":"TW","1":"YO"}' }],
      ['NaN, strings and nested values', { [K.palette]: '"NaN"', [K.count]: 'NaN', [K.mode]: '"NaN"', [K.best]: '{"zorn:mix:streak":{"a":1},"zorn:2:streak":"9","zorn:3:streak":true,"zorn:4:streak":null,"zorn:mix:60":-5}', [K.mine]: 'NaN' }],
      ['unknown choices and huge values', { [K.palette]: '"no-such-palette"', [K.count]: '"7"', [K.mode]: '"banana"', [K.best]: JSON.stringify(Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}:2:streak`, i]))), [K.mine]: JSON.stringify(Array(100000).fill('TW')) }],
      ['a best that is not a round count', { [K.best]: '{"zorn:mix:streak":1e308,"zorn:3:streak":2.5}' }],
    ];
    for (const [label, storage] of seeds) {
      const page = await openPage(site, { storage });
      await tab(page, 'battle'); let u = await ui(page);
      t.check(['2', '3', '4', 'mix'].includes(u.count) && ['streak', '60', '120', '300'].includes(u.modeSel) && u.options.some((o) => o.startsWith(u.palette + '=')), `hostile (${label}): a count, a mode and a palette are selected`, { count: u.count, mode: u.modeSel, palette: u.palette });
      const bestLine = (what, line) => { if (!t.check(BEST_LINE.test(line), `hostile (${label}): the best line ${what} is one the page means`, line)) t.finding({ title: 'A saved best that is not a count of rounds is shown as it is', severity: 'low', steps: `Save ${String(storage[K.best]).slice(0, 80)} under ${K.best}, open Value battle (${what}).`, expected: 'No streak yet for these settings: a best is a whole number of rounds, or it is ignored like a value of the wrong type.', actual: line, cause: 'js/battle.js:190 takes any finite number of zero or more' }); };
      bestLine('as opened', u.best);
      await setup(page, { count: '2' }); u = await ui(page);
      bestLine('for 2 colors', u.best);
      await start(page); const s = await state(page);
      t.check(s && s.i === 0 && s.n === 2 && (await ui(page)).swatches === 2, `hostile (${label}): a game starts with two colors`, s && { i: s.i, n: s.n });
      await answer(page, true); await next(page); await answer(page, false); await click(page, '#vb-missNext'); await sleep(300); u = await ui(page);
      t.check(u.popup && u.pct !== '' && u.newBest, `hostile (${label}): a streak of 1 is the first best and scores`, { popup: u.popup, pct: u.pct, newBest: u.newBest });
      const bests = JSON.parse(await storageGet(page, K.best) || 'null');
      t.check(bests && typeof bests === 'object' && !Array.isArray(bests) && Object.keys(bests).length <= 50 && bests[`${u.palette}:2:streak`] === 1, `hostile (${label}): the saved bests are an object of at most fifty, this one in it`, bests && { keys: Object.keys(bests).length, mine: bests[`${u.palette}:2:streak`] });
      await click(page, '#vb-settings'); await sleep(150); u = await ui(page);
      t.check(u.best === 'Your best streak here: 1 in a row.', `hostile (${label}): the setup shows the new best`, u.best);
      await clean(t, page, `hostile (${label})`);
      await page.context().close();
    }
  }

  // ---- painting.js missing: the battle stays on the menu, so its board must still fill the screen ----
  {
    const page = await openPage(site, { viewport: PHONE, block: [site.base + 'js/painting.js'] });
    await sleep(500);
    const offered = await page.evaluate(() => !document.querySelector('[data-tab="battle"]').hidden);
    await tab(page, 'battle'); await setup(page, { palette: 'primary', count: '2', mode: 'streak' }); await start(page);
    const f = await page.evaluate(() => { const r = document.getElementById('vb-play').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, pinned: document.getElementById('vb-play').classList.contains('is-pinned'), topbar: getComputedStyle(document.querySelector('.topbar')).display, swatches: document.querySelectorAll('.vb-swatch').length }; });
    if (offered && !t.check(f.w === f.vw && f.h === f.vh, 'painting.js missing: the battle is offered and its board still fills the phone screen', f)) t.finding({ title: 'With painting.js missing the battle\'s board is pinned without a size', severity: 'medium', steps: 'Block js/painting.js (a failed download). Open Games → Value battle on a 390 × 844 window and Start.', expected: 'Either the battle leaves the menu with the Studio, or its board fills the screen as it does when painting.js is there.', actual: `The board is a ${f.w} × ${f.h} box fixed at the top-left corner over the page, the top bar hidden (${f.topbar}) and the page scroll-locked behind it.`, cause: 'js/battle.js:454 pins the board (position: fixed, styles.css:1652) but js/battle.js:458 sizes it only through PaintStudio.pin, which painting.js provides; js/guard.js:124 keeps the battle on the menu when painting.js fails' });
    await screenshot(page, 'battle-phone-no-painting');
    t.check(page.log.pageerrors.length === 0, 'painting.js missing: no page error in the battle', page.log.pageerrors);
    await page.context().close();
  }

  // ---- the markup and axe: one of each pop-up, the guide inside main, nothing serious on the tab in any state ----
  {
    const page = await openPage(site, { bypassCSP: true });
    const dom = await page.evaluate(() => ({ popups: document.querySelectorAll('[id="vb-popup"]').length, misses: document.querySelectorAll('[id="vb-miss"]').length, helpInMain: document.querySelector('main').contains(document.getElementById('tab-help')), dupIds: Object.entries([...document.querySelectorAll('[id]')].reduce((m, e) => ((m[e.id] = (m[e.id] || 0) + 1), m), {})).filter(([, n]) => n > 1).map(([id]) => id) }));
    if (!t.check(dom.popups === 1 && dom.misses === 1 && dom.helpInMain && dom.dupIds.length === 0, 'index.html: one miss pop-up, one score pop-up, no duplicate id, the guide inside main', dom)) t.finding({ title: 'index.html carries a second copy of the battle pop-ups and a stray </main>', severity: 'low', steps: 'View the source of index.html after the Value battle section.', expected: 'One #vb-miss and one #vb-popup; the How to use section inside <main>.', actual: JSON.stringify(dom), cause: 'index.html, the lines after the Value battle board' });
    await tab(page, 'battle');
    const serious = [];
    const run = async (label) => { for (const v of await axe(page)) { if (v.impact === 'critical' || v.impact === 'serious') serious.push(`${label}: ${v.id} ${v.help} e.g. ${v.nodes[0]}`); else t.note(`axe battle ${label}: ${v.id} (${v.impact}) ${v.help} ×${v.count} e.g. ${v.nodes[0]}`); } };
    await run('setup');
    await setup(page, { palette: 'primary', count: '3', mode: 'streak' }); await start(page); await run('a round');
    await answer(page, true); await run('a right answer'); await next(page); await answer(page, false); await run('the miss pop-up');
    await click(page, '#vb-missNext'); await sleep(300); await run('the score pop-up');
    t.check(serious.length === 0, 'axe: nothing serious or critical on the battle in any state', serious);
    noError(t, page, 'markup and axe');
    await page.context().close();
  }
}
