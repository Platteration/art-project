/*
 * Paints for the study: a known palette, or one chosen from the artist's own paints, and a
 * starting mix for each color in the color-block study.
 *
 * Known palettes are ranked by how closely each mixes this study's colors. "My paints" picks
 * a working palette from the paints the artist has ticked (or from the whole library when none
 * are), adding one paint at a time, whichever helps the colors most (Mixing.suggestTask).
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    drawer: $('drawer-colors'),
    drawerState: $('colorsState'),
    colors: $('colors'),
    presetPane: $('presetPane'),
    presetList: $('presetList'),
    minePane: $('minePane'),
    mineCount: $('mineCount'),
    mineEdit: $('mineEdit'),
    max: $('paintMax'),
    maxOut: $('paintMaxOut'),
    suggest: $('suggestBtn'),
    result: $('paintResult'),
    resultName: $('resultName'),
    resultMatch: $('resultMatch'),
    resultPaints: $('resultPaints'),
    resultAbout: $('resultAbout'),
    mixList: $('mixList'),
    dialog: $('paintDialog'),
    dialogCount: $('paintDialogCount'),
    dialogDone: $('paintDialogDone'),
    search: $('paintSearch'),
    addPreset: $('paintAddPreset'),
    none: $('paintNone'),
    cats: $('paintCats'),
  };

  const MINE_KEY = 'portrait-value-studio.myPaints';
  const CHOICE_KEY = 'portrait-value-studio.paintChoice';
  const ZONE_NAMES = ['Shadow', 'Middle', 'Light'];

  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (err) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable: kept for this visit */ }
  }

  const known = new Set(Paints.LIBRARY.map((p) => p.code));
  const choice = Object.assign({ source: 'preset', preset: '', max: 6 }, load(CHOICE_KEY, {}));
  const mine = new Set(load(MINE_KEY, []).filter((c) => known.has(c)));

  // Paints ready to mix, made once each
  const made = new Map();
  function paintFor(code) {
    if (!made.has(code)) made.set(code, Mixing.makePaint(Object.assign({ strength: 'normal' }, Paints.byCode(code))));
    return made.get(code);
  }

  // ---- The study's colors ---------------------------------------------------

  // Each block color, weighted by the square root of its area so small accents still count
  function studyColors() {
    const r = Studio.result();
    if (!r) return [];
    return r.blockColors
      .filter((c) => c.share > 0)
      .map((c) => ({ rgb: { r: c.r, g: c.g, b: c.b }, weight: Math.sqrt(c.share), zone: c.zone, share: c.share }))
      .sort((a, b) => a.zone - b.zone || Study.lightnessOf(a.rgb.r, a.rgb.g, a.rgb.b) - Study.lightnessOf(b.rgb.r, b.rgb.g, b.rgb.b));
  }

  // ---- Background work ------------------------------------------------------

  // One job at a time per kind; a newer one cancels the older
  const jobs = {};
  function runJob(kind, steps, done) {
    const id = (jobs[kind] = (jobs[kind] || 0) + 1);
    (function next() {
      if (jobs[kind] !== id) return;
      if (steps()) done();
      else setTimeout(next, 0);
    })();
    return () => jobs[kind] === id;
  }
  const cancel = (kind) => { jobs[kind] = (jobs[kind] || 0) + 1; };

  // ---- Small pieces of UI ---------------------------------------------------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function dot(code) {
    const p = Paints.byCode(code);
    const d = el('span', 'paint-dot');
    d.style.setProperty('--c', p.hex);
    d.title = p.name;
    return d;
  }
  const reachText = (cov, n) => `Mixes ${cov.reached} of ${n} colors`;

  function setState(name) {
    els.drawerState.textContent = `${els.colors.value} per value${name ? ' · ' + name : ''}`;
  }

  // ---- Known palettes -------------------------------------------------------

  let ranking = null; // [{ preset, cov }] best first, for the current study
  let rankedFor = null;

  function rankPresets() {
    const r = Studio.result();
    if (!r || rankedFor === r) return;
    rankedFor = r;
    ranking = null;
    const colors = studyColors();
    const list = [];
    let i = 0;
    els.presetList.setAttribute('aria-busy', 'true');
    runJob('rank', () => {
      const pr = Paints.PRESETS[i++];
      list.push({ preset: pr, cov: Mixing.coverage(pr.paints.map(paintFor), colors) });
      return i >= Paints.PRESETS.length;
    }, () => {
      // most colors within reach first, then the closest overall
      ranking = list.sort((a, b) => b.cov.reached - a.cov.reached || a.cov.score - b.cov.score);
      els.presetList.removeAttribute('aria-busy');
      renderPresets(colors.length);
      if (choice.source === 'preset' && choice.preset) showPreset(choice.preset);
    });
  }

  function renderPresets(n) {
    els.presetList.innerHTML = '';
    ranking.forEach(({ preset, cov }, rank) => {
      const li = el('li');
      const b = el('button', 'preset');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(choice.preset === preset.id));
      const head = el('span', 'preset-head');
      head.append(el('span', 'preset-name', preset.name));
      if (rank === 0) head.append(el('span', 'preset-best', 'Best match'));
      const dots = el('span', 'paint-dots');
      preset.paints.forEach((c) => dots.append(dot(c)));
      const meter = el('span', 'preset-meter');
      const bar = el('span', 'preset-bar');
      bar.style.setProperty('--v', (cov.reached / n).toFixed(3));
      meter.append(bar, el('span', 'preset-reach', `${cov.reached} / ${n}`));
      b.append(head, dots, meter);
      b.setAttribute('aria-label', `${preset.name}: ${preset.paints.length} paints, ${reachText(cov, n).toLowerCase()}`);
      b.addEventListener('click', () => {
        choice.preset = preset.id;
        save(CHOICE_KEY, choice);
        announce();
        els.presetList.querySelectorAll('.preset').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        showPreset(preset.id);
      });
      li.append(b);
      els.presetList.append(li);
    });
  }

  function showPreset(id) {
    const entry = ranking && ranking.find((x) => x.preset.id === id);
    if (!entry) return;
    showPalette(entry.preset.name, entry.preset.paints, entry.cov, entry.preset.about);
  }

  // ---- My paints ------------------------------------------------------------

  function renderMine() {
    const n = mine.size;
    els.mineCount.textContent = n
      ? `${n} paint${n === 1 ? '' : 's'} ticked`
      : 'No paints ticked yet: suggestions come from the whole library.';
    els.maxOut.textContent = `${els.max.value} + white`;
    els.dialogCount.textContent = n ? `${n} ticked` : '';
  }

  let suggested = null; // { codes, cov } for the current study
  function suggest() {
    const r = Studio.result();
    if (!r) return;
    const codes = mine.size ? [...mine] : Paints.LIBRARY.map((p) => p.code);
    const pool = codes.map(paintFor);
    const colors = studyColors();
    const task = Mixing.suggestTask(pool, colors, +els.max.value + (pool.some((p) => p.white) ? 1 : 0));
    els.suggest.disabled = true;
    runJob('suggest', () => {
      const done = task.step(12);
      els.suggest.textContent = done ? 'Suggest a palette' : `Choosing paints… ${Math.round(task.progress * 100)}%`;
      return done;
    }, () => {
      els.suggest.disabled = false;
      els.suggest.textContent = 'Suggest again';
      const picks = task.result.picks.map((i) => codes[i]);
      suggested = { codes: picks, cov: task.result, from: mine.size ? 'your paints' : 'the whole library' };
      announce();
      showSuggested();
    });
  }

  function showSuggested() {
    if (!suggested) { els.result.hidden = true; setState(''); return; }
    showPalette('Suggested palette', suggested.codes, suggested.cov,
      `Chosen from ${suggested.from} to mix this study's colors. Change the photo or settings and it is chosen again.`);
  }

  // ---- The chosen palette and its mixes -------------------------------------

  function showPalette(name, codes, cov, about) {
    const colors = studyColors();
    setState(name);
    els.result.hidden = false;
    els.resultName.textContent = name;
    els.resultMatch.textContent = reachText(cov, colors.length);
    els.resultAbout.textContent = about || '';
    els.resultPaints.innerHTML = '';
    codes.forEach((c) => {
      const li = el('li', 'paint-chip');
      li.append(dot(c), el('span', 'paint-code', c), el('span', 'paint-name', Paints.byCode(c).name));
      els.resultPaints.append(li);
    });
    renderMixes(codes, colors);
  }

  // "TW 6 · YO 2 · CRL 1 · IB touch". With one main paint, its number says nothing, so it has none.
  function partsText(res, paints) {
    const main = res.items.filter((x) => !x.touch).length;
    return res.items.map((it) => {
      const code = paints[it.paint].code;
      return it.touch ? `${code}\u00a0touch` : main > 1 ? `${code}\u00a0${it.parts}` : code;
    }).join(' · ');
  }
  const STATUS = { close: 'Close', near: 'Near', far: 'Out of reach' };
  function statusOf(res) {
    if (res.limit === 'dark') return ['limit', 'Darkest you can mix'];
    if (res.limit === 'light') return ['limit', 'Lightest you can mix'];
    return [res.status, STATUS[res.status]];
  }

  function renderMixes(codes, colors) {
    const paints = codes.map(paintFor);
    els.mixList.innerHTML = '';
    const rows = colors.map((c) => {
      const li = el('li', 'mix-row');
      const chips = el('span', 'mix-chips');
      const target = el('span', 'mix-chip');
      target.style.background = Studio.toHex(c.rgb);
      const mixed = el('span', 'mix-chip mix-pending');
      chips.append(target, mixed);
      const text = el('span', 'mix-text');
      const top = el('span', 'mix-top');
      top.append(el('span', 'mix-zone', `${ZONE_NAMES[c.zone]} · V ${Studio.valueLabel(Study.lightnessOf(c.rgb.r, c.rgb.g, c.rgb.b))}`));
      const recipe = el('span', 'mix-recipe', 'Working it out…');
      text.append(top, recipe);
      const add = el('button', 'btn btn-ghost mix-add', '+');
      add.type = 'button';
      add.setAttribute('aria-label', `Add ${Studio.toHex(c.rgb)} to picked colors`);
      add.title = 'Add to picked colors';
      add.addEventListener('click', () => Studio.addColor(c.rgb));
      li.append(chips, text, add);
      els.mixList.append(li);
      return { c, li, mixed, top, recipe };
    });
    let i = 0;
    let task = null;
    runJob('mix', () => {
      if (!task) task = Mixing.recipeTask(rows[i].c.rgb, paints);
      if (!task.step(12)) return false;
      const res = task.result;
      const row = rows[i];
      row.mixed.classList.remove('mix-pending');
      row.mixed.style.background = Studio.toHex(res.mix);
      row.mixed.title = 'Predicted mix ' + Studio.toHex(res.mix);
      row.recipe.textContent = partsText(res, paints);
      row.recipe.title = res.items.map((it) => `${paints[it.paint].name}: ${it.touch ? 'a touch' : it.parts + (it.parts === 1 ? ' part' : ' parts')}`).join('\n');
      const [status, label] = statusOf(res);
      const badge = el('span', 'mix-badge', label);
      badge.dataset.status = status;
      row.top.append(badge);
      task = null;
      return ++i >= rows.length;
    }, () => {});
  }

  // ---- Refresh when the study or the choice changes --------------------------

  function refresh() {
    renderMine();
    els.presetPane.hidden = choice.source !== 'preset';
    els.minePane.hidden = choice.source !== 'mine';
    if (!els.drawer.open) { setState(choice.source === 'preset' ? presetName(choice.preset) : suggested ? 'Suggested palette' : ''); return; }
    if (choice.source === 'preset') {
      cancel('suggest');
      rankPresets();
      if (ranking && rankedFor === Studio.result() && choice.preset) showPreset(choice.preset);
      else if (!choice.preset) { els.result.hidden = true; setState(''); }
    } else if (suggested && suggestedFor === Studio.result()) {
      showSuggested();
    } else if (suggested) {
      suggestedFor = Studio.result();
      suggest();
    } else {
      els.result.hidden = true;
      setState('');
    }
  }
  let suggestedFor = null;
  const presetName = (id) => (Paints.PRESETS.find((p) => p.id === id) || {}).name || '';

  document.querySelectorAll('input[name="paintSource"]').forEach((input) => {
    input.checked = input.value === choice.source;
    input.addEventListener('change', () => {
      choice.source = input.value;
      save(CHOICE_KEY, choice);
      announce();
      cancel('mix');
      refresh();
    });
  });
  els.max.value = choice.max;
  els.max.addEventListener('input', () => { choice.max = +els.max.value; save(CHOICE_KEY, choice); renderMine(); });
  els.suggest.addEventListener('click', () => { suggestedFor = Studio.result(); suggest(); });
  els.drawer.addEventListener('toggle', () => { if (els.drawer.open) refresh(); });
  els.colors.addEventListener('input', () => setState(choice.source === 'preset' ? presetName(choice.preset) : suggested ? 'Suggested palette' : ''));
  window.addEventListener('studio:result', () => {
    cancel('mix');
    refresh();
  });

  // ---- The paint library dialog ---------------------------------------------

  function renderLibrary() {
    els.cats.innerHTML = '';
    Paints.CATEGORIES.forEach((cat) => {
      const paints = Paints.LIBRARY.filter((p) => p.category === cat.id);
      const sec = el('section', 'paint-cat');
      sec.dataset.cat = cat.id;
      sec.append(el('h3', '', cat.name));
      const ul = el('ul', 'paint-grid');
      paints.forEach((p) => {
        const li = el('li');
        li.dataset.search = `${p.name} ${p.pigment} ${p.code} ${cat.name}`.toLowerCase();
        const label = el('label', 'paint-item');
        const box = el('input');
        box.type = 'checkbox';
        box.value = p.code;
        box.checked = mine.has(p.code);
        box.addEventListener('change', () => {
          if (box.checked) mine.add(p.code); else mine.delete(p.code);
          saveMine();
        });
        const sw = el('span', 'paint-swatch');
        sw.style.setProperty('--c', p.hex);
        sw.style.setProperty('--t', p.tint || p.hex);
        const name = el('span', 'paint-label');
        name.append(el('span', 'paint-name', p.name), el('span', 'paint-pigment', p.pigment));
        label.append(box, sw, name);
        li.append(label);
        ul.append(li);
      });
      sec.append(ul);
      els.cats.append(sec);
    });
  }

  let mineChanged = false;
  function saveMine() {
    save(MINE_KEY, [...mine]);
    mineChanged = true;
    renderMine();
  }

  function syncBoxes() {
    els.cats.querySelectorAll('input[type="checkbox"]').forEach((b) => { b.checked = mine.has(b.value); });
  }

  els.addPreset.append(new Option('Tick a known palette…', ''));
  Paints.PRESETS.forEach((p) => els.addPreset.append(new Option(p.name, p.id)));
  els.addPreset.addEventListener('change', () => {
    const p = Paints.PRESETS.find((x) => x.id === els.addPreset.value);
    els.addPreset.value = '';
    if (!p) return;
    p.paints.forEach((c) => mine.add(c));
    syncBoxes();
    saveMine();
    Studio.toast(`Ticked the ${p.paints.length} paints of ${p.name}`);
  });
  els.none.addEventListener('click', () => { mine.clear(); syncBoxes(); saveMine(); });
  els.search.addEventListener('input', () => {
    const q = els.search.value.trim().toLowerCase();
    els.cats.querySelectorAll('.paint-cat').forEach((sec) => {
      let any = false;
      sec.querySelectorAll('li').forEach((li) => {
        const show = !q || li.dataset.search.includes(q);
        li.hidden = !show;
        any = any || show;
      });
      sec.hidden = !any;
    });
  });
  els.mineEdit.addEventListener('click', () => {
    if (!els.cats.childElementCount) renderLibrary();
    els.dialog.showModal();
  });
  els.dialogDone.addEventListener('click', () => els.dialog.close());
  // a new set of paints gets a new suggestion straight away
  els.dialog.addEventListener('close', () => {
    els.search.value = '';
    els.search.dispatchEvent(new Event('input'));
    if (!mineChanged) return;
    mineChanged = false;
    suggested = null;
    if (choice.source === 'mine' && els.drawer.open) { suggestedFor = Studio.result(); suggest(); }
    else refresh();
  });

  // ---- The palette in use, for the study's color blocks ----------------------

  /*
   * The palette chosen here: the known palette picked, or the suggested one from My paints. With
   * none chosen yet, the known palette that mixes this study's colors best (most within reach,
   * then closest), as the list ranks them. { name, short, codes, chosen } or null.
   */
  let bestFor = null, best = null;
  function current() {
    if (choice.source === 'preset' && choice.preset) {
      const pr = Paints.PRESETS.find((p) => p.id === choice.preset);
      if (pr) return { name: pr.name, codes: pr.paints, chosen: true };
    }
    if (choice.source === 'mine' && suggested) return { name: 'Suggested palette', codes: suggested.codes, chosen: true };
    const r = Studio.result();
    if (!r) return null;
    if (bestFor !== r) {
      const colors = studyColors();
      bestFor = r;
      best = Paints.PRESETS.map((pr) => ({ pr, cov: Mixing.coverage(pr.paints.map(paintFor), colors) }))
        .sort((a, b) => b.cov.reached - a.cov.reached || a.cov.score - b.cov.score)[0].pr;
    }
    return { name: best.name, codes: best.paints, chosen: false };
  }
  // tells the page the palette in use may have changed
  function announce() { window.dispatchEvent(new CustomEvent('studio:palette')); }
  window.StudioPalette = { current };

  renderMine();
  refresh();
  announce();
})();
