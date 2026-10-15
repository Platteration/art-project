// Two tabs of the site open at once: Forget in one reaches the other (its pending autosave cannot bring
// the painting back), a pose saved in one is in the other's Figure setup, a setting changed in one is
// what the other wakes up with.
import { openPage, newTab, clean, tab, poseFrame, stroke, inked, click, text, storageKeys, sleep } from '../lib.mjs';

export default async function multitab(t, site) {
  const a = await openPage(site);
  const b = await newTab(site, a);

  // b paints; a forgets; b must start over too, and nothing of b's may come back
  await tab(b, 'paint'); await sleep(800); await stroke(b, '#ps-paper'); await sleep(2500);
  t.check((await inked(b, '#ps-paper')) > 100, 'tab B has a painting saved');
  await tab(a, 'help'); await click(a, '#forgetBtn'); await sleep(300);
  await Promise.all([
    a.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null),
    b.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => 'B did not reload'),
    click(a, '#forgetBtn'),
  ]);
  await sleep(2500);
  const bUrl = b.url();
  t.check(bUrl === site.base, 'tab B reloaded itself after Forget in tab A', bUrl);
  t.check((await storageKeys(a)).length === 0, 'no key remains after both tabs started over', await storageKeys(a));
  await tab(b, 'paint'); await sleep(2500);
  t.check((await inked(b, '#ps-paper')) === 0, 'tab B wakes up with a blank paper', await inked(b, '#ps-paper'));
  await a.reload({ waitUntil: 'load' }); await sleep(500); await tab(a, 'paint'); await sleep(2500);
  t.check((await inked(a, '#ps-paper')) === 0, 'nothing of tab B came back into the saved painting', await inked(a, '#ps-paper'));
  await clean(t, a, 'forget: tab A'); await clean(t, b, 'forget: tab B');

  // a pose saved in A is in B's Figure setup
  await tab(a, 'pose');
  const pf = poseFrame(a);
  await pf.evaluate(() => { document.getElementById('libClose').click(); document.getElementById('savePose').click(); });
  await sleep(600);
  t.check(/Saved/.test(await pf.evaluate(() => document.getElementById('savePose').textContent)), 'tab A saved a pose');
  await b.reload({ waitUntil: 'load' }); await sleep(500);
  await tab(b, 'figure');
  const mine = await b.evaluate(() => ({ group: !!document.querySelector('#tab-figure [data-group="mine"]'), poses: document.querySelectorAll('#tab-figure [data-pose-id^="mine-"]').length }));
  t.check(mine.poses === 1, "tab A's saved pose is in tab B's Figure setup", mine);
  await clean(t, a, 'pose: tab A'); await clean(t, b, 'pose: tab B');

  // Advanced chosen in A is what B wakes up with
  await click(a, '[data-mode="advanced"]'); await sleep(400);
  await b.reload({ waitUntil: 'load' }); await sleep(800);
  t.check(await b.evaluate(() => !document.body.classList.contains('mode-simple')), 'tab B wakes up in Advanced after tab A chose it');
  await clean(t, a, 'mode: tab A'); await clean(t, b, 'mode: tab B');
  await a.context().close();
}
