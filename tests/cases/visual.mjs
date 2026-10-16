// Visual sanity at every size. For each tab's main states (set up, working, a result, a dialog or pop-up open) the
// page is measured at 320x568, 390x844, 768x1024, 1024x768 and 1400x900, in light and in dark mode, with DOM geometry
// rather than pictures: nothing makes the page scroll sideways or runs off the window, no text is cut off or sticks out
// of its button or card, no two controls overlap, no control sits under a fixed bar, a pinned board or a toast, no picture
// or canvas is stretched, and body text reaches 4.5:1 against the color behind it (3:1 for large text). A measurement that
// flags something is taken again at the same width before it counts; a confirmed layout problem is photographed with
// lib.mjs screenshot() (tests/screens/visual-*.png). Findings say what was measured and where the cause is in the code.
import { openPage, clean, tab, click, sleep, stroke, app, poseFrame, screenshot, makeImage, loadPhoto, PHONE } from '../lib.mjs';

export const SIZES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1400, height: 900 },
];
const vkey = (vp) => `${vp.width}x${vp.height}`;
const resize = (page, vp) => page.setViewportSize(vp).then(() => sleep(200));

// Runs inside the page (or a frame) and returns plain data. Every helper lives inside it, because the function is
// sent to the page as source text.
export function measure() {
  const de = document.documentElement;
  const W = window.innerWidth, H = window.innerHeight;
  const cs = (el) => getComputedStyle(el);
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) s += '.' + cls.join('.');
    return s;
  };
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26);
  const opacityOf = (el) => { let o = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) o *= parseFloat(cs(a).opacity); return o; };
  // a closed <details> keeps its content laid out but clipped to nothing (only its summary shows), so that content is not on screen
  const inClosedDetails = (el) => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) { if (a.tagName === 'SUMMARY' && a.parentElement && a.parentElement.tagName === 'DETAILS') return false; if (a.tagName === 'DETAILS' && !a.open) return true; } return false; };
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; if (cs(el).visibility !== 'visible' || inClosedDetails(el)) return false; return opacityOf(el) > 0.01; };
  const FLOAT = '.tab-menu, dialog, [role="dialog"], [role="menu"], [aria-modal="true"], .ps-sheet, .toast, .game-popup, .fig-popup, .vb-miss';
  const inFloat = (el) => !!el.closest(FLOAT);
  const fixedAncestor = (el) => { for (let a = el; a && a.nodeType === 1 && a !== de; a = a.parentElement) { const p = cs(a).position; if (p === 'fixed' || p === 'sticky') return a; } return null; };
  const clipper = (el) => { for (let a = el.parentElement; a && a !== document.body && a !== de; a = a.parentElement) { const s = cs(a); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return a; } return null; };
  const related = (a, b) => a === b || a.contains(b) || b.contains(a) || (a.tagName === 'LABEL' && a.control === b) || (b.tagName === 'LABEL' && b.control === a);
  const parseRGB = (c) => { const m = /^rgba?\((.+)\)$/.exec(c || ''); if (!m) return null; const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); if (v.length < 3 || v.slice(0, 3).some((x) => Number.isNaN(x))) return null; return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const bgOf = (el) => {
    const stack = [];
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      const s = cs(a);
      if (s.backgroundImage !== 'none') return null;
      const c = parseRGB(s.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255 };
    for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i]; base = { r: c.a * c.r + (1 - c.a) * base.r, g: c.a * c.g + (1 - c.a) * base.g, b: c.a * c.b + (1 - c.a) * base.b }; }
    return base;
  };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  const isBox = (el, s) => {
    if (s.display === 'inline') return false;
    if (/^(BUTTON|A|LABEL|SELECT|INPUT|SUMMARY|TEXTAREA)$/.test(el.tagName)) return true;
    const role = el.getAttribute('role'); if (role === 'button' || role === 'tab' || role === 'menuitemradio') return true;
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') return true;
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') return true;
    return s.overflowX !== 'visible' || s.overflowY !== 'visible';
  };
  const scroller = (el) => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) { const s = cs(a); if (/(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) return true; } return false; };

  const out = { sideways: de.scrollWidth - de.clientWidth, offscreen: [], clipped: [], overlap: [], covered: [], stretched: [], contrast: [], ellipsis: 0, texts: 0, controls: 0, noBg: 0 };

  // boxes that run past the window with no scroller or clip between them and the page
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if ((r.right > W + 1 || r.left < -1) && out.offscreen.length < 8 && shown(el) && !clipper(el)) out.offscreen.push({ sel: sel(el), text: txt(el), detail: `spans ${Math.round(r.left)} to ${Math.round(r.right)} px in a ${W} px window` });
  }

  // text against the box that holds it, and body text against its background
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seenContrast = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|TEXTAREA|TITLE|TEMPLATE)$/.test(p.tagName) || p.closest('.visually-hidden')) continue;
    if (!shown(p)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rs = Array.from(rg.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rs.length) continue;
    out.texts++;
    const maxR = Math.max(...rs.map((r) => r.right)), minL = Math.min(...rs.map((r) => r.left));
    const maxB = Math.max(...rs.map((r) => r.bottom)), minT = Math.min(...rs.map((r) => r.top));
    if (!scroller(p)) {
      for (let a = p; a && a !== document.body; a = a.parentElement) {
        const s = cs(a);
        // a box has a size of its own: display: contents (no box) and an element with nothing laid out are passed over
        if (!isBox(a, s) || s.display === 'contents' || (a.clientWidth < 2 && a.clientHeight < 2)) continue;
        const ar = a.getBoundingClientRect();
        const L = ar.left + a.clientLeft, R = L + a.clientWidth, T = ar.top + a.clientTop, B = T + a.clientHeight;
        const hx = minL < L - 1 || maxR > R + 1, vy = minT < T - 1 || maxB > B + 1;
        if (hx || vy) {
          if (s.textOverflow === 'ellipsis') out.ellipsis++;
          else if (out.clipped.length < 40) out.clipped.push({ sel: sel(a), text: txt(p), detail: hx ? `text runs to ${Math.round(maxR)} px, the box ends at ${Math.round(R)} px` : `text runs to ${Math.round(maxB)} px, the box ends at ${Math.round(B)} px` });
        }
        break;
      }
    }
    const fgc = parseRGB(cs(p).color);
    // content behind an open dialog is made inert and dimmed on purpose: it is not what the visitor is reading
    if (!fgc || p.closest(':disabled, [aria-disabled="true"], [inert]')) continue;
    const bg = bgOf(p);
    if (!bg) { out.noBg++; continue; }
    const aEff = fgc.a * opacityOf(p);
    const fg = { r: aEff * fgc.r + (1 - aEff) * bg.r, g: aEff * fgc.g + (1 - aEff) * bg.g, b: aEff * fgc.b + (1 - aEff) * bg.b };
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const fs = parseFloat(cs(p).fontSize), fw = parseInt(cs(p).fontWeight, 10) || 400;
    const need = fs >= 24 || (fs >= 18.66 && fw >= 700) ? 3 : 4.5;
    if (ratio < need - 0.005) {
      const k = sel(p) + ' ' + hex(fg) + ' ' + hex(bg);
      if (!seenContrast.has(k) && out.contrast.length < 40) { seenContrast.add(k); out.contrast.push({ sel: sel(p), text: txt(p), detail: `${ratio.toFixed(2)}:1 (${hex(fg)} on ${hex(bg)}, ${fs.toFixed(1)} px ${fw}), needs ${need}:1` }); }
    }
  }

  // pictures and canvases drawn at another shape than they hold (the content box: a border or padding is not picture)
  const content = (el) => { const s = cs(el); const w = el.getBoundingClientRect().width - ['Left', 'Right'].reduce((x, k) => x + parseFloat(s['border' + k + 'Width']) + parseFloat(s['padding' + k]), 0); const h = el.getBoundingClientRect().height - ['Top', 'Bottom'].reduce((x, k) => x + parseFloat(s['border' + k + 'Width']) + parseFloat(s['padding' + k]), 0); return { w, h }; };
  for (const img of document.querySelectorAll('img')) {
    if (!img.naturalWidth || !shown(img)) continue;
    const fit = cs(img).objectFit; if (fit && fit !== 'fill') continue;
    const c = content(img); const a = img.naturalWidth / img.naturalHeight, b = c.w / c.h;
    if (Math.abs(b - a) / a > 0.02) out.stretched.push({ sel: sel(img) + (img.alt ? ' "' + img.alt.slice(0, 26) + '"' : ''), detail: `natural ${a.toFixed(3)}, drawn ${b.toFixed(3)}` });
  }
  for (const cv of document.querySelectorAll('canvas')) {
    if (!cv.width || !cv.height || !shown(cv)) continue;
    const fit = cs(cv).objectFit; if (fit && fit !== 'fill') continue;
    const c = content(cv); const a = cv.width / cv.height, b = c.w / c.h;
    if (Math.abs(b - a) / a > 0.02) out.stretched.push({ sel: sel(cv) + (cv.getAttribute('aria-label') ? ' "' + cv.getAttribute('aria-label').slice(0, 26) + '"' : ''), detail: `${cv.width}x${cv.height} canvas drawn ${Math.round(c.w)}x${Math.round(c.h)}` });
  }

  // controls: which overlap each other, and which a finger or pointer at the middle of the control reaches
  const CTRL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, label[for], [role="button"], [role="menuitemradio"], [role="slider"], [role="tab"], [tabindex="0"]';
  const ctrls = Array.from(document.querySelectorAll(CTRL)).filter((el) => shown(el));
  out.controls = ctrls.length;
  // the part of a control a visitor can see: what its scrolling ancestors do not clip
  const visRect = (el) => {
    let r = el.getBoundingClientRect(); let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    for (let a = el.parentElement; a && a !== document.body && a !== de; a = a.parentElement) {
      const s = cs(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      l = Math.max(l, ar.left + a.clientLeft); t = Math.max(t, ar.top + a.clientTop);
      rt = Math.min(rt, ar.left + a.clientLeft + a.clientWidth); b = Math.min(b, ar.top + a.clientTop + a.clientHeight);
    }
    return { left: l, top: t, right: rt, bottom: b };
  };
  const live = ctrls.filter((el) => !inFloat(el) && !el.closest('[inert]'));
  const rb = new Map(live.map((el) => [el, visRect(el)]));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (related(a, b)) continue;
      const A = rb.get(a), B = rb.get(b);
      const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ix > 2 && iy > 2 && out.overlap.length < 30) out.overlap.push({ sel: sel(a) + ' / ' + sel(b), text: txt(a) + ' / ' + txt(b), detail: `overlap ${Math.round(ix)} x ${Math.round(iy)} px` });
    }
  }
  // scrolling moves the page and any panel it scrolls: both are put back where they were when the pass ends
  const sx = window.scrollX, sy = window.scrollY;
  const scrolled = Array.from(document.querySelectorAll('body *')).filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).map((el) => [el, el.scrollLeft, el.scrollTop]);
  // what is on top of a control: the test points are the middle and two inner corners of the part a visitor can see
  const coverOf = (el) => {
    // a control that lets pointers through on purpose (the Pose lamp while it is behind the figure) is not covered
    if (cs(el).pointerEvents === 'none') return null;
    const r = visRect(el);
    if (r.right - r.left < 2 || r.bottom - r.top < 2) return null;
    // (the points sit inside any convex shape: a round control's corners lie outside it)
    const w = r.right - r.left, h = r.bottom - r.top;
    const pts = [[r.left + w / 2, r.top + h / 2], [r.left + w * 0.25, r.top + h * 0.25], [r.left + w * 0.75, r.top + h * 0.75]];
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || related(el, hit)) continue;
      const toast = hit.closest('.toast'), float = hit.closest(FLOAT), fx = fixedAncestor(hit);
      const kind = toast ? 'toast' : float ? 'float' : fx ? 'fixed' : 'other';
      // a dialog, a menu and the full-screen pinned layers cover on purpose
      if (kind === 'float' || (kind === 'fixed' && hit.closest('.ps, .vb-play.is-pinned'))) return null;
      return { kind, sel: sel(el), text: txt(el), detail: `under ${sel(hit)}${fx ? ' (' + fx.tagName.toLowerCase() + (fx.id ? '#' + fx.id : '') + (typeof fx.className === 'string' && fx.className.trim() ? '.' + fx.className.trim().split(/\s+/)[0] : '') + ' ' + cs(fx).position + ')' : ''}` };
    }
    return null;
  };
  const reported = new Set();
  // first as the visitor sees the page now (a fixed bar over a control at rest)...
  for (const el of live) {
    const c = coverOf(el);
    if (c && out.covered.length < 30) { out.covered.push({ ...c, detail: c.detail + ', at this scroll position' }); reported.add(el); }
  }
  // ...then with each control brought to the middle of the window, so one that is only reached by scrolling is still measured
  for (const el of live) {
    if (reported.has(el)) continue;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const c = coverOf(el);
    if (c && out.covered.length < 30) out.covered.push({ ...c, detail: c.detail + ', when scrolled to' });
  }
  for (const [el, l, t] of scrolled) { el.scrollLeft = l; el.scrollTop = t; }
  window.scrollTo(sx, sy);
  return out;
}

// the measurements as issues the checks and findings read
function issuesOf(m) {
  const out = [];
  if (m.sideways > 0) out.push({ kind: 'sideways', cls: 'layout', sig: 'page', detail: `the page is ${m.sideways} px wider than its window` });
  for (const x of m.offscreen) out.push({ kind: 'offscreen', cls: 'layout', sig: x.sel, text: x.text, detail: x.detail });
  for (const x of m.clipped) out.push({ kind: 'clipped', cls: 'layout', sig: x.sel, text: x.text, detail: x.detail });
  for (const x of m.overlap) out.push({ kind: 'overlap', cls: 'layout', sig: x.sel, text: x.text, detail: x.detail });
  for (const x of m.stretched) out.push({ kind: 'stretched', cls: 'layout', sig: x.sel, detail: x.detail });
  for (const x of m.covered) out.push({ kind: x.kind === 'toast' ? 'toast' : 'covered', cls: 'reach', sig: x.sel, text: x.text, detail: x.detail });
  for (const x of m.contrast) out.push({ kind: 'contrast', cls: 'contrast', sig: x.sel, text: x.text, detail: x.detail });
  return out;
}
const summarize = (list) => list.slice(0, 4).map((i) => `${i.kind} ${i.sig}${i.text ? ' "' + i.text + '"' : ''} @${i.vp}: ${i.detail}`).join(' | ') + (list.length > 4 ? ` (+${list.length - 4} more)` : '');

// The states of one tab, in one mode: each is measured at every width. Only a problem that shows again when the
// same width is measured a second time is kept.
export async function sweep(t, page, acc, ctx, state, { targets = ['app'], before = null, how = '' } = {}) {
  const label = `${ctx.tab} · ${state} · ${ctx.mode}`;
  const grab = async (vp) => {
    await page.setViewportSize(vp);
    await sleep(260);
    if (before) await before();
    const issues = [];
    for (const target of targets) {
      const fr = target === 'pose' ? poseFrame(page) : app(page);
      if (!fr) continue;
      // a list that is re-sorting is dimmed (aria-busy) and a color still in its transition is not the one the visitor reads
      await fr.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.getAnimations().some((a) => a.playState === 'running' && typeof CSSTransition !== 'undefined' && a instanceof CSSTransition), null, { timeout: 3000 }).catch(() => null);
      const m = await fr.evaluate(measure);
      for (const i of issuesOf(m)) issues.push({ ...i, sig: (target === 'pose' ? 'pose frame: ' : '') + i.sig });
      acc.totals.texts += m.texts; acc.totals.controls += m.controls; acc.totals.ellipsis += m.ellipsis; acc.totals.noBg += m.noBg; acc.totals.measured++;
    }
    return issues;
  };
  const first = new Map();
  for (const vp of SIZES) first.set(vkey(vp), await grab(vp));
  const shotDone = new Set();
  for (const vp of SIZES) {
    const k = vkey(vp);
    const a = first.get(k);
    if (!a.length) continue;
    const b = await grab(vp);
    const again = new Set(b.map((i) => i.kind + '|' + i.sig));
    const kept = a.filter((i) => again.has(i.kind + '|' + i.sig));
    acc.unconfirmed += a.length - kept.length;
    for (const i of kept) {
      acc.confirmed.push({ ...i, tab: ctx.tab, state, mode: ctx.mode, vp: k, how });
      if (!shotDone.has(i.cls) && i.cls !== 'contrast') { shotDone.add(i.cls); await screenshot(page, `visual-${ctx.tab}-${state}-${ctx.mode}-${i.cls}-${k}`).catch(() => null); }
    }
  }
  const mine = acc.confirmed.filter((i) => i.tab === ctx.tab && i.state === state && i.mode === ctx.mode);
  const layout = mine.filter((i) => i.cls === 'layout'), reach = mine.filter((i) => i.cls === 'reach'), contrast = mine.filter((i) => i.cls === 'contrast');
  t.check(layout.length === 0, `${label}: fits every width: no sideways scroll, no text cut off or running out of its box, no overlapping controls, no stretched picture`, layout.length ? summarize(layout) : undefined);
  t.check(reach.length === 0, `${label}: nothing needed sits under a fixed bar or a toast at any width`, reach.length ? summarize(reach) : undefined);
  t.check(contrast.length === 0, `${label}: body text reaches 4.5:1 against the color behind it`, contrast.length ? summarize(contrast) : undefined);
  if (!shotDone.has('contrast') && contrast.length) await screenshot(page, `visual-${ctx.tab}-${state}-${ctx.mode}-contrast`).catch(() => null);
}

// ---- how each tab's states are reached (a visitor's taps, and the test hooks the other cases also read) ----
const shownIn = (page, sel, timeout = 8000) => app(page).waitForFunction((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel, { timeout }).catch(() => null);
async function tapFrac(page, selector, fx, fy) {
  const b = await app(page).evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, selector);
  await page.mouse.click(b.x + b.w * fx, b.y + b.h * fy);
}
async function answerWrong(page) {
  const s = await app(page).evaluate(() => { const g = ValueBattle.state(); const r = g.rounds[g.i]; return { mode: r.q.mode, answer: r.answer, n: r.n }; });
  if (s.mode === 'pair') {
    if (s.answer === 'same') await click(page, '.vb-swatch[data-index="0"]');
    else await click(page, '.vb-choice[data-choice="same"]');
  } else if (s.mode === 'pick') {
    await click(page, `.vb-swatch[data-index="${(s.answer + 1) % s.n}"]`);
  } else {
    for (const i of s.answer.slice().reverse()) await click(page, `.vb-swatch[data-index="${i}"]`);
  }
}

const FLOW = {
  async study(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'study'); await sleep(400);
    await sweep(t, page, acc, ctx, 'setup', { how: 'open the page: Study the photo with the sample portrait, Simple mode' });
    await click(page, '[data-mode="advanced"]'); await sleep(300);
    await app(page).evaluate(() => document.querySelectorAll('details.drawer').forEach((d) => { d.open = true; }));
    await click(page, '[data-tool="line"]'); await sleep(200);
    await stroke(page, '#cv-orig', [[0.2, 0.3], [0.8, 0.6]]); await sleep(400);
    await sweep(t, page, acc, ctx, 'working', { how: 'Advanced mode, every drawer open, Draw lines on, one line drawn on the photo' });
    await sweep(t, page, acc, ctx, 'toast', { how: 'as working, then Auto split (the toast says the splits were set)', before: () => click(page, '#autoSplit') });
    await click(page, '[data-tool="line"]'); await click(page, 'label[for="vBlock"]'); await sleep(300);
    await sweep(t, page, acc, ctx, 'shapes view', { how: 'as working with the line tool off, the Shapes view' });
    await click(page, 'label[for="vAll"]'); await click(page, '[data-mode="simple"]'); await sleep(300);
    await click(page, '#tabLearnBtn'); await sleep(250);
    await sweep(t, page, acc, ctx, 'Learning tools menu', { how: 'Simple mode, Learning tools opened from the tab bar' });
    await click(page, '#tabLearnBtn'); await sleep(200);
    await click(page, '#tabGamesBtn'); await sleep(250);
    await sweep(t, page, acc, ctx, 'Games menu', { how: 'Simple mode, Games opened from the tab bar' });
    await click(page, '#tabGamesBtn'); await sleep(200);
    // How close did I get?: a photo of a painting loaded through its own file input, the four panels drawn
    await app(page).evaluate(() => { const d = document.getElementById('drawer-check'); if (d) d.open = true; });
    await loadPhoto(page, await makeImage(page, { width: 600, height: 800, draw: 'portrait', name: 'my-painting.png' }), { selector: '#artFile', settle: 1500 });
    await shownIn(page, '#checkPanels', 15000);
    await sweep(t, page, acc, ctx, 'how close did I get', { how: 'Study the photo: How close did I get?, a photo of a painting loaded, the four panels drawn below the studies' });
  },
  async loomis(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'loomis'); await sleep(500);
    await sweep(t, page, acc, ctx, 'set up', { how: 'Learning tools, Loomis head: the first feature asked for' });
    const spots = [[0.5, 0.22], [0.42, 0.4], [0.58, 0.4], [0.5, 0.55], [0.5, 0.68], [0.35, 0.5], [0.65, 0.5], [0.5, 0.3]];
    for (const [fx, fy] of spots.slice(0, 3)) { await tapFrac(page, '#lh-overlay', fx, fy); await sleep(150); await click(page, '#lh-lock'); await sleep(350); }
    await sweep(t, page, acc, ctx, 'three marks', { how: 'Loomis head: three features tapped on the photo and locked in' });
    for (const [fx, fy] of spots.slice(3)) { await tapFrac(page, '#lh-overlay', fx, fy); await sleep(150); await click(page, '#lh-lock'); await sleep(350); }
    await shownIn(page, '#lh-cardStudio', 8000);
    await sweep(t, page, acc, ctx, 'head fitted', { how: 'Loomis head: all eight features locked in, the head fitted over the photo' });
  },
  async pose(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'pose'); await sleep(300);
    await sweep(t, page, acc, ctx, 'choose a pose', { targets: ['app', 'pose'], how: 'Learning tools, Pose and light on the first visit: the Choose a pose dialog open' });
    await poseFrame(page).evaluate(() => document.getElementById('libClose').click()); await sleep(400);
    await sweep(t, page, acc, ctx, 'set up', { targets: ['app', 'pose'], how: 'Pose and light with the dialog closed: the wooden figure and the lamp' });
    await poseFrame(page).evaluate(() => document.getElementById('posesBtn').click()); await sleep(400);
    await sweep(t, page, acc, ctx, 'pose library', { targets: ['app', 'pose'], how: 'Pose and light, then Poses (the library dialog open)' });
    await poseFrame(page).evaluate(() => document.getElementById('libClose').click()); await sleep(200);
  },
  async help(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'help'); await sleep(400);
    await sweep(t, page, acc, ctx, 'top', { how: 'Learning tools, How to use: the top of the guide' });
    await app(page).evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.4))); await sleep(200);
    await sweep(t, page, acc, ctx, 'phone pictures', { how: 'How to use, scrolled to the middle where the phone pictures are' });
    await app(page).evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(200);
    await sweep(t, page, acc, ctx, 'end of guide', { how: 'How to use, scrolled to the end' });
    await app(page).evaluate(() => window.scrollTo(0, 0)); await sleep(100);
  },
  async paint(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'paint'); await sleep(800);
    await sweep(t, page, acc, ctx, 'blank paper', { how: 'Studio tab, a blank paper' });
    await stroke(page, '#ps-paper', [[0.3, 0.3], [0.5, 0.5], [0.7, 0.62]]); await sleep(400);
    await sweep(t, page, acc, ctx, 'painted', { how: 'Studio tab, one stroke on the paper' });
    await click(page, '#ps-colorBtn'); await shownIn(page, '#ps-paintSheet');
    await sweep(t, page, acc, ctx, 'paints sheet', { how: 'Studio, the paints sheet open over the paper' });
    await app(page).evaluate(() => document.querySelector('#ps-paintSheet [data-close]').click()); await sleep(250);
    await click(page, '#ps-brushBtn'); await shownIn(page, '#ps-brushSheet');
    await sweep(t, page, acc, ctx, 'brushes sheet', { how: 'Studio, the brushes sheet open over the paper' });
    await app(page).evaluate(() => { const b = document.querySelector('#ps-brushSheet [data-close]'); if (b) b.click(); }); await sleep(250);
  },
  async figure(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'figure'); await sleep(300);
    await sweep(t, page, acc, ctx, 'set up', { how: 'Figure study: the class set up, Start drawing' });
    await click(page, '#fig-start'); await shownIn(page, '#fig-bar');
    await stroke(page, '#fs-paper', [[0.4, 0.2], [0.5, 0.5], [0.6, 0.8]]); await sleep(300);
    await sweep(t, page, acc, ctx, 'drawing a pose', { how: 'Figure study: Start drawing, one stroke on the drawing, the clock running' });
    await click(page, '#fig-done'); await shownIn(page, '#fig-result');
    await sweep(t, page, acc, ctx, 'pose score', { how: 'Figure study: Done, the pose score dialog open' });
    await click(page, '#fig-stop');
    const reviewed = !!(await shownIn(page, '#fig-review', 8000));
    t.check(reviewed, 'figure study: Stop class shows Your figure drawings', reviewed ? undefined : 'the review did not appear');
    if (reviewed) await sweep(t, page, acc, ctx, 'your drawings', { how: 'Figure study: Done, then Stop class: the review of the drawings' });
  },
  async game(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'game'); await sleep(300);
    await app(page).waitForFunction(() => { const b = document.getElementById('gameStart'); return !!b && !b.disabled; }, null, { timeout: 30000 }).catch(() => null);
    await sweep(t, page, acc, ctx, 'set up', { how: 'Games, Paint by numbers: the setup with the sample portrait' });
    await click(page, '#gameStart'); await shownIn(page, '#gamePlay');
    await sweep(t, page, acc, ctx, 'painting', { how: 'Paint by numbers: Start painting, the board up' });
    await click(page, '#gameLock'); await shownIn(page, '#gameResult');
    await sweep(t, page, acc, ctx, 'score', { how: 'Paint by numbers: Lock in portrait, the score pop-up open' });
    await click(page, '#gamePopupClose'); await sleep(400);
    await sweep(t, page, acc, ctx, 'portrait', { how: 'Paint by numbers: Lock in portrait, then the score hidden to see the portrait' });
    await click(page, '#gameCompare'); await sleep(400);
    await sweep(t, page, acc, ctx, 'compare', { how: 'Paint by numbers: as the portrait, then Compare with target' });
  },
  async battle(t, page, acc, ctx) {
    await resize(page, PHONE);
    await tab(page, 'battle'); await sleep(400);
    await sweep(t, page, acc, ctx, 'set up', { how: 'Games, Value battle: the setup' });
    await click(page, '#vb-start'); await shownIn(page, '#vb-play');
    await sweep(t, page, acc, ctx, 'round', { how: 'Value battle: Start, the board pinned in the window' });
    await answerWrong(page); await shownIn(page, '#vb-miss');
    await sweep(t, page, acc, ctx, 'miss pop-up', { how: 'Value battle: a wrong answer, the miss pop-up open' });
    await click(page, '#vb-missNext'); await shownIn(page, '#vb-popup');
    await sweep(t, page, acc, ctx, 'score pop-up', { how: 'Value battle: See the score, the score pop-up open' });
  },
};
export const TABS = Object.keys(FLOW);

// Every state of every tab, in one mode, on one page. Tabs and states are reached in order and each tab is cleaned.
export async function runMode(t, site, mode, acc, { tabs = TABS } = {}) {
  const page = await openPage(site, { viewport: PHONE, dark: mode === 'dark' });
  for (const name of tabs) {
    const ctx = { mode, tab: name };
    try { await FLOW[name](t, page, acc, ctx); }
    catch (e) { t.check(false, `${name} · ${mode}: its states can be reached`, String(e && e.message || e).slice(0, 300)); }
    await clean(t, page, `${name} (${mode})`);
  }
  await page.context().close();
}

// What is known about each confirmed problem, with its cause in the code. report() groups the confirmed problems by
// what and where, and each group becomes a finding; one not listed here is still reported, with its measurements.
const KNOWN = [
  {
    kind: 'clipped', sig: /^div\.game-bar$/, severity: 'medium',
    title: 'Paint by numbers at 320 px: the progress line is squeezed into a column about 8 px wide and runs out above and beside its bar',
    expected: 'The game bar holds its timer, its progress line ("0 of 11 numbers painted") and its buttons inside its border at every phone width (README: "the timer bar, the painting and the palette fill the screen").',
    cause: 'styles.css:1057 (inside the `max-width: 999px` block that starts at styles.css:1039) sets `.game-bar { flex-wrap: nowrap }`, so the timer, the sound and quit buttons, Lock in portrait and the gaps take all but about 8 px of the 286 px bar, and `.game-progress` takes that space (`flex: 1` at styles.css:847, `min-width: 0` at styles.css:1059), so it is left about 8 px; the paragraph then breaks into a few short lines and its text runs past the bar\'s top and side (screenshot: tests/screens/visual-game-painting-light-layout-320x568.png).',
  },
  {
    kind: 'contrast', sig: /^span#vb-score\.vb-score$/, severity: 'medium',
    title: 'Value battle: the round counter ("Round 1") is 3.8:1 on the primer-gray board, under the 4.5:1 for body text',
    expected: 'Body text reaches 4.5:1 against the board (WCAG AA). README: "Everything lives on the board: the streak, round and clock along its top with the quit button".',
    cause: 'styles.css:1666 `.vb-score { opacity: 0.8 }` fades the score text on the #8c8a86 board (styles.css:1658). The bar\'s #1c1a17 text is about 5:1 on that board (the comment at styles.css:1660 says 4.9:1), but the 0.8 opacity blends the score to #32302d, which is 3.8:1.',
  },
  {
    kind: 'contrast', sig: /^p#vb-question\.vb-question$/, severity: 'low',
    title: 'Value battle: the question is 2.98:1 on the primer gray, just under the 3:1 for large text',
    expected: 'The question reaches 3:1 (large text, 19 px bold) against the board. README: "the colors, the answer line, and the answer row below the colors" sit on the board with the question.',
    cause: 'styles.css:1671 sets `color: #f3eee2` with a 0.3-alpha text-shadow on the #8c8a86 board (styles.css:1658); the ratio is measured without the shadow, so the visible margin is a little better than measured, but still under 3:1.',
  },
  {
    kind: 'contrast', sig: /^span\.vb-letter$/, severity: 'medium',
    title: 'Value battle: the swatch letters A to D are 2.3 to 4.0:1 on some swatch colors',
    expected: 'The letters that name the swatches (README: "With three or four, the swatches are lettered") read on any swatch the round deals, at 4.5:1 for small text.',
    cause: 'styles.css:1683 `.vb-letter { color: #faf5ea; text-shadow: …0.7 }` is one light color whatever paint the round deals; the swatch fill is the letter\'s background (set per color inline at js/battle.js:308; the letter is made at js/battle.js:310), so a light swatch (for example #e97259 or #df9067) leaves the letter at 2.3 to 2.8:1. The colors are dealt at random each round, so the letter\'s ratio varies run to run.',
  },
  {
    kind: 'contrast', sig: /^span\.fig-rating-stars$/, severity: 'medium',
    title: 'Figure study review: each drawing\'s star rating is gold on cream, 2.1:1',
    expected: 'The stars that rate each drawing read against the card (3:1 for a graphic that carries information, 4.5:1 for text). README: "Figure study ... scored with stars after each pose".',
    cause: 'styles.css:1588 `.fig-rating-stars { color: #d9a441 }` on the cream card (the card background is --surface #faf5ea, styles.css:9). The glyphs are aria-hidden (js/figure.js:991-996), so the rating reaches a screen reader only as the visually hidden sentence, while a sighted visitor reads the gold stars alone.',
  },
  {
    kind: 'overlap', sig: /gameFinalHandle/, severity: 'low',
    title: 'Paint by numbers, Compare with target: the divider handle\'s box covers the Show score and Stop comparing buttons',
    expected: 'Controls do not overlap. README: "Compare with target lays the colors to match over your portrait: drag the divider (or use the arrow keys) to wipe between them."',
    cause: 'styles.css:1257 `.game-final-handle` runs the full height of the portrait (top: 0; bottom: 0) at 48 px wide and z-index 2, and it is a focusable slider; the button row (`.game-show-bar`, styles.css:1273) is layered above it at z-index 3, so taps land on the buttons, but the handle\'s box and its keyboard focus sit under them.',
  },
];
export function report(t, acc) {
  // one finding per known problem (however many elements show it), else one per kind and element
  const groups = new Map();
  for (const i of acc.confirmed) {
    const known = KNOWN.findIndex((k) => k.kind === i.kind && (!k.sig || k.sig.test(i.sig)));
    const key = known >= 0 ? `known${known}` : `${i.kind}|${i.sig}`;
    if (!groups.has(key)) groups.set(key, { ...i, known, sigs: new Set(), states: new Set(), vps: new Set(), modes: new Set(), hows: new Set(), texts: new Set() });
    const g = groups.get(key);
    g.sigs.add(i.sig); g.states.add(`${i.tab} ${i.state}`); g.vps.add(i.vp); g.modes.add(i.mode); g.hows.add(i.how); if (i.text) g.texts.add(i.text);
  }
  for (const g of groups.values()) {
    const known = g.known >= 0 ? KNOWN[g.known] : null;
    const vps = [...g.vps].join(', '), modes = [...g.modes].join(' and ');
    const where = [...g.states].join('; ');
    const what = known ? [...g.sigs].slice(0, 3).join('; ') : g.sig;
    t.finding({
      title: known ? known.title : `${g.kind} at ${g.sig}`,
      severity: known ? known.severity : 'medium',
      steps: `Open the site (${modes} mode) at ${vps}. ${[...g.hows].join('. ')}. Look at ${what}${g.texts.size ? ' ("' + [...g.texts].slice(0, 2).join('", "') + '")' : ''}. States: ${where}.`,
      expected: known ? known.expected : 'Nothing overflows, overlaps or is covered at any width, and body text reaches 4.5:1 against its background.',
      actual: `${g.detail} (first seen: ${g.tab} ${g.state}, ${g.mode}, ${g.vp}).`,
      cause: known ? known.cause : 'not traced yet',
    });
  }
  return groups.size;
}

export default async function visual(t, site) {
  const acc = { confirmed: [], unconfirmed: 0, totals: { texts: 0, controls: 0, ellipsis: 0, noBg: 0, measured: 0 } };
  for (const mode of ['light', 'dark']) await runMode(t, site, mode, acc);
  const groups = report(t, acc);
  t.note(`measured ${acc.totals.measured} page views: ${acc.totals.texts} text runs and ${acc.totals.controls} controls checked; ${acc.totals.ellipsis} truncated with an ellipsis by design; ${acc.totals.noBg} text runs over a picture (not measured); ${acc.unconfirmed} first readings not repeated at the same width (dropped as flakes); ${groups} distinct problems.`);
}
