/*
 * Image processing for Portrait Value Studio.
 *
 * Everything works in CIE L*a*b* so "value" means perceived lightness (L*),
 * not a raw RGB average. Munsell-style value on a 0-10 scale is L* / 10.
 *
 * Pipeline:
 *   prepare()  - scale the photo to the working size, convert to Lab
 *   process()  - blur (simplify), split into three value zones, merge small
 *                shapes, then cluster colors inside each zone into blocks
 */
(function () {
  'use strict';

  // ---- Color conversion -------------------------------------------------

  const SRGB_TO_LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB_TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linToSrgb(v) {
    v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  }

  const EPS = 216 / 24389;
  const KAPPA = 24389 / 27;
  const labF = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

  // Relative luminance Y (0-1) -> L* (0-100)
  function yToL(y) {
    return y > EPS ? 116 * Math.cbrt(y) - 16 : KAPPA * y;
  }

  // L* (0-100) -> relative luminance Y (0-1)
  function lToY(L) {
    return L > 8 ? Math.pow((L + 16) / 116, 3) : L / KAPPA;
  }

  function rgbToLab(r, g, b) {
    return linToLab(SRGB_TO_LIN[r], SRGB_TO_LIN[g], SRGB_TO_LIN[b]);
  }

  function linToLab(lr, lg, lb) {
    const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
    const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
    const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883;
    const fx = labF(x), fy = labF(y), fz = labF(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  // Lab -> linear RGB (may fall outside 0-1 for colors the screen can't show)
  function labToLin(L, a, b) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = (f) => (f > 6 / 29 ? f * f * f : (116 * f - 16) / KAPPA);
    const x = inv(fx) * 0.95047, y = lToY(L), z = inv(fz) * 1.08883;
    return [
      3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
      -0.969266 * x + 1.8760108 * y + 0.041556 * z,
      0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
  }

  // Neutral gray (sRGB 0-255) with the given L*
  function grayForL(L) {
    return linToSrgb(lToY(Math.max(0, Math.min(100, L))));
  }

  function lightnessOf(r, g, b) {
    return yToL(0.2126729 * SRGB_TO_LIN[r] + 0.7151522 * SRGB_TO_LIN[g] + 0.072175 * SRGB_TO_LIN[b]);
  }

  // Chroma C*: how far the color is from gray of the same lightness
  function chromaOf(r, g, b) {
    const lab = rgbToLab(r, g, b);
    return Math.hypot(lab[1], lab[2]);
  }

  // ---- Preparation --------------------------------------------------------

  function prepare(source, maxSide) {
    const sw = source.naturalWidth || source.width;
    const sh = source.naturalHeight || source.height;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    // transparent areas (a cut-out PNG) sit on mid gray, as in alignArt(), instead of reading as black
    ctx.fillStyle = '#7f7f7f';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;

    const n = w * h;
    const L = new Float32Array(n);
    const A = new Float32Array(n);
    const B = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const lab = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
      L[i] = lab[0];
      A[i] = lab[1];
      B[i] = lab[2];
    }
    return { w, h, rgba, L, A, B, blurCache: null };
  }

  // ---- Blur (three box passes approximate a gaussian) ----------------------

  function boxH(src, dst, w, h, r) {
    const d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        dst[row + x] = sum / d;
        sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
  }

  function boxV(src, dst, w, h, r) {
    const d = 2 * r + 1;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum / d;
        sum += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
      }
    }
  }

  function blur(src, w, h, r) {
    if (r < 1) return src;
    const a = new Float32Array(src);
    const b = new Float32Array(src.length);
    for (let pass = 0; pass < 3; pass++) {
      boxH(a, b, w, h, r);
      boxV(b, a, w, h, r);
    }
    return a;
  }

  function blurred(prep, r) {
    if (!prep.blurCache || prep.blurCache.r !== r) {
      prep.blurCache = {
        r,
        L: blur(prep.L, prep.w, prep.h, r),
        A: blur(prep.A, prep.w, prep.h, r),
        B: blur(prep.B, prep.w, prep.h, r),
      };
    }
    return prep.blurCache;
  }

  // ---- Thresholds ---------------------------------------------------------

  // Three-class Otsu on the L* histogram. Returns the two split points in L*.
  function autoThresholds(Ls) {
    const BINS = 256;
    const hist = new Float64Array(BINS);
    for (let i = 0; i < Ls.length; i++) hist[Math.min(BINS - 1, Math.floor(Ls[i] * 2.56))]++;
    const P = new Float64Array(BINS + 1);
    const S = new Float64Array(BINS + 1);
    for (let i = 0; i < BINS; i++) {
      P[i + 1] = P[i] + hist[i];
      S[i + 1] = S[i] + i * hist[i];
    }
    const term = (a, b) => {
      const p = P[b] - P[a];
      if (p <= 0) return 0;
      const s = S[b] - S[a];
      return (s * s) / p;
    };
    let best = -1, t1 = 85, t2 = 170;
    for (let a = 1; a < BINS - 1; a++) {
      const left = term(0, a);
      for (let b = a + 1; b < BINS; b++) {
        const v = left + term(a, b) + term(b, BINS);
        if (v > best) { best = v; t1 = a; t2 = b; }
      }
    }
    // Each class starts at bin a. Put the split mid-way along any empty bins from there, and
    // never below a: rounding down could drop a flat tone into the zone below it.
    const split = (a) => {
      let end = a;
      while (end < BINS - 1 && !hist[end]) end++;
      const lo = Math.ceil(a / 2.56), hi = Math.floor(end / 2.56);
      if (lo > hi) return Math.round(a / 2.56); // no empty gap: a continuous image
      return Math.max(lo, Math.min(hi, Math.round((a + end) / 2 / 2.56)));
    };
    return [split(t1), split(t2)];
  }

  function histogram(Ls, bins) {
    const hist = new Float64Array(bins);
    for (let i = 0; i < Ls.length; i++) hist[Math.min(bins - 1, Math.floor((Ls[i] / 100) * bins))]++;
    return hist;
  }

  // ---- Region cleanup -----------------------------------------------------

  /*
   * Merges connected shapes smaller than minSize pixels into the neighbouring
   * label they share the longest border with. If groupSize is set, a shape may
   * only merge into a label from the same group (floor(label / groupSize)),
   * which keeps color blocks inside their value zone.
   */
  function mergeSmallRegions(lab, w, h, minSize, nLabels, groupSize) {
    if (minSize < 2) return;
    const n = w * h;
    const comp = new Int32Array(n);
    const stack = new Int32Array(n);
    const members = new Int32Array(n);
    const counts = new Float64Array(nLabels);

    for (let pass = 0; pass < 3; pass++) {
      comp.fill(-1);
      let changed = false;
      let cid = 0;
      for (let s = 0; s < n; s++) {
        if (comp[s] !== -1) continue;
        const label = lab[s];
        let sp = 0, m = 0;
        stack[sp++] = s;
        comp[s] = cid;
        while (sp) {
          const p = stack[--sp];
          members[m++] = p;
          const x = p % w;
          if (x > 0 && comp[p - 1] === -1 && lab[p - 1] === label) { comp[p - 1] = cid; stack[sp++] = p - 1; }
          if (x < w - 1 && comp[p + 1] === -1 && lab[p + 1] === label) { comp[p + 1] = cid; stack[sp++] = p + 1; }
          if (p >= w && comp[p - w] === -1 && lab[p - w] === label) { comp[p - w] = cid; stack[sp++] = p - w; }
          if (p < n - w && comp[p + w] === -1 && lab[p + w] === label) { comp[p + w] = cid; stack[sp++] = p + w; }
        }
        cid++;
        if (m >= minSize) continue;

        counts.fill(0);
        for (let i = 0; i < m; i++) {
          const p = members[i];
          const x = p % w;
          if (x > 0 && lab[p - 1] !== label) counts[lab[p - 1]]++;
          if (x < w - 1 && lab[p + 1] !== label) counts[lab[p + 1]]++;
          if (p >= w && lab[p - w] !== label) counts[lab[p - w]]++;
          if (p < n - w && lab[p + w] !== label) counts[lab[p + w]]++;
        }
        const group = groupSize ? Math.floor(label / groupSize) : 0;
        let bestLabel = -1, bestCount = 0;
        for (let l = 0; l < nLabels; l++) {
          if (counts[l] <= bestCount) continue;
          if (groupSize && Math.floor(l / groupSize) !== group) continue;
          bestCount = counts[l];
          bestLabel = l;
        }
        if (bestLabel >= 0) {
          for (let i = 0; i < m; i++) lab[members[i]] = bestLabel;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  // ---- K-means ------------------------------------------------------------

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // pts: flat Float32Array of 3D points. Returns { centers, k }.
  function kmeans(pts, m, k, iters, rng) {
    k = Math.min(k, m);
    const C = new Float32Array(k * 3);
    const d2 = new Float32Array(m).fill(Infinity);

    // k-means++ seeding
    let idx = Math.floor(rng() * m);
    C[0] = pts[idx * 3]; C[1] = pts[idx * 3 + 1]; C[2] = pts[idx * 3 + 2];
    for (let c = 1; c < k; c++) {
      const px = C[(c - 1) * 3], py = C[(c - 1) * 3 + 1], pz = C[(c - 1) * 3 + 2];
      let sum = 0;
      for (let i = 0; i < m; i++) {
        const dx = pts[i * 3] - px, dy = pts[i * 3 + 1] - py, dz = pts[i * 3 + 2] - pz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d2[i]) d2[i] = d;
        sum += d2[i];
      }
      if (sum <= 1e-9) { k = c; break; }
      let t = rng() * sum;
      idx = m - 1;
      for (let i = 0; i < m; i++) {
        t -= d2[i];
        if (t <= 0) { idx = i; break; }
      }
      C[c * 3] = pts[idx * 3]; C[c * 3 + 1] = pts[idx * 3 + 1]; C[c * 3 + 2] = pts[idx * 3 + 2];
    }

    const assign = new Int32Array(m);
    const sums = new Float64Array(k * 3);
    const cnt = new Float64Array(k);
    for (let it = 0; it < iters; it++) {
      sums.fill(0);
      cnt.fill(0);
      for (let i = 0; i < m; i++) {
        const c = nearest(C, k, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
        assign[i] = c;
        sums[c * 3] += pts[i * 3];
        sums[c * 3 + 1] += pts[i * 3 + 1];
        sums[c * 3 + 2] += pts[i * 3 + 2];
        cnt[c]++;
      }
      for (let c = 0; c < k; c++) {
        if (!cnt[c]) continue;
        C[c * 3] = sums[c * 3] / cnt[c];
        C[c * 3 + 1] = sums[c * 3 + 1] / cnt[c];
        C[c * 3 + 2] = sums[c * 3 + 2] / cnt[c];
      }
    }
    return { centers: C, k };
  }

  function nearest(C, k, x, y, z) {
    let best = 0, bd = Infinity;
    for (let c = 0; c < k; c++) {
      const dx = x - C[c * 3], dy = y - C[c * 3 + 1], dz = z - C[c * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ---- Most prominent color ------------------------------------------------

  // Lab bins about 4 L* by 6 a*/b* wide: close enough that colors in one bin read as
  // the same paint, far enough that ordinary photo noise stays in one bin. The a*/b* bins
  // are centred on zero, so a noisy neutral gray stays in one bin instead of four.
  const BIN_L = 4, BIN_AB = 6, AB_BINS = 44, AB_OFFSET = 132 + BIN_AB / 2;

  function binKeys(prep) {
    if (!prep.binKeys) {
      const n = prep.L.length;
      const keys = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const l = Math.min(25, Math.max(0, Math.floor(prep.L[i] / BIN_L)));
        const a = Math.min(AB_BINS - 1, Math.max(0, Math.floor((prep.A[i] + AB_OFFSET) / BIN_AB)));
        const b = Math.min(AB_BINS - 1, Math.max(0, Math.floor((prep.B[i] + AB_OFFSET) / BIN_AB)));
        keys[i] = (l * AB_BINS + a) * AB_BINS + b;
      }
      prep.binKeys = keys;
    }
    return prep.binKeys;
  }

  /*
   * For each label, the color that covers the most pixels, rather than a mix of all of
   * them: the busiest Lab bin wins, and its own pixels are averaged (in linear light)
   * so the result is a color that is really there. A color whose noise straddles a bin
   * edge is split over neighbouring bins, so each bin is scored with its 3 x 3 x 3
   * neighbourhood added to twice its own count. A bin with fewer than half the pixels of
   * its busiest neighbour can't win, so a nearly empty bin between two busy ones doesn't
   * outscore them both. Returns linear RGB per label (lin[l * 3 ...]) and how many pixels
   * each label has.
   */
  function dominantColors(prep, labels, nLabels, mask) {
    const keys = binKeys(prep);
    const rgba = prep.rgba;
    const n = labels.length;
    const SPAN = 65536; // larger than the number of bins
    const counts = new Map();
    const total = new Float64Array(nLabels);
    for (let i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;
      const k = labels[i] * SPAN + keys[i];
      counts.set(k, (counts.get(k) || 0) + 1);
      total[labels[i]]++;
    }
    const best = new Int32Array(nLabels).fill(-1);
    const bestScore = new Float64Array(nLabels);
    counts.forEach((c, k) => {
      const l = Math.floor(k / SPAN);
      const key = k % SPAN;
      const kl = Math.floor(key / (AB_BINS * AB_BINS)), ka = Math.floor(key / AB_BINS) % AB_BINS, kb = key % AB_BINS;
      let score = c, busiest = 0;
      for (let dl = -1; dl <= 1; dl++) {
        if (kl + dl < 0 || kl + dl > 25) continue;
        for (let da = -1; da <= 1; da++) {
          if (ka + da < 0 || ka + da >= AB_BINS) continue;
          for (let db = -1; db <= 1; db++) {
            if (kb + db < 0 || kb + db >= AB_BINS) continue;
            const nc = counts.get(k + (dl * AB_BINS + da) * AB_BINS + db) || 0;
            if (nc > busiest) busiest = nc;
            score += nc;
          }
        }
      }
      // the label's busiest bin always qualifies, so every label gets a winner
      if (2 * c >= busiest && score > bestScore[l]) { bestScore[l] = score; best[l] = key; }
    });
    const lin = new Float64Array(nLabels * 3);
    const m = new Float64Array(nLabels);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (mask && !mask[i]) continue;
      const l = labels[i];
      if (keys[i] !== best[l]) continue;
      lin[l * 3] += SRGB_TO_LIN[rgba[p]];
      lin[l * 3 + 1] += SRGB_TO_LIN[rgba[p + 1]];
      lin[l * 3 + 2] += SRGB_TO_LIN[rgba[p + 2]];
      m[l]++;
    }
    for (let l = 0; l < nLabels; l++) {
      if (!m[l]) continue;
      lin[l * 3] /= m[l]; lin[l * 3 + 1] /= m[l]; lin[l * 3 + 2] /= m[l];
    }
    return { lin, total };
  }

  // ---- Main pass ----------------------------------------------------------

  const CHROMA_WEIGHT = 1.4; // hue/saturation differences count a bit more than lightness inside a zone
  const MAX_SAMPLES = 12000;

  /*
   * opts: {
   *   blurRadius, minSize, t1, t2,              // shape + value settings (L*)
   *   grayMode: 'average' | 'custom', customL: [L, L, L],
   *   colorsPerZone, outlines
   * }
   */
  function process(prep, opts) {
    const { w, h, rgba } = prep;
    const n = w * h;
    const bl = blurred(prep, opts.blurRadius);

    // 1. Three value zones from the simplified lightness
    const zone = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const l = bl.L[i];
      zone[i] = l < opts.t1 ? 0 : l < opts.t2 ? 1 : 2;
    }
    mergeSmallRegions(zone, w, h, opts.minSize, 3, 0);

    const zoneCount = [0, 0, 0];
    const zoneSumL = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      zoneCount[zone[i]]++;
      zoneSumL[zone[i]] += prep.L[i];
    }
    const zoneMeanL = zoneSumL.map((s, z) => (zoneCount[z] ? s / zoneCount[z] : [15, 50, 85][z]));
    const outL = opts.grayMode === 'custom' ? opts.customL : zoneMeanL;
    const zoneGray = outL.map(grayForL);

    const valueImage = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const g = zoneGray[zone[i]];
      valueImage[p] = valueImage[p + 1] = valueImage[p + 2] = g;
      valueImage[p + 3] = 255;
    }

    // 2. Color groups inside each zone
    const K = Math.max(1, opts.colorsPerZone | 0);
    const block = new Uint16Array(n);
    const rng = mulberry32(7);
    for (let z = 0; z < 3; z++) {
      const count = zoneCount[z];
      if (!count) continue;
      const stride = Math.max(1, Math.floor(count / MAX_SAMPLES));
      const pts = new Float32Array(Math.ceil(count / stride) * 3);
      let m = 0, seen = 0;
      for (let i = 0; i < n; i++) {
        if (zone[i] !== z) continue;
        if (seen++ % stride) continue;
        pts[m * 3] = bl.L[i];
        pts[m * 3 + 1] = bl.A[i] * CHROMA_WEIGHT;
        pts[m * 3 + 2] = bl.B[i] * CHROMA_WEIGHT;
        m++;
      }
      const { centers, k } = kmeans(pts, m, K, 12, rng);
      for (let i = 0; i < n; i++) {
        if (zone[i] !== z) continue;
        block[i] = z * K + nearest(centers, k, bl.L[i], bl.A[i] * CHROMA_WEIGHT, bl.B[i] * CHROMA_WEIGHT);
      }
    }
    mergeSmallRegions(block, w, h, opts.minSize, 3 * K, K);

    // 3. Each block group is painted with its most prominent photo color, not a mix
    const nb = 3 * K;
    const dom = dominantColors(prep, block, nb, null);
    const sc = dom.total;
    const blockRGB = new Uint8Array(nb * 3);
    const blockColors = [];
    for (let b = 0; b < nb; b++) {
      if (!sc[b]) continue;
      const r = linToSrgb(dom.lin[b * 3]);
      const g = linToSrgb(dom.lin[b * 3 + 1]);
      const bb = linToSrgb(dom.lin[b * 3 + 2]);
      blockRGB[b * 3] = r; blockRGB[b * 3 + 1] = g; blockRGB[b * 3 + 2] = bb;
      blockColors.push({ r, g, b: bb, zone: Math.floor(b / K), share: sc[b] / n });
    }

    const blockImage = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const b = block[i] * 3;
      blockImage[p] = blockRGB[b];
      blockImage[p + 1] = blockRGB[b + 1];
      blockImage[p + 2] = blockRGB[b + 2];
      blockImage[p + 3] = 255;
    }

    if (opts.outlines) {
      drawOutlines(valueImage, zone, w, h);
      drawOutlines(blockImage, block, w, h);
    }

    return {
      w, h,
      valueImage, blockImage,
      zoneShare: zoneCount.map((c) => c / n),
      zoneL: outL.slice(),
      zoneGray,
      blockColors,
      zone,    // value zone (0-2) per pixel
      block,   // color group per pixel: zone * K + cluster
      K,
    };
  }

  // Darkens pixels on shape borders so the shapes read like a drawing map.
  function drawOutlines(img, lab, w, h) {
    const n = w * h;
    for (let i = 0; i < n; i++) {
      const x = i % w;
      const edge = (x < w - 1 && lab[i + 1] !== lab[i]) || (i < n - w && lab[i + w] !== lab[i]);
      if (!edge) continue;
      const p = i * 4;
      img[p] = img[p] * 0.2 + 20 * 0.8;
      img[p + 1] = img[p + 1] * 0.2 + 18 * 0.8;
      img[p + 2] = img[p + 2] * 0.2 + 22 * 0.8;
    }
  }

  // ---- Comparing a finished painting with the reference ---------------------

  // CIEDE2000 color difference. About 2 is barely visible, 10 is clearly different.
  function deltaE2000(l1, a1, b1, l2, a2, b2) {
    const rad = Math.PI / 180;
    const p7 = (v) => Math.pow(v, 7);
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(p7(Cb) / (p7(Cb) + p7(25))));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = C1p === 0 ? 0 : (Math.atan2(b1, a1p) / rad + 360) % 360;
    const h2p = C2p === 0 ? 0 : (Math.atan2(b2, a2p) / rad + 360) % 360;
    const dLp = l2 - l1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
    const Lbp = (l1 + l2) / 2;
    const Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) > 180) hbp = hbp < 360 ? (hbp + 360) / 2 : (hbp - 360) / 2;
      else hbp /= 2;
    }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
      + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(p7(Cbp) / (p7(Cbp) + p7(25)));
    const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp;
    const Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    return Math.sqrt(
      Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh)
    );
  }

  // Connected shapes of a label map. Returns a component id per pixel.
  function components(lab, w, h) {
    const n = w * h;
    const comp = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    let count = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] !== -1) continue;
      const label = lab[s];
      let sp = 0;
      stack[sp++] = s;
      comp[s] = count;
      while (sp) {
        const p = stack[--sp];
        const x = p % w;
        if (x > 0 && comp[p - 1] === -1 && lab[p - 1] === label) { comp[p - 1] = count; stack[sp++] = p - 1; }
        if (x < w - 1 && comp[p + 1] === -1 && lab[p + 1] === label) { comp[p + 1] = count; stack[sp++] = p + 1; }
        if (p >= w && comp[p - w] === -1 && lab[p - w] === label) { comp[p - w] = count; stack[sp++] = p - w; }
        if (p < n - w && comp[p + w] === -1 && lab[p + w] === label) { comp[p + w] = count; stack[sp++] = p + w; }
      }
      count++;
    }
    return { comp, count };
  }

  // Accuracy map bins, by CIEDE2000 difference. Fills are an ordinal blue ramp.
  const DIFF_BINS = [
    { max: 5, label: 'Close', fill: null },
    { max: 10, label: 'Noticeable', fill: [134, 182, 239] },
    { max: 20, label: 'Off', fill: [42, 120, 214] },
    { max: Infinity, label: 'Far off', fill: [16, 66, 129] },
  ];
  const binFor = (dE) => DIFF_BINS.findIndex((b) => dE < b.max);

  const WARM_HUE = 50 * (Math.PI / 180); // orange-red direction in the a*b* plane
  const warmthOf = (a, b) => a * Math.cos(WARM_HUE) + b * Math.sin(WARM_HUE);

  // ---- Value range ----------------------------------------------------------

  const QUANTILES = 20; // each family's values are kept as 21 quantiles, 5% apart

  /*
   * Where a picture's values sit, read over the reference's three masses so the reference
   * and the painting are measured on the same pixels. Lightness is blurred a little so single
   * noisy pixels can't set the darkest dark. All results are L*: p2 and p98 (the darkest dark
   * and the lightest light, ignoring the last 2% at each end), the median of each mass, the
   * lightest note of the shadow family (90th percentile of the shadow mass) and the darkest
   * note of the light family (10th percentile of the middle and light masses together).
   * `family` holds both families' quantiles and their shares of the covered picture.
   */
  function valueStats(prep, zone, mask) {
    const L = blur(prep.L, prep.w, prep.h, 1);
    const BINS = 200; // half an L* each
    const all = new Float64Array(BINS);
    const per = [new Float64Array(BINS), new Float64Array(BINS), new Float64Array(BINS)];
    let covered = 0;
    for (let i = 0; i < L.length; i++) {
      if (mask && !mask[i]) continue;
      const b = Math.min(BINS - 1, Math.max(0, Math.floor(L[i] * 2)));
      all[b]++;
      per[zone[i]][b]++;
      covered++;
    }
    const lit = per[1].map((c, b) => c + per[2][b]);
    const count = (hist) => hist.reduce((s, c) => s + c, 0);
    // L* below which a share p of the histogram lies, read linearly inside the bin; null if empty
    const pct = (hist, p) => {
      const total = count(hist);
      if (!total) return null;
      let goal = p * total, b = 0;
      while (b < BINS - 1 && goal > hist[b]) goal -= hist[b++];
      return (b + Math.min(1, goal / (hist[b] || 1))) / 2;
    };
    const quantiles = (hist) => (count(hist) ? Array.from({ length: QUANTILES + 1 }, (_, k) => pct(hist, k / QUANTILES)) : null);
    return {
      p2: pct(all, 0.02),
      p98: pct(all, 0.98),
      median: per.map((h) => pct(h, 0.5)),
      shadowP90: pct(per[0], 0.9),
      lightP10: pct(lit, 0.1),
      family: {
        q: [quantiles(per[0]), quantiles(lit)],
        share: [count(per[0]) / (covered || 1), count(lit) / (covered || 1)],
      },
    };
  }

  // ---- Overall shift --------------------------------------------------------

  // Shapes smaller than this don't steer the fit, and below this many shapes it isn't trusted
  const FIT_MIN_SHARE = 0.003, FIT_MIN_SHAPES = 8;
  const huber = (r, delta) => (Math.abs(r) <= delta ? 1 : delta / Math.abs(r));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const family = (r) => (r.zone ? 1 : 0); // 0: the shadow family, 1: the light family (middle and light)

  /*
   * The one overall change that best turns the reference's colors into the painting's,
   * fitted over the shapes' most prominent colors (weighted by area):
   *   L*:    L_art = range * L_ref + offset, a straight line through the values.
   *   a*b*:  a similarity about neutral gray: chroma scaled by sat, hues turned by hueRot,
   *          then everything moved by (ta, tb) times move(r). A painter's bias moves every
   *          color alike (move = 1); a photo under colored light moves light colors more than
   *          dark ones, about in step with L* + 16 (see castMove).
   * Each is weighted least squares, then three more rounds with Huber weights so a few badly
   * painted shapes can't steer it: the fit should explain what most shapes share, and leave
   * the local mistakes behind.
   */
  function fitValues(pts) {
    let range = 1, offset = 0, follows = 0;
    let wt = pts.map((r) => r.share);
    for (let round = 0; round < 4; round++) {
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      pts.forEach((r, i) => {
        const w = wt[i], x = r.refLab[0], y = r.artLab[0];
        sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
      });
      const mx = sx / sw, my = sy / sw;
      const vx = sxx / sw - mx * mx, cxy = sxy / sw - mx * my;
      if (!round) {
        // how closely the painting's values follow the reference's pattern (correlation)
        let syy = 0;
        pts.forEach((r) => { syy += r.share * (r.artLab[0] - my) ** 2; });
        const vy = syy / sw;
        follows = vx > 4 && vy > 4 ? cxy / Math.sqrt(vx * vy) : vx > 4 ? 0 : 1;
      }
      // with almost no spread of values the slope means nothing: keep the range and fit the offset
      range = vx > 4 ? clamp(cxy / vx, 0.5, 1.6) : 1;
      offset = my - range * mx;
      wt = pts.map((r) => r.share * huber(r.artLab[0] - (range * r.refLab[0] + offset), 4));
    }
    return { range, offset, follows };
  }

  const evenMove = () => 1;
  const castMove = (r) => (r.refLab[0] + 16) / 66; // 1 at L* 50

  // Solves a small linear system (Gaussian elimination with pivoting); null if it is singular
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat(b[i]));
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      if (Math.abs(M[p][i]) < 1e-9) return null;
      [M[i], M[p]] = [M[p], M[i]];
      for (let j = i + 1; j < n; j++) {
        const f = M[j][i] / M[i][i];
        for (let k = i; k <= n; k++) M[j][k] -= f * M[i][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i][n];
      for (let k = i + 1; k < n; k++) sum -= M[i][k] * x[k];
      x[i] = sum / M[i][i];
    }
    return x;
  }

  function fitColors(pts, move) {
    let sat = 1, hueRot = 0, ta = 0, tb = 0;
    let wt = pts.map((r) => r.share);
    // a reference that is nearly one color (or gray) can't show a turn or a scale, only a move
    let sw = 0, ma = 0, mb = 0, spread = 0;
    pts.forEach((r) => { sw += r.share; ma += r.share * r.refLab[1]; mb += r.share * r.refLab[2]; });
    pts.forEach((r) => { spread += r.share * ((r.refLab[1] - ma / sw) ** 2 + (r.refLab[2] - mb / sw) ** 2); });
    const turns = spread / sw > 9;
    for (let round = 0; round < 4; round++) {
      // u = c a - s b + ta k,  v = s a + c b + tb k: linear in (c, s, ta, tb)
      if (turns) {
        const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], B = [0, 0, 0, 0];
        pts.forEach((r, i) => {
          const a = r.refLab[1], b = r.refLab[2], k = move(r);
          [[a, -b, k, 0, r.artLab[1]], [b, a, 0, k, r.artLab[2]]].forEach((row) => {
            for (let m = 0; m < 4; m++) {
              B[m] += wt[i] * row[m] * row[4];
              for (let q = 0; q < 4; q++) A[m][q] += wt[i] * row[m] * row[q];
            }
          });
        });
        const x = solve(A, B);
        if (x) {
          sat = clamp(Math.hypot(x[0], x[1]), 0.6, 1.6);
          hueRot = clamp(Math.atan2(x[1], x[0]), -Math.PI / 9, Math.PI / 9);
        }
      }
      // the move, again, for the turn and scale as clamped
      const c = Math.cos(hueRot) * sat, s = Math.sin(hueRot) * sat;
      let kk = 0, ku = 0, kv = 0;
      pts.forEach((r, i) => {
        const k = move(r);
        kk += wt[i] * k * k;
        ku += wt[i] * k * (r.artLab[1] - (c * r.refLab[1] - s * r.refLab[2]));
        kv += wt[i] * k * (r.artLab[2] - (s * r.refLab[1] + c * r.refLab[2]));
      });
      ta = ku / kk;
      tb = kv / kk;
      wt = pts.map((r) => {
        const k = move(r);
        const pa = c * r.refLab[1] - s * r.refLab[2] + ta * k, pb = s * r.refLab[1] + c * r.refLab[2] + tb * k;
        return r.share * huber(Math.hypot(r.artLab[1] - pa, r.artLab[2] - pb), 6);
      });
    }
    return { sat, hueRot, ta, tb, move };
  }

  // The color move of each family on its own (robust mean of the a*b* differences)
  function fitFamilies(pts) {
    const t = [[0, 0], [0, 0]];
    let wt = pts.map((r) => r.share);
    for (let round = 0; round < 4; round++) {
      const sum = [[0, 0, 0], [0, 0, 0]];
      pts.forEach((r, i) => {
        const s = sum[family(r)];
        s[0] += wt[i];
        s[1] += wt[i] * (r.artLab[1] - r.refLab[1]);
        s[2] += wt[i] * (r.artLab[2] - r.refLab[2]);
      });
      sum.forEach((s, f) => { if (s[0]) t[f] = [s[1] / s[0], s[2] / s[0]]; });
      wt = pts.map((r) => {
        const m = t[family(r)];
        return r.share * huber(Math.hypot(r.artLab[1] - r.refLab[1] - m[0], r.artLab[2] - r.refLab[2] - m[1]), 6);
      });
    }
    return t;
  }

  // The a*b* part of a fit as a function of a shape (its reference color and lightness)
  const colorMove = ({ sat, hueRot, ta, tb, move }) => {
    const c = Math.cos(hueRot) * sat, s = Math.sin(hueRot) * sat;
    return (lab) => {
      const k = move({ refLab: lab });
      return [c * lab[1] - s * lab[2] + ta * k, s * lab[1] + c * lab[2] + tb * k];
    };
  };

  /*
   * The overall shift, what it costs, and what is left once it is set aside. Every cost is in
   * points of color accuracy, so the findings can be ranked against each other:
   *   value, color:  what fixing the value part (or the color part) of the shift would win.
   *                  Each is averaged over both orders of fixing, so the two add up to the
   *                  whole shift (relScore - colorScore).
   *   temperature:   what a temperature step between the light and shadow families would win
   *                  on top of the shift.
   *   separation:    the shadow creeping into the light, from the pixels at the edge of each
   *                  family (see separationCost).
   * The color part is fitted twice, moving every color alike and moving light colors more
   * (a photo's color cast), and the closer fit is kept. A temperature step between light and
   * shadow can still pass for one overall change: lights are more saturated than shadows, so
   * "grayer, turned and warmer" moves shadows more than lights. When moving each family on its
   * own fits the colors much better than either, the step is taken to be the painter's (a
   * relationship to fix, which the Relationships score keeps), and the overall color shift is
   * only the average move of the two families. With too few shapes to trust, or a painting
   * whose values don't follow the reference's pattern at all (a blank canvas, another picture),
   * there is no one shift to set aside: it returns { problem: 'few' | 'unrelated' }.
   */
  function overallShift(regions, colorScore, values) {
    const pts = regions.filter((r) => r.ref && r.share >= FIT_MIN_SHARE);
    if (pts.length < FIT_MIN_SHAPES) return { problem: 'few' };
    const { range, offset, follows } = fitValues(pts);
    if (follows < 0.5) return { problem: 'unrelated' };
    const fam = fitFamilies(pts);

    const w = [0, 0];
    pts.forEach((r) => { w[family(r)] += r.share; });
    const both = w[0] > 0 && w[1] > 0;
    const step = both ? warmthOf(fam[0][0], fam[0][1]) - warmthOf(fam[1][0], fam[1][1]) : 0;
    const misfit = (move) => {
      let sum = 0, sw = 0;
      pts.forEach((r) => {
        const p = move(r);
        sum += r.share * Math.hypot(r.artLab[1] - p[0], r.artLab[2] - p[1]);
        sw += r.share;
      });
      return sum / sw;
    };
    const even = fitColors(pts, evenMove), cast = fitColors(pts, castMove);
    const evenAB = colorMove(even), castAB = colorMove(cast);
    const evenMisfit = misfit((r) => evenAB(r.refLab)), castMisfit = misfit((r) => castAB(r.refLab));
    const col = castMisfit < 0.9 * evenMisfit ? cast : even;
    const famAB = (r) => [r.refLab[1] + fam[family(r)][0], r.refLab[2] + fam[family(r)][1]];
    const tempStep = both && Math.abs(step) >= 6 && misfit(famAB) <= 0.65 * Math.min(evenMisfit, castMisfit);
    const mean = both
      ? [0, 1].map((k) => (w[0] * fam[0][k] + w[1] * fam[1][k]) / (w[0] + w[1]))
      : fam[w[0] ? 0 : 1];
    const shift = tempStep ? { sat: 1, hueRot: 0, ta: mean[0], tb: mean[1], move: evenMove } : col;
    const moveAB = colorMove(shift);

    const mapL = (lab) => [clamp(range * lab[0] + offset, 0, 100), lab[1], lab[2]];
    const mapAB = (lab) => [lab[0], ...moveAB(lab)];
    const map = (lab) => [clamp(range * lab[0] + offset, 0, 100), ...moveAB(lab)];
    const scoreWith = (f) => {
      let sum = 0;
      regions.forEach((r) => {
        if (!r.ref) return;
        const p = f(r.refLab, r);
        sum += r.share * Math.max(0, 100 - 2.5 * deltaE2000(p[0], p[1], p[2], r.artLab[0], r.artLab[1], r.artLab[2]));
      });
      return sum;
    };
    const sL = scoreWith(mapL), sAB = scoreWith(mapAB), relScore = scoreWith(map);

    // the temperature step: each family moved by its own leftover warmth less the picture's
    const left = [0, 0];
    let keyShift = 0, warmShift = 0, sw = 0;
    pts.forEach((r) => {
      const p = map(r.refLab);
      left[family(r)] += r.share * (warmthOf(r.artLab[1], r.artLab[2]) - warmthOf(p[1], p[2]));
      keyShift += r.share * (p[0] - r.refLab[0]);
      warmShift += r.share * (warmthOf(p[1], p[2]) - warmthOf(r.refLab[1], r.refLab[2]));
      sw += r.share;
    });
    let temperature = 0;
    if (both) {
      const lm = (left[0] + left[1]) / (w[0] + w[1]);
      const k = [left[0] / w[0] - lm, left[1] / w[1] - lm];
      temperature = Math.max(0, scoreWith((lab, r) => {
        const p = map(lab), d = k[family(r)];
        return [p[0], p[1] + d * Math.cos(WARM_HUE), p[2] + d * Math.sin(WARM_HUE)];
      }) - relScore);
    }
    const warmth = (f, key) => {
      let s = 0;
      pts.forEach((r) => { if (family(r) === f) s += r.share * warmthOf(r[key][1], r[key][2]); });
      return s / w[f];
    };
    const sep = separationCost(values, range, offset);

    return {
      n: pts.length,
      range, offset,
      keyShift: keyShift / sw,
      sat: shift.sat,
      hueRot: (shift.hueRot * 180) / Math.PI,
      warmShift: warmShift / sw,
      cast: shift.move === castMove, // light colors moved more than dark ones, as under colored light
      // shadow-family warmth less light-family warmth, in the reference and in the painting
      tempContrast: both ? [warmth(0, 'refLab') - warmth(1, 'refLab'), warmth(0, 'artLab') - warmth(1, 'artLab')] : null,
      tempStep: tempStep ? step : 0,  // set when the temperature step, not one overall change, explains the colors
      sepCreep: sep.creep,
      relScore,
      points: {
        value: ((sL - colorScore) + (relScore - sAB)) / 2,
        color: ((sAB - colorScore) + (relScore - sL)) / 2,
        temperature,
        separation: sep.points,
      },
      map,
    };
  }

  /*
   * How far the shadow creeps into the light (or pulls away from it) beyond what the overall
   * value line explains. A shape's most prominent color hardly changes when only its edge
   * toward the other family drifts, so this reads the pixels instead: the lightest quarter of
   * the shadow family and the darkest quarter of the light family, quantile by quantile, against
   * where the reference's would land on the line. creep is in L*: positive when the families
   * close in on each other. points treats that quarter of each family as off by its drift
   * (about 0.9 ΔE per L* in these mid values).
   */
  function separationCost(values, range, offset) {
    const r = values.ref.family, a = values.art.family;
    if (!r.q[0] || !r.q[1] || !a.q[0] || !a.q[1]) return { creep: 0, points: 0 };
    const quarter = QUANTILES / 4;
    let up = 0, down = 0;
    for (let k = 0; k <= quarter; k++) {
      up += a.q[0][QUANTILES - k] - (range * r.q[0][QUANTILES - k] + offset);
      down += range * r.q[1][k] + offset - a.q[1][k];
    }
    up /= quarter + 1;
    down /= quarter + 1;
    const creep = (up + down) / 2;
    const points = 2.5 * 0.9 * 0.25 * (r.share[0] * Math.abs(up) + r.share[1] * Math.abs(down)) * (Math.sign(up) === Math.sign(down) ? 1 : 0);
    return { creep, points };
  }

  /*
   * Scores a painting against the reference. Both preps must be the same size.
   * Every shape in the reference's color-block map is compared with the average
   * color the painting has over the same pixels.
   */
  function compare(ref, refRes, art, artRes) {
    const { w, h } = ref;
    const n = w * h;

    // Pixels the painting photo doesn't cover (after moving it) are left out
    const mask = art.mask;
    let covered = 0, sameZone = 0;
    for (let i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;
      covered++;
      if (refRes.zone[i] === artRes.zone[i]) sameZone++;
    }
    covered = covered || 1;

    // Each shape's most prominent color in the reference and in the painting
    const { comp, count } = components(refRes.block, w, h);
    const refDom = dominantColors(ref, comp, count, mask).lin;
    const artDom = dominantColors(art, comp, count, mask).lin;
    const cnt = new Float64Array(count), sx = new Float64Array(count), sy = new Float64Array(count);
    const first = new Int32Array(count);
    for (let i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;
      const c = comp[i];
      if (!cnt[c]) first[c] = i;
      cnt[c]++;
      sx[c] += i % w;
      sy[c] += (i / w) | 0;
    }
    const srgbOf = (lin, c) => ({ r: linToSrgb(lin[c * 3]), g: linToSrgb(lin[c * 3 + 1]), b: linToSrgb(lin[c * 3 + 2]) });

    const regions = new Array(count);
    let colorScore = 0, valueScore = 0;
    for (let c = 0; c < count; c++) {
      const k = cnt[c];
      if (!k) {
        regions[c] = { id: c, share: 0, dE: 0, dL: 0, dC: 0, dWarm: 0, ref: null, art: null, cx: 0, cy: 0, bin: 0, zone: 0, pct: 0 };
        continue;
      }
      const refLab = linToLab(refDom[c * 3], refDom[c * 3 + 1], refDom[c * 3 + 2]);
      const artLab = linToLab(artDom[c * 3], artDom[c * 3 + 1], artDom[c * 3 + 2]);
      const dE = deltaE2000(refLab[0], refLab[1], refLab[2], artLab[0], artLab[1], artLab[2]);
      const share = k / covered;
      const dL = artLab[0] - refLab[0];
      colorScore += share * Math.max(0, 100 - 2.5 * dE);
      valueScore += share * Math.max(0, 100 - 5 * Math.abs(dL));
      regions[c] = {
        id: c,
        share,
        dE,
        dL,
        dC: Math.hypot(artLab[1], artLab[2]) - Math.hypot(refLab[1], refLab[2]),
        dWarm: (artLab[1] - refLab[1]) * Math.cos(WARM_HUE) + (artLab[2] - refLab[2]) * Math.sin(WARM_HUE),
        ref: srgbOf(refDom, c),
        art: srgbOf(artDom, c),
        cx: sx[c] / k,
        cy: sy[c] / k,
        bin: binFor(dE),
        pct: Math.round(Math.max(0, 100 - 2.5 * dE)), // same per-shape score the color accuracy averages
        zone: Math.floor(refRes.block[first[c]] / refRes.K),
        refLab,
        artLab,
      };
    }

    // The shapes that cost the most: big and far off. Slivers are skipped.
    const costliest = (key) => regions
      .filter((r) => r.share >= 0.003 && r[key] >= 5)
      .sort((a, b) => b.share * b[key] - a.share * a[key])
      .slice(0, 5);
    const top = costliest('dE');

    // Both pictures' values, read over the reference's masses on the same covered pixels
    const values = { ref: valueStats(ref, refRes.zone, mask), art: valueStats(art, refRes.zone, mask) };

    // The same list once the overall shift is set aside: each shape is compared with the
    // reference color moved by the shift (what it "should" be in the painting's own key), so
    // what is left are the local mistakes
    const fit = overallShift(regions, colorScore, values);
    const global = fit.problem ? null : fit;
    let topRel = [];
    if (global) {
      regions.forEach((r) => {
        if (!r.ref) { r.dErel = 0; r.pctRel = 0; return; }
        const p = global.map(r.refLab), a = r.artLab;
        const lin = labToLin(p[0], p[1], p[2]);
        r.exp = { r: linToSrgb(lin[0]), g: linToSrgb(lin[1]), b: linToSrgb(lin[2]) };
        r.dErel = deltaE2000(p[0], p[1], p[2], a[0], a[1], a[2]);
        r.pctRel = Math.round(Math.max(0, 100 - 2.5 * r.dErel));
        r.dLrel = a[0] - p[0];
        r.dWarmRel = warmthOf(a[1], a[2]) - warmthOf(p[1], p[2]);
        r.dCrel = Math.hypot(a[1], a[2]) - Math.hypot(p[1], p[2]);
      });
      topRel = costliest('dErel');
      delete global.map;
    }

    // Label spot for each shape: its most interior pixel (largest inscribed circle),
    // found with a two-pass chamfer distance to the shape's edge.
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0, c = comp[i];
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || (mask && !mask[i]) ||
        comp[i - 1] !== c || comp[i + 1] !== c || comp[i - w] !== c || comp[i + w] !== c;
      dist[i] = edge ? 0 : 1e9;
    }
    const D = Math.SQRT2;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!dist[i]) continue;
        dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - w] + 1, dist[i - w - 1] + D, dist[i - w + 1] + D);
      }
    }
    for (let y = h - 2; y > 0; y--) {
      for (let x = w - 2; x > 0; x--) {
        const i = y * w + x;
        if (!dist[i]) continue;
        dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + w] + 1, dist[i + w + 1] + D, dist[i + w - 1] + D);
      }
    }
    regions.forEach((r) => { r.lx = r.cx; r.ly = r.cy; r.room = -1; });
    for (let i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;
      const r = regions[comp[i]];
      if (dist[i] > r.room) { r.room = dist[i]; r.lx = i % w; r.ly = (i / w) | 0; }
    }

    // Accuracy map: the reference's color blocks with shape borders drawn in
    const blockImg = refRes.blockImage;
    const diffImage = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const c = comp[i];
      const x = i % w;
      if (mask && !mask[i]) {
        // not covered: dark diagonal hatching
        const v = ((x + ((i / w) | 0)) % 10) < 3 ? 105 : 78;
        diffImage[p] = diffImage[p + 1] = diffImage[p + 2] = v;
        diffImage[p + 3] = 255;
        continue;
      }
      const edge = (x < w - 1 && comp[i + 1] !== c) || (i < n - w && comp[i + w] !== c);
      const k = edge ? 0.35 : 1;
      diffImage[p] = blockImg[p] * k;
      diffImage[p + 1] = blockImg[p + 1] * k;
      diffImage[p + 2] = blockImg[p + 2] * k;
      diffImage[p + 3] = 255;
    }

    return {
      colorScore: Math.round(colorScore),
      valueScore: Math.round(valueScore),
      shapeMatch: Math.round((sameZone / covered) * 100),
      coverage: covered / n,
      regions,
      top,
      topRel,
      global: global && Object.assign(global, { relScore: Math.round(global.relScore) }),
      fitProblem: fit.problem || '',  // why there is no overall shift: 'few' shapes or an 'unrelated' painting
      values,
      lineup: lineupCheck(ref, art, mask),
      comp,
      diffImage,
    };
  }

  /*
   * Does the painting sit where the reference does? Compares the two pictures' broad light and
   * dark pattern (correlation, which ignores any overall change in value) at their current
   * place and nudged a little in each direction. If a nudge fits clearly better, the photo
   * still needs lining up, and every mass would mix light and shadow at its edges.
   */
  function lineupCheck(ref, art, mask) {
    const { w, h } = ref;
    const cell = Math.max(2, Math.round(Math.max(w, h) / 150));
    const gw = Math.floor(w / cell), gh = Math.floor(h / cell);
    const shrink = (L) => {
      const out = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh);
      for (let y = 0; y < gh * cell; y++) {
        for (let x = 0; x < gw * cell; x++) {
          const i = y * w + x;
          if (mask && !mask[i]) continue;
          const g = ((y / cell) | 0) * gw + ((x / cell) | 0);
          out[g] += L[i];
          cnt[g]++;
        }
      }
      for (let g = 0; g < out.length; g++) out[g] = cnt[g] > cell * cell * 0.9 ? out[g] / cnt[g] : NaN;
      return out;
    };
    const R = shrink(ref.L), A = shrink(art.L);
    const corr = (dx, dy) => {
      let k = 0, sr = 0, sa = 0, srr = 0, saa = 0, sra = 0;
      const m = 3; // leave a margin so every shift compares the same cells
      for (let y = m; y < gh - m; y++) {
        for (let x = m; x < gw - m; x++) {
          const r = R[y * gw + x], a = A[(y + dy) * gw + x + dx];
          if (Number.isNaN(r) || Number.isNaN(a)) continue;
          k++; sr += r; sa += a; srr += r * r; saa += a * a; sra += r * a;
        }
      }
      if (k < 50) return 0;
      const vr = srr - (sr * sr) / k, va = saa - (sa * sa) / k;
      return vr > 0 && va > 0 ? (sra - (sr * sa) / k) / Math.sqrt(vr * va) : 0;
    };
    const here = corr(0, 0);
    let best = here;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) if (dx || dy) best = Math.max(best, corr(dx, dy));
    }
    return { corr: here, gain: best - here };
  }

  // ---- Glare ----------------------------------------------------------------

  /*
   * Shiny white spots where the light bounced off wet paint or varnish into the camera.
   * Candidates are near-white and colorless (L* over 85, C* under 10) or clipped (a channel at
   * 250 or more). They count as glare only as small spots, each under 0.5% of the picture, that
   * stand out from what's around them (on average 12 L* lighter than their blurred
   * surroundings), and only where the reference is clearly darker (by 15 L* or more). So a
   * white collar is too big, and a catchlight or white teeth that the reference has too are
   * kept. The spots grow by 2 px (at the 900 px working size) to take in their soft edges.
   * `cover` limits the search to the part of the picture the painting covers. Returns
   * { mask, count } (1 = glare) or null.
   */
  function glareMask(prep, ref, cover) {
    const { w, h, L, A, B, rgba } = prep;
    const n = w * h;
    const bright = new Uint8Array(n);
    let any = false;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (cover && !cover[i]) continue;
      const clipped = rgba[p] >= 250 || rgba[p + 1] >= 250 || rgba[p + 2] >= 250;
      if (clipped || (L[i] > 85 && A[i] * A[i] + B[i] * B[i] < 100)) { bright[i] = 1; any = true; }
    }
    if (!any) return null;
    const around = blur(L, w, h, Math.max(2, Math.round(Math.max(w, h) / 150)));
    const { comp, count } = components(bright, w, h);
    const size = new Float64Array(count), lift = new Float64Array(count), above = new Float64Array(count);
    for (let i = 0; i < n; i++) {
      if (!bright[i]) continue;
      const c = comp[i];
      size[c]++;
      lift[c] += L[i] - around[i];
      above[c] += L[i] - ref.L[i];
    }
    const maxSize = 0.005 * n;
    const keep = new Uint8Array(count);
    let kept = false;
    for (let c = 0; c < count; c++) {
      if (size[c] && size[c] <= maxSize && lift[c] / size[c] > 12 && above[c] / size[c] >= 15) { keep[c] = 1; kept = true; }
    }
    if (!kept) return null;
    const mask = new Uint8Array(n);
    const grow = Math.max(1, Math.round(Math.max(w, h) / 450));
    let total = 0;
    for (let i = 0; i < n; i++) {
      if (!bright[i] || !keep[comp[i]]) continue;
      const x = i % w;
      for (let dy = -grow; dy <= grow; dy++) {
        const y = ((i / w) | 0) + dy;
        if (y < 0 || y >= h) continue;
        for (let dx = -grow; dx <= grow; dx++) {
          if (x + dx < 0 || x + dx >= w) continue;
          const j = y * w + x + dx;
          if (!mask[j] && (!cover || cover[j])) { mask[j] = 1; total++; }
        }
      }
    }
    return { mask, count: total };
  }

  // ---- White balance -------------------------------------------------------

  // Multiplies each channel in linear light (gains = [r, g, b]).
  function applyGains(rgba, gains) {
    const luts = gains.map((gain) => {
      const t = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) t[i] = linToSrgb(SRGB_TO_LIN[i] * gain);
      return t;
    });
    for (let p = 0; p < rgba.length; p += 4) {
      rgba[p] = luts[0][rgba[p]];
      rgba[p + 1] = luts[1][rgba[p + 1]];
      rgba[p + 2] = luts[2][rgba[p + 2]];
    }
  }

  // Gains that turn the given color neutral gray at the same luminance, or null if it is too dark.
  function neutralGains(r, g, b) {
    const lr = SRGB_TO_LIN[r], lg = SRGB_TO_LIN[g], lb = SRGB_TO_LIN[b];
    if (Math.min(lr, lg, lb) < 0.02) return null;
    const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
    return [y / lr, y / lg, y / lb];
  }

  window.Study = {
    prepare,
    process,
    // Thresholds are found on the simplified image so they match what gets split
    autoThresholds: (prep, blurRadius) => autoThresholds(blurred(prep, blurRadius).L),
    histogram,
    lightnessOf,
    chromaOf,
    grayForL,
    compare,
    valueStats,
    glareMask,
    applyGains,
    neutralGains,
    deltaE2000,
    DIFF_BINS,
    WARM_HUE,
  };
})();
