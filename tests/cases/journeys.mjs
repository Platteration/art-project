// A visitor's whole session, at both widths: a photo in, a palette chosen, a line drawn, the Studio
// following the palette and copying the lines, the check drawer scoring the Studio painting, a game
// on the photo, a battle, the Help buttons, then Forget. The promises that span tabs live here.
import { openPage, clean, tab, DESKTOP, PHONE, makeImage, loadPhoto, stroke, inked, click, text, visible, storageKeys, screenshot, sleep } from '../lib.mjs';

const byText = (page, scope, re) => page.evaluate(([scope, src]) => { const re = new RegExp(src, 'i'); const b = [...document.querySelectorAll(`${scope} button`)].find((x) => re.test(x.textContent) && !x.hidden && !x.disabled); if (!b) return false; b.click(); return b.textContent.trim().slice(0, 40); }, [scope, re.source]);

export default async function journeys(t, site) {
  for (const [label, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const page = await openPage(site, { viewport });

    // a photo in, Advanced, the second known palette
    await loadPhoto(page, await makeImage(page, { width: 900, height: 1200, type: 'image/jpeg', name: 'friend.jpg' }));
    t.check(/friend/.test(await text(page, '#tab-study') || ''), `${label}: the photo's name shows on the Study tab`);
    await click(page, '[data-mode="advanced"]'); await sleep(400);
    t.check(await page.evaluate(() => document.body.classList.contains('mode-advanced') || !document.body.classList.contains('mode-simple')), `${label}: Advanced is on`);
    await page.evaluate(() => { document.getElementById('drawer-colors').open = true; });
    await page.waitForFunction(() => document.querySelectorAll('#presetList button').length >= 3, null, { timeout: 15000 }).catch(() => null);
    const presets = await page.evaluate(() => [...document.querySelectorAll('#presetList button')].map((b) => b.textContent.trim().slice(0, 40)));
    t.check(presets.length >= 3, `${label}: the known palettes are listed for this photo`, presets);
    await page.evaluate(() => document.querySelectorAll('#presetList button')[1].click()); await sleep(1500);
    const chosen = await page.evaluate(() => window.StudioPalette && StudioPalette.current() && StudioPalette.current().name);
    t.check(!!chosen, `${label}: a palette is chosen`, chosen);
    await clean(t, page, `${label}: photo and palette`);

    // a reference line
    await click(page, '[data-tool="line"]'); await sleep(200);
    await stroke(page, '#tab-study canvas', [[0.2, 0.2], [0.7, 0.6]]);
    await sleep(400);
    const lineCount = await page.evaluate(() => document.querySelector('[data-tool="line"]').dataset.count);
    t.check(lineCount === '1', `${label}: the Lines tool counts one line`, lineCount);
    await click(page, '[data-tool="line"]'); // off again
    await clean(t, page, `${label}: a line`);

    // the Studio follows the palette and copies the lines
    await tab(page, 'paint'); await sleep(1200);
    const psPal = await page.evaluate(() => { const s = document.getElementById('ps-palette'); return s && s.selectedOptions[0] && s.selectedOptions[0].textContent.trim(); });
    t.check(psPal === chosen, `${label}: the Studio's palette follows the Study tab's`, { chosen, psPal });
    const sketchBefore = await inked(page, '#ps-sketch');
    await click(page, '#ps-brushBtn'); await sleep(300);
    const copied = await byText(page, '#ps-root', /Copy the Study lines/);
    await sleep(800);
    t.check(copied !== false, `${label}: Copy the Study lines is offered`, copied);
    const sketchAfter = await inked(page, '#ps-sketch');
    t.check(sketchAfter > sketchBefore, `${label}: the Study line is on the underdrawing`, { sketchBefore, sketchAfter });
    await page.keyboard.press('Escape');
    await stroke(page, '#ps-paper', [[0.3, 0.4], [0.6, 0.5], [0.4, 0.7]]);
    const paint = await inked(page, '#ps-paper');
    t.check(paint > 100, `${label}: a stroke on the paper`, paint);
    await screenshot(page, `journey-${label}-studio`);
    await clean(t, page, `${label}: studio`);

    // the check drawer scores the Studio painting
    await tab(page, 'study'); await sleep(500);
    await page.evaluate(() => { document.getElementById('drawer-check').open = true; });
    const used = await byText(page, '#drawer-check', /Use my Studio painting/);
    t.check(used !== false, `${label}: Use my Studio painting is offered`, used);
    await page.waitForFunction(() => { const b = document.getElementById('checkBody'); return b && !b.hidden; }, null, { timeout: 30000 }).catch(() => null);
    await sleep(1500);
    const scores = await page.evaluate(() => ['scoreColor', 'scoreValue', 'scoreShapes'].map((id) => (document.getElementById(id) || {}).textContent));
    t.check(scores.every((s) => /\d/.test(s || '')), `${label}: the three scores show numbers`, scores);
    t.check(/\d/.test(await text(page, '#checkState') || ''), `${label}: the drawer's badge keeps the score`, await text(page, '#checkState'));
    await clean(t, page, `${label}: check`);

    // a game on the photo: one number mixed, locked in, a score
    await tab(page, 'game'); await sleep(800);
    const gamePal = await page.evaluate(() => { const s = document.getElementById('gamePalette'); return s && s.selectedOptions[0] && s.selectedOptions[0].textContent.trim(); });
    t.note(`${label}: the game suggests "${gamePal}" for this photo (the Study's palette is "${chosen}")`);
    await click(page, '#gameStart');
    await page.waitForFunction(() => document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
    const numbers = await page.evaluate(() => document.querySelectorAll('#gameNumbers .game-number').length);
    t.check(numbers >= 6, `${label}: the board has numbers`, numbers);
    await page.evaluate(() => document.querySelector('#gameNumbers .game-number').click());
    for (let i = 0; i < 3; i++) { await page.evaluate(() => document.querySelector('#gamePaints button').click()); await sleep(120); }
    await click(page, '#gameLock'); await sleep(2500);
    const popup = await page.evaluate(() => { const p = document.getElementById('gamePopup'); return { shown: p && (p.open || !p.hidden), text: p && p.textContent.replace(/\s+/g, ' ').slice(0, 120) }; });
    t.check(popup.shown && /\d/.test(popup.text), `${label}: locking in shows the score pop-up`, popup);
    await click(page, '#gamePopupClose'); await sleep(500);
    t.check((await storageKeys(page)).some((k) => k.endsWith('.gameBest')), `${label}: a best score is kept`);
    await clean(t, page, `${label}: game`);

    // a battle: start, answer once, quit twice
    await tab(page, 'battle'); await sleep(500);
    const started = await byText(page, '#tab-battle', /^Start/);
    t.check(started !== false, `${label}: the battle starts`, started);
    await sleep(800);
    const answered = await page.evaluate(() => { const b = [...document.querySelectorAll('#tab-battle button')].find((x) => /darker|lighter|same|^[A-D]$/i.test(x.textContent.trim()) || /color/i.test(x.getAttribute('aria-label') || '')); if (!b) return null; b.click(); return (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 30); });
    t.check(answered !== null, `${label}: a round can be answered`, answered);
    await sleep(1200);
    const quit = await byText(page, '#tab-battle', /✕|quit|stop/i); await sleep(300); await byText(page, '#tab-battle', /✕|quit|stop/i); await sleep(800);
    t.note(`${label}: battle quit via "${quit}"`);
    await clean(t, page, `${label}: battle`);

    // the Help buttons lead where they say
    await tab(page, 'help'); await sleep(300);
    await click(page, '[data-go="paint"]'); await sleep(600);
    t.check(await page.evaluate(() => !document.getElementById('tab-paint').hidden && document.body.classList.contains('tab-paint')), `${label}: Help's Go to Studio opens the Studio`);
    await tab(page, 'help'); await click(page, '[data-go="check"]'); await sleep(600);
    t.check(await page.evaluate(() => !document.getElementById('tab-study').hidden && document.getElementById('drawer-check').open), `${label}: Help's Check a painting opens the drawer`);
    await clean(t, page, `${label}: help`);

    // Forget: everything back to the defaults
    await tab(page, 'help'); await click(page, '#forgetBtn'); await sleep(300);
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null), click(page, '#forgetBtn')]);
    await sleep(1500);
    const after = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => /^(portrait-value-studio|pose-and-light)\./.test(k)), simple: document.body.classList.contains('mode-simple'), name: document.querySelector('#tab-study').textContent.includes('friend'), lines: document.querySelector('[data-tool="line"]').dataset.count || '' }));
    t.check(after.keys.length === 0 && after.simple && !after.name && after.lines === '', `${label}: after Forget the defaults are back`, after);
    await clean(t, page, `${label}: forget`);
    await page.context().close();
  }
}
