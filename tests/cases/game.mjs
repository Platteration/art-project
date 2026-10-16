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
import { openPage, newTab, clean, tab, DESKTOP, PHONE, click, text, visible, hscroll, sleep, makeImage, loadPhoto, dropFiles, pasteFile, textFile, storageGet, storageKeys, screenshot } from '../lib.mjs';

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
// the clock's readout once a tick has drawn it after the page clock was moved on (its 250 ms tick, not a fixed sleep,
// decides when): a readout that differs from the one before the move, or reads as a moved-on clock should
const timerMoved = (page, before) => page.waitForFunction((b) => document.getElementById('gameTimer').textContent !== b, before, { timeout: 5000 }).catch(() => null);
const timerReads = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('gameTimer').textContent), re.source, { timeout: 5000 }).catch(() => null);
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

// ---- helpers of the second half (the sections after the first seven) ---------------------------------------
const MINE = K('myPaints');
// a page opened in Advanced with the Colors and paints drawer open and the Study's palette source on My paints,
// so the My paints dialog's button is on view and ticking in it changes the ticked paints and nothing else
const ADV = { [K('mode')]: 'advanced', [K('drawers')]: '["colors"]', [K('paintChoice')]: '{"source":"mine","preset":"","max":4}' };
// ticks and unticks paints in the My paints dialog on the Study tab, the way a visitor does, then lets the Study settle
async function tickMine(page, add, remove = []) {
  await tab(page, 'study');
  await click(page, '#mineEdit');
  await page.waitForFunction(() => document.getElementById('paintDialog').open && document.querySelectorAll('#paintCats input').length > 0, null, { timeout: 5000 }).catch(() => null);
  await page.evaluate(([add, remove]) => {
    for (const c of add) { const b = document.querySelector(`#paintCats input[value="${c}"]`); if (b && !b.checked) b.click(); }
    for (const c of remove) { const b = document.querySelector(`#paintCats input[value="${c}"]`); if (b && b.checked) b.click(); }
  }, [add, remove]);
  await click(page, '#paintDialogDone');
  await page.waitForFunction(() => !document.getElementById('paintDialog').open, null, { timeout: 5000 }).catch(() => null);
  await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 20000 }).catch(() => null);
}
// Play again, then Same photo (or Same portrait): the board just played, a fresh game
const playAgain = async (page) => { await click(page, '#gamePopup [data-game="again"]'); await sleep(200); await click(page, '#againSame'); await playing(page); };
// Lock in and wait for the score
const lockIn = async (page) => { await click(page, '#gameLock'); await scored(page); };
// from the score back to the setup
const toSetup = async (page) => { await click(page, '#gamePopup [data-game="new"]'); await ready(page); };
// the recipe of every number, from an Analysis with nothing painted: [[number, "Mix: ..."], ...]
const recipesOfBoard = async (page) => { await lockIn(page); await click(page, '#gameAnalyze'); return (await result(page)).zones.map((z) => [z.n, z.mix]).sort((a, b) => a[0] - b[0]); };
// every number mixed to the recipe the Analysis gave it (a game is on)
async function mixAll(page, recipes) { for (const [n, mix] of recipes) { await pickNumber(page, n - 1); await mixExact(page, recipeOf(mix)); } }

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
    t.check(!r.newBest, 'nothing painted: no New best! for 0 points (the README: it flashes when you beat your score)', r.newBest);
    t.note('A first lock-in with nothing painted (0 points) is recorded at 0 and flashes no "New best!" (the rule settled for this game); the section on a first game at 0 below plays on from that record.');
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
    const looked = (await play(page)).timer;
    await page.clock.fastForward(3000); await timerMoved(page, looked);
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
    let before = '';
    for (let i = 0; i < 2; i++) { await click(page, '#gameRefToggle'); before = (await play(page)).timer; await page.clock.fastForward(3500); await sleep(300); }
    await timerMoved(page, before);
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
    await page.clock.fastForward(4 * 60 * 1000 + 52 * 1000); await timerReads(page, /^0:0\d$/);
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


// ================================================================================================
// 8. A first game at 0: recorded without a New best!, and the next game has something to beat
// ================================================================================================
async function firstGameAtZero(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  const key = `${await page.evaluate(() => Studio.sourceKey())}|medium|zorn`;
  await click(page, '#gameStart'); await playing(page);
  const recipes = await recipesOfBoard(page);
  let r = await result(page);
  t.check(r.pct === '0' && r.points === 0 && !r.newBest, 'a first game that scores 0: no New best!', [r.pct, r.points, r.newBest]);
  t.check(same(await bests(page), { [key]: 0 }), 'a first game that scores 0 is recorded at 0, so the next has something to beat', await bests(page));
  await toSetup(page);
  t.check((await setup(page)).best === '', 'the setup shows no best of 0 after a game that scored 0', (await setup(page)).best);
  await click(page, '#gameStart'); await playing(page);
  await pickNumber(page, 0); await mixExact(page, recipeOf(recipes[0][1]));
  await lockIn(page);
  r = await result(page);
  t.check(r.points > 0 && r.newBest && (await bests(page))[key] === r.points, 'the next game beats the recorded 0: New best! and the points kept', [r.points, r.newBest, await bests(page)]);
  await toSetup(page);
  t.check((await setup(page)).best === `Your best on this portrait at this level in Classic mode: ${r.points} points`, 'and the setup then shows that best', (await setup(page)).best);
  await clean(t, page, 'first game at 0');
  await page.context().close();
}


// ================================================================================================
// 9. My paints changed on the Study between two setups of the same board
// ================================================================================================
async function staleMyPaints(t, site) {
  const lower = (list) => list.map((d) => d.toLowerCase());
  const page = await openPage(site, { url: '#game', storage: { ...ADV, [MINE]: ['TW', 'IB'] } });
  await ready(page); await setPalette(page, 'mine'); await ready(page);
  const first = await setup(page);
  t.check(first.palette === 'mine' && same(lower(first.dots), ['titanium white', 'ivory black']) && / 2 paints, which mix /.test(first.hint), 'My paints (white and black) chosen on the sample: its two paints and a hint', [first.palette, first.dots, first.hint]);
  // the hand changes on the Study tab (the board is the same one: nothing about the photo changed)
  await tickMine(page, ['CRL', 'YO'], ['IB']);
  t.check(same(JSON.parse(await storageGet(page, MINE)), ['TW', 'CRL', 'YO']), 'the dialog saved the new hand', await storageGet(page, MINE));
  await tab(page, 'game'); await ready(page);
  const after = await setup(page);
  // a page opened on that hand from the start is the control
  const control = await openPage(site, { url: '#game', storage: { ...ADV, [MINE]: ['TW', 'CRL', 'YO'] } });
  await ready(control); await setPalette(control, 'mine'); await ready(control);
  const want = await setup(control);
  t.check(after.palette === 'mine' && same(lower(after.dots), ['titanium white', 'cadmium red light', 'yellow ochre']) && / 3 paints, which mix /.test(after.hint) && /My paints \(3\)$/.test((after.options.find((o) => o[0] === 'mine') || [])[1]), 'the new hand: the menu says 3 paints and the dots show them', [after.options, after.dots, after.hint]);
  const hintOk = t.check(after.hint === want.hint, 'the hint counts the colors the new hand mixes closely, as a page opened on that hand does', [after.hint, want.hint]);
  t.check(same(after.options, want.options), 'the same palette is marked suggested as on a page opened on that hand', [after.options.filter((o) => /suggested/.test(o[1])), want.options.filter((o) => /suggested/.test(o[1]))]);
  // the targets: what each number's recipe is, then whether following the recipes reaches 100%
  await click(page, '#gameStart'); await playing(page);
  await click(control, '#gameStart'); await playing(control);
  const got = await recipesOfBoard(page), exp = await recipesOfBoard(control);
  const recOk = t.check(same(got, exp), 'the recipes of the numbers are the ones a page opened on that hand gives', [got.slice(0, 4), exp.slice(0, 4)]);
  await playAgain(page); await mixAll(page, got); await lockIn(page);
  const stale = (await result(page)).pct;
  await playAgain(control); await mixAll(control, exp); await lockIn(control);
  const fresh = (await result(control)).pct;
  const exactOk = t.check(stale === '100' && fresh === '100', 'every number mixed to the recipe the Analysis gives reaches 100%, on the changed hand as on a fresh page', [stale, fresh]);
  if (!(hintOk && recOk && exactOk)) t.finding({
    title: 'Changing the ticked paints on the Study leaves the game’s numbers mixed from the old hand',
    severity: 'high',
    steps: '1. Tick White and Black (TW, IB) in My paints on the Study tab. 2. Open Paint by numbers on the sample portrait, choose "My paints (2)" in the palette menu (the hint reads "2 paints, which mix 1 of its 11 colors closely"). 3. Back on the Study tab, tick Cadmium Red Light and Yellow Ochre and untick Ivory Black. 4. Open Paint by numbers again, read the palette hint, Start painting, Lock in portrait, Analyze and read the recipes.',
    expected: 'The numbers are mixed again from the new hand, as on a page opened on that hand (hint "3 paints, which mix 2 of its 11 colors closely"; recipes such as "CRL 2 · YO 1"), and following every recipe shown reaches 100%.',
    actual: `The menu and the dots show the new hand, but the hint says "${after.hint.replace(/^.*?\. (\d+ paints)/, '$1').slice(0, 60)}" (a fresh page: "${want.hint.replace(/^.*?\. (\d+ paints)/, '$1').slice(0, 60)}"), the recipes read ${got.slice(0, 3).map((x) => '"' + x[1] + '"').join(', ')} (fresh: ${exp.slice(0, 3).map((x) => '"' + x[1] + '"').join(', ')}), and mixing them to the letter scores ${stale}%.`,
    cause: 'js/game.js 407-410 (targetsFor) keeps a board’s targets under the palette’s id, and My paints keeps the id "mine" whatever is ticked; paletteChoices (120-125) rebuilds the list but the cached targets (and the cached suggestion, b.suggested at 376-384) stay those of the old hand. The recipes name the new paints by the old counts (game.paints.map((p, i) => r.t.counts[i]), 1603), and the targets are greys no red-ochre-white hand can mix.',
  });
  await clean(t, page, 'my paints changed between two setups');
  await clean(t, control, 'my paints changed: the control');
  await page.context().close(); await control.context().close();
}

// ================================================================================================
// 10. My paints unticked below two (or ticked up to two) while a score is on screen
// ================================================================================================
async function myPaintsWhileScored(t, site) {
  const page = await openPage(site, { url: '#game', storage: ADV });
  await ready(page);
  // two paints ticked while a score is on screen
  await click(page, '#gameStart'); await playing(page); await lockIn(page);
  await tickMine(page, ['TW', 'IB']);
  await tab(page, 'game');
  await toSetup(page);
  const s2 = await setup(page);
  const offered2 = t.check(s2.options.some((o) => o[0] === 'mine' && /^My paints \(2\)/.test(o[1])), 'My paints is offered after two paints were ticked while a score was on screen (Change settings)', s2.options);
  if (!offered2) t.finding({
    title: 'Paints ticked on the Study while a score is on screen are not offered by Change settings',
    severity: 'low',
    steps: '1. With fewer than two paints ticked, play Paint by numbers and Lock in portrait. 2. On the Study tab tick White and Black in My paints. 3. Back on Paint by numbers press Change settings and open the palette menu.',
    expected: '"My paints (2)" is in the menu.',
    actual: `The menu lists ${s2.options.length} palettes and no My paints; it appears only after leaving the tab with no score on screen.`,
    cause: 'js/game.js 1659-1663 and 1617-1623: renderPalettes runs on a tab switch only when no game is set, and toSetup does not call it.',
  });
  // (leaving the tab with no score on screen rebuilds the menu, so the next step starts from one that offers it)
  await tab(page, 'study'); await tab(page, 'game'); await ready(page);
  await setPalette(page, 'mine'); await ready(page);
  // ...and unticked below two while a score is on screen
  await click(page, '#gameStart'); await playing(page); await lockIn(page);
  await tickMine(page, [], ['TW', 'IB']);
  await tab(page, 'game');
  t.check(!(await page.evaluate(() => document.getElementById('gameResult').hidden)), 'a tab switch with the score on screen keeps the score', await page.evaluate(() => document.getElementById('gameResult').hidden));
  await toSetup(page);
  const s = await setup(page);
  const named = (s.options.find((o) => o[0] === s.palette) || [])[1];
  const offered = s.options.some((o) => o[0] === 'mine');
  const menuOk = t.check(!offered && s.options.length === PRESETS.length, 'My paints is no longer offered once fewer than two paints are ticked (the score was on screen while they were unticked)', [s.options, s.palette]);
  const dotsWant = await page.evaluate((id) => { const p = Paints.PRESETS.find((x) => x.id === id); return p ? p.paints.map((c) => Paints.byCode(c).name) : null; }, s.palette);
  const dotsOk = t.check(dotsWant && same(s.dots, dotsWant), 'the dots show the paints of the palette the menu names', [s.palette, named, s.dots]);
  await click(page, '#gameStart'); await playing(page);
  const played = (await play(page)).paints;
  const codesWant = await page.evaluate((id) => { const p = Paints.PRESETS.find((x) => x.id === id); return p ? p.paints : null; }, s.palette);
  const playOk = t.check(codesWant && same(played, codesWant), 'Start plays the paints of the palette the menu names', [s.palette, named, played]);
  await lockIn(page);
  const keys = Object.keys(await bests(page));
  const keyOk = t.check(keys[keys.length - 1].split('|')[2] === s.palette, 'and the best is kept under that palette', [s.palette, keys]);
  if (!(menuOk && dotsOk && playOk && keyOk)) t.finding({
    title: 'Unticking My paints while a score is on screen leaves "My paints" in the menu and plays Zorn under its name',
    severity: 'medium',
    steps: '1. Tick White and Black in My paints on the Study tab. 2. In Paint by numbers choose "My paints (2)", Start painting and Lock in portrait. 3. On the Study tab, untick both paints. 4. Back on Paint by numbers (the score is still shown), press Change settings and read the palette menu, then Start painting.',
    expected: 'My paints is gone from the menu (fewer than two are ticked) and the suggested palette is chosen; the game plays what the menu names and keeps its best under that palette.',
    actual: `The menu still offers ${offered ? '"My paints"' : 'no My paints'} and has ${JSON.stringify(named)} chosen (value "${s.palette}"); the dots show ${JSON.stringify(s.dots.slice(0, 4))}; Start plays ${JSON.stringify(played)}; the best is kept under "${keys[keys.length - 1]}".`,
    cause: 'js/game.js 1659-1663 (the studio:tab handler) rebuilds the palette menu only while no game is set, and after a lock-in game stays set until Change settings; toSetup (1617-1623) calls refreshSetup and showPalette but not renderPalettes, so paletteChoices() has no "mine" any more while the menu does, and chosenPalette() (472-475) falls back to the first palette, Zorn, while bestKey (335) still reads the select’s "mine".',
  });
  await clean(t, page, 'my paints ticked and unticked while a score is on screen');
  await page.context().close();
}

// ================================================================================================
// 11. Only the fifty most recently played boards are kept: playing a board counts, beating its best or not
// ================================================================================================
async function prunedByPlay(t, site) {
  const probe = await openPage(site, { url: '#game' });
  const sampleKey = await probe.evaluate(() => Studio.sourceKey());
  await probe.context().close();
  const mine = `${sampleKey}|medium|zorn`;
  const seeds = { [mine]: 1200 };
  for (let i = 0; i < 49; i++) seeds[`old-${String(i).padStart(2, '0')}:1x1|medium|zorn`] = 100 + i;
  const page = await openPage(site, { url: '#game', storage: { [K('gameBest')]: seeds } });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  t.check(Object.keys(await bests(page)).length === 50 && (await setup(page)).best.endsWith('1200 points'), 'fifty bests are kept, the sample’s the oldest and unbeatable', (await setup(page)).best);
  await click(page, '#gameStart'); await playing(page); await lockIn(page);
  let b = await bests(page), keys = Object.keys(b);
  t.check(!(await result(page)).newBest && b[mine] === 1200 && keys.length === 50 && keys[49] === mine, 'a replay that does not beat its best leaves the best and counts as played (it is now the newest)', [keys.length, keys[49], b[mine]]);
  await toSetup(page);
  await click(page, '#gameFromPainting'); await ready(page);
  await click(page, '#gameStart'); await playing(page); await lockIn(page);
  b = await bests(page); keys = Object.keys(b);
  const kept = t.check(keys.length === 50 && keys.includes(mine) && !keys.includes('old-00:1x1|medium|zorn') && keys.includes('old-01:1x1|medium|zorn') && /^painting:/.test(keys[49]), 'a fifty-first board prunes the least recently played, not the one just replayed', [keys.length, keys.slice(0, 2), keys[49], keys.includes(mine)]);
  if (!kept) t.finding({
    title: 'A board replayed without beating its best is the first to go when the fifty-first is scored',
    severity: 'medium',
    steps: '1. Keep fifty bests, the sample portrait’s the oldest and unbeatable. 2. Play the sample portrait again at the same level and palette and Lock in (no New best!). 3. Play A painting and Lock in so a fifty-first board is scored.',
    expected: '"Only the fifty most recently played are kept": the sample, played just before, stays and the board played longest ago goes.',
    actual: `The sample’s best is ${keys.includes(mine) ? 'kept' : 'dropped'} and ${keys.includes('old-00:1x1|medium|zorn') ? 'the oldest unplayed board stays' : 'the oldest unplayed board went'}.`,
    cause: 'js/game.js 1311-1315 (lockIn): a board is re-added last only when it is scored.',
  });
  await clean(t, page, 'pruned by play');
  await page.context().close();
}

// ================================================================================================
// 12. Stars and grade words at every band, the share card (sheet, fallback, pixels), the Analysis's pictures
// ================================================================================================
// the number of unpainted pixels the chosen number's wash covers: the area of that number's shapes, outlines apart
const washCount = (page) => page.evaluate(() => { const c = document.getElementById('gameCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 226 && d[i + 1] === 234 && d[i + 2] === 216) n++; return n; });
// the colors a canvas holds, as hex -> pixel count
const colorsOf = (page, selector) => page.evaluate((s) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const m = {}; for (let i = 0; i < d.length; i += 4) { const h = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); m[h] = (m[h] || 0) + 1; } return m; }, selector);
const STAR_MINS = [88, 78, 65, 50, 30];
const GRADE_WORDS = ['Keep mixing', 'Keep mixing', 'Getting there', 'Good eye', 'Sharp eye!', 'Master colorist!'];
// the share card's picture, read back in the page: a few pixels and how much ink lies in a few regions
const readCard = (page, file) => page.evaluate(async (b64) => {
  const img = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const px = (x, y) => [...g.getImageData(x, y, 1, 1).data];
  const count = (x0, y0, x1, y1, pred) => { const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (pred(d[i], d[i + 1], d[i + 2])) n++; return n; };
  const dark = (r, gg, b) => r < 110 && gg < 110 && b < 110;
  const matte = px(80, 160);
  const off = (r, gg, b) => Math.abs(r - matte[0]) > 25 || Math.abs(gg - matte[1]) > 25 || Math.abs(b - matte[2]) > 25;
  return {
    size: [img.width, img.height], header: px(10, 10), matte, paper: px(10, 1340), stars: [0, 1, 2, 3, 4].map((i) => px(601 + i * 90, 1026)),
    ink: {
      title: count(60, 40, 520, 85, (r) => r > 200), mode: count(600, 40, 1020, 85, (r) => r > 200),
      pct: count(60, 950, 520, 1110, (r, gg, b) => r < 80 && gg < 110 && b < 90), grade: count(560, 1060, 1040, 1110, (r, gg, b) => r > 140 && gg < 110 && b < 90),
      points: count(560, 1120, 1040, 1155, dark), subject: count(60, 1215, 1020, 1260, dark), palette: count(60, 1275, 700, 1305, (r) => r < 130), date: count(700, 1275, 1020, 1305, (r) => r < 130),
      portrait: count(300, 330, 780, 730, off),
    },
  };
}, fs.readFileSync(file).toString('base64'));

async function scoreBands(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  await click(page, '#gameStart'); await playing(page);
  const recipes = await recipesOfBoard(page);
  const N = recipes.length;
  const targets = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#gameZones .game-zone')].map((li) => [+li.querySelector('.game-zone-number').textContent, li.querySelectorAll('.mix-chip')[1].title.replace('The color to match ', '').toLowerCase()])));
  // the area of every number, from the wash its shapes wear when it is the chosen one
  await playAgain(page);
  const areas = [];
  for (let k = 0; k < N; k++) { await pickNumber(page, k); areas.push(await washCount(page)); }
  const total = areas.reduce((a, b) => a + b, 0);
  t.check(N >= 5 && N <= 16 && areas.every((a) => a > 0), 'the sample at Zorn has between 5 and 16 numbers, each with shapes of its own', [N, areas]);
  // Gap: the Blocks reference is the colors each number is scored against
  await click(page, '#tab-game [data-ref-view="blocks"]');
  const blocks = await colorsOf(page, '#gameRef');
  const wantHex = [...new Set(Object.values(targets))].sort();
  t.check(same(Object.keys(blocks).sort(), wantHex), 'the Blocks reference holds exactly the colors the Analysis lists to match', [Object.keys(blocks).sort(), wantHex]);
  await click(page, '#tab-game [data-ref-view="photo"]');
  // a subset of the numbers whose areas add up to about a goal: mixed exactly, the rest left bare
  const subsetFor = (goal) => {
    let best = null;
    for (let m = 1; m < (1 << N); m++) { let sum = 0; for (let k = 0; k < N; k++) if ((m >> k) & 1) sum += areas[k] / total * 100; const d = Math.abs(sum - goal); if (!best || d < best.d) best = { m, sum, d }; }
    return best;
  };
  const played = {};
  for (const [want, goal] of [[1, 40], [2, 57], [3, 71], [4, 83]]) {
    const pick = subsetFor(goal);
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200); await click(page, '#againSame'); await playing(page);
    await mixAll(page, recipes.filter((_, k) => (pick.m >> k) & 1));
    await lockIn(page);
    const r = await result(page);
    const pct = +r.pct;
    const stars = STAR_MINS.filter((m) => pct >= m).length;
    const edge = STAR_MINS.some((m) => Math.abs(pct - m) <= 0.5);
    t.check(r.stars === want, `${want} star${want > 1 ? 's' : ''}: a game of about ${goal}% lands in that band`, [goal, pct, r.stars]);
    t.check(edge || r.stars === stars, `${pct}% earns ${stars} star${stars === 1 ? '' : 's'} by the README’s thresholds (30, 50, 65, 78, 88)`, [pct, r.stars, stars]);
    t.check(r.grade === GRADE_WORDS[r.stars] && r.starsLabel === `${r.stars} out of 5 stars, ${pct}% color match`, `${r.stars} stars: the grade word and the label agree`, [r.grade, r.starsLabel]);
    played[want] = pct;
  }
  t.note(`score bands played on the sample at Zorn: about 40, 57, 71 and 83 percent landed on ${[1, 2, 3, 4].map((w) => played[w] + '%').join(', ')} (the areas are measured from the wash, outlines apart, so they can differ from the game’s by a point or two)`);

  // ---- the 83% game is on screen (4 stars, 4 gold on the card), Analysis open
  await click(page, '#gameAnalyze');
  const yours = await page.evaluate(() => [document.getElementById('gameYours').toDataURL() === document.getElementById('gameFinal').toDataURL(), document.getElementById('gameTarget').toDataURL() === document.getElementById('gameFinalTarget').toDataURL(), [document.getElementById('gamePhoto').width, document.getElementById('gamePhoto').height], [document.getElementById('gameFinal').width, document.getElementById('gameFinal').height]]);
  t.check(yours[0] && yours[1] && same(yours[2], yours[3]), 'the Analysis’s portrait is the final board, its colors to match are the target board, and the reference is as big as the board', yours);
  const targetColors = await colorsOf(page, '#gameTarget');
  const edgeHex = '#1b1e1a';
  t.check(same(Object.keys(targetColors).filter((h) => h !== edgeHex).sort(), wantHex), 'the colors-to-match picture holds each number’s target color and the outline', Object.keys(targetColors).sort());

  // ---- Share card: the share sheet where there is one, the saved PNG where there is not
  await page.evaluate(() => {
    window.__shared = []; window.__shareFail = '';
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared.push(d.files.map((f) => [f.name, f.type, f.size])); if (window.__shareFail) throw Object.assign(new Error('refused'), { name: window.__shareFail }); } });
  });
  const share = async (selector, fail) => {
    await page.evaluate((f) => { window.__shareFail = f; }, fail);
    const before = await page.evaluate(() => window.__shared.length);
    const dl = page.waitForEvent('download', { timeout: 1500 }).catch(() => null);
    await click(page, selector);
    await page.waitForFunction((n) => window.__shared.length > n, before, { timeout: 5000 }).catch(() => null);
    return dl;
  };
  const r4 = await result(page);
  let d = await share('#gamePopup [data-game="share"]', '');
  let shared = await page.evaluate(() => window.__shared);
  t.check(!d && shared.length === 1 && shared[0].length === 1 && shared[0][0][0] === `portrait-value-studio-${r4.pct}pct.png` && shared[0][0][1] === 'image/png' && shared[0][0][2] > 20000, 'Share card on a phone that can share: one PNG named by the score goes to the share sheet and nothing is downloaded', [!!d, shared]);
  d = await share('#gamePopup [data-game="share"]', 'AbortError');
  t.check(!d && (await page.evaluate(() => window.__shared.length)) === 2, 'Share card: the visitor closing the share sheet (AbortError) saves nothing', !!d);
  d = await share('#gameAnalysis [data-game="share"]', '');
  t.check(!d && (await page.evaluate(() => window.__shared.length)) === 3, 'the Share card button inside the Analysis shares too', !!d);
  d = await share('#gamePopup [data-game="share"]', 'NotAllowedError');
  const fallback = d ? await d : null;
  t.check(fallback && fallback.suggestedFilename() === `portrait-value-studio-${r4.pct}pct.png`, 'Share card: a share sheet that refuses (NotAllowedError) falls back to saving the PNG', fallback && fallback.suggestedFilename());
  // what the card shows
  if (fallback) {
    const card = await readCard(page, await fallback.path());
    const gold = (p) => p[0] > 200 && p[1] > 150 && p[1] < 185 && p[2] < 90;
    const grey = (p) => p[0] > 190 && p[1] > 190 && p[2] > 180 && !gold(p);
    t.check(same(card.size, [1080, 1350]) && same(card.header, [44, 74, 54, 255]) && same(card.matte, [139, 140, 142, 255]) && same(card.paper, [239, 231, 214, 255]), 'the card: header band, gray matte and paper in their colors', [card.header, card.matte, card.paper]);
    t.check(card.stars.filter(gold).length === 4 && card.stars.slice(0, 4).every(gold) && grey(card.stars[4]), 'the card: four gold stars and one gray for a four-star game', card.stars);
    t.check(card.ink.title > 100 && card.ink.mode > 100 && card.ink.pct > 800 && card.ink.grade > 100 && card.ink.points > 40 && card.ink.subject > 100 && card.ink.palette > 100 && card.ink.date > 50 && card.ink.portrait > 5000, 'the card carries its title, mode, percentage, grade, points, portrait label, palette and level, date, and the finished portrait', card.ink);
  }
  await page.evaluate(() => { Reflect.deleteProperty(navigator, 'share'); Reflect.deleteProperty(navigator, 'canShare'); });
  // a no-star game: nothing gold on the card
  await playAgain(page); await lockIn(page);
  const dl0 = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await click(page, '#gamePopup [data-game="share"]');
  const d0 = await dl0;
  if (d0) {
    const card0 = await readCard(page, await d0.path());
    t.check(card0.stars.every((p) => !(p[0] > 200 && p[1] > 150 && p[1] < 185 && p[2] < 90)) && d0.suggestedFilename() === 'portrait-value-studio-0pct.png', 'the card of a 0% game: no gold star, named 0pct', [card0.stars, d0.suggestedFilename()]);
  } else t.check(false, 'the card of a 0% game downloads', null);
  await clean(t, page, 'score bands and the share card');
  await page.context().close();
}

// ================================================================================================
// 13. Value first scores against the reference's own values: 100 for the values, 900 for the colors
// ================================================================================================
// the grey the slider shows for a lightness L* (0 black to 100 white), as the sRGB value of a neutral grey
const greyOf = (L) => { const Y = L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3; return Math.round(255 * (Y <= 0.0031308 ? 12.92 * Y : 1.055 * Math.pow(Y, 1 / 2.4) - 0.055)); };
const setValue = (page, L) => page.evaluate((L) => { const r = document.getElementById('gameValueRange'); r.value = L; r.dispatchEvent(new Event('input')); }, L);
async function valueScoring(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  await setMode(page, 'value'); await ready(page);
  await click(page, '#gameStart'); await playing(page);
  const N = (await play(page)).numbers;
  // the slider's own grey: 50 on the scale of 100 is the neutral grey of that lightness
  await setValue(page, 50);
  const chip = (await play(page)).valueChip;
  t.check(chip === `rgb(${greyOf(50)}, ${greyOf(50)}, ${greyOf(50)})`, 'the value chip shows the neutral grey of lightness 50', [chip, greyOf(50)]);
  await click(page, '#gameValueClear');
  // each number's own lightness: its color in the Blocks reference, from the pixel under its wash
  await click(page, '#tab-game [data-ref-view="blocks"]');
  const lights = [];
  for (let k = 0; k < N; k++) {
    await pickNumber(page, k);
    const L = await page.evaluate(() => {
      const c = document.getElementById('gameCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 226 && d[i + 1] === 234 && d[i + 2] === 216) {
        const q = document.getElementById('gameRef').getContext('2d').getImageData((i / 4) % c.width, Math.floor(i / 4 / c.width), 1, 1).data;
        return Study.rgbToLab(q[0], q[1], q[2])[0];
      }
      return null;
    });
    lights.push(L);
    if (L != null) await setValue(page, Math.round(L * 2) / 2);
  }
  t.check(lights.every((L) => L != null) && lights.every((L, k) => k === 0 || L >= lights[k - 1] - 3), 'every number has a lightness in the reference, numbered from the darkest', lights.map((L) => L && Math.round(L)));
  await click(page, '#gameLock');
  await lockIn(page);
  await click(page, '#gameAnalyze');
  let r = await result(page);
  const pts = (row) => ({ pct: +(/^(\d+)%/.exec(row || '') || [])[1], pts: +(/\+(\d+)$/.exec(row || '') || [])[1] });
  const recipes = r.zones.map((z) => [z.n, z.mix]).sort((a, b) => a[0] - b[0]);
  let v = pts(r.rows['Value study']);
  t.check(v.pct >= 99 && v.pts >= 99 && r.rows['Color accuracy'] === '0% · 0' && r.points === v.pts, 'every value set to the reference’s own (to a half step): the value study scores 99 or 100 of 100 and nothing else is scored', [r.rows, r.points]);
  // every value 20 off scores half, every value 40 off scores nothing (2.5 points of 100 a step of lightness)
  for (const [off, want] of [[20, 50], [41, 0]]) {
    await playAgain(page);
    for (let k = 0; k < N; k++) { await pickNumber(page, k); const L = lights[k]; await setValue(page, Math.round((L >= 50 ? L - off : L + off) * 2) / 2); }
    await click(page, '#gameLock');
    await lockIn(page); await click(page, '#gameAnalyze');
    r = await result(page);
    v = pts(r.rows['Value study']);
    t.check(Math.abs(v.pct - want) <= 1 && v.pts === v.pct, `every value ${off} lightness steps from the reference’s own: the value study scores ${want}%`, [r.rows['Value study']]);
  }
  // the colors count 900 with Value first, and the match shown is the colors alone: every number mixed exactly is 100%
  // and 900 points whatever the values were
  await playAgain(page);
  for (let k = 0; k < N; k++) { await pickNumber(page, k); const L = lights[k]; await setValue(page, Math.round((L >= 50 ? L - 41 : L + 41) * 2) / 2); }
  await click(page, '#gameLock');
  await mixAll(page, recipes);
  await lockIn(page); await click(page, '#gameAnalyze');
  r = await result(page);
  v = pts(r.rows['Value study']);
  const bonus = +(/\+(\d+)$/.exec(r.rows['Time left']) || [])[1];
  t.check(r.pct === '100' && r.stars === 5 && v.pct === 0 && r.rows['Color accuracy'] === '100% · 900' && bonus > 0 && r.points === 900 + bonus, 'Value first with every color exact and every value 41 steps off: 100% match and five stars, 900 for the colors, 0 for the values, the time bonus on top', [r.pct, r.rows, r.points]);
  await clean(t, page, 'value first scoring');
  await page.context().close();
}

// ================================================================================================
// 14. Time's up in the stages the first run-out did not meet: the value stage, Copy mix, a peek
// ================================================================================================
async function timesUp(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  await page.clock.install();
  // Value first: the clock runs from Start, so it can run out before any color
  await setMode(page, 'value'); await ready(page);
  await click(page, '#gameStart'); await playing(page);
  const N = (await play(page)).numbers;
  const set = [30, 50, 70];
  for (let k = 0; k < set.length; k++) { await pickNumber(page, k); await setValue(page, set[k]); }
  await page.clock.fastForward(5 * 60 * 1000 + 2000); await scored(page);
  await click(page, '#gameAnalyze');
  let r = await result(page);
  const vp = +(/\+(\d+)$/.exec(r.rows['Value study'] || '') || [])[1];
  t.check(r.kicker === 'Time’s up!' && r.pct === '0' && r.stars === 0 && r.rows['Color accuracy'] === '0% · 0' && vp > 0 && r.points === vp && r.rows['Time left'] === '0:00 · +0 (some numbers unpainted)' && !r.focusMode, 'Time’s up in the value stage: locked in with the value study alone, 0% color, no time bonus', [r.kicker, r.pct, r.rows, r.points]);
  const finalColors = await colorsOf(page, '#gameFinal');
  t.check(set.every((L) => { const v = greyOf(L); return (finalColors[`#${[v, v, v].map((x) => x.toString(16).padStart(2, '0')).join('')}`] || 0) > 100; }), 'and the final picture wears the three greys that were set', Object.keys(finalColors).length);
  await playAgain(page);
  let p = await play(page);
  t.check(p.valuing && p.valuePane && p.progress === `0 of ${N} values set` && p.timer === '5:00' && p.lock === 'Done with values', 'Same photo after that run-out: a clean value stage, the clock at 5:00', [p.valuing, p.progress, p.timer]);
  await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);

  // Classic with Copy mix on when the clock runs out: the score comes without the copy bar, and the next game does not start copying
  await setMode(page, 'classic'); await ready(page);
  await click(page, '#gameStart'); await playing(page);
  await pickNumber(page, 0); await setAmount(page, 2); await tapPaint(page, 'TW');
  await click(page, '#gameCopy');
  t.check((await play(page)).copying, 'Copy mix is on before the clock runs out');
  await page.clock.fastForward(5 * 60 * 1000 + 2000); await scored(page);
  const afterCopy = await page.evaluate(() => ({ bar: !document.getElementById('gameCopyBar').hidden, copying: document.getElementById('gamePlay').classList.contains('is-copying'), kicker: document.getElementById('gameKicker').textContent }));
  t.check(afterCopy.kicker === 'Time’s up!' && !afterCopy.bar && !afterCopy.copying, 'the clock running out ends the copy: no copy bar on the score', afterCopy);
  await playAgain(page);
  p = await play(page);
  t.check(!p.copying && !p.copyBar && p.copyText === 'Copy mix' && p.timer === '5:00', 'and the next game does not start copying', [p.copying, p.copyBar, p.copyText]);
  await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);

  // Memory: a peek taken with little time left, the clock running out inside it
  await setMode(page, 'memory'); await ready(page);
  await click(page, '#gameStart'); await playing(page);
  await page.clock.fastForward(10500); await sleep(300);
  const secs = async () => { const [m, sec] = (await play(page)).timer.split(':').map(Number); return m * 60 + sec; };
  await page.clock.fastForward(Math.max(0, ((await secs()) - 11.8) * 1000)); await sleep(100);
  await click(page, '#gameRefToggle'); await sleep(100);
  p = await play(page);
  if (p.toggle !== 'Peeking…') t.note('Memory: the peek taken with about 12 seconds left was refused on this run (' + p.toast + '; the real clock moved on between the steps), so the clock-out-inside-a-peek order was not played.');
  else {
    await page.clock.fastForward((await secs()) * 1000 + 300); await scored(page);
    const atEnd = await page.evaluate(() => ({ toggle: document.getElementById('gameRefToggle').textContent, collapsed: document.getElementById('gameRefFig').classList.contains('is-collapsed'), kicker: document.getElementById('gameKicker').textContent }));
    await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => null);
    await sleep(1500); // the peek's own 3 seconds end here, after the score
    const later = await page.evaluate(() => ({ toggle: document.getElementById('gameRefToggle').textContent, collapsed: document.getElementById('gameRefFig').classList.contains('is-collapsed') }));
    t.check(atEnd.kicker === 'Time’s up!' && same([atEnd.toggle, atEnd.collapsed], [later.toggle, later.collapsed]), 'Memory: the clock running out inside a peek scores, and the peek’s end afterwards changes nothing', [atEnd, later]);
  }
  await clean(t, page, 'time’s up in the value stage, a copy and a peek');
  await page.context().close();
}

// ================================================================================================
// 15. Storage that cannot be written (a full quota, a private window) or read at all
// ================================================================================================
async function noStorage(t, site) {
  for (const [name, init] of [
    ['a full quota (every setItem throws)', () => { Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; }],
    ['storage that refuses access (localStorage throws)', () => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); }],
  ]) {
    const page = await openPage(site, { url: '#game' });
    await page.addInitScript(init);
    await page.reload({ waitUntil: 'load' }); await sleep(500);
    await ready(page);
    const broken = await page.evaluate(() => { try { localStorage.setItem('x', 'y'); return 'works'; } catch (e) { return e.name; } });
    t.check(broken !== 'works', `${name}: the page really cannot store anything`, broken);
    const s = await page.evaluate(() => ({ shown: !document.getElementById('gameSetup').hidden, start: document.getElementById('gameStart').disabled, level: (document.querySelector('input[name="gameLevel"]:checked') || {}).value, mode: document.getElementById('gameMode').value, palette: document.getElementById('gamePalette').value, best: document.getElementById('gameBest').textContent }));
    t.check(s.shown && !s.start && s.level === 'medium' && s.mode === 'classic' && s.palette !== '' && s.best === '', `${name}: the setup comes up with its defaults and Start enabled`, s);
    await setLevel(page, 'easy'); await ready(page);
    await setPalette(page, 'primary'); await setMode(page, 'relaxed'); await ready(page);
    await click(page, '#gameStart'); await playing(page);
    await setAmount(page, 3); await click(page, '#gameSound'); await click(page, '#gameSound');
    await click(page, '#tab-game [data-ref-view="blocks"]');
    await tapPaint(page, (await play(page)).paints[0], 2);
    const p = await play(page);
    t.check(p.parts.length > 0 && !p.parts.startsWith('Empty') && p.amount === '2 parts per tap', `${name}: Start, the amount, the speaker and a mix work`, [p.parts, p.amount]);
    await click(page, '#gameLock'); await scored(page);
    const r = await result(page);
    t.check(r.popup && /^\d+$/.test(r.pct) && r.points >= 0, `${name}: the score comes up`, [r.popup, r.pct, r.points]);
    await click(page, '#gamePopup [data-game="again"]'); await sleep(200); await click(page, '#againSame'); await playing(page);
    await click(page, '#gameLock'); await scored(page);
    await toSetup(page);
    t.check((await page.evaluate(() => !document.getElementById('gameSetup').hidden)) && (await page.evaluate(() => document.getElementById('gameBest').textContent)) === '', `${name}: Change settings shows the setup, with no best (nothing could be kept)`, await page.evaluate(() => document.getElementById('gameBest').textContent));
    await clean(t, page, name);
    await page.context().close();
  }
}

// ================================================================================================
// 16. The Analysis says in plain words which way each mix is off, and by how much
// ================================================================================================
async function analysisWords(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  await click(page, '#gameStart'); await playing(page);
  const N = (await play(page)).numbers;
  // number 1 (the darkest) as white, the last (the lightest) as black, the rest in turn as one paint, two, or three
  const mixes = Array.from({ length: N }, (_, k) => k === 0 ? [['TW', 4]] : k === N - 1 ? [['IB', 1]] : [[['YO', 2]], [['IB', 1], ['TW', 3]], [['CRL', 1], ['TW', 2]], [['YO', 1], ['IB', 1], ['TW', 1]]][k % 4]);
  for (let k = 0; k < N; k++) { await pickNumber(page, k); await mixExact(page, Object.fromEntries(mixes[k])); }
  await lockIn(page); await click(page, '#gameAnalyze');
  // each zone: the words, and the two chips' colors read as the Study reads them
  const zones = await page.evaluate(() => [...document.querySelectorAll('#gameZones .game-zone')].map((li) => {
    const hex = (c) => /#[0-9A-Fa-f]{6}/.exec(c.title)[0];
    const lab = (h) => Study.rgbToLab(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
    const [mine, target] = li.querySelectorAll('.mix-chip');
    return { n: +li.querySelector('.game-zone-number').textContent, note: li.querySelector('.mix-zone').textContent, match: li.querySelector('.game-zone-match').textContent, yours: lab(hex(mine)), target: lab(hex(target)) };
  }));
  const heard = new Set();
  const wrong = [];
  const hue = 50 * Math.PI / 180;
  for (const z of zones) {
    const dL = z.yours[0] - z.target[0];
    const warm = (z.yours[1] - z.target[1]) * Math.cos(hue) + (z.yours[2] - z.target[2]) * Math.sin(hue);
    const dC = Math.hypot(z.yours[1], z.yours[2]) - Math.hypot(z.target[1], z.target[2]);
    // a part of the note is judged only when the measure is clearly on one side of its threshold (the chips are rounded to 8 bits)
    const parts = [
      ['light', dL >= 3.8, dL < 2.2, /^too light by (\d\.\d) value/, Math.abs(dL) / 10],
      ['dark', dL <= -3.8, dL > -2.2, /^too dark by (\d\.\d) value/, Math.abs(dL) / 10],
      ['warm', warm >= 4.8, warm < 3.2, /too warm/],
      ['cool', warm <= -4.8, warm > -3.2, /too cool/],
      ['strong', dC >= 6, dC < 4, /too strong/],
      ['gray', dC <= -6, dC > -4, /too gray/],
    ];
    for (const [word, clearly, clearlyNot, re, value] of parts) {
      const m = re.exec(z.note.split(', ').find((x) => re.test(x)) || '');
      if (m) heard.add(word);
      if (clearly && !m) wrong.push(`number ${z.n}: should say too ${word}: ${z.note}`);
      if (clearlyNot && m) wrong.push(`number ${z.n}: should not say too ${word}: ${z.note}`);
      if (m && value !== undefined && Math.abs(+m[1] - value) > 0.11) wrong.push(`number ${z.n}: says ${m[1]} value, the chips differ by ${value.toFixed(2)}`);
    }
    if (z.note === 'spot on' && !(Math.abs(dL) < 3.8 && Math.abs(warm) < 4.8 && Math.abs(dC) < 6)) wrong.push(`number ${z.n}: spot on, but the chips differ`);
  }
  t.check(zones.length === N && wrong.length === 0, 'every number’s words say too light or too dark (and by how much), too warm or cool, too strong or gray as the two chips differ', wrong.slice(0, 4));
  const dark1 = zones.find((z) => z.n === 1), light1 = zones.find((z) => z.n === N);
  t.check(/^too light by /.test(dark1.note) && /^too dark by /.test(light1.note), 'the darkest number mixed as white says too light, the lightest mixed as black says too dark', [dark1.note, light1.note]);
  t.note('words heard in the notes of this game: ' + [...heard].join(', ') + (heard.size < 6 ? '; not heard: ' + ['light', 'dark', 'warm', 'cool', 'strong', 'gray'].filter((w) => !heard.has(w)).join(', ') : ''));
  t.check(['warm', 'cool'].some((w) => heard.has(w)) && ['strong', 'gray'].some((w) => heard.has(w)), 'a temperature word and a strength word were exercised', [...heard]);
  // furthest off first
  const order = await page.evaluate(() => [...document.querySelectorAll('#gameZones .game-zone-match')].map((e) => +(/^(\d+)%/.exec(e.textContent) || [])[1]));
  t.check(order.every((m, i) => i === 0 || m >= order[i - 1]), 'the numbers run from furthest off to closest', order);
  await clean(t, page, 'analysis words');
  await page.context().close();
}

// ================================================================================================
// 17. The phone turned on its side, and the value stage, copy bar, Mystery setup and Analysis on the phone
// ================================================================================================
const within = (r, w, h) => !!r && r.left >= -1 && r.right <= w + 1 && (h === undefined || (r.top >= -1 && r.bottom <= h + 1));
const rectOf = (page, selector) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }, selector);
async function phoneLayouts(t, site) {
  // 844 x 390: the rows are sized by the window's height
  {
    const page = await openPage(site, { url: '#game', viewport: { width: 844, height: 390 } });
    await ready(page);
    t.check((await hscroll(page)) <= 0, 'phone on its side: the setup has no horizontal scroll', await hscroll(page));
    await click(page, '#gameStart'); await playing(page); await sleep(400);
    const [vw, vh] = await page.evaluate(() => [innerWidth, innerHeight]);
    const canvas = await rectOf(page, '#gameCanvas'), lock = await rectOf(page, '#gameLock'), paints = await rectOf(page, '#gamePaints'), bar = await rectOf(page, '.game-bar');
    t.check(canvas.height >= 120 && canvas.top >= 0 && canvas.bottom <= vh && within(lock, vw, vh) && within(bar, vw), 'phone on its side: the painting is at least 120 px tall and on screen, with the clock and Lock in above it', [canvas, lock]);
    t.check(within(paints, vw, vh) && (await hscroll(page)) <= 0, 'phone on its side: the paints are on the first screen and nothing scrolls sideways', [paints, await hscroll(page)]);
    await tapPaint(page, (await play(page)).paints[0]);
    t.check((await play(page)).parts.length > 0 && !(await play(page)).parts.startsWith('Empty'), 'phone on its side: a paint tapped adds a part');
    await screenshot(page, 'game-phone-landscape');
    await lockIn(page);
    const r = await rectOf(page, '#gamePopup');
    t.check(within(r, vw) && (await hscroll(page)) <= 0, 'phone on its side: the score fits the width', [r, await hscroll(page)]);
    await clean(t, page, 'phone on its side');
    await page.context().close();
  }
  // 390 x 844: Value first, Copy mix, Mystery's setup, the Analysis
  {
    const page = await openPage(site, { url: '#game', viewport: PHONE });
    await ready(page);
    await setMode(page, 'mystery'); await ready(page);
    const deal = await rectOf(page, '#gameDeal'), label = await rectOf(page, '#gamePaletteLabel');
    t.check(within(deal, 390) && deal.width > 20 && label && Math.abs(deal.top - label.top) < 40 && (await hscroll(page)) <= 0, 'phone: Mystery’s Deal again sits beside the Palette label, inside the width', [deal, label]);
    await setMode(page, 'value'); await ready(page);
    await click(page, '#gameStart'); await playing(page); await sleep(300);
    const val = await rectOf(page, '#gameValue'), lockV = await rectOf(page, '#gameLock'), range = await rectOf(page, '#gameValueRange');
    t.check(within(val, 390) && within(range, 390) && range.width > 150 && within(lockV, 390, 844) && (await hscroll(page)) <= 0, 'phone: the value stage’s slider fits the width and Done with values is on screen', [val, range, lockV]);
    const canv = await rectOf(page, '#gameCanvas');
    t.check(canv.height > 200 && canv.right <= 391, 'phone: the painting is still large in the value stage', canv);
    await screenshot(page, 'game-phone-values');
    await setValue(page, 40);
    await click(page, '#gameLock');
    await pickNumber(page, 0); await tapPaint(page, (await play(page)).paints[0], 2);
    await click(page, '#gameCopy');
    const bar = await rectOf(page, '#gameCopyBar'), copyText = await text(page, '#gameCopyText');
    t.check(!!bar && within(bar, 390) && bar.height > 20 && /Copying number 1/.test(copyText) && (await hscroll(page)) <= 0, 'phone: the copy bar shows inside the width', [bar, copyText]);
    await screenshot(page, 'game-phone-copy');
    await click(page, '#gameCopyDone');
    await lockIn(page); await click(page, '#gameAnalyze'); await sleep(300);
    const cw = await page.evaluate(() => innerWidth);
    const canvases = await Promise.all(['#gameYours', '#gameTarget', '#gamePhoto'].map((s) => rectOf(page, s)));
    const zones = await rectOf(page, '#gameZones'), dl = await rectOf(page, '#gameBreakdown');
    t.check(canvases.every((c) => within(c, cw) && c.width > 100) && within(zones, cw) && within(dl, cw) && (await hscroll(page)) <= 0, 'phone: the Analysis’s three pictures, breakdown and number list fit the width', [canvases.map((c) => [Math.round(c.left), Math.round(c.right)]), zones, await hscroll(page)]);
    const buttons = await page.evaluate(() => [...document.querySelectorAll('#gameAnalysis .game-again .btn')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.left), Math.round(r.right), Math.round(r.height)]; }));
    t.check(buttons.length === 3 && buttons.every((b) => b[1] >= 0 && b[2] <= cw && b[3] >= 24), 'phone: the Analysis’s Play again, Share card and Change settings fit the width and are at least 24 px tall', buttons);
    await screenshot(page, 'game-phone-analysis');
    await clean(t, page, 'phone: value stage, copy bar, mystery, analysis');
    await page.context().close();
  }
}

// ================================================================================================
// 18. Forget my work, pressed in another tab while a game is on here
// ================================================================================================
async function forgetOtherTab(t, site) {
  const forgetHere = async (other) => { await click(other, '#forgetBtn'); await click(other, '#forgetBtn'); };
  for (const [name, race] of [['a game on, nothing else happens', false], ['a score arriving as the other tab forgets (the clock running out)', true]]) {
    const a = await openPage(site, { url: '#game' });
    await ready(a); await setPalette(a, 'zorn'); await ready(a);
    await setAmount(a, 3);
    await click(a, '#gameStart'); await playing(a);
    await tapPaint(a, 'TW');
    t.check((await storageKeys(a, /^portrait-value-studio\./)).length >= 3, `${name}: the game has left its settings in storage`, await storageKeys(a, /^portrait-value-studio\./));
    // (the score, if the page is made to lock in during the 300 ms before it reloads, as a clock running out would)
    if (race) await a.evaluate(() => window.addEventListener('studio:forget', () => setTimeout(() => document.getElementById('gameLock').click(), 60)));
    const b = await newTab(site, a, { url: '#help' });
    const reloaded = a.waitForEvent('load', { timeout: 8000 }).then(() => true).catch(() => false);
    await forgetHere(b);
    const did = await reloaded;
    await sleep(800);
    const keys = await storageKeys(a, /^portrait-value-studio\./);
    t.check(did, `${name}: the other tab’s Forget reloads this one`, did);
    const onSetup = await a.evaluate(() => !document.getElementById('gameSetup').hidden && document.getElementById('gamePlay').hidden);
    t.check(onSetup, `${name}: this tab comes back to the game’s setup`, onSetup);
    const stay = t.check(keys.length === 0, `${name}: nothing the site kept is left in storage once both tabs have reloaded`, keys);
    if (!stay) t.finding({
      title: 'A score that arrives while another tab forgets everything is written back after the wipe',
      severity: 'low',
      steps: '1. Open Paint by numbers in one tab and Start painting. 2. In a second tab open How to use and press "Forget my work on this device" twice. 3. In the first tab, let the portrait lock in within the 300 ms before it reloads (the clock running out does; here its Lock in is pressed 60 ms after the Forget is heard).',
      expected: 'Forget leaves nothing of the site in the browser: no best score survives.',
      actual: `Both tabs reload and storage holds ${JSON.stringify(keys)}: the best score of a game ended after the wipe stays.`,
      cause: 'js/guard.js 159-163: the other tabs reload 300 ms after the storage event and neither stop the game nor its saves; js/game.js lockIn (1307-1315) saves the best whenever it runs, and the game has no studio:forget listener.',
    });
    await clean(t, a, name);
    await clean(t, b, name + ' (the tab that forgot)');
    await a.context().close();
  }
}

// ================================================================================================
// 19. My paints at its extremes: two whites, no white, two paints that cannot make most colors
// ================================================================================================
async function mineExtremes(t, site) {
  for (const [name, codes] of [['two whites (Titanium and Lead)', ['TW', 'LW']], ['no white (Cadmium Red Light and Yellow Ochre)', ['CRL', 'YO']], ['a black and a blue (Ivory Black and Ultramarine)', ['IB', 'UB']]]) {
    const page = await openPage(site, { url: '#game', storage: { [MINE]: codes } });
    await ready(page);
    await setPalette(page, 'mine'); await ready(page);
    const s = await setup(page);
    t.check(s.palette === 'mine' && s.dots.length === 2 && !s.start && /^(Suggested for this portrait\.|Suggested for this portrait: .+\.) 2 paints, which mix \d+ of its \d+ colors closely\./.test(s.hint), `${name}: chosen, two dots and the hint, Start enabled`, [s.dots, s.hint]);
    await click(page, '#gameStart'); await playing(page);
    const recipes = await recipesOfBoard(page);
    const parts = recipes.map(([, mix]) => Object.values(recipeOf(mix)).reduce((a, b) => a + b, 0));
    t.check(recipes.length >= 1 && parts.every((n) => n > 0 && n <= 60), `${name}: every number has a recipe of at most 60 parts`, [recipes.length, Math.max(...parts)]);
    await playAgain(page);
    await mixAll(page, recipes);
    await lockIn(page);
    const r = await result(page);
    t.check(r.pct === '100' && r.stars === 5, `${name}: every number mixed to its recipe scores 100%`, [r.pct, r.stars]);
    await clean(t, page, name);
    await page.context().close();
  }
}

// ================================================================================================
// 20. The generated portraits keep the README's promises, and the rare ones make boards
// ================================================================================================
async function generatedPortraits(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page);
  // in the page: fixed pseudo-random ids (so a run is repeatable), their looks, the same portrait drawn twice, the seams
  const m = await page.evaluate(() => {
    let seed = 20240607; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const ids = Array.from({ length: 3000 }, () => `${Subjects.PAINTERS[Math.floor(rnd() * Subjects.PAINTERS.length)]}-${Math.floor(rnd() * 1e6)}`);
    const looks = ids.map((id) => Subjects.entry(id));
    const count = (f) => looks.filter(f).length;
    const tally = (f) => looks.reduce((o, e) => { const k = f(e); o[k] = (o[k] || 0) + 1; return o; }, {});
    const draw = (e, size, layer) => Subjects.drawPortrait(e.painter, e.seed, layer ? Object.assign({}, e.look, { _layer: layer }) : e.look, size);
    let same = 0;
    for (const e of looks.slice(0, 20)) if (draw(e, 1).toDataURL() === draw(e, 1).toDataURL()) same++;
    // a seam: a pixel well inside the figure's own silhouette that the finished layer leaves see-through
    const seams = [];
    const seamCount = (e, size, R) => {
      const raw = draw(e, size, 'raw'), closed = draw(e, size, true), w = raw.width, h = raw.height;
      const ra = raw.getContext('2d').getImageData(0, 0, w, h).data, ca = closed.getContext('2d').getImageData(0, 0, w, h).data;
      const inside = new Uint8Array(w * h);
      for (let k = 0; k < w * h; k++) inside[k] = ra[k * 4 + 3] >= 8 ? 1 : 0;
      let n = 0;
      for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) {
        let ok = true;
        for (let dy = -R; dy <= R && ok; dy++) for (let dx = -R; dx <= R; dx++) if (!inside[(y + dy) * w + x + dx]) { ok = false; break; }
        if (ok && ca[(y * w + x) * 4 + 3] < 250) n++;
      }
      return n;
    };
    for (const e of looks.slice(0, 150)) { const n = seamCount(e, 0.5, 2); if (n) seams.push([e.id, n]); }
    for (const e of looks.slice(150, 162)) { const n = seamCount(e, 1, 3); if (n) seams.push([e.id, n, 'full size']); }
    const pick = (f) => (looks.find(f) || {}).id || null;
    return {
      n: looks.length, same, seams,
      woman: count((e) => e.look.woman) / looks.length, old: count((e) => e.look.age === 'old') / looks.length,
      profile: count((e) => e.look.view === 'profile') / looks.length, front: count((e) => e.look.view === 'front') / looks.length,
      painters: tally((e) => e.painter), lights: tally((e) => e.look.light), bgs: tally((e) => e.look.bg), collars: tally((e) => e.look.collar), clothes: tally((e) => e.look.clothes || 'plain'), deep: count((e) => e.look.deep),
      picks: {
        'a woman with long hair and a pearl, in profile': pick((e) => e.look.woman && e.look.hair === 'long' && e.look.pearl && e.look.view === 'profile'),
        'Velázquez deep-skinned': pick((e) => e.painter === 'velazquez' && e.look.deep),
        'Vermeer in black': pick((e) => e.painter === 'vermeer' && e.look.clothes === 'black'),
        'an old Hals sitter in a ruff, full face': pick((e) => e.painter === 'hals' && e.look.collar === 'ruff' && e.look.age === 'old' && e.look.view === 'front'),
        'an old Rembrandt under a raking light on a plain wall': pick((e) => e.painter === 'rembrandt' && e.look.age === 'old' && e.look.light === 'dramatic' && e.look.bg === 'plain'),
        'a bearded Zorn with a moustache': pick((e) => e.painter === 'zorn' && e.look.beard && e.look.moustache),
        'a Sargent woman in white with a bun': pick((e) => e.painter === 'sargent' && e.look.woman && e.look.hair === 'bun' && e.look.clothes === 'white'),
        'a Sorolla lit from above': pick((e) => e.painter === 'sorolla' && e.look.light === 'top'),
      },
    };
  });
  t.check(m.same === 20, 'the same id draws the same portrait, twenty times out of twenty', m.same);
  t.check(m.seams.length === 0, 'no background shows through inside a figure: 150 portraits at half size and 12 at full size, none with a see-through pixel more than two or three pixels inside the silhouette', m.seams.slice(0, 4));
  t.check(m.woman > 0.45 && m.woman < 0.55, 'about half are women', m.woman);
  t.check(m.old > 0.21 && m.old < 0.31, 'roughly a quarter are old', m.old);
  t.check(m.profile > 0.08 && m.profile < 0.18 && m.front > 0.12 && m.front < 0.23 && m.profile + m.front < 0.4, 'most heads are turned three-quarters, some are nearly full face or in profile', [m.profile, m.front]);
  t.check(Object.keys(m.painters).length === 7 && Object.values(m.painters).every((n) => n / m.n > 0.10 && n / m.n < 0.18), 'all seven painters turn up, evenly', m.painters);
  t.check(['side', 'soft', 'dramatic', 'top'].every((k) => m.lights[k] > 100) && ['block', 'wedge', 'band', 'window', 'plain'].every((k) => m.bgs[k] > 100) && ['flat', 'open', 'none', 'ruff'].every((k) => m.collars[k] > 50) && m.deep > 20 && Object.keys(m.clothes).length >= 8, 'every lamp, wall, collar and clothes color comes up', [m.lights, m.bgs, m.collars, m.clothes, m.deep]);
  // a board from each of the rare looks
  let n = 0;
  await click(page, '#gameFromPainting'); await ready(page);
  for (const [what, id] of Object.entries(m.picks)) {
    if (!id) { t.note(`no portrait of the kind "${what}" among the 3,000 ids tried`); continue; }
    await page.evaluate((id) => { Subjects.random = () => id; }, id);
    await click(page, '#gameReroll'); await ready(page);
    const s = await setup(page);
    const levels = n < 2 ? ['medium', 'easy', 'hard'] : ['medium'];
    for (const lv of levels) {
      if (lv !== 'medium') { await setLevel(page, lv); await ready(page); }
      const sl = await setup(page);
      t.check(sl.painting === JSON.stringify(id) && PAINTERS.test(sl.paintingName) && numbersOf(sl.note) >= 3 && !sl.start && sl.preview[0] > 0, `${what} (${id}) at ${lv}: a board with at least three numbers, named, Start enabled`, [sl.painting, sl.note, sl.paintingName]);
    }
    if (n < 2) { await setLevel(page, 'medium'); await ready(page); }
    void s;
    n++;
  }
  await click(page, '#gameStart'); await playing(page);
  t.check((await play(page)).numbers >= 3, 'the last of them plays', (await play(page)).numbers);
  await clean(t, page, 'generated portraits');
  await page.context().close();
}

// ================================================================================================
// 21. A portrait dealt by the Studio becomes the Study's reference through Check my painting, and so the game's My photo
// ================================================================================================
async function dealtThroughStudio(t, site) {
  const id = 'hals-48213';
  const page = await openPage(site, { url: '#paint' });
  await page.waitForFunction(() => !!window.PaintStudio && !!window.Subjects, null, { timeout: 15000 }).catch(() => null);
  await page.evaluate((id) => { Subjects.random = () => id; document.querySelector('#tab-paint [data-ref-kind="painting"]').click(); }, id);
  const ref = await page.evaluate(() => { const r = PaintStudio.reference(); return { kind: r.kind, id: r.id, title: r.title }; });
  t.check(ref.kind === 'painting' && ref.id === id && /after Frans Hals$/.test(ref.title), 'the Studio dealt the portrait as its reference', ref);
  await tab(page, 'study');
  await page.evaluate(() => { document.getElementById('drawer-check').open = true; });
  await click(page, '#artFromStudio');
  await page.waitForFunction((k) => Studio.sourceKey() === k, `${id}:600x750`, { timeout: 15000 }).catch(() => null);
  t.check((await page.evaluate(() => Studio.sourceKey())) === `${id}:600x750`, 'Check my painting makes the dealt portrait the Study’s reference', await page.evaluate(() => Studio.sourceKey()));
  await tab(page, 'game'); await ready(page);
  const s = await setup(page);
  t.check(s.subject === 'photo' && s.preview[0] === 600 && s.preview[1] === 750 && numbersOf(s.note) >= 3 && !s.start, 'the game’s My photo paints from that reference: a board, Start enabled', [s.subject, s.preview, s.note]);
  const named = t.check(!/[a-z]+-\d{3,}/.test(s.photoName) && /Hals|ruff/i.test(s.photoName), 'and the photo pane names it in words (the portrait’s title or its painter), not by an internal id', s.photoName);
  if (!named) t.finding({
    title: 'The game names a dealt portrait by its internal id when it comes through Check my painting',
    severity: 'low',
    steps: '1. On the Studio tab open the Reference sheet and choose "A portrait" (a portrait is dealt). 2. On the Study tab open Check my painting and press the button that scores the Studio painting. 3. Open Paint by numbers.',
    expected: 'The photo pane names what is loaded the way the Study does (the sitter and painter, such as "Man in a ruff, after Frans Hals"), or says it is the portrait dealt in the Studio.',
    actual: `The pane reads "${s.photoName}": the portrait’s random id (a painter and a seed), which means nothing to a visitor.`,
    cause: 'js/app.js 2651 passes the dealt portrait’s id as the reference’s file name (useSource(r.picture, r.title, r.id)), and js/game.js 354-357 prints the source key for any photo that is not the sample.',
  });
  // the same portrait reached as A painting is another board with another best
  await click(page, '#gameStart'); await playing(page); await lockIn(page);
  const viaStudio = Object.keys(await bests(page));
  await toSetup(page);
  await click(page, '#gameFromPainting'); await ready(page);
  await page.evaluate((id) => { Subjects.random = () => id; }, id);
  await click(page, '#gameReroll'); await ready(page);
  const p = await setup(page);
  await click(page, '#gameStart'); await playing(page); await lockIn(page);
  const both = Object.keys(await bests(page));
  t.check(p.painting === JSON.stringify(id) && both.length === 2, 'the same portrait dealt in the game is played and kept too', [p.painting, both]);
  t.note(`The same portrait reaches the game two ways with two boards and two bests: through the Study's reference it is simplified as a photo (${numbersOf(s.note)} numbers on ${s.preview.join(' x ')}, best kept under "${viaStudio[0]}"), dealt by the game it is simplified as a painting (${numbersOf(p.note)} numbers on ${p.preview.join(' x ')}, best kept under "${both.find((k) => /^painting:/.test(k))}"). The README promises a best "for each painting" and says My photo uses the reference loaded in the app, so neither is wrong; left as a note.`);
  await clean(t, page, 'a dealt portrait through Check my painting');
  await page.context().close();
}

// ================================================================================================
// 22. Mystery palette: the hand across Deal again, a level change, Another painting and Play again
// ================================================================================================
async function mysteryHands(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page);
  await click(page, '#gameFromPainting'); await ready(page);
  await setMode(page, 'mystery'); await ready(page);
  const closeOf = (hint) => { const m = /which mix (\d+) of its (\d+) colors closely/.exec(hint); return m && [+m[1], +m[2]]; };
  const hands = [], close = [];
  const note = async () => { const s = await setup(page); hands.push(s.dots.join('|')); close.push(closeOf(s.hint)); return s; };
  const first = await note();
  t.check(first.dots.length === 4 && /^titanium white$/i.test(first.dots[0]) && new Set(first.dots).size === 4, 'Mystery on a painting: white and three different paints', first.dots);
  for (let i = 0; i < 5; i++) { await click(page, '#gameDeal'); await ready(page); await note(); }
  t.check(new Set(hands).size === hands.length, 'Deal again: six deals, six different hands', hands);
  t.check(close.every((c) => c && c[1] >= 3) && close.filter((c) => c[0] >= 1).length >= 4, 'a hand that mixes the portrait’s colors reasonably well is kept: at least four of the six mix some of the colors closely', close);
  // a new level is a new board: the hand it shows
  const before = hands[hands.length - 1];
  await setLevel(page, 'easy'); await ready(page);
  const atEasy = (await setup(page)).dots.join('|');
  t.note(`Mystery: changing the level builds a new board and deals a new hand (${atEasy === before ? 'this time the same hand came back' : 'the hand changed'}); the README says only that a new portrait deals a new hand.`);
  await setLevel(page, 'medium'); await ready(page);
  const shown = await setup(page);
  // the hand shown is the hand played, and Play again keeps it for the same portrait and deals anew for a new one
  const codesOfNames = (names) => page.evaluate((names) => names.map((n) => Paints.LIBRARY.find((p) => p.name.toLowerCase() === n.toLowerCase()).code), names);
  const wantCodes = await codesOfNames(shown.dots);
  await click(page, '#gameStart'); await playing(page);
  const played = (await play(page)).paints;
  t.check(same(played, wantCodes), 'Start paints with the hand the setup shows', [played, wantCodes]);
  await lockIn(page);
  await playAgain(page);
  t.check(same((await play(page)).paints, wantCodes), 'Play again, Same portrait: the same hand', [(await play(page)).paints, wantCodes]);
  await lockIn(page);
  await click(page, '#gamePopup [data-game="again"]'); await sleep(200); await click(page, '#againNew'); await playing(page);
  const next = (await play(page)).paints;
  t.check(next.length === 4 && next[0] === 'TW' && !same(next, wantCodes), 'Play again, New portrait: a new hand is dealt', [next, wantCodes]);
  await clean(t, page, 'mystery hands');
  await page.context().close();
}

// ================================================================================================
// 23. Game feel: the chime and the vibration follow the speaker, a hold at the cap, a right-click, a pointer that leaves,
//     the amount changed mid-hold, Spot on through a paste and again after an undo, Lock in while copying
// ================================================================================================
async function gameFeel(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  // count what the page asks of the speaker and the vibration motor
  await page.evaluate(() => {
    window.__vib = []; window.__nodes = { osc: 0, buf: 0 };
    navigator.vibrate = (p) => { window.__vib.push(JSON.stringify(p)); return true; };
    const A = window.AudioContext || window.webkitAudioContext;
    const co = A.prototype.createOscillator, cb = A.prototype.createBufferSource;
    A.prototype.createOscillator = function (...a) { window.__nodes.osc++; return co.apply(this, a); };
    A.prototype.createBufferSource = function (...a) { window.__nodes.buf++; return cb.apply(this, a); };
  });
  const feel = () => page.evaluate(() => ({ vib: window.__vib.slice(), osc: window.__nodes.osc, buf: window.__nodes.buf }));
  await click(page, '#gameStart'); await playing(page);
  const recipes = await recipesOfBoard(page);
  await playAgain(page);
  // sound on: a number mixed exactly rings the chime (4 oscillators: two bells, each with an overtone) and vibrates once
  await pickNumber(page, 0); await mixExact(page, recipeOf(recipes[0][1]));
  let f = await feel();
  const chimes = f.osc - f.buf / 2; // every tap makes one thock (an oscillator) and two clicks (buffer sources)
  t.check(f.vib.length === 1 && f.vib[0] === '[18,40,28]' && chimes === 4 && (await play(page)).spot === 'Spot on! Number 1', 'Spot on with the sound on: one chime of four oscillators and one vibration [18,40,28]', f);
  // the speaker off: nothing sounds, nothing vibrates, on a new Spot on
  await click(page, '#gameSound');
  const quiet = await feel();
  await click(page, '#gameClear'); await mixExact(page, recipeOf(recipes[0][1]));
  f = await feel();
  t.check((await play(page)).spot === 'Spot on! Number 1' && same([f.vib.length, f.osc, f.buf], [quiet.vib.length, quiet.osc, quiet.buf]), 'Spot on with the speaker off: the badge shows, no vibration, no sound', [quiet, f]);
  // the speaker on again plays its test click
  await click(page, '#gameSound'); await sleep(300);
  f = await feel();
  t.check(f.osc === quiet.osc + 1 && f.buf >= quiet.buf + 2, 'the speaker switched on plays a test click', [quiet, f]);

  // a held paint at the cap: refused on every repeat, said, nothing added
  await pickNumber(page, 1); await click(page, '#gameClear');
  await setAmount(page, 4); await tapPaint(page, 'TW', 14);
  await setAmount(page, 2); await tapPaint(page, 'TW', 3);
  await setAmount(page, 0); await tapPaint(page, 'TW', 3);
  t.check((await play(page)).parts === 'TW 59¾', 'a mix brought to 59¾ parts', (await play(page)).parts);
  await setAmount(page, 2);
  const pb = await box(page, '.game-paint');
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
  await page.mouse.down(); await sleep(900); await page.mouse.up();
  let p = await play(page);
  t.check(p.parts === 'TW 59¾' && p.toast === 'A mix holds up to 60 parts', 'holding a paint at the cap adds nothing and says why', [p.parts, p.toast]);
  // a right-click adds nothing and opens no menu
  await click(page, '#gameClear'); await setAmount(page, 2);
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down({ button: 'right' }); await sleep(600); await page.mouse.up({ button: 'right' });
  const menu = await page.evaluate(() => { const b = document.querySelector('.game-paint'); const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); b.dispatchEvent(e); return e.defaultPrevented; });
  t.check((await play(page)).parts.startsWith('Empty') && menu, 'a right-click on a paint adds nothing and its context menu is prevented', [(await play(page)).parts, menu]);
  // a pointer that leaves the paint stops the hold
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down(); await sleep(800);
  const held = parts((await play(page)).parts.replace(/^TW /, ''));
  await page.mouse.move(pb.x + pb.width / 2, pb.y - 60); await sleep(100);
  const atLeave = parts((await play(page)).parts.replace(/^TW /, ''));
  await sleep(500);
  const later = parts((await play(page)).parts.replace(/^TW /, ''));
  await page.mouse.up();
  t.check(held >= 3 && later === atLeave, 'a pointer that leaves a held paint stops the adding', [held, atLeave, later]);
  // the amount changed mid-hold applies from the next repeat
  await click(page, '#gameClear'); await setAmount(page, 2);
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down(); await sleep(700);
  await page.evaluate(() => { window.__seen = []; window.__poll = setInterval(() => window.__seen.push(document.getElementById('gameMixParts').textContent), 30); });
  await setAmount(page, 3); await sleep(700);
  await page.mouse.up();
  const trail = await page.evaluate(() => { clearInterval(window.__poll); return window.__seen.map((x) => x.replace(/ /g, ' ')); });
  const totals = trail.map((x) => parts(x.replace(/^TW /, ''))).filter((x) => !Number.isNaN(x));
  const steps = new Set(totals.slice(1).map((x, i) => x - totals[i]).filter((d) => d > 0));
  t.check(steps.has(2) && [...steps].every((d) => d === 1 || d === 2), 'the amount changed during a hold applies from the next repeat (1 part, then 2)', [...steps]);

  // Lock in while copying: the score has no copy bar, and Esc on the score does nothing
  await click(page, '#gameClear'); await tapPaint(page, 'TW');
  await click(page, '#gameCopy');
  await click(page, '#gameLock'); await scored(page);
  const lk = await page.evaluate(() => ({ bar: !document.getElementById('gameCopyBar').hidden, copying: document.getElementById('gamePlay').classList.contains('is-copying') }));
  await page.keyboard.press('Escape'); await sleep(150);
  const rs = await result(page);
  t.check(!lk.bar && !lk.copying && rs.popup, 'Lock in while copying: the score has no copy bar, and Esc on it changes nothing', [lk, rs.popup]);
  await playAgain(page);
  t.check(!(await play(page)).copying && (await play(page)).copyText === 'Copy mix', 'and the next game does not start copying', (await play(page)).copyText);
  await clean(t, page, 'game feel');
  await page.context().close();

  // no audio at all: the game plays
  const mute = await openPage(site, { url: '#game' });
  await mute.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
  await mute.reload({ waitUntil: 'load' }); await sleep(500);
  await ready(mute); await click(mute, '#gameStart'); await playing(mute);
  await tapPaint(mute, (await play(mute)).paints[0], 3);
  t.check(!(await play(mute)).parts.startsWith('Empty'), 'a browser with no Web Audio: the game plays and taps add parts', (await play(mute)).parts);
  await click(mute, '#gameSound'); await click(mute, '#gameSound');
  await clean(t, mute, 'no Web Audio');
  await mute.context().close();
}

// ================================================================================================
// 24. Spot on through a paste and again after an undo; a paste over a painted number
// ================================================================================================
async function spotThroughPaste(t, site) {
  // two paints that make few colors, so several numbers share a recipe
  const page = await openPage(site, { url: '#game', storage: { [MINE]: ['CRL', 'YO'] } });
  await ready(page); await setPalette(page, 'mine'); await ready(page);
  await page.evaluate(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(1); return true; }; });
  await click(page, '#gameStart'); await playing(page);
  const recipes = await recipesOfBoard(page);
  await playAgain(page);
  const a = recipes[0], twin = recipes.slice(1).find((r) => r[1] === a[1]), other = recipes.slice(1).find((r) => r[1] !== a[1]);
  t.check(!!twin && !!other, 'two paints and no white: some numbers share a recipe and some do not', recipes.map((r) => r[1]));
  if (!twin || !other) { await page.context().close(); return; }
  const vib = () => page.evaluate(() => window.__vib.length);
  await pickNumber(page, a[0] - 1); await mixExact(page, recipeOf(a[1]));
  t.check((await play(page)).spot === `Spot on! Number ${a[0]}` && (await vib()) === 1, 'number 1 mixed to its recipe is Spot on, once', [(await play(page)).spot, await vib()]);
  // Undo takes it below the 95% line; putting the part back is Spot on again
  await click(page, '#gameUndo');
  t.check((await play(page)).parts.startsWith('Empty') && (await vib()) === 1, 'Undo takes the mix away', (await play(page)).parts);
  await mixExact(page, recipeOf(a[1]));
  t.check((await vib()) === 2, 'and the mix put back is Spot on again (a second chime)', await vib());
  // a paste into a number whose color the same mix reaches
  await click(page, '#gameCopy'); await pickNumber(page, twin[0] - 1);
  const afterPaste = await play(page);
  t.check(afterPaste.toast === `Number ${a[0]}’s mix pasted into number ${twin[0]}` && (await vib()) === 3, `a paste into number ${twin[0]}, whose recipe is the same, is Spot on too`, [afterPaste.toast, await vib()]);
  // ...and into a number it does not reach: no chime. A paste over a painted number replaces its parts.
  await pickNumber(page, other[0] - 1); // still copying: this pastes
  const wasOff = await vib();
  await click(page, '#gameCopyDone');
  await pickNumber(page, other[0] - 1);
  const mixed = (await play(page)).parts;
  t.check(mixed === a[1].replace(/^Mix: /, '') && wasOff === 3, `a paste into number ${other[0]}, whose recipe differs, copies the parts and does not chime`, [mixed, a[1], wasOff]);
  await pickNumber(page, other[0] - 1); await click(page, '#gameClear'); await tapPaint(page, 'YO', 3);
  await pickNumber(page, a[0] - 1); await click(page, '#gameCopy'); await pickNumber(page, other[0] - 1); await click(page, '#gameCopyDone');
  await pickNumber(page, other[0] - 1);
  t.check((await play(page)).parts === a[1].replace(/^Mix: /, ''), 'a paste over a painted number replaces its parts', (await play(page)).parts);
  await clean(t, page, 'spot on through a paste');
  await page.context().close();
}

// ================================================================================================
// 25. After a game: an equal score is no New best!, the score survives a tab switch and the best survives a reload,
//     the keys a game writes, where focus goes when a game or its score is left, the Analysis's own buttons
// ================================================================================================
const GAME_KEYS = ['gameLevel', 'gamePalette', 'gameMode', 'gameSubject', 'gamePainting', 'gameRefView', 'gameAmount', 'gameSound', 'gameBest'].map(K);
const focusOf = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName.toLowerCase()) : null; });
async function afterTheGame(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page);
  // the panels at the side step aside on the desktop while the game is the tab
  const panels = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => getComputedStyle(e).display), sel);
  const onGame = await panels('.rail, .toolstrip');
  await tab(page, 'study'); const onStudio = await panels('.rail, .toolstrip'); await tab(page, 'game');
  t.check(onGame.length > 0 && onGame.every((d) => d === 'none') && onStudio.some((d) => d !== 'none'), 'the side panels are shown on the Study tab and step aside on Paint by numbers', [onGame, onStudio]);
  const before = await storageKeys(page, /^portrait-value-studio\./);
  await setPalette(page, 'zorn'); await setMode(page, 'relaxed'); await ready(page);
  await click(page, '#tab-game [data-ref-view="blocks"]'); await setAmount(page, 3); await click(page, '#gameSound'); await click(page, '#gameSound');
  await click(page, '#gameStart'); await playing(page);
  const recipes = await recipesOfBoard(page);
  await playAgain(page); await mixAll(page, recipes); await lockIn(page);
  let r = await result(page);
  const key = `${await page.evaluate(() => Studio.sourceKey())}|medium|zorn|relaxed`;
  t.check(r.pct === '100' && r.points === 1000 && r.newBest && (await bests(page))[key] === 1000, 'Relaxed, every number exact: 1,000 points and a New best! over the 0 of the first game', [r.pct, r.points, r.newBest]);
  const after = await storageKeys(page, /^portrait-value-studio\./);
  const added = after.filter((k) => !before.includes(k));
  t.check(added.length > 0 && added.every((k) => GAME_KEYS.includes(k)) && after.every((k) => before.includes(k) || GAME_KEYS.includes(k)), 'a full game writes only the game’s own keys', { added, before });
  // the same score again is not a best
  await playAgain(page); await mixAll(page, recipes); await lockIn(page);
  r = await result(page);
  t.check(r.points === 1000 && !r.newBest && (await bests(page))[key] === 1000, 'the same 1,000 again is no New best!, and the best stays', [r.points, r.newBest, await bests(page)]);
  // the score and its closed state survive a visit to another tab
  await click(page, '#gamePopupClose');
  await tab(page, 'study'); await tab(page, 'game');
  r = await result(page);
  t.check(!(await page.evaluate(() => document.getElementById('gameResult').hidden)) && !r.popup && r.showBar && r.pct === '100', 'a tab switch with the score closed keeps the score where it was left', [r.popup, r.showBar, r.pct]);
  // the Analysis has its own Play again and Change settings
  await click(page, '#gameShowScore'); await click(page, '#gameAnalyze');
  await page.evaluate(() => document.querySelector('#gameAnalysis [data-game="again"]').click()); await sleep(250);
  const dlg = await page.evaluate(() => ({ open: document.getElementById('againDialog').open, focus: document.activeElement.id }));
  t.check(dlg.open && dlg.focus === 'againSame', 'the Analysis’s own Play again asks the same question', dlg);
  await click(page, '#againCancel');
  await page.evaluate(() => document.querySelector('#gameAnalysis [data-game="new"]').click());
  await ready(page);
  const toSetupFocus = await focusOf(page);
  t.check((await setup(page)).shown, 'the Analysis’s own Change settings returns to the setup', await setup(page));
  const keepsFocus = t.check(toSetupFocus !== 'body', 'Change settings leaves focus on a control, not on the page', toSetupFocus);
  // a reload with the score on screen: the setup, with the best
  await page.reload({ waitUntil: 'load' }); await sleep(500); await ready(page);
  await setPalette(page, 'zorn'); await ready(page); // (a new board takes its suggested palette: back to the one played)
  const st = await setup(page);
  t.check(st.shown && st.mode === 'relaxed' && st.best === 'Your best on this portrait at this level in Relaxed mode: 1000 points', 'a reload comes back to the setup with the best of 1,000 named', [st.mode, st.best]);
  // ✕ twice: where focus lands
  await click(page, '#gameStart'); await playing(page);
  await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);
  const quitFocus = await focusOf(page);
  const quitOk = t.check(quitFocus !== 'body', '✕ twice leaves focus on a control of the setup, not on the page', quitFocus);
  if (!(keepsFocus && quitOk)) t.finding({
    title: 'Focus is lost to the page when a game is quit or the score is left for the setup',
    severity: 'low',
    steps: '1. Open Paint by numbers with the keyboard and Start painting. 2. Press the ✕ in the bar twice (or Lock in portrait, then Change settings). 3. Read which element has focus (press Tab).',
    expected: 'Focus lands on a control of the setup (Start painting, say), as it lands on Lock in portrait when a game starts, on Analyze when the score comes and on Show score when it is closed.',
    actual: `After ✕ twice focus is on "${quitFocus}", after Change settings on "${toSetupFocus}": the control that had it was hidden, so a keyboard user starts again from the top of the page.`,
    cause: 'js/game.js 1175-1191 (the quit) and 1617-1623 (toSetup) hide the play and result sections without moving focus; compare startGame (609), showScore (1386) and the Show score button (1389-1393), which do.',
  });
  await clean(t, page, 'after the game');
  await page.context().close();
}

// ================================================================================================
// 26. Inputs the first sections left out: a shape tapped in the value stage, taps during Memory's look, a look that
//     ends while away, a photo pasted or dropped on a painting's setup, the file picker cancelled or given a bad file
// ================================================================================================
async function otherInputs(t, site) {
  const page = await openPage(site, { url: '#game' });
  await ready(page); await setPalette(page, 'zorn'); await ready(page);
  const tapSpot = async () => {
    const spot = await paperSpot(page), cb = await box(page, '#gameCanvas');
    if (!spot || !cb) return false;
    await page.mouse.click(cb.x + (spot.x + 0.5) * cb.width / spot.w, cb.y + (spot.y + 0.5) * cb.height / spot.h);
    return true;
  };
  // Value first: a shape tapped on the board chooses its number, and the slider greys every shape of it
  await setMode(page, 'value'); await ready(page);
  await click(page, '#gameStart'); await playing(page);
  await pickNumber(page, 4);
  t.check(await tapSpot(), 'the value stage has a bare shape to tap');
  let p = await play(page);
  const k = +(/^Number (\d+)$/.exec(p.valueTitle) || [])[1];
  t.check(k > 0 && k !== 5 && same(p.pressed, [k - 1]), 'a shape tapped in the value stage chooses its number', [p.valueTitle, p.pressed]);
  const area = await washCount(page);
  await setValue(page, 30);
  const g = greyOf(30);
  const greys = (await colorsOf(page, '#gameCanvas'))[`#${[g, g, g].map((x) => x.toString(16).padStart(2, '0')).join('')}`] || 0;
  t.check(area > 100 && greys >= area * 0.85, 'and every shape with that number takes the grey (the whole area of its shapes, the numerals apart)', [area, greys]);
  await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);

  // Memory: during the look a number or a shape can be chosen, 'Memorize this' does nothing, and a look that ends while away
  await setMode(page, 'memory'); await ready(page);
  await page.clock.install();
  await click(page, '#gameStart'); await playing(page);
  await pickNumber(page, 2);
  await tapSpot();
  p = await play(page);
  t.check(p.looking && /^Number \d+$/.test(p.title) && p.parts.startsWith('Empty'), 'during the look a shape can be tapped to choose its number; nothing is painted', [p.looking, p.title, p.parts]);
  await click(page, '#gameRefToggle');
  p = await play(page);
  t.check(p.looking && p.toggle === 'Memorize this' && !p.collapsed, '"Memorize this" does nothing during the look', [p.looking, p.toggle, p.collapsed]);
  await tab(page, 'study');
  await page.clock.fastForward(11000); await sleep(400);
  await tab(page, 'game');
  p = await play(page);
  t.check(!p.looking && p.lock === 'Lock in portrait' && p.collapsed && p.toggle === 'Peek · 3 left (−10 s)' && p.timer === '5:00', 'a look that ends while away on another tab is over on return: the clock at 5:00 and all three peeks left', [p.looking, p.lock, p.toggle, p.timer]);
  await click(page, '#tab-game [data-ref-view="blocks"]');
  p = await play(page);
  t.check(p.collapsed && (await page.evaluate(() => document.querySelector('#tab-game [data-ref-view="blocks"]').getAttribute('aria-pressed'))) === 'true', 'Blocks pressed while the reference is hidden changes the view and leaves it hidden', [p.collapsed]);
  await click(page, '#gameRefToggle'); await sleep(100);
  const peeking = await page.evaluate(() => ({ label: document.getElementById('gameRef').getAttribute('aria-label'), toggle: document.getElementById('gameRefToggle').textContent }));
  t.check(peeking.toggle === 'Peeking…' && peeking.label === 'The reference as a color-block study', 'and the peek then shows the blocks', peeking);
  await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);
  await setMode(page, 'classic'); await ready(page);
  await clean(t, page, 'other inputs: value stage and memory');
  await page.context().close();

  // A painting is chosen: a photo pasted or dropped on the page is what the visitor means to paint
  const q = await openPage(site, { url: '#game' });
  await ready(q);
  await click(q, '#gameFromPainting'); await ready(q);
  await pasteFile(q, await makeImage(q, { width: 500, height: 640, type: 'image/jpeg', name: 'pasted-a.jpg' }));
  await ready(q);
  let s = await setup(q);
  t.check(s.subject === 'photo' && s.photoPane && s.photoName === 'Painting from pasted-a.' && s.preview[0] === 500, 'a photo pasted while A painting is chosen switches the setup to My photo and names it', [s.subject, s.photoName, s.preview]);
  await click(q, '#gameFromPainting'); await ready(q);
  await dropFiles(q, 'body', [await makeImage(q, { width: 440, height: 600, type: 'image/jpeg', name: 'dropped-b.jpg' })]);
  await q.waitForFunction(() => document.getElementById('gamePhotoName').textContent === 'Painting from dropped-b.', null, { timeout: 15000 }).catch(() => null);
  await ready(q);
  s = await setup(q);
  t.check(s.subject === 'photo' && s.photoName === 'Painting from dropped-b.' && s.preview[0] === 440, 'a photo dropped while A painting is chosen does the same', [s.subject, s.photoName, s.preview]);

  // New photo (Play again) opens the file picker; cancelling keeps the setup; a file that is not a picture is refused and said
  await click(q, '#gameStart'); await playing(q); await lockIn(q);
  const pickFile = async (files) => {
    const chooser = q.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
    await click(q, '#gamePopup [data-game="again"]'); await sleep(200); await click(q, '#againNew');
    const fc = await chooser;
    if (fc && files) await fc.setFiles(files);
    await sleep(files ? 1500 : 500);
    return !!fc;
  };
  const opened = await pickFile(null);
  s = await setup(q);
  t.check(opened && s.shown && s.photoName === 'Painting from dropped-b.' && !s.start, 'New photo opens the picker; cancelling it leaves the setup with the same photo and Start enabled', [opened, s.shown, s.photoName, s.start]);
  await click(q, '#gameStart'); await playing(q); await lockIn(q);
  await pickFile(textFile());
  s = await setup(q);
  const refusal = await text(q, '#toast');
  t.check(s.shown && s.photoName === 'Painting from dropped-b.' && !s.start && /image|photo|picture/i.test(refusal || ''), 'a text file chosen in the picker is refused with a word, and the setup keeps the photo', [s.shown, s.photoName, refusal]);
  await clean(t, q, 'other inputs: paste, drop and the picker');
  await q.context().close();
}
