// Paint by numbers, played like a sceptical tester hunting edge cases (README: "Paint by numbers" in full;
// source js/game.js, js/subjects.js). The setup with My photo and A painting (Another painting never deals the
// same twice in a row), each level, each mode, every known palette and My paints with 0, 1 and 2 ticks, the
// suggested mark, Mystery's Deal again; a game: numbers by button and by tapping the board, every Amount per
// tap, holding a paint, the 60-part cap, Undo and Clear on an empty mix, Copy mix across numbers then Done, Esc
// and the original number, Next ▸ to the end and its nudge, the Spot on path (every number mixed to its recipe:
// a perfect game), Lock in with nothing painted, the pop-up and New best, Analyze, Compare with target by drag
// and arrow keys, the Share card as a PNG, Play again on both paths; Memory (Ready, Peek ×4, painting during
// the look), Value first (the slider stage, Done, the score split), Relaxed (the stopwatch), the clock running
// out (simulated: performance.now is offset, since five minutes cannot be waited for), ✕ twice, Photo/Blocks and
// the reference dragged on the phone, best scores per portrait/level/palette/mode pruned to fifty, hostile
// saved state for every game key and myPaints (on the #game route), the phone's full-screen layout, and the
// orderings with the rest of the app: a photo loaded mid-game, Forget mid-game, the Study's Colors per value
// and lean between games, Simple mode's palettes, and photos at the Study's extremes (16 × 16, a 40 × 4000
// strip, one flat color, white, black, a transparent PNG, noise, an SVG, and the files it refuses).
import fs from 'node:fs';
import { openPage, clean, tab, PHONE, makeImage, loadPhoto, textFile, brokenImage, svgImage, click, text, visible, hscroll, screenshot, sleep, storageGet, storageKeys } from '../lib.mjs';

const P = 'portrait-value-studio.';
const J = JSON.stringify;
const PAINTERS = /^You've been dealt a portrait after (Rembrandt|Zorn|Sargent|Sorolla|Velázquez|Frans Hals|Vermeer)\.$/;
const HINT = /^(Suggested for this portrait\.|Suggested for this portrait: .+\.|Dealt at random: white and three paints\.) (\d+) paints, which mix (\d+) of its (\d+) colors closely\. The reference is mixed from them, so every number can be matched exactly\.$/;
const EMPTY = 'Empty. Tap a paint to start the mix, or copy one from a painted number.';

// ---- helpers of this case ----------------------------------------------------------------------------------
const ready = (page) => page.waitForFunction(() => !document.getElementById('gameStart').disabled, null, { timeout: 60000 }).then(() => true).catch(() => false);
const playing = (page) => page.waitForFunction(() => !document.getElementById('gamePlay').hidden, null, { timeout: 20000 }).then(() => true).catch(() => false);
const scored = (page) => page.waitForFunction(() => !document.getElementById('gameResult').hidden, null, { timeout: 10000 }).then(() => true).catch(() => false);
const start = async (page) => { await click(page, '#gameStart'); return playing(page); };
const lockIn = async (page) => { await click(page, '#gameLock'); return scored(page); };
const toSetup = async (page) => { await click(page, '#gamePopup [data-game="new"]'); return ready(page); };
const quit = async (page) => { await click(page, '#gameQuit'); await click(page, '#gameQuit'); return ready(page); };
const resetToast = (page) => page.evaluate(() => { document.getElementById('toast').textContent = ''; });
const toast = (page) => text(page, '#toast');
const setRange = (page, id, v) => page.evaluate(([id, v]) => { const s = document.getElementById(id); if (!s) throw new Error('no ' + id); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
const setAmount = async (page, i) => { await setRange(page, 'gameAmount', i); return text(page, '#gameAmountOut'); };
// a paint tapped by its code, through click() (the keyboard path: detail 0 adds a part, as a tap does)
const tapPaint = (page, code, n = 1) => page.evaluate(([code, n]) => { const b = [...document.querySelectorAll('#gamePaints .game-paint')].find((x) => x.querySelector('.game-paint-code').textContent === code); if (!b) throw new Error('no paint ' + code); for (let i = 0; i < n; i++) b.click(); }, [code, n]);
const firstPaint = (page) => page.evaluate(() => document.querySelector('#gamePaints .game-paint-code').textContent);
// the mix writes a code and its amount with a non-breaking space (game.js 963); read as plain spaces
const plain = (v) => (v == null ? v : String(v).replace(/\u00a0/g, ' '));
const mix = async (page) => plain(await text(page, '#gameMixParts'));
const title = (page) => text(page, '#gameMixTitle');
const progress = (page) => text(page, '#gameProgress');
const numberCount = (page) => page.evaluate(() => document.querySelectorAll('#gameNumbers .game-number').length);
const numberLabel = (page, k) => page.evaluate((k) => document.querySelector(`.game-number[data-number="${k}"]`).getAttribute('aria-label'), k);
const breakdown = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#gameBreakdown dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent])));
const zones = (page) => page.evaluate(() => [...document.querySelectorAll('#gameZones .game-zone')].map((z) => ({ n: +z.querySelector('.game-zone-number').textContent, tip: z.querySelector('.game-zone-tip').textContent, match: z.querySelector('.game-zone-match').textContent, note: z.querySelector('.mix-zone').textContent, yours: z.querySelector('.mix-recipe').textContent.replace(/\u00a0/g, ' ') })));
const popup = (page) => page.evaluate(() => ({ shown: !document.getElementById('gamePopup').hidden, kicker: document.getElementById('gameKicker').textContent, pct: document.getElementById('gamePct').textContent, grade: document.getElementById('gameGrade').textContent, newBest: !document.getElementById('gameNewBest').hidden, stars: document.querySelectorAll('#gameStars .game-star.is-on').length, starsLabel: document.getElementById('gameStars').getAttribute('aria-label'), points: document.getElementById('gamePoints').textContent, focus: document.activeElement && document.activeElement.id }));
const countedUp = (page, want) => page.waitForFunction((w) => document.getElementById('gamePct').textContent === String(w), want, { timeout: 4000 }).then(() => true).catch(() => false);
const cut = (page) => page.evaluate(() => document.getElementById('gameFinalHandle').getAttribute('aria-valuenow'));
const bests = async (page) => { try { return JSON.parse(await storageGet(page, P + 'gameBest')) || {}; } catch (e) { return {}; } };
const levelChecked = (page) => page.evaluate(() => (document.querySelector('input[name="gameLevel"]:checked') || {}).value || null);
const paletteOptions = (page) => page.evaluate(() => [...document.getElementById('gamePalette').options].map((o) => ({ value: o.value, text: o.textContent })));
const dots = (page) => page.evaluate(() => [...document.querySelectorAll('#gamePaletteDots .paint-dot')].map((d) => d.title));
const previewBytes = (page) => page.evaluate(() => document.getElementById('gamePreview').toDataURL().length);
// the clock, moved ahead: performance.now is offset in the page, since the game reads nothing else
// the clock brought to `seconds` left, from whatever the timer reads now
const jumpTo = async (page, seconds) => { const [m, s] = (await text(page, '#gameTimer')).split(':').map(Number); await jumpClock(page, Math.max(0, m * 60 + s - seconds) * 1000); };
const jumpClock = (page, ms) => page.evaluate((ms) => { if (!window.__jump) { const real = performance.now.bind(performance); let off = 0; window.__jump = (d) => { off += d; }; performance.now = () => real() + off; } window.__jump(ms); }, ms);
// "Mix: TW 6 · YO 2¾ · IB ¼" as the game writes a recipe, read back into taps
const FRACTION = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
const parseRecipe = (s) => s.replace(/^Mix: /, '').split(' · ').map((p) => { const m = /^(\S+) (\d*)([¼½¾]?)$/.exec(p); return m && { code: m[1], parts: (+m[2] || 0) + (FRACTION[m[3]] || 0) }; }).filter(Boolean);
async function mixExact(page, recipe) {
  for (const { code, parts } of recipe) {
    let left = parts;
    for (const [i, a] of [[4, 4], [3, 2], [2, 1], [1, 0.5], [0, 0.25]]) { const n = Math.floor(left / a + 1e-9); if (n) { await setAmount(page, i); await tapPaint(page, code, n); left -= n * a; } }
  }
}
// a point (in the window) on a shape of the chosen number: its wash is the one color only an unpainted chosen number gets
const washPoint = (page) => page.evaluate(() => { const c = document.getElementById('gameCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) { if (d[i] === 226 && d[i + 1] === 234 && d[i + 2] === 216) { const p = i / 4; const r = c.getBoundingClientRect(); return { x: r.left + ((p % c.width) + 0.5) * r.width / c.width, y: r.top + (Math.floor(p / c.width) + 0.5) * r.height / c.height }; } } return null; });
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; }, sel);
async function centerOf(page, sel) { const loc = page.locator(sel).first(); await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
async function download(page, act, timeout = 8000) { const [dl] = await Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), act()]); if (!dl) return null; const buf = fs.readFileSync(await dl.path()); return { name: dl.suggestedFilename(), png: buf.readUInt32BE(0) === 0x89504e47, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length }; }
const studyIdle = (page) => page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 30000 }).catch(() => null);

export default async function gameMore(t, site) {
  // ================= A. the setup on a desktop: subjects, levels, modes, palettes =================
  const page = await openPage(site);
  await tab(page, 'game');
  t.check(await ready(page), 'setup: Start painting is enabled once the reference is mixed from the palette');
  {
    const s = await page.evaluate(() => ({ photoName: document.getElementById('gamePhotoName').textContent, paintingPane: document.getElementById('gameFromPaintingPane').hidden, subject: document.querySelector('input[name="gameSubject"]:checked').value, note: document.getElementById('gamePreviewNote').textContent, hint: document.getElementById('gamePaletteHint').textContent, value: document.getElementById('gamePalette').value, best: document.getElementById('gameBest').textContent, preview: [document.getElementById('gamePreview').width, document.getElementById('gamePreview').height], modeAbout: document.getElementById('gameModeAbout').textContent, levels: [...document.querySelectorAll('#tab-game .game-levels label small')].map((x) => x.textContent) }));
    const options = await paletteOptions(page);
    t.check(s.subject === 'photo' && s.paintingPane && s.photoName === 'Painting from the sample portrait. Load your own photo to paint from it.', 'My photo is chosen and says it paints from the sample portrait', s);
    t.check(options.length === 10 && ['zorn', 'zorn-blue', 'primary', 'cmy', 'split', 'reilly', 'schmid', 'rembrandt', 'sorolla', 'monet'].every((id) => options.some((o) => o.value === id)), 'the ten known palettes are offered (no My paints with nothing ticked)', options.map((o) => o.value));
    const sug = options.find((o) => / \(suggested\)$/.test(o.text));
    t.check(sug && s.value === sug.value, 'one palette is marked (suggested) and it is the one chosen', { sug, value: s.value });
    const m = HINT.exec(s.hint);
    t.check(m && m[1] === 'Suggested for this portrait.' && +m[3] <= +m[4], 'the hint says it is suggested and how many of the colors the palette mixes closely', s.hint);
    t.check(m && (await dots(page)).length === +m[2], 'the paint dots count the paints the hint names', { dots: (await dots(page)).length, hint: s.hint });
    t.check(/^\d+ numbers to mix, 5:00 on the clock\.$/.test(s.note) && m && +m[4] === parseInt(s.note), 'the preview note counts the numbers (the same count the hint uses) and the clock', s.note);
    t.check(s.preview[0] === 600 && s.preview[1] === 750, 'the preview is the sample study at its working size', s.preview);
    t.check(s.best === '' && s.modeAbout === 'Beat the clock: mix every number to match the reference, then lock in.', 'no best yet; Classic is described', s);
    t.check(JSON.stringify(s.levels) === JSON.stringify(['Big shapes · 6 min', 'Smaller shapes · 5 min', 'More colors · 8 min']), 'the levels say their shapes and minutes', s.levels);
    // another palette: the hint names the suggested one
    const other = options.find((o) => o.value !== s.value);
    await page.selectOption('#gamePalette', other.value); await ready(page);
    const hint2 = await text(page, '#gamePaletteHint');
    t.check(hint2.startsWith(`Suggested for this portrait: ${sug.text.replace(/ \(suggested\)$/, '')}. `) && HINT.test(hint2), 'another palette: the hint names the suggested one instead', hint2);
    t.check((await dots(page)).length === +HINT.exec(hint2)[2], 'the dots follow the chosen palette', (await dots(page)).length);
    await page.selectOption('#gamePalette', sug.value); await ready(page);
  }
  await clean(t, page, 'setup');

  // each level: the note, the counts, the clock
  const counts = {};
  for (const [lv, min] of [['easy', '6:00'], ['hard', '8:00'], ['medium', '5:00']]) {
    await click(page, `#game${lv[0].toUpperCase()}${lv.slice(1)}`);
    t.check(await ready(page), `${lv}: the board is rebuilt and Start comes back`);
    const note = await text(page, '#gamePreviewNote');
    counts[lv] = parseInt(note);
    t.check(new RegExp(`^\\d+ numbers to mix, ${min} on the clock\\.$`).test(note), `${lv}: the note says ${min} on the clock`, note);
    t.check((await levelChecked(page)) === lv, `${lv}: the radio is checked`);
  }
  t.check(counts.easy <= counts.medium && counts.easy >= 3 && counts.hard >= counts.medium, 'Easy never has more numbers than Medium; Hard has at least as many', counts);
  t.note(`numbers on the sample portrait: Easy ${counts.easy}, Medium ${counts.medium}, Hard ${counts.hard} (README: about 8, 9 and 12; Medium and Hard can add a color a shape gets of its own).`);
  await clean(t, page, 'levels');

  // each mode: what the setup says
  const ABOUT = { classic: 'Beat the clock: mix every number to match the reference, then lock in.', relaxed: 'No clock and no time bonus. Take as long as you like; a stopwatch just counts up.', memory: 'The reference shows for 10 seconds, then hides. Paint from memory. A peek at it costs 10 seconds on the clock.', value: 'First set each number’s value, light to dark, in greys. Then add the color over your underpainting. The value study scores too.', mystery: 'Paint with white and three paints dealt at random. The colors to match are mixed from them, so every one can be reached.' };
  for (const m of ['relaxed', 'memory', 'value', 'mystery', 'classic']) {
    await page.selectOption('#gameMode', m);
    t.check(await ready(page), `${m}: Start comes back`);
    const s = await page.evaluate(() => ({ about: document.getElementById('gameModeAbout').textContent, note: document.getElementById('gamePreviewNote').textContent, hint: document.getElementById('gamePaletteHint').textContent, palette: document.getElementById('gamePalette').hidden, deal: document.getElementById('gameDeal').hidden, levels: [...document.querySelectorAll('#tab-game .game-levels label small')].map((x) => x.textContent), saved: localStorage.getItem('portrait-value-studio.gameMode') }));
    t.check(s.about === ABOUT[m], `${m}: the mode is described as the README says`, s.about);
    t.check(s.saved === J(m), `${m}: the mode is remembered`, s.saved);
    const wantNote = m === 'relaxed' ? /^\d+ numbers to mix, no time limit\.$/ : m === 'memory' ? /^\d+ numbers to mix, 5:00 on the clock, after a 10-second look\.$/ : m === 'value' ? /^\d+ numbers to mix, 5:00 on the clock\. Values first, then color\.$/ : /^\d+ numbers to mix, 5:00 on the clock\.$/;
    t.check(wantNote.test(s.note), `${m}: the preview note fits the mode`, s.note);
    t.check(s.levels.every((l) => (m === 'relaxed' ? / · no clock$/ : / · \d min$/).test(l)), `${m}: the level labels say ${m === 'relaxed' ? 'no clock' : 'their minutes'}`, s.levels);
    t.check(s.palette === (m === 'mystery') && s.deal === (m !== 'mystery'), `${m}: the palette list ${m === 'mystery' ? 'steps aside for Deal again' : 'shows, Deal again hidden'}`, s);
    if (m === 'mystery') {
      const hands = [await dots(page)];
      for (let i = 0; i < 3; i++) { await click(page, '#gameDeal'); await ready(page); hands.push(await dots(page)); }
      t.check(hands.every((h) => h.length === 4 && h[0] === 'Titanium White'), 'Mystery: white and three paints', hands);
      t.check(new Set(hands.map((h) => h.join('|'))).size >= 2, 'Deal again deals another hand', hands);
      t.check(/^Dealt at random: white and three paints\. 4 paints, which mix \d+ of its \d+ colors closely\./.test(s.hint), 'Mystery: the hint says the hand was dealt at random', s.hint);
    }
  }
  await clean(t, page, 'modes');

  // My paints with 0, 1 and 2 ticks (the list is read again each time the tab opens)
  for (const [label, mine, want] of [['0 ticks', [], false], ['1 tick', ['TW'], false], ['2 ticks', ['TW', 'YO'], true], ['2 ticks, one unknown', ['TW', 'XX'], false], ['a tick twice', ['TW', 'TW', 'YO'], true]]) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [P + 'myPaints', J(mine)]);
    await tab(page, 'study'); await tab(page, 'game'); await ready(page);
    const options = await paletteOptions(page);
    const my = options.find((o) => o.value === 'mine');
    t.check(!!my === want && (!my || my.text.startsWith('My paints (2)')), `My paints with ${label}: ${want ? 'offered as My paints (2)' : 'not offered'}`, my || options.length);
  }
  await page.evaluate((k) => localStorage.removeItem(k), P + 'myPaints');
  await tab(page, 'study'); await tab(page, 'game'); await ready(page);

  // A painting: dealt, Another painting never the same twice in a row
  await click(page, '#gameFromPainting');
  t.check(await ready(page), 'A painting: the board is built and Start comes back');
  {
    const s = await page.evaluate(() => ({ name: document.getElementById('gamePaintingName').textContent, photoPane: document.getElementById('gameFromPhotoPane').hidden, saved: localStorage.getItem('portrait-value-studio.gameSubject'), id: localStorage.getItem('portrait-value-studio.gamePainting'), note: document.getElementById('gamePreviewNote').textContent, preview: [document.getElementById('gamePreview').width, document.getElementById('gamePreview').height] }));
    t.check(PAINTERS.test(s.name) && s.photoPane, 'the setup names the painter of the portrait dealt', s.name);
    t.check(s.saved === J({ kind: 'painting' }) && /^"[a-z]+-\d+"$/.test(s.id), 'the choice and the painting dealt are remembered (a painter and a seed, nothing else)', s);
    t.check(s.preview[0] <= 700 && s.preview[1] <= 700 && Math.max(s.preview[0], s.preview[1]) === 700, 'a painting board is 700 px on its long side', s.preview);
    const ids = [s.id];
    for (let i = 0; i < 6; i++) { await click(page, '#gameReroll'); ids.push(await storageGet(page, P + 'gamePainting')); }
    t.check(ids.every((id, i) => /^"[a-z]+-\d+"$/.test(id) && (i === 0 || id !== ids[i - 1])), 'Another painting six times: never the same portrait twice in a row', ids);
    t.check(await ready(page) && PAINTERS.test(await text(page, '#gamePaintingName')), 'after the deals the setup is ready and names the painter', await text(page, '#gamePaintingName'));
  }
  await click(page, '#gameFromPhoto'); await ready(page);
  await clean(t, page, 'paintings');

  // Simple mode: the game keeps every known palette; the Study's settings between games
  {
    await click(page, '[data-mode="simple"]'); await studyIdle(page); await ready(page);
    const simple = await paletteOptions(page);
    await click(page, '[data-mode="advanced"]'); await studyIdle(page); await ready(page);
    const advanced = await paletteOptions(page);
    t.check(simple.length === 10 && advanced.length === 10, 'Simple and Advanced: the game offers the same ten palettes', { simple: simple.length, advanced: advanced.length });
    t.note('Simple mode: the Study tab offers three palettes with a reason each and hides My paints, while the game\'s setup lists all ten (and My paints once two are ticked), as the README\'s game section says ("any of the known palettes").');
    const count0 = parseInt(await text(page, '#gamePreviewNote'));
    const bytes0 = await previewBytes(page);
    await tab(page, 'study'); await setRange(page, 'colors', 6); await studyIdle(page); await sleep(300);
    await tab(page, 'game'); await ready(page);
    t.check(parseInt(await text(page, '#gamePreviewNote')) === count0 && (await previewBytes(page)) === bytes0, 'Colors per value 6 on the Study tab: the game keeps its level\'s three per value (the same board)', { count0, now: await text(page, '#gamePreviewNote') });
    await tab(page, 'study'); await setRange(page, 'lean', 0); await studyIdle(page); await sleep(300);
    await tab(page, 'game'); await ready(page);
    t.check((await previewBytes(page)) !== bytes0, 'the lighter-tones lean at Off rebuilds the board (the hint says it applies to the game)', { bytes0, now: await previewBytes(page) });
    await tab(page, 'study'); await setRange(page, 'lean', 60); await setRange(page, 'colors', 3); await studyIdle(page); await sleep(300);
    await tab(page, 'game'); await ready(page);
    t.check((await previewBytes(page)) === bytes0 && parseInt(await text(page, '#gamePreviewNote')) === count0, 'the settings put back give the same board again', { bytes0, now: await previewBytes(page) });
  }
  await clean(t, page, 'study settings');

  // ================= B. a game on a desktop: paints, amounts, copy, next, the board =================
  await page.selectOption('#gamePalette', 'zorn'); await ready(page);
  t.check(await start(page), 'Start painting opens the game');
  {
    const g = await page.evaluate(() => ({ timer: document.getElementById('gameTimer').textContent, label: document.getElementById('gameTimer').getAttribute('aria-label'), progress: document.getElementById('gameProgress').textContent, paints: [...document.querySelectorAll('#gamePaints .game-paint-code')].map((e) => e.textContent), numbers: document.querySelectorAll('#gameNumbers .game-number').length, next: !!document.querySelector('#gameNumbers .game-next'), title: document.getElementById('gameMixTitle').textContent, parts: document.getElementById('gameMixParts').textContent, undo: document.getElementById('gameUndo').disabled, clear: document.getElementById('gameClear').disabled, copy: document.getElementById('gameCopy').disabled, amount: document.getElementById('gameAmountOut').textContent, lock: document.getElementById('gameLock').textContent, focus: document.activeElement.id, setup: document.getElementById('gameSetup').hidden, saved: [localStorage.getItem('portrait-value-studio.gamePalette'), localStorage.getItem('portrait-value-studio.gameLevel')], pressed: document.querySelector('.game-number[data-number="0"]').getAttribute('aria-pressed') }));
    t.check(g.timer === '5:00' && g.label === 'Time left' && g.progress === `0 of ${g.numbers} numbers painted`, 'the bar shows 5:00 and 0 painted', g);
    t.check(JSON.stringify(g.paints) === JSON.stringify(['TW', 'YO', 'CRL', 'IB']) && g.numbers === counts.medium && g.next, 'Zorn\'s four paints, the numbers and Next ▸', g);
    t.check(g.title === 'Number 1' && g.pressed === 'true' && g.parts === EMPTY && g.undo && g.clear && g.copy, 'number 1 is chosen with an empty mix: Undo, Clear and Copy mix are off', g);
    t.check(g.amount === '1 part per tap' && g.lock === 'Lock in portrait' && g.focus === 'gameLock' && g.setup, 'one part per tap, Lock in portrait focused, the setup gone', g);
    t.check(JSON.stringify(g.saved) === JSON.stringify(['"zorn"', '"medium"']), 'the palette and level are remembered at the start', g.saved);
  }
  // every amount per tap, and the amount remembered
  for (const [i, out, parts] of [[0, '¼ part per tap', 'TW ¼'], [1, '½ part per tap', 'TW ¾'], [2, '1 part per tap', 'TW 1¾'], [3, '2 parts per tap', 'TW 3¾'], [4, '4 parts per tap', 'TW 7¾']]) {
    const said = await setAmount(page, i); await tapPaint(page, 'TW');
    t.check(said === out && (await mix(page)) === parts && (await storageGet(page, P + 'gameAmount')) === String([0.25, 0.5, 1, 2, 4][i]), `amount ${out}: one tap adds it (mix ${parts}), remembered`, { said, mix: await mix(page), saved: await storageGet(page, P + 'gameAmount') });
  }
  t.check((await progress(page)) === `1 of ${counts.medium} numbers painted` && (await numberLabel(page, 0)) === 'Number 1, painted', 'a mix counts the number as painted', [await progress(page), await numberLabel(page, 0)]);
  // the 60-part cap
  await click(page, '#gameClear'); await setAmount(page, 4); await tapPaint(page, 'YO', 15);
  t.check((await mix(page)) === 'YO 60', 'fifteen taps of 4 parts fill the mix to 60', await mix(page));
  await resetToast(page); await tapPaint(page, 'YO');
  t.check((await mix(page)) === 'YO 60' && (await toast(page)) === 'A mix holds up to 60 parts', 'a 61st part is refused with the cap named', await toast(page));
  await setAmount(page, 0); await resetToast(page); await tapPaint(page, 'CRL');
  t.check((await mix(page)) === 'YO 60' && (await toast(page)) === 'A mix holds up to 60 parts', 'a quarter part over 60 is refused too', await toast(page));
  await click(page, '#gameUndo');
  t.check((await mix(page)) === 'YO 56', 'Undo takes back the last 4-part tap', await mix(page));
  await click(page, '#gameClear');
  t.check((await mix(page)) === EMPTY && (await page.evaluate(() => [document.getElementById('gameUndo').disabled, document.getElementById('gameClear').disabled, document.getElementById('gameCopy').disabled])).every(Boolean), 'Clear empties the mix and the three buttons go off', await mix(page));
  await click(page, '#gameQuickUndo'); await click(page, '#gameUndo').catch(() => null);
  t.check((await mix(page)) === EMPTY && (await progress(page)) === `0 of ${counts.medium} numbers painted`, 'Undo and the quick undo on an empty mix do nothing', [await mix(page), await progress(page)]);
  // keyboard: Enter and Space on a paint
  await page.focus('#gamePaints .game-paint[data-index="0"]'); await page.keyboard.press('Enter');
  t.check((await mix(page)) === 'TW ¼', 'Enter on a focused paint adds a part', await mix(page));
  await page.keyboard.press('Space');
  t.check((await mix(page)) === 'TW ½', 'Space adds another', await mix(page));
  // the mouse: a hold keeps adding, a double tap adds two
  await setAmount(page, 2); await click(page, '#gameClear');
  {
    const c = await centerOf(page, '#gamePaints .game-paint[data-index="3"]');
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await sleep(1500); await page.mouse.up();
    const held = parseInt((await mix(page)).replace('IB ', ''));
    t.check(/^IB \d+$/.test(await mix(page)) && held >= 3, 'holding a paint for 1.5 s keeps adding parts', await mix(page));
    await page.mouse.dblclick(c.x, c.y);
    t.check((await mix(page)) === `IB ${held + 2}`, 'a double tap adds two parts', await mix(page));
    await click(page, '#gameClear');
  }
  // tapping the board chooses a number
  {
    await click(page, '.game-number[data-number="3"]');
    t.check((await title(page)) === 'Number 4' && (await numberLabel(page, 3)) === 'Number 4, not painted yet', 'a number button chooses its number', await title(page));
    await page.evaluate(() => window.scrollTo(0, 0));
    const wp = await washPoint(page);
    await click(page, '.game-number[data-number="0"]');
    t.check(!!wp, 'the chosen number\'s shapes show its wash on the board');
    if (wp) { await page.mouse.click(wp.x, wp.y); t.check((await title(page)) === 'Number 4', 'tapping one of its shapes on the board chooses number 4', await title(page)); }
    await click(page, '.game-number[data-number="0"]');
  }
  // Copy mix: by buttons and by a shape, Done, Esc, the original number
  await tapPaint(page, 'TW', 3); await tapPaint(page, 'YO', 1);
  await click(page, '#gameCopy');
  {
    const s = await page.evaluate(() => ({ bar: !document.getElementById('gameCopyBar').hidden, text: document.getElementById('gameCopyText').textContent, btn: document.getElementById('gameCopy').textContent, pressed: document.getElementById('gameCopy').getAttribute('aria-pressed'), cls: document.getElementById('gamePlay').classList.contains('is-copying') }));
    t.check(s.bar && s.text === 'Copying number 1. Tap the numbers or shapes to paste its mix into.' && s.btn === 'Stop copying' && s.pressed === 'true' && s.cls, 'Copy mix: the bar says what to tap and the button reads Stop copying', s);
    await resetToast(page); await click(page, '.game-number[data-number="1"]');
    t.check((await toast(page)) === 'Number 1’s mix pasted into number 2' && (await numberLabel(page, 1)) === 'Number 2, painted' && (await title(page)) === 'Number 1', 'a number button pastes the mix, part for part, and number 1 stays chosen', [await toast(page), await numberLabel(page, 1), await title(page)]);
    await click(page, '.game-number[data-number="2"]');
    t.check((await numberLabel(page, 2)) === 'Number 3, painted' && (await title(page)) === 'Number 1', 'a second number gets the mix too', await numberLabel(page, 2));
    await resetToast(page); await click(page, '.game-next');
    t.check((await toast(page)) === 'Finish copying first' && (await title(page)) === 'Number 1', 'Next ▸ while copying is refused', await toast(page));
    await click(page, '#gameCopyDone');
    t.check(await page.evaluate(() => document.getElementById('gameCopyBar').hidden && document.getElementById('gameCopy').textContent === 'Copy mix' && !document.getElementById('gamePlay').classList.contains('is-copying')), 'Done ends the copy');
    await click(page, '#gameCopy'); await page.keyboard.press('Escape');
    t.check(await page.evaluate(() => document.getElementById('gameCopyBar').hidden && document.getElementById('gameCopy').textContent === 'Copy mix'), 'Esc ends the copy');
    await click(page, '#gameCopy'); await click(page, '.game-number[data-number="0"]');
    t.check(await page.evaluate(() => document.getElementById('gameCopyBar').hidden && document.getElementById('gameCopy').textContent === 'Copy mix'), 'tapping the original number again ends the copy');
    await click(page, '.game-number[data-number="1"]'); await click(page, '#gameUndo');
    t.check((await mix(page)) === 'TW 3' && (await page.evaluate(() => { const b = document.querySelector('.game-number[data-number="0"]'); return b.style.getPropertyValue('--fill'); })) !== '', 'a pasted copy can be changed on its own (number 2 lost a part, number 1 kept its fill)', await mix(page));
    await tapPaint(page, 'YO', 1);
  }
  // Next ▸ to the end and its nudge
  {
    await click(page, '.game-number[data-number="0"]');
    const seen = [];
    for (let i = 0; i < counts.medium + 1; i++) {
      await resetToast(page); await click(page, '.game-next');
      const now = await title(page); const said = await toast(page);
      if (said) { seen.push(said); break; }
      seen.push(now); await tapPaint(page, 'TW');
    }
    const want = Array.from({ length: counts.medium - 3 }, (_, i) => `Number ${i + 4}`).concat(['Every number has a mix. Lock in when you are ready.']);
    t.check(JSON.stringify(seen) === JSON.stringify(want), 'Next ▸ walks the unpainted numbers in order and then says every number has a mix', seen);
    t.check(await page.evaluate(() => document.getElementById('gameLock').classList.contains('is-nudge')), 'Lock in portrait is nudged when none are left');
    t.check((await progress(page)) === `${counts.medium} of ${counts.medium} numbers painted`, 'every number is painted', await progress(page));
  }
  // the speaker, Photo/Blocks and hiding the reference
  {
    await click(page, '#gameSound');
    t.check((await page.evaluate(() => [document.getElementById('gameSound').getAttribute('aria-pressed'), document.getElementById('gameSound').title, localStorage.getItem('portrait-value-studio.gameSound')])).join() === 'false,Sound and vibration off,false', 'the speaker turns sound and vibration off and remembers it');
    await click(page, '#gameSound');
    t.check((await page.evaluate(() => [document.getElementById('gameSound').getAttribute('aria-pressed'), localStorage.getItem('portrait-value-studio.gameSound')])).join() === 'true,true', 'and on again');
    const distinct = () => page.evaluate(() => { const c = document.getElementById('gameRef'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return s.size; });
    const photoColors = await distinct();
    await click(page, '#tab-game [data-ref-view="blocks"]');
    const s = await page.evaluate(() => ({ label: document.getElementById('gameRef').getAttribute('aria-label'), pressed: document.querySelector('#tab-game [data-ref-view="blocks"]').getAttribute('aria-pressed'), saved: localStorage.getItem('portrait-value-studio.gameRefView') }));
    t.check(s.label === 'The reference as a color-block study' && s.pressed === 'true' && s.saved === '"blocks"' && (await distinct()) <= counts.medium + 1 && photoColors > 100, 'Blocks shows the flat colors to match (one per number) and is remembered', { ...s, blocks: await distinct(), photoColors });
    await click(page, '#tab-game [data-ref-view="photo"]');
    t.check((await distinct()) === photoColors, 'Photo shows the photo again');
    await click(page, '#gameRefToggle');
    t.check(await page.evaluate(() => document.getElementById('gameRefFig').classList.contains('is-collapsed') && document.getElementById('gameRefToggle').getAttribute('aria-expanded') === 'false' && getComputedStyle(document.getElementById('gameRefToggle'), '::after').content === '" · show"'), 'Reference · hide collapses it and offers show');
    await click(page, '#gameRefToggle');
    t.check(await page.evaluate(() => !document.getElementById('gameRefFig').classList.contains('is-collapsed') && document.getElementById('gameRefToggle').getAttribute('aria-expanded') === 'true'), 'and show brings it back');
  }
  // ✕: once arms, a second tap after the window arms again, twice quits
  {
    await resetToast(page); await click(page, '#gameQuit');
    t.check((await toast(page)) === 'Tap ✕ again to quit this game' && await visible(page, '#gamePlay'), 'one tap on ✕ asks for another', await toast(page));
    await sleep(3300); await resetToast(page); await click(page, '#gameQuit');
    t.check((await toast(page)) === 'Tap ✕ again to quit this game' && await visible(page, '#gamePlay'), 'a tap after three seconds only arms again (still playing)', await toast(page));
    await click(page, '#gameQuit');
    t.check(await ready(page) && await visible(page, '#gameSetup') && !(await visible(page, '#gamePlay')), 'the second tap quits to the setup');
    t.check((await text(page, '#gameBest')) === '', 'a quit game leaves no best', await text(page, '#gameBest'));
  }
  await clean(t, page, 'a game');

  // ================= C. scoring: nothing painted, every number painted, a perfect game, the result's tools =================
  await start(page);
  await lockIn(page);
  {
    const s = await popup(page); const b = await breakdown(page); const saved = await bests(page);
    t.check(s.shown && s.kicker === 'Portrait locked in' && s.pct === '0' && s.grade === 'Keep mixing' && s.stars === 0 && s.starsLabel === '0 out of 5 stars, 0% color match' && s.points === '0', 'Lock in with nothing painted: 0%, no stars, Keep mixing, 0 points', s);
    t.check(s.focus === 'gameAnalyze', 'the pop-up focuses Analyze', s.focus);
    t.check(b['Color accuracy'] === '0% · 0' && /^(5:00|4:5\d) · \+0 \(some numbers unpainted\)$/.test(b['Time left']) && b.Mode === 'Classic' && b.Palette === 'Zorn', 'the breakdown says no bonus because numbers are unpainted', b);
    t.check(saved['sample-study:600x750|medium|zorn'] === 0, 'the first game is kept, at 0, so the next has something to beat', saved);
    t.check(!s.newBest, 'no New best! on a first game with nothing painted (0 points)', s.newBest);
    if (s.newBest) t.finding({ title: '"New best!" flashes on a first game with nothing painted (0 points)', severity: 'low', steps: '1. Open Games → Paint by numbers on a fresh browser. 2. Start painting and press Lock in portrait at once, with no number mixed. 3. Close the score and press Change settings.', expected: 'The README says New best! flashes "when you beat your score": with no score to beat and nothing scored, no New best! (or, if 0 counts as a best, the setup reporting it).', actual: 'The pop-up shows 0% / 0 points with "New best!" flashing and 0 is stored as the best, yet the setup then shows no best line at all (a stored 0 reads as none), so the best celebrated is one the setup never reports; a second 0 is not a New best. Cause: js/game.js 1299–1300, `const was = bestOfKey(bests, game.bestKey); const isBest = !was || points > was`: no best yet counts as beaten whatever the points, 1345 shows the badge from it, and 524–525 show a best only when it is truthy, so a stored 0 is never reported.' });
    await click(page, '#gameAnalyze');
    t.check(await visible(page, '#gameAnalysis') && (await text(page, '#gameAnalyze')) === 'Hide analysis' && (await page.evaluate(() => document.getElementById('gameAnalyze').getAttribute('aria-expanded'))) === 'true', 'Analyze opens the details and reads Hide analysis');
    const z = await zones(page);
    t.check(z.length === counts.medium && z.every((r) => r.match === 'Not painted' && /^Mix: /.test(r.tip) && r.yours === ''), 'every number is listed Not painted, with the recipe its color was mixed from', z.slice(0, 3));
    await click(page, '#gameAnalyze');
    t.check(!(await visible(page, '#gameAnalysis')) && (await text(page, '#gameAnalyze')) === 'Analyze', 'Hide analysis closes it');
  }
  await toSetup(page);
  t.check((await text(page, '#gameBest')) === '', 'the setup shows no best line for the stored 0 (game.js 523 shows a best only when it is truthy)', await text(page, '#gameBest'));
  // every number painted with one mix: the bonus, the order of the analysis
  await start(page);
  let recipes;
  {
    await setAmount(page, 2); await tapPaint(page, 'TW', 2); await tapPaint(page, 'YO', 1);
    await click(page, '#gameCopy');
    for (let k = 1; k < counts.medium; k++) await click(page, `.game-number[data-number="${k}"]`);
    await click(page, '#gameCopyDone');
    await lockIn(page);
    const b = await breakdown(page); const s = await popup(page);
    const acc = parseInt(b['Color accuracy']); const colorPts = +b['Color accuracy'].split(' · ')[1]; const bonus = +(/\+(\d+)/.exec(b['Time left']) || [, 'x'])[1];
    const left = (/^(\d+):(\d\d)/.exec(b['Time left']) || []).slice(1).reduce((m, v) => m * 60 + +v, 0);
    t.check(Number.isFinite(bonus) && left >= 290 && Math.abs(bonus - 200 * (left / 300) * (acc / 100)) <= 4 && +s.points === colorPts + bonus, 'every number painted: the time left adds up to 200 scaled by the accuracy, and the points add up', { b, points: s.points });
    t.check(s.newBest && (await bests(page))['sample-study:600x750|medium|zorn'] === +s.points, 'a better score is the new best and is stored', await bests(page));
    await click(page, '#gameAnalyze');
    const z = await zones(page);
    const pcts = z.map((r) => parseInt(r.match));
    t.check(pcts.every((p, i) => !i || p >= pcts[i - 1]) && z.every((r) => /^You: TW 2 · YO 1$/.test(r.yours)), 'the analysis lists every number from furthest off to closest, with your recipe', pcts);
    t.check(z.every((r) => r.note === 'spot on' || /^(too (light|dark) by \d+\.\d value|too (warm|cool)|too (strong|gray))(, (too (warm|cool)|too (strong|gray)))*$/.test(r.note)), 'each number says what was wrong in plain words', z.map((r) => r.note));
    recipes = z.map((r) => ({ k: r.n - 1, recipe: parseRecipe(r.tip) }));
    t.check(recipes.every((r) => r.recipe.length && r.recipe.every((x) => ['TW', 'YO', 'CRL', 'IB'].includes(x.code) && x.parts > 0) && r.recipe.reduce((s, x) => s + x.parts, 0) <= 60), 'every recipe uses the palette\'s paints in quarter parts, within the 60 a mix holds', recipes.map((r) => r.recipe));
  }
  // a perfect game: every number mixed to its recipe → Spot on each time, 100%, five stars
  await click(page, '#gamePopup [data-game="again"]');
  t.check(await page.evaluate(() => document.getElementById('againDialog').open && document.getElementById('againSame').textContent === 'Same photo' && document.getElementById('againNew').textContent === 'New photo' && document.getElementById('againHint').textContent === 'Try the same photo again, or load a new one?' && document.activeElement.id === 'againSame'), 'Play again asks: the same photo or a new one, Same photo focused');
  await click(page, '#againCancel');
  t.check(await page.evaluate(() => !document.getElementById('againDialog').open) && await visible(page, '#gameResult'), 'Cancel keeps the result');
  await click(page, '#gamePopup [data-game="again"]'); await click(page, '#againSame');
  t.check(await playing(page) && (await progress(page)) === `0 of ${counts.medium} numbers painted`, 'Same photo starts a fresh game on the same board');
  {
    let spots = 0;
    for (const { k, recipe } of recipes) {
      await click(page, `.game-number[data-number="${k}"]`); await page.evaluate(() => { document.getElementById('gameSpot').textContent = ''; });
      await mixExact(page, recipe);
      if ((await text(page, '#gameSpot')) === `Spot on! Number ${k + 1}` && await page.evaluate((k) => document.querySelector(`.game-number[data-number="${k}"]`).classList.contains('is-spot') && document.getElementById('gameMixChip').classList.contains('is-spot'), k)) spots++;
    }
    t.check(spots === counts.medium, 'each number mixed to its recipe gets the Spot on! badge on its number and the mix chip', spots);
    await resetToast(page); await click(page, '.game-next');
    t.check((await toast(page)) === 'Every number has a mix. Lock in when you are ready.', 'Next ▸ nudges Lock in once all are mixed');
    await lockIn(page);
    t.check(await countedUp(page, 100), 'the match counts up to 100');
    const s = await popup(page); const b = await breakdown(page);
    t.check(s.grade === 'Master colorist!' && s.stars === 5 && s.starsLabel === '5 out of 5 stars, 100% color match' && s.newBest, 'a perfect game: five stars, Master colorist!, New best!', s);
    t.check(b['Color accuracy'] === '100% · 1000' && /^(5:00|4:5\d) · \+(19\d|200)$/.test(b['Time left']) && +s.points === 1000 + +(/\+(\d+)/.exec(b['Time left']) || [])[1], 'the score is 1,000 for the colors plus nearly the whole 200 for the time', { b, points: s.points });
    await click(page, '#gameAnalyze');
    const z = await zones(page);
    t.check(z.every((r) => r.match === '100% match' && r.note === 'spot on' && r.yours === 'You: ' + r.tip.replace('Mix: ', '')), 'every number reads 100% match, spot on, your recipe the target\'s', z.map((r) => r.match + ' ' + r.note));
    await click(page, '#gameAnalyze');
  }
  // Share card, × and Show score, Compare with target by drag and keys
  {
    const dl = await download(page, () => click(page, '#gamePopup [data-game="share"]'));
    t.check(dl && dl.name === 'portrait-value-studio-100pct.png' && dl.png && dl.w === 1080 && dl.h === 1350 && dl.bytes > 20000, 'Share card without a share sheet saves a 1080 × 1350 PNG named with the score', dl);
    await click(page, '#gamePopupClose');
    t.check(!(await visible(page, '#gamePopup')) && await visible(page, '#gameShowBar') && (await page.evaluate(() => document.activeElement.id)) === 'gameShowScore', '× hides the score and shows the Show score bar, focused');
    await page.locator('#gameFinalWrap').scrollIntoViewIfNeeded();
    await click(page, '#gameCompare');
    const settled = await page.waitForFunction(() => document.getElementById('gameFinalWrap').style.getPropertyValue('--cut') === '50%', null, { timeout: 3000 }).then(() => true).catch(() => false);
    t.check(settled && await page.evaluate(() => document.getElementById('gameFinalWrap').classList.contains('is-comparing') && document.getElementById('gameCompare').textContent === 'Stop comparing' && document.getElementById('gameCompare').getAttribute('aria-pressed') === 'true'), 'Compare with target wipes the target in and rests the divider at 50', await cut(page));
    const fw = await page.locator('#gameFinalWrap').boundingBox();
    await page.mouse.move(fw.x + fw.width * 0.2, fw.y + fw.height / 2); await page.mouse.down(); await page.mouse.move(fw.x + fw.width * 0.8, fw.y + fw.height / 2, { steps: 5 });
    const mid = await cut(page);
    await page.mouse.move(fw.x + fw.width * 0.3, fw.y + fw.height / 2, { steps: 3 }); await page.mouse.up();
    const end = await cut(page);
    await page.mouse.move(fw.x + fw.width * 0.9, fw.y + fw.height / 2);
    t.check(mid === '80' && end === '30' && (await cut(page)) === '30', 'the divider follows a drag and stays where it was let go', { mid, end, after: await cut(page) });
    await page.focus('#gameFinalHandle');
    await page.keyboard.press('ArrowLeft'); const l = await cut(page);
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight'); const r = await cut(page);
    await page.keyboard.press('Home'); const h = await cut(page); await page.keyboard.press('End'); const e = await cut(page);
    t.check(l === '25' && r === '100' && h === '0' && e === '100', 'the arrow keys move the divider by 5, stopping at the ends; Home and End go to them', { l, r, h, e });
    await click(page, '#gameCompare');
    t.check(await page.evaluate(() => !document.getElementById('gameFinalWrap').classList.contains('is-comparing') && document.getElementById('gameCompare').textContent === 'Compare with target'), 'Stop comparing');
    await click(page, '#gameShowScore');
    t.check(await visible(page, '#gamePopup') && !(await visible(page, '#gameShowBar')), 'Show score brings the pop-up back');
  }
  await clean(t, page, 'scoring');

  // ================= D. the modes in play =================
  // Relaxed: a stopwatch, no bonus, a best of its own
  await toSetup(page);
  await page.selectOption('#gameMode', 'relaxed'); await ready(page);
  await start(page);
  {
    const t0 = await page.evaluate(() => [document.getElementById('gameTimer').textContent, document.getElementById('gameTimer').getAttribute('aria-label')]);
    const moved = await page.waitForFunction(() => document.getElementById('gameTimer').textContent !== '0:00', null, { timeout: 4000 }).then(() => true).catch(() => false);
    t.check(t0[0] === '0:00' && t0[1] === 'Time taken' && moved, 'Relaxed: the timer counts up from 0:00 as a stopwatch', { t0, now: await text(page, '#gameTimer') });
    await mixExact(page, recipes.find((r) => r.k === 0).recipe); // number 1 spot on: some points
    await lockIn(page);
    const b = await breakdown(page);
    t.check(b.Mode === 'Relaxed' && /^0:\d\d · \+0 \(no clock\)$/.test(b['Time taken']) && !('Time left' in b) && +(await popup(page)).points > 0 && +(await popup(page)).points === +b['Color accuracy'].split(' · ')[1], 'Relaxed: the breakdown shows the time taken and no bonus; the score is the colors alone', b);
    t.check('sample-study:600x750|medium|zorn|relaxed' in await bests(page), 'the best is kept per mode (…|relaxed)', Object.keys(await bests(page)));
  }
  await toSetup(page);
  t.check((await text(page, '#gameBest')) === 'Your best on this portrait at this level in Relaxed mode: ' + (await bests(page))['sample-study:600x750|medium|zorn|relaxed'] + ' points', 'the setup names the mode of the best shown', await text(page, '#gameBest'));
  // Memory: the look, Ready, painting refused, Peek ×4, no time to peek, the look ending by itself
  await page.selectOption('#gameMode', 'memory'); await ready(page);
  await start(page);
  {
    const s = await page.evaluate(() => ({ lock: document.getElementById('gameLock').textContent, toggle: document.getElementById('gameRefToggle').textContent, timer: document.getElementById('gameTimer').textContent, label: document.getElementById('gameTimer').getAttribute('aria-label'), progress: document.getElementById('gameProgress').textContent, looking: document.getElementById('gamePlay').classList.contains('is-looking'), next: document.querySelector('.game-next').disabled, paints: getComputedStyle(document.getElementById('gamePaints')).pointerEvents, collapsed: document.getElementById('gameRefFig').classList.contains('is-collapsed') }));
    t.check(s.lock === 'Ready: hide it' && s.toggle === 'Memorize this' && s.timer === '0:10' && s.label === 'Time left to memorize' && s.progress === 'Memorize the colors. The reference hides soon.' && s.looking && s.next && s.paints === 'none' && !s.collapsed, 'Memory: ten seconds to memorize, the reference shown, the paints and Next ▸ off', s);
    await tapPaint(page, 'TW');
    t.check((await mix(page)) === EMPTY, 'painting during the look is refused', await mix(page));
    await click(page, '#gameLock');
    const r = await page.evaluate(() => ({ lock: document.getElementById('gameLock').textContent, toggle: document.getElementById('gameRefToggle').textContent, timer: document.getElementById('gameTimer').textContent, collapsed: document.getElementById('gameRefFig').classList.contains('is-collapsed'), toast: document.getElementById('toast').textContent, expanded: document.getElementById('gameRefToggle').getAttribute('aria-expanded') }));
    t.check(r.lock === 'Lock in portrait' && r.toggle === 'Peek · 3 left (−10 s)' && r.timer === '5:00' && r.collapsed && r.expanded === 'false' && r.toast === 'The reference is hidden. Paint from memory.', 'Ready hides the reference, starts the clock at 5:00 and offers three peeks', r);
    const peeks = [];
    for (let i = 0; i < 4; i++) {
      await resetToast(page); await click(page, '#gameRefToggle');
      peeks.push(await page.evaluate(() => ({ toggle: document.getElementById('gameRefToggle').textContent, timer: document.getElementById('gameTimer').textContent, shown: !document.getElementById('gameRefFig').classList.contains('is-collapsed'), toast: document.getElementById('toast').textContent })));
      if (i < 3) {
        await click(page, '#gameRefToggle'); // a second tap during the peek
        peeks[i].again = await page.evaluate(() => document.getElementById('gameRefToggle').textContent);
        peeks[i].hid = await page.waitForFunction(() => document.getElementById('gameRefFig').classList.contains('is-collapsed'), null, { timeout: 6000 }).then(() => true).catch(() => false);
        peeks[i].after = await text(page, '#gameRefToggle');
      }
    }
    t.check(peeks.slice(0, 3).every((p, i) => p.toggle === 'Peeking…' && p.shown && p.hid && p.again === 'Peeking…' && p.after === (i < 2 ? `Peek · ${2 - i} left (−10 s)` : 'No peeks left')), 'three peeks each show the reference for a moment and hide it again, counting down', peeks);
    t.check(peeks[0].timer === '4:50' && peeks[1].timer <= '4:40' && peeks[2].timer <= '4:30', 'each peek costs ten seconds on the clock', peeks.map((p) => p.timer));
    t.check(peeks[3].toggle === 'No peeks left' && !peeks[3].shown && peeks[3].toast === 'No peeks left', 'the fourth peek is refused and says so', peeks[3]);
    t.note('a tap on Peek while a peek is showing is ignored without a word (game.js peek(): `if (game.peeking) return;`).');
    // the clock near its end: no time to peek; then it runs out (the clock is moved ahead, not waited for)
    await jumpTo(page, 25);
    await page.waitForFunction(() => document.getElementById('gameTimer').classList.contains('is-low'), null, { timeout: 3000 }).catch(() => null);
    t.check(await page.evaluate(() => document.getElementById('gameTimer').classList.contains('is-low')) && /^0:2\d$/.test(await text(page, '#gameTimer')), 'under thirty seconds the timer turns low', await text(page, '#gameTimer'));
    await lockIn(page); await toSetup(page);
    await start(page); await jumpClock(page, 10500);
    const ended = await page.waitForFunction(() => document.getElementById('gameLock').textContent === 'Lock in portrait', null, { timeout: 3000 }).then(() => true).catch(() => false);
    t.check(ended && (await toast(page)) === 'The reference is hidden. Paint from memory.' && (await text(page, '#gameTimer')) === '5:00', 'the look ends by itself after ten seconds, with the clock untouched', [await toast(page), await text(page, '#gameTimer')]);
    await jumpTo(page, 8);
    await page.waitForFunction(() => document.getElementById('gameTimer').classList.contains('is-low'), null, { timeout: 3000 }).catch(() => null);
    await resetToast(page); await click(page, '#gameRefToggle');
    t.check((await toast(page)) === 'Not enough time left to peek' && (await text(page, '#gameRefToggle')) === 'Peek · 3 left (−10 s)', 'with under ten seconds left a peek is refused and no peek is spent', [await toast(page), await text(page, '#gameRefToggle')]);
    await jumpClock(page, 10000);
    t.check(await scored(page) && (await popup(page)).kicker === 'Time’s up!', 'when the clock runs out the portrait locks in by itself and the pop-up says Time’s up!', (await popup(page)).kicker);
  }
  await toSetup(page);
  // Value first: the slider stage, Clear, Next, Done, the greys under the color, the split score
  await page.selectOption('#gameMode', 'value'); await ready(page);
  await start(page);
  {
    const s = await page.evaluate(() => ({ lock: document.getElementById('gameLock').textContent, stage: !document.getElementById('gameValue').hidden && document.getElementById('gamePlay').classList.contains('is-valuing'), gray: document.getElementById('gameRefFig').classList.contains('is-gray'), title: document.getElementById('gameValueTitle').textContent, text: document.getElementById('gameValueText').textContent, clear: document.getElementById('gameValueClear').disabled, progress: document.getElementById('gameProgress').textContent, mixHead: getComputedStyle(document.querySelector('.game-mix-head')).display, slider: document.getElementById('gameValueRange').value }));
    t.check(s.lock === 'Done with values' && s.stage && s.gray && s.title === 'Number 1' && s.text === 'Not set: slide to set its value' && s.clear && s.progress === `0 of ${counts.medium} values set` && s.mixHead === 'none' && s.slider === '50', 'Value first: the reference in grey, a slider for number 1, the paints out of sight', s);
    await setRange(page, 'gameValueRange', 0);
    t.check((await text(page, '#gameValueText')) === 'Value 0.0' && (await page.evaluate(() => document.getElementById('gameValueChip').style.background)) === 'rgb(0, 0, 0)', 'the slider at its left end sets black (value 0.0)', await text(page, '#gameValueText'));
    await setRange(page, 'gameValueRange', 100);
    t.check((await text(page, '#gameValueText')) === 'Value 10.0' && (await page.evaluate(() => document.getElementById('gameValueChip').style.background)) === 'rgb(255, 255, 255)', 'and at its right end white (value 10.0)', await text(page, '#gameValueText'));
    await setRange(page, 'gameValueRange', 50);
    t.check((await text(page, '#gameValueText')) === 'Value 5.0' && (await numberLabel(page, 0)) === 'Number 1, value set' && (await progress(page)) === `1 of ${counts.medium} values set` && !(await page.evaluate(() => document.getElementById('gameValueClear').disabled)), 'a value set counts and the number says so', [await numberLabel(page, 0), await progress(page)]);
    await tapPaint(page, 'TW');
    t.check((await mix(page)) === EMPTY, 'a paint tapped in the value stage adds nothing', await mix(page));
    await click(page, '#gameValueClear');
    t.check((await text(page, '#gameValueText')) === 'Not set: slide to set its value' && (await progress(page)) === `0 of ${counts.medium} values set`, 'Clear unsets the value', await progress(page));
    for (let k = 0; k < counts.medium; k++) { await click(page, `.game-number[data-number="${k}"]`); await setRange(page, 'gameValueRange', 50); }
    await click(page, '.game-number[data-number="2"]'); await click(page, '#gameValueClear');
    await resetToast(page); await click(page, '.game-next');
    t.check((await text(page, '#gameValueTitle')) === 'Number 3' && !(await toast(page)), 'Next ▸ in the value stage goes to the number without a value', await text(page, '#gameValueTitle'));
    await setRange(page, 'gameValueRange', 50);
    await resetToast(page); await click(page, '.game-next');
    t.check((await toast(page)) === 'Every number has a value. Press Done with values.', 'with every value set Next ▸ points at Done with values', await toast(page));
    await click(page, '#gameLock');
    await page.waitForFunction(() => document.getElementById('gameLock').textContent === 'Lock in portrait', null, { timeout: 3000 }).catch(() => null);
    const greys = await page.evaluate(() => { const c = document.getElementById('gameCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let g = 0; for (let i = 0; i < d.length; i += 4 * 31) if (d[i] === d[i + 1] && d[i] === d[i + 2] && d[i] > 60 && d[i] < 200) g++; return g; });
    t.check((await toast(page)) === 'Values set. Now mix the colors over them.' && !(await page.evaluate(() => document.getElementById('gamePlay').classList.contains('is-valuing'))) && (await progress(page)) === `0 of ${counts.medium} numbers painted` && greys > 1000 && (await numberLabel(page, 0)) === 'Number 1, not painted yet', 'Done with values: the color stage, with the greys as an underpainting and nothing painted yet', { toast: await toast(page), greys });
    await tapPaint(page, 'TW', 2);
    await lockIn(page);
    const b = await breakdown(page); const s2 = await popup(page);
    const valuePts = +(/\+(\d+)/.exec(b['Value study']) || [])[1]; const colorPts = +b['Color accuracy'].split(' · ')[1];
    t.check(b.Mode === 'Value first' && /^\d+% · \+\d+$/.test(b['Value study']) && valuePts > 0 && valuePts <= 100 && colorPts <= 900 && +s2.points === valuePts + colorPts, 'Value first: the value study is worth up to 100 and the colors 900; the points add up', { b, points: s2.points });
  }
  await toSetup(page);
  // Classic: the clock runs out (moved ahead, not waited for)
  await page.selectOption('#gameMode', 'classic'); await ready(page);
  await start(page); await tapPaint(page, 'TW');
  await jumpTo(page, 29);
  await page.waitForFunction(() => document.getElementById('gameTimer').classList.contains('is-low'), null, { timeout: 3000 }).catch(() => null);
  t.check(/^0:(28|29|30)$/.test(await text(page, '#gameTimer')) && await page.evaluate(() => document.getElementById('gameTimer').classList.contains('is-low')), 'Classic: at thirty seconds the timer is low', await text(page, '#gameTimer'));
  await jumpClock(page, 40000);
  t.check(await scored(page) && (await popup(page)).kicker === 'Time’s up!' && (await breakdown(page))['Time left'] === '0:00 · +0 (some numbers unpainted)', 'Classic: the clock runs out and the portrait locks in with Time’s up!', await breakdown(page));
  t.note('The five-minute Classic clock (and Memory\'s) was not waited for: the page\'s performance.now was moved ahead to bring the clock to its end, which is all the timer reads.');
  await toSetup(page);
  await clean(t, page, 'modes');

  // ================= E. Play again on both paths; a photo loaded mid-game; Forget mid-game =================
  await click(page, '#gameFromPainting'); await ready(page);
  await start(page); await lockIn(page);
  {
    await click(page, '#gamePopup [data-game="again"]');
    t.check(await page.evaluate(() => document.getElementById('againSame').textContent === 'Same portrait' && document.getElementById('againNew').textContent === 'New portrait' && document.getElementById('againHint').textContent === 'Try the same portrait again, or take on a new one?'), 'for a painting Play again offers the same portrait or a new one');
    const before = await storageGet(page, P + 'gamePainting');
    await click(page, '#againNew');
    t.check(await playing(page) && (await storageGet(page, P + 'gamePainting')) !== before && await visible(page, '#gamePlay'), 'New portrait deals another and starts straight away', { before, now: await storageGet(page, P + 'gamePainting') });
    const dealt = await storageGet(page, P + 'gamePainting');
    await lockIn(page); await click(page, '#gamePopup [data-game="again"]'); await click(page, '#againSame');
    t.check(await playing(page) && (await storageGet(page, P + 'gamePainting')) === dealt, 'Same portrait plays the portrait again', await storageGet(page, P + 'gamePainting'));
    await lockIn(page);
  }
  await toSetup(page);
  // a photo: New photo opens the file picker and the setup shows the photo chosen
  await click(page, '#gameFromPhoto'); await ready(page);
  await start(page); await lockIn(page);
  {
    await click(page, '#gamePopup [data-game="again"]');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), click(page, '#againNew')]);
    t.check(!!chooser && await visible(page, '#gameSetup') && !(await visible(page, '#gameResult')), 'New photo goes back to the setup and opens the file picker', !!chooser);
    if (chooser) await chooser.setFiles(await makeImage(page, { width: 400, height: 500, name: 'mine.png' }));
    const named = await page.waitForFunction(() => document.getElementById('gamePhotoName').textContent === 'Painting from mine.', null, { timeout: 15000 }).then(() => true).catch(() => false);
    t.check(named && await ready(page) && (await page.evaluate(() => [document.getElementById('gamePreview').width, document.getElementById('gamePreview').height])).join('x') === '400x500', 'the setup shows the new photo\'s board and names it', [await text(page, '#gamePhotoName'), await previewBytes(page)]);
    // loading a photo from the painting pane means painting from it
    await click(page, '#gameFromPainting'); await ready(page);
    await loadPhoto(page, await makeImage(page, { width: 320, height: 400, name: 'fromgame.png' }));
    t.check(await ready(page) && (await page.evaluate(() => document.querySelector('input[name="gameSubject"]:checked').value)) === 'photo' && (await text(page, '#gamePhotoName')) === 'Painting from fromgame.', 'a photo loaded while A painting is chosen switches the setup to My photo', await text(page, '#gamePhotoName'));
  }
  // a new Study photo loaded mid-game: the game keeps its board; the best goes under the photo it was played on;
  // Play again → Same photo then plays the photo loaded since
  {
    let onNew = 0, wrongKey = 0;
    for (const [i, size] of [[1, [300, 420]], [2, [360, 360]]]) {
      await start(page);
      const keyBefore = await page.evaluate(() => Studio.sourceKey());
      const numbers = await numberCount(page);
      await tapPaint(page, await firstPaint(page), 2);
      await loadPhoto(page, await makeImage(page, { width: size[0], height: size[1], name: `later${i}.png` }));
      const during = await page.evaluate(() => ({ play: !document.getElementById('gamePlay').hidden, canvas: [document.getElementById('gameCanvas').width, document.getElementById('gameCanvas').height], ref: [document.getElementById('gameRef').width, document.getElementById('gameRef').height], key: Studio.sourceKey(), progress: document.getElementById('gameProgress').textContent }));
      t.check(during.play && during.key === `later${i}:${size[0]}x${size[1]}` && during.canvas.join('x') !== size.join('x') && during.ref.join('x') === during.canvas.join('x') && during.progress === `1 of ${numbers} numbers painted`, `photo ${i} loaded mid-game: the game goes on with its own board and reference`, during);
      await lockIn(page);
      t.check(Object.keys(await bests(page)).some((k) => k.startsWith(keyBefore + '|')) && !Object.keys(await bests(page)).some((k) => k.startsWith(during.key + '|')), `the best is kept under the photo the game was played on (${keyBefore})`, Object.keys(await bests(page)));
      await click(page, '#gamePopup [data-game="again"]');
      const hint = await text(page, '#againHint'); const btn = await text(page, '#againSame');
      t.check(btn === 'Same photo' && /changed since this game began/.test(hint) && /Same photo plays the one just played/.test(hint), 'Play again says the Study photo has changed and what each button plays', { hint, btn });
      await click(page, '#againSame'); await playing(page);
      const now = await page.evaluate(() => [document.getElementById('gameCanvas').width, document.getElementById('gameCanvas').height, Studio.sourceKey()]);
      if (now.slice(0, 2).join('x') === size.join('x')) onNew++;
      t.check(now.slice(0, 2).join('x') === during.canvas.join('x'), `"${btn}" after a photo was loaded mid-game plays the board just scored, not the photo loaded since (documented as a finding if not)`, { hint, btn, board: now, loadedSince: size });
      const keysBefore = Object.keys(await bests(page));
      await tapPaint(page, await firstPaint(page), 5); // a better score than the first game's, so it is written
      await lockIn(page);
      const added = Object.keys(await bests(page)).filter((k) => !keysBefore.includes(k));
      if (added.some((k) => k.startsWith(now[2] + '|'))) wrongKey++;
      t.check(added.every((k) => k.startsWith(keyBefore + '|')) && (await popup(page)).newBest, `the replayed board's score is kept as a best of the photo it was played on (${keyBefore}), not of the one now on the Study tab (documented as a finding if not)`, { added, newBest: (await popup(page)).newBest });
      await toSetup(page);
      t.check(await ready(page) && (await page.evaluate(() => [document.getElementById('gamePreview').width, document.getElementById('gamePreview').height])).join('x') === size.join('x') && (await text(page, '#gamePhotoName')) === `Painting from later${i}.`, 'Change settings then shows the photo now on the Study tab', await text(page, '#gamePhotoName'));
    }
    if (wrongKey === 2) t.finding({ title: 'A board replayed with "Same photo" after the Study photo changed files its score as the new photo\'s best', severity: 'medium', steps: '1. Load photo A; Games → Paint by numbers, Start painting. 2. While the game is on, load photo B with Load photo (on a desktop the topbar stays). 3. Lock in portrait, Play again, Same photo (the dialog says it "plays the one just played"); the board is A\'s. 4. Mix something and Lock in portrait. 5. Change settings: the setup shows photo B.', expected: 'The score is kept as photo A\'s best (the board played was A\'s), as the first game\'s was; B has no best until a game on B\'s board.', actual: 'The pop-up says New best! and the score is stored under photo B\'s name (localStorage portrait-value-studio.gameBest gains "B:<size>|medium|<palette>" while A\'s entry stays as it was), so B\'s setup then reports a best from a game on A\'s board, and A\'s best is never raised. Cause: js/game.js 582, a game\'s bestKey is bestKey() at its start, which reads Studio.sourceKey() (332), the Study tab\'s current photo, while startGame(true) (546–547, commit 294e50d) keeps the previous photo\'s board.' });
    if (onNew === 2) t.finding({ title: 'Play again → "Same photo" starts on a photo loaded since the game began, not the one just scored', severity: 'medium', steps: '1. Games → Paint by numbers, My photo, Start painting. 2. While the game is on (on a desktop the topbar stays), load another photo with Load photo on the Study tab. 3. Lock in portrait; press Play again; the dialog asks "Try the same photo again, or load a new one?": press Same photo.', expected: 'The same photo as the portrait just scored (the one shown on the result screen and in its best score), or the dialog saying the photo has changed.', actual: 'A game starts on the photo loaded in step 2 (its board has that photo\'s size and shapes), while the result screen, its best score and the dialog were about the first. Cause: js/game.js, Same photo calls startGame() (now 1618), whose refreshSetup() (528–535) rebuilds the board whenever Studio.result() has changed, unless startGame is told to keep the board (546–547, the keep flag of commit 294e50d).' });
  }
  // Forget mid-game: the game is gone with everything else, no error
  await start(page); await tapPaint(page, await firstPaint(page), 2);
  await tab(page, 'help');
  await click(page, '#forgetBtn');
  t.check(/again/i.test(await text(page, '#forgetBtn')), 'Forget arms on the first tap during a game', await text(page, '#forgetBtn'));
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
  await sleep(1500);
  t.check((await storageKeys(page)).length === 0, 'after Forget and the reload no game key is left', await storageKeys(page));
  await tab(page, 'game');
  t.check(await ready(page) && await visible(page, '#gameSetup') && !(await visible(page, '#gamePlay')) && (await text(page, '#gameBest')) === '' && (await levelChecked(page)) === 'medium' && (await page.evaluate(() => document.getElementById('gameMode').value)) === 'classic', 'the game is back at its setup with the defaults and no best', [await text(page, '#gameBest'), await levelChecked(page)]);
  await clean(t, page, 'play again, mid-game photo, forget');
  await page.context().close();

  // ================= F. hostile saved state, on the #game route =================
  const hostile = [
    ['gameLevel "constructor"', { [P + 'gameLevel']: J('constructor') }, (s) => s.level === 'medium', 'Medium checked'],
    ['gameLevel "__proto__"', { [P + 'gameLevel']: J('__proto__') }, (s) => s.level === 'medium', 'Medium checked'],
    ['gameLevel 7', { [P + 'gameLevel']: 7 }, (s) => s.level === 'medium', 'Medium'],
    ['gameLevel "Easy"', { [P + 'gameLevel']: J('Easy') }, (s) => s.level === 'medium', 'Medium (the case is not the app\'s)'],
    ['gameLevel "easy"', { [P + 'gameLevel']: J('easy') }, (s) => s.level === 'easy' && /6:00/.test(s.note), 'Easy'],
    ['gameMode "constructor"', { [P + 'gameMode']: J('constructor') }, (s) => s.mode === 'classic', 'Classic'],
    ['gameMode {a:1}', { [P + 'gameMode']: { a: 1 } }, (s) => s.mode === 'classic', 'Classic'],
    ['gameMode "mystery"', { [P + 'gameMode']: J('mystery') }, (s) => s.mode === 'mystery' && s.paletteHidden && s.dots === 4, 'Mystery with a hand dealt'],
    ['gamePalette "__proto__"', { [P + 'gamePalette']: J('__proto__') }, (s) => s.options === 10 && s.suggested === s.palette, 'the suggested palette'],
    ['gamePalette "mine" with nothing ticked', { [P + 'gamePalette']: J('mine') }, (s) => s.options === 10 && s.suggested === s.palette, 'the suggested palette'],
    ['gameSubject "painting" (a string)', { [P + 'gameSubject']: J('painting') }, (s) => s.subject === 'photo', 'My photo'],
    ['gameSubject ["painting"]', { [P + 'gameSubject']: ['painting'] }, (s) => s.subject === 'photo', 'My photo'],
    ['gameSubject {kind:{kind:"painting"}}', { [P + 'gameSubject']: { kind: { kind: 'painting' } } }, (s) => s.subject === 'photo', 'My photo'],
    ['gameSubject {kind:"painting"} with gamePainting "nobody-1"', { [P + 'gameSubject']: { kind: 'painting' }, [P + 'gamePainting']: J('nobody-1') }, (s) => s.subject === 'painting' && PAINTERS.test(s.painting), 'A painting, freshly dealt'],
    ['gamePainting {a:1}', { [P + 'gamePainting']: { a: 1 } }, (s) => s.subject === 'photo', 'My photo'],
    ['gameRefView 42', { [P + 'gameRefView']: 42 }, (s) => s.refView === 'photo', 'Photo'],
    ['gameRefView "blocks"', { [P + 'gameRefView']: J('blocks') }, (s) => s.refView === 'blocks', 'Blocks'],
    ['gameAmount "2" (a string)', { [P + 'gameAmount']: J('2') }, (s) => s.amount === '1 part per tap', '1 part per tap'],
    ['gameAmount NaN', { [P + 'gameAmount']: 'NaN' }, (s) => s.amount === '1 part per tap', '1 part per tap'],
    ['gameAmount 3 (not a step)', { [P + 'gameAmount']: 3 }, (s) => s.amount === '1 part per tap', '1 part per tap'],
    ['gameAmount 1e308', { [P + 'gameAmount']: 1e308 }, (s) => s.amount === '1 part per tap', '1 part per tap'],
    ['gameSound "false" (a string)', { [P + 'gameSound']: J('false') }, (s) => s.sound === 'true', 'sound on'],
    ['gameSound 0', { [P + 'gameSound']: 0 }, (s) => s.sound === 'true', 'sound on'],
    ['gameSound false', { [P + 'gameSound']: false }, (s) => s.sound === 'false', 'sound off'],
    ['gameBest "oops"', { [P + 'gameBest']: J('oops') }, (s) => s.best === '', 'no best'],
    ['gameBest [1,2,3]', { [P + 'gameBest']: [1, 2, 3] }, (s) => s.best === '', 'no best'],
    ['gameBest {not json', { [P + 'gameBest']: '{not json' }, (s) => s.best === '', 'no best'],
    ['gameBest with a null value', { [P + 'gameBest']: { 'sample-study:600x750|medium|sorolla': null } }, (s) => s.best === '', 'no best'],
    ['gameBest with an object value', { [P + 'gameBest']: '{"sample-study:600x750|medium|sorolla":{"a":1},"constructor":"x","__proto__":{"y":2}}' }, (s) => s.best === '', 'no best (a value that is not a number is none)'],
    ['gameBest with "12abc"', { [P + 'gameBest']: { 'sample-study:600x750|medium|sorolla': '12abc' } }, (s) => s.best === '', 'no best'],
    ['gameBest with "900" (a string)', { [P + 'gameBest']: { 'sample-study:600x750|medium|sorolla': '900' } }, (s) => s.best === '', 'no best'],
    ['gameBest with -5', { [P + 'gameBest']: { 'sample-study:600x750|medium|sorolla': -5 } }, (s) => s.best === '', 'no best'],
    ['gameBest with 950', { [P + 'gameBest']: { 'sample-study:600x750|medium|sorolla': 950 } }, (s) => s.best === 'Your best on this portrait at this level in Classic mode: 950 points', 'the best'],
    ['myPaints {TW:1,YO:1}', { [P + 'myPaints']: { TW: 1, YO: 1 } }, (s) => s.options === 10, 'no My paints'],
    ['myPaints with junk among two real', { [P + 'myPaints']: ['TW', 'XX', 'constructor', '__proto__', 1, null, { a: 1 }, 'YO'] }, (s) => s.options === 11, 'My paints (2)'],
    ['myPaints without a white', { [P + 'myPaints']: ['IB', 'LB'] }, (s) => s.options === 11, 'My paints (2), mixed without a white'],
    ['myPaints of 20,000 names', { [P + 'myPaints']: Array.from({ length: 20000 }, (_, i) => 'X' + i).concat(['TW', 'YO', 'CRL']) }, (s) => s.options === 11, 'My paints (3)'],
    ['everything hostile at once', { [P + 'gameLevel']: J('constructor'), [P + 'gameMode']: J('__proto__'), [P + 'gamePalette']: J('toString'), [P + 'gameSubject']: { kind: 'painting', id: '__proto__' }, [P + 'gamePainting']: J('__proto__'), [P + 'gameRefView']: { a: 1 }, [P + 'gameAmount']: 'NaN', [P + 'gameSound']: 'undefined', [P + 'gameBest']: '{"constructor":"x","__proto__":{"y":2}}', [P + 'myPaints']: ['constructor', '__proto__', 'TW', 'CRL'] }, (s) => s.subject === 'painting' && s.mode === 'classic' && s.options === 11 && s.amount === '1 part per tap', 'a playable setup'],
  ];
  const hostileSeen = { level: 0, amount: 0, best: 0 };
  for (const [label, storage, ok, want] of hostile) {
    const page = await openPage(site, { url: '#game', storage });
    const up = await ready(page);
    const s = await page.evaluate(() => { const opts = [...document.getElementById('gamePalette').options]; const sug = opts.find((o) => / \(suggested\)$/.test(o.textContent)); return { level: (document.querySelector('input[name="gameLevel"]:checked') || {}).value || null, subject: (document.querySelector('input[name="gameSubject"]:checked') || {}).value, mode: document.getElementById('gameMode').value, palette: document.getElementById('gamePalette').value, suggested: sug && sug.value, options: opts.length, paletteHidden: document.getElementById('gamePalette').hidden, dots: document.querySelectorAll('#gamePaletteDots .paint-dot').length, amount: document.getElementById('gameAmountOut').textContent, sound: document.getElementById('gameSound').getAttribute('aria-pressed'), best: document.getElementById('gameBest').textContent, refView: ([...document.querySelectorAll('#tab-game [data-ref-view]')].find((b) => b.getAttribute('aria-pressed') === 'true') || {}).dataset?.refView, note: document.getElementById('gamePreviewNote').textContent, painting: document.getElementById('gamePaintingName').textContent, shown: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id) }; });
    t.check(up && s.shown.join() === 'tab-game' && ok(s), `#game with ${label}: the setup is up and shows ${want}`, s);
    if (/^gameLevel "(constructor|__proto__)"/.test(label) && s.level === null) hostileSeen.level++;
    if (/^gameAmount (3|1e308)/.test(label) && s.amount === '¼ part per tap') hostileSeen.amount++;
    if (/^gameBest with (an object value|"12abc")/.test(label) && /(\[object Object\]|12abc) points$/.test(s.best)) hostileSeen.best++;
    if (label === 'gameBest with an object value') {
      // a game on that board becomes its best, the junk record replaced
      await start(page); await tapPaint(page, await firstPaint(page), 3); await lockIn(page);
      const p = await popup(page); const saved = await bests(page);
      t.check(p.newBest && typeof saved['sample-study:600x750|medium|sorolla'] === 'number', 'a game scored on it is a New best and its points replace the record', { newBest: p.newBest, saved });
      if (!p.newBest && typeof saved['sample-study:600x750|medium|sorolla'] === 'object') hostileSeen.best++;
    }
    if (label === 'everything hostile at once') {
      await start(page); await tapPaint(page, await firstPaint(page), 2); await lockIn(page);
      t.check((await popup(page)).shown && Object.keys(await bests(page)).length === 1 + 2, 'a game plays and scores on it; the best is stored beside the junk', Object.keys(await bests(page)));
    }
    await clean(t, page, `#game with ${label}`);
    await page.context().close();
  }
  if (hostileSeen.level >= 1) t.finding({ title: 'A saved difficulty that is a prototype name ("constructor", "__proto__") leaves Difficulty with no option chosen', severity: 'low', steps: '1. In localStorage set portrait-value-studio.gameLevel to "\\"constructor\\"" (the JSON string). 2. Open index.html#game.', expected: 'An unknown saved level falls back to Medium, shown as checked (as a number, a wrong case or any other unknown word does).', actual: 'No Difficulty is checked; the board and the note are Medium\'s, so the setup disagrees with itself until a level is tapped. Cause: js/game.js, the saved level looked up in LEVELS with a plain lookup (now an own-property check at 1644, commit 294e50d), so Object.prototype\'s names passed as levels and no radio was checked.' });
  if (hostileSeen.amount >= 1) t.finding({ title: 'A saved Amount per tap that is none of the five steps lands on ¼ part instead of the default 1 part', severity: 'low', steps: '1. In localStorage set portrait-value-studio.gameAmount to 3 (or any number other than 0.25, 0.5, 1, 2, 4). 2. Open index.html#game.', expected: 'The default, 1 part per tap, as a string or NaN gets.', actual: 'The slider sits at ¼ part per tap. Cause: js/game.js, `Math.max(0, AMOUNTS.indexOf(…))` turned indexOf\'s −1 into the first step (now 1222–1223 fall back to one part, commit 294e50d).' });
  if (hostileSeen.best >= 1) t.finding({ title: 'A best score of the wrong type is shown as it is ("[object Object] points", "12abc points") and can never be beaten', severity: 'low', steps: '1. In localStorage set portrait-value-studio.gameBest to {"sample-study:600x750|medium|sorolla":{"a":1}}. 2. Open index.html#game (the sample portrait, Medium, Sorolla suggested). 3. Start painting, mix something, Lock in portrait.', expected: 'A best that is not a number is dropped (load() already drops a record of the wrong shape), so the setup shows no best and the game\'s score becomes the best.', actual: 'The setup says "Your best on this portrait at this level in Classic mode: [object Object] points"; the game scores without New best! and the object stays stored, so no score on that board is ever kept. Cause: js/game.js, the stored value printed unchecked and compared with `points >` (now read through bestOfKey, 487, at 524 and 1299, commit 294e50d).' });
  // best scores: the oldest go once there are more than fifty, the newest kept and the new one added last
  {
    const seeded = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`old-${i}:1x1|medium|zorn`, 100 + i]));
    const page = await openPage(site, { url: '#game', storage: { [P + 'gameBest']: seeded } });
    await ready(page); await start(page); await lockIn(page);
    const keys = Object.keys(await bests(page));
    t.check(keys.length === 50 && keys[0] === 'old-11:1x1|medium|zorn' && keys[48] === 'old-59:1x1|medium|zorn' && keys[49] === 'sample-study:600x750|medium|sorolla' && !keys.includes('old-10:1x1|medium|zorn'), 'sixty bests plus a new one: the eleven oldest go, fifty stay with the new one last', { n: keys.length, first: keys[0], last: keys.slice(-2) });
    await clean(t, page, 'fifty bests');
    await page.context().close();
  }

  // ================= G. the phone: the full-screen layout, the reference, the scroll bar, tabs mid-game =================
  {
    const page = await openPage(site, { viewport: PHONE });
    await tab(page, 'game'); await ready(page);
    t.check((await hscroll(page)) <= 0, 'phone setup: no horizontal scroll', await hscroll(page));
    await page.selectOption('#gamePalette', 'schmid'); await ready(page); // fourteen paints: the big scroll bar
    await start(page); await sleep(400);
    const s = await page.evaluate(() => { const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { y: Math.round(b.y), b: Math.round(b.bottom), x: Math.round(b.x), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; }; return { focus: document.body.classList.contains('game-focus'), topbar: getComputedStyle(document.querySelector('.topbar')).display, tabs: getComputedStyle(document.querySelector('.tabs')).display, ih: innerHeight, scrollY, bar: r('.game-bar'), canvas: r('#gameCanvas'), board: r('.game-board'), paints: r('#gamePaints'), amount: r('.game-amount'), hasScroll: document.getElementById('gamePlay').classList.contains('has-scroll'), scrollBar: r('#gamePaintScroll'), ref: r('#gameRefFig'), quickUndo: getComputedStyle(document.getElementById('gameQuickUndo')).display, amountLabel: document.querySelector('.game-amount label').firstChild.textContent.trim(), wideOnly: getComputedStyle(document.querySelector('.game-amount .wide-only')).display }; });
    t.check(s.focus && s.topbar === 'none' && s.tabs === 'none' && s.scrollY === 0, 'phone: the page header and tabs step aside while playing', s);
    t.check(s.bar.y >= 0 && s.bar.b < s.canvas.y && s.canvas.b <= s.paints.y && s.paints.b <= s.amount.y && s.amount.b <= s.ih, 'the timer bar, the painting, the paints and the Amount row fill one screen top to bottom', s);
    t.check(s.canvas.w > 300 && s.canvas.h > 300 && s.ref.x >= s.board.x && s.ref.r <= s.board.r + 1 && s.ref.y >= s.board.y && s.ref.w < s.board.w / 2, 'the painting is as large as the space allows and the reference sits in its corner', { canvas: s.canvas, ref: s.ref, board: s.board });
    t.check(s.hasScroll && s.scrollBar.h >= 16 && s.scrollBar.y > s.paints.y && s.scrollBar.b <= s.paints.b, 'fourteen paints get the big scroll bar under them', { hasScroll: s.hasScroll, scrollBar: s.scrollBar });
    t.check(s.quickUndo !== 'none' && s.amountLabel === 'Amount' && s.wideOnly === 'none', 'the thin row reads Amount with a quick undo', s);
    t.check((await hscroll(page)) <= 0, 'phone play: no horizontal scroll', await hscroll(page));
    await screenshot(page, 'game-more-phone-play');
    // the scroll bar: a tap on the track jumps there; the paints scroll
    const sb = await page.locator('#gamePaintScroll').boundingBox();
    await page.mouse.click(sb.x + sb.width - 4, sb.y + sb.height / 2);
    const scrolled = await page.evaluate(() => { const ul = document.getElementById('gamePaints'); return { left: ul.scrollLeft, max: ul.scrollWidth - ul.clientWidth, thumb: document.querySelector('.game-paint-scroll-thumb').style.transform }; });
    t.check(scrolled.max > 50 && scrolled.left === scrolled.max && /translateX\(\d/.test(scrolled.thumb), 'a tap at the end of the track scrolls the paints to the end, the handle following', scrolled);
    const th = await page.locator('.game-paint-scroll-thumb').boundingBox();
    await page.mouse.move(th.x + th.width / 2, th.y + th.height / 2); await page.mouse.down(); await page.mouse.move(sb.x + 10, th.y + th.height / 2, { steps: 6 }); await page.mouse.up();
    t.check((await page.evaluate(() => document.getElementById('gamePaints').scrollLeft)) === 0, 'dragging the handle to the left scrolls them back', await page.evaluate(() => document.getElementById('gamePaints').scrollLeft));
    // a paint tapped with the finger; the reference dragged, kept over the board, and hidden
    const c = await centerOf(page, '#gamePaints .game-paint[data-index="1"]');
    await page.mouse.click(c.x, c.y);
    t.check(/^\S+ 1$/.test(await mix(page)) && (await progress(page)).startsWith('1 of'), 'a paint tapped on the phone adds a part', await mix(page));
    const rb = await page.locator('#gameRef').boundingBox();
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await page.mouse.down(); await page.mouse.move(rb.x + rb.width / 2 - 150, rb.y + rb.height / 2 + 120, { steps: 6 });
    const moving = await page.evaluate(() => [document.getElementById('gameRefFig').classList.contains('is-moving'), document.getElementById('gameRefFig').style.transform]);
    await page.mouse.up();
    const after = await page.evaluate(() => { const f = document.getElementById('gameRefFig').getBoundingClientRect(); const b = document.querySelector('.game-board').getBoundingClientRect(); return { t: document.getElementById('gameRefFig').style.transform, inside: f.left >= b.left - 1 && f.right <= b.right + 1 && f.top >= b.top - 1 && f.bottom <= b.bottom + 1, moving: document.getElementById('gameRefFig').classList.contains('is-moving') }; });
    t.check(moving[0] && /translate\(-150px, 120px\)/.test(moving[1]) && !after.moving && after.t === moving[1] && after.inside, 'the reference drags where the finger goes and stays over the board', { moving, after });
    await page.mouse.move(rb.x + rb.width / 2 - 150, rb.y + rb.height / 2 + 120); await page.mouse.down(); await page.mouse.move(rb.x - 900, rb.y + 2000, { steps: 4 }); await page.mouse.up();
    t.check(await page.evaluate(() => { const f = document.getElementById('gameRefFig').getBoundingClientRect(); const b = document.querySelector('.game-board').getBoundingClientRect(); return f.left >= b.left - 1 && f.bottom <= b.bottom + 1; }), 'dragged far off, it stops at the board\'s edge');
    await click(page, '#gameRefToggle');
    t.check(await page.evaluate(() => document.getElementById('gameRefFig').classList.contains('is-collapsed') && getComputedStyle(document.querySelector('#gameRefFig .matte')).display === 'none'), 'the reference can be hidden on the phone');
    await click(page, '#gameRefToggle');
    // the number buttons and Lock in are further down the page; a tab switch mid-game and back keeps the game
    const lockBox = await rect(page, '#gameLock');
    t.check(lockBox.y >= 0 && lockBox.b <= s.ih, 'Lock in portrait stays in the bar on screen', lockBox);
    await tab(page, 'study');
    t.check(!(await page.evaluate(() => document.body.classList.contains('game-focus'))) && (await page.evaluate(() => getComputedStyle(document.querySelector('.tabs')).display)) !== 'none', 'on another tab the header and tabs are back');
    await tab(page, 'game');
    t.check(await page.evaluate(() => document.body.classList.contains('game-focus')) && await visible(page, '#gamePlay') && /^\S+ 1$/.test(await mix(page)), 'back on the game the full screen and the game are as they were', await mix(page));
    // ✕ twice on the phone; then Memory on the phone keeps the reference hidden; the result fits the screen
    await click(page, '#gameQuit'); await click(page, '#gameQuit');
    t.check(await ready(page) && !(await page.evaluate(() => document.body.classList.contains('game-focus'))) && (await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).display)) !== 'none', '✕ twice quits and gives the header back');
    await page.selectOption('#gameMode', 'memory'); await ready(page); await start(page); await click(page, '#gameLock');
    t.check(await page.evaluate(() => document.getElementById('gameRefFig').classList.contains('is-collapsed') && getComputedStyle(document.querySelector('#gameRefFig .matte')).display === 'none' && document.getElementById('gameRefToggle').textContent === 'Peek · 3 left (−10 s)'), 'Memory on the phone: the reference hides after Ready, Peek in its place');
    t.check((await hscroll(page)) <= 0, 'phone memory: no horizontal scroll');
    await click(page, '#gameQuit'); await click(page, '#gameQuit'); await ready(page);
    await page.selectOption('#gameMode', 'classic'); await ready(page); await start(page);
    await page.mouse.click(c.x, c.y);
    await lockIn(page); await sleep(800);
    const r = await page.evaluate(() => { const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { y: Math.round(b.y), b: Math.round(b.bottom), x: Math.round(b.x), r: Math.round(b.right) }; }; return { focus: document.body.classList.contains('game-focus'), ih: innerHeight, iw: innerWidth, popup: r('#gamePopup'), buttons: [...document.querySelectorAll('#gamePopup .btn')].map((b) => r('#' + (b.id || 'gamePopup'))).length, within: [...document.querySelectorAll('#gamePopup .btn')].every((b) => { const x = b.getBoundingClientRect(); return x.left >= 0 && x.right <= innerWidth && x.top >= 0 && x.bottom <= innerHeight; }) }; });
    t.check(!r.focus && r.popup.y >= 0 && r.popup.b <= r.ih && r.popup.x >= 0 && r.popup.r <= r.iw && r.within, 'the score pop-up and its four buttons fit the phone screen; the header is back', r);
    await click(page, '#gamePopup [data-game="again"]'); await sleep(300);
    const d = await rect(page, '#againDialog');
    t.check(d && d.x >= 0 && d.r <= PHONE.width && d.y >= 0 && d.b <= PHONE.height, 'the Play again dialog fits the phone', d);
    await click(page, '#againCancel');
    t.check((await hscroll(page)) <= 0, 'phone result: no horizontal scroll');
    await screenshot(page, 'game-more-phone-result');
    await clean(t, page, 'phone');
    await page.context().close();
  }

  // ================= H. photos at the Study's extremes, and the files it refuses, from the game's own Load another photo =================
  {
    const page = await openPage(site);
    await tab(page, 'game'); await ready(page);
    const photos = [
      ['16 × 16', await makeImage(page, { width: 16, height: 16, name: 'tiny.png' })],
      ['40 × 4000 strip', await makeImage(page, { width: 40, height: 4000, name: 'strip.png' })],
      ['one flat gray', await makeImage(page, { width: 300, height: 300, draw: 'flat', name: 'flat.png' })],
      ['white', await makeImage(page, { width: 300, height: 300, draw: 'white', name: 'white.png' })],
      ['black', await makeImage(page, { width: 300, height: 300, draw: 'black', name: 'black.png' })],
      ['a transparent PNG', await makeImage(page, { width: 300, height: 300, draw: 'transparent', name: 'alpha.png' })],
      ['noise', await makeImage(page, { width: 300, height: 300, draw: 'noise', name: 'noise.png' })],
      ['an SVG', svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#446"/><circle cx="100" cy="120" r="60" fill="#d9a"/></svg>')],
    ];
    const tiny = {}; let oneNumber = null; const seen = {};
    for (const [label, file] of photos) {
      await loadPhoto(page, file, { settle: 400 }); await studyIdle(page);
      // ready, or refused as too small for a board (Start then stays off for good: no 60 s wait for it)
      await page.waitForFunction(() => !document.getElementById('gameStart').disabled || /too small for a board/.test(document.getElementById('gamePreviewNote').textContent), null, { timeout: 60000 }).catch(() => null);
      const up = await page.evaluate(() => !document.getElementById('gameStart').disabled);
      const s = await page.evaluate(() => ({ name: document.getElementById('gamePhotoName').textContent, note: document.getElementById('gamePreviewNote').textContent, hint: document.getElementById('gamePaletteHint').textContent, preview: [document.getElementById('gamePreview').width, document.getElementById('gamePreview').height] }));
      const n = parseInt(s.note); seen[label] = n;
      const refusedTiny = /too small for a board/.test(s.note) && /16 × 16|strip/.test(label);
      t.check(refusedTiny || (up && s.name === `Painting from ${file.name.replace(/\.[^.]+$/, '')}.` && n >= 1 && HINT.test(s.hint) && +HINT.exec(s.hint)[4] === n), `${label}: the setup is ready, names the photo and counts its numbers (or, for a picture too small for a board, says so)`, s);
      if (!up) { if (/16 × 16|strip/.test(label)) tiny[label] = { refused: s.note, start: await page.evaluate(() => document.getElementById('gameStart').disabled) }; continue; }
      await start(page);
      const g = await page.evaluate(() => ({ numbers: document.querySelectorAll('.game-number').length, progress: document.getElementById('gameProgress').textContent, canvas: [document.getElementById('gameCanvas').width, document.getElementById('gameCanvas').height], css: [Math.round(document.getElementById('gameCanvas').getBoundingClientRect().width), Math.round(document.getElementById('gameCanvas').getBoundingClientRect().height)] }));
      await resetToast(page); await click(page, '.game-next');
      g.next = await toast(page); g.title = await title(page);
      await tapPaint(page, await firstPaint(page));
      await lockIn(page);
      g.points = await text(page, '#gamePoints'); g.grade = await text(page, '#gameGrade');
      t.check(g.numbers === n && g.progress === `0 of ${n} number${n === 1 ? '' : 's'} painted` && /^\d+$/.test(g.points) && g.grade, `${label}: a game with ${n} number${n === 1 ? '' : 's'} plays and scores`, g);
      if (n === 1) { oneNumber = { label, note: s.note, progress: g.progress, next: g.next, title: g.title }; t.check(g.next === 'Every number has a mix. Lock in when you are ready.' || g.title === 'Number 1', `${label}: Next ▸ with one number stays on it`, [g.next, g.title]); }
      if (label === 'white') t.check(g.points === '1200' || +g.points >= 1190, 'white, painted white: a perfect 1,200', g.points);
      if (/16 × 16|strip/.test(label)) tiny[label] = { canvas: g.canvas, css: g.css };
      await toSetup(page);
      await clean(t, page, label);
    }
    t.note(`numbers on the extreme pictures: ${Object.entries(seen).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
    t.check(!!oneNumber, 'a picture of one flat color gives a one-number board', seen);
    if (oneNumber) {
      t.check(oneNumber.note === '1 number to mix, 5:00 on the clock.', 'a one-number board: the preview note counts it in the singular', oneNumber.note);
      t.check(oneNumber.progress === '0 of 1 number painted', 'a one-number board: the bar counts it in the singular (documented as a finding if not)', oneNumber.progress);
      if (oneNumber.note !== '1 number to mix, 5:00 on the clock.' || oneNumber.progress !== '0 of 1 number painted') t.finding({ title: `A one-color picture is counted in the plural: ${[oneNumber.note !== '1 number to mix, 5:00 on the clock.' && `"${oneNumber.note}"`, oneNumber.progress !== '0 of 1 number painted' && `"${oneNumber.progress}" in the bar`].filter(Boolean).join(' and ')}`, severity: 'low', steps: `1. Load a picture of one flat color (here a 300 × 300 ${oneNumber.label} PNG) as the photo. 2. Open Games → Paint by numbers; read the preview note; Start painting and read the bar (and, in Value first, "0 of 1 values set").`, expected: '"1 number to mix" and "0 of 1 number painted".', actual: `The note says "${oneNumber.note}" and the bar "${oneNumber.progress}". Cause: js/game.js progressText, 979–980, always writes "values set" and "numbers painted" (the note at 490 was made singular in commit 294e50d).` });
    t.note('The mix line writes a paint and its amount with a non-breaking space ("TW 2", game.js 963), the analysis\'s "Mix:" recipe with a plain one (1579): the same recipe is written two ways, which only a copy of the text shows.');
    }
    t.check(Object.keys(tiny).length === 2 && Object.values(tiny).every((x) => (x.refused ? /too small for a board/.test(x.refused) && x.start : Math.min(x.css[0], x.css[1]) >= 100)), 'the smallest photos the Study accepts give a board big enough to tap, or the setup says the picture is too small and keeps Start off', tiny);
    if (Object.keys(tiny).length === 2 && Object.values(tiny).every((x) => Math.min(x.css[0], x.css[1]) < 20)) t.finding({ title: 'A tiny photo (16 × 16, the smallest the Study accepts) or a thin strip (40 × 4000) gives a board a few pixels wide on screen, too small to see or tap', severity: 'low', steps: '1. Load a 16 × 16 PNG (or a 40 × 4000 one) as the photo: the Study accepts it (16 px a side is its minimum). 2. Games → Paint by numbers → Start painting.', expected: 'The board is drawn at a size that can be looked at and tapped (scaled up to the space, with the numbers legible), or the setup says the picture is too small for a board.', actual: `The 16 × 16 board is ${tiny['16 × 16'].css.join(' × ')} CSS px on a 1400 × 900 window and the strip's ${tiny['40 × 4000 strip'].css.join(' × ')}: the shapes and numbers cannot be made out, and the numbers are written at 10 px on a 16 px canvas. The number buttons still work, so the game can be played blind. Cause: styles.css 816–818, .game-board canvas { max-width: 100%; height: auto } with no minimum: the board is shown at the working size of the photo (js/game.js 186, Studio.prep()), which never upscales a small picture.` });
    // the files the Study refuses, chosen from the game's own Load another photo: the setup keeps its photo and says why
    for (const [label, file, said] of [['a text file', textFile(), 'That file is not an image. Choose a JPG, PNG or WebP photo.'], ['a broken JPEG', brokenImage(), 'This image could not be opened. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first.'], ['a 1 × 1 PNG', await makeImage(page, { width: 1, height: 1, name: 'one.png' }), 'That picture is too small to study (1 × 1 px): it needs at least 16 px on each side.'], ['a 2 × 4000 strip', await makeImage(page, { width: 2, height: 4000, name: 'thin.png' }), 'That picture is too small to study (2 × 4000 px): it needs at least 16 px on each side.']]) {
      const before = await text(page, '#gamePhotoName'); const bytes = await previewBytes(page);
      await resetToast(page); await loadPhoto(page, file, { settle: 1200 });
      t.check((await toast(page)) === said && (await text(page, '#gamePhotoName')) === before && (await previewBytes(page)) === bytes && await visible(page, '#gameSetup'), `${label} from Load another photo: refused with its reason, the board kept`, [await toast(page), await text(page, '#gamePhotoName')]);
    }
    await clean(t, page, 'extreme photos');
    await page.context().close();
  }
}
