/*
 * Portrait Value Studio - "Paint it in steps": the reference as a seven-step block-in, from the
 * big light and shadow shapes to the accents, with the mixes each step adds.
 *
 * The steps are built on their own 600 px copy of the photo, so stepping through them never
 * disturbs the studies (or their blur cache) on the other tabs. Each step is computed the first
 * time it is shown and kept until the photo, or a setting the step uses, changes.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    canvas: $('cv-lesson'),
    steps: Array.from(document.querySelectorAll('input[name="lessonStep"]')),
    prev: $('lessonPrev'),
    next: $('lessonNext'),
    showNew: $('lessonNew'),
    caption: $('lessonCaption'),
    kicker: $('lessonKicker'),
    title: $('lessonTitle'),
    text: $('lessonText'),
    note: $('lessonNote'),
    noteGo: $('lessonNoteGo'),
    newHint: $('lessonNewHint'),
    legend: $('lessonLegend'),
    mixes: $('lessonMixes'),
    swatches: $('lessonSwatches'),
    addAll: $('lessonAddAll'),
    settings: $('lessonSettings'),
  };

  const app = () => window.StudioApp;

  const LAST = 7;
  const SIZE = 600;                            // long side of the lesson's copy of the photo
  const STEP_KEY = 'portrait-value-studio.lesson-step';
  const ZONE_NAMES = ['Shadow', 'Halftone', 'Light'];
  const GROUND = Study.labToRgb(55, 3, 10);    // a thin mid-value wash, a little warm, like a toned canvas
  const INK = Study.labToRgb(26, 8, 14);       // drawing lines in a dark earth
  const FLAT = 0.2;   // under this share of soft shadow edges the light reads as flat (see softBorder)
  const SAME = 6;     // "Show what's new" grays out pixels that changed by less than this (RGB)
  const WARM_HUE = 50 * (Math.PI / 180);       // orange-red direction in the a*b* plane, as in compare()

  const STEPS = [
    null,
    {
      short: 'big-shapes',
      title: 'Draw the big shapes',
      text: () => 'Tone the canvas with a thin mid-value wash. Then draw only the edge where light turns to shadow, and the outer edge of the head and hair. Squint at the photo: a shape that disappears when you squint can wait.',
    },
    {
      short: 'shadows',
      title: 'Fill the shadows',
      text: () => 'Mix one dark for every shadow, hair and background darks included, and fill the shapes flat. Don\'t add detail yet. The mix is the average of everything in shadow, so it sits between, say, the hair and the skin in shadow; that is a deliberate simplification.',
    },
    {
      short: 'lights',
      title: 'Fill the lights',
      text: () => 'Mix one light, again the average of everything it covers, and fill everything outside the shadows, keeping the edge where you drew it. This two-value poster is the design of the whole painting: if the head doesn\'t read as solid now, fix the shapes before going on.',
    },
    {
      short: 'halftones',
      title: 'Find the halftones',
      text: () => 'Keep the shadows as they are. Inside the light, find where the form starts to turn away and paint it with one middle mix. The light that is left can now be a little lighter.',
    },
    {
      short: 'color-shifts',
      title: 'Shift the color inside each mass',
      text: () => 'Keep each value where it is and change only the color: every mass gets two mixes, such as a warmer and a cooler light. Squint to check them: a new mix that jumps out of its mass is the wrong value.',
    },
    {
      short: 'smaller-shapes',
      title: 'Paint the smaller shapes',
      text: (s) => `Break the masses into smaller shapes: the eye sockets, the plane under the nose, the shadow under the lower lip. Use up to ${s.K} mix${s.K === 1 ? '' : 'es'} per value, and keep the edges crisp; smaller doesn't mean blended.`,
    },
    {
      short: 'accents',
      title: 'Accents and highlights last',
      text: (s) => 'Place the darkest darks where forms tuck in, such as the nostrils and the corners of the eyes and mouth, and the brightest lights where the light hits square on. ' + accentCount(s.spots),
    },
  ];

  const lesson = {
    source: null,      // the photo the steps were built from
    prep: null,        // Study.prepare() of it at SIZE
    shadowLine: 50,    // two-value split, L*
    lightSplit: 60,    // halftone / light split picked from the light shapes, L*
    flat: false,       // flat lighting: steps 1 to 3 show local color more than light and shadow
    zones2: null,      // the two-value map (0 shadow, 2 light)
    mix2: null,        // one mix for the shadows and one for the lights
    cache: [],         // step number -> { key, data }
    step: readStep(),
    rings: null,       // accents ringed on the overlay, in image pixels
    swatches: [],      // the colors listed for the step shown
  };

  // ---- Remembered step ----------------------------------------------------

  function readStep() {
    try {
      const n = parseInt(localStorage.getItem(STEP_KEY), 10);
      return n >= 1 && n <= LAST ? n : 1;
    } catch (err) {
      return 1;
    }
  }

  function saveStep(n) {
    try {
      localStorage.setItem(STEP_KEY, String(n));
    } catch (err) {
      /* storage unavailable: the step is only kept for this visit */
    }
  }

  // ---- Building the steps ---------------------------------------------------

  // Shape settings in the same units as the rail's Simplify and Merge sliders (settings() in app.js)
  function shapeOpts(simplify, merge) {
    const { w, h } = lesson.prep;
    return {
      blurRadius: Math.round((simplify * Math.max(w, h)) / 450),
      minSize: Math.round(w * h * 0.012 * Math.pow(merge / 10, 2)),
      grayMode: 'average',
      customL: [0, 0, 0],
      colorsPerZone: 1,
      outlines: false,
    };
  }

  // A new photo: its own copy, the two-value split, and whether the lighting is flat
  function prepare(source) {
    lesson.source = source;
    lesson.prep = Study.prepare(source, SIZE);
    lesson.cache = [];
    const big = shapeOpts(7, 8);
    const two = Study.autoThreshold2(lesson.prep, big.blurRadius);
    lesson.shadowLine = two.t;
    const res = Study.process(lesson.prep, Object.assign(big, { t1: two.t, t2: two.t }));
    lesson.zones2 = res.zone;
    lesson.mix2 = Study.averageColors(lesson.prep, res.zone, 3);
    lesson.lightSplit = Math.max(two.t + 2, Study.autoThreshold2(lesson.prep, big.blurRadius, two.t).t);
    // eta catches a picture of nearly one value; the soft-edge share catches flat light on a
    // subject with dark hair or clothes, where the split is clean but runs along color edges
    lesson.flat = !lesson.mix2[0] || !lesson.mix2[2] || two.eta < 0.5 ||
      Study.softBorder(lesson.prep, res.zone) < FLAT;
  }

  // Steps 4 to 7 split the light at your Middle / light split when it is above the shadow line
  function halftoneSplit() {
    const t2 = +app().els.t2.value;
    if (t2 >= lesson.shadowLine + 3) return { t: t2, yours: true };
    return { t: lesson.lightSplit, yours: false };
  }

  function swatch(c, name, share) {
    return { r: c.r, g: c.g, b: c.b, name, share };
  }

  // Paints each pixel with its zone's color
  function paintZones(zones, colors) {
    const img = new Uint8ClampedArray(zones.length * 4);
    for (let i = 0, p = 0; i < zones.length; i++, p += 4) {
      const c = colors[zones[i]];
      img[p] = c.r; img[p + 1] = c.g; img[p + 2] = c.b; img[p + 3] = 255;
    }
    return img;
  }

  function flatImage(c) {
    return paintZones(new Uint8Array(lesson.prep.w * lesson.prep.h), [c]);
  }

  // How the two mixes of one mass differ: warmer / cooler, else grayer / more saturated, else lighter / darker
  function shiftNames(a, b) {
    const warm = (lab) => lab[1] * Math.cos(WARM_HUE) + lab[2] * Math.sin(WARM_HUE);
    const chroma = (lab) => Math.hypot(lab[1], lab[2]);
    const dw = warm(a) - warm(b), dc = chroma(a) - chroma(b);
    if (Math.abs(dw) >= 3) return dw > 0 ? ['warmer', 'cooler'] : ['cooler', 'warmer'];
    if (Math.abs(dc) >= 3) return dc > 0 ? ['more saturated', 'grayer'] : ['grayer', 'more saturated'];
    return a[0] > b[0] ? ['lighter', 'darker'] : ['darker', 'lighter'];
  }

  const lightness = (c) => Study.lightnessOf(c.r, c.g, c.b);

  const make = {
    1: () => ({
      image: Study.outlineImage(lesson.zones2, lesson.prep.w, lesson.prep.h, GROUND, INK),
      swatches: [swatch(GROUND, 'Toned ground')],
    }),
    // the drawing with the shadows filled in; lines on the light side stay visible
    2: () => {
      const shadow = lesson.mix2[0];
      const image = new Uint8ClampedArray(get(1).image);
      if (shadow) {
        for (let i = 0, p = 0; i < lesson.zones2.length; i++, p += 4) {
          if (lesson.zones2[i]) continue;
          image[p] = shadow.r; image[p + 1] = shadow.g; image[p + 2] = shadow.b;
        }
      }
      return { image, swatches: shadow ? [swatch(shadow, 'Shadow mix', shadow.share)] : [] };
    },
    3: () => {
      const [shadow, , light] = lesson.mix2;
      return {
        image: paintZones(lesson.zones2, [shadow || GROUND, GROUND, light || GROUND]),
        swatches: light ? [swatch(light, 'Light mix', light.share)] : [],
      };
    },
    // the shadows stay exactly as in step 3; only the light family is split
    4: (ht) => {
      const big = shapeOpts(7, 8);
      const zones = Study.splitLights(lesson.prep, lesson.zones2, big.blurRadius, ht.t, big.minSize);
      const mix = Study.averageColors(lesson.prep, zones, 3);
      const swatches = [];
      if (mix[1]) swatches.push(swatch(mix[1], 'Halftone mix', mix[1].share));
      if (mix[2] && mix[1]) swatches.push(swatch(mix[2], 'Light mix, now lighter', mix[2].share));
      // what's new is the halftone, though the light that is left changes a little too
      const fresh = zones.map((z) => (z === 1 ? 1 : 0));
      return { zones, fresh, image: paintZones(zones, mix.map((c) => c || GROUND)), swatches };
    },
    // two colors inside each mass of step 4, each the most prominent color of its group
    5: (ht) => {
      const res = Study.process(lesson.prep, Object.assign(shapeOpts(4, 5), { zones: get(4, ht).zones, colorsPerZone: 2 }));
      // every color changes from the average to a real one; what's new is each mass's second mix
      const count = new Float64Array(6);
      res.block.forEach((b) => { count[b]++; });
      const fresh = res.block.map((b) => (count[b] < count[b ^ 1] ? 1 : 0));
      const swatches = [];
      for (let z = 0; z < 3; z++) {
        const pair = res.blockColors.filter((c) => c.zone === z);
        if (pair.length === 1) swatches.push(swatch(pair[0], ZONE_NAMES[z] + ' mix', pair[0].share));
        if (pair.length !== 2) continue;
        const names = shiftNames(Study.rgbToLab(pair[0].r, pair[0].g, pair[0].b), Study.rgbToLab(pair[1].r, pair[1].g, pair[1].b));
        pair.forEach((c, k) => swatches.push(swatch(c, `${ZONE_NAMES[z]}, ${names[k]}`, c.share)));
      }
      return { fresh, image: res.blockImage, swatches };
    },
    6: (ht, K) => {
      const res = Study.process(lesson.prep, Object.assign(shapeOpts(2, 3), { t1: lesson.shadowLine, t2: ht.t, colorsPerZone: K }));
      const swatches = res.blockColors
        .filter((c) => c.share >= 0.005)
        .sort((a, b) => a.zone - b.zone || lightness(a) - lightness(b))
        .map((c) => swatch(c, ZONE_NAMES[c.zone], c.share));
      return { res, image: res.blockImage, swatches };
    },
    // step 6 with the accents painted in and ringed
    7: (ht, K) => {
      const { w, h } = lesson.prep;
      const long = Math.max(w, h);
      const acc = Study.findAccents(lesson.prep, get(6, ht, K).res, {
        contrast: 12,                 // 1.2 value steps off the shape painted over it
        minArea: 4,
        maxShare: 0.005,
        maxSpan: Math.round(long / 20),
        spacing: Math.round(long / 15),
        max: 6,
        relative: 0.3,                // a few strong accents, not every speck that qualifies
        darkBelow: lesson.shadowLine,
        lightAbove: ht.t,
      });
      const darks = acc.spots.filter((s) => s.kind === 'dark').map((s) => s.color);
      const lights = acc.spots.filter((s) => s.kind === 'light').map((s) => s.color);
      const swatches = [];
      if (darks.length) swatches.push(swatch(darks.reduce((a, b) => (lightness(b) < lightness(a) ? b : a)), 'Darkest accent'));
      if (lights.length) swatches.push(swatch(lights.reduce((a, b) => (lightness(b) > lightness(a) ? b : a)), 'Brightest highlight'));
      return { image: acc.image, spots: acc.spots, swatches };
    },
  };

  // A step's result, computed once for the settings it depends on
  function get(n, ht, K) {
    ht = ht || halftoneSplit();
    K = K || +app().els.colors.value;
    const key = n <= 3 ? '' : n <= 5 ? String(ht.t) : ht.t + ':' + K;
    const hit = lesson.cache[n];
    if (hit && hit.key === key) return hit.data;
    const data = make[n](ht, K);
    lesson.cache[n] = { key, data };
    return data;
  }

  // Grays out every pixel that the step didn't change (or that isn't in its `fresh` mask), so only
  // its new shapes keep their color
  function whatsNew(img, prev, fresh) {
    const out = new Uint8ClampedArray(img.length);
    const g = Study.grayForL(55);
    for (let i = 0, p = 0; p < img.length; i++, p += 4) {
      const same = fresh ? !fresh[i] : Math.abs(img[p] - prev[p]) < SAME &&
        Math.abs(img[p + 1] - prev[p + 1]) < SAME && Math.abs(img[p + 2] - prev[p + 2]) < SAME;
      const k = same ? 0.72 : 0;
      out[p] = img[p] + (g - img[p]) * k;
      out[p + 1] = img[p + 1] + (g - img[p + 1]) * k;
      out[p + 2] = img[p + 2] + (g - img[p + 2]) * k;
      out[p + 3] = 255;
    }
    return out;
  }

  // ---- Showing a step -------------------------------------------------------

  function accentCount(spots) {
    const d = spots.filter((s) => s.kind === 'dark').length;
    const l = spots.length - d;
    if (!spots.length) return 'Nothing small stands out much darker or lighter than the shapes of step 6 here, so there are no accents to ring.';
    const part = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const list = [d && part(d, 'dark accent', 'dark accents'), l && part(l, 'highlight', 'highlights')].filter(Boolean);
    return `${list.join(' and ')}; keep them this small.`;
  }

  const NEW_HINTS = {
    1: 'Only the drawing is new; gray is the bare toned ground.',
    4: 'Only the halftones are new. The rest of the light also gets a little lighter.',
    5: 'Colored areas are the second mix in each mass. Gray areas keep the mass\'s main mix, now a color from the photo.',
  };

  const valueLabel = (L) => 'V ' + (L / 10).toFixed(1);
  const hex2 = (v) => v.toString(16).padStart(2, '0');
  const toHex = (c) => ('#' + hex2(c.r) + hex2(c.g) + hex2(c.b)).toUpperCase();

  function settingsHint(n, ht, K) {
    if (n <= 3) {
      return `The line between light and shadow is at ${valueLabel(lesson.shadowLine)}, picked from this photo. Steps 1 to 5 use their own Simplify and Merge settings so the shapes stay big.`;
    }
    if (n === 4) {
      return ht.yours
        ? `The halftones are split from the light at your Middle / light split, ${valueLabel(ht.t)}.`
        : `Your Middle / light split is not above the shadow line (${valueLabel(lesson.shadowLine)}), so the halftones are split at ${valueLabel(ht.t)}, picked from the light shapes.`;
    }
    if (n === 5) return 'Two mixes for each mass of step 4. The shapes are the same; only the color changes.';
    if (n === 6) return `Uses your Colors per value (${K}). Mixes covering less than half a percent of the picture are left out of the list.`;
    return 'Rings mark small, compact spots more than a value step darker or lighter than the shapes of step 6, the strongest few only.';
  }

  function renderSwatches(list) {
    els.swatches.innerHTML = '';
    els.mixes.hidden = !list.length;
    list.forEach((c) => {
      const hex = toHex(c);
      const li = document.createElement('li');
      li.className = 'lesson-swatch';
      const chip = document.createElement('span');
      chip.className = 'lesson-chip';
      chip.style.background = hex;
      const text = document.createElement('span');
      text.className = 'lesson-swatch-text';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = c.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      // the share wraps as one piece: "12% of picture"
      meta.textContent = `${hex} · ${valueLabel(lightness(c))}` +
        (c.share ? ` · ${Math.max(1, Math.round(c.share * 100))}%\u00a0of\u00a0picture` : '');
      text.append(name, meta);
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-small';
      add.textContent = 'Add to palette';
      add.setAttribute('aria-label', `Add ${c.name} ${hex} to palette`);
      add.addEventListener('click', () => app().addColor(c));
      li.append(chip, text, add);
      els.swatches.append(li);
    });
    els.addAll.hidden = list.length < 2;
    lesson.swatches = list;
  }

  function show(n) {
    n = Math.max(1, Math.min(LAST, n | 0 || 1));
    lesson.step = n;
    saveStep(n);
    const info = STEPS[n];
    els.steps.forEach((el) => { el.checked = +el.value === n; });
    els.prev.disabled = n === 1;
    els.next.disabled = n === LAST;
    els.kicker.textContent = `Step ${n} of ${LAST}`;
    els.title.textContent = info.title;
    els.caption.textContent = `Step ${n} · ${info.title}`;
    els.canvas.setAttribute('aria-label', `Step ${n} of ${LAST}: ${info.title}`);
    els.note.hidden = !(lesson.flat && n <= 3);
    els.legend.hidden = n !== LAST;
    els.newHint.hidden = !els.showNew.checked;
    els.newHint.textContent = NEW_HINTS[n] || `Gray areas haven't changed since step ${n - 1}.`;
    if (!lesson.prep) return;

    const ht = halftoneSplit();
    const K = +app().els.colors.value;
    const cur = get(n, ht, K);
    lesson.rings = n === LAST ? cur.spots : null;
    const { w, h } = lesson.prep;
    let shown = cur.image;
    if (els.showNew.checked) shown = whatsNew(cur.image, n > 1 ? get(n - 1, ht, K).image : flatImage(GROUND), cur.fresh);
    app().paint(els.canvas, shown, w, h);
    // the loupe and palette pick from the step's real colors, even where they are grayed out
    app().state.pixels.lesson = cur.image;
    els.text.textContent = info.text({ K, spots: cur.spots || [] });
    els.settings.textContent = settingsHint(n, ht, K);
    renderSwatches(cur.swatches);
  }

  // Shows the current step, rebuilding it first if the photo changed
  function build() {
    const a = app();
    if (!a || !a.state.source) return;
    if (lesson.source !== a.state.source) prepare(a.state.source);
    show(lesson.step);
  }

  // Draws the accent rings on the overlay: solid for dark accents, dashed for highlights
  function drawRings(g, W, H, unit) {
    if (!lesson.rings || !lesson.prep) return;
    const { w, h } = lesson.prep;
    g.save();
    lesson.rings.forEach((s) => {
      const x = ((s.x + 0.5) / w) * W, y = ((s.y + 0.5) / h) * H;
      const r = Math.max(7 * unit, (s.r / w) * W + 4 * unit);
      g.setLineDash(s.kind === 'light' ? [3.5 * unit, 2.5 * unit] : []);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      g.lineWidth = 3.5 * unit;
      g.stroke();
      g.strokeStyle = s.kind === 'dark' ? '#1ec8ec' : '#ffd21f';
      g.lineWidth = 1.75 * unit;
      g.stroke();
    });
    g.restore();
  }

  // ---- Controls -------------------------------------------------------------

  // Keeps keyboard focus on the step buttons when the one in use is switched off at either end
  function go(n) {
    const from = document.activeElement;
    show(n);
    if (from && from.disabled) (from === els.prev ? els.next : els.prev).focus();
  }

  els.steps.forEach((el) => el.addEventListener('change', () => { if (el.checked) go(+el.value); }));
  els.prev.addEventListener('click', () => go(lesson.step - 1));
  els.next.addEventListener('click', () => go(lesson.step + 1));
  els.noteGo.addEventListener('click', () => {
    go(4);
    els.steps[3].focus();
  });
  els.showNew.addEventListener('change', () => show(lesson.step));
  els.addAll.addEventListener('click', () => {
    let added = 0;
    lesson.swatches.forEach((c) => { if (app().addColor(c, true)) added++; });
    app().toast(added ? `Added ${added} color${added === 1 ? '' : 's'}` : 'Those colors are already in the palette');
  });
  show(lesson.step);

  window.Lesson = {
    build,
    show,
    drawRings,
    get step() { return lesson.step; },
    fileSuffix: () => `step-${lesson.step}-${STEPS[lesson.step].short}`,
  };
})();
