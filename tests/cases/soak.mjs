// A long session: thirty photos in a row, fifty tab switches with the frames up, three hundred strokes,
// five Figure classes, twenty games started and quit. The heap must not keep growing, the page must stay
// responsive, and nothing may error. Chromium-only numbers (performance.memory), reported as notes.
import { openPage, clean, tab, DESKTOP, makeImage, loadPhoto, stroke, inked, click, sleep } from '../lib.mjs';

const heap = (page) => page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1));
const responsive = (page) => page.evaluate(() => new Promise((r) => { const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => r(Math.round(performance.now() - t0)), 0)); }));

export default async function soak(t, site) {
  const page = await openPage(site, { viewport: DESKTOP });
  const h0 = await heap(page);

  // thirty photos of varying size, one after another, some before the previous one has settled
  for (let i = 0; i < 30; i++) {
    const w = 400 + (i * 137) % 1400, h = 500 + (i * 211) % 1300;
    await loadPhoto(page, await makeImage(page, { width: w, height: h, type: i % 3 ? 'image/jpeg' : 'image/png', draw: ['portrait', 'noise', 'flat'][i % 3], name: `photo-${i}.jpg` }), { settle: i % 4 === 0 ? 0 : 600 });
  }
  await sleep(3000);
  const h1 = await heap(page);
  t.note(`heap after 30 photos: ${h0} MB → ${h1} MB`);
  t.check((await responsive(page)) < 500, 'responsive after 30 photos', await responsive(page));
  await clean(t, page, 'thirty photos');

  // fifty tab switches, the pose and figure frames among them
  const order = ['study', 'pose', 'paint', 'figure', 'game', 'battle', 'loomis', 'help'];
  for (let i = 0; i < 50; i++) await tab(page, order[i % order.length], { wait: i < 8 });
  await sleep(1500);
  const h2 = await heap(page);
  t.note(`heap after 50 tab switches: ${h2} MB`);
  t.check((await responsive(page)) < 500, 'responsive after 50 tab switches', await responsive(page));
  await clean(t, page, 'fifty tab switches');

  // three hundred strokes on the Studio paper, undone and redrawn
  await tab(page, 'paint'); await sleep(800);
  for (let i = 0; i < 300; i++) {
    const a = (i * 0.031) % 0.8 + 0.1, b = (i * 0.047) % 0.8 + 0.1;
    await stroke(page, '#ps-paper', [[a, b], [b, a]], { steps: 3 });
    if (i % 50 === 49) { for (let u = 0; u < 10; u++) await click(page, '#ps-undo'); }
  }
  await sleep(2500); // the autosave
  const ink = await inked(page, '#ps-paper');
  t.check(ink > 1000, 'the paper holds the strokes', ink);
  const h3 = await heap(page);
  t.note(`heap after 300 strokes: ${h3} MB`);
  t.check((await responsive(page)) < 500, 'responsive after 300 strokes', await responsive(page));
  await clean(t, page, 'three hundred strokes');

  // five Figure classes, each one pose with a stroke
  await tab(page, 'figure');
  for (let i = 0; i < 5; i++) {
    await click(page, '#fig-start');
    await page.waitForFunction(() => { const s = document.querySelector('.fig-studio'); return s && !s.hidden; }, null, { timeout: 30000 }).catch(() => null);
    await sleep(1500);
    await stroke(page, '#fs-paper');
    await click(page, '#fig-done');
    await page.waitForFunction(() => !document.getElementById('fig-popup').hidden, null, { timeout: 15000 }).catch(() => null);
    await sleep(1200);
    await click(page, '#fig-stop'); await sleep(1200);
    await page.evaluate(() => { const b = document.getElementById('fig-new'); if (b && !b.hidden) b.click(); });
    await sleep(600);
  }
  const h4 = await heap(page);
  t.note(`heap after 5 Figure classes: ${h4} MB`);
  t.check((await responsive(page)) < 500, 'responsive after 5 classes', await responsive(page));
  await clean(t, page, 'five classes');

  // twenty games started and quit
  await tab(page, 'game');
  for (let i = 0; i < 20; i++) {
    await click(page, '#gameStart');
    await page.waitForFunction(() => document.querySelectorAll('#gameNumbers .game-number').length > 0, null, { timeout: 30000 }).catch(() => null);
    await click(page, '#gameQuit'); await sleep(150); await click(page, '#gameQuit'); await sleep(400);
  }
  const h5 = await heap(page);
  t.note(`heap after 20 games: ${h5} MB`);
  t.check((await responsive(page)) < 500, 'responsive after 20 games', await responsive(page));
  await clean(t, page, 'twenty games');

  // the heap, after a pause for the collector, must not have run away
  await sleep(4000);
  const hEnd = await heap(page);
  t.note(`heap at the end: ${hEnd} MB (start ${h0} MB)`);
  t.check(hEnd < 0 || hEnd - h0 < 400, 'heap growth over the session under 400 MB', { start: h0, end: hEnd });
  await page.context().close();
}
