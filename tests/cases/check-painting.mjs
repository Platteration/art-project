// How close did I get? (Check my painting), played like a sceptical tester: the drawer with the built-in
// example on the #check route and from the guide's Try it button; its badge, open and closed, and after a
// reload; the three scores, their ranges and the grade for each; the five biggest differences with their
// plain notes; the numbered white labels on the accuracy map and a hover on a zone, covered and left out;
// Move, Size and Rotate at their ends and one past them, the hatched left-out area and the panel's note,
// the full correction of the example, slider spam, Reset while busy, and the keyboard; Show reference on
// top; Fix color cast on the example and on a painting with known patches (neutral gray, tinted whites,
// skin, brick red, leaf green, a bright orange and a yellow, a dark spot, spots at and past the blue
// limit), picking again, Remove color fix, Esc, a double tap, picking cancelled by a tab switch, the panel
// and the drawer closing, and by a new painting; the reference's own pixels as the painting (100 on
// every score, at every lean, preset and working size); every kind of file for the painting by input,
// drop and paste (a text file, a broken JPEG, SVGs, 1 px, strips, a transparent PNG, flat white and
// black, WebP, 24 megapixels and one past it), the drop hint, and a drop with the drawer closed; Crop and
// Stretch; a new reference while the drawer is open, with the example and with a painting of the
// visitor's; Use my Studio painting with a blank paper, with strokes, twice, and with a dealt portrait,
// and with painting.js missing; Simple and Advanced hints; hostile saved state for every key the drawer
// depends on; and the phone width.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, clean, tab, makeImage, textFile, brokenImage, svgImage, dropFiles, pasteFile, stroke, inked, storageGet, click, text, hscroll, screenshot, sleep, PHONE, PROTO_NAMES, ROOT } from '../lib.mjs';

const EXAMPLE_LABEL = 'Example painting · a made-up attempt at the sample: lifted shadows, warmer skin, and photographed slightly tilted. Line it up below to see the score change. Load your own to replace it.';
const NO_ART_LABEL = 'Load a photo of your finished painting to score it against the reference.';
const SAMPLE = /^Sample study · a painted stand-in\./;
const NOT_IMAGE = /^That file is not an image\. Choose a JPG, PNG or WebP photo\.$/;
const NOT_OPENED = /^This image could not be opened\. HEIC photos from a phone open in Safari; elsewhere save them as JPG or PNG first\.$/;
const TOO_SMALL = /^That picture is too small to check \(\d+ × \d+ px\): it needs at least 16 px on each side\.$/; // the painting's own wording, not the Study tab's
const NOTE = /^(Too (light|dark) by \d+\.\d value|Too (warm|cool)|Too (saturated|gray)|Hue is off)(, (too (warm|cool)|too (saturated|gray)))*$/;
const META = /^\d{1,3}% match · (Shadow|Middle|Light) shape · \d+\.\d% of picture · ΔE \d+\.\d · #[0-9A-F]{6} → #[0-9A-F]{6}$/;
const NONE_OFF = 'Every large shape is within ΔE 5 of the reference.';
const PICKING = 'Click a white or gray spot… (Esc to cancel)';
const NOT_PICKING = 'Fix color cast';
const REFUSED = /^#[0-9A-F]{6} is too colorful to be white or gray\. Pick paper or a neutral gray area\.$/;
const TOO_DARK = /^That spot is too dark to judge\. Pick a white or light gray area\.$/;
const FIXED = /^Color cast removed: #[0-9A-F]{6} is now neutral$/;
const LABEL_INK = [28, 29, 32]; // #1c1d20: the ring and digits of the white numbered labels (app.js PILLS.light)
const gradeFor = (score) => (score >= 90 ? 'Very close to the reference' : score >= 75 ? 'Close, with a few shapes off' : score >= 60 ? 'Several shapes are off' : 'Far from the reference');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- helpers for this case -------------------------------------------------

// everything the drawer and its section show, in one read
const state = (page) => page.evaluate(() => {
  const g = (id) => document.getElementById(id);
  const txt = (id) => g(id).textContent.trim();
  return {
    open: g('drawer-check').open, badge: txt('checkState'), label: txt('artSource'), source: txt('source'),
    section: !g('checkSection').hidden, empty: !g('checkEmpty').hidden, body: !g('checkBody').hidden, panels: !g('checkPanels').hidden, alignPanel: !g('alignPanel').hidden, alignOpen: g('alignPanel').open,
    color: +txt('scoreColor'), grade: txt('scoreGrade'), value: +txt('scoreValue'), shapes: txt('scoreShapes'), meterValue: g('meterValue').style.width, meterShapes: g('meterShapes').style.width,
    alignState: txt('alignState'), busy: g('busy').hidden, toast: g('toast').textContent, fit: g('artFit').value,
    list: [...document.querySelectorAll('#fixList li')].map((li) => ({ cls: li.className, num: (li.querySelector('.fix-num') || {}).textContent, note: (li.querySelector('.fix-text strong') || {}).textContent, meta: (li.querySelector('.fix-text small') || {}).textContent, swatches: [...li.querySelectorAll('.fix-swatches span')].map((s) => s.title), text: li.textContent.trim() })),
    wbPick: txt('wbPick'), picking: document.body.classList.contains('picking-neutral'), wbUndo: !g('wbUndo').hidden,
    art: [g('cv-art').width, g('cv-art').height], diff: [g('cv-diff').width, g('cv-diff').height], orig: [g('cv-orig').width, g('cv-orig').height],
    outs: Object.fromEntries(['onion', 'alignX', 'alignY', 'alignScale', 'alignRot'].map((id) => [id, [g(id).value, g(id + 'Out').value]])),
    simple: document.body.classList.contains('mode-simple'), tab: [...document.querySelectorAll('.tabpanel')].filter((p) => !p.hidden).map((p) => p.id),
  };
});
const busyHidden = (page, timeout = 60000) => page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout }).then(() => true).catch(() => false);
const resetToast = (page) => page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.classList.remove('show'); });
const waitToast = (page, re, timeout = 15000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source, { timeout }).then(() => true).catch(() => false);
// counts the study runs (each ends with a studio:result event, after the check has run), so a load can be waited for
const countResults = (page) => page.evaluate(() => { if (window.__results === undefined) { window.__results = 0; window.addEventListener('studio:result', () => { window.__results++; }); } });
async function afterResult(page, action, { more = 1, timeout = 60000 } = {}) {
  const n = await page.evaluate(() => window.__results || 0);
  await action();
  const ok = await page.waitForFunction(([n, more]) => (window.__results || 0) >= n + more && document.getElementById('busy').hidden, [n, more], { timeout }).then(() => true).catch(() => false);
  await sleep(120);
  return ok;
}
const loadArt = (page, file) => afterResult(page, () => page.setInputFiles('#artFile', file));
async function setRange(page, id, value) {
  await page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, String(value)]);
  await busyHidden(page); await sleep(60);
}
const setAlign = async (page, x, y, scale, rot) => { for (const [id, v] of [['alignX', x], ['alignY', y], ['alignScale', scale], ['alignRot', rot]]) await setRange(page, id, v); };
// the align panel opened the way a visitor opens it: through its summary
async function openAlign(page) {
  const open = await page.evaluate(() => document.getElementById('alignPanel').open);
  if (!open) { await page.locator('#alignPanel > summary').scrollIntoViewIfNeeded(); await page.locator('#alignPanel > summary').click(); }
  await page.waitForFunction(() => document.getElementById('alignPanel').open, null, { timeout: 3000 }).catch(() => null);
}
const loupe = (page) => page.evaluate(() => ({ shown: !document.getElementById('loupe').hidden, hex: document.getElementById('loupeHex').textContent, val: document.getElementById('loupeVal').textContent, chip: document.getElementById('loupeChip').style.background }));
async function box(page, selector) { const loc = page.locator(selector); await loc.scrollIntoViewIfNeeded(); await sleep(60); return loc.boundingBox(); }
async function hoverAt(page, selector, fx, fy) {
  const b = await box(page, selector);
  await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 2 });
  await page.waitForFunction(() => !document.getElementById('loupe').hidden, null, { timeout: 2000 }).catch(() => null);
  await sleep(60);
  return loupe(page);
}
async function clickAt(page, selector, fx, fy) { const b = await box(page, selector); await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy); await busyHidden(page); await sleep(250); }
const px = (page, id, x, y) => page.evaluate(([id, x, y]) => [...document.getElementById(id).getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [id, x, y]);
const countExact = (page, id, rgb) => page.evaluate(([id, rgb]) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) n++; return n; }, [id, rgb]);
const lightness = (page, rgb) => page.evaluate((c) => window.Study.lightnessOf(c[0], c[1], c[2]), rgb);
const neutral = (rgb, tol = 2) => Math.abs(rgb[0] - rgb[1]) <= tol && Math.abs(rgb[1] - rgb[2]) <= tol && Math.abs(rgb[0] - rgb[2]) <= tol;
// the reference's own pixels (the Study's original view) as a PNG file, with coloured patches painted on or not
const PATCHES = [
  ['neutral gray', [128, 128, 128]], ['warm-tinted white', [231, 215, 184]], ['cool-tinted white', [184, 209, 231]], ['skin', [224, 172, 140]], ['brick red', [180, 60, 40]], ['leaf green', [80, 150, 50]],
  ['dark spot', [20, 20, 20]], ['bright orange', [240, 140, 30]], ['tinted white at the blue limit (×2.9)', [233, 177, 115]], ['tinted white past the blue limit (×3.5)', [241, 174, 106]], ['bright yellow', [250, 230, 20]], ['cool gray needing red ×2.9', [118, 210, 170]],
];
const PATCH = 80, STEP = 100, MARGIN = 10;
const patchAt = (i) => [MARGIN + STEP * (i % 6) + PATCH / 2, MARGIN + STEP * Math.floor(i / 6) + PATCH / 2]; // its centre, in the painting's pixels
async function ownPixels(page, { patches = false, name } = {}) {
  const dataUrl = await page.evaluate(([patches, P, S, M]) => {
    const o = document.getElementById('cv-orig'); const c = document.createElement('canvas'); c.width = o.width; c.height = o.height; const g = c.getContext('2d'); g.drawImage(o, 0, 0);
    if (patches) patches.forEach((p, i) => { g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; g.fillRect(M + S * (i % 6), M + S * Math.floor(i / 6), P, P); });
    return c.toDataURL('image/png');
  }, [patches ? PATCHES.map((p) => p[1]) : null, PATCH, STEP, MARGIN]);
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  return { name: name || (patches ? 'patches.png' : 'same.png'), mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}
// the scorecard as the README promises it: integers 0-100, a percentage, meters that match, a grade for the score
function checkScorecard(t, s, label) {
  t.check(Number.isInteger(s.color) && s.color >= 0 && s.color <= 100 && Number.isInteger(s.value) && s.value >= 0 && s.value <= 100 && /^\d{1,3}%$/.test(s.shapes) && +s.shapes.slice(0, -1) <= 100, `${label}: the scores are whole numbers in 0-100 and a percentage`, { color: s.color, value: s.value, shapes: s.shapes });
  t.check(s.grade === gradeFor(s.color), `${label}: the grade matches the color score`, { color: s.color, grade: s.grade });
  t.check(s.meterValue === s.value + '%' && s.meterShapes === s.shapes, `${label}: the meters show the scores`, { meterValue: s.meterValue, value: s.value, meterShapes: s.meterShapes, shapes: s.shapes });
  t.check(s.badge === `Color ${s.color} · Value ${s.value}`, `${label}: the badge keeps the color and value scores`, s.badge);
  t.check(s.list.length >= 1 && s.list.length <= 5 && (s.list.every((li) => li.cls === 'fix') || (s.list.length === 1 && s.list[0].cls === 'fix-none' && s.list[0].text === NONE_OFF)), `${label}: one to five biggest differences, or the line that none is off`, s.list.map((l) => l.text.slice(0, 60)));
  for (const li of s.list.filter((l) => l.cls === 'fix')) {
    t.check(NOTE.test(li.note) && META.test(li.meta) && li.swatches.length === 2 && /^Reference #[0-9A-F]{6}$/.test(li.swatches[0]) && /^Yours #[0-9A-F]{6}$/.test(li.swatches[1]), `${label}: difference ${li.num} has a plain note, its numbers and the two colors side by side`, li);
  }
  t.check(s.list.filter((l) => l.cls === 'fix').every((li, i) => li.num === String(i + 1)), `${label}: the differences are numbered 1 to ${s.list.length}`, s.list.map((l) => l.num));
}

export default async function checkPainting(t, site) {
  // ---- the #check route with the built-in example: the drawer, its badge, the list, the map, the sliders, the picks ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    let s = await state(page);
    t.check(s.open && same(s.tab, ['tab-study']) && s.section && s.body && s.panels && !s.empty && s.alignPanel, 'route #check: the Study tab with the drawer open, the results below the studies, the align panel offered', s);
    t.check(s.label === EXAMPLE_LABEL, 'the example painting is named and explained', s.label);
    t.check(same(s.art, [600, 750]) && same(s.diff, [600, 750]) && same(s.art, s.orig), 'the painting and the accuracy map are the reference\'s size (600 × 750)', { art: s.art, diff: s.diff, orig: s.orig });
    checkScorecard(t, s, 'the example');
    t.check(s.list.length === 5, 'the example has five biggest differences', s.list.length);
    t.check(s.alignState === '' && !s.alignOpen && s.wbPick === NOT_PICKING && !s.wbUndo && s.fit === 'crop', 'nothing moved or fixed yet: no note on the panel, Fix color cast idle, no Remove color fix, Crop to match', { alignState: s.alignState, alignOpen: s.alignOpen, wbPick: s.wbPick, wbUndo: s.wbUndo, fit: s.fit });
    const example = { color: s.color, value: s.value, shapes: +s.shapes.slice(0, -1) };
    // README names against the page's words (the spec is the expectation)
    const words = await page.evaluate(() => ({ color: document.querySelector('#checkBody .score-label').textContent.trim(), subs: [...document.querySelectorAll('#checkBody .score-sub dt')].map((e) => e.textContent.trim()), list: document.querySelector('#checkBody .fixes h3').textContent.trim(), map: document.querySelector('#checkPanels figure:last-child figcaption span').textContent.trim() }));
    t.check(/Accuracy by shape/.test(words.map), 'the map panel is called Accuracy by shape, as the README does', words.map);
    // the README's "You get" list, read from the checkout's README as it stands (an export carries no README),
    // names what the page shows
    const readmePath = path.join(ROOT, 'README.md');
    const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
    const section = readme.slice(readme.indexOf('### How close did I get?'), readme.indexOf('\n## How to use'));
    const promised = [...section.matchAll(/^ {3}- \*\*([^*]+)\*\*/gm)].map((m) => m[1]);
    const shown = [words.color, ...words.subs, words.list, words.map];
    const namedAsReadme = section.length > 0 && shown.every((w) => section.includes(`**${w}**`));
    if (!readme) t.note('no README.md beside the tests: the page\'s names were not checked against the spec');
    else if (!t.check(namedAsReadme, 'the scores, the list and the map carry the names the README promises', { page: shown, readme: promised })) {
      t.finding({ title: 'The README names the results differently from the page', severity: 'low', steps: 'Open index.html#check. Read the scorecard\'s labels, the list\'s heading and the map\'s caption, then the "You get" list of README.md\'s "How close did I get?" section.', expected: 'One vocabulary for the visitor who reads both: the page uses the names the README promises, or the README uses the page\'s.', actual: `The page says ${shown.map((w) => `"${w}"`).join(', ')}; the README promises ${promised.map((w) => `"${w}"`).join(', ')}. Cause: index.html lines 348-385 (the scorecard, the fixes heading and the map caption) against the README section's list.` });
    }
    // Simple mode: plain-words hints, the formulas behind Show the details
    const hints = await page.evaluate(() => { const h = document.querySelector('#checkBody .scorecard > .hint'); const d = document.querySelector('#checkBody details.more'); const shown = (e) => (typeof e.checkVisibility === 'function' ? e.checkVisibility() : getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0); return { simple: document.body.classList.contains('mode-simple'), hint: h.textContent.trim(), hintShown: shown(h), more: d.open, summary: d.querySelector('summary').textContent.trim(), formula: d.querySelector('.hint').textContent.trim(), formulaShown: shown(d.querySelector('.hint')), mapHint: document.querySelector('#checkPanels figure:last-child .hint').textContent.trim() }; });
    t.check(hints.simple && hints.hintShown && /^Color score: how close your colors are to the reference, shape by shape\. Light and dark score: .* Shapes in the right place: .*$/.test(hints.hint), 'Simple mode: the scoring hint says what the numbers mean in plain words', hints.hint);
    t.check(!hints.more && !hints.formulaShown && hints.summary === 'Show the details' && /100 − 2\.5 × ΔE/.test(hints.formula) && /100 − 5 × \|ΔL\*\|/.test(hints.formula) && /CIEDE2000/.test(hints.formula), 'the formulas sit behind Show the details, closed', { more: hints.more, summary: hints.summary, formula: hints.formula.slice(0, 80) });
    t.check(/100% is a perfect match/.test(hints.mapHint) && /white labels are the biggest differences/.test(hints.mapHint) && /Hover or tap a shape/.test(hints.mapHint), 'the map explains its percentages, white labels and hover', hints.mapHint);
    await page.locator('#checkBody details.more > summary').scrollIntoViewIfNeeded(); await page.locator('#checkBody details.more > summary').click(); await sleep(150);
    t.check(await page.evaluate(() => { const d = document.querySelector('#checkBody details.more'); const h = d.querySelector('.hint'); return d.open && (typeof h.checkVisibility === 'function' ? h.checkVisibility() : h.getBoundingClientRect().height > 0); }), 'Show the details opens and shows the formulas');
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click()); await busyHidden(page); await sleep(100);
    const adv = await page.evaluate(() => ({ simple: document.body.classList.contains('mode-simple'), hintShown: getComputedStyle(document.querySelector('#checkBody .scorecard > .hint')).display !== 'none', badge: document.getElementById('checkState').textContent.trim() }));
    t.check(!adv.simple && adv.hintShown && adv.badge === s.badge, 'Advanced: the drawer still shows its hint and keeps the score', adv);
    t.note('Advanced mode shows the same plain-words scoring hint as Simple (the hint has no mode class); the README only promises it for Simple.');
    await page.evaluate(() => document.querySelector('[data-mode="simple"]').click()); await busyHidden(page); await sleep(100);

    // the accuracy map: white numbered labels for the biggest differences (white pills ringed and lettered in
    // #1c1d20, a color the blocks and the dark percentage pills never have), a hover on a zone
    const ringExample = await countExact(page, 'cv-diff', LABEL_INK);
    const ringRef = await countExact(page, 'cv-refblock', LABEL_INK);
    t.check(ringExample > 500 && ringRef === 0, 'the accuracy map carries the white numbered labels the reference blocks do not have', { onMap: ringExample, onBlocks: ringRef });
    let l = await hoverAt(page, '#cv-diff', 0.5, 0.45);
    t.check(l.shown && /^\d{1,3}% match$/.test(l.hex) && /^ΔE \d+\.\d$/.test(l.val) && /^linear-gradient\(90deg, rgb\(\d+, \d+, \d+\) 50%, rgb\(\d+, \d+, \d+\) 50%\)$/.test(l.chip), 'hovering a zone shows its match, its ΔE and the reference color next to yours', l);
    const onArt = await hoverAt(page, '#cv-art', 0.5, 0.45);
    t.check(onArt.shown && /^#[0-9A-F]{6}$/.test(onArt.hex) && /^V \d+(\.\d)?$/.test(onArt.val), 'hovering Your painting shows the plain hex and value', onArt);
    await page.mouse.move(5, 5); await sleep(100);
    await page.evaluate(() => document.querySelector('[data-tool="line"]').click()); await sleep(80);
    l = await hoverAt(page, '#cv-diff', 0.5, 0.45);
    t.note(`with the Lines tool chosen, hovering a zone of the accuracy map shows ${l.shown ? 'the loupe' : 'no loupe'} (the README's "Hover any zone" holds with the magnifier, the tool on at the start)`);
    await page.evaluate(() => document.querySelector('[data-tool="sample"]').click()); await page.mouse.move(5, 5); await sleep(80);

    // the badge keeps the score with the drawer closed; the results leave with it
    await page.locator('#drawer-check > summary').scrollIntoViewIfNeeded(); await page.locator('#drawer-check > summary').click(); await sleep(250);
    s = await state(page);
    t.check(!s.open && !s.section && s.badge === `Color ${example.color} · Value ${example.value}`, 'closed: the results go, the badge keeps the score', { open: s.open, section: s.section, badge: s.badge });
    t.check((JSON.parse(await storageGet(page, 'portrait-value-studio.drawers') || '[]')).includes('check') === false, 'closing is remembered (the drawers key no longer lists check)', await storageGet(page, 'portrait-value-studio.drawers'));
    await page.locator('#drawer-check > summary').click(); await sleep(250);
    s = await state(page);
    t.check(s.open && s.section && s.body && s.badge === `Color ${example.color} · Value ${example.value}`, 'reopened: the same results, no rerun needed', { open: s.open, badge: s.badge, busy: s.busy });
    t.check((JSON.parse(await storageGet(page, 'portrait-value-studio.drawers') || '[]')).includes('check'), 'opening is remembered', await storageGet(page, 'portrait-value-studio.drawers'));
    await page.evaluate(() => { const d = document.getElementById('drawer-check'); d.open = false; d.open = true; d.open = false; d.open = true; }); await sleep(300);
    s = await state(page);
    t.check(s.open && s.section && s.body && !s.empty, 'toggled four times in a row it ends open with its results', { open: s.open, section: s.section, body: s.body });
    await clean(t, page, 'the example');

    // Move, Size and Rotate: the keyboard, the extremes, one past them, the hatched area and the note
    await openAlign(page);
    s = await state(page);
    t.check(s.alignOpen, 'the align panel opens from its summary');
    await page.focus('#alignX'); await page.keyboard.press('ArrowRight'); await busyHidden(page); await sleep(80);
    s = await state(page);
    t.check(same(s.outs.alignX, ['0.2', '+0.2%']) && s.alignState === 'moved', 'an arrow key moves the photo one step (0.2%) and the panel says moved', { outs: s.outs.alignX, alignState: s.alignState });
    await page.keyboard.press('End'); await busyHidden(page); await sleep(80);
    s = await state(page);
    t.check(same(s.outs.alignX, ['20', '+20%']) && s.alignState === 'moved, 20% of picture left out', 'End takes Move to +20% and the panel says 20% is left out', { outs: s.outs.alignX, alignState: s.alignState });
    const hatch = await page.evaluate(() => { const c = document.getElementById('cv-diff'); const d = c.getContext('2d').getImageData(0, 300, 40, 1).data; const v = []; for (let i = 0; i < d.length; i += 4) v.push(d[i] === d[i + 1] && d[i + 1] === d[i + 2] ? d[i] : -1); return v; });
    t.check(hatch.every((v) => v === 105 || v === 78) && hatch.includes(105) && hatch.includes(78), 'the uncovered strip is hatched in two grays on the accuracy map', hatch.slice(0, 12));
    l = await hoverAt(page, '#cv-diff', 0.05, 0.5);
    t.check(l.shown && l.hex === 'Not covered' && l.val === 'left out' && l.chip === 'transparent', 'hovering the hatched area says Not covered, left out', l);
    l = await hoverAt(page, '#cv-diff', 0.7, 0.5);
    t.check(l.shown && /^\d{1,3}% match$/.test(l.hex), 'hovering a covered zone still reads its match', l);
    await page.mouse.move(5, 5);
    await page.focus('#alignReset'); await page.keyboard.press('Enter'); await busyHidden(page); await sleep(80);
    s = await state(page);
    t.check(same(s.outs.alignX, ['0', '0%']) && s.alignState === '' && s.color === example.color, 'Reset position from the keyboard puts the photo back and clears the note', { outs: s.outs, alignState: s.alignState, color: s.color });
    const ends = [['alignX', 20, '+20%', 20], ['alignX', -20, '-20%', 20], ['alignY', 20, '+20%', 20], ['alignY', -20, '-20%', 20], ['alignScale', 80, '80%', 36], ['alignScale', 125, '125%', 0], ['alignRot', 15, '+15°', 11], ['alignRot', -15, '-15°', 11]];
    for (const [id, v, out, left] of ends) {
      await click(page, '#alignReset'); await busyHidden(page);
      await setRange(page, id, v);
      s = await state(page);
      const want = left ? `moved, ${left}% of picture left out` : 'moved';
      t.check(s.outs[id][1] === out && s.alignState === want, `${id} at ${v}: the output reads ${out} and the panel says "${want}"`, { out: s.outs[id], alignState: s.alignState });
      checkScorecard(t, s, `${id} at ${v}`);
    }
    for (const [id, v, out] of [['alignX', 25, '+20%'], ['alignY', -99, '-20%'], ['alignScale', 200, '125%'], ['alignScale', 1, '80%'], ['alignRot', 90, '+15°']]) {
      await setRange(page, id, v);
      s = await state(page);
      t.check(s.outs[id][1] === out, `${id} pushed to ${v} stays at its end (${out})`, s.outs[id]);
    }
    await click(page, '#alignReset'); await busyHidden(page);
    await setAlign(page, 20, 20, 80, 15);
    s = await state(page);
    const left = +(/(\d+)% of picture left out/.exec(s.alignState) || [])[1];
    t.check(left >= 40 && left <= 60, 'every slider at its end: about half the picture is left out and said so', s.alignState);
    checkScorecard(t, s, 'every slider at its end');
    const hatched = await countExact(page, 'cv-diff', [105, 105, 105]);
    t.check(hatched > 20000 && same((await state(page)).diff, [600, 750]), 'the map still draws, half of it hatched', { hatchedPixels: hatched });
    // the example is tilted 2°, shifted and 3% large: its full correction raises the value and shapes scores
    await setAlign(page, -1.4, 0.6, 97, -2);
    s = await state(page);
    const corrected = { color: s.color, value: s.value, shapes: +s.shapes.slice(0, -1) };
    t.check(corrected.value >= example.value && corrected.shapes >= example.shapes && corrected.color >= example.color && (corrected.value > example.value || corrected.shapes > example.shapes), 'lining the example up (−1.4%, +0.6%, 97%, −2°) raises its scores', { before: example, after: corrected, note: s.alignState });
    // slider spam, then Reset while the indicator is up
    const spam = await page.evaluate(() => { const e = document.getElementById('alignRot'); for (let i = 0; i < 80; i++) { e.value = ((i % 2) ? 1 : -1) * (i / 6); e.dispatchEvent(new Event('input', { bubbles: true })); } e.value = 3; e.dispatchEvent(new Event('input', { bubbles: true })); return !document.getElementById('busy').hidden; });
    await busyHidden(page); await sleep(200);
    s = await state(page);
    t.check(spam && s.busy && same(s.outs.alignRot, ['3', '+3°']) && /^moved, \d+% of picture left out$/.test(s.alignState), 'eighty slider events in a row: the indicator goes up and comes down, the last value is the one scored', { busyWentUp: spam, busy: s.busy, out: s.outs.alignRot, alignState: s.alignState });
    await page.evaluate(() => { const e = document.getElementById('alignScale'); e.value = 90; e.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('alignReset').click(); });
    await busyHidden(page); await sleep(200);
    s = await state(page);
    t.check(s.busy && same(s.outs.alignScale, ['100', '100%']) && same(s.outs.alignRot, ['0', '0°']) && s.alignState === '' && s.color === example.color, 'Reset pressed while the indicator is up wins: everything back, the first score again', { outs: s.outs, alignState: s.alignState, color: s.color });
    // Show reference on top
    const artPx = await px(page, 'cv-art', 300, 400), origPx = await px(page, 'cv-orig', 300, 400);
    await setRange(page, 'onion', 100);
    s = await state(page);
    const onTop = await px(page, 'cv-art', 300, 400);
    const loupeOnTop = await hoverAt(page, '#cv-art', 0.5, 400 / 750);
    await page.mouse.move(5, 5);
    t.check(same(s.outs.onion, ['100', '100%']) && same(onTop, origPx) && !same(onTop, artPx), 'Show reference on top at 100%: the reference covers Your painting', { out: s.outs.onion, shown: onTop, reference: origPx, painting: artPx });
    t.check(loupeOnTop.shown && /^#[0-9A-F]{6}$/.test(loupeOnTop.hex), 'with the reference on top the loupe still reads a color', loupeOnTop);
    await setRange(page, 'onion', 0);
    t.check(same(await px(page, 'cv-art', 300, 400), artPx) && (await state(page)).color === example.color, 'back at 0% the painting shows again and the score never changed', await px(page, 'cv-art', 300, 400));
    await screenshot(page, 'check-painting-example');
    await clean(t, page, 'move, size and rotate');

    // Fix color cast on the example: a wrong canvas, a refused spot, an accepted one, Esc, a double tap, Remove
    await resetToast(page);
    await click(page, '#wbPick'); await sleep(80);
    s = await state(page);
    t.check(s.picking && s.wbPick === PICKING, 'Fix color cast arms and says what to click and how to cancel', s.wbPick);
    await clickAt(page, '#cv-refblock', 0.5, 0.5);
    s = await state(page);
    t.check(s.toast === 'Click a white or gray spot on Your painting' && s.picking, 'a click on another picture while picking says where to click and keeps picking', { toast: s.toast, picking: s.picking });
    await resetToast(page);
    await clickAt(page, '#cv-art', 0.5, 0.45);
    s = await state(page);
    t.check(REFUSED.test(s.toast) && s.picking && !s.wbUndo && s.alignState === '', 'the example\'s skin is refused as too colorful, picking stays on, nothing fixed', { toast: s.toast, picking: s.picking, wbUndo: s.wbUndo });
    await resetToast(page);
    await clickAt(page, '#cv-art', 0.08, 0.08);
    s = await state(page);
    const cornerFixed = await px(page, 'cv-art', 48, 60);
    t.check(FIXED.test(s.toast) && !s.picking && s.wbPick === NOT_PICKING && s.wbUndo && s.alignState === 'color cast fixed', 'the example\'s background corner is accepted: the toast names the spot, picking ends, Remove color fix and the note appear', { toast: s.toast, picking: s.picking, wbUndo: s.wbUndo, alignState: s.alignState });
    t.check(neutral(cornerFixed, 3), 'the picked spot is neutral after the fix', cornerFixed);
    checkScorecard(t, s, 'after the fix');
    await click(page, '#wbPick'); await sleep(50); await page.keyboard.press('Escape'); await sleep(50);
    s = await state(page);
    t.check(!s.picking && s.wbPick === NOT_PICKING && s.wbUndo, 'Esc cancels picking and leaves the fix in place', { picking: s.picking, wbUndo: s.wbUndo });
    await click(page, '#wbPick'); await click(page, '#wbPick'); await sleep(50);
    t.check(!(await state(page)).picking, 'a double tap on Fix color cast ends where it started (off)');
    await click(page, '#wbPick'); await resetToast(page);
    {
      const b = await box(page, '#cv-art');
      await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3, { steps: 5 }); await page.mouse.up(); await sleep(300);
      s = await state(page);
      t.check(s.toast === 'Click one white or gray spot, without dragging' && s.picking, 'a drag (not a click) across Your painting while picking says to click one spot, and picking stays on', { toast: s.toast, picking: s.picking });
      if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
    }
    await click(page, '#wbPick'); await sleep(50);
    await tab(page, 'paint'); await tab(page, 'study');
    s = await state(page);
    t.check(!s.picking && s.wbPick === NOT_PICKING, 'switching tabs while picking cancels it', s.wbPick);
    await click(page, '#wbPick'); await sleep(50);
    await page.locator('#alignPanel > summary').click(); await sleep(200);
    s = await state(page);
    t.check(!s.alignOpen && !s.picking, 'closing the align panel while picking cancels it', { alignOpen: s.alignOpen, picking: s.picking });
    await openAlign(page);
    await click(page, '#wbPick'); await sleep(50);
    await page.evaluate(() => { document.getElementById('drawer-check').open = false; }); await sleep(200);
    t.check(!(await state(page)).picking, 'closing the drawer while picking cancels it');
    await page.evaluate(() => { document.getElementById('drawer-check').open = true; }); await sleep(200);
    await click(page, '#wbUndo'); await busyHidden(page); await sleep(100);
    s = await state(page);
    t.check(!s.wbUndo && s.alignState === '' && s.color === example.color && s.value === example.value, 'Remove color fix: the button goes, the note goes, the first scores are back', { wbUndo: s.wbUndo, alignState: s.alignState, color: s.color, value: s.value });
    // Save PNG on the two panels that offer it
    for (const [id, name] of [['diff', 'sample-study-accuracy-map.png'], ['artblock', 'sample-study-my-painting-blocks.png']]) {
      const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.locator(`[data-save="${id}"]`).scrollIntoViewIfNeeded(); await page.locator(`[data-save="${id}"]`).click();
      const d = await dl;
      t.check(d && d.suggestedFilename() === name, `Save PNG on ${id} downloads ${name}`, d && d.suggestedFilename());
      await page.evaluate(() => { const dlg = document.getElementById('saveDialog'); if (dlg.open) dlg.close(); });
    }
    await clean(t, page, 'fix color cast on the example');
    await page.context().close();
  }

  // ---- the reference's own pixels as the painting, then a painting with known patches for the color picks ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    t.check(await loadArt(page, await ownPixels(page)), 'the reference\'s own pixels load as the painting');
    let s = await state(page);
    t.check(s.label === 'same.png · 600 × 750 px', 'the label names the file and its size', s.label);
    t.check(s.color === 100 && s.value === 100 && s.shapes === '100%' && s.grade === 'Very close to the reference' && s.badge === 'Color 100 · Value 100', 'the reference as the painting scores 100, 100 and 100%', { color: s.color, value: s.value, shapes: s.shapes, grade: s.grade, badge: s.badge });
    t.check(s.list.length === 1 && s.list[0].cls === 'fix-none' && s.list[0].text === NONE_OFF, 'the list says no large shape is off', s.list);
    const ringSame = await countExact(page, 'cv-diff', LABEL_INK);
    t.check(ringSame === 0 && (await countExact(page, 'cv-diff', [255, 255, 255])) > 500, 'with nothing off, the map has its 100% labels and no white numbered ones', { ring: ringSame });
    // the same settings read both pictures: lean, preset and working size leave the perfect match at 100
    await page.evaluate(() => document.querySelector('[data-mode="advanced"]').click()); await busyHidden(page);
    for (const lean of [0, 100]) {
      await setRange(page, 'lean', lean); await busyHidden(page); await sleep(100);
      s = await state(page);
      t.check(s.color === 100 && s.value === 100 && s.shapes === '100%', `lean at ${lean}: still 100 on every score`, { color: s.color, value: s.value, shapes: s.shapes });
    }
    await setRange(page, 'lean', 60);
    t.check(await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('detail'); e.value = '600'; e.dispatchEvent(new Event('change', { bubbles: true })); })), 'a smaller working size reruns');
    s = await state(page);
    t.check(same(s.orig, [480, 600]) && same(s.art, s.orig) && same(s.diff, s.orig) && s.color === 100 && s.shapes === '100%', 'at a working size of 600 the painting follows the reference to 480 × 600 and still matches', { orig: s.orig, art: s.art, diff: s.diff, color: s.color, shapes: s.shapes });
    await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('detail'); e.value = '900'; e.dispatchEvent(new Event('change', { bubbles: true })); }));
    await page.evaluate(() => document.querySelector('[data-mode="simple"]').click()); await busyHidden(page);
    await page.evaluate(() => { const r = document.querySelector('input[name="detailPreset"][value="soft"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }); await busyHidden(page); await sleep(100);
    s = await state(page);
    t.check(s.color === 100 && s.value === 100 && s.shapes === '100%' && same(s.art, [600, 750]), 'the Soft preset reads both pictures alike: still 100', { color: s.color, value: s.value, shapes: s.shapes, art: s.art });
    await page.evaluate(() => { const r = document.querySelector('input[name="detailPreset"][value="normal"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }); await busyHidden(page);
    await clean(t, page, 'the reference as the painting');

    // the patches: each spot's verdict as the README describes it
    t.check(await loadArt(page, await ownPixels(page, { patches: true })), 'the patch painting loads (picking again replaces the earlier file)');
    s = await state(page);
    t.check(s.label === 'patches.png · 600 × 750 px' && s.alignPanel && !s.wbUndo && s.alignState === '', 'the new painting replaces the old one and starts unfixed', { label: s.label, wbUndo: s.wbUndo, alignState: s.alignState });
    await openAlign(page);
    const EXPECT = { 'neutral gray': 'already', 'warm-tinted white': 'accept', 'cool-tinted white': 'accept', skin: 'refuse', 'brick red': 'refuse', 'leaf green': 'refuse', 'dark spot': 'dark', 'bright orange': 'refuse', 'tinted white at the blue limit (×2.9)': 'accept', 'tinted white past the blue limit (×3.5)': 'refuse', 'bright yellow': 'refuse', 'cool gray needing red ×2.9': 'refuse' };
    const results = {};
    for (let i = 0; i < PATCHES.length; i++) {
      const [name, rgb] = PATCHES[i];
      const [cx, cy] = patchAt(i);
      await resetToast(page);
      if (!(await state(page)).picking) { await click(page, '#wbPick'); await sleep(50); }
      const elsewhereBefore = await px(page, 'cv-art', 300, 400);
      await clickAt(page, '#cv-art', cx / 600, cy / 750);
      s = await state(page);
      const patchNow = await px(page, 'cv-art', cx, cy);
      const elsewhereAfter = await px(page, 'cv-art', 300, 400);
      results[name] = { toast: s.toast, picking: s.picking, wbUndo: s.wbUndo, alignState: s.alignState, patchNow, elsewhereBefore, elsewhereAfter, color: s.color };
      const want = EXPECT[name];
      if (want === 'accept') {
        t.check(FIXED.test(s.toast) && !s.picking && s.wbUndo && s.alignState === 'color cast fixed', `${name} ${JSON.stringify(rgb)}: accepted, picking ends, Remove color fix offered`, results[name]);
        t.check(neutral(patchNow, 2), `${name}: the patch is neutral afterwards`, patchNow);
        const L0 = await lightness(page, rgb), L1 = await lightness(page, patchNow);
        t.check(Math.abs(L0 - L1) <= 1.5, `${name}: at the same brightness (tint only, not exposure)`, { before: L0.toFixed(1), after: L1.toFixed(1) });
        t.check(!same(elsewhereBefore, elsewhereAfter), `${name}: the same correction reaches the rest of the photo`, { before: elsewhereBefore, after: elsewhereAfter });
      } else if (want === 'already') {
        // a spot that is already neutral has no cast to remove: nothing to undo, no note, and the page says so
        if (!t.check(/already neutral|no color cast/i.test(s.toast) && !/removed/i.test(s.toast) && !s.picking && !s.wbUndo && s.alignState === '' && same(patchNow, rgb) && same(elsewhereBefore, elsewhereAfter), `${name} ${JSON.stringify(rgb)}: told there is no cast to remove, picking ends, nothing to undo`, results[name])) {
          t.finding({ title: 'Picking a spot that is already gray says "Color cast removed" and offers Remove color fix', severity: 'low', steps: 'Open #check, load a painting with a flat #808080 patch (or any neutral gray), open "Line up the photo and fix its colors", press Fix color cast and click the gray patch.', expected: 'A spot that is already neutral needs no fix: the page says so, and no Remove color fix or "color cast fixed" note appears.', actual: `The toast says "${s.toast}", the panel says "${s.alignState}", Remove color fix ${s.wbUndo ? 'appears' : 'stays hidden'}, while every pixel stays as it was (the patch reads ${JSON.stringify(patchNow)}). Cause: js/app.js pickNeutral toasts "Color cast removed" and keeps the gains for any accepted spot, and updateColorFix (line 2486) reads gains of 1.0000001 (processing.js neutralGains, line 1196: the luminance weights sum to 1.0000001) as a fix.` });
        }
      } else if (want === 'dark') {
        t.check(TOO_DARK.test(s.toast) && s.picking && !s.wbUndo, `${name} ${JSON.stringify(rgb)}: told it is too dark to judge, picking stays on`, results[name]);
      } else {
        t.check(REFUSED.test(s.toast) && s.picking && !s.wbUndo && same(elsewhereBefore, elsewhereAfter), `${name} ${JSON.stringify(rgb)}: refused as a color, picking stays on, nothing changed`, results[name]);
      }
      if (s.picking) { await page.keyboard.press('Escape'); await sleep(50); }
      if (s.wbUndo) { await click(page, '#wbUndo'); await busyHidden(page); await sleep(80); }
    }
    // the bright orange and the yellow: a strong color with one weak channel must be refused as a color, not as dark
    const wrongReason = ['bright orange', 'bright yellow'].filter((n) => results[n] && TOO_DARK.test(results[n].toast));
    if (wrongReason.length) {
      t.finding({ title: 'A bright orange or yellow spot is refused as "too dark to judge"', severity: 'medium', steps: 'Open #check, load a painting with a flat rgb(240,140,30) patch (or rgb(250,230,20)), open "Line up the photo and fix its colors", press Fix color cast and click the patch. Twice: the orange and the yellow give the same message.', expected: 'The README refuses it as "clearly a color rather than a white tinted by the light (skin, brick red, leaf green, orange)": the message the page has for that, "#F08C1E is too colorful to be white or gray. Pick paper or a neutral gray area."', actual: `"${results['bright orange'].toast}" for rgb(240,140,30) (L* 66) and "${results['bright yellow'].toast}" for rgb(250,230,20) (L* 90): a bright spot is called too dark, so the advice to pick a lighter area misleads. Cause: js/processing.js neutralGains, line 1198, returns null when any one channel is under 0.02 in linear light (blue is 30 and 20 here), and js/app.js pickNeutral reads that null as "too dark" before its color test can run.` });
    }
    // picking again replaces the earlier fix (read from the photo as taken): A then B equals B alone
    await click(page, '#wbPick'); await clickAt(page, '#cv-art', patchAt(1)[0] / 600, patchAt(1)[1] / 750);
    await click(page, '#wbPick'); await clickAt(page, '#cv-art', patchAt(2)[0] / 600, patchAt(2)[1] / 750);
    const aThenB = await px(page, 'cv-art', 300, 400), aThenBState = await state(page);
    await click(page, '#wbUndo'); await busyHidden(page); await sleep(80);
    await click(page, '#wbPick'); await clickAt(page, '#cv-art', patchAt(2)[0] / 600, patchAt(2)[1] / 750);
    const bAlone = await px(page, 'cv-art', 300, 400);
    t.check(same(aThenB, bAlone) && aThenBState.wbUndo && aThenBState.alignState === 'color cast fixed', 'picking again replaces the earlier fix rather than stacking on it', { aThenB, bAlone });
    // a new painting while picking cancels it; the fix does not carry over
    await click(page, '#wbPick'); await sleep(50);
    t.check(await loadArt(page, await makeImage(page, { width: 900, height: 600, type: 'image/jpeg', name: 'wide.jpg' })), 'a landscape painting loads while picking');
    s = await state(page);
    t.check(!s.picking && s.wbPick === NOT_PICKING && !s.wbUndo && s.alignState === '' && s.label === 'wide.jpg · 900 × 600 px', 'the new painting ends picking and starts without the fix', { picking: s.picking, wbUndo: s.wbUndo, alignState: s.alignState, label: s.label });
    t.check(same(s.art, [600, 750]), 'a 900 × 600 painting is cropped to the reference\'s 600 × 750', s.art);
    checkScorecard(t, s, 'the landscape painting, cropped');
    const cropped = { color: s.color, shapes: s.shapes };
    t.check(await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('artFit'); e.value = 'stretch'; e.dispatchEvent(new Event('change', { bubbles: true })); })), 'Stretch to match reruns');
    s = await state(page);
    t.check(same(s.art, [600, 750]) && (s.color !== cropped.color || s.shapes !== cropped.shapes), 'Stretch to match keeps the size and changes the comparison', { art: s.art, cropped, stretched: { color: s.color, shapes: s.shapes } });
    checkScorecard(t, s, 'the landscape painting, stretched');
    await afterResult(page, () => page.evaluate(() => { const e = document.getElementById('artFit'); e.value = 'crop'; e.dispatchEvent(new Event('change', { bubbles: true })); }));
    // a new reference while the drawer is open with the visitor's painting: it stays, lined up as it was
    await setRange(page, 'alignX', 10);
    t.check(await afterResult(page, async () => page.setInputFiles('#file', await makeImage(page, { width: 800, height: 1000, type: 'image/jpeg', name: 'newref.jpg' }))), 'a new reference loads with the drawer open');
    s = await state(page);
    t.check(/^newref\.jpg · 800 × 1000 px$/.test(s.source) && s.label === 'wide.jpg · 900 × 600 px' && same(s.orig, [720, 900]) && same(s.art, [720, 900]) && same(s.diff, [720, 900]), 'the painting stays and follows the new reference\'s 720 × 900', { source: s.source, label: s.label, orig: s.orig, art: s.art });
    t.check(same(s.outs.alignX, ['10', '+10%']) && s.alignState === 'moved, 10% of picture left out', 'the alignment is kept across the new reference', { out: s.outs.alignX, alignState: s.alignState });
    checkScorecard(t, s, 'the painting against a new reference');
    await clean(t, page, 'the patches and a new reference');
    await page.context().close();
  }

  // ---- every kind of file for the painting: the input, a drop, a paste; the drop hint; a drop with the drawer closed ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    const example = await state(page);
    const kinds = [
      { title: 'a text file', file: textFile(), reject: NOT_IMAGE },
      { title: 'a broken JPEG', file: brokenImage(), reject: NOT_OPENED },
      { title: 'a 1 × 1 PNG', file: await makeImage(page, { width: 1, height: 1, name: 'dot.png' }), reject: TOO_SMALL },
      { title: 'a 2 × 4000 strip', file: await makeImage(page, { width: 2, height: 4000, name: 'strip.png' }), reject: TOO_SMALL },
      { title: 'a 4000 × 2 strip', file: await makeImage(page, { width: 4000, height: 2, name: 'strip2.png' }), reject: TOO_SMALL },
      { title: 'a 20 × 4000 strip', file: await makeImage(page, { width: 20, height: 4000, draw: 'noise', name: 'thin.png' }), label: 'thin.png · 20 × 4000 px' },
      { title: 'an SVG without a size (Chromium gives it 300 × 150)', file: svgImage(), label: 'drawing.svg · 300 × 150 px' },
      { title: 'a 200 × 200 SVG', file: svgImage('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ddd"/><circle cx="100" cy="100" r="60" fill="#c66"/></svg>', 'sized.svg'), label: 'sized.svg · 200 × 200 px' },
      { title: 'a transparent PNG', file: await makeImage(page, { width: 400, height: 500, draw: 'transparent', name: 'alpha.png' }), label: 'alpha.png · 400 × 500 px' },
      { title: 'a flat white PNG', file: await makeImage(page, { width: 300, height: 300, draw: 'white', name: 'white.png' }), label: 'white.png · 300 × 300 px' },
      { title: 'a flat black PNG', file: await makeImage(page, { width: 300, height: 300, draw: 'black', name: 'black.png' }), label: 'black.png · 300 × 300 px' },
      { title: 'a WebP', file: await makeImage(page, { width: 500, height: 700, type: 'image/webp', name: 'photo.webp' }), label: 'photo.webp · 500 × 700 px' },
      { title: 'a 6000 × 4000 JPEG (exactly 24 megapixels: not reduced)', file: await makeImage(page, { width: 6000, height: 4000, type: 'image/jpeg', name: 'big.jpg' }), label: 'big.jpg · 6000 × 4000 px' },
      { title: 'a 5000 × 5000 JPEG (25 megapixels: reduced)', file: await makeImage(page, { width: 5000, height: 5000, type: 'image/jpeg', name: 'huge.jpg' }), label: 'huge.jpg · 2800 × 2800 px', note: /^A very large photo \(5000 × 5000\) was reduced to 2800 × 2800 for speed\.$/ },
    ];
    let lastLabel = example.label;
    for (const k of kinds) {
      await resetToast(page);
      if (k.reject) {
        await page.setInputFiles('#artFile', k.file);
        const said = await waitToast(page, k.reject);
        await sleep(300);
        const s = await state(page);
        t.check(said && s.label === lastLabel && s.body && s.badge === example.badge, `${k.title}: refused with the right words, the painting before it stays scored`, { toast: s.toast, label: s.label.slice(0, 40), badge: s.badge });
      } else {
        const loaded = await loadArt(page, k.file);
        const s = await state(page);
        t.check(loaded && s.label === k.label, `${k.title}: loads as the painting and the label says its size`, { loaded, label: s.label });
        t.check(k.note ? k.note.test(s.toast) : s.toast === '', `${k.title}: ${k.note ? 'the reduction is said' : 'no complaint'}`, s.toast);
        t.check(same(s.art, [600, 750]) && SAMPLE.test(s.source), `${k.title}: fitted to the reference, which stays the sample`, { art: s.art, source: s.source.slice(0, 30) });
        checkScorecard(t, s, k.title);
        lastLabel = k.label;
      }
    }
    await clean(t, page, 'file kinds');
    // the drop hint, a drop and a paste with the drawer open (they go to the painting), a text file dropped
    const hint = await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); const h = document.getElementById('dropHint'); const r = { shown: !h.hidden, text: h.firstElementChild.textContent }; window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt })); r.after = h.hidden; return r; });
    t.check(hint.shown && hint.text === 'Drop your painting to check it' && hint.after, 'dragging a file in with the drawer open says it will be the painting', hint);
    t.check(await afterResult(page, async () => dropFiles(page, 'body', [await makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'dropped.jpg' })])), 'a dropped photo is read');
    let s = await state(page);
    t.check(s.label === 'dropped.jpg · 640 × 800 px' && SAMPLE.test(s.source), 'dropped with the drawer open: the painting, not the reference', { label: s.label, source: s.source.slice(0, 30) });
    t.check(await afterResult(page, () => makeImage(page, { width: 640, height: 800, name: 'pasted.png' }).then((f) => pasteFile(page, f))), 'a pasted picture is read');
    s = await state(page);
    t.check(s.label === 'pasted.png · 640 × 800 px' && SAMPLE.test(s.source), 'pasted with the drawer open: the painting, not the reference', { label: s.label, source: s.source.slice(0, 30) });
    await resetToast(page);
    await dropFiles(page, 'body', [textFile()]);
    t.check(await waitToast(page, NOT_IMAGE) && (await state(page)).label === 'pasted.png · 640 × 800 px', 'a dropped text file is refused and the painting stays', await text(page, '#toast'));
    await resetToast(page);
    await dropFiles(page, 'body', [await makeImage(page, { width: 1, height: 1, name: 'dot.png' })]);
    t.check(await waitToast(page, TOO_SMALL), 'a dropped 1 × 1 picture is refused', await text(page, '#toast'));
    // the drawer closed: a drop is the reference, and the painting is rescored against it on reopening
    await page.evaluate(() => { document.getElementById('drawer-check').open = false; }); await sleep(250);
    const hintClosed = await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); const h = document.getElementById('dropHint'); const r = h.firstElementChild.textContent; window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt })); return r; });
    t.check(hintClosed === 'Drop the portrait to load it', 'with the drawer closed the drag hint names the portrait', hintClosed);
    t.check(await afterResult(page, () => makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'asref.jpg' }).then((f) => dropFiles(page, 'body', [f]))), 'a drop with the drawer closed is read');
    s = await state(page);
    t.check(/^asref\.jpg · 640 × 800 px$/.test(s.source) && s.label === 'pasted.png · 640 × 800 px', 'dropped with the drawer closed: the reference changes and the painting stays', { source: s.source, label: s.label });
    await page.evaluate(() => { document.getElementById('drawer-check').open = true; }); await busyHidden(page); await sleep(300);
    s = await state(page);
    t.check(s.body && same(s.art, [640, 800]) && same(s.orig, [640, 800]) && s.color >= 90, 'reopened: the painting is scored against the new reference (near twins score over 90)', { art: s.art, orig: s.orig, color: s.color, badge: s.badge });
    checkScorecard(t, s, 'reopened against the new reference');
    // a new reference while the example is up takes the example away
    const page2 = await openPage(site, { url: '#check' });
    await countResults(page2);
    await busyHidden(page2);
    t.check(await afterResult(page2, async () => page2.setInputFiles('#file', await makeImage(page2, { width: 800, height: 1000, type: 'image/jpeg', name: 'mine.jpg' }))), 'a photo of the visitor\'s own loads as the reference');
    s = await state(page2);
    t.check(s.label === NO_ART_LABEL && s.empty && !s.body && !s.panels && !s.alignPanel && s.badge === 'No painting yet', 'with the visitor\'s own reference the example goes: the empty state, its label and the badge say so', { label: s.label, empty: s.empty, body: s.body, alignPanel: s.alignPanel, badge: s.badge });
    const emptyText = await page2.evaluate(() => document.getElementById('checkEmpty').textContent.replace(/\s+/g, ' ').trim());
    t.check(/^No painting yet Load a photo of your painting, or use the one on the Studio tab\. You can also drop or paste a photo while this drawer is open\.$/.test(emptyText), 'the empty state tells the visitor the three ways in', emptyText);
    await clean(t, page, 'drops and pastes'); await clean(t, page2, 'the example gone');
    await page.context().close(); await page2.context().close();
  }

  // ---- Use my Studio painting: a blank paper, strokes, twice, a dealt portrait; with painting.js missing ----
  {
    const page = await openPage(site, { url: '#check' });
    await countResults(page);
    await busyHidden(page);
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'Use my Studio painting scores without a Studio visit');
    let s = await state(page);
    t.check(/^Studio painting · \d+ × \d+ px$/.test(s.label) && s.body && !s.empty, 'the label names the Studio painting and its size', s.label);
    checkScorecard(t, s, 'the blank paper');
    const blankInk = await inked(page, '#cv-art');
    const blank = { color: s.color, value: s.value, shapes: s.shapes, label: s.label };
    t.check(neutral(await px(page, 'cv-art', 300, 400), 30) && (await px(page, 'cv-art', 300, 400))[0] > 180, 'a blank paper comes over as a light sheet', await px(page, 'cv-art', 300, 400));
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'pressed again it scores again');
    s = await state(page);
    t.check(s.label === blank.label && s.color === blank.color && s.value === blank.value && s.shapes === blank.shapes, 'the same paper twice gives the same scores', { first: blank, second: { color: s.color, value: s.value, shapes: s.shapes } });
    await tab(page, 'paint'); await sleep(1200);
    await stroke(page, '#ps-paper'); await stroke(page, '#ps-paper', [[0.2, 0.7], [0.8, 0.7]]); await sleep(400);
    const paperInk = await inked(page, '#ps-paper');
    await tab(page, 'study');
    t.check(await afterResult(page, () => click(page, '#artFromStudio')), 'the painted paper scores');
    s = await state(page);
    const artInk = await inked(page, '#cv-art');
    t.check(paperInk > 100 && artInk > blankInk + 100, 'the strokes on the paper are in the painting checked', { paperInk, blankInk, artInk });
    checkScorecard(t, s, 'the painted paper');
    // a dealt portrait as the Studio's reference becomes the reference here
    await tab(page, 'paint'); await sleep(300);
    const dealt = await page.evaluate(() => { const b = document.querySelector('#ps-root [data-ref-kind="painting"]'); if (!b) return null; b.click(); return document.getElementById('ps-refName').textContent.trim(); });
    await sleep(600);
    const title = await page.evaluate(() => document.getElementById('ps-refName').textContent.trim());
    t.check(dealt !== null && /, after .*: a generated portrait, as the game deals them\.$/.test(title), 'the Studio deals a portrait as its reference', title);
    const portrait = /^(.*), after ([^:]+):/.exec(title);
    await tab(page, 'study');
    await click(page, '#artFromStudio');
    const switched = await page.waitForFunction((want) => document.getElementById('source').textContent.includes(want) && document.getElementById('busy').hidden, portrait ? `${portrait[1]}, after ${portrait[2]}` : 'never', { timeout: 30000 }).then(() => true).catch(() => false);
    await busyHidden(page); await sleep(400);
    s = await state(page);
    t.check(switched && portrait && s.source === `${portrait[1]}, after ${portrait[2]} · 600 × 750 px` && /^Studio painting/.test(s.label) && s.body, 'with a dealt portrait, Use my Studio painting makes that portrait the reference and scores against it', { source: s.source, label: s.label });
    checkScorecard(t, s, 'the Studio painting against the dealt portrait');
    await screenshot(page, 'check-painting-studio');
    await clean(t, page, 'use my studio painting');
    await page.context().close();

    // painting.js missing: the Studio tab is taken off the menu; the drawer's button must not stay as a dead control
    const page3 = await openPage(site, { url: '#check', block: [site.base + 'js/painting.js'] });
    await countResults(page3);
    await sleep(1200);
    const before = await state(page3);
    const btn = await page3.evaluate(() => { const b = document.getElementById('artFromStudio'); return { hidden: b.hidden, disabled: b.disabled, shown: getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0, paintTab: (document.querySelector('[data-tab="paint"]') || {}).hidden }; });
    await resetToast(page3);
    await click(page3, '#artFromStudio'); await sleep(900);
    const after = await state(page3);
    const handled = !btn.shown || btn.disabled || /Studio/.test(after.toast);
    if (!t.check(handled, 'with painting.js missing, Use my Studio painting is taken off, disabled, or says why it cannot', { button: btn, before: before.label.slice(0, 30), after: after.label.slice(0, 30), toast: after.toast })) {
      t.finding({ title: 'With painting.js missing, "Use my Studio painting" stays as a live button that does nothing', severity: 'high', steps: 'Block or remove js/painting.js (the guard then takes Studio, Figure study and the Loomis head off the menu and shows its "part of the app" note). Open index.html#check and press Use my Studio painting. Twice.', expected: 'The button is hidden or disabled like the Studio tab, or a message says the Studio did not load.', actual: `The button shows and is enabled (${JSON.stringify(btn)}); pressing it changes nothing and says nothing: the label stays "${after.label.slice(0, 20)}…", the badge "${after.badge}", toast "${after.toast}". Cause: js/app.js, the artFromStudio handler's \`if (!ps) return;\` returns silently when window.PaintStudio is missing; js/guard.js (TAB_OF, line 122) hides the tabs of a failed script but not this button.` });
    }
    t.check(after.label === before.label && after.badge === before.badge && !after.empty, 'with painting.js missing, the press leaves the example scored as it was', { before: before.badge, after: after.badge });
    t.check(page3.log.pageerrors.length === 0, 'painting.js missing: no page error', page3.log.pageerrors);
    await page3.context().close();
  }

  // ---- the routes, the guide's button, a reload, and hostile saved state for every key the drawer depends on ----
  {
    const page = await openPage(site);
    await countResults(page);
    await busyHidden(page);
    let s = await state(page);
    t.check(!s.open && !s.section && s.badge === 'Not scored yet' && s.label === EXAMPLE_LABEL, 'a plain load: the drawer closed, its badge says the example is not scored until it is opened, the example ready', { open: s.open, section: s.section, badge: s.badge });
    await tab(page, 'help');
    const went = await page.evaluate(() => { const b = document.querySelector('[data-go="check"]'); if (!b) return false; b.click(); return true; });
    await sleep(400);
    s = await state(page);
    t.check(went && s.open && same(s.tab, ['tab-study']) && s.section && s.body, 'the guide\'s Try it button opens the Study tab with the drawer open and scored', { went, open: s.open, tab: s.tab, body: s.body });
    await openAlign(page); await setRange(page, 'alignX', 10);
    await loadArt(page, await makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'mine.jpg' }));
    await page.reload({ waitUntil: 'load' }); await sleep(900); await busyHidden(page);
    s = await state(page);
    t.check(s.open && s.section && s.body && s.label === EXAMPLE_LABEL && same(s.outs.alignX, ['0', '0%']) && s.alignState === '', 'after a reload the drawer is open as left, with the example back, the photo and its alignment gone', { open: s.open, label: s.label.slice(0, 30), out: s.outs.alignX, alignState: s.alignState });
    t.note('a painting loaded into the drawer is not kept across a reload (the README promises that only for the Studio); the drawer says nothing about it.');
    await clean(t, page, 'routes and reload');
    await page.context().close();

    const DRAWERS = 'portrait-value-studio.drawers';
    const hostile = [
      ['drawers: not JSON', { [DRAWERS]: 'not json' }, false],
      ['drawers: a string', { [DRAWERS]: '"check"' }, false],
      ['drawers: an object', { [DRAWERS]: '{"check":true}' }, false],
      ['drawers: prototype names', { [DRAWERS]: JSON.stringify(PROTO_NAMES) }, false],
      ['drawers: NaN', { [DRAWERS]: 'NaN' }, false],
      ['drawers: 100 000 entries', { [DRAWERS]: JSON.stringify(new Array(100000).fill('check')) }, true],
      ['drawers: nested junk beside check', { [DRAWERS]: '[{"a":[1]},null,5,"check"]' }, true],
      ['every key junk, drawers open', { 'portrait-value-studio.mode': '{"constructor":1}', 'portrait-value-studio.lean': 'NaN', 'portrait-value-studio.blockView': '__proto__', 'portrait-value-studio.smoothing': '[]', 'portrait-value-studio.canvasUnit': '"999999"', 'portrait-value-studio.palette': '{"__proto__":{"x":1}}', [DRAWERS]: '["check"]' }, true],
      ['lean past 100, mode advanced, all drawers', { 'portrait-value-studio.lean': '1e309', 'portrait-value-studio.mode': 'advanced', [DRAWERS]: '["check","values","colors","swatches"]' }, true],
      ['lean a huge number string', { 'portrait-value-studio.lean': '9'.repeat(400), [DRAWERS]: '["check"]' }, true],
    ];
    for (const [title, storage, open] of hostile) {
      const p = await openPage(site, { storage });
      await countResults(p);
      await busyHidden(p); await sleep(300);
      const s = await state(p);
      t.check(s.open === open && s.section === open && (open ? s.body && s.badge === `Color ${s.color} · Value ${s.value}` : s.badge === 'Not scored yet') && s.label === EXAMPLE_LABEL, `${title}: the drawer ${open ? 'opens with the example scored' : 'stays closed, nothing scored yet'}`, { open: s.open, section: s.section, badge: s.badge, simple: s.simple });
      await clean(t, p, title);
      await p.context().close();
    }
  }

  // ---- the phone width ----
  {
    const page = await openPage(site, { viewport: PHONE, url: '#check' });
    await countResults(page);
    await busyHidden(page);
    let s = await state(page);
    t.check(s.open && s.body && s.label === EXAMPLE_LABEL && (await hscroll(page)) <= 0, 'phone: the drawer opens with the example and no horizontal scroll', { open: s.open, body: s.body, hscroll: await hscroll(page) });
    const cols = await page.evaluate(() => getComputedStyle(document.getElementById('checkPanels')).gridTemplateColumns.split(' ').length);
    t.check(cols === 1, 'phone: the four panels stack in one column', cols);
    t.check(await loadArt(page, await makeImage(page, { width: 640, height: 800, type: 'image/jpeg', name: 'phone.jpg' })), 'phone: a photo loads as the painting');
    s = await state(page);
    t.check(s.label === 'phone.jpg · 640 × 800 px' && same(s.art, [600, 750]), 'phone: the label and the fit', { label: s.label, art: s.art });
    checkScorecard(t, s, 'phone');
    await openAlign(page);
    await setRange(page, 'alignScale', 80);
    s = await state(page);
    t.check(s.alignState === 'moved, 36% of picture left out' && (await hscroll(page)) <= 0, 'phone: Size at 80% says 36% left out, still no horizontal scroll', { alignState: s.alignState, hscroll: await hscroll(page) });
    const l = await hoverAt(page, '#cv-diff', 0.5, 0.5);
    t.check(l.shown && /^\d{1,3}% match$/.test(l.hex), 'phone: a pointer over a zone reads its match', l);
    await page.mouse.move(5, 5);
    await click(page, '#wbPick'); await sleep(50);
    await resetToast(page);
    await clickAt(page, '#cv-art', 0.5, 0.45);
    s = await state(page);
    t.check(/^(#[0-9A-F]{6} is too colorful|Color cast removed|That spot is too dark)/.test(s.toast), 'phone: a tap while picking is answered', s.toast);
    if (s.picking) await page.keyboard.press('Escape');
    const hints = await page.evaluate(() => ({ hint: getComputedStyle(document.querySelector('#checkBody .scorecard > .hint')).display !== 'none', more: document.querySelector('#checkBody details.more').open }));
    t.check(hints.hint && !hints.more, 'phone: the plain-words hint shows, the formulas stay behind Show the details', hints);
    await screenshot(page, 'check-painting-phone');
    await clean(t, page, 'phone');
    await page.context().close();
  }
}
