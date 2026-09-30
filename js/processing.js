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
    const lr = SRGB_TO_LIN[r], lg = SRGB_TO_LIN[g], lb = SRGB_TO_LIN[b];
    const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
    const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
    const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883;
    const fx = labF(x), fy = labF(y), fz = labF(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  // Neutral gray (sRGB 0-255) with the given L*
  function grayForL(L) {
    return linToSrgb(lToY(Math.max(0, Math.min(100, L))));
  }

  function lightnessOf(r, g, b) {
    return yToL(0.2126729 * SRGB_TO_LIN[r] + 0.7151522 * SRGB_TO_LIN[g] + 0.072175 * SRGB_TO_LIN[b]);
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
    return [Math.round(t1 / 2.56), Math.round(t2 / 2.56)];
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

    // 3. Each block group gets the average of the original photo's colors
    //    (averaged in linear light so mixes stay true)
    const nb = 3 * K;
    const sr = new Float64Array(nb), sg = new Float64Array(nb), sb = new Float64Array(nb), sc = new Float64Array(nb);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const b = block[i];
      sr[b] += SRGB_TO_LIN[rgba[p]];
      sg[b] += SRGB_TO_LIN[rgba[p + 1]];
      sb[b] += SRGB_TO_LIN[rgba[p + 2]];
      sc[b]++;
    }
    const blockRGB = new Uint8Array(nb * 3);
    const blockColors = [];
    for (let b = 0; b < nb; b++) {
      if (!sc[b]) continue;
      const r = linToSrgb(sr[b] / sc[b]);
      const g = linToSrgb(sg[b] / sc[b]);
      const bb = linToSrgb(sb[b] / sc[b]);
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

  window.Study = {
    prepare,
    process,
    // Thresholds are found on the simplified image so they match what gets split
    autoThresholds: (prep, blurRadius) => autoThresholds(blurred(prep, blurRadius).L),
    histogram,
    lightnessOf,
    grayForL,
  };
})();
