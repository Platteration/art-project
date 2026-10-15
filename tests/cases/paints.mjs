// Colors and paints, played like a sceptical tester (README: "Paints for the study"; source js/palette.js,
// js/paints.js, js/mixing.js and the Colors and paints drawer in index.html): the ten known palettes and
// their ranking for the sample and for a loaded photo, picking each one (twice), the mixes list (recipe
// format, the Close / Near / Out of reach badges, the Darkest and Lightest marks on a photo that goes past
// paint, hovering, the + button), Colors per value at both ends and under slider spam, a new photo, a tab
// switch and a reload in the middle of the mixes, Photo vs palette block view, the palette following into
// the Studio and the games, My paints (0, 1, 2, a known palette's paints in one go, all 77, Suggest at every
// size 3..10 and from the whole library, search, keyboard-only), two races inside a running suggestion (a
// source switch, a new result), Simple mode's three palettes and a saved source Simple cannot show, hostile
// saved state for myPaints, paintChoice and the picked colors, and everything again on a 390 px phone.
import { openPage, clean, tab, PHONE, makeImage, loadPhoto, click, text, visible, hscroll, sleep } from '../lib.mjs';

const K = {
  mine: 'portrait-value-studio.myPaints',
  choice: 'portrait-value-studio.paintChoice',
  picked: 'portrait-value-studio.palette',
  mode: 'portrait-value-studio.mode',
  drawers: 'portrait-value-studio.drawers',
  blockView: 'portrait-value-studio.blockView',
};
// a page opened in Advanced mode with the Colors and paints drawer already open
const ADV = { [K.mode]: 'advanced', [K.drawers]: '["colors"]' };
const BADGES = ['Close', 'Near', 'Out of reach', 'Darkest you can mix', 'Lightest you can mix'];
// "TW 6 · YO 2 · CRL 1 · IB touch" (a no-break space between a code and its amount; a lone paint has no number)
const PART = '[A-Za-z]+(?: (?:\\d+|touch))?';
const RECIPE = new RegExp(`^${PART}( · ${PART})*$`);

// ---- helpers of this case ---------------------------------------------------------------------------------

const setRange = (page, sel, v) => page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
const resetToast = (page) => page.evaluate(() => { document.getElementById('toast').textContent = ''; });
// the study has been (re)computed
const settled = (page) => page.waitForFunction(() => document.getElementById('busy').hidden && window.Studio && !!Studio.result(), null, { timeout: 20000 }).catch(() => null);
// the ten known palettes are ranked for the current study
const ranked = (page) => page.waitForFunction(() => document.querySelectorAll('#presetList .preset').length === 10 && !document.getElementById('presetList').hasAttribute('aria-busy'), null, { timeout: 20000 }).catch(() => null);
// every mix row has its badge (the recipes are worked out one at a time)
const mixed = (page) => page.waitForFunction(() => { const rows = document.querySelectorAll('#mixList .mix-row'); return rows.length > 0 && [...rows].every((r) => r.querySelector('.mix-badge') && !r.querySelector('.mix-pending')); }, null, { timeout: 30000 }).catch(() => null);
// a suggestion has finished
const suggestedDone = (page) => page.waitForFunction(() => { const b = document.getElementById('suggestBtn'); return !b.disabled && b.textContent === 'Suggest again'; }, null, { timeout: 30000 }).catch(() => null);
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#mixList .mix-row')].map((r) => {
  const badge = r.querySelector('.mix-badge');
  return { zone: r.querySelector('.mix-zone').textContent, recipe: r.querySelector('.mix-recipe').textContent, title: r.querySelector('.mix-recipe').title, badge: badge ? badge.textContent : '', status: badge ? badge.dataset.status : '', add: r.querySelector('.mix-add').getAttribute('aria-label'), mixTitle: r.querySelector('.mix-chip:nth-child(2)').title };
}));
const chips = (page) => page.evaluate(() => [...document.querySelectorAll('#resultPaints .paint-code')].map((e) => e.textContent));
const presetList = (page) => page.evaluate(() => [...document.querySelectorAll('#presetList li')].map((li) => {
  const b = li.querySelector('.preset');
  return { id: li.dataset.preset, simple: 'simple' in li.dataset, pressed: b.getAttribute('aria-pressed') === 'true', label: b.getAttribute('aria-label'), best: !!li.querySelector('.preset-best'), reach: li.querySelector('.preset-reach').textContent, dots: li.querySelectorAll('.paint-dot').length, why: (li.querySelector('.preset-why') || {}).textContent || '', shown: getComputedStyle(li).display !== 'none' };
}));
const presets = (page) => page.evaluate(() => Paints.PRESETS.map((p) => ({ id: p.id, name: p.name, paints: p.paints, about: p.about })));
const nColors = (page) => page.evaluate(() => Studio.result().blockColors.filter((c) => c.share > 0).length);
const pickedCount = (page) => page.evaluate(() => document.querySelectorAll('#swatches li').length);
const canvasSum = (page, sel) => page.evaluate((s) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 64) n = (n * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000000007; return n; }, sel);
const reachOf = (s) => { const m = /^Mixes (\d+) of (\d+) colors?$/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };
const vOf = (zone) => +(/V (\d+\.\d)/.exec(zone) || [])[1];
const names = (page, codes) => page.evaluate((cs) => cs.map((c) => Paints.byCode(c).name), codes);
const setMine = (page, codes) => page.evaluate((cs) => { document.querySelectorAll('#paintCats input[type="checkbox"]').forEach((b) => { if (b.checked !== cs.includes(b.value)) b.click(); }); }, codes);
const ticked = (page) => page.evaluate(() => [...document.querySelectorAll('#paintCats input[type="checkbox"]:checked')].map((b) => b.value));
const dialogOpen = (page) => page.evaluate(() => document.getElementById('paintDialog').open);
const pickPreset = async (page, id) => { await click(page, `#presetList li[data-preset="${id}"] .preset`); await mixed(page); };
const paletteOptions = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return { value: e.value, options: [...e.options].map((o) => [o.value, o.textContent]) }; }, sel);

// a photo that goes further than paint does: pure white, skin, a saturated blue and pure black
async function extremesImage(page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 600, 270);
    g.fillStyle = '#c98f6a'; g.fillRect(0, 270, 300, 260);
    g.fillStyle = '#1030ff'; g.fillRect(300, 270, 300, 260);
    g.fillStyle = '#000000'; g.fillRect(0, 530, 600, 270);
    return c.toDataURL('image/png');
  });
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  return { name: 'extremes.png', mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

// the checks every rendered palette must pass: its chips, its rows, their badges and recipes
async function checkPalette(t, page, label, codes, n) {
  const rs = await rows(page);
  const fullNames = await names(page, codes);
  const byCode = Object.fromEntries(codes.map((c, i) => [c, fullNames[i]]));
  t.check(rs.length === n, `${label}: one mix row per study color (${n})`, rs.length);
  t.check(rs.every((r) => BADGES.includes(r.badge)), `${label}: every row carries a badge`, rs.map((r) => r.badge));
  t.check(rs.every((r) => RECIPE.test(r.recipe)), `${label}: every recipe reads like "TW 6 · YO 2 · IB touch"`, rs.map((r) => r.recipe));
  const codesUsed = rs.flatMap((r) => r.recipe.split(' · ').map((p) => p.split(' ')[0]));
  t.check(codesUsed.every((c) => codes.includes(c)), `${label}: recipes use the palette's paints only`, codesUsed.filter((c) => !codes.includes(c)));
  t.check(rs.every((r) => /^(Shadow|Middle|Light) · V \d+\.\d$/.test(r.zone)), `${label}: every row names its value and zone`, rs.map((r) => r.zone));
  const vs = rs.map((r) => vOf(r.zone));
  t.check(vs.every((v, i) => i === 0 || v >= vs[i - 1]), `${label}: the rows run darkest first, as the hint says`, vs);
  // hovering a mix: the title holds the paints' full names, one per line, with their parts
  const titleOk = rs.every((r) => {
    const parts = r.recipe.split(' · ').map((p) => p.split(' '));
    const lines = r.title.split('\n');
    return lines.length === parts.length && parts.every(([code, amt], i) => lines[i].startsWith(byCode[code] + ': ') && (amt === 'touch' ? lines[i].endsWith('a touch') : amt === undefined ? /: 1 part$/.test(lines[i]) : lines[i].endsWith(`${amt} part${amt === '1' ? '' : 's'}`)));
  });
  t.check(titleOk, `${label}: hovering a mix gives the paints' full names and parts`, rs.slice(0, 3).map((r) => r.title));
  t.check(rs.every((r) => /^Predicted mix #[0-9A-F]{6}$/.test(r.mixTitle)), `${label}: the mixed chip names its predicted color`, rs.map((r) => r.mixTitle));
  t.check(rs.every((r) => /^Add #[0-9A-F]{6} to picked colors$/.test(r.add)), `${label}: every + button says what it adds`, rs.map((r) => r.add));
  return rs;
}

export default async function paints(t, site) {
  // ---- the known palettes on the sample, picking each, hover and + ----------------------------------------
  {
    const page = await openPage(site, { storage: ADV });
    await settled(page); await ranked(page);
    const all = await presets(page);
    const list = await presetList(page);
    const n = await nColors(page);
    t.check(all.length === 10 && list.length === 10 && all.every((p) => list.some((l) => l.id === p.id)), 'ten known palettes are listed for the sample', list.map((l) => l.id));
    t.check(list.filter((l) => l.best).length === 1 && list[0].best, 'exactly one palette is marked Best match, the first', list.map((l) => l.best));
    const reaches = list.map((l) => +l.reach.split(' / ')[0]);
    t.check(reaches.every((r, i) => i === 0 || r <= reaches[i - 1]), 'the list runs from most colors mixed to fewest', reaches);
    t.check(list.every((l) => l.reach === `${l.reach.split(' / ')[0]} / ${n}`), `every meter reads "N / ${n}", the study's color count`, list.map((l) => l.reach));
    t.check(list.every((l) => /^.+: \d+ paints, mixes \d+ of \d+ colors$/.test(l.label)), 'every palette button has a spoken label with its paints and reach', list.map((l) => l.label));
    t.check(list.every((l) => l.dots === all.find((p) => p.id === l.id).paints.length), 'every palette shows one dot per paint', list.map((l) => [l.id, l.dots]));
    t.check(list.every((l) => !l.pressed) && !(await visible(page, '#paintResult')), 'nothing is chosen at the start: no palette pressed, no mixes', list.filter((l) => l.pressed));
    t.check((await text(page, '#colorsState')) === '3 per value', 'the drawer header says "3 per value" before a palette is chosen', await text(page, '#colorsState'));
    t.check((await text(page, '#colorsOut')) === '3', 'Colors in each value reads 3', await text(page, '#colorsOut'));
    t.check(list.every((l) => !l.simple || ['zorn', 'primary', 'rembrandt'].includes(l.id)), 'the three Simple palettes are Zorn, Three primaries and Rembrandt', list.filter((l) => l.simple).map((l) => l.id));
    await clean(t, page, 'known palettes');

    // picking each palette: its name, paints, note and a mix for every color; a second press changes nothing
    for (const p of all) {
      await pickPreset(page, p.id);
      t.check((await text(page, '#resultName')) === p.name && (await text(page, '#resultAbout')) === p.about, `${p.name}: the result names it and gives its note`, [await text(page, '#resultName'), await text(page, '#resultAbout')]);
      t.check(JSON.stringify(await chips(page)) === JSON.stringify(p.paints), `${p.name}: the chips are its ${p.paints.length} paints`, await chips(page));
      const inList = (await presetList(page)).find((l) => l.id === p.id);
      t.check((await text(page, '#resultMatch')) === `Mixes ${inList.reach.split(' / ')[0]} of ${n} colors`, `${p.name}: "Mixes N of ${n} colors" agrees with its meter`, [await text(page, '#resultMatch'), inList.reach]);
      t.check((await presetList(page)).every((l) => l.pressed === (l.id === p.id)), `${p.name}: it alone is pressed`);
      t.check((await text(page, '#colorsState')) === `3 per value · ${p.name}`, `${p.name}: the drawer header names it`, await text(page, '#colorsState'));
      await checkPalette(t, page, p.name, p.paints, n);
      t.check((await text(page, '#blockViewPalette')) === p.name.replace(/\s*\(.*\)$/, '').replace(/ palette$/i, ''), `${p.name}: the block-view switch names it`, await text(page, '#blockViewPalette'));
    }
    await pickPreset(page, 'zorn');
    const before = await rows(page);
    await pickPreset(page, 'zorn');
    t.check(JSON.stringify(await rows(page)) === JSON.stringify(before) && (await presetList(page)).find((l) => l.id === 'zorn').pressed, 'pressing the chosen palette again keeps it and its mixes', (await rows(page)).length);
    t.check(before.some((r) => r.badge === 'Close') && before.some((r) => r.badge === 'Near' || r.badge === 'Out of reach'), 'Zorn on the sample shows Close beside mixes that are not', before.map((r) => r.badge));
    await clean(t, page, 'picking each palette');

    // + keeps the color in Picked colors; a second press says it is there already
    const was = await pickedCount(page);
    const hex = /#[0-9A-F]{6}/.exec(before[0].add)[0];
    await resetToast(page);
    await click(page, '#mixList .mix-row:first-child .mix-add'); await sleep(200);
    t.check((await pickedCount(page)) === was + 1 && (await text(page, '#toast')) === `Added ${hex}`, '+ keeps the row\'s color in Picked colors and says so', [await pickedCount(page), await text(page, '#toast')]);
    await resetToast(page);
    await click(page, '#mixList .mix-row:first-child .mix-add'); await sleep(200);
    t.check((await pickedCount(page)) === was + 1 && (await text(page, '#toast')) === `${hex} is already in Picked colors`, '+ a second time adds nothing and says the color is there already', [await pickedCount(page), await text(page, '#toast')]);
    await page.hover('#mixList .mix-row:first-child .mix-recipe'); await sleep(100);
    t.check((await rows(page))[0].title.includes('\n') || before[0].recipe.split(' · ').length === 1, 'the hovered recipe carries its full names', (await rows(page))[0].title);
    // Add block colors: one picked color per distinct block color
    const distinct = await page.evaluate(() => new Set(Studio.result().blockColors.map((c) => Studio.toHex(c))).size);
    await resetToast(page);
    await click(page, '#addBlocks'); await sleep(200);
    const addedNow = await pickedCount(page);
    t.check(addedNow === was + 1 + distinct - 1 && /^Added \d+ block colors$/.test(await text(page, '#toast')), 'Add block colors adds every distinct block color (one was there already) and says how many', [addedNow, was, distinct, await text(page, '#toast')]);
    await clean(t, page, 'plus and hover');

    // ---- Colors per value at its ends and under slider spam ----------------------------------------------
    for (const v of ['1', '6']) {
      await setRange(page, '#colors', v); await settled(page); await ranked(page); await mixed(page);
      const nn = await nColors(page);
      t.check((await text(page, '#colorsOut')) === v && (await text(page, '#colorsState')) === `${v} per value · Zorn`, `Colors per value ${v}: the output and the header follow`, [await text(page, '#colorsOut'), await text(page, '#colorsState')]);
      t.check((await rows(page)).length === nn && (await presetList(page)).every((l) => l.reach.endsWith(` / ${nn}`)), `Colors per value ${v}: ${nn} rows and every meter out of ${nn}`, [(await rows(page)).length, (await presetList(page)).map((l) => l.reach)]);
      t.check(v === '1' ? nn >= 3 && nn <= 9 : nn >= 9, `Colors per value ${v}: a sane color count (${nn})`, nn);
    }
    for (const v of ['2', '5', '1', '6', '3']) await setRange(page, '#colors', v);
    await settled(page); await ranked(page); await mixed(page);
    t.check((await rows(page)).length === (await nColors(page)) && (await text(page, '#colorsState')) === '3 per value · Zorn', 'slider spam ends with the rows of the last value', [(await rows(page)).length, await nColors(page)]);
    await clean(t, page, 'colors per value');

    // ---- a photo past what paint can do: the marks, Out of reach, and a ranking that moves --------------
    await loadPhoto(page, await extremesImage(page), { settle: 300 });
    await settled(page); await ranked(page); await mixed(page);
    const ex = await rows(page);
    t.check(ex.some((r) => r.badge === 'Darkest you can mix' && r.status === 'limit'), 'a pure black is marked "Darkest you can mix"', ex.map((r) => [r.zone, r.badge]));
    t.check(ex.some((r) => r.badge === 'Lightest you can mix' && r.status === 'limit'), 'a pure white is marked "Lightest you can mix"', ex.map((r) => [r.zone, r.badge]));
    t.check(ex.some((r) => r.badge === 'Out of reach' && r.status === 'far'), 'a saturated blue is "Out of reach" for Zorn, not a value limit', ex.map((r) => [r.zone, r.badge]));
    t.check(ex.some((r) => r.badge === 'Close' && r.status === 'close'), 'the skin tone is "Close" for Zorn', ex.map((r) => [r.zone, r.badge]));
    const exList = await presetList(page);
    const rank = (id) => exList.findIndex((l) => l.id === id);
    t.check(rank('zorn-blue') < rank('zorn') && rank('zorn') > 0, 'with a blue in the photo, Zorn with a blue ranks above Zorn, which is no longer best', exList.map((l) => [l.id, l.reach]));
    t.check(exList.filter((l) => l.best).length === 1 && exList[0].best, 'the loaded photo has exactly one Best match, first', exList.map((l) => l.best));
    const ne = await nColors(page);
    t.check(exList.every((l) => l.reach.endsWith(` / ${ne}`)) && (await text(page, '#resultMatch')).endsWith(` of ${ne} colors`), 'the meters and the result count the new photo\'s colors', [ne, await text(page, '#resultMatch')]);
    await clean(t, page, 'extremes photo');

    // ---- a new photo, a tab switch and a reload in the middle of the mixes ---------------------------------
    await click(page, '#presetList li[data-preset="schmid"] .preset'); // fourteen paints: the slowest recipes
    await loadPhoto(page, await makeImage(page, { width: 600, height: 800, type: 'image/jpeg' }), { settle: 300 });
    await settled(page); await ranked(page); await mixed(page);
    const np = await nColors(page);
    t.check((await rows(page)).length === np && (await text(page, '#resultName')) === 'Richard Schmid', 'a new photo mid-mixes: the rows are the new photo\'s, the palette stays', [(await rows(page)).length, np]);
    await click(page, '#presetList li[data-preset="reilly"] .preset');
    await tab(page, 'paint'); await tab(page, 'study');
    await mixed(page);
    t.check((await rows(page)).length === np && (await rows(page)).every((r) => BADGES.includes(r.badge)), 'a tab switch mid-mixes: every row still gets its badge', (await rows(page)).map((r) => r.badge));
    await clean(t, page, 'mid-action');
    await click(page, '#presetList li[data-preset="schmid"] .preset');
    await page.reload({ waitUntil: 'load' }); await sleep(300);
    await settled(page); await ranked(page); await mixed(page);
    t.check((await presetList(page)).find((l) => l.id === 'schmid').pressed && (await text(page, '#resultName')) === 'Richard Schmid' && (await rows(page)).length === (await nColors(page)), 'a reload mid-mixes brings the chosen palette back with its mixes', [await text(page, '#resultName'), (await rows(page)).length]);
    t.check((await text(page, '#colorsState')) === '3 per value · Richard Schmid', 'after the reload the header names the kept palette', await text(page, '#colorsState'));
    await clean(t, page, 'reload mid-mixes');

    // ---- the drawer closed and reopened: the header still says, the mixes come back ---------------------------
    await click(page, '#drawer-colors summary'); await sleep(200);
    t.check(!(await page.evaluate(() => document.getElementById('drawer-colors').open)) && (await text(page, '#colorsState')) === '3 per value · Richard Schmid', 'closed, the drawer header still names the palette', await text(page, '#colorsState'));
    await click(page, '#drawer-colors summary'); await mixed(page);
    t.check((await rows(page)).length === (await nColors(page)), 'reopened, the mixes are back', (await rows(page)).length);
    await clean(t, page, 'drawer toggle');
    await page.context().close();
  }

  // ---- Photo vs palette block view ----------------------------------------------------------------------------
  {
    const page = await openPage(site, { storage: ADV });
    await settled(page); await ranked(page); await pickPreset(page, 'zorn');
    const photo = await canvasSum(page, '#cv-block');
    const sw = await page.evaluate(() => ({ photo: document.querySelector('[data-block-view="photo"]').getAttribute('aria-pressed'), pal: document.getElementById('blockViewPalette').getAttribute('aria-pressed'), name: document.getElementById('blockViewPalette').textContent, title: document.getElementById('blockViewPalette').title, label: document.getElementById('cv-block').getAttribute('aria-label') }));
    t.check(sw.photo === 'true' && sw.pal === 'false' && sw.name === 'Zorn' && sw.title === 'As Zorn mixes them' && sw.label === 'Color-block study', 'the switch starts on Photo and names the chosen palette', sw);
    await click(page, '#blockViewPalette');
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 20000 }).catch(() => null);
    await sleep(200);
    const pal = await canvasSum(page, '#cv-block');
    const sw2 = await page.evaluate(() => ({ pal: document.getElementById('blockViewPalette').getAttribute('aria-pressed'), label: document.getElementById('cv-block').getAttribute('aria-label'), saved: localStorage.getItem('portrait-value-studio.blockView') }));
    t.check(pal !== photo && sw2.pal === 'true' && sw2.label === 'Color-block study as Zorn mixes it' && sw2.saved === 'palette', 'Palette repaints the blocks as Zorn mixes them, says so, and is remembered', { changed: pal !== photo, ...sw2 });
    // the palette view follows the palette chosen
    await pickPreset(page, 'cmy');
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 20000 }).catch(() => null);
    await sleep(200);
    const cmy = await canvasSum(page, '#cv-block');
    t.check(cmy !== pal && cmy !== photo && (await text(page, '#blockViewPalette')) === 'Modern primaries', 'choosing another palette repaints the palette view', [await text(page, '#blockViewPalette')]);
    await page.reload({ waitUntil: 'load' }); await sleep(300);
    await settled(page); await ranked(page);
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 20000 }).catch(() => null);
    await sleep(200);
    t.check((await page.evaluate(() => document.getElementById('blockViewPalette').getAttribute('aria-pressed'))) === 'true' && (await canvasSum(page, '#cv-block')) === cmy, 'after a reload the palette view is still on, with the same picture', await canvasSum(page, '#cv-block'));
    await click(page, '[data-block-view="photo"]'); await sleep(200);
    t.check((await canvasSum(page, '#cv-block')) === photo, 'Photo brings the photo\'s own colors back', await canvasSum(page, '#cv-block'));
    // quick flips while a palette picture is still being worked out
    for (let i = 0; i < 4; i++) { await click(page, '#blockViewPalette'); await click(page, '[data-block-view="photo"]'); }
    await click(page, '#blockViewPalette');
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 20000 }).catch(() => null);
    await sleep(200);
    t.check((await canvasSum(page, '#cv-block')) === cmy, 'flipping the switch while it works ends on the right picture', await canvasSum(page, '#cv-block'));
    await clean(t, page, 'block view');
    await page.context().close();
  }

  // ---- My paints: 0, 1, 2, a known palette in one go, every size, all 77, search, keyboard, following -------
  {
    const page = await openPage(site, { storage: ADV });
    await settled(page); await ranked(page);
    const n = await nColors(page);
    const all = await presets(page);
    await pickPreset(page, 'rembrandt');
    // the palette follows into the Studio and the games
    let ps = await paletteOptions(page, '#ps-palette');
    t.check(ps.value === 'rembrandt' && ps.options.length === 10, 'the Studio\'s palette follows the Study\'s choice (Rembrandt)', ps);
    await pickPreset(page, 'zorn');
    ps = await paletteOptions(page, '#ps-palette');
    t.check(ps.value === 'zorn', 'the Studio follows a second choice (Zorn)', ps.value);
    await tab(page, 'game');
    const gp = await paletteOptions(page, '#gamePalette');
    t.check(gp.options.length === 10 && !gp.options.some((o) => o[0] === 'mine'), 'with no paints ticked, the game offers the ten palettes and no My paints', gp.options.map((o) => o[0]));
    await tab(page, 'study');
    await clean(t, page, 'following with no ticks');

    // My paints with nothing ticked
    await click(page, '#srcMine'); await sleep(100);
    const mine0 = await page.evaluate(() => ({ pane: !document.getElementById('minePane').hidden, presets: document.getElementById('presetPane').hidden, count: document.getElementById('mineCount').textContent, max: document.getElementById('paintMaxOut').textContent, btn: document.getElementById('suggestBtn').textContent, result: document.getElementById('paintResult').hidden, state: document.getElementById('colorsState').textContent }));
    t.check(mine0.pane && mine0.presets && mine0.count === 'No paints ticked yet: suggestions come from the whole library.' && mine0.max === '6 + white' && mine0.btn === 'Suggest a palette' && mine0.result && mine0.state === '3 per value', 'My paints with no ticks: the pane, its words and no result yet', mine0);
    t.check((await text(page, '#blockViewPalette')) !== 'Palette' && /best match/.test(await page.evaluate(() => document.getElementById('blockViewPalette').title)), 'with nothing suggested the block-view switch falls back to the best match and says so', await page.evaluate(() => document.getElementById('blockViewPalette').title));
    await click(page, '#suggestBtn'); await suggestedDone(page); await mixed(page);
    const s0 = { name: await text(page, '#resultName'), about: await text(page, '#resultAbout'), chips: await chips(page), match: await text(page, '#resultMatch'), state: await text(page, '#colorsState'), bv: await text(page, '#blockViewPalette') };
    t.check(s0.name === 'Suggested palette' && s0.about === 'Chosen from the whole library to mix this study\'s colors. Change the photo or settings and it is chosen again.', 'Suggest with no ticks says it chose from the whole library', s0);
    t.check(s0.chips[0] === 'TW' && s0.chips.length >= 3 && s0.chips.length <= 7, 'the whole-library suggestion starts with titanium white and holds at most 6 + white', s0.chips);
    t.check(s0.state === '3 per value · Suggested palette' && s0.bv === 'Suggested', 'the header and the block-view switch name the suggested palette', [s0.state, s0.bv]);
    const r0 = reachOf(s0.match);
    t.check(r0 && r0[1] === n && r0[0] <= n, `the suggestion's "Mixes N of ${n} colors" is sound`, s0.match);
    await checkPalette(t, page, 'suggested (library)', s0.chips, n);
    ps = await paletteOptions(page, '#ps-palette');
    t.check(ps.value === 'study' && ps.options.some((o) => o[0] === 'study' && o[1] === 'Study tab: Suggested palette'), 'the Studio follows the suggested palette as "Study tab: Suggested palette"', ps);
    const same = JSON.stringify(s0.chips);
    await click(page, '#suggestBtn'); await suggestedDone(page);
    t.check(JSON.stringify(await chips(page)) === same, 'Suggest again with nothing changed gives the same palette', await chips(page));
    await clean(t, page, 'suggest from the library');

    // the library dialog: 77 paints in nine families, each with a pigment and a swatch
    await click(page, '#mineEdit'); await sleep(200);
    const lib = await page.evaluate(() => ({ open: document.getElementById('paintDialog').open, cats: [...document.querySelectorAll('#paintCats .paint-cat')].map((s) => [s.querySelector('h3').textContent, s.querySelectorAll('li').length]), items: document.querySelectorAll('#paintCats li').length, pigments: [...document.querySelectorAll('#paintCats .paint-pigment')].filter((e) => e.textContent.trim()).length, swatches: [...document.querySelectorAll('#paintCats .paint-swatch')].filter((e) => e.style.getPropertyValue('--c') && e.style.getPropertyValue('--t')).length, count: document.getElementById('paintDialogCount').textContent, library: Paints.LIBRARY.length, families: Paints.CATEGORIES.map((c) => c.name) }));
    t.check(lib.open && lib.items === 77 && lib.library === 77 && lib.cats.length === 9 && lib.cats.map((c) => c[0]).join('|') === lib.families.join('|') && lib.cats.every((c) => c[1] > 0), 'Choose my paints lists 77 paints in the nine families', lib.cats);
    t.check(lib.pigments === 77 && lib.swatches === 77 && lib.count === '', 'every paint has a pigment code and a tube-and-tint swatch; the count is blank with none ticked', [lib.pigments, lib.swatches, lib.count]);
    // one paint, the white alone
    await setMine(page, ['TW']);
    t.check((await text(page, '#paintDialogCount')) === '1 ticked', 'one tick: the dialog counts it', await text(page, '#paintDialogCount'));
    await click(page, '#paintDialogDone'); await suggestedDone(page); await mixed(page);
    const s1 = { count: await text(page, '#mineCount'), chips: await chips(page), about: await text(page, '#resultAbout'), match: await text(page, '#resultMatch'), rs: await rows(page) };
    t.check(s1.count === '1 paint ticked' && JSON.stringify(s1.chips) === '["TW"]' && s1.about.startsWith('Chosen from your paints'), 'Done with one paint: a new suggestion from that paint alone', s1);
    t.check(s1.rs.length === n && s1.rs.every((r) => r.recipe === 'TW'), 'with white alone every mix is white', s1.rs.map((r) => r.recipe));
    t.note(`With only Titanium White ticked, the suggested palette is white alone and ${s1.match.toLowerCase()}; its rows are marked "${[...new Set(s1.rs.map((r) => r.badge))].join('", "')}" (a middle value marked "Darkest you can mix" is true of a white-only palette, if odd).`);
    t.check(JSON.stringify(await storageGetJson(page, K.mine)) === '["TW"]', 'the tick is saved', await storageGetJson(page, K.mine));
    // two paints
    await click(page, '#mineEdit'); await sleep(100);
    await setMine(page, ['TW', 'IB']);
    await click(page, '#paintDialogDone'); await suggestedDone(page); await mixed(page);
    const s2 = { count: await text(page, '#mineCount'), chips: await chips(page), rs: await rows(page) };
    t.check(s2.count === '2 paints ticked' && JSON.stringify(s2.chips) === '["TW","IB"]' && s2.rs.length === n && s2.rs.every((r) => RECIPE.test(r.recipe)), 'two paints: both go on the palette, every color gets a gray', s2);
    const studioErr = page.log.pageerrors.filter((e) => /painting\.js/.test(e));
    const studioToast = await text(page, '#toast');
    t.check(studioErr.length === 0, 'the Studio takes a palette of white and one paint without throwing', studioErr);
    if (studioErr.length) t.finding({ title: 'A palette of white plus one paint (two ticks under My paints, or the Studio\'s own "My paints (2)") throws in the Studio and leaves its mixes stale', severity: 'high', steps: '1. Advanced mode, Colors and paints, My paints, Choose my paints: tick Titanium White and Ivory Black only, Done. 2. The suggestion (TW, IB) follows into the Studio (open it, or watch the console).', expected: 'The Studio takes the palette and seeds what skin tones two paints can give (or none), with no error.', actual: `A page error: ${studioErr[0].split('\n')[0]}; the guard\'s toast says "${studioToast}", and the Studio\'s starter mixes and current color are not reset for the new palette (applyPalette stops inside seedMixes). The same happens from the Studio\'s palette menu with "My paints (2)", and with one non-white paint alone. Cause: js/painting.js 745–767 skinMixes: white plus one paint gives seven candidate mixes (one per amount of white, line 752) for the eight skin tones (SKIN, 739–744), and "used" (759–764) keeps a candidate from serving twice, so the eighth tone finds none and line 765 reads best.c of null.` });
    await tab(page, 'game');
    const gp2 = await paletteOptions(page, '#gamePalette');
    t.check(gp2.options.some((o) => o[0] === 'mine' && o[1] === 'My paints (2)'), 'the game offers "My paints (2)"', gp2.options.map((o) => o[1]));
    await tab(page, 'battle');
    const vb2 = await paletteOptions(page, '#vb-palette');
    t.check(vb2.options.some((o) => o[0] === 'mine' && o[1] === 'My paints (2)'), 'Value battle offers "My paints (2)"', vb2.options.map((o) => o[1]));
    ps = await paletteOptions(page, '#ps-palette');
    t.check(ps.options.some((o) => o[0] === 'mine' && o[1] === 'My paints (2)') && ps.value === 'mine', 'the Studio lists My paints (2) and follows the suggestion, which is those two paints', ps);
    await tab(page, 'study');
    await clean(t, page, 'one and two paints');

    // a known palette's paints in one go, twice, then another on top
    await click(page, '#mineEdit'); await sleep(100);
    const tickPreset = async (id) => { await resetToast(page); await page.evaluate((v) => { const s = document.getElementById('paintAddPreset'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, id); await sleep(100); return { toast: await text(page, '#toast'), ticked: await ticked(page), select: await page.evaluate(() => document.getElementById('paintAddPreset').value), count: await text(page, '#paintDialogCount') }; };
    const reilly = all.find((p) => p.id === 'reilly');
    const r1 = await tickPreset('reilly');
    t.check(r1.toast === `Ticked the ${reilly.paints.length} paints of Frank Reilly` && r1.ticked.length === 10 && reilly.paints.every((c) => r1.ticked.includes(c)) && r1.select === '' && r1.count === '10 ticked', 'Tick a known palette: Reilly\'s ten go on (white and black were there), the toast says so, the menu resets', r1);
    const r2 = await tickPreset('reilly');
    t.check(r2.ticked.length === 10 && r2.toast === r1.toast, 'the same palette again changes nothing and says the same', r2);
    const schmid = all.find((p) => p.id === 'schmid');
    const r3 = await tickPreset('schmid');
    const union = new Set([...reilly.paints, ...schmid.paints]);
    t.check(r3.ticked.length === union.size && [...union].every((c) => r3.ticked.includes(c)) && r3.count === `${union.size} ticked`, `a second palette on top: the union (${union.size}), nothing unticked`, r3);
    const r4 = await tickPreset('');
    t.check(r4.ticked.length === union.size && r4.toast === '', 'the menu\'s heading row ticks nothing', r4);
    await click(page, '#paintDialogDone'); await suggestedDone(page);
    t.check((await text(page, '#mineCount')) === `${union.size} paints ticked`, `the pane counts ${union.size} paints`, await text(page, '#mineCount'));
    await clean(t, page, 'tick a known palette');

    // Suggest at every size 3..10 from those paints
    for (let size = 3; size <= 10; size++) {
      await setRange(page, '#paintMax', String(size));
      t.check((await text(page, '#paintMaxOut')) === `${size} + white`, `size ${size}: the output reads "${size} + white"`, await text(page, '#paintMaxOut'));
      await click(page, '#suggestBtn'); await suggestedDone(page); await mixed(page);
      const cs = await chips(page);
      t.check(cs[0] === 'TW' && cs.length >= 3 && cs.length <= size + 1 && cs.every((c) => union.has(c)) && new Set(cs).size === cs.length, `size ${size}: white first, 3 to ${size + 1} distinct paints, all from the ticked ones`, cs);
      const rm = reachOf(await text(page, '#resultMatch'));
      t.check(rm && rm[1] === n && rm[0] <= n && (await rows(page)).length === n, `size ${size}: the match and the rows count this study's ${n} colors`, [await text(page, '#resultMatch'), (await rows(page)).length]);
      t.check(JSON.parse(await storageGetRaw(page, K.choice)).max === size, `size ${size}: saved`, await storageGetRaw(page, K.choice));
    }
    await clean(t, page, 'every size');

    // the search, an empty search, Untick all, then all 77
    await click(page, '#mineEdit'); await sleep(100);
    await page.fill('#paintSearch', 'cadmium'); await sleep(100);
    const q1 = await page.evaluate(() => ({ shown: [...document.querySelectorAll('#paintCats li')].filter((li) => !li.hidden).map((li) => li.dataset.search), cats: [...document.querySelectorAll('#paintCats .paint-cat')].filter((s) => !s.hidden).length }));
    t.check(q1.shown.length > 0 && q1.shown.every((s) => s.includes('cadmium')) && q1.cats > 0, 'searching "cadmium" keeps only the cadmiums and their families', [q1.shown.length, q1.cats]);
    await page.fill('#paintSearch', 'PBr7'); await sleep(100);
    const q2 = await page.evaluate(() => [...document.querySelectorAll('#paintCats li')].filter((li) => !li.hidden).length);
    t.check(q2 === 4, 'a pigment code finds its paints (PBr7: four earths)', q2);
    await page.fill('#paintSearch', 'zzqx'); await sleep(100);
    const q3 = await page.evaluate(() => ({ shown: [...document.querySelectorAll('#paintCats li')].filter((li) => !li.hidden).length, cats: [...document.querySelectorAll('#paintCats .paint-cat')].filter((s) => !s.hidden).length, said: [...document.querySelectorAll('#paintDialog *')].some((e) => e.children.length === 0 && !e.hidden && e.closest('.paint-cat') === null && /no (paint|match)|nothing|not found/i.test(e.textContent)) }));
    t.check(q3.shown === 0 && q3.cats === 0, 'a search that matches nothing hides every paint', q3);
    t.check(q3.said, 'a search that matches nothing says so', q3);
    if (!q3.said) t.finding({ title: 'A paint search with no match shows a blank list and no word about it', severity: 'low', steps: '1. Advanced mode, Colors and paints, My paints, Choose my paints. 2. Type "zzqx" (or a misspelt name) in "Find a paint or pigment".', expected: 'A line such as "No paint matches zzqx" under the search.', actual: 'Every family and paint is hidden and nothing is written in their place; the dialog is empty below the tools. Cause: js/palette.js 422–433 hides the rows and sections that do not match and never writes a message for an empty result.' });
    await page.fill('#paintSearch', ''); await sleep(100);
    t.check((await page.evaluate(() => [...document.querySelectorAll('#paintCats li')].filter((li) => !li.hidden).length)) === 77, 'clearing the search shows all 77 again');
    await page.fill('#paintSearch', 'blue'); await sleep(100);
    await click(page, '#paintNone'); await sleep(100);
    t.check((await ticked(page)).length === 0 && (await text(page, '#paintDialogCount')) === '', 'Untick all empties the ticks (those hidden by the search too) and blanks the count', [(await ticked(page)).length, await text(page, '#paintDialogCount')]);
    await click(page, '#paintNone'); await sleep(50);
    t.check((await ticked(page)).length === 0, 'Untick all with nothing ticked is harmless');
    await click(page, '#paintDialogDone'); await sleep(200);
    t.check((await page.evaluate(() => document.getElementById('paintSearch').value)) === '' && !(await dialogOpen(page)), 'Done closes the dialog and clears the search for next time');
    await suggestedDone(page);
    t.check((await text(page, '#mineCount')) === 'No paints ticked yet: suggestions come from the whole library.' && (await text(page, '#resultAbout')).startsWith('Chosen from the whole library'), 'after Untick all the pane and the new suggestion say the whole library', [await text(page, '#mineCount'), await text(page, '#resultAbout')]);
    await clean(t, page, 'search and untick');

    await click(page, '#mineEdit'); await sleep(100);
    const everyCode = await page.evaluate(() => Paints.LIBRARY.map((p) => p.code));
    await setMine(page, everyCode);
    t.check((await text(page, '#paintDialogCount')) === '77 ticked', 'all 77 ticked: the dialog counts them', await text(page, '#paintDialogCount'));
    await click(page, '#paintDialogDone'); await suggestedDone(page); await mixed(page);
    const s77 = { count: await text(page, '#mineCount'), chips: await chips(page), about: await text(page, '#resultAbout') };
    t.check(s77.count === '77 paints ticked' && s77.chips.length >= 3 && s77.chips.length <= 11 && s77.chips[0] === 'TW' && s77.about.startsWith('Chosen from your paints'), 'all 77 ticked: a suggestion of at most 10 + white from "your paints"', s77);
    t.note(`All 77 ticked at size 10 suggests ${s77.chips.join(', ')}; the whole library at size 6 suggested ${s0.chips.join(', ')}.`);
    await page.reload({ waitUntil: 'load' }); await sleep(300); await settled(page);
    const back = await page.evaluate(() => ({ count: document.getElementById('mineCount').textContent, mine: document.getElementById('srcMine').checked, max: document.getElementById('paintMax').value, result: document.getElementById('paintResult').hidden, btn: document.getElementById('suggestBtn').textContent, state: document.getElementById('colorsState').textContent }));
    t.check(back.count === '77 paints ticked' && back.mine && back.max === '10', 'after a reload the ticks, the source and the size are back', back);
    t.check(back.result && back.btn === 'Suggest a palette' && back.state === '3 per value', 'after a reload there is no suggestion until asked; the page says so by its button and header', back);
    await tab(page, 'game');
    t.check((await paletteOptions(page, '#gamePalette')).options.some((o) => /^My paints \(77\)/.test(o[1])), 'the game offers "My paints (77)"', (await paletteOptions(page, '#gamePalette')).options.map((o) => o[1]));
    await tab(page, 'study');
    await clean(t, page, 'all 77');

    // keyboard only: open the library with Enter, tick with Space, close with Escape
    await page.focus('#mineEdit'); await page.keyboard.press('Enter'); await sleep(200);
    t.check(await dialogOpen(page), 'Enter on Choose my paints opens the library');
    let onBox = false;
    for (let i = 0; i < 8 && !onBox; i++) { await page.keyboard.press('Tab'); onBox = await page.evaluate(() => document.activeElement && document.activeElement.type === 'checkbox' && document.activeElement.closest('#paintCats') !== null); }
    const boxCode = await page.evaluate(() => document.activeElement.value);
    await page.keyboard.press('Space'); await sleep(50);
    const nowTicked = await ticked(page);
    t.check(onBox && nowTicked.length === 76 && !nowTicked.includes(boxCode), `Tab reaches a paint and Space unticks it (${boxCode})`, [onBox, nowTicked.length]);
    await page.keyboard.press('Escape'); await sleep(200);
    t.check(!(await dialogOpen(page)), 'Escape closes the library');
    await suggestedDone(page);
    t.check((await text(page, '#mineCount')) === '76 paints ticked' && (await text(page, '#suggestBtn')) === 'Suggest again', 'Escape after a change counts the paints again and suggests again', [await text(page, '#mineCount'), await text(page, '#suggestBtn')]);
    await page.focus('#srcPreset'); await page.keyboard.press('Space'); await sleep(100);
    await ranked(page);
    await page.focus('#presetList li:nth-child(2) .preset'); await page.keyboard.press('Enter'); await mixed(page);
    const second = (await presetList(page))[1];
    t.check(second.pressed && (await text(page, '#resultName')) === all.find((p) => p.id === second.id).name, 'Space on Known palettes, Enter on a palette button chooses it', [second.id, await text(page, '#resultName')]);
    await clean(t, page, 'keyboard');
    await page.context().close();
  }

  // ---- two races inside a running suggestion (the whole library at size 10 takes about half a second) ----------
  let raceA = null, raceB = null;
  for (const round of [1, 2]) {
    // a) switching the source away and back while it runs
    const page = await openPage(site, { storage: { ...ADV, [K.choice]: '{"source":"mine","preset":"","max":10}' } });
    await settled(page); await sleep(200);
    const race = await page.evaluate(() => {
      const b = document.getElementById('suggestBtn');
      b.click();
      const during = b.textContent;
      document.getElementById('srcPreset').click();
      document.getElementById('srcMine').click();
      return { during, disabled: b.disabled, after: b.textContent };
    });
    await page.waitForFunction(() => !document.getElementById('suggestBtn').disabled, null, { timeout: 6000 }).catch(() => null);
    const after = await page.evaluate(() => ({ disabled: document.getElementById('suggestBtn').disabled, text: document.getElementById('suggestBtn').textContent, result: document.getElementById('paintResult').hidden, mine: document.getElementById('srcMine').checked }));
    if (!/^Choosing paints/.test(race.during)) t.note(`round ${round}: the suggestion finished within its first step, so the source-switch race could not be driven (button read "${race.during}").`);
    else {
      t.check(!after.disabled && /^Suggest (a palette|again)$/.test(after.text), `round ${round}: Suggest is usable again after switching the source away and back mid-run`, { race, after });
      if (after.disabled) raceA = { race, after };
    }
    await clean(t, page, `race a round ${round}`);
    await page.context().close();

    // b) a new study result while it runs: the first suggestion ever is kept, chosen for the old colors
    const p2 = await openPage(site, { storage: { ...ADV, [K.choice]: '{"source":"mine","preset":"","max":10}' } });
    await settled(p2); await sleep(200);
    const n3 = await nColors(p2);
    const during = await p2.evaluate(() => {
      document.getElementById('suggestBtn').click();
      const t0 = document.getElementById('suggestBtn').textContent;
      const c = document.getElementById('colors'); c.value = '1'; c.dispatchEvent(new Event('input', { bubbles: true }));
      return t0;
    });
    await suggestedDone(p2); await settled(p2); await mixed(p2);
    const n1 = await nColors(p2);
    const stale = { match: await text(p2, '#resultMatch'), chips: await chips(p2), about: await text(p2, '#resultAbout'), rows: (await rows(p2)).length, shown: await visible(p2, '#paintResult') };
    await click(p2, '#suggestBtn'); await suggestedDone(p2); await mixed(p2);
    const fresh = { match: await text(p2, '#resultMatch'), chips: await chips(p2) };
    if (!/^Choosing paints/.test(during)) t.note(`round ${round}: the suggestion finished within its first step, so the new-result race could not be driven.`);
    else {
      const rm = reachOf(stale.match);
      const consistent = stale.shown && rm && rm[1] === n1 && rm[0] <= n1 && JSON.stringify(stale.chips) === JSON.stringify(fresh.chips) && stale.match === fresh.match;
      t.check(consistent, `round ${round}: a result that changes mid-suggestion gets a suggestion for the new colors`, { n3, n1, stale, fresh });
      if (!consistent) raceB = { n3, n1, stale, fresh, rm };
    }
    await clean(t, p2, `race b round ${round}`);
    await p2.context().close();
  }
  if (raceA) t.finding({ title: 'Switching to Known palettes while a suggestion runs leaves Suggest a palette dead, stuck on "Choosing paints… N%"', severity: 'high', steps: '1. Advanced mode, Colors and paints, My paints, Paints on the palette at 10, nothing ticked (so the suggestion takes about half a second). 2. Press Suggest a palette. 3. While the button reads "Choosing paints…", press Known palettes, then My paints again.', expected: 'The suggestion is cancelled and the button reads "Suggest a palette" again (or the suggestion is made again for My paints).', actual: `The button stays disabled and reads "${raceA.after.text}" for good (seen in both rounds); no result shows, and nothing on the page can start a suggestion until a paint is ticked or unticked in Choose my paints (or the study changes after an earlier suggestion). Cause: js/palette.js 326 (refresh, the preset branch) cancels the "suggest" job, but the button is only re-enabled in that job's done callback (225–226), which a cancelled job never reaches; the "mine" branch (335–337) does not restart it.` });
  if (raceB) t.finding({ title: 'A study that changes while the first suggestion runs keeps that suggestion, chosen for the old colors, and reports it as this study\'s', severity: 'medium', steps: '1. Advanced mode, Colors and paints, My paints, Paints on the palette at 10, nothing ticked. 2. Press Suggest a palette and, while it reads "Choosing paints…", move Colors in each value from 3 to 1 (or load another photo).', expected: 'The suggestion is made again for the new study, as the result\'s own note promises ("Change the photo or settings and it is chosen again").', actual: `The palette chosen for the ${raceB.n3}-color study is shown for the ${raceB.n1}-color one: "${raceB.stale.match}" (${raceB.rm ? raceB.rm[0] : '?'} reached out of ${raceB.n1}), paints ${raceB.stale.chips.join(' ')}; Suggest again gives "${raceB.fresh.match}" with ${raceB.fresh.chips.join(' ')} (seen in both rounds). Cause: js/palette.js 358–361 (studio:result) calls refresh(), whose "mine" branch (330–338) only re-suggests when a suggestion already exists; with none yet it hides the result and lets the running job finish (220–231), which stores picks and coverage made from the old colors and shows them (234–238) against the new study's color count.` });

  // ---- Simple mode: three palettes with a reason; a saved source Simple cannot show --------------------------------
  {
    const page = await openPage(site, { storage: { [K.drawers]: '["colors"]' } });
    await settled(page); await ranked(page);
    const list = await presetList(page);
    const shown = list.filter((l) => l.shown);
    const why = { zorn: 'Four colors. The easiest way to mix skin.', primary: 'A yellow, a red and a blue. Mix every color yourself.', rembrandt: 'Earth colors, for the old-master look.' };
    t.check(shown.length === 3 && shown.every((l) => why[l.id] === l.why), 'Simple mode offers Zorn, Three primaries and Rembrandt, each with its reason', shown.map((l) => [l.id, l.why]));
    t.check(!(await visible(page, '#srcMine')) && !(await visible(page, '#minePane')) && !(await visible(page, '#lean')), 'Simple mode hides My paints and the lighter-tones lean');
    const bestShown = shown.some((l) => l.best);
    t.note(`Simple mode on the sample: the "Best match" badge is ${bestShown ? 'on a shown palette' : `on ${list.find((l) => l.best).id}, which Simple hides, so no shown palette carries it though the hint says "Best match first"`}.`);
    await pickPreset(page, 'primary');
    t.check((await text(page, '#resultName')) === 'Three primaries' && (await rows(page)).length === (await nColors(page)), 'picking a Simple palette shows its mixes', [await text(page, '#resultName'), (await rows(page)).length]);
    // Advanced, My paints, then Simple: nothing to choose from
    await click(page, '[data-mode="advanced"]'); await sleep(100);
    await click(page, '#srcMine'); await sleep(100);
    await click(page, '[data-mode="simple"]'); await settled(page); await sleep(300);
    const simpleMine = async () => page.evaluate(() => ({ presets: getComputedStyle(document.getElementById('presetPane')).display !== 'none' && !document.getElementById('presetPane').hidden, mine: getComputedStyle(document.getElementById('minePane')).display !== 'none', result: !document.getElementById('paintResult').hidden, resultName: document.getElementById('resultName').textContent, heading: getComputedStyle(document.querySelector('#paints > h3')).display !== 'none', state: document.getElementById('colorsState').textContent }));
    let sm = await simpleMine();
    t.check(sm.presets, 'Simple mode after choosing My paints in Advanced still offers its three palettes', sm);
    await page.reload({ waitUntil: 'load' }); await sleep(300); await settled(page); await sleep(300);
    sm = await simpleMine();
    t.check(sm.presets, 'and after a reload too', sm);
    if (!sm.presets) t.finding({ title: 'Simple mode shows no palette at all once My paints was chosen in Advanced: "Paints to use" is an empty heading', severity: 'medium', steps: '1. Switch to Advanced, open Colors and paints, choose My paints. 2. Switch back to Simple (the choice is saved, so a reload lands here too). 3. Open Colors and paints.', expected: 'Simple mode offers its three palettes (Zorn, Three primaries, Rembrandt), as the README says it does.', actual: `Under "Paints to use" there is nothing: the Known palettes pane is hidden because the saved source is "mine" and the My paints pane is hidden because Simple hides every advanced control; no result either (${JSON.stringify(sm)}). The visitor cannot pick a palette without finding the Advanced switch. Cause: js/palette.js 322–323 hides #presetPane whenever choice.source is not "preset", and nothing resets the source when the mode changes (app.js 2598–2604 setMode); styles.css 1585 hides #minePane (class "advanced") in Simple mode.` });
    await clean(t, page, 'simple mode');
    await page.context().close();

    // a palette picked in Advanced that Simple does not list
    const p3 = await openPage(site, { storage: { [K.drawers]: '["colors"]', [K.choice]: '{"source":"preset","preset":"schmid","max":6}' } });
    await settled(p3); await ranked(p3); await mixed(p3);
    const l3 = await presetList(p3);
    t.note(`Simple mode with Richard Schmid saved from Advanced: the result shows "${await text(p3, '#resultName')}" and the header "${await text(p3, '#colorsState')}", while ${l3.filter((l) => l.shown && l.pressed).length} of the three shown palettes is pressed (the chosen one is hidden). The choice is kept, as the README says, but Simple cannot show which it is.`);
    await clean(t, p3, 'simple with a hidden choice');
    await p3.context().close();
  }

  // ---- hostile saved state: myPaints --------------------------------------------------------------------------
  {
    const big = JSON.stringify(Array.from({ length: 20000 }, (_, i) => (i % 2 ? 'YO' : 'nope')));
    const cases = [
      ['"TW"', 0], ['["TW",5,null,"constructor","__proto__",{"a":1},"zorn","tw"]', 1], ['{"0":"TW"}', 0], ['NaN', 0], ['[]', 0], ['null', 0], ['not json', 0], ['', 0],
      ['[["TW"]]', 0], ['["__proto__","constructor","toString","hasOwnProperty","valueOf"]', 0], ['["TW","TW","IB","YO"]', 3], [big, 1], ['["TW","IB","YO"]', 3],
    ];
    for (const [raw, want] of cases) {
      const page = await openPage(site, { storage: { ...ADV, [K.mine]: raw, [K.choice]: '{"source":"mine","preset":"","max":6}' } });
      await settled(page); await sleep(100);
      const count = want ? `${want} paint${want === 1 ? '' : 's'} ticked` : 'No paints ticked yet: suggestions come from the whole library.';
      t.check((await text(page, '#mineCount')) === count, `myPaints ${raw.slice(0, 40)}: the pane counts ${want}`, await text(page, '#mineCount'));
      await click(page, '#mineEdit'); await sleep(150);
      t.check((await ticked(page)).length === want && (await text(page, '#paintDialogCount')) === (want ? `${want} ticked` : ''), `myPaints ${raw.slice(0, 40)}: the library ticks ${want}`, [(await ticked(page)).length, await text(page, '#paintDialogCount')]);
      await click(page, '#paintDialogDone'); await sleep(100);
      await click(page, '#suggestBtn'); await suggestedDone(page); await mixed(page);
      t.check((await chips(page)).length >= 1 && (await rows(page)).every((r) => BADGES.includes(r.badge)), `myPaints ${raw.slice(0, 40)}: Suggest still works`, await chips(page));
      if (raw === '["TW","TW","IB","YO"]') {
        await tab(page, 'game');
        const g = await paletteOptions(page, '#gamePalette');
        const mineOpt = g.options.find((o) => o[0] === 'mine');
        const ps = await paletteOptions(page, '#ps-palette');
        const mineStudio = ps.options.find((o) => o[0] === 'mine');
        t.check(mineOpt && /^My paints \(3\)/.test(mineOpt[1]) && mineStudio && mineStudio[1] === 'My paints (3)', 'a saved list with a paint twice: the game and the Studio count three paints, as the drawer does', [mineOpt, mineStudio]);
        if (mineOpt && !/^My paints \(3\)/.test(mineOpt[1])) t.finding({ title: 'A saved myPaints list with a paint twice is counted twice by the game, the Studio and Value battle', severity: 'low', steps: '1. Save portrait-value-studio.myPaints as ["TW","TW","IB","YO"] (a stray write; the drawer itself never writes a code twice). 2. Open Colors and paints (My paints), then Paint by numbers or the Studio.', expected: 'Three paints everywhere, as the drawer says ("3 paints ticked").', actual: `The game\'s palette menu says "${mineOpt[1]}" and the Studio\'s "${mineStudio && mineStudio[1]}", each listing titanium white twice (js/game.js 121–123, js/painting.js 109–110 and js/battle.js 47–48 filter unknown codes but not repeats; js/palette.js 71 reads the list into a Set).` });
        await tab(page, 'study');
      }
      await clean(t, page, `myPaints ${raw.slice(0, 30)}`);
      await page.context().close();
    }
  }

  // ---- hostile saved state: paintChoice ----------------------------------------------------------------------------
  {
    const deep = '{"source":{"a":{"b":{"c":1}}},"preset":[["zorn"]],"max":{"valueOf":1}}';
    const cases = [
      // [raw, source, pressed preset, max]
      ['"mine"', 'preset', '', '6'], ['{"source":"mine"}', 'mine', '', '6'], ['{"source":5,"preset":7,"max":"7"}', 'preset', '', '6'], ['{"source":"preset","preset":"nope","max":0}', 'preset', '', '6'],
      ['{"preset":"zorn","max":99}', 'preset', 'zorn', '6'], ['{"source":"mine","preset":"zorn","max":10}', 'mine', 'zorn', '10'], ['{"max":3.5}', 'preset', '', '6'], ['{"max":3}', 'preset', '', '3'], ['{"max":"3"}', 'preset', '', '6'],
      ['[]', 'preset', '', '6'], ['null', 'preset', '', '6'], ['{"__proto__":{"source":"mine","max":3,"preset":"zorn"}}', 'preset', '', '6'], ['{"constructor":{"prototype":{"source":"mine"}}}', 'preset', '', '6'],
      ['{"preset":"__proto__"}', 'preset', '', '6'], ['{"source":"mine","max":true}', 'mine', '', '6'], [deep, 'preset', '', '6'], ['{"preset":"Zorn"}', 'preset', '', '6'], ['{"max":-6}', 'preset', '', '6'], ['{"max":1e400}', 'preset', '', '6'],
    ];
    for (const [raw, source, pressed, max] of cases) {
      const page = await openPage(site, { storage: { ...ADV, [K.choice]: raw } });
      await settled(page);
      if (source === 'preset') await ranked(page);
      await sleep(150);
      const s = await page.evaluate(() => ({ source: document.querySelector('input[name="paintSource"]:checked').value, max: document.getElementById('paintMax').value, out: document.getElementById('paintMaxOut').textContent, pressed: [...document.querySelectorAll('#presetList .preset[aria-pressed="true"]')].map((b) => b.closest('li').dataset.preset), presetPane: !document.getElementById('presetPane').hidden, minePane: !document.getElementById('minePane').hidden, state: document.getElementById('colorsState').textContent, result: !document.getElementById('paintResult').hidden, name: document.getElementById('resultName').textContent }));
      const wantPressed = source === 'preset' && pressed ? [pressed] : [];
      t.check(s.source === source && s.max === max && s.out === `${max} + white` && JSON.stringify(s.pressed) === JSON.stringify(wantPressed) && s.presetPane === (source === 'preset') && s.minePane === (source === 'mine'), `paintChoice ${raw.slice(0, 44)}: source ${source}, max ${max}, pressed ${pressed || 'none'}`, s);
      const wantState = source === 'preset' && pressed ? `3 per value · ${pressed === 'zorn' ? 'Zorn' : pressed}` : '3 per value';
      t.check(s.state === wantState && s.result === (source === 'preset' && !!pressed), `paintChoice ${raw.slice(0, 44)}: the header and result agree`, [s.state, s.result, s.name]);
      // the drawer still works: a palette can be picked
      if (source === 'mine') { await click(page, '#srcPreset'); await ranked(page); }
      await pickPreset(page, 'zorn');
      t.check((await text(page, '#resultName')) === 'Zorn' && (await rows(page)).length === (await nColors(page)), `paintChoice ${raw.slice(0, 44)}: Zorn can still be picked`, await text(page, '#resultName'));
      const savedRaw = await storageGetRaw(page, K.choice);
      let saved = null; try { saved = JSON.parse(savedRaw); } catch (e) { saved = null; }
      const extras = saved && typeof saved === 'object' ? Object.keys(saved).filter((k) => !['source', 'preset', 'max'].includes(k)) : [];
      t.check(saved && saved.source === 'preset' && saved.preset === 'zorn' && Number.isInteger(saved.max) && saved.max >= 3 && saved.max <= 10, `paintChoice ${raw.slice(0, 44)}: the saved choice is rewritten with sound values`, savedRaw);
      if (extras.length) t.note(`paintChoice ${raw.slice(0, 44)}: the unknown key${extras.length === 1 ? '' : 's'} ${extras.join(', ')} ride along in every later save (js/palette.js 66 keeps every saved key beside the three it checks; harmless, but a stray write is never cleaned out).`);
      await clean(t, page, `paintChoice ${raw.slice(0, 30)}`);
      await page.context().close();
    }
  }

  // ---- hostile saved state: the picked colors the + button adds to ------------------------------------------------
  {
    const cases = [['"constructor"', 0], ['{"__proto__":{"r":1,"g":2,"b":3}}', 0], ['[{"r":"12","g":1,"b":1},{"r":1,"g":2,"b":3}]', 1], ['NaN', 0], ['[]', 0], ['not json', 0], ['[[1,2,3],null,{"r":300,"g":0,"b":0}]', 0]];
    for (const [raw, valid] of cases) {
      const page = await openPage(site, { storage: { ...ADV, [K.picked]: raw, [K.choice]: '{"source":"preset","preset":"zorn","max":6}' } });
      await settled(page); await ranked(page); await mixed(page);
      t.check((await pickedCount(page)) === valid, `picked ${raw.slice(0, 40)}: ${valid} sound color${valid === 1 ? '' : 's'} shown`, await pickedCount(page));
      await resetToast(page);
      await click(page, '#mixList .mix-row:last-child .mix-add'); await sleep(150);
      t.check((await pickedCount(page)) === valid + 1 && /^Added #[0-9A-F]{6}$/.test(await text(page, '#toast')), `picked ${raw.slice(0, 40)}: + still adds a color`, [await pickedCount(page), await text(page, '#toast')]);
      await clean(t, page, `picked ${raw.slice(0, 30)}`);
      await page.context().close();
    }
  }

  // ---- the phone: the drawer, the mixes, the library and a suggestion at 390 px ----------------------------------
  {
    const page = await openPage(site, { viewport: PHONE, storage: ADV });
    await settled(page); await ranked(page);
    t.check((await hscroll(page)) <= 0, 'phone: the open drawer with ten palettes brings no horizontal scroll', await hscroll(page));
    await pickPreset(page, 'reilly');
    const n = await nColors(page);
    await checkPalette(t, page, 'phone Reilly', (await presets(page)).find((p) => p.id === 'reilly').paints, n);
    t.check((await hscroll(page)) <= 0, 'phone: the mixes list brings no horizontal scroll', await hscroll(page));
    const b = await page.locator('#presetList li[data-preset="zorn"] .preset').boundingBox();
    t.check(b && b.height >= 40 && b.width >= 200, 'phone: a palette button is big enough to tap', b);
    await page.locator('#presetList li[data-preset="zorn"] .preset').scrollIntoViewIfNeeded();
    await page.locator('#presetList li[data-preset="zorn"] .preset').tap().catch(async () => page.locator('#presetList li[data-preset="zorn"] .preset').click());
    await mixed(page);
    t.check((await text(page, '#resultName')) === 'Zorn', 'phone: a tap picks a palette', await text(page, '#resultName'));
    await click(page, '#srcMine'); await sleep(100);
    await click(page, '#mineEdit'); await sleep(200);
    t.check((await dialogOpen(page)) && (await hscroll(page)) <= 0, 'phone: the library opens without horizontal scroll');
    const item = await page.locator('#paintCats li label').first().boundingBox();
    t.check(item && item.height >= 36, 'phone: a paint row is tall enough to tap', item);
    await setMine(page, ['TW', 'YO', 'CRL', 'IB', 'UB']);
    await click(page, '#paintDialogDone'); await suggestedDone(page); await mixed(page);
    t.check((await chips(page)).length >= 3 && (await chips(page)).length <= 6 && (await hscroll(page)) <= 0, 'phone: a suggestion from five paints shows without horizontal scroll', await chips(page));
    await click(page, '#blockViewPalette');
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 20000 }).catch(() => null);
    t.check((await text(page, '#blockViewPalette')) === 'Suggested' && (await hscroll(page)) <= 0, 'phone: the block-view switch names the suggested palette and fits', await text(page, '#blockViewPalette'));
    await clean(t, page, 'phone');
    await page.context().close();
  }
}

// a saved value, raw and parsed
const storageGetRaw = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const storageGetJson = async (page, key) => { const raw = await storageGetRaw(page, key); try { return JSON.parse(raw); } catch (e) { return raw; } };
