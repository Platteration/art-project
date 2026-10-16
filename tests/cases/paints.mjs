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
// Then the second pass (GAP_BLOCKS at the end of the file, one block per promise the first pass left
// unchecked): every badge against the ΔE it promises, a recipe of at most three paints plus white, the
// meters against the coverage they come from, the pigment model and its tinting strengths, a finished
// suggestion made again for a new photo or setting, the palette Simple mode uses before a choice, whites
// and no white, the greedy choice size by size, flat and noisy photos, the drawer opened by its summary,
// the source switched back and forth, Forget, the palette block view against the rows, axe over the open
// drawer and the dialog, the toast, the Studio that stops following, races, two tabs, no storage, the
// pending states, names and titles, search by family, + with the drawer closed, the phone's dialog, and
// the keyboard's reach.
// The third pass (round3 blocks at the very end): the recipes' arithmetic against the pigment model and the colors
// at the ends (pure white, pure black, a green no palette reaches, a very dark green), the meters against the rows
// they head, My paints with one or two paints that are not white and with all 77 against none, and the ranking of
// an unchanged study.
import { openPage, newTab, clean, tab, PHONE, makeImage, loadPhoto, click, text, visible, hscroll, sleep, storageKeys, storageGet, axe } from '../lib.mjs';

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
// an action that starts a suggestion later (the library's close event is queued): the rows and chips on the page
// are stamped first, and the wait holds until new ones have replaced them and every row is worked out
async function afterSuggest(page, action) {
  await page.evaluate(() => document.querySelectorAll('#mixList .mix-row, #resultPaints .paint-chip').forEach((e) => { e.dataset.old = '1'; }));
  await action();
  await page.waitForFunction(() => { const b = document.getElementById('suggestBtn'); const rows = document.querySelectorAll('#mixList .mix-row'); return !b.disabled && b.textContent === 'Suggest again' && !document.querySelector('#mixList [data-old], #resultPaints [data-old]') && rows.length > 0 && [...rows].every((r) => r.querySelector('.mix-badge') && !r.querySelector('.mix-pending')); }, null, { timeout: 30000 }).catch(() => null);
}
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#mixList .mix-row')].map((r) => {
  const badge = r.querySelector('.mix-badge');
  return { zone: r.querySelector('.mix-zone').textContent, recipe: r.querySelector('.mix-recipe').textContent, title: r.querySelector('.mix-recipe').title, badge: badge ? badge.textContent : '', status: badge ? badge.dataset.status : '', add: r.querySelector('.mix-add').getAttribute('aria-label'), mixTitle: r.querySelector('.mix-chip:nth-child(2)').title };
}));
const chips = (page) => page.evaluate(() => [...document.querySelectorAll('#resultPaints .paint-code')].map((e) => e.textContent));
const presetList = (page) => page.evaluate(() => [...document.querySelectorAll('#presetList li')].map((li) => {
  const b = li.querySelector('.preset');
  return { id: li.dataset.preset, simple: 'simple' in li.dataset, pressed: b.getAttribute('aria-pressed') === 'true', label: b.getAttribute('aria-label'), best: [...li.querySelectorAll('.preset-best, .preset-best-simple')].some((e) => getComputedStyle(e).display !== 'none'), reach: li.querySelector('.preset-reach').textContent, dots: li.querySelectorAll('.paint-dot').length, why: (li.querySelector('.preset-why') || {}).textContent || '', shown: getComputedStyle(li).display !== 'none' };
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

// ---- helpers of the second pass (GAP_BLOCKS) ---------------------------------------------------------------
// small tools left in the page (installed again after a reload): a hex to Lab, ΔE00 between two hexes, a paint
// made the way palette.js makes it, and the study's colors as palette.js reads them (share > 0, weight √share)
const qInstall = (page) => page.evaluate(() => {
  if (window.__q) return;
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const labOf = (h) => Study.rgbToLab(...hexRgb(h));
  window.__q = {
    hexRgb,
    labOf,
    dE: (a, b) => Study.deltaE2000(...labOf(a), ...labOf(b)),
    paint: (code) => Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(code))),
    colors: () => Studio.result().blockColors.filter((c) => c.share > 0).map((c) => ({ rgb: { r: c.r, g: c.g, b: c.b }, weight: Math.sqrt(c.share) })),
  };
});
// an image of flat bands, top to bottom: [[color, height in px], ...] on a 600 x 800 canvas
async function bandsImage(page, bands, name = 'bands.png') {
  const dataUrl = await page.evaluate((bands) => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); let y = 0;
    for (const [color, h] of bands) { g.fillStyle = color; g.fillRect(0, y, 600, h); y += h; }
    return c.toDataURL('image/png');
  }, bands);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  return { name, mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}
// each row's badge and the ΔE00 between its target color and its predicted mix (both read off the page's own hexes)
const rowDeltas = async (page) => {
  await qInstall(page);
  return page.evaluate(() => [...document.querySelectorAll('#mixList .mix-row')].map((row) => {
    const b = row.querySelector('.mix-badge');
    const tgt = /#[0-9A-F]{6}/.exec(row.querySelector('.mix-add').getAttribute('aria-label'));
    const pred = /#[0-9A-F]{6}/.exec(row.querySelector('.mix-chip:nth-child(2)').title);
    return { status: b ? b.dataset.status : '', badge: b ? b.textContent : '', dE: tgt && pred ? window.__q.dE(tgt[0], pred[0]) : NaN, hex: tgt ? tgt[0] : '', recipe: row.querySelector('.mix-recipe').textContent };
  }));
};
// nothing has changed for `ms` ms: the study's result, the suggestion and the mixes all at rest
const quiet = (page, ms = 500) => page.waitForFunction((ms) => {
  const w = window.__quiet = window.__quiet || { r: null, t: 0 };
  const r = window.Studio && Studio.result();
  const rows = document.querySelectorAll('#mixList .mix-row');
  const resting = document.getElementById('busy').hidden && !document.getElementById('suggestBtn').disabled && [...rows].every((x) => x.querySelector('.mix-badge') && !x.querySelector('.mix-pending'));
  const now = performance.now();
  if (w.r !== r || !resting) { w.r = r; w.t = now; return false; }
  return now - w.t >= ms;
}, ms, { timeout: 30000, polling: 100 }).catch(() => null);
const optionValues = (page, sel) => page.evaluate((s) => [...document.querySelector(s).options].map((o) => o.value), sel);
const tickDialog = async (page, codes) => { await click(page, '#mineEdit'); await sleep(100); await setMine(page, codes); };
// a page opened in Advanced with the drawer open and the study done (and the ten palettes ranked, unless the saved source is My paints)
const advPage = async (site, extra = {}, { rank = true, ...opts } = {}) => {
  const page = await openPage(site, { storage: { ...ADV, ...extra }, ...opts });
  await settled(page);
  if (rank) await ranked(page);
  return page;
};
const MINE = (max = 4) => ({ [K.choice]: JSON.stringify({ source: 'mine', preset: '', max }) });
const suggestNow = async (page) => { await click(page, '#suggestBtn'); await suggestedDone(page); await mixed(page); };
// an action that changes the study (a photo, a slider) while a suggestion is on screen: stamps the rows, waits for the new
// study result and then for rows and button to be at rest again. Resolves to whether the study result changed at all.
async function afterChange(page, action) {
  await page.evaluate(() => { window.__r0 = Studio.result(); document.querySelectorAll('#mixList .mix-row, #resultPaints .paint-chip').forEach((e) => { e.dataset.old = '1'; }); });
  await action();
  const changed = await page.waitForFunction(() => Studio.result() !== window.__r0, null, { timeout: 10000 }).then(() => true).catch(() => false);
  if (changed) await page.waitForFunction(() => { const b = document.getElementById('suggestBtn'); const rs = document.querySelectorAll('#mixList .mix-row'); return document.getElementById('busy').hidden && !b.disabled && b.textContent === 'Suggest again' && !document.querySelector('#mixList [data-old], #resultPaints [data-old]') && rs.length > 0 && [...rs].every((r) => r.querySelector('.mix-badge') && !r.querySelector('.mix-pending')); }, null, { timeout: 30000 }).catch(() => null);
  return changed;
}
// the result block as the visitor reads it, and the palette the rest of the page uses
const shownResult = (page) => page.evaluate(() => ({
  hidden: document.getElementById('paintResult').hidden, name: document.getElementById('resultName').textContent, match: document.getElementById('resultMatch').textContent,
  about: document.getElementById('resultAbout').textContent, btn: document.getElementById('suggestBtn').textContent, state: document.getElementById('colorsState').textContent,
  colors: document.getElementById('colors').value, chips: [...document.querySelectorAll('#resultPaints .paint-code')].map((e) => e.textContent),
  rows: document.querySelectorAll('#mixList .mix-row').length, cur: (StudioPalette.current() || {}).codes || [],
}));
const shortName = (name) => name.replace(/\s*\(.*\)$/, '').replace(/ palette$/i, '');
const selectedText = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e && e.options[e.selectedIndex] ? e.options[e.selectedIndex].textContent : null; }, sel);
const setSelect = (page, sel, v) => page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const tickPresetIn = (page, id) => page.evaluate((v) => { const s = document.getElementById('paintAddPreset'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, id);
const blockBusy = (page) => page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 20000 }).catch(() => null);
const paintCodes = (page) => page.evaluate(() => [...document.querySelectorAll('#ps-paints .ps-paint')].map((b) => b.dataset.code));

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
  const ds = await checkBadges(t, page, label);
  // "Mixes N of M" comes from the quick search (single paints and pairs); the rows are the full recipes, which come out as close or closer
  const reach = reachOf(await text(page, '#resultMatch'));
  const within = ds.filter((d) => d.dE < 6.35).length;
  const reachOk = t.check(reach && within >= reach[0], `${label}: the rows that come within ΔE 6 (${within}) are at least the colors "Mixes N of M" promises (${reach && reach[0]})`, [within, reach]);
  if (!reachOk && reach) (t.reachMismatch = t.reachMismatch || []).push({ label, reach, within, off: ds.filter((d) => d.dE >= 6.35).map((d) => `${d.hex} ${d.recipe} (ΔE ${d.dE.toFixed(1)}, "${d.badge}")`) });
  checkRecipes(t, label, rs, await whiteMap(page));
  // the chips under the name carry each paint's full name (the only place a phone, with no hover, shows it)
  const chipNames = await page.evaluate(() => [...document.querySelectorAll('#resultPaints .paint-chip')].map((li) => ({ code: li.querySelector('.paint-code').textContent, name: li.querySelector('.paint-name').textContent, shown: li.querySelector('.paint-name').getClientRects().length > 0, dot: li.querySelector('.paint-dot').title })));
  t.check(chipNames.length === codes.length && chipNames.every((c, i) => c.code === codes[i] && c.name === byCode[c.code] && c.dot === byCode[c.code] && c.shown), `${label}: every chip shows its paint's full name, and its dot says it too`, chipNames);
  return rs;
}

const whiteMap = (page) => page.evaluate(() => Object.fromEntries(Paints.LIBRARY.map((p) => [p.code, Mixing.makePaint(Object.assign({ strength: 'normal' }, p)).white])));
// Close is a ΔE00 under 3, Near under 6, Out of reach more; a value limit is never a mix that is Close. The predicted
// color on the page is rounded to an sRGB hex, so a band's edge is allowed a little (TOL)
const WORD = { close: 'Close', near: 'Near', far: 'Out of reach' };
async function checkBadges(t, page, label) {
  const TOL = 0.35;
  const ds = await rowDeltas(page);
  const word = ds.every((d) => (d.status === 'limit' ? /^(Darkest|Lightest) you can mix$/.test(d.badge) : WORD[d.status] === d.badge));
  const band = ds.every((d) => Number.isFinite(d.dE) && (d.status === 'close' ? d.dE < 3 + TOL : d.status === 'near' ? d.dE >= 3 - TOL && d.dE < 6 + TOL : d.status === 'far' ? d.dE >= 6 - TOL : d.dE >= 3 - TOL));
  t.check(ds.length > 0 && word, `${label}: each badge's word is the one its status gives`, ds.map((d) => [d.status, d.badge]));
  t.check(ds.length > 0 && band, `${label}: every badge agrees with the ΔE between the color and its predicted mix (Close under 3, Near under 6, Out of reach beyond, a limit never Close)`, ds.map((d) => [d.status, +d.dE.toFixed(2)]));
  return ds;
}
// a recipe is up to three paints plus white (at most 24 whole parts), a paint once, and a lone main paint has no number
function checkRecipes(t, label, rs, white) {
  const parsed = rs.map((r) => r.recipe.split(' · ').map((p) => { const [code, amt] = p.split('\u00a0'); return { code, amt }; }));
  t.check(parsed.every((ps) => ps.length <= 4 && ps.filter((p) => !white[p.code]).length <= 3), `${label}: no recipe holds more than three paints plus white`, rs.map((r) => r.recipe).filter((x, i) => parsed[i].length > 4 || parsed[i].filter((p) => !white[p.code]).length > 3));
  t.check(parsed.every((ps) => new Set(ps.map((p) => p.code)).size === ps.length), `${label}: no recipe names a paint twice`, rs.map((r) => r.recipe));
  t.check(parsed.every((ps) => ps.filter((p) => /^\d+$/.test(p.amt || '')).reduce((a, p) => a + +p.amt, 0) <= 24), `${label}: no recipe is more than 24 whole parts`, rs.map((r) => r.recipe));
  const lone = parsed.every((ps) => { const main = ps.filter((p) => p.amt !== 'touch'); return main.length >= 1 && (main.length === 1 ? main[0].amt === undefined : main.every((p) => /^\d+$/.test(p.amt || ''))); });
  t.check(lone, `${label}: a lone main paint carries no number, several carry whole parts, the rest are touches`, rs.map((r) => r.recipe));
}
// the meters are the count Mixing.coverage gives for this study, and palettes of the same reach run closest first
async function checkRanking(t, page, label) {
  await qInstall(page);
  const r = await page.evaluate(() => {
    const q = window.__q, colors = q.colors();
    return [...document.querySelectorAll('#presetList li')].map((li) => {
      const pr = Paints.PRESETS.find((p) => p.id === li.dataset.preset);
      const cov = Mixing.coverage(pr.paints.map(q.paint), colors);
      return { id: pr.id, shown: +li.querySelector('.preset-reach').textContent.split(' / ')[0], reached: cov.reached, score: cov.score };
    });
  });
  t.check(r.length === 10 && r.every((x) => x.shown === x.reached), `${label}: every meter is the number of colors Mixing.coverage reaches for this study`, r.map((x) => [x.id, x.shown, x.reached]));
  t.check(r.every((x, i) => i === 0 || x.reached < r[i - 1].reached || (x.reached === r[i - 1].reached && x.score >= r[i - 1].score - 1e-9)), `${label}: palettes that reach as many colors run the closer one first ("then by how closely")`, r.map((x) => [x.id, x.reached, +x.score.toFixed(2)]));
  return r;
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
    await checkRanking(t, page, 'sample');
    // the README's ten names, written out here rather than read from Paints.PRESETS, which would agree with any rename
    const shownNames = await page.evaluate(() => [...document.querySelectorAll('#presetList .preset-name')].map((e) => e.textContent));
    const READMENAMES = [/^Zorn$/, /^Zorn with a blue$/, /^Three primaries$/, /^Modern primaries \(CMY\)$/, /^Split primary$/, /^Frank Reilly$/, /^Richard Schmid$/, /^Rembrandt \(earths\)$/, /^Sorolla \(studio portraits\)$/, /^Monet \(impressionist\)$/];
    t.check(shownNames.length === 10 && READMENAMES.every((re) => shownNames.filter((x) => re.test(x)).length === 1), 'the ten palettes are the README\'s: Zorn, Zorn with a blue, three primaries, modern primaries, split primary, Frank Reilly, Richard Schmid, Rembrandt, Sorolla and Monet', shownNames);
    const dotTitles = await page.evaluate(() => [...document.querySelectorAll('#presetList li')].map((li) => ({ id: li.dataset.preset, titles: [...li.querySelectorAll('.paint-dot')].map((d) => d.title), names: Paints.PRESETS.find((p) => p.id === li.dataset.preset).paints.map((c) => Paints.byCode(c).name) })));
    t.check(dotTitles.every((d) => JSON.stringify(d.titles) === JSON.stringify(d.names)), 'hovering a palette\'s dots names each paint in full, in order', dotTitles.filter((d) => JSON.stringify(d.titles) !== JSON.stringify(d.names)));
    t.note(`The README says "a warm portrait on a gray ground suits Zorn". On the built-in sample the best match is ${list[0].id} (${list[0].reach}) and Zorn reaches ${list.find((l) => l.id === 'zorn').reach}: the sample is not the photo that sentence means, and the ranking is only checked here for what it computes, not for that example.`);
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
    await checkRanking(t, page, 'extremes photo');
    // every palette on the photo that goes past paint: its badges and recipes keep their promises there too
    for (const p of all) {
      await pickPreset(page, p.id);
      await checkPalette(t, page, `extremes ${p.name}`, p.paints, ne);
    }
    await pickPreset(page, 'zorn');
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
    t.check(JSON.stringify(lib.cats.map((c) => c[0]).sort()) === JSON.stringify(['Blacks and grays', 'Blues', 'Earths', 'Greens', 'Oranges', 'Pinks and violets', 'Reds', 'Whites', 'Yellows']), 'the nine families are the README\'s: whites, yellows, oranges, reds, pinks and violets, blues, greens, earths, and blacks and grays', lib.cats.map((c) => c[0]));
    t.check(lib.pigments === 77 && lib.swatches === 77 && lib.count === '', 'every paint has a pigment code and a tube-and-tint swatch; the count is blank with none ticked', [lib.pigments, lib.swatches, lib.count]);
    // one paint, the white alone
    await setMine(page, ['TW']);
    t.check((await text(page, '#paintDialogCount')) === '1 ticked', 'one tick: the dialog counts it', await text(page, '#paintDialogCount'));
    await afterSuggest(page, () => click(page, '#paintDialogDone'));
    const s1 = { count: await text(page, '#mineCount'), chips: await chips(page), about: await text(page, '#resultAbout'), match: await text(page, '#resultMatch'), rs: await rows(page) };
    t.check(s1.count === '1 paint ticked' && JSON.stringify(s1.chips) === '["TW"]' && s1.about.startsWith('Chosen from your paints'), 'Done with one paint: a new suggestion from that paint alone', s1);
    t.check(s1.rs.length === n && s1.rs.every((r) => r.recipe === 'TW'), 'with white alone every mix is white', s1.rs.map((r) => r.recipe));
    t.note(`With only Titanium White ticked, the suggested palette is white alone and ${s1.match.toLowerCase()}; its rows are marked "${[...new Set(s1.rs.map((r) => r.badge))].join('", "')}" (a middle value marked "Darkest you can mix" is true of a white-only palette, if odd).`);
    t.check(JSON.stringify(await storageGetJson(page, K.mine)) === '["TW"]', 'the tick is saved', await storageGetJson(page, K.mine));
    // two paints
    await click(page, '#mineEdit'); await sleep(100);
    await setMine(page, ['TW', 'IB']);
    await afterSuggest(page, () => click(page, '#paintDialogDone'));
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
    await afterSuggest(page, () => click(page, '#paintDialogDone'));
    t.check((await text(page, '#mineCount')) === `${union.size} paints ticked`, `the pane counts ${union.size} paints`, await text(page, '#mineCount'));
    await clean(t, page, 'tick a known palette');

    // Suggest at every size 3..10 from those paints
    const bySize = [];
    for (let size = 3; size <= 10; size++) {
      await setRange(page, '#paintMax', String(size));
      t.check((await text(page, '#paintMaxOut')) === `${size} + white`, `size ${size}: the output reads "${size} + white"`, await text(page, '#paintMaxOut'));
      await click(page, '#suggestBtn'); await suggestedDone(page); await mixed(page);
      const cs = await chips(page);
      t.check(cs[0] === 'TW' && cs.length >= 3 && cs.length <= size + 1 && cs.every((c) => union.has(c)) && new Set(cs).size === cs.length, `size ${size}: white first, 3 to ${size + 1} distinct paints, all from the ticked ones`, cs);
      const rm = reachOf(await text(page, '#resultMatch'));
      t.check(rm && rm[1] === n && rm[0] <= n && (await rows(page)).length === n, `size ${size}: the match and the rows count this study's ${n} colors`, [await text(page, '#resultMatch'), (await rows(page)).length]);
      t.check(JSON.parse(await storageGetRaw(page, K.choice)).max === size, `size ${size}: saved`, await storageGetRaw(page, K.choice));
      bySize.push({ size, cs, reached: rm && rm[0] });
    }
    // "one paint at a time ... until another paint would barely help or the palette reaches the size you set": the same greedy walk at
    // every size, so a bigger palette keeps the smaller one's paints in order and never mixes fewer colors; and every paint added past
    // the first two colors brings the weighted miss down by at least 0.4 (Mixing.MIN_GAIN)
    t.check(bySize.every((s, i) => i === 0 || (s.cs.length >= bySize[i - 1].cs.length && bySize[i - 1].cs.every((c, j) => s.cs[j] === c))), 'sizes 3..10: each palette begins with the paints of the size below it, in the same order', bySize.map((s) => s.cs.join(' ')));
    t.check(bySize.every((s, i) => i === 0 || s.reached >= bySize[i - 1].reached), 'sizes 3..10: a bigger palette never mixes fewer of the colors', bySize.map((s) => s.reached));
    {
      await qInstall(page);
      const longest = bySize.reduce((a, s) => (s.cs.length > a.length ? s.cs : a), []);
      const steps = await page.evaluate((codes) => {
        const q = window.__q, colors = q.colors(), ps = codes.map(q.paint), out = [];
        let prev = null;
        for (let k = 2; k <= ps.length; k++) { const sc = Mixing.coverage(ps.slice(0, k), colors).score; out.push({ code: codes[k - 1], k, gain: prev === null ? null : prev - sc }); prev = sc; }
        return out;
      }, longest);
      const weak = steps.filter((x) => x.k >= 4 && x.gain < 0.4 - 1e-6);
      t.check(longest.length >= 4 && weak.length === 0, `the longest suggestion (${longest.join(' ')}): every paint after the first two colors lowers the weighted miss by at least 0.4`, steps.map((x) => [x.code, x.gain === null ? null : +x.gain.toFixed(2)]));
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
    await afterSuggest(page, async () => { await click(page, '#paintDialogDone'); await sleep(200); });
    t.check((await page.evaluate(() => document.getElementById('paintSearch').value)) === '' && !(await dialogOpen(page)), 'Done closes the dialog and clears the search for next time');
    t.check((await text(page, '#mineCount')) === 'No paints ticked yet: suggestions come from the whole library.' && (await text(page, '#resultAbout')).startsWith('Chosen from the whole library'), 'after Untick all the pane and the new suggestion say the whole library', [await text(page, '#mineCount'), await text(page, '#resultAbout')]);
    await clean(t, page, 'search and untick');

    await click(page, '#mineEdit'); await sleep(100);
    const everyCode = await page.evaluate(() => Paints.LIBRARY.map((p) => p.code));
    await setMine(page, everyCode);
    t.check((await text(page, '#paintDialogCount')) === '77 ticked', 'all 77 ticked: the dialog counts them', await text(page, '#paintDialogCount'));
    await afterSuggest(page, () => click(page, '#paintDialogDone'));
    const s77 = { count: await text(page, '#mineCount'), chips: await chips(page), about: await text(page, '#resultAbout') };
    t.check(s77.count === '77 paints ticked' && s77.chips.length >= 3 && s77.chips.length <= 11 && s77.chips[0] === 'TW' && s77.about.startsWith('Chosen from your paints'), 'all 77 ticked: a suggestion of at most 10 + white from "your paints"', s77);
    {
      // the biggest search: a recipe is still up to three paints plus white, and every badge still says what its ΔE says
      const r77 = await rows(page);
      const ds77 = await checkBadges(t, page, 'suggested (all 77)');
      checkRecipes(t, 'suggested (all 77)', r77, await whiteMap(page));
      const rc77 = reachOf(await text(page, '#resultMatch'));
      t.check(r77.length === n && rc77 && ds77.filter((d) => d.dE < 6.35).length >= rc77[0], 'suggested (all 77): the rows within ΔE 6 are at least the colors "Mixes N of M" promises', [ds77.filter((d) => d.dE < 6.35).length, rc77]);
    }
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
    await afterSuggest(page, async () => { await page.keyboard.press('Escape'); await sleep(200); });
    t.check(!(await dialogOpen(page)), 'Escape closes the library');
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
    t.check(shown.filter((l) => l.best).length === 1 && shown.find((l) => l.best) === shown[0], 'in Simple mode exactly one of the three shown palettes is marked Best match, the first shown, so "Best match first" holds there too', shown.map((l) => [l.id, l.best]));
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
    const pressed3 = l3.filter((l) => l.shown && l.pressed);
    t.check(pressed3.length === 1 && pressed3[0].id === 'zorn' && (await text(p3, '#resultName')) === 'Zorn' && (await storageGetRaw(p3, K.choice)) === '{"source":"preset","preset":"zorn","max":6}', 'Simple mode at load with Richard Schmid saved from Advanced moves to Zorn (the first of the three before the study is ranked), shows its mixes and saves it', [pressed3.map((l) => l.id), await text(p3, '#resultName'), await storageGetRaw(p3, K.choice)]);
    t.note(`Simple mode with Richard Schmid saved from Advanced: the header reads "${await text(p3, '#colorsState')}".`);
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
    await afterSuggest(page, () => click(page, '#paintDialogDone'));
    t.check((await chips(page)).length >= 3 && (await chips(page)).length <= 6 && (await hscroll(page)) <= 0, 'phone: a suggestion from five paints shows without horizontal scroll', await chips(page));
    await click(page, '#blockViewPalette');
    await page.waitForFunction(() => !document.getElementById('blockViewPalette').classList.contains('is-busy'), null, { timeout: 20000 }).catch(() => null);
    t.check((await text(page, '#blockViewPalette')) === 'Suggested' && (await hscroll(page)) <= 0, 'phone: the block-view switch names the suggested palette and fits', await text(page, '#blockViewPalette'));
    await clean(t, page, 'phone');
    await page.context().close();
  }

  if (t.reachMismatch && t.reachMismatch.length) {
    const m = t.reachMismatch.find((x) => !/^phone/.test(x.label)) || t.reachMismatch[0];
    t.finding({ title: `A palette's "Mixes N of M colors" counts a color whose own recipe comes out Out of reach (${m.label}: ${m.reach[0]} of ${m.reach[1]}, but ${m.within} rows within ΔE 6)`, severity: 'medium', steps: `1. Advanced mode, Colors and paints, Known palettes, on the built-in sample study. 2. Press ${m.label}. 3. Compare "Mixes ${m.reach[0]} of ${m.reach[1]} colors" with the badges below.`, expected: 'As many Close or Near rows as the palette is said to mix (the code\'s own comment: full recipes "come out as close or closer" than the quick count that ranks the palettes).', actual: `The result says ${m.reach[0]} of ${m.reach[1]}, but only ${m.within} rows are within ΔE 6; the others: ${m.off.join('; ')}. For #3F1715 the quick count finds a mix of Alizarin Crimson and Burnt Umber at ΔE 4.7 (Near), while the row shows AC 6 · IB 1 at ΔE 7.0 (7.3 read off the rounded chip). The palette ranking uses the quick count, so a palette can sit higher than its rows justify. Cause: js/mixing.js 300-306: a target within 3 L* of the palette's darkest (Reilly's black makes that 11.2, the color is 14.0) is treated as a limit and recipeTask charges every L* the mix is lighter than the target (PER_VALUE), so the written recipe takes the darker, less accurate AC + IB; coverage() (739-749, which feeds "Mixes N of M" and the ranking) has no such charge and counts the lighter AC + BU mix as reached. The row is then neither Close/Near nor "Darkest you can mix" (that needs the mix itself within 3 L* of the darkest, lines 483-484).` });
  }

  // ---- the second pass: one block per promise the first pass left unchecked (GAP_BLOCKS, below) ------------------------
  for (const [, fn] of GAP_BLOCKS) await fn(t, site);
}

// a saved value, raw and parsed
const storageGetRaw = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const storageGetJson = async (page, key) => { const raw = await storageGetRaw(page, key); try { return JSON.parse(raw); } catch (e) { return raw; } };

// ======================================================================================================================
// GAP_BLOCKS: the second pass. Each block is one promise of the README (or of the page's own words) that nothing above
// checked; it opens its own page(s) and ends every step with clean().
// ======================================================================================================================
export const GAP_BLOCKS = []; // (exported so a scratch script can run one block alone; run.mjs only uses the default export)
const gap = (name, fn) => GAP_BLOCKS.push([name, fn]);

// ---- "Change the photo or settings and it is chosen again": a suggestion on screen follows the study ---------------------
gap('suggestion follows the study', async (t, site) => {
  const page = await openPage(site, { storage: { ...ADV, ...MINE(4) } });
  await settled(page);
  await suggestNow(page);
  const presetsNow = await presets(page);
  const sameAsPreset = (codes) => presetsNow.some((p) => p.paints.length === codes.length && p.paints.every((c) => codes.includes(c)));
  const compare = async (label) => {
    const n = await nColors(page);
    const s = await shownResult(page);
    const rm = reachOf(s.match);
    t.check(!s.hidden && rm && rm[1] === n && rm[0] <= n && s.rows === n && s.btn === 'Suggest again' && s.name === 'Suggested palette' && /it is chosen again\.$/.test(s.about), `${label}: the suggestion on screen is for this study (${n} colors), with nothing pressed`, { n, ...s });
    t.check(s.state === `${s.colors} per value · Suggested palette`, `${label}: the drawer header follows`, s.state);
    t.check(JSON.stringify(s.cur) === JSON.stringify(s.chips), `${label}: the palette the Studio and block view use is the suggestion`, [s.cur, s.chips]);
    const ps = await paletteOptions(page, '#ps-palette');
    t.check(sameAsPreset(s.chips) || ps.options.some((o) => o[0] === 'study' && o[1] === 'Study tab: Suggested palette'), `${label}: the Studio lists "Study tab: Suggested palette"`, ps.options.map((o) => o[1]));
    await suggestNow(page);
    const f = await shownResult(page);
    t.check(f.match === s.match && JSON.stringify(f.chips) === JSON.stringify(s.chips), `${label}: pressing Suggest again gives what was already on screen (nothing was left over from the old study)`, { shown: [s.match, s.chips], again: [f.match, f.chips] });
    return rm;
  };
  const first = await shownResult(page);
  // a different photo
  let moved = await afterChange(page, async () => loadPhoto(page, await extremesImage(page), { settle: 300 }));
  t.check(moved, 'a new photo: the study is redone');
  const afterPhoto = await compare('new photo');
  t.check(afterPhoto && afterPhoto[1] === await nColors(page), 'new photo: "Mixes N of M" counts the new photo\'s colors', afterPhoto);
  // Colors in each value, both ways
  for (const v of ['1', '5']) {
    moved = await afterChange(page, () => setRange(page, '#colors', v));
    t.check(moved, `Colors per value ${v}: the study is redone`);
    await compare(`Colors per value ${v}`);
  }
  // Lean toward lighter tones (Advanced only) changes the colors a study holds
  moved = await afterChange(page, () => setRange(page, '#lean', '100'));
  if (moved) await compare('lean toward lighter tones'); else t.note('Moving "Lean toward lighter tones" from 60 to 100 on this photo did not redo the study, so only the photo and Colors per value could be checked for the suggestion following.');
  t.note(`The first suggestion (sample, 3 per value) was ${first.chips.join(' ')}, ${first.match.toLowerCase()}.`);
  await clean(t, page, 'suggestion follows the study');
  await page.context().close();
});

// ---- Simple mode: the palette in use before any choice is the best of its three ---------------------------------------
gap('simple mode default palette', async (t, site) => {
  const page = await openPage(site, { storage: { [K.drawers]: '["colors"]' } });
  await settled(page); await ranked(page);
  const nameOf = Object.fromEntries((await presets(page)).map((p) => [p.id, p.name]));
  const THREE = ['Zorn', 'Three primaries', 'Rembrandt (earths)'];
  const probe = async (label) => {
    const list = await presetList(page);
    const best = list.filter((l) => l.shown).find((l) => l.best);
    const cur = await page.evaluate(() => { const c = StudioPalette.current(); return c && { name: c.name, chosen: c.chosen }; });
    const bv = await page.evaluate(() => ({ text: document.getElementById('blockViewPalette').textContent, title: document.getElementById('blockViewPalette').title }));
    t.check(best && cur && cur.name === nameOf[best.id] && cur.chosen === false && THREE.includes(cur.name), `${label}: the palette in use is the Best match among the three (${best && nameOf[best.id]}), not one the visitor has chosen`, { best: best && best.id, cur });
    t.check(cur && bv.text === shortName(cur.name) && /best match/.test(bv.title), `${label}: the block-view switch names it and says it is the best match`, bv);
    await tab(page, 'paint');
    const ps = await selectedText(page, '#ps-palette');
    await tab(page, 'study');
    t.check(cur && ps === cur.name, `${label}: the Studio opens on it`, [ps, cur && cur.name]);
    return { list, cur };
  };
  await probe('sample, Simple, nothing chosen');
  t.check((await text(page, '#colorsState')) === '3 per value', 'with nothing chosen the header says only "3 per value"', await text(page, '#colorsState'));
  await loadPhoto(page, await extremesImage(page), { settle: 300 });
  await settled(page); await ranked(page);
  const ex = await probe('photo past paint, Simple');
  const overall = nameOf[ex.list[0].id];
  t.note(`On the photo with a blue, the best of all ten is ${overall} and the best of Simple's three is ${ex.cur && ex.cur.name}${THREE.includes(overall) ? ' (the same palette, so this photo cannot tell the two apart)' : ''}.`);
  // Advanced uses the best overall; going back to Simple, the best of the three again
  await click(page, '[data-mode="advanced"]'); await settled(page);
  const followed = await page.waitForFunction((want) => { const c = StudioPalette.current(); return c && c.name === want; }, overall, { timeout: 8000 }).then(() => true).catch(() => false);
  const bvAdv = await text(page, '#blockViewPalette');
  t.check(followed && !!bvAdv && bvAdv === shortName(overall), `switching to Advanced: the palette in use is the best of all ten (${overall}) and the block-view switch follows`, [followed, bvAdv]);
  await click(page, '[data-mode="simple"]'); await settled(page);
  const back = await page.waitForFunction((want) => { const c = StudioPalette.current(); return c && c.name === want; }, ex.cur && ex.cur.name, { timeout: 8000 }).then(() => true).catch(() => false);
  const bvSimple = await text(page, '#blockViewPalette');
  t.check(back && bvSimple === shortName(ex.cur.name), 'and back to Simple: the best of the three again, and the switch follows', [back, bvSimple]);
  await clean(t, page, 'simple default palette');
  await page.context().close();
});

// ---- the pigment model: yellow and blue make green, and each paint's strength is fitted to its tint ------------------------
gap('pigment model', async (t, site) => {
  const page = await advPage(site, MINE(4), { rank: false });
  const model = await page.evaluate(() => {
    const P = (c, s = 'normal') => Mixing.makePaint(Object.assign({}, Paints.byCode(c), { strength: s }));
    const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const greens = [['CYM', 'UB'], ['CYL', 'PBR'], ['HYL', 'CeB'], ['CLm', 'PBG']].map(([y, b]) => {
      let best = null;
      for (const k of [1, 2, 4, 8, 16, 32]) { const lab = Mixing.mix([P(y), P(b)], [k, 1]).lab; if (!best || lab[1] < best.lab[1]) best = { k, lab }; }
      return { pair: y + '+' + b, k: best.k, a: +best.lab[1].toFixed(1), b: +best.lab[2].toFixed(1) };
    });
    // screen averaging of a classic yellow and blue: the README's "gray instead of green"
    const avg = hx(Paints.byCode('CYM').hex).map((v, i) => Math.round((v + hx(Paints.byCode('UB').hex)[i]) / 2));
    const avgLab = Study.rgbToLab(...avg);
    const white = P('TW');
    const tints = Paints.LIBRARY.filter((p) => p.tint).map((p) => {
      const tl = Study.rgbToLab(...hx(p.tint));
      const dd = (s) => Study.deltaE2000(...Mixing.mix([P(p.code, s), white], [1, 4]).lab, ...tl);
      const wx = hx('#F3F1EA'), px = hx(p.hex);
      const plain = Study.deltaE2000(...Study.rgbToLab(...px.map((v, i) => Math.round((v + 4 * wx[i]) / 5))), ...tl);
      return { code: p.code, fit: dd('normal'), weak: dd('weak'), strong: dd('strong'), plain };
    });
    return { greens, avg: [+avgLab[1].toFixed(1), +avgLab[2].toFixed(1)], tints };
  });
  t.check(model.greens.every((g) => g.a < -8 && g.b > 15), 'yellow with blue mixes green in the model (a* below -8, b* above 15) for cadmium yellow + ultramarine, + phthalo blue, hansa + cerulean, lemon + phthalo', model.greens);
  t.check(model.avg[0] > -5, 'averaging the screen colors of cadmium yellow and ultramarine does not give green (the contrast the README draws)', model.avg);
  t.check(model.tints.length === 74 && model.tints.every((x) => x.fit < 8), 'every tinted paint mixed 1 : 4 with titanium white lands within ΔE 8 of its tint swatch', model.tints.filter((x) => x.fit >= 8).map((x) => [x.code, +x.fit.toFixed(1)]));
  t.check(model.tints.every((x) => x.fit <= x.weak + 1e-6 && x.fit <= x.strong + 1e-6), 'the fitted tinting strength beats a weaker and a stronger one for every paint', model.tints.filter((x) => x.fit > x.weak + 1e-6 || x.fit > x.strong + 1e-6).map((x) => x.code));
  t.check(model.tints.every((x) => x.fit < x.plain), 'and beats plain averaging of tube and white for every paint', model.tints.filter((x) => x.fit >= x.plain).map((x) => [x.code, +x.fit.toFixed(1), +x.plain.toFixed(1)]));
  // through the page: a green patch painted with only a yellow, a blue and white
  await loadPhoto(page, await bandsImage(page, [['#5a9a3a', 320], ['#e8d6a8', 240], ['#2a3258', 240]]), { settle: 300 });
  await settled(page);
  await click(page, '#mineEdit'); await sleep(100);
  await setMine(page, ['TW', 'CYM', 'UB']);
  await afterSuggest(page, () => click(page, '#paintDialogDone'));
  const rs = await page.evaluate(() => [...document.querySelectorAll('#mixList .mix-row')].map((r) => {
    const tg = /#[0-9A-F]{6}/.exec(r.querySelector('.mix-add').getAttribute('aria-label'))[0], pr = /#[0-9A-F]{6}/.exec(r.querySelector('.mix-chip:nth-child(2)').title)[0];
    const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return { tg: c(tg), pr: c(pr), recipe: r.querySelector('.mix-recipe').textContent, badge: r.querySelector('.mix-badge').textContent };
  }));
  const green = rs.filter((r) => r.tg[1] > r.tg[0] + 25 && r.tg[1] > r.tg[2] + 25);
  t.check(green.length >= 1 && green.every((r) => /CYM/.test(r.recipe) && /UB/.test(r.recipe) && r.pr[1] > r.pr[0] && r.pr[1] > r.pr[2]), 'with only cadmium yellow, ultramarine and white ticked, the photo\'s green is mixed from yellow and blue and predicted green', green);
  await clean(t, page, 'pigment model');
  await page.context().close();
});

// ---- whites: titanium if you have it, another white if not, none at all ------------------------------------------------
gap('whites and no white', async (t, site) => {
  const page = await advPage(site, MINE(4), { rank: false });
  const mineMenu = async () => { await click(page, '#mineEdit'); await sleep(100); };
  const done = () => afterSuggest(page, () => click(page, '#paintDialogDone'));
  const isWhite = (c) => ['TW', 'ZW', 'LW'].includes(c);
  const remb = (await presets(page)).find((p) => p.id === 'rembrandt');
  // (a) a palette that carries only lead white
  await mineMenu(); await setMine(page, []); await tickPresetIn(page, 'rembrandt'); await sleep(100);
  await done();
  let cs = await chips(page);
  t.check(cs[0] === 'LW' && !cs.includes('TW') && cs.slice(1).every((c) => remb.paints.includes(c)) && (await rows(page)).every((r) => BADGES.includes(r.badge)), 'with only Rembrandt\'s paints ticked (lead white, no titanium) the suggestion starts with lead white', cs);
  // (b) three whites and earths: titanium, the one white
  await mineMenu(); await setMine(page, ['TW', 'ZW', 'LW', 'YO', 'RS', 'BS', 'IB']);
  await done();
  cs = await chips(page);
  t.check(cs[0] === 'TW' && cs.filter(isWhite).length === 1, 'with titanium, zinc and lead white ticked, titanium goes first and no other white is added', cs);
  // (c) no white at all
  await mineMenu(); await setMine(page, ['YO', 'CRL', 'IB']);
  await done();
  cs = await chips(page);
  const rs = await rows(page);
  const maxOut = await text(page, '#paintMaxOut');
  t.check(cs.length >= 2 && cs.length <= 3 && cs.every((c) => !isWhite(c)) && rs.length === (await nColors(page)) && rs.every((r) => BADGES.includes(r.badge) && !/\b(TW|ZW|LW)\b/.test(r.recipe)), 'with no white ticked, the palette holds no white, no recipe uses one, and every color still has a badge', { cs, recipes: rs.map((r) => r.recipe) });
  const rc = reachOf(await text(page, '#resultMatch'));
  t.check(rc && rc[0] <= rc[1] && (await shownResult(page)).btn === 'Suggest again', 'and "Mixes N of M" is sound', await text(page, '#resultMatch'));
  t.note(`With no white ticked the size output still reads "${maxOut}" (the hint under it says "Not counting white"), though the palette has no white in it.`);
  // (d) only whites
  await mineMenu(); await setMine(page, ['TW', 'ZW', 'LW']);
  await done();
  cs = await chips(page);
  t.check(JSON.stringify(cs) === '["TW"]' && (await rows(page)).every((r) => r.recipe === 'TW'), 'three whites ticked: the palette is titanium white alone and every mix is that white', [cs, (await rows(page)).map((r) => r.recipe)]);
  await clean(t, page, 'whites');
  // what the other tabs make of three whites ("at least two" is the rule)
  await tab(page, 'game');
  const g3 = await paletteOptions(page, '#gamePalette');
  t.check(g3.options.some((o) => o[0] === 'mine' && o[1] === 'My paints (3)'), 'the game offers "My paints (3)" for three whites', g3.options.map((o) => o[1]));
  await setSelect(page, '#gamePalette', 'mine');
  await click(page, '#gameStart'); await page.waitForFunction(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
  const gameUp = await page.evaluate(() => !document.getElementById('gamePlay').hidden && document.querySelectorAll('.game-paint').length);
  t.check(gameUp >= 1, 'a game can be started with three whites as the palette', gameUp);
  await page.evaluate(() => { const b = document.getElementById('gameQuit') || document.querySelector('[data-game-quit]'); if (b) b.click(); });
  await tab(page, 'battle');
  const v3 = await paletteOptions(page, '#vb-palette');
  t.check(v3.options.some((o) => o[0] === 'mine' && o[1] === 'My paints (3)'), 'Value battle offers "My paints (3)" for three whites', v3.options.map((o) => o[1]));
  await setSelect(page, '#vb-palette', 'mine');
  await resetToast(page);
  await click(page, '#vb-start'); await sleep(300);
  const bt = await text(page, '#toast');
  t.check(/needs a paint that is not a white/.test(bt) && !(await visible(page, '#vb-play')), 'Value battle cannot be played with three whites (nothing to compare): it stays on its setup and says why', bt);
  await tab(page, 'paint');
  await setSelect(page, '#ps-palette', 'mine'); await sleep(300);
  const sc = await paintCodes(page);
  t.check(JSON.stringify(sc.slice().sort()) === '["LW","TW","ZW"]', 'the Studio takes the three whites as its palette', sc);
  await clean(t, page, 'three whites in the game, the battle and the Studio');
  await page.context().close();
  // (e) one paint only: nothing to offer anywhere else (a fresh page: the Studio above has been chosen from, and stops following)
  const one = await advPage(site, MINE(4), { rank: false });
  await click(one, '#mineEdit'); await sleep(100); await setMine(one, ['TW']);
  await afterSuggest(one, () => click(one, '#paintDialogDone'));
  t.check(JSON.stringify(await chips(one)) === '["TW"]', 'one paint ticked: the palette is that white alone', await chips(one));
  for (const [name, sel] of [['game', '#gamePalette'], ['battle', '#vb-palette'], ['paint', '#ps-palette']]) {
    await tab(one, name);
    const o = await paletteOptions(one, sel);
    t.check(!o.options.some((x) => x[0] === 'mine' || x[0] === 'study'), `one paint ticked: ${name === 'paint' ? 'the Studio' : 'the ' + name} offers no My paints and no "Study tab" palette`, o.options.map((x) => x[1]));
  }
  await clean(t, one, 'one paint in the other tabs');
  await one.context().close();
});

// ---- photos with nothing in them: pure white, pure black, flat gray, noise ----------------------------------------------
gap('degenerate photos', async (t, site) => {
  const page = await advPage(site);
  const expect = { white: ['Lightest you can mix'], black: ['Darkest you can mix'], flat: ['Close'] };
  for (const draw of ['white', 'black', 'flat']) {
    await loadPhoto(page, await makeImage(page, { width: 320, height: 420, draw }), { settle: 300 });
    await settled(page); await ranked(page);
    const s = await page.evaluate(() => ({ n: Studio.result().blockColors.filter((c) => c.share > 0).length, reach: [...document.querySelectorAll('#presetList li')].map((li) => li.querySelector('.preset-reach').textContent), v: [...document.querySelectorAll('#presetList .preset-bar')].map((b) => b.style.getPropertyValue('--v')), best: document.querySelectorAll('#presetList .preset-best').length }));
    t.check(s.n >= 1 && s.reach.every((r) => { const m = /^(\d+) \/ (\d+)$/.exec(r); return m && +m[2] === s.n && +m[1] <= s.n; }), `${draw} photo: every meter reads "N / ${s.n}"`, s);
    t.check(s.v.every((v) => /^\d(\.\d+)?$/.test(v) && +v >= 0 && +v <= 1), `${draw} photo: every meter bar has a number between 0 and 1 (no NaN)`, s.v);
    t.check(s.best === 1, `${draw} photo: exactly one palette is marked Best match`, s.best);
    await pickPreset(page, 'zorn');
    const rs = await rows(page);
    t.check(rs.length === s.n && rs.every((r) => expect[draw].includes(r.badge)), `${draw} photo: Zorn's ${rs.length === 1 ? 'one row is' : 'rows are'} "${expect[draw][0]}"`, rs.map((r) => [r.zone, r.recipe, r.badge]));
    const match = await text(page, '#resultMatch'), aria = await page.evaluate(() => document.querySelector('#presetList .preset').getAttribute('aria-label'));
    if (s.n === 1) {
      const singular = / of 1 color$/.test(match) && / of 1 color$/.test(aria);
      t.check(singular, `${draw} photo (one color): the result and the palette buttons say "of 1 color"`, [match, aria]);
      if (!singular && draw === 'white') t.finding({ title: 'A photo with one color reads "Mixes 1 of 1 colors"', severity: 'low', steps: '1. Advanced mode, Colors and paints. 2. Load a photo that is one flat color (pure white, pure black or a flat gray). 3. Pick any palette.', expected: '"Mixes 1 of 1 color" (and "1 of 1 color" in the button\'s spoken label).', actual: `The result reads "${match}" and the first palette button is labelled "${aria}". Cause: js/palette.js 126 (reachText, which also feeds the button\'s spoken label at about line 172) always writes "colors".` });
    }
    await clean(t, page, `${draw} photo`);
  }
  await page.context().close();
  // noise at six colors per value: the longest mix list, on a phone
  const ph = await advPage(site, {}, { viewport: PHONE });
  await setRange(ph, '#colors', '6');
  await settled(ph);
  await loadPhoto(ph, await makeImage(ph, { width: 320, height: 420, draw: 'noise' }), { settle: 300 });
  await settled(ph); await ranked(ph);
  const nn = await nColors(ph);
  await pickPreset(ph, 'zorn');
  const nrs = await rows(ph);
  t.check(nn >= 6 && nn <= 24 && nrs.length === nn && nrs.every((r) => BADGES.includes(r.badge)), 'noise at Colors 6: 6 to 24 colors, a row and a badge for each', [nn, nrs.length]);
  t.check((await hscroll(ph)) <= 0, 'noise at Colors 6 on a phone: no horizontal scroll', await hscroll(ph));
  await clean(t, ph, 'noise');
  await ph.context().close();
});

// ---- a first visit: the drawer is closed at load and opened by its summary ---------------------------------------------------
gap('drawer opened by its summary', async (t, site) => {
  const isOpen = (page) => page.evaluate(() => document.getElementById('drawer-colors').open);
  // nothing saved: closed, no palettes rendered yet, the header says only the count
  let page = await openPage(site);
  await settled(page);
  const st0 = await page.evaluate(() => ({ open: document.getElementById('drawer-colors').open, listed: document.querySelectorAll('#presetList .preset').length, state: document.getElementById('colorsState').textContent }));
  t.check(!st0.open && st0.state === '3 per value', 'a first visit: the Colors and paints drawer is closed and its header reads "3 per value"', st0);
  await click(page, '#drawer-colors summary');
  await ranked(page);
  const l0 = await presetList(page);
  t.check((await isOpen(page)) && l0.length === 10 && l0.filter((l) => l.shown).length === 3 && l0.every((l) => !l.pressed) && !(await visible(page, '#paintResult')), 'opened by its summary the drawer ranks the palettes (Simple shows three), none pressed and no mixes yet', l0.map((l) => [l.id, l.shown, l.pressed]));
  t.check(l0.filter((l) => l.shown && l.best).length === 1, 'and exactly one of the three shown carries Best match', l0.filter((l) => l.best).map((l) => l.id));
  t.check((await storageGetRaw(page, K.drawers)) === '["colors"]', 'the open drawer is remembered', await storageGetRaw(page, K.drawers));
  await pickPreset(page, 'zorn');
  await click(page, '#drawer-colors summary'); await sleep(150);
  t.check(!(await isOpen(page)) && (await text(page, '#colorsState')) === '3 per value · Zorn', 'closed again, the header names the palette', await text(page, '#colorsState'));
  await clean(t, page, 'drawer: first visit');
  await page.context().close();

  // a palette saved, the drawer closed: the header names it at once; opening brings the ranking, the pressed palette and its mixes
  page = await openPage(site, { storage: { [K.choice]: '{"source":"preset","preset":"zorn","max":6}', [K.drawers]: '[]' } });
  await settled(page);
  t.check((await text(page, '#colorsState')) === '3 per value · Zorn' && !(await isOpen(page)), 'a saved palette, drawer closed: the header reads "3 per value · Zorn"', await text(page, '#colorsState'));
  // a photo loaded while it is closed counts for the ranking made when it opens
  await loadPhoto(page, await extremesImage(page), { settle: 300 });
  await settled(page);
  t.check((await text(page, '#colorsState')) === '3 per value · Zorn', 'a photo loaded with the drawer closed leaves the header as it was', await text(page, '#colorsState'));
  await click(page, '#drawer-colors summary');
  await ranked(page); await mixed(page);
  const ne = await nColors(page);
  const l1 = await presetList(page);
  t.check(l1.find((l) => l.id === 'zorn').pressed && l1.every((l) => l.reach.endsWith(` / ${ne}`)) && (await rows(page)).length === ne && (await text(page, '#resultName')) === 'Zorn', `opened, it ranks for the new photo (${ne} colors), presses Zorn and shows its ${ne} mixes`, [l1.map((l) => l.reach), (await rows(page)).length]);
  t.check((await storageGetRaw(page, K.drawers)) === '["colors"]', 'the drawers key now holds "colors"', await storageGetRaw(page, K.drawers));
  await clean(t, page, 'drawer: saved palette');
  await page.context().close();

  // My paints saved, drawer closed, a photo loaded: opening shows no suggestion until asked, then Suggest works
  page = await openPage(site, { storage: { [K.mode]: 'advanced', [K.drawers]: '[]', [K.mine]: '["TW","YO","CRL","IB"]', ...MINE(4) } });
  await settled(page);
  t.check((await text(page, '#colorsState')) === '3 per value' && (await text(page, '#mineCount')) === '4 paints ticked', 'My paints saved, drawer closed: the header says only "3 per value" and the pane counts four paints', [await text(page, '#colorsState'), await text(page, '#mineCount')]);
  await loadPhoto(page, await extremesImage(page), { settle: 300 });
  await settled(page);
  await click(page, '#drawer-colors summary'); await sleep(300);
  const o2 = await shownResult(page);
  t.check(o2.hidden && o2.btn === 'Suggest a palette' && o2.state === '3 per value', 'opened, there is no suggestion yet: the button asks for one', o2);
  await suggestNow(page);
  const o3 = await shownResult(page), n3 = await nColors(page);
  t.check(o3.rows === n3 && JSON.stringify(o3.chips) !== '[]' && o3.chips.every((c) => ['TW', 'YO', 'CRL', 'IB'].includes(c)) && o3.state === '3 per value · Suggested palette', `then Suggest chooses from the four ticked paints for the photo's ${n3} colors`, o3);
  await clean(t, page, 'drawer: my paints');
  await page.context().close();
});

// ---- the chosen palette and the last suggestion are kept per source ----------------------------------------------------------
gap('source round trip', async (t, site) => {
  const page = await advPage(site);
  await pickPreset(page, 'schmid');
  const schmid = (await presets(page)).find((p) => p.id === 'schmid');
  await click(page, '#srcMine');
  await click(page, '#suggestBtn'); await suggestedDone(page); await mixed(page);
  const sug = await shownResult(page);
  // back to the known palettes: Richard Schmid is still pressed and its mixes come back without a click
  await click(page, '#srcPreset'); await mixed(page);
  const l = await presetList(page);
  const n = await nColors(page);
  t.check(l.filter((x) => x.pressed).map((x) => x.id).join() === 'schmid' && (await text(page, '#resultName')) === 'Richard Schmid' && JSON.stringify(await chips(page)) === JSON.stringify(schmid.paints) && (await rows(page)).length === n, 'back on Known palettes: Richard Schmid is still pressed and its mixes are showing', [l.filter((x) => x.pressed).map((x) => x.id), await text(page, '#resultName'), (await rows(page)).length]);
  t.check((await text(page, '#colorsState')) === '3 per value · Richard Schmid', 'and the header names it', await text(page, '#colorsState'));
  // and to My paints again: the suggestion is shown at once, not worked out again
  const trace = await page.evaluate(() => new Promise((resolve) => {
    const b = document.getElementById('suggestBtn'), seen = [];
    document.getElementById('srcMine').click();
    const first = { btn: b.textContent, hidden: document.getElementById('paintResult').hidden, name: document.getElementById('resultName').textContent, chips: [...document.querySelectorAll('#resultPaints .paint-code')].map((e) => e.textContent) };
    let frames = 0;
    (function tick() { seen.push(b.textContent); if (++frames < 12) requestAnimationFrame(tick); else resolve({ first, seen: [...new Set(seen)] }); })();
  }));
  await mixed(page);
  t.check(!trace.first.hidden && trace.first.name === 'Suggested palette' && JSON.stringify(trace.first.chips) === JSON.stringify(sug.chips) && trace.seen.length === 1 && trace.seen[0] === 'Suggest again', 'back on My paints: the earlier suggestion is on screen at once, with the button reading "Suggest again" throughout (nothing is worked out again)', trace);
  t.check((await text(page, '#colorsState')) === '3 per value · Suggested palette' && (await text(page, '#resultMatch')) === sug.match, 'and the header and the match are as they were', [await text(page, '#colorsState'), await text(page, '#resultMatch')]);
  // a new photo while on the other source: the suggestion is made again for it when My paints is shown
  await click(page, '#srcPreset'); await ranked(page);
  await loadPhoto(page, await extremesImage(page), { settle: 300 });
  await settled(page); await ranked(page); await mixed(page);
  await afterSuggest(page, () => click(page, '#srcMine'));
  const s2 = await shownResult(page), n2 = await nColors(page), rm = reachOf(s2.match);
  t.check(rm && rm[1] === n2 && s2.rows === n2 && s2.btn === 'Suggest again', `a photo loaded while on Known palettes: My paints then shows a suggestion for the new photo's ${n2} colors`, s2);
  await clean(t, page, 'source round trip');
  await page.context().close();
});

// ---- Forget my work on this device clears the paints drawer's state too ----------------------------------------------------------
gap('forget clears the paints', async (t, site) => {
  const page = await advPage(site);
  await click(page, '#srcMine');
  await tickDialog(page, ['TW', 'YO', 'CRL', 'IB', 'UB']);
  await afterSuggest(page, () => click(page, '#paintDialogDone'));
  await setRange(page, '#paintMax', '9');
  await click(page, '#srcPreset'); await ranked(page);
  await pickPreset(page, 'schmid');
  await click(page, '#blockViewPalette'); await blockBusy(page);
  const kept = await storageKeys(page);
  t.check(['myPaints', 'paintChoice', 'blockView'].every((k) => kept.includes('portrait-value-studio.' + k)), 'before Forget the browser holds the ticks, the choice and the block view', kept);
  await tab(page, 'help');
  await click(page, '#forgetBtn'); await sleep(300);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
  await sleep(800);
  await settled(page);
  // (openPage's seed of Advanced and the open drawer is written again by the reload, so only the paints' own keys are looked for)
  const left = (await storageKeys(page)).filter((k) => /\.(myPaints|paintChoice|blockView|palette)$/.test(k));
  t.check(left.length === 0, 'after Forget none of the paints\' keys is left', left);
  await ranked(page);
  const st = await page.evaluate(() => ({
    preset: document.getElementById('srcPreset').checked, pressed: document.querySelectorAll('#presetList .preset[aria-pressed="true"]').length, result: !document.getElementById('paintResult').hidden,
    count: document.getElementById('mineCount').textContent, max: document.getElementById('paintMax').value, maxOut: document.getElementById('paintMaxOut').textContent,
    photo: document.querySelector('[data-block-view="photo"]').getAttribute('aria-pressed'), palette: document.getElementById('blockViewPalette').getAttribute('aria-pressed'), state: document.getElementById('colorsState').textContent,
  }));
  t.check(st.preset && st.pressed === 0 && !st.result && st.count === 'No paints ticked yet: suggestions come from the whole library.' && st.max === '6' && st.maxOut === '6 + white' && st.photo === 'true' && st.palette === 'false' && st.state === '3 per value', 'the drawer starts over: Known palettes with none pressed, no ticks, the size at 6 + white, the block view on Photo', st);
  await click(page, '#srcMine'); await click(page, '#mineEdit'); await sleep(200);
  t.check((await ticked(page)).length === 0, 'and the library dialog has nothing ticked', (await ticked(page)).length);
  await clean(t, page, 'forget');
  await page.context().close();
});

// ---- the Palette block view is the picture the rows describe ---------------------------------------------------------------------
gap('palette block view matches the rows', async (t, site) => {
  const compare = async (label) => {
    await blockBusy(page);
    await sleep(200);
    const r = await page.evaluate(() => {
      const res = Studio.result(), cv = document.getElementById('cv-block'), g = cv.getContext('2d');
      const hexOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const pred = {};
      document.querySelectorAll('#mixList .mix-row').forEach((row) => { pred[/#[0-9A-F]{6}/.exec(row.querySelector('.mix-add').getAttribute('aria-label'))[0]] = hexOf(/#[0-9A-F]{6}/.exec(row.querySelector('.mix-chip:nth-child(2)').title)[0]); });
      const out = [];
      for (const c of res.blockColors) {
        if (!(c.share > 0)) continue;
        const hex = Studio.toHex(c);
        let k = -1;
        for (let i = 0; i < res.block.length; i++) if (res.block[i] === c.label) { const p = i * 4; if (res.blockImage[p] === c.r && res.blockImage[p + 1] === c.g && res.blockImage[p + 2] === c.b) { k = i; break; } }
        if (k < 0) { out.push({ hex, noPixel: true }); continue; }
        const d = g.getImageData(k % cv.width, Math.floor(k / cv.width), 1, 1).data;
        out.push({ hex, px: [d[0], d[1], d[2]], pred: pred[hex] || null });
      }
      return { out, label: cv.getAttribute('aria-label'), width: cv.width === res.w };
    });
    const bad = r.out.filter((x) => !x.noPixel && (!x.pred || x.px.some((v, i) => Math.abs(v - x.pred[i]) > 1)));
    t.check(r.out.length > 0 && r.width && r.out.every((x) => !x.noPixel) && bad.length === 0, `${label}: every block of the Palette picture is the predicted mix its row shows (within 1 per channel)`, bad.length ? bad : r.out.length);
    return r.label;
  };
  var page = await advPage(site);
  await pickPreset(page, 'zorn');
  await click(page, '#blockViewPalette');
  const lab1 = await compare('Zorn');
  t.check(lab1 === 'Color-block study as Zorn mixes it', 'the picture says it is as Zorn mixes it', lab1);
  await pickPreset(page, 'reilly');
  await compare('Frank Reilly');
  await click(page, '#srcMine');
  await suggestNow(page);
  const lab3 = await compare('suggested palette');
  t.check(/as Suggested palette mixes it/.test(lab3), 'and for the suggestion, it says so', lab3);
  await clean(t, page, 'block view vs rows');
  await page.context().close();
});

// ---- axe over the open drawer, the mixes and the library dialog (the Study tab's default state is all smoke.mjs covers) --------------
gap('axe over the drawer', async (t, site) => {
  for (const dark of [false, true]) {
    const label = dark ? 'dark' : 'light';
    const page = await openPage(site, { bypassCSP: true, dark, storage: { ...ADV, ...MINE(4) } });
    await settled(page);
    await click(page, '#srcPreset'); await ranked(page);
    await pickPreset(page, 'schmid');
    const a1 = await axe(page);
    t.check(!a1.some((v) => v.impact === 'serious' || v.impact === 'critical'), `${label}: axe finds nothing serious in the open drawer with a palette's mixes`, a1);
    if (a1.length) t.note(`${label}, palette mixes: axe also lists ${a1.map((v) => `${v.id} (${v.impact}, ${v.count})`).join(', ')}.`);
    await click(page, '#srcMine'); await suggestNow(page);
    const a2 = await axe(page);
    t.check(!a2.some((v) => v.impact === 'serious' || v.impact === 'critical'), `${label}: axe finds nothing serious under My paints with a suggestion`, a2);
    if (a2.length) t.note(`${label}, My paints: axe also lists ${a2.map((v) => `${v.id} (${v.impact}, ${v.count})`).join(', ')}.`);
    await click(page, '#mineEdit'); await sleep(300);
    const a3 = await axe(page);
    t.check((await dialogOpen(page)) && !a3.some((v) => v.impact === 'serious' || v.impact === 'critical'), `${label}: axe finds nothing serious in the 77-paint library dialog`, a3);
    if (a3.length) t.note(`${label}, library dialog: axe also lists ${a3.map((v) => `${v.id} (${v.impact}, ${v.count})`).join(', ')}.`);
    await clean(t, page, `axe ${label}`);
    await page.context().close();
  }
});

// ---- the toast that says why a choice moved when Simple mode is switched on ---------------------------------------------------------
gap('simple mode toast', async (t, site) => {
  const SAYS = /^Simple mode uses (.+) instead of (.+)$/;
  const toastNow = (page) => text(page, '#toast');
  // switching: Advanced, My paints, then Simple
  let page = await advPage(site);
  const nameOf = Object.fromEntries((await presets(page)).map((p) => [p.id, p.name]));
  await click(page, '#srcMine'); await sleep(100);
  await resetToast(page);
  await page.evaluate(() => { window.__r0 = Studio.result(); });
  await click(page, '[data-mode="simple"]');
  await page.waitForFunction(() => /^Simple mode uses/.test(document.getElementById('toast').textContent), null, { timeout: 4000 }).catch(() => null);
  let said = await toastNow(page);
  // (the switch redoes the study, and the list of palettes is drawn again once it is ranked)
  await page.waitForFunction(() => Studio.result() !== window.__r0, null, { timeout: 10000 }).catch(() => null);
  await settled(page); await ranked(page);
  const list = await presetList(page);
  const shownBest = nameOf[list.filter((l) => l.shown).find((l) => l.best).id];
  t.check(SAYS.test(said) && said === `Simple mode uses ${shownBest} instead of My paints`, `from My paints to Simple the toast says "Simple mode uses ${shownBest} instead of My paints" (the Best match among the three)`, said);
  t.check(list.find((l) => l.shown && l.pressed) && nameOf[list.find((l) => l.shown && l.pressed).id] === shownBest, 'and that palette is the one pressed', list.filter((l) => l.pressed).map((l) => l.id));
  await clean(t, page, 'toast: switching');
  await page.context().close();
  // a palette Simple does not list, at load
  page = await openPage(site, { storage: { [K.drawers]: '["colors"]', [K.choice]: '{"source":"preset","preset":"schmid","max":6}' } });
  await settled(page);
  said = await toastNow(page);
  t.check(said === 'Simple mode uses Zorn instead of Richard Schmid', 'a saved Richard Schmid met in Simple: the toast says "Simple mode uses Zorn instead of Richard Schmid" at load', said);
  await clean(t, page, 'toast: at load');
  await page.context().close();
  // nothing moved: no word
  for (const [label, choice] of [['Zorn saved', '{"source":"preset","preset":"zorn","max":6}'], ['nothing chosen', '{"source":"preset","preset":"","max":6}']]) {
    page = await openPage(site, { storage: { [K.drawers]: '["colors"]', [K.choice]: choice } });
    await settled(page); await sleep(500);
    t.check(!/^Simple mode uses/.test(await toastNow(page)), `${label}: Simple mode moves nothing and says nothing`, await toastNow(page));
    await clean(t, page, `toast: ${label}`);
    await page.context().close();
  }
});

// ---- the Studio follows the Study tab only until a palette is chosen in the Studio ----------------------------------------------------
gap('the Studio stops following once touched', async (t, site) => {
  const page = await advPage(site);
  await tab(page, 'paint');
  await setSelect(page, '#ps-palette', 'monet');
  await tab(page, 'study');
  await pickPreset(page, 'reilly');
  await tab(page, 'paint');
  t.check((await paletteOptions(page, '#ps-palette')).value === 'monet', 'a palette chosen in the Studio is left alone when the Study tab picks another (Monet stays, Reilly picked)', (await paletteOptions(page, '#ps-palette')).value);
  await tab(page, 'study');
  await click(page, '#srcMine');
  await tickDialog(page, ['TW', 'CYM', 'UB', 'QM', 'Vir', 'RS', 'BS', 'IB']);
  await page.evaluate(() => { const e = document.getElementById('paintMax'); e.value = '3'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await afterSuggest(page, () => click(page, '#paintDialogDone'));
  const cs1 = await chips(page);
  await tab(page, 'paint');
  const ps1 = await paletteOptions(page, '#ps-palette');
  t.check(ps1.value === 'monet', 'and a suggestion made afterwards does not move it either', ps1.value);
  const hasStudy = ps1.options.some((o) => o[0] === 'study' && o[1] === 'Study tab: Suggested palette');
  const hasMine = ps1.options.some((o) => o[0] === 'mine' && o[1] === 'My paints (8)');
  t.check(hasStudy && hasMine, 'the Studio\'s menu lists the new "Study tab: Suggested palette" and "My paints (8)" for the paints ticked since', ps1.options.slice(10).map((o) => o[1]));
  if (hasStudy) { await setSelect(page, '#ps-palette', 'study'); t.check(JSON.stringify((await paintCodes(page)).slice().sort()) === JSON.stringify(cs1.slice().sort()), 'and the "Study tab" entry holds the suggestion\'s paints', [await paintCodes(page), cs1]); }
  if (!hasStudy || !hasMine) {
    // a reload shows what the menu should have shown
    const fresh = await openPage(site, { storage: { ...ADV, ...MINE(3), [K.mine]: JSON.stringify(['TW', 'CYM', 'UB', 'QM', 'Vir', 'RS', 'BS', 'IB']) } });
    await settled(fresh); await tab(fresh, 'paint');
    const f = await paletteOptions(fresh, '#ps-palette');
    await fresh.context().close();
    t.finding({ title: 'Once a palette has been chosen in the Studio, its menu never learns about paints ticked later: no "My paints", no "Study tab" palette', severity: 'medium', steps: '1. Advanced mode. 2. Studio tab: choose Monet (or any palette) in the Palette menu. 3. Study tab, Colors and paints, My paints, Choose my paints: tick eight paints, Done (a palette is suggested). 4. Studio tab: open the Palette menu.', expected: 'The menu lists "My paints (8)" and "Study tab: Suggested palette", as it does for a visitor who has not chosen in the Studio (the README: "the known palettes and My paints from the Study tab"); changing the ticks again changes the count.', actual: `The menu is still the ten known palettes (${ps1.options.length} entries, none of them "My paints" or "Study tab"). After a reload the same menu lists ${f.options.slice(10).map((o) => '"' + o[1] + '"').join(' and ') || 'nothing more'}. The same staleness keeps "My paints (3)" at 3 after the ticks become 5 or 1 (seen when My paints had been picked in the Studio first). Cause: js/painting.js 862: followPalette returns at once when paletteTouched, so renderPalettes (lines 850-858: it rebuilds paletteList from palettes(), 109-116, and already knows how to keep a touched choice, line 858) is never called again after the first choice in the Studio.` });
  }
  await clean(t, page, 'the Studio stops following');
  await page.context().close();
});

// ---- the greedy choice: each pick is the best one left, and it stops when another paint would barely help -------------------------------
gap('greedy choice', async (t, site) => {
  const page = await advPage(site, MINE(5), { rank: false });
  await qInstall(page);
  const runPool = async (label, pool, max, expectEarlyStop) => {
    await setRange(page, '#paintMax', String(max));
    await tickDialog(page, pool);
    await afterSuggest(page, () => click(page, '#paintDialogDone'));
    const cs = await chips(page);
    const r = await page.evaluate(([pool, cs, max]) => {
      const q = window.__q, colors = q.colors();
      const score = (codes) => Mixing.coverage(codes.map(q.paint), colors).score;
      const restOf = (prefix) => pool.filter((c) => !prefix.includes(c) && !q.paint(c).white);
      const steps = [];
      for (let k = 1; k < cs.length; k++) {
        const prefix = cs.slice(0, k), scores = restOf(prefix).map((c) => [c, score(prefix.concat(c))]);
        const chosen = scores.find((x) => x[0] === cs[k]);
        steps.push({ pick: cs[k], chosen: chosen && +chosen[1].toFixed(3), best: +Math.min(...scores.map((x) => x[1])).toFixed(3), ok: !!chosen && chosen[1] <= Math.min(...scores.map((x) => x[1])) + 1e-9 });
      }
      const left = restOf(cs), base = score(cs);
      const stopGain = left.length ? base - Math.min(...left.map((c) => score(cs.concat(c)))) : null;
      return { steps, left: left.length, stopGain, nonWhite: cs.filter((c) => !q.paint(c).white).length };
    }, [pool, cs, max]);
    t.check(r.steps.length >= 2 && r.steps.every((s) => s.ok), `${label}: every pick is the paint that brings the colors closest with what is already on the palette`, r.steps);
    const early = r.nonWhite < max && r.left > 0;
    t.check(!early || (r.nonWhite < 2) || r.stopGain < 0.4 + 1e-6, `${label}: it stops (${r.nonWhite} of ${max} paints) only when the best remaining paint would gain less than 0.4`, r);
    if (expectEarlyStop) t.check(early, `${label}: and here it does stop early, before the size ${max} it was allowed`, [cs, r]);
    return cs;
  };
  await runPool('eight paints, size 5', ['TW', 'YO', 'CRL', 'IB', 'UB', 'CYM', 'CoB', 'QM'], 5, false);
  await runPool('near-duplicate yellows and earths, size 10', ['TW', 'YO', 'YOP', 'GO', 'TOY', 'RS', 'TR'], 10, true);
  await clean(t, page, 'greedy choice');
  await page.context().close();
});

// ---- mid-action: a suggestion that is running meets a Simple switch, the size slider, the library dialog, the drawer closing ------------
gap('mid-suggestion actions', async (t, site) => {
  const RUN = '{"source":"mine","preset":"","max":10}';
  // (a) Simple mode switched on while it runs
  let page = await openPage(site, { storage: { ...ADV, [K.choice]: RUN } });
  await settled(page); await sleep(200);
  const a = await page.evaluate(() => { const b = document.getElementById('suggestBtn'); b.click(); const during = b.textContent; document.querySelector('[data-mode="simple"]').click(); return { during, disabled: b.disabled }; });
  await page.waitForFunction(() => !document.getElementById('suggestBtn').disabled, null, { timeout: 8000 }).catch(() => null);
  await settled(page); await ranked(page); await sleep(300);
  const a1 = await page.evaluate(() => ({ disabled: document.getElementById('suggestBtn').disabled, btn: document.getElementById('suggestBtn').textContent, preset: document.getElementById('srcPreset').checked, shown: [...document.querySelectorAll('#presetList li')].filter((li) => getComputedStyle(li).display !== 'none').length, pressed: document.querySelectorAll('#presetList .preset[aria-pressed="true"]').length }));
  if (/^Choosing paints/.test(a.during)) t.check(!a1.disabled && a1.preset && a1.shown === 3 && a1.pressed === 1, 'Simple switched on while a suggestion runs: the three palettes show, one is chosen and Suggest is not left stuck', { a, a1 });
  else t.note(`the suggestion finished within its first step (button read "${a.during}"), so the Simple switch could not be dropped into it.`);
  await click(page, '[data-mode="advanced"]'); await click(page, '#srcMine'); await sleep(200);
  t.check((await text(page, '#suggestBtn')) === 'Suggest a palette' && !(await page.evaluate(() => document.getElementById('suggestBtn').disabled)), 'back in Advanced on My paints Suggest is ready again', await text(page, '#suggestBtn'));
  await clean(t, page, 'race: simple');
  await page.context().close();

  // (b) the size slider moved while it runs
  page = await openPage(site, { storage: { ...ADV, [K.choice]: RUN } });
  await settled(page); await sleep(200);
  const b = await page.evaluate(() => { const btn = document.getElementById('suggestBtn'); btn.click(); const during = btn.textContent; const e = document.getElementById('paintMax'); e.value = '3'; e.dispatchEvent(new Event('input', { bubbles: true })); return during; });
  await suggestedDone(page); await mixed(page);
  const cb = await chips(page);
  t.check(cb.length >= 3 && cb.length <= 11 && JSON.parse(await storageGetRaw(page, K.choice)).max === 3 && (await text(page, '#paintMaxOut')) === '3 + white', 'the size slider moved during a suggestion: it finishes, the new size is saved and shown', [cb, await text(page, '#paintMaxOut')]);
  await suggestNow(page);
  const cb2 = await chips(page);
  t.check(cb2.length >= 3 && cb2.length <= 4, 'and the next Suggest keeps to the new size (3 + white)', cb2);
  await clean(t, page, 'race: size');
  await page.context().close();

  // (c) Done in the library dialog while it runs
  page = await openPage(site, { storage: { ...ADV, [K.choice]: RUN } });
  await settled(page); await sleep(200);
  const c = await page.evaluate(() => {
    const btn = document.getElementById('suggestBtn'); btn.click(); const during = btn.textContent;
    document.getElementById('mineEdit').click();
    ['TW', 'IB', 'YO'].forEach((code) => document.querySelector(`#paintCats input[value="${code}"]`).click());
    document.getElementById('paintDialogDone').click();
    return during;
  });
  await suggestedDone(page); await mixed(page); await sleep(300);
  const rc = await shownResult(page);
  t.check(JSON.stringify(rc.chips.slice().sort()) === '["IB","TW","YO"]' && rc.btn === 'Suggest again' && rc.rows === (await nColors(page)) && /your paints/.test(rc.about), 'Done in the library while a suggestion runs: the one result on screen is made from the three paints just ticked', rc);
  await clean(t, page, 'race: dialog');
  await page.context().close();

  // (d) the drawer closed while it runs
  page = await openPage(site, { storage: { ...ADV, [K.choice]: RUN } });
  await settled(page); await sleep(200);
  const d = await page.evaluate(() => { document.getElementById('suggestBtn').click(); const during = document.getElementById('suggestBtn').textContent; document.getElementById('drawer-colors').open = false; return during; });
  await suggestedDone(page);
  t.check(!(await page.evaluate(() => document.getElementById('drawer-colors').open)), 'the drawer closed during a suggestion stays closed while it finishes');
  await click(page, '#drawer-colors summary'); await mixed(page);
  const rd = await shownResult(page);
  t.check(!rd.hidden && rd.btn === 'Suggest again' && rd.chips.length >= 3 && rd.rows === (await nColors(page)) && rd.state === '3 per value · Suggested palette', 'reopened, the finished suggestion and all its rows are there', rd);
  await clean(t, page, 'race: drawer');
  await page.context().close();
});

// ---- Colors in each value spammed while a suggestion is on screen -----------------------------------------------------------------------
gap('slider spam under a suggestion', async (t, site) => {
  const page = await openPage(site, { storage: { ...ADV, ...MINE(4) } });
  await settled(page);
  await suggestNow(page);
  for (const v of ['2', '5', '1', '6', '3']) await setRange(page, '#colors', v);
  await settled(page); await suggestedDone(page); await quiet(page);
  const n = await nColors(page), s = await shownResult(page), rm = reachOf(s.match);
  t.check(rm && rm[1] === n && s.rows === n && s.state === '3 per value · Suggested palette' && s.btn === 'Suggest again', `five quick changes of Colors per value end on one suggestion for the last study (${n} colors), with the header of the last value`, s);
  await suggestNow(page);
  const f = await shownResult(page);
  t.check(f.match === s.match && JSON.stringify(f.chips) === JSON.stringify(s.chips), 'and it is the palette a fresh Suggest gives', [s.chips, f.chips]);
  await clean(t, page, 'slider spam');
  await page.context().close();
});

// ---- a dark blue is a color out of reach, not "the darkest you can mix" -------------------------------------------------------------------
gap('dark cool colors', async (t, site) => {
  const page = await advPage(site);
  await loadPhoto(page, await bandsImage(page, [['#ffffff', 160], ['#c98f6a', 160], ['#1030ff', 160], ['#0a1a3a', 160], ['#141414', 160]]), { settle: 300 });
  await settled(page); await ranked(page);
  const rowFor = async (hex) => (await rows(page)).find((r) => r.add === `Add ${hex} to picked colors`);
  for (const id of ['zorn', 'zorn-blue', 'reilly']) {
    await pickPreset(page, id);
    const navy = await rowFor('#0A1A3A'), black = await rowFor('#141414');
    t.check(navy && navy.status !== 'limit' && navy.status !== 'close', `${id}: a dark navy (#0A1A3A) is Near or Out of reach, never a value limit`, navy);
    t.check(black && black.status === 'limit' && black.badge === 'Darkest you can mix', `${id}: a near-black (#141414), darker than the palette goes, is "Darkest you can mix"`, black);
  }
  await pickPreset(page, 'zorn');
  const navy = await rowFor('#0A1A3A');
  t.check(navy && navy.status === 'far' && navy.badge === 'Out of reach', 'with Zorn, which has no blue, the navy is "Out of reach"', navy);
  await clean(t, page, 'dark cool colors');
  await page.context().close();
});

// ---- the pending rows and the progress words ------------------------------------------------------------------------------------------------------
gap('pending rows and progress', async (t, site) => {
  const page = await advPage(site);
  const pend = await page.evaluate(() => {
    document.querySelector('#presetList li[data-preset="schmid"] .preset').click();
    const rs = [...document.querySelectorAll('#mixList .mix-row')], last = rs[rs.length - 1], chip = last && last.querySelector('.mix-pending');
    return { n: rs.length, pending: rs.filter((r) => r.querySelector('.mix-pending')).length, recipe: last && last.querySelector('.mix-recipe').textContent, badge: !!(last && last.querySelector('.mix-badge')), stripes: chip ? /gradient/.test(getComputedStyle(chip).backgroundImage) : null, firstRecipe: rs[0].querySelector('.mix-recipe').textContent };
  });
  t.check(pend.n > 3 && pend.pending >= 1 && pend.recipe === 'Working it out…' && !pend.badge && pend.stripes === true, 'right after a palette is picked the rows not yet worked out say "Working it out…", show a striped chip and have no badge', pend);
  await mixed(page);
  t.check((await rows(page)).every((r) => RECIPE.test(r.recipe) && BADGES.includes(r.badge)) && !(await page.evaluate(() => !!document.querySelector('.mix-pending'))), 'and every one is replaced by its recipe and badge, none left pending');
  await click(page, '#srcMine');
  await page.evaluate(() => { window.__texts = []; const b = document.getElementById('suggestBtn'); new MutationObserver(() => window.__texts.push(b.textContent)).observe(b, { childList: true, characterData: true, subtree: true }); });
  await page.evaluate(() => { const e = document.getElementById('paintMax'); e.value = '10'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(page, '#suggestBtn'); await suggestedDone(page); await mixed(page);
  const texts = await page.evaluate(() => window.__texts);
  const pcts = texts.map((x) => /^Choosing paints… (\d+)%$/.exec(x)).filter(Boolean).map((m) => +m[1]);
  t.check(texts.length > 0 && texts.every((x) => /^Choosing paints… \d+%$/.test(x) || x === 'Suggest again') && texts[texts.length - 1] === 'Suggest again', 'while a suggestion runs the button reads "Choosing paints… N%" and ends on "Suggest again"', texts.slice(0, 12));
  t.check(pcts.length >= 1 && pcts.every((p, i) => i === 0 || p >= pcts[i - 1]) && pcts.every((p) => p >= 0 && p <= 100), 'and the percentage never goes backwards', pcts);
  await clean(t, page, 'pending rows and progress');
  await page.context().close();
});

// ---- the library dialog: a family as a search word, and a known palette ticked while a search hides rows --------------------------------------
gap('search by family', async (t, site) => {
  const page = await advPage(site, MINE(4), { rank: false });
  await click(page, '#mineEdit'); await sleep(200);
  await page.fill('#paintSearch', 'Earths '); await sleep(100);
  const fam = await page.evaluate(() => ({ cats: [...document.querySelectorAll('#paintCats .paint-cat')].filter((s) => !s.hidden).map((s) => s.querySelector('h3').textContent), items: [...document.querySelectorAll('#paintCats li')].filter((li) => !li.hidden).length, earths: Paints.LIBRARY.filter((p) => p.category === 'earth').length }));
  t.check(JSON.stringify(fam.cats) === '["Earths"]' && fam.items === fam.earths, 'searching a family name ("Earths ", the way the no-match hint suggests) shows just that family', fam);
  await page.fill('#paintSearch', 'blue'); await sleep(100);
  const zorn = (await presets(page)).find((p) => p.id === 'zorn');
  await tickPresetIn(page, 'zorn'); await sleep(100);
  t.check(JSON.stringify((await ticked(page)).sort()) === JSON.stringify(zorn.paints.slice().sort()) && (await text(page, '#paintDialogCount')) === '4 ticked', 'Zorn\'s four paints are ticked from the menu while the search "blue" hides them, and the count says 4', [await ticked(page), await text(page, '#paintDialogCount')]);
  await page.fill('#paintSearch', ''); await sleep(100);
  const shown = await page.evaluate(() => ({ items: [...document.querySelectorAll('#paintCats li')].filter((li) => !li.hidden).length, on: [...document.querySelectorAll('#paintCats li input:checked')].filter((b) => !b.closest('li').hidden).map((b) => b.value) }));
  t.check(shown.items === 77 && JSON.stringify(shown.on.sort()) === JSON.stringify(zorn.paints.slice().sort()), 'clearing the search shows all 77 with exactly those four ticked', shown);
  await click(page, '#paintDialogDone'); await sleep(200);
  await clean(t, page, 'search by family');
  await page.context().close();
});

// ---- + and Add block colors: the second toast, and the Picked colors header while that drawer is closed ----------------------------------
gap('plus with the picked colors closed', async (t, site) => {
  const page = await advPage(site);
  await page.evaluate(() => { document.getElementById('drawer-swatches').open = false; });
  await pickPreset(page, 'zorn');
  const before = await text(page, '#swatchesState');
  await click(page, '#mixList .mix-row:first-child .mix-add'); await sleep(200);
  const after = await text(page, '#swatchesState');
  t.check(!(await page.evaluate(() => document.getElementById('drawer-swatches').open)) && after !== before && /1/.test(after), 'pressing + with the Picked colors drawer closed moves its header count', [before, after]);
  await resetToast(page);
  await click(page, '#addBlocks'); await sleep(200);
  const added = await text(page, '#toast'), cnt = await pickedCount(page), distinct = await page.evaluate(() => new Set(Studio.result().blockColors.map((c) => Studio.toHex(c))).size);
  t.check(/^Added \d+ block colors?$/.test(added) && cnt === distinct, 'Add block colors adds the rest (the header of the closed drawer follows)', [added, cnt, distinct, await text(page, '#swatchesState')]);
  await resetToast(page);
  await click(page, '#addBlocks'); await sleep(200);
  t.check((await text(page, '#toast')) === 'Those colors are already in Picked colors' && (await pickedCount(page)) === cnt, 'pressing it again says "Those colors are already in Picked colors" and adds nothing', [await text(page, '#toast'), await pickedCount(page)]);
  await clean(t, page, 'plus with drawer closed');
  await page.context().close();
});

// ---- the library dialog and the + buttons on a phone ------------------------------------------------------------------------------------------------
gap('phone dialog and tap targets', async (t, site) => {
  let page = await advPage(site, {}, { viewport: PHONE });
  await pickPreset(page, 'zorn');
  const add = await page.locator('#mixList .mix-row:first-child .mix-add').boundingBox();
  t.check(add && add.width >= 24 && add.height >= 24, 'phone: a + button is at least 24 px square (WCAG 2.2 minimum target size)', add);
  if (add && (add.width < 44 || add.height < 44)) t.note(`The + buttons are ${Math.round(add.width)} x ${Math.round(add.height)} px on a phone, under the 44 px usually advised for a fingertip (they pass the 24 px minimum).`);
  await click(page, '#srcMine'); await click(page, '#mineEdit'); await sleep(300);
  await page.fill('#paintSearch', 'blue'); await sleep(100);
  const box = await page.evaluate(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; }; return { dialog: r('paintDialog'), done: r('paintDialogDone'), shown: [...document.querySelectorAll('#paintCats li')].filter((li) => !li.hidden).length, w: innerWidth, h: innerHeight }; });
  t.check(box.dialog.l >= 0 && box.dialog.r <= box.w && box.dialog.t >= 0 && box.dialog.b <= box.h, 'phone: the library dialog sits inside the screen', box);
  t.check(box.done.l >= 0 && box.done.r <= box.w && box.done.t >= 0 && box.done.b <= box.h, 'phone: Done is on the screen without scrolling the dialog', box.done);
  t.check(box.shown > 0 && box.shown < 77, 'phone: the search filters the list', box.shown);
  await click(page, '#paintDialogDone'); await sleep(200);
  await clean(t, page, 'phone dialog');
  await page.context().close();
  // Simple mode's three palettes on a phone
  page = await openPage(site, { viewport: PHONE, storage: { [K.drawers]: '["colors"]' } });
  await settled(page); await ranked(page);
  const btn = page.locator('#presetList li[data-simple] .preset').first();
  await btn.scrollIntoViewIfNeeded();
  await btn.tap().catch(async () => btn.click());
  await mixed(page);
  const shown = (await presetList(page)).filter((l) => l.shown);
  t.check(shown.length === 3 && (await hscroll(page)) <= 0 && (await rows(page)).length === (await nColors(page)), 'phone, Simple: the three palettes fit, and a tap on one shows its mixes', [shown.length, await hscroll(page)]);
  await clean(t, page, 'phone simple');
  await page.context().close();
});

// ---- keyboard: Tab to the + buttons and the block-view switch, and focus after the dialog closes -----------------------------------------------
gap('keyboard reach', async (t, site) => {
  const page = await advPage(site);
  await pickPreset(page, 'zorn');
  const was = await pickedCount(page);
  await page.focus('#presetList li:last-child .preset');
  let onAdd = false;
  for (let i = 0; i < 20 && !onAdd; i++) { await page.keyboard.press('Tab'); onAdd = await page.evaluate(() => document.activeElement.classList.contains('mix-add')); }
  t.check(onAdd, 'Tab from the last palette reaches a + button');
  if (onAdd) { await page.keyboard.press('Enter'); await sleep(150); t.check((await pickedCount(page)) === was + 1, 'Enter on + keeps the color', [was, await pickedCount(page)]); }
  await page.focus('[data-block-view="photo"]');
  await page.keyboard.press('Tab');
  const onSwitch = await page.evaluate(() => document.activeElement.id);
  t.check(onSwitch === 'blockViewPalette', 'Tab from Photo reaches the Palette switch', onSwitch);
  await page.keyboard.press('Space'); await blockBusy(page);
  t.check((await page.evaluate(() => document.getElementById('blockViewPalette').getAttribute('aria-pressed'))) === 'true', 'Space on it turns the palette view on');
  await click(page, '#srcMine'); await sleep(100);
  await page.focus('#mineEdit'); await page.keyboard.press('Enter'); await sleep(250);
  t.check(await dialogOpen(page), 'Enter opens the library');
  await page.keyboard.press('Escape'); await sleep(250);
  const back = await page.evaluate(() => document.activeElement && document.activeElement.id);
  t.check(!(await dialogOpen(page)) && back === 'mineEdit', 'Escape closes it and focus returns to Choose my paints', back);
  await clean(t, page, 'keyboard reach');
  await page.context().close();
});

// ---- two tabs: ticks made in one are not seen by the other ---------------------------------------------------------------------------------------
gap('two tabs', async (t, site) => {
  const a = await advPage(site, MINE(4), { rank: false });
  const b = await newTab(site, a);
  await settled(b);
  const tickOne = async (page, code) => { await click(page, '#mineEdit'); await sleep(150); await page.evaluate((c) => document.querySelector(`#paintCats input[value="${c}"]`).click(), code); await click(page, '#paintDialogDone'); await sleep(250); };
  await click(a, '#mineEdit'); await sleep(100); await setMine(a, ['TW', 'YO']);
  await afterSuggest(a, () => click(a, '#paintDialogDone'));
  // tab B, open all along, hears of it ("Your paints are kept in your browser", and the picked colors are shared by every tab)
  const heard = await b.waitForFunction(() => document.getElementById('mineCount').textContent === '2 paints ticked', null, { timeout: 3000 }).then(() => true).catch(() => false);
  const bSays = await text(b, '#mineCount');
  t.check(heard, 'tab B, open all along, shows the two paints tab A ticked', bSays);
  await b.reload({ waitUntil: 'load' }); await sleep(300); await settled(b);
  t.check((await text(b, '#mineCount')) === '2 paints ticked', 'reloaded, tab B has the two ticks', await text(b, '#mineCount'));
  // a tick in B, then another in A (not reloaded since): both must be kept
  await a.reload({ waitUntil: 'load' }); await sleep(300); await settled(a);
  await tickOne(b, 'IB');
  await tickOne(a, 'CRL');
  const saved = await storageGetJson(a, K.mine);
  const all = Array.isArray(saved) && ['TW', 'YO', 'IB', 'CRL'].every((c) => saved.includes(c));
  t.check(all, 'a tick made in tab B (IB) and then one in tab A (CRL) are both kept', saved);
  if (!all || !heard) t.finding({ title: 'Paints ticked in one open tab are overwritten by a tick in another: the last tab to save wins', severity: 'low', steps: '1. Open the site in two tabs, Advanced mode, Colors and paints, My paints (TW and YO already ticked in both). 2. In tab B, Choose my paints, tick Ivory Black, Done. 3. In tab A (not reloaded), Choose my paints, tick Cadmium Red Light, Done. 4. Reload either tab.', expected: 'Both ticks are kept ("Your paints are kept in your browser between visits"): TW, YO, IB, CRL.', actual: `Tab B read "${bSays}" after tab A ticked two paints, and the saved list ends as ${JSON.stringify(saved)}: tab A wrote its own list over tab B's, so the black ticked in B is gone. Picked colors do listen for changes from other tabs (js/app.js 1062); My paints did not. Cause: js/palette.js 443 (saveMine) writes this tab's Set whole, and palette.js had no storage listener to refresh it.` });
  await clean(t, a, 'two tabs: A'); await clean(t, b, 'two tabs: B');
  await a.context().close();
});

// ---- no storage: the ticks work for the visit and are not kept, quietly ------------------------------------------------------------------------------------------------
gap('storage unavailable', async (t, site) => {
  // a quota that is full
  const page = await advPage(site, MINE(4), { rank: false });
  const filled = await page.evaluate(() => { let n = 0; const chunk = 'x'.repeat(1 << 18); try { for (; n < 100; n++) localStorage.setItem('filler.' + n, chunk + n); } catch (e) { /* full */ } for (let k = 0; k < 40; k++) { try { localStorage.setItem('filler.s' + k, 'y'.repeat(4096)); } catch (e) { break; } } return n; });
  await click(page, '#mineEdit'); await sleep(100); await setMine(page, ['TW', 'IB', 'YO']);
  await afterSuggest(page, () => click(page, '#paintDialogDone'));
  const fullToast = await text(page, '#toast');
  const fullSays = await page.evaluate(() => /not (kept|saved|remembered)|storage (is|are) (full|off|blocked|unavailable)/i.test(document.body.innerText));
  t.check((await text(page, '#mineCount')) === '3 paints ticked' && (await chips(page)).length >= 2, 'with the browser\'s storage full, ticking three paints and getting a suggestion still works for the visit', [await text(page, '#mineCount'), await chips(page)]);
  await clean(t, page, 'storage full');
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('filler.')).forEach((k) => localStorage.removeItem(k)));
  await page.context().close();
  t.note(`Storage was filled with ${filled} blocks of 256 KB (and then the small gaps). The ticks and the suggestion worked; after the Done the toast read "${fullToast}" and the page ${fullSays ? 'does' : 'does not'} say anywhere that a save may have been refused.`);
  // the page framed by another site with scripts allowed but no storage
  const sb = await openPage(site, { sandbox: {}, storage: null });
  const fr = sb.app;
  await fr.waitForFunction(() => window.Studio && !!Studio.result() && document.getElementById('busy').hidden, null, { timeout: 20000 }).catch(() => null);
  await fr.evaluate(() => { document.querySelector('[data-mode="advanced"]').click(); document.getElementById('drawer-colors').open = true; });
  await sleep(300);
  await fr.evaluate(() => { document.getElementById('srcMine').click(); document.getElementById('mineEdit').click(); ['TW', 'IB'].forEach((c) => document.querySelector(`#paintCats input[value="${c}"]`).click()); document.getElementById('paintDialogDone').click(); });
  await fr.waitForFunction(() => { const b = document.getElementById('suggestBtn'); return b.textContent === 'Suggest again' && !b.disabled; }, null, { timeout: 30000 }).catch(() => null);
  const inFrame = await fr.evaluate(() => ({ count: document.getElementById('mineCount').textContent, chips: [...document.querySelectorAll('#resultPaints .paint-code')].map((e) => e.textContent), storage: (() => { try { localStorage.getItem('x'); return 'works'; } catch (e) { return 'blocked'; } })() }));
  t.check(inFrame.count === '2 paints ticked' && inFrame.chips.length === 2, 'in a frame with no storage the ticks and the suggestion work for the visit', inFrame);
  if (inFrame.storage === 'works') t.note('The sandboxed frame turned out to have working storage, so the no-storage path was not driven.');
  else {
    const toastIn = await fr.evaluate(() => document.getElementById('toast').textContent);
    await fr.evaluate(() => location.reload()).catch(() => null);
    await sleep(800);
    await fr.waitForFunction(() => window.Studio && !!Studio.result() && document.getElementById('busy').hidden, null, { timeout: 20000 }).catch(() => null);
    const again = await fr.evaluate(() => document.getElementById('mineCount').textContent).catch(() => null);
    t.note(`In a frame with storage blocked the toast reads "${toastIn}" after the ticks and the suggestion, and after a reload My paints reads "${again}": the README's "kept in your browser between visits" cannot hold there and the page does not say so.`);
  }
  await clean(t, sb, 'sandboxed frame');
  await sb.context().close();
});

// ======================================================================================================================
// THIRD PASS: the gaps the second pass left. The recipes' arithmetic (the parts, the mix the pigment model gives for
// them, the touches), the colors at the ends (pure white, pure black, a green no palette reaches, a very dark green), the
// meters against the rows they head, My paints with one or two paints that are not white and with every paint ticked
// against none, and the ranking of an unchanged study. Each block is a segment: a throw in it is one failed check, and
// every page it opened is closed.
// ======================================================================================================================
const round3 = (name, fn) => gap(name, async (t, site) => {
  const t0 = Date.now(), pages = [];
  const open = async (opts) => { const p = await openPage(site, opts); pages.push(p); return p; };
  try { await fn(t, site, open); } catch (e) { t.check(false, `${name}: ran to its end`, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  for (const p of pages) await p.context().close().catch(() => null);
  t.note(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
});
// every row of the mix list next to what the pigment model writes for its color with the same paints (run in the page:
// Mixing.recipe, Mixing.mix and Mixing.reach are the page's own), with the recipe written the way the README shows it
// ("TW 6 · YO 2 · CRL 1 · IB touch", a no-break space inside each part, no number on a lone main paint)
const MODEL_ROWS = (codes) => {
  const paints = codes.map((c) => Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(c))));
  const reach = Mixing.reach(paints);
  const WORDS = { close: 'Close', near: 'Near', far: 'Out of reach' };
  return [...document.querySelectorAll('#mixList .mix-row')].map((row) => {
    const hex = /#[0-9A-F]{6}/.exec(row.querySelector('.mix-add').getAttribute('aria-label'))[0];
    const pred = (/#[0-9A-F]{6}/.exec(row.querySelector('.mix-chip:nth-child(2)').title) || [''])[0];
    const badge = row.querySelector('.mix-badge');
    const res = Mixing.recipe(Mixing.hexToRgb(hex), paints);
    const main = res.items.filter((it) => !it.touch);
    const text = res.items.map((it) => { const code = paints[it.paint].code; return it.touch ? `${code} touch` : main.length > 1 ? `${code} ${it.parts}` : code; }).join(' · ');
    const pile = res.items.reduce((s, it) => s + it.parts, 0);
    const whole = paints.map((p, i) => main.filter((it) => it.paint === i).reduce((s, it) => s + it.parts, 0));
    const wm = main.length === res.items.length ? Mixing.mix(paints, whole) : null;
    return {
      hex, pred, recipe: row.querySelector('.mix-recipe').textContent, badge: badge ? badge.textContent : '',
      model: { text, mix: Mixing.rgbToHex(res.mix), badge: res.limit === 'dark' ? 'Darkest you can mix' : res.limit === 'light' ? 'Lightest you can mix' : WORDS[res.status], mixL: res.mixLab[0], dE: res.dE },
      wholeMix: wm ? Mixing.rgbToHex(wm.rgb) : null,
      items: res.items.map((it) => ({ code: paints[it.paint].code, parts: it.parts, touch: it.touch, white: paints[it.paint].white, share: it.parts / pile })),
      dark: reach.dark, light: reach.light, whites: paints.filter((p) => p.white).map((p) => p.code),
    };
  });
};
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// ---- the recipes' arithmetic on a photo of six flat colors, and those colors at the ends of what paint does ------------
round3('recipe arithmetic and the edge colors', async (t, site, open) => {
  const page = await open({ storage: ADV });
  await settled(page); await ranked(page);
  const BANDS = [['#FFFFFF', 130], ['#000000', 130], ['#00FF00', 130], ['#002000', 130], ['#C98F6A', 140], ['#808080', 140]];
  await loadPhoto(page, await bandsImage(page, BANDS, 'six-colors.png'), { settle: 300 });
  await settled(page); await ranked(page);
  const studied = await page.evaluate(() => Studio.result().blockColors.filter((c) => c.share > 0).map((c) => Studio.toHex(c)));
  t.check(studied.length === 6 && BANDS.every(([hex]) => studied.includes(hex)), 'a photo of six flat bands is studied as exactly those six colors', studied);
  const meters = await presetList(page);
  const all = await presets(page);
  const per = [];
  for (const p of all) {
    await pickPreset(page, p.id);
    per.push({ id: p.id, match: await text(page, '#resultMatch'), rows: await page.evaluate(MODEL_ROWS, p.paints) });
  }
  const every = per.flatMap((p) => p.rows.map((r) => ({ id: p.id, ...r })));
  // what the page shows is what the model writes
  const differ = every.filter((r) => r.recipe !== r.model.text || r.pred !== r.model.mix || r.badge !== r.model.badge);
  t.check(every.length === 60 && differ.length === 0, 'on all ten palettes every row is the recipe the pigment model writes for its color: the same paints and parts, the same predicted mix, the same badge', differ.slice(0, 4).map((r) => [r.id, r.hex, r.recipe, r.model.text, r.pred, r.model.mix, r.badge, r.model.badge]));
  const noTouch = every.filter((r) => r.wholeMix);
  t.check(noTouch.length >= 20 && noTouch.every((r) => r.wholeMix === r.pred), `a recipe of whole parts only (${noTouch.length} rows) predicts exactly the mix of those parts`, noTouch.filter((r) => r.wholeMix !== r.pred).map((r) => [r.id, r.recipe, r.pred, r.wholeMix]));
  const touches = every.flatMap((r) => r.items.filter((it) => it.touch).map((it) => ({ id: r.id, hex: r.hex, code: it.code, share: it.share })));
  t.check(touches.length >= 5 && touches.every((x) => x.share > 0 && x.share < 1 / 15), `every touch (${touches.length} of them) is some paint, and less than a fifteenth of the pile`, touches.filter((x) => !(x.share > 0 && x.share < 1 / 15)));
  const order = every.filter((r) => {
    const main = r.items.filter((it) => !it.touch), firstTouch = r.items.findIndex((it) => it.touch);
    const touchesLast = firstTouch < 0 || r.items.slice(firstTouch).every((it) => it.touch);
    const biggestFirst = main.every((it, i) => i === 0 || it.parts < main[i - 1].parts || (it.parts === main[i - 1].parts && !it.white));
    const lowest = main.length < 2 || main.map((it) => it.parts).reduce(gcd) === 1;
    return !(touchesLast && biggestFirst && lowest && main.every((it) => Number.isInteger(it.parts) && it.parts >= 1));
  });
  t.check(order.length === 0, 'every recipe\'s whole parts are in lowest terms (no common factor), the biggest first, white first in a tie, and the touches last', order.slice(0, 4).map((r) => [r.id, r.recipe]));
  // the ends: pure white is the white straight from the tube, pure black the darkest mix
  const at = (hex) => every.filter((r) => r.hex === hex);
  const white = at('#FFFFFF');
  t.check(white.length === 10 && white.every((r) => r.whites.length === 1 && r.recipe === r.whites[0] && r.badge === 'Lightest you can mix'), 'pure white is each palette\'s white straight from the tube, marked "Lightest you can mix", on all ten palettes', white.map((r) => [r.id, r.recipe, r.badge]));
  const black = at('#000000');
  t.check(black.length === 10 && black.every((r) => r.badge === 'Darkest you can mix' && r.model.mixL <= r.dark + 3 && !r.items.some((it) => it.white)), 'pure black is "Darkest you can mix" on all ten palettes: a mix within 3 L* of the darkest the palette goes, with no white in it', black.map((r) => [r.id, r.recipe, r.badge, +r.model.mixL.toFixed(1), +r.dark.toFixed(1)]));
  // a green no palette reaches, and a very dark green
  const green = at('#00FF00');
  t.check(green.length === 10 && green.every((r) => r.badge === 'Out of reach' && r.model.dE >= 6), 'a saturated green (#00FF00) is "Out of reach" on all ten palettes', green.map((r) => [r.id, r.recipe, r.badge, +r.model.dE.toFixed(1)]));
  t.check(meters.length === 10 && meters.every((m) => /^\d+ \/ 6$/.test(m.reach) && +m.reach.split(' / ')[0] <= 5) && per.every((p) => (reachOf(p.match) || [9])[0] <= 5), 'no palette counts the green: no meter reads 6 / 6 and no result "Mixes 6 of 6"', meters.map((m) => [m.id, m.reach]));
  const deep = at('#002000');
  const limited = deep.filter((r) => /you can mix$/.test(r.badge));
  if (!t.check(deep.length === 10 && limited.length === 0, 'a very dark green (#002000) is Near or Out of reach on every palette, never a value limit, as a dark navy is', deep.map((r) => [r.id, r.recipe, r.badge]))) {
    t.finding({
      title: `A very dark green is marked "Darkest you can mix" and mixed as plain black, where a dark navy is "Out of reach" (${limited.length} of 10 palettes)`,
      severity: 'low',
      steps: '1. Advanced mode, Colors and paints. 2. Load a photo with a flat band of a very dark green such as #002000 (L* 9.3), and a band of dark navy #0A1A3A for comparison. 3. Pick Zorn, Frank Reilly (which has Viridian) or Rembrandt and read the two rows.',
      expected: 'The two dark colors are treated alike. js/mixing.js says why at line 492: a value limit is for a photo\'s blacks, while "A blue or green is still a color out of reach: a gray suggests it better than a black does". The navy is "Out of reach" with a mix that keeps some color, so the green should be too (README: "Darkest you can mix and Lightest you can mix mark a photo\'s darks and lights that go further than paint does").',
      actual: `#002000 reads ${limited.map((r) => `${r.id} "${r.recipe}" (${r.badge})`).join(', ')}: plain black is offered for a deep green, even on Reilly's palette, which carries a green. The dark navy beside it stays "Out of reach" on the same palettes (the second pass's dark cool colors block).`,
      cause: 'js/mixing.js 520-524: isCool, which exempts "Blues, cyans and greens" from the value limit, only takes hues from 150° to 330° in L*a*b*; an sRGB green sits near 136-144° (#00FF00 is 136°, #002000 144°), so greens fall outside it, and describe() (line 495) marks the row as a limit with the darkest mix.',
    });
  }
  await clean(t, page, 'recipe arithmetic and the edge colors');
});

// ---- "Mixes N of M colors" and the meters against the rows below them -------------------------------------------------
round3('the meters against the rows they head', async (t, site, open) => {
  const page = await open({ storage: ADV });
  await settled(page); await ranked(page);
  const list = await presetList(page);
  const n = await nColors(page);
  const per = [];
  for (const l of list) {
    await pickPreset(page, l.id);
    const rs = await rows(page);
    per.push({ id: l.id, meter: +l.reach.split(' / ')[0], match: reachOf(await text(page, '#resultMatch')), mixed: rs.filter((r) => r.badge === 'Close' || r.badge === 'Near').length, badges: rs.map((r) => (r.status === 'limit' ? 'L' : r.status[0])).join('') });
  }
  const under = per.filter((p) => p.match && p.mixed > p.match[0]);
  const meterOk = t.check(per.length === 10 && under.length === 0, 'sample: every color a palette\'s rows call Close or Near is counted in its "Mixes N of M colors" and its meter', per.map((p) => `${p.id} ${p.match && p.match[0]}/${n}: ${p.mixed} Close or Near (${p.badges})`));
  // the list's order against the rows: a palette sits below another only if its rows mix no more of the colors
  const inverted = [];
  per.forEach((a, i) => per.slice(i + 1).forEach((b) => { if (b.mixed > a.mixed) inverted.push(`${b.id} (${b.mixed} Close or Near, meter ${b.meter}) below ${a.id} (${a.mixed}, meter ${a.meter})`); }));
  t.check(inverted.length === 0, 'sample: no palette is ranked below one whose rows mix fewer of the colors (the README ranks them "by how many of this study\'s colors each can mix")', inverted.slice(0, 6));
  await clean(t, page, 'meters against the rows: sample');
  // a second photo, the generated portrait: the same rows as the page writes them (the block above shows the page writes
  // the model's recipes), read straight from the model for the ten palettes
  await loadPhoto(page, await makeImage(page, { width: 600, height: 800, name: 'portrait.png' }), { settle: 300 });
  await settled(page); await ranked(page);
  const second = await page.evaluate(() => {
    const colors = Studio.result().blockColors.filter((c) => c.share > 0).map((c) => ({ rgb: { r: c.r, g: c.g, b: c.b }, weight: Math.sqrt(c.share) }));
    const shown = [...document.querySelectorAll('#presetList li')].map((li) => ({ id: li.dataset.preset, meter: +li.querySelector('.preset-reach').textContent.split(' / ')[0] }));
    return shown.map((s) => {
      const pr = Paints.PRESETS.find((p) => p.id === s.id);
      const paints = pr.paints.map((c) => Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(c))));
      const rs = colors.map((c) => Mixing.recipe(c.rgb, paints));
      return { id: s.id, meter: s.meter, mixed: rs.filter((r) => !r.limit && r.status !== 'far').length, close: rs.filter((r) => !r.limit && r.status === 'close').length, n: colors.length };
    });
  });
  const under2 = second.filter((p) => p.mixed > p.meter);
  t.check(under2.length === 0, 'generated portrait: every color a palette\'s recipes bring within ΔE 6 is counted in its meter', second.map((p) => `${p.id} ${p.meter}/${p.n}: ${p.mixed} within reach (${p.close} Close)`));
  if (!meterOk || under2.length) {
    const cmy = per.find((p) => p.id === 'cmy') || per[per.length - 1], split2 = second.find((p) => p.id === 'split');
    t.finding({
      title: `A palette's meter and "Mixes N of M colors" undercount what its own rows mix: Modern primaries reads "Mixes ${cmy.match && cmy.match[0]} of ${n} colors" over ${cmy.mixed} rows marked Close or Near, and three-paint palettes are ranked too low`,
      severity: 'medium',
      steps: `1. Advanced mode, Colors and paints, Known palettes, on the built-in sample study. 2. Press Modern primaries (CMY): read "Mixes N of ${n} colors" and the badges of its rows. 3. Do the same for Three primaries and Split primary, and compare their places in the list with Zorn's. 4. Load a plain generated portrait (or any photo of a face on a cool ground) and press Split primary.`,
      expected: 'README: "Known palettes lists ten palettes ... ranked by how many of this study\'s colors each can mix and then by how closely". The count over the rows says how many of them the palette mixes, so every row marked Close or Near is counted, and a palette whose rows mix more colors is not ranked below one whose rows mix fewer.',
      actual: `Sample: ${per.filter((p) => p.match && p.mixed > p.match[0]).map((p) => `${p.id} says ${p.match[0]} of ${n} over ${p.mixed} Close or Near rows (${p.badges})`).join('; ')}. The list puts ${inverted.slice(0, 3).join('; ')}. On the generated portrait: ${under2.map((p) => `${p.id} meter ${p.meter}/${p.n} but ${p.mixed} within reach (${p.close} Close)`).join('; ')}${split2 ? `; Split primary (${split2.close} of its ${split2.n} rows Close) is ranked ${second.indexOf(split2) + 1} of 10` : ''}.`,
      cause: 'js/palette.js 147-152 ranks, and 126 / 270 write "Mixes N of M", from Mixing.coverage (js/mixing.js 744-790), which tries each paint alone and each pair in tenths, with white (blendsWith, PAIR_PARTS = 10). The rows come from recipeTask, which tries every set of up to three paints and refines them (the comment at 662: "Full recipes also try three paints at once, so they come out as close or closer"). Skin and grays from a cyan, a magenta and a yellow need all three, so the count misses most of what the rows mix, and the ranking with it.',
    });
  }
  await clean(t, page, 'meters against the rows: portrait');
});

// ---- My paints with one paint that is not a white, two without white, and every paint against none ---------------------------
round3('my paints without white, and all against none', async (t, site, open) => {
  const seeded = async (codes, max) => {
    const page = await open({ storage: { ...ADV, [K.choice]: JSON.stringify({ source: 'mine', preset: '', max }), [K.mine]: JSON.stringify(codes) } });
    await settled(page);
    await suggestNow(page);
    return page;
  };
  // one paint, a black: nothing to lighten it with
  let page = await seeded(['IB'], 6);
  let s = await shownResult(page);
  let rs = await rows(page);
  const n = await nColors(page);
  t.check((await text(page, '#mineCount')) === '1 paint ticked' && (await text(page, '#paintMaxOut')) === '6' && JSON.stringify(s.chips) === '["IB"]', 'one paint ticked, Ivory Black: the size reads "6" (no white to add) and the palette is that black alone', { count: await text(page, '#mineCount'), max: await text(page, '#paintMaxOut'), chips: s.chips });
  t.check(rs.length === n && rs.every((r) => r.recipe === 'IB' && /^(Darkest|Lightest) you can mix$/.test(r.badge)), 'with the black alone every mix is that black, and every row says it is as dark or as light as the palette goes', rs.map((r) => [r.recipe, r.badge]));
  await clean(t, page, 'my paints: one black');
  await page.context().close();
  // two paints, a red and a blue, no white
  page = await seeded(['CRL', 'UB'], 6);
  s = await shownResult(page);
  rs = await rows(page);
  t.check((await text(page, '#paintMaxOut')) === '6' && JSON.stringify(s.chips.slice().sort()) === '["CRL","UB"]' && /your paints/.test(s.about), 'two paints ticked, a red and a blue: the size reads "6", the palette is the two', { max: await text(page, '#paintMaxOut'), chips: s.chips, about: s.about });
  t.check(rs.length === n && rs.every((r) => BADGES.includes(r.badge) && r.recipe.split(' · ').every((part) => ['CRL', 'UB'].includes(part.split(' ')[0]))), 'every recipe is made of the red and the blue alone, with a badge, and none asks for white', rs.map((r) => [r.recipe, r.badge]));
  checkRecipes(t, 'red and blue', rs, await whiteMap(page));
  await clean(t, page, 'my paints: red and blue');
  await page.context().close();
  // every paint ticked against none ticked ("With no paints ticked, it chooses from the whole library"), at size 3
  page = await seeded([], 3);
  const none = await shownResult(page);
  const everyCode = await page.evaluate(() => Paints.LIBRARY.map((p) => p.code));
  await page.context().close();
  page = await seeded(everyCode, 3);
  const full = await shownResult(page);
  t.check(none.chips[0] === 'TW' && none.chips.length >= 3 && none.chips.length <= 4 && JSON.stringify(full.chips) === JSON.stringify(none.chips) && full.match === none.match, 'at size 3, every paint ticked gives the palette nothing ticked gives (the whole library): titanium white and at most three paints, the same reach', { none: [none.chips, none.match], all: [full.chips, full.match] });
  t.check(/^Chosen from the whole library/.test(none.about) && /^Chosen from your paints/.test(full.about) && (await text(page, '#mineCount')) === '77 paints ticked', 'and each says where it chose from: "the whole library" and "your paints"', [none.about, full.about]);
  await clean(t, page, 'my paints: all against none');
});

// ---- the ranking of an unchanged study ------------------------------------------------------------------------------------------
round3('the ranking of an unchanged study', async (t, site, open) => {
  const page = await open({ storage: ADV });
  await settled(page); await ranked(page);
  const rank = () => page.evaluate(() => [...document.querySelectorAll('#presetList li')].map((li) => `${li.dataset.preset} ${li.querySelector('.preset-reach').textContent}${li.querySelector('.preset-best') ? ' best' : ''}`).join(', '));
  // the list is stamped, and a change waits for a new list (a result that changes nothing draws it again)
  const stamp = () => page.evaluate(() => document.querySelectorAll('#presetList li').forEach((li) => { li.dataset.old = '1'; }));
  const redrawn = () => page.waitForFunction(() => !document.querySelector('#presetList li[data-old]') && document.querySelectorAll('#presetList .preset').length === 10 && !document.getElementById('presetList').hasAttribute('aria-busy') && document.getElementById('busy').hidden, null, { timeout: 30000 }).then(() => true).catch(() => false);
  const input = (id, v, type = 'input') => page.evaluate(([id, v, type]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(type, { bubbles: true })); }, [id, v, type]);
  const first = await rank();
  const seen = [];
  const after = async (label, act, wait = true) => { await stamp(); await act(); const again = wait ? await redrawn() : true; seen.push({ label, again, same: (await rank()) === first }); };
  await after('a reload', async () => { await page.reload({ waitUntil: 'load' }); await settled(page); });
  await after('the Studio tab and back', async () => { await tab(page, 'paint'); await tab(page, 'study'); }, false);
  await after('the drawer closed and opened', async () => { await page.evaluate(() => { document.getElementById('drawer-colors').open = false; }); await sleep(150); await page.evaluate(() => { document.getElementById('drawer-colors').open = true; }); await sleep(300); }, false);
  await after('Colors in each value 3 → 4 → 3', async () => { await input('colors', '4'); await redrawn(); await stamp(); await input('colors', '3'); });
  await after('Simplify up one and back', async () => { const v = await page.evaluate(() => document.getElementById('simplify').value); await input('simplify', String(+v + 1)); await redrawn(); await stamp(); await input('simplify', v); });
  await after('Simple mode and back to Advanced', async () => { await click(page, '[data-mode="simple"]'); await redrawn(); await stamp(); await click(page, '[data-mode="advanced"]'); });
  await after('a palette picked', async () => { await pickPreset(page, 'monet'); }, false);
  await after('My paints and back to Known palettes', async () => { await click(page, '#srcMine'); await sleep(150); await click(page, '#srcPreset'); await ranked(page); }, false);
  t.check(seen.every((x) => x.again && x.same), 'an unchanged study keeps its ranking, meters and Best match through a reload, a tab switch, the drawer closed, a setting moved and moved back, Simple and back, a palette picked and the source switched', { first, seen });
  // the same photo loaded twice
  const photo = await makeImage(page, { width: 600, height: 800, name: 'twice.png' });
  await stamp(); await loadPhoto(page, photo, { settle: 300 }); await redrawn();
  const once = await rank();
  await stamp(); await loadPhoto(page, photo, { settle: 300 });
  const twice = await redrawn();
  t.check(twice && (await rank()) === once && once !== first, 'the same photo loaded twice is ranked the same both times', { once, twice: await rank() });
  await clean(t, page, 'the ranking of an unchanged study');
});
