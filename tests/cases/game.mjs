// Paint by numbers, played like a sceptical tester (README: "Paint by numbers"; source js/game.js, js/subjects.js).
// The setup with My photo and A painting (Another painting never deals the same twice in a row), each level,
// each mode, every known palette and My paints at 0, 1 and 2 ticks, the suggested mark, Mystery's Deal again;
// a game: numbers by button and by tapping the board, each Amount per tap, a held paint, Undo and Clear on
// an empty mix, the 60-part cap, Copy mix (buttons, the board, Done, Esc, the original number), Next ▸ with
// its gold flash and its nudge, Spot on by mixing a number exactly to its recipe, a lock-in with nothing
// painted (0 points), every number mixed exactly (100%, five stars, the time bonus), the score pop-up and
// New best, Analyze, Compare with target by drag and by the arrow keys, Share card (a PNG, headless has no
// share sheet), Play again both ways; Relaxed's stopwatch; Classic's clock run out, Memory's look, Ready and
// four Peeks, and Value first, all driven with Playwright's fake clock (the 5-minute clock cannot be waited
// for); ✕ twice; the reference's Photo/Blocks switch; the phone's full-screen layout, paint scroll bar and
// reference drag; orderings (a tab switch, a new photo and a reload mid-game, double taps); bests kept per
// portrait, level, palette and mode and pruned to fifty; hostile saved state for every game key and myPaints;
// and tiny, flat and transparent pictures. Both widths.
import fs from 'node:fs';
import { openPage, clean, tab, DESKTOP, PHONE, click, text, visible, hscroll, sleep, makeImage, loadPhoto, storageGet, screenshot } from '../lib.mjs';

const K = (s) => 'portrait-value-studio.' + s;
const PRESETS = ['zorn', 'zorn-blue', 'primary', 'cmy', 'split', 'reilly', 'schmid', 'rembrandt', 'sorolla', 'monet'];
const PAINTERS = /after (Rembrandt|Zorn|Sargent|Sorolla|Velázquez|Frans Hals|Vermeer)\.$/;
const MODE_ABOUT = {
  classic: 'Beat the clock: mix every number to match the reference, then lock in.',
  relaxed: 'No clock and no time bonus. Take as long as you like; a stopwatch just counts up.',
  memory: 'The reference shows for 10 seconds, then hides. Paint from memory. A peek at it costs 10 seconds on the clock.',
  value: 'First set each number\u2019s value, light to dark, in greys. Then add the color over your underpainting. The value study scores too.',
  mystery: 'Paint with white and three paints dealt at random. The colors to match are mixed from them, so every one can be reached.',
};

// ---- waits and small drivers ----------------------------------------------------------------------------
const ready = (page) => page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 30000 }).catch(() => null);
const playing = (page) => page.waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
// the result panel, with the match's count-up finished
const scored = (page) => page.waitForFunction(() => { const r = document.getElementById('gameResult'); const m = /(\d+)% color match/.exec(document.getElementById('gameStars').getAttribute('aria-label') || ''); return r && !r.hidden && m && document.getElementById('gamePct').textContent === m[1]; }, null, { timeout: 15000 }).catch(() => null);
const setPalette = (page, id) => page.evaluate((id) => { const s = document.getElementById('gamePalette'); s.value = id; s.dispatchEvent(new Event('change')); }, id);
const setMode = (page, m) => page.evaluate((m) => { const s = document.getElementById('gameMode'); s.value = m; s.dispatchEvent(new Event('change')); }, m);
const setLevel = (page, l) => click(page, '#game' + l[0].toUpperCase() + l.slice(1));
const setAmount = (page, idx) => page.evaluate((i) => { const r = document.getElementById('gameAmount'); r.value = i; r.dispatchEvent(new Event('input')); }, idx);
const pickNumber = (page, k) => page.evaluate((k) => document.querySelector(`.game-number[data-number="${k}"]`).click(), k);
// a tap on a paint (a keyboard click: detail 0, which the paint takes as one tap)
const tapPaint = (page, code, times = 1) => page.evaluate(([code, n]) => { const b = [...document.querySelectorAll('.game-paint')].find((b) => b.querySelector('.game-paint-code').textContent === code); if (!b) throw new Error('no paint ' + code); for (let i = 0; i < n; i++) b.click(); }, [code, times]);
const play = (page) => page.evaluate(() => ({
  timer: document.getElementById('gameTimer').textContent, timerLabel: document.getElementById('gameTimer').getAttribute('aria-label'), low: document.getElementById('gameTimer').classList.contains('is-low'),
  progress: document.getElementById('gameProgress').textContent, lock: document.getElementById('gameLock').textContent,
  // (the mix text joins a code and its amount with a non-breaking space: read as a plain one)
  title: document.getElementById('gameMixTitle').textContent, parts: document.getElementById('gameMixParts').textContent.replace(/ /g, ' '),
  chip: document.getElementById('gameMixChip').style.background, chipEmpty: document.getElementById('gameMixChip').classList.contains('is-empty'),
  undo: document.getElementById('gameUndo').disabled, clear: document.getElementById('gameClear').disabled, copy: document.getElementById('gameCopy').disabled, copyText: document.getElementById('gameCopy').textContent,
  copying: document.getElementById('gamePlay').classList.contains('is-copying'), copyBar: !document.getElementById('gameCopyBar').hidden, copyBarText: document.getElementById('gameCopyText').textContent,
  amount: document.getElementById('gameAmountOut').textContent, paints: [...document.querySelectorAll('.game-paint-code')].map((e) => e.textContent),
  counts: [...document.querySelectorAll('.game-paint-count')].map((e) => e.textContent.replace(/ /g, ' ')),
  numbers: document.querySelectorAll('.game-number').length, pressed: [...document.querySelectorAll('.game-number')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => +b.dataset.number),
  filled: [...document.querySelectorAll('.game-number')].filter((b) => b.classList.contains('is-filled')).map((b) => +b.dataset.number),
  labels: [...document.querySelectorAll('.game-number')].map((b) => b.getAttribute('aria-label')),
  next: (document.querySelector('.game-next') || {}).disabled, toggle: document.getElementById('gameRefToggle').textContent, collapsed: document.getElementById('gameRefFig').classList.contains('is-collapsed'),
  expanded: document.getElementById('gameRefToggle').getAttribute('aria-expanded'), looking: document.getElementById('gamePlay').classList.contains('is-looking'), valuing: document.getElementById('gamePlay').classList.contains('is-valuing'),
  gray: document.getElementById('gameRefFig').classList.contains('is-gray'), valuePane: !document.getElementById('gameValue').hidden,
  valueText: document.getElementById('gameValueText').textContent, valueTitle: document.getElementById('gameValueTitle').textContent, valueClear: document.getElementById('gameValueClear').disabled, valueChip: document.getElementById('gameValueChip').style.background,
  spot: document.getElementById('gameSpot').textContent, spotOn: document.getElementById('gameSpot').classList.contains('is-on'),
  toast: document.getElementById('toast').textContent, focus: document.activeElement && document.activeElement.id, nudge: document.getElementById('gameLock').classList.contains('is-nudge'),
  focusMode: document.body.classList.contains('game-focus'),
}));
const result = (page) => page.evaluate(() => ({
  kicker: document.getElementById('gameKicker').textContent, pct: document.getElementById('gamePct').textContent, grade: document.getElementById('gameGrade').textContent,
  newBest: !document.getElementById('gameNewBest').hidden, starsLabel: document.getElementById('gameStars').getAttribute('aria-label'), stars: document.querySelectorAll('#gameStars .game-star.is-on').length,
  popup: !document.getElementById('gamePopup').hidden, showBar: !document.getElementById('gameShowBar').hidden, points: +document.getElementById('gamePoints').textContent,
  analysis: !document.getElementById('gameAnalysis').hidden, analyzeText: document.getElementById('gameAnalyze').textContent, expanded: document.getElementById('gameAnalyze').getAttribute('aria-expanded'),
  rows: Object.fromEntries([...document.querySelectorAll('#gameBreakdown dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent])),
  zones: [...document.querySelectorAll('#gameZones li')].map((li) => ({ n: +li.querySelector('.game-zone-number').textContent, match: li.querySelector('.game-zone-match').textContent, note: li.querySelector('.mix-zone').textContent, yours: li.querySelector('.mix-recipe').textContent.replace(/ /g, ' '), mix: li.querySelector('.game-zone-tip').textContent.replace(/ /g, ' ') })),
  focus: document.activeElement && document.activeElement.id, focusMode: document.body.classList.contains('game-focus'),
  comparing: document.getElementById('gameFinalWrap').classList.contains('is-comparing'), compareText: document.getElementById('gameCompare').textContent, cut: +document.getElementById('gameFinalHandle').getAttribute('aria-valuenow'),
  final: [document.getElementById('gameFinal').width, document.getElementById('gameFinal').height],
}));
const setup = (page) => page.evaluate(() => ({
  shown: !document.getElementById('gameSetup').hidden, level: (document.querySelector('input[name="gameLevel"]:checked') || {}).value || null, mode: document.getElementById('gameMode').value,
  about: document.getElementById('gameModeAbout').textContent, note: document.getElementById('gamePreviewNote').textContent, hint: document.getElementById('gamePaletteHint').textContent,
  options: [...document.getElementById('gamePalette').options].map((o) => [o.value, o.textContent]), palette: document.getElementById('gamePalette').value, paletteHidden: document.getElementById('gamePalette').hidden, deal: !document.getElementById('gameDeal').hidden,
  dots: [...document.querySelectorAll('#gamePaletteDots .paint-dot')].map((d) => d.title), best: document.getElementById('gameBest').textContent, start: document.getElementById('gameStart').disabled,
  subject: (document.querySelector('input[name="gameSubject"]:checked') || {}).value, photoPane: !document.getElementById('gameFromPhotoPane').hidden, paintingPane: !document.getElementById('gameFromPaintingPane').hidden,
  photoName: document.getElementById('gamePhotoName').textContent, paintingName: document.getElementById('gamePaintingName').textContent, levels: [...document.querySelectorAll('#tab-game .game-levels label small')].map((e) => e.textContent),
  preview: [document.getElementById('gamePreview').width, document.getElementById('gamePreview').height], painting: localStorage.getItem('portrait-value-studio.gamePainting'),
  amount: document.getElementById('gameAmountOut').textContent, sound: document.getElementById('gameSound').getAttribute('aria-pressed'), refView: (document.querySelector('#tab-game [data-ref-view][aria-pressed="true"]') || {}).dataset && document.querySelector('#tab-game [data-ref-view][aria-pressed="true"]').dataset.refView,
  lede: document.querySelector('#tab-game .game-lede').textContent,
}));
const numbersOf = (note) => +(/^(\d+) numbers? to mix/.exec(note) || [])[1];
// "2¾" -> 2.75
const parts = (s) => { const m = /^(\d+)?([¼½¾])?$/.exec(s); if (!m) return NaN; return (+(m[1] || 0)) + ({ '¼': 0.25, '½': 0.5, '¾': 0.75, undefined: 0 })[m[2]]; };
// "Mix: TW 3 · YO ½" -> { TW: 3, YO: 0.5 }
const recipeOf = (tip) => Object.fromEntries(tip.replace(/^Mix: /, '').split(' · ').filter(Boolean).map((p) => { const [code, n] = p.split(' '); return [code, parts(n)]; }));
// mix the chosen number exactly to a recipe, with the slider set to the biggest amount that still fits each time
async function mixExact(page, recipe) {
  await page.evaluate((recipe) => {
    const amounts = [0.25, 0.5, 1, 2, 4];
    const range = document.getElementById('gameAmount');
    for (const [code, want] of Object.entries(recipe)) {
      const b = [...document.querySelectorAll('.game-paint')].find((b) => b.querySelector('.game-paint-code').textContent === code);
      if (!b) throw new Error('no paint ' + code);
      let left = want;
      while (left > 0.001) {
        const i = amounts.map((a, i) => [a, i]).filter(([a]) => a <= left + 0.001).pop()[1];
        range.value = i; range.dispatchEvent(new Event('input'));
        b.click();
        left -= amounts[i];
      }
    }
  }, recipe);
}
const box = async (page, selector) => { const loc = page.locator(selector).first(); await loc.scrollIntoViewIfNeeded().catch(() => null); return loc.boundingBox(); };
const bests = async (page) => JSON.parse((await storageGet(page, K('gameBest'))) || '{}');
const pngSize = (file) => { const b = fs.readFileSync(file); return b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
// a paper pixel of the board away from any outline, in canvas coordinates
const paperSpot = (page) => page.evaluate(() => { const c = document.getElementById('gameCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const paper = (x, y) => { const i = (y * c.width + x) * 4; return d[i] === 245 && d[i + 1] === 240 && d[i + 2] === 230; }; for (let y = 8; y < c.height - 8; y += 5) for (let x = 8; x < c.width - 8; x += 5) { if ([[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, -3]].every(([dx, dy]) => paper(x + dx, y + dy))) return { x, y, w: c.width, h: c.height }; } return null; });
const pixel = (page, selector, x, y) => page.evaluate(([s, x, y]) => [...document.querySelector(s).getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [selector, x, y]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default async function game(t, site) {
  // ================================================================================================
  // 1. The setup: My photo, levels, modes, palettes, A painting, Mystery, My paints
  // ================================================================================================
  {
    const page = await openPage(site, { url: '#game' });
    await ready(page);
    let s = await setup(page);
    t.check(s.shown && s.subject === 'photo' && s.photoPane && !s.paintingPane, 'setup: My photo is chosen, its pane shows', s);
    t.check(s.photoName === 'Painting from the sample portrait. Load your own photo to paint from it.', 'setup: the photo pane names the sample portrait', s.photoName);
    t.check(s.level === 'medium' && s.mode === 'classic' && s.about === MODE_ABOUT.classic, 'setup: Medium and Classic by default, with Classic explained', [s.level, s.mode, s.about]);
    t.check(same(s.levels, ['Big shapes · 6 min', 'Smaller shapes · 5 min', 'More colors · 8 min']), 'setup: the levels say their shapes and minutes', s.levels);
    t.check(same(s.options.map((o) => o[0]), PRESETS), 'setup: the ten known palettes, no My paints with nothing ticked', s.options);
    const sug = s.options.filter((o) => / \(suggested\)$/.test(o[1]));
    t.check(sug.length === 1 && s.palette === sug[0][0], 'setup: exactly one palette is marked suggested and it is chosen', [sug, s.palette]);
    t.check(/^Suggested for this portrait\. \d+ paints, which mix \d+ of its \d+ colors closely\. The reference is mixed from them, so every number can be matched exactly\.$/.test(s.hint), 'setup: the palette hint says how many colors it mixes closely', s.hint);
    const mediumN = numbersOf(s.note);
    t.check(mediumN >= 3 && s.note === `${mediumN} numbers to mix, 5:00 on the clock.` && s.hint.includes(`of its ${mediumN} colors`), 'setup: the preview note counts the numbers and Medium\'s 5:00', s.note);
    t.check(s.preview[0] === 600 && s.preview[1] === 750 && !s.start && s.best === '', 'setup: the preview is the sample\'s working size, Start enabled, no best yet', [s.preview, s.start, s.best]);
    t.check(/\d+ paints/.test(s.hint) && s.dots.length === +(/(\d+) paints/.exec(s.hint) || [])[1], 'setup: the paint dots match the hint\'s count', [s.dots.length, s.hint]);
    t.check(s.amount === '1 part per tap' && s.sound === 'true' && s.refView === 'photo', 'setup: Amount 1 part, sound on, Photo reference by default', [s.amount, s.sound, s.refView]);
    const sugId = s.palette;

    // levels
    await setLevel(page, 'easy'); await ready(page);
    const easy = await setup(page);
    const easyN = numbersOf(easy.note);
    t.check(easy.note === `${easyN} numbers to mix, 6:00 on the clock.` && easyN <= mediumN, 'Easy: 6:00 and no more numbers than Medium', [easy.note, mediumN]);
    t.check(easy.palette === sugId && easy.options.some((o) => / \(suggested\)$/.test(o[1])), 'Easy: a new board keeps a suggested palette marked and chosen', [easy.palette, easy.options]);
    await setLevel(page, 'hard'); await ready(page);
    const hard = await setup(page);
    const hardN = numbersOf(hard.note);
    t.check(hard.note === `${hardN} numbers to mix, 8:00 on the clock.` && hardN >= 3, 'Hard: 8:00 on the clock', hard.note);
    t.note(`numbers on the sample portrait: Easy ${easyN}, Medium ${mediumN}, Hard ${hardN} (shape counts are not reachable from the page; only the numbers are checked)`);
    await setLevel(page, 'medium'); await ready(page);

    // modes
    for (const m of ['relaxed', 'memory', 'value', 'mystery', 'classic']) {
      await setMode(page, m); await ready(page);
      const ms = await setup(page);
      t.check(ms.about === MODE_ABOUT[m], `mode ${m}: explained`, ms.about);
      const want = m === 'relaxed' ? `${mediumN} numbers to mix, no time limit.` : m === 'memory' ? `${mediumN} numbers to mix, 5:00 on the clock, after a 10-second look.` : m === 'value' ? `${mediumN} numbers to mix, 5:00 on the clock. Values first, then color.` : `${mediumN} numbers to mix, 5:00 on the clock.`;
      t.check(ms.note === want, `mode ${m}: the preview note`, ms.note);
      t.check(same(ms.levels, m === 'relaxed' ? ['Big shapes · no clock', 'Smaller shapes · no clock', 'More colors · no clock'] : ['Big shapes · 6 min', 'Smaller shapes · 5 min', 'More colors · 8 min']), `mode ${m}: the level labels`, ms.levels);
      t.check(ms.paletteHidden === (m === 'mystery') && ms.deal === (m === 'mystery'), `mode ${m}: the palette menu ${m === 'mystery' ? 'gives way to Deal again' : 'shows, no Deal again'}`, [ms.paletteHidden, ms.deal]);
      t.check(ms.best === '' && !ms.start, `mode ${m}: no best yet, Start enabled`, [ms.best, ms.start]);
      if (m === 'mystery') {
        t.check(ms.dots.length === 4 && /^titanium white$/i.test(ms.dots[0]) && /^Dealt at random: white and three paints\. 4 paints, which mix \d+ of its \d+ colors closely\./.test(ms.hint), 'Mystery: white and three paints, said so', [ms.dots, ms.hint]);
        const hands = [ms.dots.join('|')];
        for (let i = 0; i < 3; i++) { await click(page, '#gameDeal'); await ready(page); const d = await setup(page); hands.push(d.dots.join('|')); t.check(d.dots.length === 4 && /^titanium white$/i.test(d.dots[0]) && !d.start, `Mystery: Deal again ${i + 1} deals white and three, Start enabled`, d.dots); }
        t.check(new Set(hands).size >= 2, 'Mystery: Deal again deals a different hand', hands);
      }
    }

    // every known palette, then the whole menu spammed
    for (const id of PRESETS) {
      await setPalette(page, id); await ready(page);
      const ps = await setup(page);
      const n = ps.dots.length;
      const lead = id === sugId ? 'Suggested for this portrait.' : `Suggested for this portrait: ${(ps.options.find((o) => o[0] === sugId) || [])[1].replace(/ \(suggested\)$/, '')}.`;
      t.check(ps.palette === id && ps.hint.startsWith(`${lead} ${n} paints, which mix `) && ps.hint.includes(`of its ${mediumN} colors closely.`) && !ps.start, `palette ${id}: chosen, ${n} paints, the hint names the suggestion, Start enabled`, ps.hint);
    }
    for (const id of PRESETS) await setPalette(page, id);
    await setPalette(page, 'split'); await ready(page);
    s = await setup(page);
    t.check(s.palette === 'split' && s.dots.length === 7 && / 7 paints, which mix /.test(s.hint) && !s.start, 'palette spam: the last choice wins, its hint and dots', [s.palette, s.dots.length, s.hint]);
    await setPalette(page, sugId); await ready(page);
    await clean(t, page, 'setup: levels, modes, palettes');

    // A painting
    await click(page, '#gameFromPainting'); await ready(page);
    s = await setup(page);
    t.check(s.subject === 'painting' && s.paintingPane && !s.photoPane && PAINTERS.test(s.paintingName) && /^"[a-z]+-\d+"$/.test(s.painting), 'A painting: dealt, named after one of the seven painters', [s.paintingName, s.painting]);
    t.check(numbersOf(s.note) >= 3 && s.preview[0] > 0 && s.options.some((o) => / \(suggested\)$/.test(o[1])) && !s.start, 'A painting: a board with numbers, a suggested palette, Start enabled', [s.note, s.preview]);
    const dealt = [s.painting];
    for (let i = 0; i < 4; i++) {
      await click(page, '#gameReroll'); await ready(page);
      const d = await setup(page);
      dealt.push(d.painting);
      t.check(d.painting !== dealt[dealt.length - 2] && PAINTERS.test(d.paintingName) && numbersOf(d.note) >= 3 && !d.start, `Another painting ${i + 1}: a different portrait, named, with a board`, [d.painting, d.paintingName, d.note]);
    }
    t.check(new Set(dealt).size === dealt.length, 'Another painting: five deals, no repeats', dealt);
    t.check((await storageGet(page, K('gameSubject'))) === '{"kind":"painting"}', 'A painting: the choice is saved as a kind only', await storageGet(page, K('gameSubject')));
    const pm = numbersOf((await setup(page)).note);
    await setLevel(page, 'easy'); await ready(page);
    t.check(numbersOf((await setup(page)).note) <= pm && /6:00/.test((await setup(page)).note), 'A painting at Easy: no more numbers than Medium, 6:00', [(await setup(page)).note, pm]);
    await setLevel(page, 'medium'); await ready(page);
    // loading a photo from the painting's setup means painting from it
    await loadPhoto(page, await makeImage(page, { width: 500, height: 640, type: 'image/jpeg', name: 'portrait-a.jpg' }));
    await ready(page);
    s = await setup(page);
    t.check(s.subject === 'photo' && s.photoPane && s.photoName === 'Painting from portrait-a.' && s.preview[0] === 500 && s.preview[1] === 640, 'Load another photo while on A painting: back to My photo, named, its board', [s.subject, s.photoName, s.preview]);
    await clean(t, page, 'setup: a painting');

    // My paints: 0, 1 and 2 ticks (the menu is rebuilt when the tab is opened)
    for (const [mine, want] of [[[], null], [['TW'], null], [['TW', 'IB'], 'My paints (2)']]) {
      await page.evaluate((m) => localStorage.setItem('portrait-value-studio.myPaints', JSON.stringify(m)), mine);
      await tab(page, 'study'); await tab(page, 'game'); await ready(page);
      const ms = await setup(page);
      const opt = ms.options.find((o) => o[0] === 'mine');
      t.check((opt ? opt[1].replace(/ \(suggested\)$/, '') : null) === want, `My paints with ${mine.length} ticked: ${want ? 'offered as ' + want : 'not offered'}`, ms.options);
      if (want) {
        await setPalette(page, 'mine'); await ready(page);
        const m2 = await setup(page);
        t.check(m2.palette === 'mine' && same(m2.dots.map((d) => d.toLowerCase()), ['titanium white', 'ivory black']) && / 2 paints, which mix /.test(m2.hint) && !m2.start, 'My paints chosen: its two paints, the hint, Start enabled', [m2.dots, m2.hint]);
      }
    }
    await clean(t, page, 'setup: my paints');
    await page.context().close();
  }

  // ================================================================================================
  // 2. A Classic game on the sample with Zorn: nothing painted, then everything mixed exactly
  // ================================================================================================
  {
    const page = await openPage(site, { url: '#game' });
    await ready(page); await setPalette(page, 'zorn'); await ready(page);
    const srcKey = await page.evaluate(() => Studio.sourceKey());
    const bestKey = `${srcKey}|medium|zorn`;
    await click(page, '#gameStart'); await playing(page);
    let p = await play(page);
    const N = p.numbers;
    t.check(p.timer === '5:00' && p.timerLabel === 'Time left' && p.progress === `0 of ${N} numbers painted` && p.lock === 'Lock in portrait', 'play: the clock at 5:00, nothing painted, Lock in', [p.timer, p.progress, p.lock]);
    t.check(p.title === 'Number 1' && p.parts.startsWith('Empty. Tap a paint') && p.chipEmpty && same(p.pressed, [0]) && p.filled.length === 0, 'play: number 1 chosen and empty', [p.title, p.parts, p.pressed]);
    t.check(p.undo && p.clear && p.copy && p.copyText === 'Copy mix' && p.focus === 'gameLock', 'play: Undo, Clear and Copy mix are off on an empty mix, Lock in has focus', [p.undo, p.clear, p.copy, p.focus]);
    t.check(same(p.paints, ['TW', 'YO', 'CRL', 'IB']) && p.amount === '1 part per tap' && p.toggle === 'Reference' && !p.collapsed && p.expanded === 'true', 'play: Zorn\'s four paints, 1 part per tap, the reference shown', [p.paints, p.amount, p.toggle]);
    t.check(p.labels[0] === 'Number 1, not painted yet' && !p.next, 'play: the number buttons say they are unpainted, Next ▸ enabled', p.labels[0]);
    await click(page, '#gameUndo'); await click(page, '#gameClear');
    p = await play(page);
    t.check(p.parts.startsWith('Empty') && p.undo && p.clear, 'Undo and Clear on an empty mix do nothing', p.parts);
    t.check(!(await visible(page, '.game-quick-undo')), 'desktop: no quick undo (the phone\'s)');

    // lock in with nothing painted
    await click(page, '#gameLock'); await click(page, '#gameLock'); await scored(page);
    let r = await result(page);
    t.check(r.kicker === 'Portrait locked in' && r.pct === '0' && r.stars === 0 && r.starsLabel === '0 out of 5 stars, 0% color match' && r.grade === 'Keep mixing', 'nothing painted: 0%, no stars, Keep mixing', r);
    t.check(r.popup && !r.showBar && r.focus === 'gameAnalyze' && !r.analysis && r.analyzeText === 'Analyze', 'nothing painted: the score pops up, Analyze focused', [r.popup, r.focus]);
    t.check(r.newBest, 'nothing painted: the first score shows New best!', r.newBest);
    t.note('A first lock-in with nothing painted (0 points) flashes "New best!": the first score is always a best. Arguably a stale word on a 0; left as is.');
    t.check(same(await bests(page), { [bestKey]: 0 }), 'nothing painted: the best is kept under portrait|level|palette as 0', await bests(page));
    await click(page, '#gameAnalyze');
    r = await result(page);
    t.check(r.analysis && r.analyzeText === 'Hide analysis' && r.expanded === 'true' && r.points === 0, 'Analyze opens the details, 0 points', [r.analysis, r.analyzeText, r.points]);
    t.check(r.rows.Mode === 'Classic' && r.rows['Color accuracy'] === '0% · 0' && /^\d:\d\d · \+0 \(some numbers unpainted\)$/.test(r.rows['Time left']) && r.rows.Palette === 'Zorn', 'nothing painted: the breakdown says why the time added nothing', r.rows);
    t.check(r.zones.length === N && r.zones.every((z) => z.match === 'Not painted' && z.note === '' && z.yours === '' && /^Mix: [A-Za-z]+ [\d¼½¾]+( · [A-Za-z]+ [\d¼½¾]+)*$/.test(z.mix)), 'nothing painted: every number says Not painted with the recipe its color was mixed from', r.zones.slice(0, 3));
    const recipes = Object.fromEntries(r.zones.map((z) => [z.n - 1, { text: z.mix.replace(/^Mix: /, ''), parts: recipeOf(z.mix) }]));
    t.check(Object.values(recipes).every((x) => Object.values(x.parts).every((n) => n > 0 && n % 0.25 === 0 && !Number.isNaN(n))), 'the recipes are in quarter parts', recipes[0]);
    await click(page, '#gameAnalyze');
    r = await result(page);
    t.check(!r.analysis && r.analyzeText === 'Analyze', 'Analyze again hides the details');
    // Play again: the dialog, Cancel, then Same photo
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200);
    let dlg = await page.evaluate(() => ({ open: document.getElementById('againDialog').open, same: document.getElementById('againSame').textContent, next: document.getElementById('againNew').textContent, hint: document.getElementById('againHint').textContent, focus: document.activeElement.id }));
    t.check(dlg.open && dlg.same === 'Same photo' && dlg.next === 'New photo' && dlg.hint === 'Try the same photo again, or load a new one?' && dlg.focus === 'againSame', 'Play again asks: same photo or a new one', dlg);
    await click(page, '#againCancel'); await sleep(200);
    t.check(!(await page.evaluate(() => document.getElementById('againDialog').open)) && !(await result(page)).analysis, 'Cancel closes the question and keeps the score');
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200);
    await click(page, '#againSame'); await playing(page);
    p = await play(page);
    t.check(p.timer === '5:00' && p.progress === `0 of ${N} numbers painted` && p.parts.startsWith('Empty') && !(await page.evaluate(() => document.getElementById('againDialog').open)), 'Same photo: a fresh game on the same board', [p.timer, p.progress]);
    await clean(t, page, 'game: nothing painted');

    // ---- numbers by button and by tapping the board
    await pickNumber(page, 2);
    p = await play(page);
    t.check(p.title === 'Number 3' && same(p.pressed, [2]), 'a number button chooses its number', [p.title, p.pressed]);
    const spot = await paperSpot(page);
    const cb = await box(page, '#gameCanvas');
    t.check(spot && cb, 'the board has bare paper to tap', spot);
    if (spot && cb) {
      await page.mouse.click(cb.x + (spot.x + 0.5) * cb.width / spot.w, cb.y + (spot.y + 0.5) * cb.height / spot.h);
      p = await play(page);
      const px = await pixel(page, '#gameCanvas', spot.x, spot.y);
      t.check(/^Number \d+$/.test(p.title) && p.pressed.length === 1 && same(px, [226, 234, 216]), 'tapping a shape chooses its number and washes its shapes', [p.title, px]);
    }
    // ---- Amount per tap: each setting, then the cap
    await pickNumber(page, 0);
    const amountWords = ['¼ part per tap', '½ part per tap', '1 part per tap', '2 parts per tap', '4 parts per tap'];
    const sums = ['TW ¼', 'TW ¾', 'TW 1¾', 'TW 3¾', 'TW 7¾'];
    for (let i = 0; i < 5; i++) {
      await setAmount(page, i); await tapPaint(page, 'TW');
      p = await play(page);
      t.check(p.amount === amountWords[i] && p.parts === sums[i] && p.counts[0] === sums[i].slice(3), `Amount ${amountWords[i]}: a tap adds it`, [p.amount, p.parts, p.counts]);
    }
    t.check((await storageGet(page, K('gameAmount'))) === '4', 'the amount per tap is remembered', await storageGet(page, K('gameAmount')));
    p = await play(page);
    t.check(!p.chipEmpty && p.chip !== '' && same(p.filled, [0]) && p.progress === `1 of ${N} numbers painted` && p.labels[0] === 'Number 1, painted' && !p.undo && !p.clear && !p.copy, 'a painted number: its chip, its button filled, the progress, Undo/Clear/Copy on', [p.chip, p.filled, p.progress, p.labels[0]]);
    await tapPaint(page, 'TW', 13);
    p = await play(page);
    t.check(p.parts === 'TW 59¾', 'thirteen more taps of 4 bring the mix to 59¾ parts', p.parts);
    await tapPaint(page, 'TW');
    p = await play(page);
    t.check(p.parts === 'TW 59¾' && p.toast === 'A mix holds up to 60 parts', 'one past the cap: refused and said', [p.parts, p.toast]);
    await click(page, '#gameClear');
    p = await play(page);
    t.check(p.parts.startsWith('Empty') && p.undo && p.clear && p.copy && p.chipEmpty && p.filled.length === 0 && p.progress === `0 of ${N} numbers painted`, 'Clear empties the mix and its number', [p.parts, p.progress]);
    // ---- Undo
    await setAmount(page, 2); await tapPaint(page, 'TW'); await tapPaint(page, 'YO');
    t.check((await play(page)).parts === 'TW 1 · YO 1', 'two paints, one part each', (await play(page)).parts);
    await click(page, '#gameUndo');
    t.check((await play(page)).parts === 'TW 1', 'Undo takes back the last part', (await play(page)).parts);
    await click(page, '#gameUndo');
    p = await play(page);
    t.check(p.parts.startsWith('Empty') && p.undo, 'Undo again empties the mix and turns itself off', p.parts);
    // ---- a held paint keeps adding; a keyboard press adds one
    const pb = await box(page, '.game-paint');
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down(); await sleep(1100); await page.mouse.up();
    p = await play(page);
    t.check(/^TW (\d+)$/.test(p.parts) && parts(p.parts.slice(3)) >= 4, 'holding a paint for a second keeps adding parts', p.parts);
    await click(page, '#gameClear');
    await page.focus('.game-paint'); await page.keyboard.press('Enter');
    t.check((await play(page)).parts === 'TW 1', 'Enter on a focused paint adds exactly one part', (await play(page)).parts);
    await page.keyboard.press('Space');
    t.check((await play(page)).parts === 'TW 2', 'Space on a focused paint adds exactly one part', (await play(page)).parts);
    await click(page, '#gameClear');
    // ---- the sound switch
    await click(page, '#gameSound');
    t.check((await page.evaluate(() => [document.getElementById('gameSound').getAttribute('aria-pressed'), document.getElementById('gameSound').title])).join() === 'false,Sound and vibration off' && (await storageGet(page, K('gameSound'))) === 'false', 'the speaker turns sound and vibration off and remembers it');
    await click(page, '#gameSound');
    t.check((await storageGet(page, K('gameSound'))) === 'true', 'and on again');
    await clean(t, page, 'game: taps, amounts, undo, hold');

    // ---- Spot on: number 1 mixed exactly to its recipe
    await pickNumber(page, 0);
    await mixExact(page, recipes[0].parts);
    p = await play(page);
    t.check(p.parts === recipes[0].text, 'number 1 mixed exactly to its recipe, listed the same way', [p.parts, recipes[0].text]);
    t.check(p.spot === 'Spot on! Number 1' && p.spotOn && (await page.evaluate(() => document.getElementById('gameMixChip').classList.contains('is-spot') && document.querySelector('.game-number[data-number="0"]').classList.contains('is-spot'))), 'Spot on! badge, the chip and the number pulse', [p.spot, p.spotOn]);
    t.note('The two-note chime and the vibration cannot be heard or felt here; the badge, the chip and the number pulse are what is checked. Headless Chromium creates the AudioContext without error.');
    // ---- Copy mix: a number button, a shape on the board, Next ▸ refused, Done, Esc, the original number
    await click(page, '#gameCopy');
    p = await play(page);
    t.check(p.copying && p.copyBar && p.copyBarText === 'Copying number 1. Tap the numbers or shapes to paste its mix into.' && p.copyText === 'Stop copying', 'Copy mix starts copying number 1 and says so', [p.copyBarText, p.copyText]);
    await pickNumber(page, 1);
    p = await play(page);
    t.check(p.toast === 'Number 1’s mix pasted into number 2' && p.filled.includes(1) && p.title === 'Number 1' && p.copying, 'a number button takes the copy, part for part, and the copy goes on', [p.toast, p.filled, p.title]);
    const spot2 = await paperSpot(page);
    if (spot2) {
      await page.mouse.click(cb.x + (spot2.x + 0.5) * cb.width / spot2.w, cb.y + (spot2.y + 0.5) * cb.height / spot2.h);
      p = await play(page);
      const px = await pixel(page, '#gameCanvas', spot2.x, spot2.y);
      t.check(/^Number 1’s mix pasted into number \d+$/.test(p.toast) && !same(px, [245, 240, 230]) && p.copying, 'a shape on the board takes the copy too', [p.toast, px]);
    }
    await page.evaluate(() => document.querySelector('.game-next').click());
    t.check((await play(page)).toast === 'Finish copying first', 'Next ▸ while copying is refused and says so', (await play(page)).toast);
    await click(page, '#gameCopyDone');
    p = await play(page);
    t.check(!p.copying && !p.copyBar && p.copyText === 'Copy mix', 'Done ends the copy', [p.copying, p.copyText]);
    await pickNumber(page, 1);
    t.check((await play(page)).parts === recipes[0].text && (await play(page)).title === 'Number 2', 'number 2 holds number 1\'s mix, part for part', (await play(page)).parts);
    await pickNumber(page, 0); await click(page, '#gameCopy'); await page.keyboard.press('Escape');
    t.check(!(await play(page)).copying, 'Esc ends the copy');
    await click(page, '#gameCopy'); await pickNumber(page, 0);
    t.check(!(await play(page)).copying, 'tapping the original number ends the copy');
    // the copy can then be changed on its own
    await pickNumber(page, 1); await setAmount(page, 2); await tapPaint(page, 'IB');
    t.check((await play(page)).parts !== recipes[0].text && (await pickNumber(page, 0), (await play(page)).parts === recipes[0].text), 'the pasted copy changes on its own, the original stays');
    await clean(t, page, 'game: spot on, copy');

    // ---- Next ▸ flashes the next unpainted number gold; mix everything; Next ▸ nudges Lock in
    await pickNumber(page, 0);
    const flash = await page.evaluate(async () => {
      const c = document.getElementById('gameCanvas'); const g = c.getContext('2d');
      const gold = () => { const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 64) if (d[i] === 217 && d[i + 1] === 164 && d[i + 2] === 65) n++; return n; };
      document.querySelector('.game-next').click();
      let max = 0; const t0 = performance.now();
      while (performance.now() - t0 < 1200) { max = Math.max(max, gold()); await new Promise((r) => setTimeout(r, 25)); }
      return { max, title: document.getElementById('gameMixTitle').textContent, pressed: [...document.querySelectorAll('.game-number[aria-pressed="true"]')].map((b) => +b.dataset.number) };
    });
    const firstUnpainted = (await play(page)).filled;
    t.check(flash.max > 0 && flash.title !== 'Number 1' && flash.title !== 'Number 2' && !firstUnpainted.includes(flash.pressed[0]), 'Next ▸ jumps to the next unmixed number and flashes its shapes gold', [flash, firstUnpainted]);
    for (let k = 0; k < N; k++) { await pickNumber(page, k); await click(page, '#gameClear'); await mixExact(page, recipes[k].parts); }
    p = await play(page);
    const mixed = [];
    for (let k = 0; k < N; k++) { await pickNumber(page, k); mixed.push((await play(page)).parts === recipes[k].text); }
    t.check(mixed.every(Boolean) && p.progress === `${N} of ${N} numbers painted` && p.filled.length === N, 'every number mixed exactly to its recipe', [mixed, p.progress]);
    t.check(p.spot === `Spot on! Number ${N}`, 'the last exact mix got the Spot on! badge', p.spot);
    const paper = await page.evaluate(() => { const c = document.getElementById('gameCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 245 && d[i + 1] === 240 && d[i + 2] === 230) n++; return n; });
    t.check(paper === 0, 'with every number painted no bare paper is left: every shape belongs to a number', paper);
    await page.evaluate(() => document.querySelector('.game-next').click());
    p = await play(page);
    t.check(p.toast === 'Every number has a mix. Lock in when you are ready.' && p.nudge, 'Next ▸ with nothing left nudges Lock in portrait', [p.toast, p.nudge]);
    // ---- the Photo / Blocks switch (remembered)
    const refBefore = await page.evaluate(() => document.getElementById('gameRef').toDataURL().length);
    await click(page, '#tab-game [data-ref-view="blocks"]');
    const refAfter = await page.evaluate(() => ({ len: document.getElementById('gameRef').toDataURL().length, pressed: document.querySelector('#tab-game [data-ref-view="blocks"]').getAttribute('aria-pressed'), photo: document.querySelector('#tab-game [data-ref-view="photo"]').getAttribute('aria-pressed'), label: document.getElementById('gameRef').getAttribute('aria-label') }));
    t.check(refAfter.len !== refBefore && refAfter.pressed === 'true' && refAfter.photo === 'false' && refAfter.label === 'The reference as a color-block study' && (await storageGet(page, K('gameRefView'))) === '"blocks"', 'Blocks shows the color-block study and is remembered', refAfter);
    await click(page, '#tab-game [data-ref-view="photo"]');
    t.check((await page.evaluate(() => document.getElementById('gameRef').toDataURL().length)) === refBefore, 'Photo shows the photo again');
    await click(page, '#gameRefToggle');
    p = await play(page);
    t.check(p.collapsed && p.expanded === 'false', 'Reference · hide folds the reference away', [p.collapsed, p.expanded]);
    await click(page, '#gameRefToggle');
    t.check(!(await play(page)).collapsed, 'and shows it again');
    await clean(t, page, 'game: next, all mixed, reference');

    // ---- Lock in: 100%, five stars, the time bonus, New best
    await click(page, '#gameLock'); await scored(page);
    r = await result(page);
    t.check(r.pct === '100' && r.stars === 5 && r.starsLabel === '5 out of 5 stars, 100% color match' && r.grade === 'Master colorist!' && r.kicker === 'Portrait locked in' && r.newBest, '100% match: five stars, Master colorist!, New best!', r);
    await click(page, '#gameAnalyze');
    r = await result(page);
    const bonus = +(/\+(\d+)$/.exec(r.rows['Time left']) || [])[1];
    t.check(/^[4]:\d\d · \+\d+$/.test(r.rows['Time left']) && bonus > 0 && bonus <= 200 && r.rows['Color accuracy'] === '100% · 1000' && r.points === 1000 + bonus, 'the points are 1,000 for the colors plus the time bonus, scaled by accuracy', [r.rows, r.points]);
    t.check(r.zones.length === N && r.zones.every((z) => z.match === '100% match' && z.note === 'spot on' && z.yours === 'You: ' + z.mix.replace(/^Mix: /, '')), 'every number scores 100% and says spot on, your mix equal to the recipe', r.zones[0]);
    t.check((await bests(page))[bestKey] === r.points, 'the best is kept as the points', await bests(page));
    const bestPoints = r.points;
    // ---- close the score, Compare with target by drag and keys, Share card
    await click(page, '#gamePopupClose');
    r = await result(page);
    t.check(!r.popup && r.showBar && r.focus === 'gameShowScore' && !r.comparing && r.compareText === 'Compare with target', '× hides the score and offers Show score and Compare', [r.popup, r.showBar, r.focus]);
    await click(page, '#gameCompare');
    await page.waitForFunction(() => document.getElementById('gameFinalHandle').getAttribute('aria-valuenow') === '50', null, { timeout: 3000 }).catch(() => null);
    r = await result(page);
    t.check(r.comparing && r.compareText === 'Stop comparing' && r.cut === 50 && (await visible(page, '#gameFinalHandle')), 'Compare with target wipes in and rests at the middle', [r.comparing, r.cut]);
    const fw = await box(page, '#gameFinalWrap');
    await page.mouse.move(fw.x + fw.width * 0.5, fw.y + fw.height * 0.5); await page.mouse.down(); await page.mouse.move(fw.x + fw.width * 0.25, fw.y + fw.height * 0.5, { steps: 5 }); await page.mouse.up();
    r = await result(page);
    t.check(Math.abs(r.cut - 25) <= 2 && (await page.evaluate(() => document.getElementById('gameFinalWrap').style.getPropertyValue('--cut'))).startsWith('25'), 'dragging the divider moves the wipe to where the pointer is', [r.cut]);
    await page.focus('#gameFinalHandle');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    t.check((await result(page)).cut === 35, 'the arrow keys move the divider 5% a press', (await result(page)).cut);
    await page.keyboard.press('ArrowLeft');
    t.check((await result(page)).cut === 30, 'ArrowLeft moves it back');
    await page.keyboard.press('End'); const atEnd = (await result(page)).cut; await page.keyboard.press('Home');
    t.check(atEnd === 100 && (await result(page)).cut === 0, 'End and Home take it to the edges', [atEnd, (await result(page)).cut]);
    await click(page, '#gameCompare');
    r = await result(page);
    t.check(!r.comparing && r.compareText === 'Compare with target' && r.cut === 50, 'Stop comparing puts the divider away');
    await click(page, '#gameShowScore');
    r = await result(page);
    t.check(r.popup && !r.showBar && r.focus === 'gameAnalyze', 'Show score brings the score back');
    const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await click(page, '#gamePopup [data-game="share"]');
    const d = await dl;
    const size = d ? pngSize(await d.path()) : null;
    t.check(d && d.suggestedFilename() === 'portrait-value-studio-100pct.png' && same(size, [1080, 1350]), 'Share card without a share sheet saves a 1080 × 1350 PNG named by the score', [d && d.suggestedFilename(), size]);
    t.check(!(await page.evaluate(() => document.getElementById('saveDialog') && document.getElementById('saveDialog').open)), 'the share card needs no save-by-hand dialog at the top level');
    await clean(t, page, 'game: 100%, compare, share');

    // ---- Play again, Same photo: a lower score is no New best; Change settings shows the best
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200); await click(page, '#againSame'); await playing(page);
    await click(page, '#gameLock'); await scored(page);
    r = await result(page);
    t.check(r.pct === '0' && !r.newBest && (await bests(page))[bestKey] === bestPoints, 'a worse game is no New best and leaves the best alone', [r.pct, r.newBest, await bests(page)]);
    await click(page, '#gamePopup [data-game="new"]'); await ready(page);
    let s = await setup(page);
    t.check(s.shown && s.best === `Your best on this portrait at this level in Classic mode: ${bestPoints} points` && !s.start, 'Change settings: the setup names the best for this portrait, level, palette and mode', s.best);
    await setLevel(page, 'easy'); await ready(page);
    t.check((await setup(page)).best === '', 'another level has no best yet');
    await setLevel(page, 'medium'); await ready(page);
    await setPalette(page, 'primary'); await ready(page);
    t.check((await setup(page)).best === '', 'another palette has no best yet');
    await setPalette(page, 'zorn'); await ready(page);
    await setMode(page, 'relaxed'); await ready(page);
    t.check((await setup(page)).best === '', 'another mode has no best yet');
    await setMode(page, 'classic'); await ready(page);
    t.check((await setup(page)).best.endsWith(`${bestPoints} points`), 'back to the same settings, the best is back');
    // the lede with the remembered amount
    await setAmount(page, 4);
    s = await setup(page);
    const ledeOk = t.check(!/Every tap adds one part\./.test(s.lede) || (await storageGet(page, K('gameAmount'))) === '1', 'the setup\'s lede does not say every tap adds one part while the remembered Amount is 4 parts', [s.lede, await storageGet(page, K('gameAmount'))]);
    if (!ledeOk) t.finding({ title: 'The setup says "Every tap adds one part" whatever Amount per tap is remembered', severity: 'low', steps: '1. Open Paint by numbers, Start painting, set Amount per tap to 4 parts (it is remembered). 2. Quit with ✕ twice, or finish, and read the setup\'s opening text.', expected: 'The lede matches the game: taps add the remembered amount (¼ to 4 parts), or it says so in general terms.', actual: `The lede reads "${s.lede}" while portrait-value-studio.gameAmount is 4, so the next game\'s taps add 4 parts each (index.html line 702; the amount is read back at js/game.js 1219).` });
    await setAmount(page, 2);
    await clean(t, page, 'game: play again, bests');
    await page.context().close();
  }

  // ================================================================================================
  // 3. The modes: Relaxed, then Classic's clock run out, Memory and Value first on a fake clock
  // ================================================================================================
  {
    const page = await openPage(site, { url: '#game' });
    await ready(page); await setPalette(page, 'zorn'); await ready(page);
    const srcKey = await page.evaluate(() => Studio.sourceKey());
    // Relaxed: a stopwatch, no bonus, out of 1,000
    await setMode(page, 'relaxed'); await ready(page);
    await click(page, '#gameStart'); await playing(page);
    let p = await play(page);
    t.check(p.timer === '0:00' && p.timerLabel === 'Time taken', 'Relaxed: the stopwatch starts at 0:00', [p.timer, p.timerLabel]);
    await page.waitForFunction(() => document.getElementById('gameTimer').textContent !== '0:00', null, { timeout: 5000 }).catch(() => null);
    await sleep(1100);
    p = await play(page);
    t.check(/^0:0[1-4]$/.test(p.timer) && !p.low, 'Relaxed: the stopwatch counts up', p.timer);
    await setAmount(page, 2); await tapPaint(page, 'TW', 2);
    await click(page, '#gameLock'); await scored(page);
    let r = await result(page);
    await click(page, '#gameAnalyze'); r = await result(page);
    t.check(r.rows.Mode === 'Relaxed' && /^0:0\d · \+0 \(no clock\)$/.test(r.rows['Time taken']) && !('Time left' in r.rows) && r.points === +(/· (\d+)$/.exec(r.rows['Color accuracy']) || [])[1] && r.points >= 0 && r.points <= 1000, 'Relaxed: time taken, no bonus, the points are the color points alone', [r.rows, r.points]);
    t.check(Object.keys(await bests(page))[0] === `${srcKey}|medium|zorn|relaxed`, 'Relaxed: the best is kept under its mode', Object.keys(await bests(page)));
    await click(page, '#gamePopup [data-game="new"]'); await ready(page);
    await clean(t, page, 'modes: relaxed');

    // from here the page's timers are faked (they still run in real time) so the clock can be moved
    await page.clock.install();
    t.note('Classic\'s clock (5 minutes at Medium) cannot be waited for: it is driven with Playwright\'s fake clock (page.clock.fastForward), installed after the page loaded, which the game\'s setInterval and performance.now follow; the look, the peeks and Memory\'s too-little-time case use the same clock.');
    // Classic: the clock runs out
    await setMode(page, 'classic'); await ready(page);
    await click(page, '#gameStart'); await playing(page);
    await page.clock.fastForward(4 * 60 * 1000 + 35 * 1000); await sleep(400);
    p = await play(page);
    t.check(/^0:2[3-5]$/.test(p.timer) && p.low, 'Classic at 25 seconds left: the clock shows it low', [p.timer, p.low]);
    await page.clock.fastForward(30 * 1000); await scored(page);
    r = await result(page);
    await click(page, '#gameAnalyze'); r = await result(page);
    t.check(r.kicker === 'Time’s up!' && r.pct === '0' && r.rows['Time left'] === '0:00 · +0 (some numbers unpainted)' && !r.focusMode, 'Classic: when the clock runs out the portrait locks in by itself, Time\'s up!', [r.kicker, r.rows]);
    await click(page, '#gamePopup [data-game="new"]'); await ready(page);
    await clean(t, page, 'modes: the clock runs out');

    // Memory: the look, Ready, four peeks, no painting during the look
    await setMode(page, 'memory'); await ready(page);
    await click(page, '#gameStart'); await playing(page);
    p = await play(page);
    t.check(p.looking && p.lock === 'Ready: hide it' && p.timer === '0:10' && p.timerLabel === 'Time left to memorize' && p.toggle === 'Memorize this' && !p.collapsed && p.progress === 'Memorize the colors. The reference hides soon.' && p.next === true, 'Memory: a 10-second look with the clock waiting, Ready: hide it, Next ▸ off', [p.lock, p.timer, p.toggle, p.progress, p.next]);
    await tapPaint(page, 'TW');
    t.check((await play(page)).parts.startsWith('Empty'), 'Memory: painting during the look is refused');
    await page.clock.fastForward(3000); await sleep(300);
    p = await play(page);
    t.check(p.timer === '0:07' && p.looking, 'Memory: the look counts down', p.timer);
    await click(page, '#gameLock'); await sleep(100);
    p = await play(page);
    t.check(!p.looking && p.lock === 'Lock in portrait' && p.timer === '5:00' && p.collapsed && p.toggle === 'Peek · 3 left (−10 s)' && p.toast === 'The reference is hidden. Paint from memory.' && p.next === false, 'Ready hides the reference, starts the clock at 5:00 and offers three peeks', [p.lock, p.timer, p.toggle, p.toast]);
    await tapPaint(page, 'TW');
    t.check((await play(page)).parts === 'TW 1', 'Memory: painting works once the look is over');
    await click(page, '#gameRefToggle'); await sleep(100);
    p = await play(page);
    t.check(!p.collapsed && p.toggle === 'Peeking…' && /^4:(49|50)$/.test(p.timer), 'a Peek shows the reference and costs 10 seconds', [p.collapsed, p.toggle, p.timer]);
    await click(page, '#gameRefToggle'); await sleep(100);
    t.check((await play(page)).toggle === 'Peeking…' && /^4:(49|50)$/.test((await play(page)).timer), 'tapping again during a peek costs nothing more');
    await page.clock.fastForward(3500); await sleep(300);
    p = await play(page);
    t.check(p.collapsed && p.toggle === 'Peek · 2 left (−10 s)', 'the peek ends after 3 seconds, two left', [p.collapsed, p.toggle]);
    for (let i = 0; i < 2; i++) { await click(page, '#gameRefToggle'); await page.clock.fastForward(3500); await sleep(300); }
    p = await play(page);
    t.check(p.collapsed && p.toggle === 'No peeks left' && /^4:(1[5-9]|20)$/.test(p.timer), 'three peeks used: No peeks left, 30 seconds gone', [p.toggle, p.timer]);
    await click(page, '#gameRefToggle'); await sleep(100);
    p = await play(page);
    t.check(p.collapsed && p.toast === 'No peeks left', 'a fourth peek is refused and said', [p.collapsed, p.toast]);
    await click(page, '#gameLock'); await scored(page);
    await click(page, '#gameAnalyze'); r = await result(page);
    t.check(r.rows.Mode === 'Memory' && (await bests(page))[`${srcKey}|medium|zorn|memory`] === r.points, 'Memory: scored and kept under its mode', [r.rows.Mode, Object.keys(await bests(page))]);
    await click(page, '#gamePopup [data-game="new"]'); await ready(page);
    // the look ends by itself; a peek with too little time left is refused
    await click(page, '#gameStart'); await playing(page);
    await page.clock.fastForward(10500); await sleep(400);
    p = await play(page);
    t.check(!p.looking && p.lock === 'Lock in portrait' && p.collapsed && p.timer === '5:00', 'Memory: the look ends by itself after 10 seconds', [p.looking, p.lock, p.timer]);
    await page.clock.fastForward(4 * 60 * 1000 + 52 * 1000); await sleep(300);
    await click(page, '#gameRefToggle'); await sleep(100);
    p = await play(page);
    t.check(p.collapsed && p.toast === 'Not enough time left to peek' && p.toggle === 'Peek · 3 left (−10 s)', 'a peek with under 10 seconds left is refused and said', [p.toast, p.toggle, p.timer]);
    await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);
    await clean(t, page, 'modes: memory');

    // Value first: the slider stage, Done with values, the score split
    await setMode(page, 'value'); await ready(page);
    await click(page, '#gameStart'); await playing(page);
    p = await play(page);
    const N = p.numbers;
    t.check(p.valuing && p.valuePane && p.lock === 'Done with values' && p.gray && p.progress === `0 of ${N} values set` && p.valueTitle === 'Number 1' && p.valueText === 'Not set: slide to set its value' && p.valueClear && p.timer === '5:00', 'Value first: the grey stage, Done with values, the reference in grey', [p.lock, p.progress, p.valueText]);
    t.check(!(await visible(page, '#gamePaints')) && !(await visible(page, '#gameMixHead, .game-mix-head')), 'Value first: no paints in the value stage');
    await page.evaluate(() => { const r = document.getElementById('gameValueRange'); r.value = 30; r.dispatchEvent(new Event('input')); });
    p = await play(page);
    t.check(p.valueText === 'Value 3.0' && p.valueChip !== '' && !p.valueClear && p.progress === `1 of ${N} values set` && same(p.filled, [0]) && p.labels[0] === 'Number 1, value set', 'the slider sets number 1\'s value, shown on its button', [p.valueText, p.progress, p.filled]);
    await click(page, '#gameValueClear');
    p = await play(page);
    t.check(p.valueText === 'Not set: slide to set its value' && p.progress === `0 of ${N} values set` && p.valueClear, 'Clear unsets the value', [p.valueText, p.progress]);
    for (let k = 0; k < N; k++) { await pickNumber(page, k); await page.evaluate((L) => { const r = document.getElementById('gameValueRange'); r.value = L; r.dispatchEvent(new Event('input')); }, 10 + Math.round(80 * k / Math.max(1, N - 1))); }
    await page.evaluate(() => document.querySelector('.game-next').click());
    p = await play(page);
    t.check(p.progress === `${N} of ${N} values set` && p.toast === 'Every number has a value. Press Done with values.' && p.nudge, 'every value set: Next ▸ nudges Done with values', [p.progress, p.toast]);
    const greyAt = await paperSpot(page); // none expected: every shape wears its grey
    t.check(greyAt === null, 'every shape wears its grey underpainting', greyAt);
    await click(page, '#gameLock'); await sleep(100);
    p = await play(page);
    t.check(!p.valuing && p.lock === 'Lock in portrait' && p.toast === 'Values set. Now mix the colors over them.' && p.progress === `0 of ${N} numbers painted` && p.filled.length === 0 && !p.gray, 'Done with values moves to the color stage, the greys stay under', [p.lock, p.toast, p.progress]);
    t.note('Done with values says "Values set. Now mix the colors over them." whatever was set (js/game.js 680-685 does not look at the values); pressed with none set it still says so. Read from the source, not driven here.');
    await pickNumber(page, 0); await tapPaint(page, 'TW', 2);
    await click(page, '#gameLock'); await scored(page);
    await click(page, '#gameAnalyze'); r = await result(page);
    const vp = +(/\+(\d+)$/.exec(r.rows['Value study'] || '') || [])[1], cp = +(/· (\d+)$/.exec(r.rows['Color accuracy'] || '') || [])[1];
    t.check(r.rows.Mode === 'Value first' && /^\d+% · \+\d+$/.test(r.rows['Value study']) && vp > 0 && vp <= 100 && cp >= 0 && cp <= 900 && r.points === vp + cp && /\+0 \(some numbers unpainted\)$/.test(r.rows['Time left']), 'Value first: the value study scores up to 100, the colors up to 900', [r.rows, r.points]);
    t.check((await bests(page))[`${srcKey}|medium|zorn|value`] === r.points, 'Value first: kept under its mode');
    await click(page, '#gamePopup [data-game="new"]'); await ready(page);
    await clean(t, page, 'modes: value first');

    // Mystery: white and three paints, kept under mystery
    await setMode(page, 'mystery'); await ready(page);
    await click(page, '#gameStart'); await playing(page);
    p = await play(page);
    t.check(p.paints.length === 4 && p.paints[0] === 'TW', 'Mystery: the dealt hand is what you paint with', p.paints);
    await click(page, '#gameLock'); await scored(page);
    await click(page, '#gameAnalyze'); r = await result(page);
    t.check(r.rows.Mode === 'Mystery palette' && r.rows.Palette === 'Mystery palette' && `${srcKey}|medium|mystery|mystery` in (await bests(page)), 'Mystery: scored and kept under mystery', [r.rows, Object.keys(await bests(page))]);
    await click(page, '#gamePopup [data-game="new"]'); await ready(page);
    await setMode(page, 'classic'); await ready(page);
    await clean(t, page, 'modes: mystery');
    await page.context().close();
  }

  // ================================================================================================
  // 4. The phone: full screen while playing, the paint scroll bar, the reference dragged, ✕ twice
  // ================================================================================================
  {
    const page = await openPage(site, { url: '#game', viewport: PHONE });
    await ready(page);
    t.check((await hscroll(page)) <= 0, 'phone setup: no horizontal scroll', await hscroll(page));
    await setPalette(page, 'reilly'); await ready(page);
    await click(page, '#gameStart'); await playing(page); await sleep(300);
    let ps = await page.evaluate(() => { const ul = document.getElementById('gamePaints'); return { focus: document.body.classList.contains('game-focus'), topbar: getComputedStyle(document.querySelector('.topbar')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display, hasScroll: document.getElementById('gamePlay').classList.contains('has-scroll'), over: ul.scrollWidth - ul.clientWidth, scrollLeft: ul.scrollLeft, quick: getComputedStyle(document.querySelector('.game-quick-undo')).display, bar: document.querySelector('.game-bar').getBoundingClientRect().top, canvas: document.getElementById('gameCanvas').getBoundingClientRect().toJSON(), vh: innerHeight }; });
    t.check(ps.focus && ps.topbar === 'none' && ps.tabs === 'none' && (await hscroll(page)) <= 0, 'phone: the header and tabs step aside while playing, no horizontal scroll', ps);
    t.check(ps.hasScroll && ps.over > 0 && ps.scrollLeft === 0 && (await visible(page, '#gamePaintScroll')), 'phone: ten paints overflow, the big scroll bar shows at the start', ps);
    t.check(ps.quick !== 'none' && ps.canvas.height > 300 && ps.canvas.bottom < ps.vh, 'phone: the quick undo shows and the painting fits the screen', [ps.quick, ps.canvas]);
    await screenshot(page, 'game-phone-play');
    const th = await page.evaluate(() => document.querySelector('.game-paint-scroll-thumb').getBoundingClientRect().toJSON());
    await page.mouse.move(th.x + th.width / 2, th.y + th.height / 2); await page.mouse.down(); await page.mouse.move(th.x + th.width / 2 + 200, th.y + th.height / 2, { steps: 6 }); await page.mouse.up();
    const dragged = await page.evaluate(() => document.getElementById('gamePaints').scrollLeft);
    t.check(dragged > 100, 'phone: dragging the handle scrolls the paints', dragged);
    const tr = await page.evaluate(() => document.getElementById('gamePaintScroll').getBoundingClientRect().toJSON());
    await page.mouse.click(tr.x + 8, tr.y + tr.height / 2);
    t.check((await page.evaluate(() => document.getElementById('gamePaints').scrollLeft)) === 0, 'phone: tapping the track\'s start jumps there', await page.evaluate(() => document.getElementById('gamePaints').scrollLeft));
    // a tap on the last paint after scrolling there
    await page.evaluate(() => { document.getElementById('gamePaints').scrollLeft = 9999; });
    await sleep(100);
    const lastPaint = await page.evaluate(() => { const b = [...document.querySelectorAll('.game-paint')].pop(); return { code: b.querySelector('.game-paint-code').textContent, box: b.getBoundingClientRect().toJSON() }; });
    await page.mouse.click(lastPaint.box.x + lastPaint.box.width / 2, lastPaint.box.y + lastPaint.box.height / 2);
    let p = await play(page);
    t.check(p.parts === `${lastPaint.code} 1`, 'phone: a tap on a paint scrolled into view adds a part', [p.parts, lastPaint.code]);
    await click(page, '#gameQuickUndo');
    t.check((await play(page)).parts.startsWith('Empty'), 'phone: the quick undo takes it back');
    await click(page, '#gameQuickUndo');
    t.check((await play(page)).parts.startsWith('Empty'), 'phone: the quick undo on an empty mix does nothing');
    // the reference in the board's corner: dragged, kept over the board, hidden
    const before = await page.evaluate(() => ({ fig: document.getElementById('gameRefFig').getBoundingClientRect().toJSON(), board: document.querySelector('.game-board').getBoundingClientRect().toJSON(), ref: document.getElementById('gameRef').getBoundingClientRect().toJSON() }));
    t.check(before.fig.right <= before.board.right + 1 && before.fig.top >= before.board.top - 1 && before.fig.width < before.board.width * 0.5, 'phone: the reference sits in the board\'s top corner', before);
    await page.mouse.move(before.ref.x + before.ref.width / 2, before.ref.y + before.ref.height / 2); await page.mouse.down(); await page.mouse.move(before.ref.x + before.ref.width / 2 - 150, before.ref.y + before.ref.height / 2 + 150, { steps: 8 }); await page.mouse.up();
    const after = await page.evaluate(() => ({ fig: document.getElementById('gameRefFig').getBoundingClientRect().toJSON(), tf: document.getElementById('gameRefFig').style.transform, moving: document.getElementById('gameRefFig').classList.contains('is-moving') }));
    t.check(after.tf !== '' && Math.abs(after.fig.x - (before.fig.x - 150)) < 3 && Math.abs(after.fig.y - (before.fig.y + 150)) < 3 && !after.moving, 'phone: the reference drags where the finger goes', [before.fig, after.fig, after.tf]);
    await page.mouse.move(after.fig.x + 20, after.fig.y + 100); await page.mouse.down(); await page.mouse.move(after.fig.x - 900, after.fig.y + 2000, { steps: 8 }); await page.mouse.up();
    const far = await page.evaluate(() => ({ fig: document.getElementById('gameRefFig').getBoundingClientRect().toJSON(), board: document.querySelector('.game-board').getBoundingClientRect().toJSON() }));
    t.check(far.fig.left >= far.board.left - 1 && far.fig.bottom <= far.board.bottom + 1, 'phone: dragged too far, the reference stays over the board', far);
    t.check((await hscroll(page)) <= 0, 'phone: still no horizontal scroll after the drag', await hscroll(page));
    await click(page, '#gameRefToggle');
    t.check((await play(page)).collapsed && !(await visible(page, '#gameRef')), 'phone: the reference hides');
    await click(page, '#gameRefToggle');
    t.check(!(await play(page)).collapsed && (await visible(page, '#gameRef')), 'phone: and shows again');
    await click(page, '#tab-game [data-ref-view="blocks"]');
    t.check((await page.evaluate(() => document.querySelector('#tab-game [data-ref-view="blocks"]').getAttribute('aria-pressed'))) === 'true', 'phone: Blocks works in the corner');
    await click(page, '#gameQuit');
    p = await play(page);
    t.check(p.toast === 'Tap ✕ again to quit this game' && p.focusMode, 'phone: ✕ once asks again and keeps playing', p.toast);
    await click(page, '#gameQuit'); await ready(page);
    const q = await page.evaluate(() => ({ focus: document.body.classList.contains('game-focus'), setup: !document.getElementById('gameSetup').hidden, play: !document.getElementById('gamePlay').hidden, topbar: getComputedStyle(document.querySelector('.topbar')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display }));
    t.check(!q.focus && q.setup && !q.play && q.topbar !== 'none' && q.tabs !== 'none', 'phone: ✕ twice quits to the setup and brings the header and tabs back', q);
    // ✕ once, then long after, once more: asks again
    await click(page, '#gameStart'); await playing(page);
    await click(page, '#gameQuit'); await sleep(3200); await click(page, '#gameQuit');
    t.check(!(await page.evaluate(() => document.getElementById('gamePlay').hidden)) && (await play(page)).toast === 'Tap ✕ again to quit this game', 'phone: a second ✕ more than 3 seconds later only asks again');
    // lock in on the phone: the result leaves full screen, fits the width
    await click(page, '#gameLock'); await scored(page);
    const pr = await result(page);
    t.check(!pr.focusMode && pr.popup && (await hscroll(page)) <= 0, 'phone: the score leaves full screen, no horizontal scroll', [pr.focusMode, await hscroll(page)]);
    await screenshot(page, 'game-phone-score');
    await clean(t, page, 'phone');
    await page.context().close();
  }

  // ================================================================================================
  // 5. Orderings: a tab switch, a new photo and a reload mid-game, double taps, Play again on a painting
  // ================================================================================================
  {
    const page = await openPage(site, { url: '#game' });
    await ready(page); await setPalette(page, 'zorn'); await ready(page);
    await click(page, '#gameStart'); await click(page, '#gameStart'); await playing(page);
    await setAmount(page, 2); await tapPaint(page, 'TW');
    await tab(page, 'study'); await sleep(1200); await tab(page, 'game');
    let p = await play(page);
    t.check(!(await page.evaluate(() => document.getElementById('gamePlay').hidden)) && p.parts === 'TW 1' && /^4:5\d$/.test(p.timer), 'a tab switch mid-game keeps the game and its clock', [p.parts, p.timer]);
    // a new photo loaded mid-game (from the Study tab): the game keeps its board; then "Same photo"
    await tab(page, 'study');
    await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'portrait-b.jpg' }));
    await tab(page, 'game');
    const dims = await page.evaluate(() => [document.getElementById('gameCanvas').width, document.getElementById('gameCanvas').height]);
    t.check(same(dims, [600, 750]) && (await play(page)).parts === 'TW 1', 'a new photo mid-game: the game in progress keeps the board it started with', dims);
    await click(page, '#gameLock'); await scored(page);
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200);
    const words = await page.evaluate(() => document.getElementById('againHint').textContent);
    await click(page, '#againSame'); await playing(page);
    const dims2 = await page.evaluate(() => [document.getElementById('gameCanvas').width, document.getElementById('gameCanvas').height]);
    const sameOk = t.check(same(dims2, [600, 750]), '"Same photo" after a new photo was loaded mid-game plays the photo just played', [words, dims2]);
    if (!sameOk) t.finding({ title: '"Same photo" plays a different photo when one was loaded mid-game', severity: 'low', steps: '1. Open Paint by numbers on the sample portrait and Start painting. 2. On Study the reference, load another photo. 3. Back on Paint by numbers, Lock in portrait, then Play again and choose "Same photo" ("Try the same photo again, or load a new one?").', expected: 'The game just played is played again, on the same photo, as the dialog says; or the dialog says the photo has changed.', actual: `The new game is on the photo loaded meanwhile (its board is ${dims2[0]} × ${dims2[1]}, the game just played was 600 × 750): startGame calls refreshSetup (js/game.js 544), which rebuilds the board for the current reference (530-532), and the dialog's words (1597-1600) do not change.` });
    await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);
    t.check((await setup(page)).photoName === 'Painting from portrait-b.', 'the setup names the new photo', (await setup(page)).photoName);
    // a reload mid-game: the setup, nothing broken (the new board took its own suggested palette: tap its first paint)
    await click(page, '#gameStart'); await playing(page); await tapPaint(page, (await play(page)).paints[0]);
    await page.reload({ waitUntil: 'load' }); await sleep(500); await ready(page);
    const s = await setup(page);
    t.check(s.shown && s.level === 'medium' && s.mode === 'classic' && !s.start, 'a reload mid-game comes back to the setup with the level and mode kept', [s.shown, s.level, s.mode]);
    t.note('A game in progress is not kept across a reload (the README promises nothing there); the setup comes back with the level, mode and amount remembered, and the palette is the one suggested for the board rather than the one last played (js/game.js 392-394: a new board always takes its suggestion, so the saved gamePalette only matters when nothing is loaded).');
    // double taps: Lock in twice, Analyze twice
    await click(page, '#gameStart'); await playing(page);
    await click(page, '#gameLock'); await click(page, '#gameLock'); await scored(page);
    await click(page, '#gameAnalyze'); await click(page, '#gameAnalyze');
    t.check(!(await result(page)).analysis && (await result(page)).popup, 'Lock in twice scores once; Analyze twice closes it again');
    // Play again on a painting: New portrait deals and starts straight away
    await click(page, '#gamePopup [data-game="new"]'); await ready(page);
    await click(page, '#gameFromPainting'); await ready(page);
    const id1 = (await setup(page)).painting;
    await click(page, '#gameStart'); await playing(page);
    await click(page, '#gameLock'); await scored(page);
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200);
    const dlg = await page.evaluate(() => ({ same: document.getElementById('againSame').textContent, next: document.getElementById('againNew').textContent, hint: document.getElementById('againHint').textContent }));
    t.check(dlg.same === 'Same portrait' && dlg.next === 'New portrait' && dlg.hint === 'Try the same portrait again, or take on a new one?', 'Play again on a painting asks about a portrait', dlg);
    await click(page, '#againNew'); await playing(page);
    const id2 = (await setup(page)).painting;
    t.check(id2 !== id1 && !(await page.evaluate(() => document.getElementById('gamePlay').hidden)) && (await play(page)).timer === '5:00', 'New portrait deals another and starts straight away', [id1, id2]);
    await click(page, '#gameLock'); await scored(page);
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200); await click(page, '#againSame'); await playing(page);
    t.check((await setup(page)).painting === id2, 'Same portrait keeps the portrait', (await setup(page)).painting);
    // the share card on a painting names it
    await click(page, '#gameLock'); await scored(page);
    const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await click(page, '#gameAnalysis [data-game="share"], #gamePopup [data-game="share"]');
    const d = await dl;
    t.check(d && /^portrait-value-studio-\d+pct\.png$/.test(d.suggestedFilename()) && same(pngSize(await d.path()), [1080, 1350]), 'Share card from a painting saves the PNG', d && d.suggestedFilename());
    await clean(t, page, 'orderings');
    await page.context().close();
  }

  // ================================================================================================
  // 6. Hostile saved state for every game key and myPaints; bests pruned to fifty
  // ================================================================================================
  {
    // wrong types everywhere: every default applies (a string seed is written as is, so a JSON string is quoted)
    const page = await openPage(site, { url: '#game', storage: { [K('gameLevel')]: { a: 1 }, [K('gamePalette')]: ['zorn'], [K('gameSubject')]: '"painting"', [K('gamePainting')]: 123, [K('gameRefView')]: {}, [K('gameMode')]: '"constructor"', [K('gameAmount')]: '"2"', [K('gameSound')]: '"false"', [K('gameBest')]: [1, 2, 3], [K('myPaints')]: { TW: 1 } } });
    await ready(page);
    let s = await setup(page);
    t.check(s.shown && s.level === 'medium' && s.mode === 'classic' && s.subject === 'photo' && s.amount === '1 part per tap' && s.sound === 'true' && s.refView === 'photo' && s.best === '' && !s.options.some((o) => o[0] === 'mine') && s.options.some((o) => / \(suggested\)$/.test(o[1])) && !s.start, 'wrong-typed values in every game key: every default applies, Start enabled', s);
    await click(page, '#gameStart'); await playing(page); await click(page, '#gameLock'); await scored(page);
    t.check(Object.keys(await bests(page)).length === 1 && typeof Object.values(await bests(page))[0] === 'number', 'a best replaces a gameBest of the wrong shape', await bests(page));
    await clean(t, page, 'hostile: wrong types');
    await page.context().close();
  }
  {
    // prototype names, NaN (null), nested objects, a huge list
    const page = await openPage(site, { url: '#game', storage: { [K('gameLevel')]: '"constructor"', [K('gamePalette')]: '"__proto__"', [K('gameSubject')]: { kind: { constructor: 'painting' } }, [K('gamePainting')]: '"__proto__"', [K('gameRefView')]: '"constructor"', [K('gameMode')]: '"__proto__"', [K('gameAmount')]: null, [K('gameSound')]: null, [K('gameBest')]: '{"__proto__":5,"constructor":"x","toString":{}}', [K('myPaints')]: Array.from({ length: 20000 }, (_, i) => ['constructor', '__proto__', 'TW', 'IB', 'nope', 7, null][i % 7]) } });
    await ready(page);
    let s = await setup(page);
    t.check(s.shown && s.mode === 'classic' && s.subject === 'photo' && s.amount === '1 part per tap' && s.sound === 'true' && s.refView === 'photo' && s.best === '' && !s.start, 'prototype names and nulls: the mode, subject, amount, sound and reference fall back', s);
    t.check(s.options.some((o) => o[0] === 'mine' && /^My paints \(2\)/.test(o[1])) && s.options.some((o) => / \(suggested\)$/.test(o[1])), 'a 20,000-entry myPaints with junk in it counts its two real paints once', s.options);
    const lvOk = t.check(s.level === 'medium', 'gameLevel "constructor": Medium is checked', [s.level, s.note]);
    if (!lvOk) t.finding({ title: 'A saved difficulty named like an Object property leaves no difficulty checked', severity: 'low', steps: '1. Save portrait-value-studio.gameLevel as "constructor" (or "__proto__", "toString"). 2. Open Paint by numbers.', expected: 'Medium is checked, as for any other value that is not a level (the mode does this: js/game.js 1629 checks an own property).', actual: `No difficulty radio is checked (${s.level}); the preview and the game run at Medium ("${s.note}"). js/game.js 1638: LEVELS[load(LEVEL_KEY, 'medium')] finds Object.prototype's "constructor" and keeps the name, then 1640 checks the radio whose value equals it, which none has.` });
    await click(page, '#gameStart'); await playing(page);
    t.check((await play(page)).numbers > 0 && (await play(page)).timer === '5:00', 'the game still plays at Medium');
    await click(page, '#gameLock'); await scored(page);
    const b = await bests(page);
    t.check(Object.keys(b).length === 4 && Object.values(b).some((v) => typeof v === 'number'), 'a best is added beside the odd keys without touching them', b);
    await clean(t, page, 'hostile: prototype names');
    await page.context().close();
  }
  {
    // a best of the wrong type under the key the setup reads; an amount not in the list
    const probe = await openPage(site, { url: '#game' });
    await ready(probe);
    const key = await probe.evaluate(() => `${Studio.sourceKey()}|medium|${document.getElementById('gamePalette').value}`);
    const sugId = await probe.evaluate(() => document.getElementById('gamePalette').value);
    await probe.context().close();
    const page = await openPage(site, { url: '#game', storage: { [K('gameBest')]: { [key]: 'abc', [key + '|relaxed']: { a: 1 }, [key + '|memory']: [1, 2], [key + '|value']: true, [key + '|mystery']: -5 }, [K('gameAmount')]: 7 } });
    await ready(page);
    let s = await setup(page);
    const bestOk = t.check(s.best === '', 'a best of the wrong type (a string) is not shown as a score', s.best);
    const relaxed = (await setMode(page, 'relaxed'), await ready(page), (await setup(page)).best);
    const memory = (await setMode(page, 'memory'), await ready(page), (await setup(page)).best);
    await setMode(page, 'classic'); await ready(page);
    if (!bestOk) t.finding({ title: 'A saved best score of the wrong type is shown word for word and can never be beaten', severity: 'medium', steps: `1. Save portrait-value-studio.gameBest as {"${key}": "abc"} (or an object, an array: a stray or older write). 2. Open Paint by numbers on the sample portrait at Medium with the suggested palette (${sugId}). 3. Play and Lock in portrait.`, expected: 'A value that is not a number is ignored: no "Your best" line, and the game\'s score becomes the best with "New best!".', actual: `The setup says "${s.best}" (Relaxed: "${relaxed}"; Memory: "${memory}"): js/game.js 523 prints whatever the key holds. On lock-in, 1295 reads isBest = !bests[key] || points > bests[key], false for "abc" or an object, so "New best!" never shows and the junk is never replaced.` });
    await click(page, '#gameStart'); await playing(page); await setAmount(page, 2); await tapPaint(page, (await play(page)).paints[0], 2); await click(page, '#gameLock'); await scored(page);
    const r = await result(page);
    const b = await bests(page);
    t.check(r.points >= 0 && (r.newBest ? b[key] === r.points : true), 'after the game: New best! only if the junk was replaced', [r.points, r.newBest, b[key]]);
    if (!bestOk) t.check(b[key] !== 'abc' || !r.newBest, 'the junk best is consistent with the New best! shown', [b[key], r.newBest]);
    const amountOk = t.check(s.amount === '1 part per tap', 'a saved amount not in the list (7) falls back to 1 part per tap', s.amount);
    if (!amountOk) t.finding({ title: 'A saved Amount per tap that is not one of the five settings falls to ¼ part instead of the default', severity: 'low', steps: '1. Save portrait-value-studio.gameAmount as 7 (or 3, 1e999, any number not in ¼ ½ 1 2 4). 2. Open Paint by numbers and Start painting; read the Amount per tap.', expected: 'The default, 1 part per tap, as for a value of the wrong type.', actual: `"${s.amount}": js/game.js 1219 takes Math.max(0, AMOUNTS.indexOf(value)), and -1 becomes the first setting, ¼ part.` });
    await clean(t, page, 'hostile: best of the wrong type, amount off the list');
    await page.context().close();
  }
  {
    // sixty bests kept: a new one prunes the oldest down to fifty; a saved painting choice deals anew
    const seeds = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`seed-${String(i).padStart(2, '0')}|medium|zorn`, 100 + i]));
    const page = await openPage(site, { url: '#game', storage: { [K('gameBest')]: seeds, [K('gameSubject')]: { kind: 'painting' }, [K('gamePainting')]: '"zorn-1"', [K('gameLevel')]: '"hard"', [K('gameMode')]: '"relaxed"', [K('gameRefView')]: '"blocks"', [K('gameSound')]: false, [K('gameAmount')]: 0.5 } });
    await ready(page);
    const s = await setup(page);
    t.check(s.subject === 'painting' && s.paintingPane && s.painting !== '"zorn-1"' && /^"[a-z]+-\d+"$/.test(s.painting) && PAINTERS.test(s.paintingName), 'a saved painting choice deals a new portrait, never the last one', [s.painting, s.paintingName]);
    t.check(s.level === 'hard' && s.mode === 'relaxed' && s.refView === 'blocks' && s.sound === 'false' && s.amount === '½ part per tap' && /8:00|no time limit/.test(s.note), 'the level, mode, reference view, sound and amount are remembered', [s.level, s.mode, s.refView, s.sound, s.amount, s.note]);
    await click(page, '#gameStart'); await playing(page);
    t.check((await page.evaluate(() => document.querySelector('#tab-game [data-ref-view="blocks"]').getAttribute('aria-pressed'))) === 'true', 'the remembered Blocks view is pressed in the game');
    await click(page, '#gameLock'); await scored(page);
    const b = await bests(page);
    const keys = Object.keys(b);
    t.check(keys.length === 50 && !keys.includes('seed-00|medium|zorn') && !keys.includes('seed-10|medium|zorn') && keys.includes('seed-11|medium|zorn') && keys.includes('seed-59|medium|zorn') && /^painting:[a-z]+-\d+\|hard\|[a-z-]+\|relaxed$/.test(keys[49]), 'sixty bests and a new one: pruned to fifty, the oldest eleven gone, the new one last', [keys.length, keys[0], keys[49]]);
    await clean(t, page, 'hostile: sixty bests, a saved painting');
    await page.context().close();
  }

  // ================================================================================================
  // 7. Pictures at the edges: 1 px, a 2 × 4000 strip, one flat tone, a transparent PNG
  // ================================================================================================
  {
    const page = await openPage(site);
    t.note('A 24-megapixel photo, a non-image file, a broken image and an SVG go through the Study\'s loader, which study-photos.mjs covers; the game builds its board from the Study\'s working-size copy, so only the pictures that change the board are loaded here.');
    for (const [name, file, want] of [
      ['a 1 × 1 picture', await makeImage(page, { width: 1, height: 1, draw: 'flat' }), { refused: true }],
      ['a 2 × 4000 strip', await makeImage(page, { width: 2, height: 4000, draw: 'noise' }), { refused: true }],
      ['one flat tone', await makeImage(page, { width: 300, height: 300, draw: 'flat', name: 'flat.png' }), { numbers: 1 }],
      ['a transparent PNG', await makeImage(page, { width: 400, height: 500, draw: 'transparent', name: 'clear.png' }), { numbers: 2 }],
    ]) {
      await tab(page, 'study');
      await loadPhoto(page, file);
      const toast = await text(page, '#toast');
      await tab(page, 'game'); await ready(page);
      const s = await setup(page);
      if (want.refused) {
        t.check(/too small to study/.test(toast) && s.photoName === 'Painting from the sample portrait. Load your own photo to paint from it.' && s.preview[0] === 600, `${name}: refused with a reason, the game keeps the sample`, [toast, s.photoName]);
      } else {
        const n = numbersOf(s.note);
        t.check(n >= 1 && n <= want.numbers && !s.start && s.photoName === `Painting from ${file.name.replace(/\.png$/, '')}.`, `${name}: a board with ${n} number${n === 1 ? '' : 's'}, Start enabled`, [s.note, s.photoName]);
        if (n === 1) {
          const oneOk = t.check(s.note === '1 number to mix, 5:00 on the clock.', 'one color: the note counts one number', s.note);
          if (!oneOk) t.finding({ title: 'A picture with one color is said to have "1 numbers to mix"', severity: 'low', steps: '1. Load a single flat tone as the photo (a 300 × 300 grey square). 2. Open Paint by numbers and read the preview\'s caption.', expected: '"1 number to mix, 5:00 on the clock."', actual: `"${s.note}" (js/game.js 488, notePreview, pluralises nothing).` });
        }
      }
      await click(page, '#gameStart'); await playing(page);
      const p = await play(page);
      await setAmount(page, 2); await tapPaint(page, p.paints[0]);
      await page.evaluate(() => document.querySelector('.game-next').click());
      await click(page, '#gameLock'); await scored(page);
      const r = await result(page);
      t.check(/^\d+$/.test(r.pct) && r.zones.length >= 1 && r.popup, `${name}: plays and scores`, [r.pct, r.grade]);
      await click(page, '#gamePopup [data-game="new"]'); await ready(page);
      await clean(t, page, name);
    }
    await page.context().close();
  }
}
