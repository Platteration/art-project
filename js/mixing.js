/*
 * Mixing recipes for Portrait Value Studio: which of the artist's own paints, in roughly
 * what parts, make a picked color.
 *
 * Averaging RGB predicts paint wrongly (yellow and blue average to gray, not green), so each
 * paint is modelled as a reflectance curve and mixed the way pigments mix:
 *
 *   tube color -> reflectance R   a smooth curve over 38 bands (380-750 nm), built from the
 *                                 color the way spectral.js does it
 *   R -> K/S                      (1 - R)^2 / 2R per band: how much it absorbs for how much it scatters
 *   mix                           K/S = sum(parts * strength * K/S) / sum(parts * strength)
 *   K/S -> R -> XYZ -> L*a*b*     R = 1 + K/S - sqrt(K/S^2 + 2 K/S), seen by the CIE 1931
 *                                 observer under D65
 *
 * That is single-constant Kubelka-Munk. A paint's strength is its tinting strength next to
 * titanium white. When the paint comes with a swatch of 1 part paint to 4 parts white, the
 * strength is fitted so the model's 1 : 4 tint matches that swatch; the weak / normal / strong
 * setting then scales it.
 *
 * Predictions are approximate. A screen color is not a paint's real spectrum, brands differ,
 * and glazes and drying shifts are ignored, so every recipe is a starting mix to adjust by eye.
 */
(function () {
  'use strict';

  // ---- Spectral data --------------------------------------------------------
  /*
   * The seven reflectance curves that build a curve from a color (white, cyan, magenta,
   * yellow, red, green, blue) and the D65-weighted CIE 1931 color matching functions are
   * from spectral.js 3.0.0 by Ronald van Wijnen, rounded to five digits:
   * https://github.com/rvanwijnen/spectral.js
   *
   * MIT License
   *
   * Copyright (c) 2025 Ronald van Wijnen
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  const SIZE = 38;
  const BASE = {
    W: [1.0012, 1.0012, 1.0012, 1.0012, 1.0012, 1.0011, 1.0011, 1.001, 1.0009, 1.0007, 1.0005, 1.0003, 1.0001, .99995, .99982, .99974, .99971, .99973, .9998, .9999, 1, 1.0001, 1.0003, 1.0004, 1.0004, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005, 1.0005],
    C: [.97059, .97059, .97063, .97079, .97137, .97316, .97674, .98159, .98628, .98995, .99249, .99415, .99518, .99576, .99591, .99561, .9946, .99222, .98624, .96794, .89129, .5362, .15411, .057458, .031535, .022263, .018202, .016299, .015366, .014911, .014695, .014596, .014547, .014523, .014512, .014507, .014504, .014504],
    M: [.99067, .99067, .99066, .99062, .99045, .98987, .98829, .98429, .97393, .94182, .81739, .43247, .13845, .053735, .029217, .021314, .020135, .024132, .037224, .076051, .20538, .54127, .81584, .91282, .94634, .95993, .96626, .96933, .97085, .97161, .97196, .97213, .97221, .97225, .97227, .97228, .97228, .97228],
    Y: [.021052, .021056, .021075, .021165, .021503, .022674, .025824, .033488, .051907, .10075, .23913, .5348, .79781, .91145, .9538, .97124, .9793, .98338, .98546, .98644, .98674, .98662, .98628, .98586, .98547, .98518, .98497, .98485, .98478, .98474, .98472, .98471, .98471, .9847, .9847, .9847, .9847, .9847],
    R: [.031561, .031552, .031515, .031332, .030673, .028648, .024645, .019296, .014207, .010294, .0076191, .005898, .0048233, .0042299, .0040599, .0043534, .0053434, .0076917, .013597, .031698, .10786, .46381, .84706, .94319, .96886, .97803, .98204, .98392, .98485, .98529, .98551, .98561, .98565, .98568, .98569, .98569, .9857, .9857],
    G: [.0095561, .0095582, .0095673, .0096129, .0097837, .010379, .012003, .016098, .026706, .059556, .18604, .57058, .86147, .94588, .97047, .97841, .97959, .97553, .96229, .92312, .79343, .45927, .18557, .088177, .054363, .040629, .034222, .031119, .029571, .028811, .028449, .028282, .028199, .028158, .02814, .028131, .028127, .028126],
    B: [.9794, .9794, .97938, .97929, .97896, .97781, .97472, .9672, .94908, .90085, .76315, .46592, .20126, .087752, .045718, .028471, .020527, .01653, .014514, .0136, .01336, .013549, .013959, .014443, .014885, .015225, .015459, .015602, .015682, .015725, .015746, .015756, .015761, .015763, .015764, .015765, .015765, .015765],
  };
  const CMF = [
    [6.4692e-5, 2.1941e-4, .0011206, .0037666, .011881, .023286, .034559, .037224, .032418, .021233, .010491, .0032958, 5.0704e-4, 9.4867e-4, .0062737, .016865, .02869, .042675, .056255, .06947, .083053, .086126, .090466, .085004, .070907, .050629, .035474, .021468, .012516, .0068046, .0034646, .0014976, 7.697e-4, 4.0737e-4, 1.6901e-4, 9.5225e-5, 4.9031e-5, 1.9996e-5],
    [1.8443e-6, 6.2053e-6, 3.101e-5, 1.0475e-4, 3.5364e-4, 9.5147e-4, .0022823, .0042073, .0066888, .0098884, .015249, .021418, .033423, .05131, .070402, .087839, .094249, .097957, .094152, .086781, .078857, .063527, .053741, .042646, .031617, .020885, .01386, .0081026, .0046301, .0024914, .0012593, 5.4165e-4, 2.7795e-4, 1.4711e-4, 6.1033e-5, 3.4387e-5, 1.7706e-5, 7.221e-6],
    [3.0502e-4, .0010368, .0053131, .017954, .057078, .11365, .17336, .19621, .18608, .13995, .089175, .047896, .028146, .016138, .0077591, .0042961, .0020055, 8.6147e-4, 3.6904e-4, 1.9143e-4, 1.4956e-4, 9.2311e-5, 6.8135e-5, 2.8826e-5, 1.5767e-5, 3.9406e-6, 1.584e-6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const [CX, CY, CZ] = CMF.map((row) => Float64Array.from(row));

  // ---- Color conversion -----------------------------------------------------

  const srgbToLin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const linToSrgb = (v) => {
    v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return { r: v >> 16, g: (v >> 8) & 255, b: v & 255 };
  }
  const hex2 = (v) => v.toString(16).padStart(2, '0');
  const rgbToHex = (c) => ('#' + hex2(c.r) + hex2(c.g) + hex2(c.b)).toUpperCase();

  // A smooth reflectance curve with this color: white plus one secondary plus one primary
  function reflectance(c) {
    let r = srgbToLin(c.r), g = srgbToLin(c.g), b = srgbToLin(c.b);
    const w = Math.min(r, g, b);
    r -= w; g -= w; b -= w;
    const cy = Math.min(g, b), ma = Math.min(r, b), ye = Math.min(r, g);
    const re = Math.max(0, Math.min(r - b, r - g));
    const gr = Math.max(0, Math.min(g - b, g - r));
    const bl = Math.max(0, Math.min(b - g, b - r));
    const R = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      R[i] = Math.max(1e-4, Math.min(1,
        w * BASE.W[i] + cy * BASE.C[i] + ma * BASE.M[i] + ye * BASE.Y[i] +
        re * BASE.R[i] + gr * BASE.G[i] + bl * BASE.B[i]));
    }
    return R;
  }

  const ksOf = (R) => ((1 - R) * (1 - R)) / (2 * R);
  const rOf = (ks) => 1 + ks - Math.sqrt(ks * ks + 2 * ks);

  const EPS = 216 / 24389;
  const KAPPA = 24389 / 27;
  const labF = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  function xyzToLab(x, y, z) {
    const fx = labF(x / 0.95047), fy = labF(y), fz = labF(z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function xyzToRgb(x, y, z) {
    return {
      r: linToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
      g: linToSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
      b: linToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
    };
  }
  const rgbToLab = (c) => Study.rgbToLab(c.r, c.g, c.b);
  const deltaE = (p, q) => Study.deltaE2000(p[0], p[1], p[2], q[0], q[1], q[2]);

  // ---- Paints ---------------------------------------------------------------

  /*
   * Preset palettes. Each paint has its tube color (a thick, opaque swatch) and a tint of
   * 1 part paint to 4 parts titanium white, both as they photograph in daylight: typical
   * artist-grade oils, averaged over a few makers' swatches. Brands vary; the strength
   * setting is there for a tube that tints more or less than these.
   */
  const PAINTS = {
    W: { name: 'Titanium White', code: 'W', hex: '#F3F1EA' },
    YO: { name: 'Yellow Ochre', code: 'YO', hex: '#B98A44', tint: '#E8D2A6' },
    CR: { name: 'Cadmium Red Light', code: 'CR', hex: '#D0412C', tint: '#EFA594' },
    IB: { name: 'Ivory Black', code: 'IB', hex: '#1C1E21', tint: '#7B7F86' },
    UB: { name: 'Ultramarine Blue', code: 'UB', hex: '#22285E', tint: '#7D8ACB' },
    CY: { name: 'Cadmium Yellow Light', code: 'CY', hex: '#F0B419', tint: '#F6E39A' },
    AC: { name: 'Alizarin Crimson', code: 'AC', hex: '#5C1A26', tint: '#D98399' },
    BS: { name: 'Burnt Sienna', code: 'BS', hex: '#7A3B24', tint: '#D7A891' },
    RU: { name: 'Raw Umber', code: 'RU', hex: '#3F3428', tint: '#A79D90' },
    LR: { name: 'Light Red', code: 'LR', hex: '#94402F', tint: '#DFA79A' },
  };
  const PRESETS = [
    { id: 'zorn', name: 'Zorn', paints: ['W', 'YO', 'CR', 'IB'] },
    { id: 'zorn-ub', name: 'Zorn + Ultramarine', paints: ['W', 'YO', 'CR', 'IB', 'UB'] },
    { id: 'classic', name: 'Classic portrait oil', paints: ['W', 'CY', 'YO', 'CR', 'AC', 'BS', 'RU', 'UB', 'IB'] },
    { id: 'earth', name: 'Earth palette', paints: ['W', 'YO', 'LR', 'BS', 'RU', 'IB'] },
  ].map((p) => Object.assign(p, { paints: p.paints.map((k) => Object.assign({ strength: 'normal' }, PAINTS[k])) }));

  const STRENGTHS = { weak: 0.5, normal: 1, strong: 2.5 };
  const TINT_WHITE = 4; // a tint swatch is 1 part paint to 4 parts white
  const WHITE_KS = Array.from(reflectance(hexToRgb(PAINTS.W.hex)), ksOf);

  const isWhite = (lab) => lab[0] >= 88 && Math.hypot(lab[1], lab[2]) <= 8;

  // Tinting strength next to titanium white when there is no tint swatch: a fit to the presets'
  // fitted strengths, which barely depend on how light the tube color is (y, 0-1)
  const defaultStrength = (y) => 0.3 * Math.pow(Math.max(y, 1e-4), 0.15);

  function tintLab(ks, t) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < SIZE; i++) {
      const R = rOf((t * ks[i] + TINT_WHITE * WHITE_KS[i]) / (t + TINT_WHITE));
      x += CX[i] * R; y += CY[i] * R; z += CZ[i] * R;
    }
    return xyzToLab(x, y, z);
  }

  // The strength whose 1 : 4 tint with white comes closest to the swatch (golden-section
  // search on log strength, between 1/50 and 50 times white's)
  function fitStrength(ks, swatchLab) {
    const cost = (u) => deltaE(tintLab(ks, Math.exp(u)), swatchLab);
    let a = Math.log(0.02), b = Math.log(50);
    const k = (Math.sqrt(5) - 1) / 2;
    let c = b - k * (b - a), d = a + k * (b - a), fc = cost(c), fd = cost(d);
    for (let it = 0; it < 40; it++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - k * (b - a); fc = cost(c); }
      else { a = c; c = d; fc = fd; d = a + k * (b - a); fd = cost(d); }
    }
    return Math.exp((a + b) / 2);
  }

  /*
   * def: { name, code, hex, tint (optional 1 : 4 swatch), strength: 'weak' | 'normal' | 'strong' }
   * Returns the paint with its K/S curve and strength t, ready to mix.
   */
  function makePaint(def) {
    const rgb = hexToRgb(def.hex) || { r: 128, g: 128, b: 128 };
    const R = reflectance(rgb);
    const ks = Float64Array.from(R, ksOf);
    const lab = rgbToLab(rgb);
    const white = isWhite(lab);
    const tint = def.tint && hexToRgb(def.tint);
    let t;
    if (white) t = 1;
    else if (tint) t = fitStrength(ks, rgbToLab(tint));
    else t = defaultStrength(srgbToLin(rgb.r) * 0.2126 + srgbToLin(rgb.g) * 0.7152 + srgbToLin(rgb.b) * 0.0722);
    t *= STRENGTHS[def.strength] || 1;
    return {
      name: def.name, code: def.code, hex: rgbToHex(rgb), tint: tint ? rgbToHex(tint) : '',
      strength: STRENGTHS[def.strength] ? def.strength : 'normal',
      rgb, lab, white, t, ks, tks: ks.map((v) => v * t),
    };
  }

  // A key that changes whenever anything that affects a recipe does
  const paintsKey = (paints) => paints.map((p) => [p.code, p.hex, p.tint, p.strength].join(':')).join('|');

  // ---- Mixing ---------------------------------------------------------------

  // Mixes paints[idx[j]] in parts[j]. Returns XYZ in out (and Y alone is enough for value).
  function mixXyz(paints, idx, parts, n, out) {
    let den = 0;
    for (let j = 0; j < n; j++) den += parts[j] * paints[idx[j]].t;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < SIZE; i++) {
      let num = 0;
      for (let j = 0; j < n; j++) num += parts[j] * paints[idx[j]].tks[i];
      const R = rOf(num / den);
      x += CX[i] * R; y += CY[i] * R; z += CZ[i] * R;
    }
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  }

  // Public: the predicted color of paints mixed in the given parts (one number per paint)
  function mix(paints, parts) {
    const idx = [], p = [];
    parts.forEach((v, i) => { if (v > 0) { idx.push(i); p.push(v); } });
    if (!idx.length) return null;
    const xyz = mixXyz(paints, idx, p, idx.length, [0, 0, 0]);
    return { rgb: xyzToRgb(xyz[0], xyz[1], xyz[2]), lab: xyzToLab(xyz[0], xyz[1], xyz[2]) };
  }

  // ---- Recipe search --------------------------------------------------------

  const MAX_COLORS = 3;     // paints besides white in one recipe
  const GRID = 10;          // the first pass tries every proportion in tenths
  const WHITE_MAX = 80;     // most white per part of color
  const REFINE = 6;         // paint sets fine-tuned after the first pass
  const MAX_PARTS = 24;     // most whole parts in a written recipe
  const TOUCH = 1 / 15;     // a smaller share of the pile is written as "a touch"
  const SPECK = 1 / 200;    // the least of a paint worth adding: a speck on the knife
  const PER_PAINT = 0.6;    // cost of each paint after the first, in ΔE
  const PER_PART = 0.02;    // cost of each whole part, so simpler recipes win
  const CLOSE = 3, NEAR = 6;

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const sumOf = (list) => { let s = 0; for (let j = 0; j < list.length; j++) s += list[j]; return s; };

  // Every way to split `total` into k positive whole parts
  function compositions(total, k) {
    const out = [];
    const cur = new Array(k);
    (function rec(j, left) {
      if (j === k - 1) { cur[j] = left; out.push(cur.slice()); return; }
      for (let v = 1; v <= left - (k - 1 - j); v++) { cur[j] = v; rec(j + 1, left - v); }
    })(0, total);
    return out;
  }
  const GRIDS = [null, [[1]], compositions(GRID, 2), compositions(GRID, 3)];

  // Subsets of 1 to MAX_COLORS of the given indices
  function subsets(list) {
    const out = [];
    (function rec(start, cur) {
      if (cur.length) out.push(cur.slice());
      if (cur.length === MAX_COLORS) return;
      for (let i = start; i < list.length; i++) { cur.push(list[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  /*
   * Finds a recipe for one color in steps, so a page can spread the work over several frames:
   * call step(ms) until it returns true, then read .result. recipe() runs it all at once.
   *
   *   1. Every set of up to three paints besides white, in every proportion in tenths, alone
   *      and with as much white as brings it to the target's value.
   *   2. The six best sets are fine-tuned, proportions and white together.
   *   3. Each is written out: paints under 1/15 of the pile are touches, kept at their tuned
   *      amount, and the rest become whole parts, trying every size up to 24 parts. The
   *      cheapest wins: ΔE (CIEDE2000) + 0.6 per extra paint + 0.02 per whole part.
   */
  function recipeTask(target, paints) {
    const tLab = rgbToLab(target);
    const tY = tLab[0] > 8 ? Math.pow((tLab[0] + 16) / 116, 3) : tLab[0] / KAPPA;
    const whiteIdx = paints.findIndex((p) => p.white);
    const white = whiteIdx >= 0 ? paints[whiteIdx] : null;
    const colors = paints.map((p, i) => i).filter((i) => i !== whiteIdx);
    const sets = subsets(colors);
    if (white) sets.unshift([whiteIdx]); // white straight from the tube
    let evals = 0;

    // The colors being tried, as summed K/S (num / den), plus white added on top
    const num = new Float64Array(SIZE);
    let den = 0, colorSum = 0;
    function load(set, p) {
      num.fill(0);
      den = 0;
      colorSum = 0;
      for (let j = 0; j < set.length; j++) {
        const paint = paints[set[j]], v = p[j];
        den += v * paint.t;
        colorSum += v;
        const tks = paint.tks;
        for (let i = 0; i < SIZE; i++) num[i] += v * tks[i];
      }
    }
    // The loaded colors with w parts of white per part of color: sets lastY, returns ΔE from the
    // target (or, with yOnly, just the luminance Y)
    let lastY = 0;
    function withWhite(w, yOnly) {
      const wp = white ? w * colorSum : 0;
      const d = den + (wp ? wp * white.t : 0);
      const wks = white && white.tks;
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < SIZE; i++) {
        const R = rOf((wp ? num[i] + wp * wks[i] : num[i]) / d);
        y += CY[i] * R;
        if (!yOnly) { x += CX[i] * R; z += CZ[i] * R; }
      }
      evals++;
      lastY = y;
      return yOnly ? y : deltaE(xyzToLab(x, y, z), tLab);
    }
    const evaluate = (set, p, w) => { load(set, p); return withWhite(w, false); };

    // How much white brings the loaded colors (luminance y0 alone) to the target's value. More
    // white is lighter, smoothly on a log scale of white from 0 to 80 parts, so a false-position
    // search (Illinois) gets there in a few tries.
    const toU = (w) => Math.log(w + 0.05), toW = (u) => Math.exp(u) - 0.05;
    function whiteFor(y0) {
      if (y0 >= tY) return 0;
      let a = toU(0), fa = y0 - tY;
      let b = toU(WHITE_MAX), fb = withWhite(WHITE_MAX, true) - tY;
      if (fb <= 0) return WHITE_MAX;
      let side = 0;
      for (let it = 0; it < 6; it++) {
        const u = (a * fb - b * fa) / (fb - fa);
        const f = withWhite(toW(u), true) - tY;
        if (Math.abs(f) < 0.004 * tY) return toW(u);
        if (f < 0) { a = u; fa = f; if (side === -1) fb /= 2; side = -1; }
        else { b = u; fb = f; if (side === 1) fa /= 2; side = 1; }
      }
      return toW((a + b) / 2);
    }

    const found = []; // the best proportions of each paint set, with and without white
    function firstPass(set) {
      let best = null, bestW = null;
      const canWhiten = white && set[0] !== whiteIdx;
      GRIDS[set.length].forEach((p) => {
        load(set, p);
        const dE = withWhite(0, false);
        if (!best || dE < best.dE) best = { set, p, w: 0, white: false, dE };
        if (!canWhiten) return;
        const w = whiteFor(lastY);
        if (w <= 0) return;
        const dW = withWhite(w, false);
        if (!bestW || dW < bestW.dE) bestW = { set, p, w, white: true, dE: dW };
      });
      found.push(best);
      if (bestW) found.push(bestW);
    }

    // Coordinate descent on the proportions (and white), in shrinking steps
    function fineTune(c) {
      const p = c.p.slice();
      let w = c.w, dE = c.dE;
      const n = p.length + (c.white ? 1 : 0);
      if (n < 2) return c;
      [0.5, 0.2, 0.08, 0.03].forEach((step) => {
        for (let pass = 0; pass < 12; pass++) {
          let moved = false;
          for (let j = 0; j < n; j++) {
            for (const f of [1 + step, 1 / (1 + step)]) {
              const q = p.slice();
              let qw = w;
              if (j < p.length) {
                q[j] *= f;
                if (c.white) qw *= sumOf(p) / sumOf(q); // keep the white the same while a color changes
              } else qw *= f;
              const amounts = c.white ? q.concat(qw * sumOf(q)) : q;
              if (Math.min(...amounts) < SPECK * sumOf(amounts)) continue;
              const d = evaluate(c.set, q, qw);
              if (d < dE - 1e-4) { dE = d; p.splice(0, p.length, ...q); w = qw; moved = true; break; }
            }
          }
          if (!moved) break;
        }
      });
      return { set: c.set, p, w, white: c.white, dE };
    }

    // Whole parts for the main paints, touches kept at their tuned amounts
    function writeOut(c) {
      const ids = c.set.slice(), amounts = c.p.slice();
      if (c.white) { ids.push(whiteIdx); amounts.push(c.w * sumOf(c.p)); }
      const total = sumOf(amounts);
      const touch = amounts.map((a) => ids.length > 1 && a / total < TOUCH);
      const mainSum = sumOf(amounts.filter((a, j) => !touch[j]));
      const colorParts = (parts) => parts.slice(0, c.set.length);
      let best = null;
      for (let size = 1; size <= MAX_PARTS; size++) {
        const parts = amounts.map((a, j) => (touch[j] ? (a / mainSum) * size : Math.round((a / mainSum) * size)));
        const whole = parts.filter((v, j) => !touch[j]);
        if (whole.some((v) => v < 1) || whole.reduce(gcd) > 1) continue; // a gcd > 1 is a smaller size again
        const cp = colorParts(parts);
        const dE = evaluate(c.set, cp, c.white ? parts[parts.length - 1] / sumOf(cp) : 0);
        const cost = dE + PER_PAINT * (ids.length - 1) + PER_PART * sumOf(whole);
        if (!best || cost < best.cost) best = { ids, parts, touch, dE, cost };
      }
      return best;
    }

    let si = 0;
    const task = {
      result: null,
      evals: 0,
      step(ms) {
        if (task.result) return true;
        const end = Date.now() + (ms == null ? Infinity : ms);
        while (si < sets.length) {
          firstPass(sets[si++]);
          if (si < sets.length && Date.now() >= end) { task.evals = evals; return false; }
        }
        const rank = (c) => c.dE + PER_PAINT * (c.set.length + (c.white ? 1 : 0) - 1);
        const top = found.sort((a, b) => rank(a) - rank(b)).slice(0, REFINE);
        let best = null;
        top.forEach((c) => {
          const r = writeOut(fineTune(c));
          if (r && (!best || r.cost < best.cost)) best = r;
        });
        task.result = describe(best);
        task.evals = evals;
        return true;
      },
    };

    // The written recipe, with its predicted color, badge and how it differs from the target
    function describe(r) {
      // white first (a pile of white is easy to darken, the other way round wastes paint), then
      // the biggest parts, then touches
      const items = r.ids.map((id, j) => ({ paint: id, parts: r.parts[j], touch: r.touch[j] }));
      const rank = (it) => (it.touch ? 2 : it.paint === whiteIdx ? 0 : 1);
      items.sort((a, b) => rank(a) - rank(b) || b.parts - a.parts);
      const m = mix(paints, paints.map((p, i) => sumOf(items.filter((it) => it.paint === i).map((it) => it.parts))));
      const dE = deltaE(m.lab, tLab);
      const diff = difference(m.lab, tLab);
      // The right color, only darker (or lighter) than any mix of these paints: a photo's blacks
      // and highlights go further than paint does. That is a value limit, not a color to give up on.
      const limit = dE >= CLOSE && diff.length === 1 ? { lighter: 'dark', darker: 'light' }[diff[0]] || null : null;
      return {
        target: { r: target.r, g: target.g, b: target.b },
        targetLab: tLab,
        items,
        total: sumOf(items.map((it) => it.parts)),
        mix: m.rgb,
        mixLab: m.lab,
        dE,
        status: dE < CLOSE ? 'close' : dE < NEAR ? 'near' : 'far',
        diff,
        limit,
      };
    }

    return task;
  }

  function recipe(target, paints) {
    if (!paints.length) return null;
    const task = recipeTask(target, paints);
    task.step();
    return task.result;
  }

  // How the mix differs from the target, in painters' words: ['grayer', 'lighter'] and so on
  const WARM_HUE = 50 * (Math.PI / 180);
  function difference(mixLab, tLab) {
    const out = [];
    const dL = mixLab[0] - tLab[0];
    const cM = Math.hypot(mixLab[1], mixLab[2]), cT = Math.hypot(tLab[1], tLab[2]);
    const dWarm = (mixLab[1] - tLab[1]) * Math.cos(WARM_HUE) + (mixLab[2] - tLab[2]) * Math.sin(WARM_HUE);
    if (cM - cT <= -4) out.push('grayer');
    else if (cM - cT >= 4) out.push('more saturated');
    if (Math.abs(dWarm) >= 4 && Math.min(cM, cT) >= 4) out.push(dWarm > 0 ? 'warmer' : 'cooler');
    if (Math.abs(dL) >= 3) out.push(dL > 0 ? 'lighter' : 'darker');
    return out;
  }

  // ---- Value strings ----------------------------------------------------------

  /*
   * Five premixes stepping a value at a time around a recipe's mix (V-2 to V+2): white for
   * the lighter steps, and for the darker ones a dark of the darkest paint with a touch of red,
   * so the string darkens without turning green or cold. Each step says how much white or dark
   * to add to how much of the base pile.
   */
  function valueString(base, paints) {
    if (!base) return null;
    const whiteIdx = paints.findIndex((p) => p.white);
    const pile = paints.map((p, i) => base.items.reduce((s, it) => s + (it.paint === i ? it.parts : 0), 0));
    const pileSum = pile.reduce((a, b) => a + b, 0);
    const baseL = base.mixLab[0];

    // The dark: darkest paint, with the red that keeps the base's hue best
    const others = paints.map((p, i) => i).filter((i) => i !== whiteIdx);
    const darkest = others.reduce((a, i) => (a < 0 || paints[i].lab[0] < paints[a].lab[0] ? i : a), -1);
    const reds = others.filter((i) => {
      const lab = paints[i].lab;
      const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
      return i !== darkest && Math.hypot(lab[1], lab[2]) >= 20 && h > -10 && h < 50;
    });

    // Parts of `add` (a parts vector) per part of pile that bring the mix to value L
    const blend = (add, k) => pile.map((v, i) => v / pileSum + k * add[i]);
    const lOf = (add, k) => mix(paints, blend(add, k)).lab[0];
    function amountFor(add, L) {
      const lighter = lOf(add, 0) < L;
      const far = lOf(add, 40);
      if (lighter ? far < L - 0.5 : far > L + 0.5) return null; // out of reach
      let lo = 0, hi = 40;
      for (let it = 0; it < 30; it++) {
        const mid = Math.sqrt((lo + 0.001) * (hi + 0.001)) - 0.001;
        if ((lOf(add, mid) < L) === lighter) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }

    let dark = null;
    if (darkest >= 0) {
      let bestH = Infinity;
      [[1, 0]].concat(reds.length ? [[12, 1], [8, 1], [6, 1], [4, 1], [3, 1]] : []).forEach(([a, b]) => {
        reds.slice(0, b ? reds.length : 1).forEach((red) => {
          const add = paints.map((p, i) => (i === darkest ? a : 0) + (b && i === red ? b : 0));
          const s = a + b;
          const unit = add.map((v) => v / s);
          const k = amountFor(unit, baseL - 10);
          if (k == null) return;
          const lab = mix(paints, blend(unit, k)).lab;
          // stay on the base's hue: distance in a*b* from the base, scaled to the step's chroma
          const cB = Math.hypot(base.mixLab[1], base.mixLab[2]) || 1;
          const scale = Math.hypot(lab[1], lab[2]) / cB;
          const off = Math.hypot(lab[1] - base.mixLab[1] * scale, lab[2] - base.mixLab[2] * scale) + 0.4 * b;
          if (off < bestH) { bestH = off; dark = { unit, parts: b ? [[darkest, a], [red, b]] : [[darkest, 1]] }; }
        });
      });
    }

    const steps = [];
    for (let dv = -2; dv <= 2; dv++) {
      const L = baseL + dv * 10;
      if (dv === 0) {
        steps.push({ dv, L, rgb: base.mix, lab: base.mixLab, add: null, ratio: null });
        continue;
      }
      const add = dv > 0 ? (whiteIdx >= 0 ? paints.map((p, i) => (i === whiteIdx ? 1 : 0)) : null) : dark && dark.unit;
      const k = add && L > 0 && L < 100 ? amountFor(add, L) : null;
      if (k == null) {
        steps.push({ dv, L, rgb: null, lab: null, add: dv > 0 ? 'white' : 'dark', ratio: null });
        continue;
      }
      const m = mix(paints, blend(add, k));
      steps.push({ dv, L: m.lab[0], rgb: m.rgb, lab: m.lab, add: dv > 0 ? 'white' : 'dark', ratio: simpleRatio(k) });
    }
    return { steps, dark: dark ? dark.parts : null, whiteIdx };
  }

  // k parts per part of pile as small whole numbers: [pile, added], such as [3, 1] for 1/3
  function simpleRatio(k) {
    let best = [1, 1], err = Infinity;
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        if (gcd(a, b) !== 1) continue;
        const e = Math.abs(Math.log((b / a) / k)) + 0.012 * (a + b);
        if (e < err) { err = e; best = [a, b]; }
      }
    }
    return best;
  }

  window.Mixing = {
    PRESETS,
    STRENGTHS,
    makePaint,
    paintsKey,
    mix,
    recipe,
    recipeTask,
    valueString,
    hexToRgb,
    rgbToHex,
    TOUCH,
    CLOSE,
    NEAR,
  };
})();
