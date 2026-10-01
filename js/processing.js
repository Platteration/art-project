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

  const labFInv = (f) => (f * f * f > EPS ? f * f * f : (116 * f - 16) / KAPPA);

  // Exact inverse of linToLab(), same D65 white. Linear RGB, which can fall outside 0-1.
  function labToLin(L, a, b) {
    const fy = (L + 16) / 116;
    const x = labFInv(fy + a / 500) * 0.95047;
    const y = labFInv(fy);
    const z = labFInv(fy - b / 200) * 1.08883;
    return [
      3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
      -0.969266 * x + 1.8760108 * y + 0.041556 * z,
      0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
  }

  function labToSrgb(L, a, b) {
    return labToLin(L, a, b).map(linToSrgb);
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
      blockRGB, // sRGB of each color group, 3 bytes per label
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
      };
    }

    // The shapes that cost the most: big and far off. Slivers are skipped.
    const top = regions
      .filter((r) => r.share >= 0.003 && r.dE >= 5)
      .sort((a, b) => b.share * b.dE - a.share * a.dE)
      .slice(0, 5);

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
      comp,
      diffImage,
    };
  }

  // ---- Warm / cool map -------------------------------------------------------

  /*
   * Temperature is read along one line through the a*b* plane, from blue-cyan (cool) through
   * gray to orange (warm): warm = Δa* cos(WARM_HUE) + Δb* sin(WARM_HUE), the axis compare() uses
   * for "too warm / too cool". The line across it, at WARM_HUE + 90°, reads redder or yellower: for
   * skin, which sits near the warm axis, that is a turn of hue at the same strength, which the
   * warm axis hardly sees. Both are measured against a skin color, the skin spot, never against
   * gray, so the camera's overall white balance mostly cancels out.
   */
  const COS_W = Math.cos(WARM_HUE), SIN_W = Math.sin(WARM_HUE);
  const DEG = Math.PI / 180;
  // Map colors for each axis, as hue angles for [more, less]: orange / blue-cyan for warmer /
  // cooler, yellow / red for yellower / redder
  const TINT_HUES = { warm: [WARM_HUE, WARM_HUE + Math.PI], hue: [95 * DEG, 22 * DEG] };

  // A light blur of its own, so finding the skin and the smooth map aren't thrown by grain or
  // JPEG color noise even with Simplify off. T is texture: how much L* varies around each pixel,
  // smoothed. Skin is smooth (about 1-3); hair, beards' edges and fabric weave are not (5 and up).
  function softBlurred(prep) {
    if (!prep.softCache) {
      const { w, h } = prep;
      const r = Math.max(1, Math.round(Math.max(w, h) / 300));
      const L = blur(prep.L, w, h, r);
      const sq = new Float32Array(prep.L.length);
      for (let i = 0; i < sq.length; i++) sq[i] = prep.L[i] * prep.L[i];
      const L2 = blur(sq, w, h, r);
      for (let i = 0; i < sq.length; i++) sq[i] = Math.sqrt(Math.max(0, L2[i] - L[i] * L[i]));
      prep.softCache = {
        r,
        L,
        A: blur(prep.A, w, h, r),
        B: blur(prep.B, w, h, r),
        T: blur(sq, w, h, 2 * r),
      };
    }
    return prep.softCache;
  }

  // The strongest tint at a hue angle sRGB can show at each L*, so the map tints a pixel
  // without clipping it lighter or darker. One table per hue, built on first use.
  const tintRoom = new Map();
  function maxTint(L, hue) {
    let room = tintRoom.get(hue);
    if (!room) {
      room = new Float32Array(101);
      const ca = Math.cos(hue), sa = Math.sin(hue);
      for (let l = 0; l <= 100; l++) {
        let lo = 0, hi = 130;
        for (let it = 0; it < 22; it++) {
          const c = (lo + hi) / 2;
          const lin = labToLin(l, c * ca, c * sa);
          if (lin.every((v) => v >= -1e-6 && v <= 1 + 1e-6)) lo = c;
          else hi = c;
        }
        room[l] = lo;
      }
      tintRoom.set(hue, room);
    }
    const l = Math.max(0, Math.min(100, L));
    return Math.min(room[Math.floor(l)], room[Math.ceil(l)]);
  }

  // Skin test used only to find the face when no spot was picked: light enough to read, colored
  // but not vivid, red to yellow (10° to 80° in a*b*), and smooth. Skin of every complexion and
  // most camera grading falls in this; so do walls, wood and sand, which findFace() weighs down.
  function skinLike(soft, i) {
    const L = soft.L[i];
    if (L < 25 || L > 95 || soft.T[i] > 7) return false;
    const a = soft.A[i], b = soft.B[i];
    const c2 = a * a + b * b;
    if (c2 < 64 || c2 > 1296) return false;
    const hue = Math.atan2(b, a);
    return hue > 0.175 && hue < 1.396;
  }

  // Portraits put the face near the middle, a little above centre
  function centreWeight(x, y, w, h) {
    const dx = (x / w - 0.5) / 0.3, dy = (y / h - 0.42) / 0.36;
    return Math.exp(-0.5 * (dx * dx + dy * dy));
  }

  /*
   * Finds the face when no spot was picked. Each connected skin-like area is scored by its size,
   * counting pixels near the middle of the picture and lit pixels (L* 55 and up) fully, and dim
   * or outlying ones less: the face is usually the lit subject, and a wall or curtain behind it is
   * dimmer and spreads to the edges. An area running along the top or sides of the picture is
   * marked down further. Returns the pixel deepest inside the winner, or -1.
   */
  function findFace(soft, w, h) {
    const n = w * h;
    const like = new Uint8Array(n);
    for (let i = 0; i < n; i++) like[i] = skinLike(soft, i) ? 1 : 0;
    const { comp, count } = components(like, w, h);
    const score = new Float64Array(count);
    const edge = new Float64Array(count);
    for (let i = 0; i < n; i++) {
      if (!like[i]) continue;
      const x = i % w, y = (i / w) | 0;
      const lit = Math.max(0, Math.min(1, (soft.L[i] - 25) / 30));
      score[comp[i]] += centreWeight(x, y, w, h) * lit;
      if (x === 0 || x === w - 1 || y === 0) edge[comp[i]]++;
    }
    let best = -1, top = n * 0.0015; // smaller than this is a speck, not a face
    for (let c = 0; c < count; c++) {
      const s = score[c] * Math.max(0.1, 1 - (3 * edge[c]) / (w + 2 * h));
      if (s > top) { top = s; best = c; }
    }
    if (best < 0) return -1;
    for (let i = 0; i < n; i++) like[i] = comp[i] === best ? 1 : 0;
    return deepestPoint(like, w, h);
  }

  // How far a color may stray from the skin spot and still count as the same skin: within
  // HUE_TOL degrees of hue and half the spot's chroma, measured as an ellipse. The warm / cool
  // shifts across a face stay well inside this; red fabric, wood and blue shirts fall outside.
  // A pale spot (a highlight, fair skin) gets at least 8 of chroma and, since hue is looser in
  // pale colors, up to 35° of hue, so the pinker cheeks around it still count.
  const HUE_TOL = 20, CHROMA_TOL = 0.5;

  // Pixels colored like the skin spot, at any lightness. Shadows on skin keep their chroma or
  // gain some, while dark hair and dim walls of the same hue are grayer, so a pixel may be less
  // chromatic than the spot only by the same margin it may be more.
  function skinColored(soft, n, spot) {
    const [L0, a0, b0] = spot;
    const c0 = Math.hypot(a0, b0);
    const h0 = Math.atan2(b0, a0);
    const minL = Math.max(8, 0.25 * L0);
    const hueTol = Math.min(35, HUE_TOL * Math.max(1, 20 / c0));
    const chromaTol = Math.max(8, CHROMA_TOL * c0);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const L = soft.L[i];
      if (L < minL) continue;
      const a = soft.A[i], b = soft.B[i];
      const c = Math.hypot(a, b);
      if (c < 4) continue;
      let dh = Math.atan2(b, a) - h0;
      if (dh > Math.PI) dh -= 2 * Math.PI;
      else if (dh < -Math.PI) dh += 2 * Math.PI;
      dh = (dh * 180) / Math.PI / hueTol;
      const dc = (c - c0) / chromaTol;
      if (dh * dh + dc * dc <= 1) out[i] = 1;
    }
    return out;
  }

  // The pixel deepest inside a mask (farthest from its edge), by a two-pass chamfer distance
  function deepestPoint(mask, w, h) {
    const n = w * h;
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) dist[i] = mask[i] ? 1e9 : 0;
    const D = Math.SQRT2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!dist[i]) continue;
        if (x === 0 || y === 0 || x === w - 1) { dist[i] = 1; continue; }
        dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - w] + 1, dist[i - w - 1] + D, dist[i - w + 1] + D);
      }
    }
    let best = -1, room = 0;
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!dist[i]) continue;
        if (x === w - 1 || y === h - 1 || x === 0) dist[i] = 1;
        else dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + w] + 1, dist[i + w + 1] + D, dist[i + w - 1] + D);
        if (dist[i] > room) { room = dist[i]; best = i; }
      }
    }
    return best;
  }

  /*
   * The skin connected to a seed pixel. First the skin-colored area reachable from the seed
   * without stepping across a sharp value edge (a hairline, the jaw against a dark collar). Then
   * anything textured is taken out: skin is smooth, while hair or a beard of the same color is
   * not. Brows and eyes can cut the smooth skin into pieces (forehead, cheeks, nose), so every
   * piece at least a sixth the size of the seed's own is kept; scraps of hair are smaller. The
   * texture limit is set from the skin around the seed, so a grainy photo or a painting isn't cut
   * to nothing. Small holes (eyes, nostrils) are filled.
   */
  function skinAround(soft, w, h, colored, seed) {
    const n = w * h;
    const { L, T, r } = soft;
    const maxStep = 9 / r; // about a 25 L* step, once blurred
    const reach = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    reach[seed] = 1;
    stack[sp++] = seed;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, l = L[p];
      let q = p - 1;
      if (x > 0 && colored[q] && !reach[q] && Math.abs(L[q] - l) <= maxStep) { reach[q] = 1; stack[sp++] = q; }
      q = p + 1;
      if (x < w - 1 && colored[q] && !reach[q] && Math.abs(L[q] - l) <= maxStep) { reach[q] = 1; stack[sp++] = q; }
      q = p - w;
      if (p >= w && colored[q] && !reach[q] && Math.abs(L[q] - l) <= maxStep) { reach[q] = 1; stack[sp++] = q; }
      q = p + w;
      if (p < n - w && colored[q] && !reach[q] && Math.abs(L[q] - l) <= maxStep) { reach[q] = 1; stack[sp++] = q; }
    }

    // the skin's own texture: the median around the seed
    const sx = seed % w, sy = (seed / w) | 0;
    const near = [];
    for (let y = Math.max(0, sy - 3 * r); y <= Math.min(h - 1, sy + 3 * r); y++) {
      for (let x = Math.max(0, sx - 3 * r); x <= Math.min(w - 1, sx + 3 * r); x++) near.push(T[y * w + x]);
    }
    near.sort((p, q) => p - q);
    const maxTex = Math.max(7, 2.5 * near[near.length >> 1]);
    const smooth = new Uint8Array(n);
    for (let i = 0; i < n; i++) smooth[i] = reach[i] && T[i] <= maxTex ? 1 : 0;

    const { comp, count } = components(smooth, w, h);
    const size = new Float64Array(count);
    for (let i = 0; i < n; i++) if (smooth[i]) size[comp[i]]++;
    // the seed may sit on a freckle or a pore too textured to keep: use the piece nearest it
    let own = smooth[seed] ? comp[seed] : -1;
    for (let d = 1; own < 0 && d <= 6 * r; d++) {
      [[sx - d, sy], [sx + d, sy], [sx, sy - d], [sx, sy + d]].forEach(([x, y]) => {
        if (own < 0 && x >= 0 && y >= 0 && x < w && y < h && smooth[y * w + x]) own = comp[y * w + x];
      });
    }
    const region = new Uint8Array(n);
    if (own < 0) return region;
    const keep = size[own] / 6;
    for (let i = 0; i < n; i++) if (smooth[i] && size[comp[i]] >= keep) region[i] = 1;
    mergeSmallRegions(region, w, h, Math.round(n * 0.0005), 2, 0);
    return region;
  }

  // Median L*, a*, b* of the masked pixels, overall and (if zone is given) in each zone 0-2, from
  // histograms in quarter steps. Temperature shifts across a face are a few a*b* units, finer than
  // the bins dominantColors() sorts colors into, so the measurements use medians instead.
  function skinMedians(soft, mask, zone) {
    const STEP = 4, LB = 401, AB = 1025; // a*, b* from -128 to 128
    const hist = [0, 1, 2, 3].map(() => ({ L: new Uint32Array(LB), A: new Uint32Array(AB), B: new Uint32Array(AB), n: 0 }));
    const clampBin = (v, size) => Math.max(0, Math.min(size - 1, Math.round(v)));
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const l = clampBin(soft.L[i] * STEP, LB), a = clampBin((soft.A[i] + 128) * STEP, AB), b = clampBin((soft.B[i] + 128) * STEP, AB);
      const all = hist[0];
      all.L[l]++; all.A[a]++; all.B[b]++; all.n++;
      if (!zone) continue;
      const g = hist[zone[i] + 1];
      g.L[l]++; g.A[a]++; g.B[b]++; g.n++;
    }
    const median = (arr, count) => {
      let seen = 0;
      for (let k = 0; k < arr.length; k++) {
        seen += arr[k];
        if (seen * 2 >= count) return k;
      }
      return 0;
    };
    return hist.map((g) => g.n && {
      count: g.n,
      lab: [median(g.L, g.n) / STEP, median(g.A, g.n) / STEP - 128, median(g.B, g.n) / STEP - 128],
    });
  }

  // Nearest skin-colored pixel to a picked spot, within a short reach, or -1
  function nearestColored(colored, w, h, x, y) {
    const reach = Math.max(3, Math.round(Math.max(w, h) / 60));
    let best = -1, bd = Infinity;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const px = x + dx, py = y + dy;
        if (px < 0 || py < 0 || px >= w || py >= h || !colored[py * w + px]) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = py * w + px; }
      }
    }
    return best;
  }

  /*
   * The skin to measure: around a picked spot ({ x, y, r, g, b } in working-size pixels), or
   * around the face findFace() picks. Kept on the prep, since it doesn't depend on the value
   * splits or Simplify. The skin is split into its own light, halftone and shadow by three-class
   * Otsu on its lightness: the picture's value masses often put a whole face in one mass, while
   * the form's light and shadow are what the temperature changes across.
   * Returns { spot: Lab or null, seed, skin: mask or null, count, splits: [L, L], parts }, where
   * parts holds the median color and pixel count of the shadow, halftone and light.
   */
  function skinFor(prep, picked) {
    const key = picked ? [picked.x, picked.y, picked.r, picked.g, picked.b].join(',') : 'auto';
    if (prep.skinCache && prep.skinCache.key === key) return prep.skinCache;
    const { w, h } = prep;
    const n = w * h;
    const soft = softBlurred(prep);
    let spot = null, seed = -1;
    if (picked) {
      spot = rgbToLab(picked.r, picked.g, picked.b);
      seed = Math.max(0, Math.min(h - 1, picked.y)) * w + Math.max(0, Math.min(w - 1, picked.x));
    } else {
      seed = findFace(soft, w, h);
      if (seed >= 0) {
        // the face's color, for finding the rest of its skin: the median around its middle
        const r = 4 * soft.r, sx = seed % w, sy = (seed / w) | 0;
        const near = new Uint8Array(n);
        for (let y = Math.max(0, sy - r); y <= Math.min(h - 1, sy + r); y++) {
          near.fill(1, y * w + Math.max(0, sx - r), y * w + Math.min(w, sx + r + 1));
        }
        spot = skinMedians(soft, near, null)[0].lab;
      }
    }
    let skin = null, count = 0;
    if (spot) {
      const colored = skinColored(soft, n, spot);
      if (!colored[seed]) seed = nearestColored(colored, w, h, seed % w, (seed / w) | 0);
      if (seed >= 0) {
        skin = skinAround(soft, w, h, colored, seed);
        for (let i = 0; i < n; i++) count += skin[i];
        // a speck isn't a face: measure nothing rather than the wrong thing
        if (count < n * 0.002) { skin = null; count = 0; }
      }
    }
    let splits = null, parts = null;
    if (skin) {
      const Ls = new Float32Array(count);
      for (let i = 0, k = 0; i < n; i++) if (skin[i]) Ls[k++] = soft.L[i];
      splits = autoThresholds(Ls);
      const part = new Uint8Array(n);
      for (let i = 0; i < n; i++) part[i] = soft.L[i] < splits[0] ? 0 : soft.L[i] < splits[1] ? 1 : 2;
      const med = skinMedians(soft, skin, part);
      parts = med.slice(1);
      // without a picked spot, the zero point is the skin's overall median, so the map shows each
      // part warmer or cooler than the face as a whole
      if (!picked) spot = med[0].lab;
    } else if (!picked) {
      spot = null;
    }
    prep.skinCache = { key, spot, seed: skin ? seed : -1, skin, count, splits, parts };
    return prep.skinCache;
  }

  /*
   * opts: {
   *   spot: { x, y, r, g, b } | null,   // picked skin spot in working-size pixels, or find the face
   *   mode: 'spot' | 'zone',            // compare with the one spot, or each value with the skin's own
   *                                     // light, halftone or shadow
   *   axis: 'warm' | 'hue',             // warmer / cooler, or yellower / redder
   *   gain,                             // exaggeration, 1-5
   *   perBlock,                         // read each color block's color instead of each pixel's
   *   skinOnly,                         // fade everything outside the skin to a pale gray
   *   outlines
   * }
   * The map keeps every pixel's L* exactly and replaces its color with gain x the shift along the
   * axis: on warm, orange where warmer than the spot, blue where cooler, gray where the same.
   */
  function temperatureMap(prep, res, opts) {
    const { w, h } = prep;
    const n = w * h;
    const soft = softBlurred(prep);
    const { spot, seed, skin, count, splits, parts } = skinFor(prep, opts.spot);
    const main = spot || [50, 0, 0];

    // The typical skin in its shadow, halftone and light: medians, as the shifts being measured
    // are finer than the bins dominantColors() sorts colors into
    const masses = [0, 1, 2].map((z) => {
      const m = parts && parts[z];
      if (!m || m.count < Math.max(100, count * 0.04)) return null;
      return Object.assign({ share: m.count / count, lab: m.lab, rgb: labToSrgb(m.lab[0], m.lab[1], m.lab[2]) }, shift(main, m.lab));
    });
    const anchors = [0, 1, 2].map((z) => (opts.mode === 'zone' && masses[z] ? masses[z].lab : main));

    // Where each pixel's color is read: its color block, or the blurred photo
    let srcL = prep.L, srcA, srcB;
    if (opts.perBlock) {
      const bl = [];
      for (let k = 0; k < res.blockRGB.length; k += 3) bl.push(rgbToLab(res.blockRGB[k], res.blockRGB[k + 1], res.blockRGB[k + 2]));
      srcL = new Float32Array(n); srcA = new Float32Array(n); srcB = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const c = bl[res.block[i]];
        srcL[i] = c[0]; srcA[i] = c[1]; srcB[i] = c[2];
      }
    } else {
      // the Simplify blur when it is stronger than the light one, so the map simplifies with the studies
      const bc = prep.blurCache && prep.blurCache.r > soft.r ? prep.blurCache : soft;
      srcA = bc.A; srcB = bc.B;
    }
    // which of the skin's three parts each pixel's value falls in, for comparing like with like
    const zone = new Uint8Array(n);
    if (splits) {
      const zl = opts.perBlock ? srcL : soft.L;
      for (let i = 0; i < n; i++) zone[i] = zl[i] < splits[0] ? 0 : zl[i] < splits[1] ? 1 : 2;
    }

    // Paint
    const hueAxis = opts.axis === 'hue';
    const ax = hueAxis ? -SIN_W : COS_W, ay = hueAxis ? COS_W : SIN_W; // measuring direction
    const [hueUp, hueDown] = TINT_HUES[hueAxis ? 'hue' : 'warm'];
    const tint = [[Math.cos(hueUp), Math.sin(hueUp)], [Math.cos(hueDown), Math.sin(hueDown)]];
    const fade = opts.skinOnly && skin;
    const image = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const an = anchors[zone[i]];
      const L = srcL[i];
      const v = (srcA[i] - an[1]) * ax + (srcB[i] - an[2]) * ay;
      if (fade && !skin[i]) {
        // outside the skin: a pale, flat gray that still shows where things are
        image[p] = image[p + 1] = image[p + 2] = grayForL(62 + L * 0.22);
      } else {
        const up = v >= 0;
        const c = Math.min(60, opts.gain * Math.abs(v), maxTint(L, up ? hueUp : hueDown));
        const t = tint[up ? 0 : 1];
        const lin = labToLin(L, c * t[0], c * t[1]);
        image[p] = linToSrgb(lin[0]);
        image[p + 1] = linToSrgb(lin[1]);
        image[p + 2] = linToSrgb(lin[2]);
      }
      image[p + 3] = 255;
    }
    if (opts.perBlock && opts.outlines) drawOutlines(image, res.block, w, h);
    // the measured skin's edge, so it reads apart from skin that is simply the same as the spot
    if (fade) drawOutlines(image, skin, w, h);

    return {
      image,
      skin,       // 1 where the pixel is part of the measured skin, or null if none was found
      seed,       // the pixel the skin was grown from, or -1
      zone,       // the skin part (0-2) each pixel's value falls in
      srcA, srcB, // the a*, b* each pixel was read from
      anchors,    // Lab each part is compared with
      spot: { lab: main, rgb: labToSrgb(main[0], main[1], main[2]), found: !!spot, picked: !!opts.spot },
      skinShare: count / n,
      splits,     // L* where the skin's shadow meets its halftone, and its halftone its light
      masses,     // shadow, halftone, light: typical skin color, and how it differs from the spot
    };
  }

  // How color b differs from color a: warmth along the warm axis, yellower (+) or redder (-)
  // across it, and chroma
  function shift(a, b) {
    const da = b[1] - a[1], db = b[2] - a[2];
    return {
      warm: da * COS_W + db * SIN_W,
      yellow: db * COS_W - da * SIN_W,
      dChroma: Math.hypot(b[1], b[2]) - Math.hypot(a[1], a[2]),
    };
  }

  // Colors for the map's legend ramp, as sRGB [less, same, more] at a middle value
  function temperatureLegend(axis) {
    const [up, down] = TINT_HUES[axis === 'hue' ? 'hue' : 'warm'];
    const at = (hue) => {
      const c = Math.min(36, maxTint(60, hue));
      return labToSrgb(60, c * Math.cos(hue), c * Math.sin(hue));
    };
    return [at(down), labToSrgb(60, 0, 0), at(up)];
  }

  // What the loupe reads at pixel i of a warm / cool map
  function temperatureAt(map, i) {
    const an = map.anchors[map.zone[i]];
    return Object.assign(shift(an, [0, map.srcA[i], map.srcB[i]]), {
      anchor: labToSrgb(an[0], an[1], an[2]),
      skin: !map.skin || !!map.skin[i],
    });
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
    labOf: rgbToLab,
    grayForL,
    compare,
    applyGains,
    neutralGains,
    deltaE2000,
    DIFF_BINS,
    labToSrgb,
    WARM_HUE,
    temperatureMap,
    temperatureAt,
    temperatureLegend,
  };
})();
