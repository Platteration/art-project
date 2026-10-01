/*
 * Image processing for Portrait Value Studio.
 *
 * Everything works in CIE L*a*b* so "value" means perceived lightness (L*),
 * not a raw RGB average. Munsell-style value on a 0-10 scale is L* / 10.
 *
 * Pipeline:
 *   prepare()  - scale the photo to the working size, convert to Lab
 *   process()  - smooth (simplify: a soft blur or edge-aware), split into three
 *                value zones, clear the gray bands along hard edges, merge small
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

  // The spread (sigma) of blur(r): three box passes of width 2r + 1
  const blurSigma = (r) => Math.sqrt(r * r + r);

  // ---- Edge-aware smoothing --------------------------------------------------

  // How far apart a color step puts two pixels, per L*, as a share of the picture's long side:
  // a 30 L* step, most of the way from shadow to light, is as far as 1% of the picture.
  const EDGE_STEP = 1 / 3000;
  const EDGE_CHROMA = 1;   // how much a*/b* steps count next to L* steps
  const EDGE_ROUNDS = 2;   // guide refinements, see edgeAwareBlur()

  /*
   * Domain transform recursive filter (Gastal and Oliveira 2011). Smooths L, a and b
   * together with a recursive blur along rows, then columns, in which the distance from one
   * pixel to the next is 1 plus k times the guide's color step between them. A flat area is
   * smoothed as much as by blur(), while a step from dark to light is far away, so little
   * crosses it. Three passes, each with half the spread of the last, add up to sigmaS.
   */
  function domainTransform(src, guide, w, h, sigmaS, k) {
    const n = w * h;
    const [gL, gA, gB] = guide;
    const [L, A, B] = src.map((c) => new Float32Array(c));
    const N = 3;
    // Feedback a = exp(-sqrt(2) / sigma), raised to the distance. sigma halves each pass, so
    // each pass's weights are the last pass's squared.
    const lnA = -Math.SQRT2 / ((sigmaS * Math.sqrt(3) * Math.pow(2, N - 1)) / Math.sqrt(Math.pow(4, N) - 1));
    const wx = new Float32Array(n); // weight from the pixel on the left
    const wy = new Float32Array(n); // weight from the pixel above
    for (let i = 0; i < n; i++) {
      if (i % w) {
        const j = i - 1;
        wx[i] = Math.exp(lnA * (1 + k * (Math.abs(gL[i] - gL[j]) + EDGE_CHROMA * (Math.abs(gA[i] - gA[j]) + Math.abs(gB[i] - gB[j])))));
      }
      if (i >= w) {
        const j = i - w;
        wy[i] = Math.exp(lnA * (1 + k * (Math.abs(gL[i] - gL[j]) + EDGE_CHROMA * (Math.abs(gA[i] - gA[j]) + Math.abs(gB[i] - gB[j])))));
      }
    }
    for (let pass = 0; pass < N; pass++) {
      if (pass) {
        for (let i = 0; i < n; i++) { wx[i] *= wx[i]; wy[i] *= wy[i]; }
      }
      // rows, left to right and back
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let i = row + 1; i < row + w; i++) {
          const a = wx[i];
          L[i] += a * (L[i - 1] - L[i]);
          A[i] += a * (A[i - 1] - A[i]);
          B[i] += a * (B[i - 1] - B[i]);
        }
        for (let i = row + w - 2; i >= row; i--) {
          const a = wx[i + 1];
          L[i] += a * (L[i + 1] - L[i]);
          A[i] += a * (A[i + 1] - A[i]);
          B[i] += a * (B[i + 1] - B[i]);
        }
      }
      // columns, top to bottom and back, a whole row at a time
      for (let i = w; i < n; i++) {
        const a = wy[i];
        L[i] += a * (L[i - w] - L[i]);
        A[i] += a * (A[i - w] - A[i]);
        B[i] += a * (B[i - w] - B[i]);
      }
      for (let i = n - w - 1; i >= 0; i--) {
        const a = wy[i + w];
        L[i] += a * (L[i + w] - L[i]);
        A[i] += a * (A[i + w] - A[i]);
        B[i] += a * (B[i + w] - B[i]);
      }
    }
    return [L, A, B];
  }

  /*
   * Flattens detail as much as blur(r) but keeps edges where the photo has them. The guide
   * that tells the filter where the edges are starts as the plain blur, so fine texture the
   * blur removes, such as hair strands, pores and noise, doesn't stop it. Each round filters
   * the photo with the last result as the guide, and the big edges the blur only softened
   * come back sharp (a rolling guidance filter, Zhang et al. 2014).
   */
  function edgeAwareBlur(L, A, B, w, h, r) {
    if (r < 1) return [L, A, B];
    const sigmaS = blurSigma(r);
    // A step costs the same share of the picture at every Simplify, so the more Simplify spreads
    // the smoothing, the bigger a step has to be to hold it back.
    const k = Math.max(w, h) * EDGE_STEP;
    let guide = [blur(L, w, h, r), blur(A, w, h, r), blur(B, w, h, r)];
    for (let round = 0; round < EDGE_ROUNDS; round++) guide = domainTransform([L, A, B], guide, w, h, sigmaS, k);
    return guide;
  }

  // mode: 'soft' (blur) or 'edge' (edgeAwareBlur). The last result is kept on the prep.
  function blurred(prep, r, mode) {
    mode = mode === 'edge' ? 'edge' : 'soft';
    const c = prep.blurCache;
    if (!c || c.r !== r || c.mode !== mode) {
      const { w, h } = prep;
      const [L, A, B] = mode === 'edge'
        ? edgeAwareBlur(prep.L, prep.A, prep.B, w, h, r)
        : [blur(prep.L, w, h, r), blur(prep.A, w, h, r), blur(prep.B, w, h, r)];
      prep.blurCache = { r, mode, L, A, B };
    }
    return prep.blurCache;
  }

  // Lightness with only pixel noise smoothed out, for deciding which side of an edge a pixel is on
  function sharpL(prep) {
    if (!prep.sharpL) prep.sharpL = blur(prep.L, prep.w, prep.h, 1);
    return prep.sharpL;
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

  // Two-pass chamfer distance, in place: every nonzero entry becomes the distance in pixels
  // (diagonal steps count sqrt 2) to the nearest zero entry.
  function chamfer(dist, w, h) {
    const D = Math.SQRT2;
    for (let y = 0; y < h; y++) {
      for (let x = 0, i = y * w; x < w; x++, i++) {
        let d = dist[i], v;
        if (!d) continue;
        if (x > 0 && (v = dist[i - 1] + 1) < d) d = v;
        if (y > 0) {
          const u = i - w;
          if ((v = dist[u] + 1) < d) d = v;
          if (x > 0 && (v = dist[u - 1] + D) < d) d = v;
          if (x < w - 1 && (v = dist[u + 1] + D) < d) d = v;
        }
        dist[i] = d;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1, i = y * w + x; x >= 0; x--, i--) {
        let d = dist[i], v;
        if (!d) continue;
        if (x < w - 1 && (v = dist[i + 1] + 1) < d) d = v;
        if (y < h - 1) {
          const u = i + w;
          if ((v = dist[u] + 1) < d) d = v;
          if (x < w - 1 && (v = dist[u + 1] + D) < d) d = v;
          if (x > 0 && (v = dist[u - 1] + D) < d) d = v;
        }
        dist[i] = d;
      }
    }
  }

  /*
   * Smoothing turns a hard step from shadow straight to light into a ramp, and the split
   * draws the ramp's in-between values as a thin middle band along the edge: a gray outline
   * the photo doesn't have. This finds the thin parts of the middle zone, those no disk of
   * `radius` inside it reaches, that lie between shadow and light, and splits them between
   * the two at the smoothed value halfway between the splits. A pixel whose own lightness
   * (sharpL) is a middle value is a real narrow halftone, such as reflected light along the
   * jaw, and stays, unless shadow and light are both within 2 pixels: then it is the edge.
   */
  function clearEdgeBands(zone, prep, smoothL, t1, t2, radius) {
    const { w, h } = prep;
    const n = w * h;
    const toShadow = new Float32Array(n);
    const toLight = new Float32Array(n);
    const inside = new Float32Array(n); // how deep in the middle zone
    for (let i = 0; i < n; i++) {
      toShadow[i] = zone[i] === 0 ? 0 : 1e9;
      toLight[i] = zone[i] === 2 ? 0 : 1e9;
      inside[i] = zone[i] === 1 ? 1e9 : 0;
    }
    chamfer(toShadow, w, h);
    chamfer(toLight, w, h);
    chamfer(inside, w, h);
    // the thick parts: within `radius` of a pixel deeper than `radius`
    const toCore = inside;
    for (let i = 0; i < n; i++) toCore[i] = inside[i] > radius ? 0 : 1e9;
    chamfer(toCore, w, h);

    const sl = sharpL(prep);
    const mid = (t1 + t2) / 2;
    const near = 2 * radius + 2;
    for (let i = 0; i < n; i++) {
      if (zone[i] !== 1 || toCore[i] <= radius || toShadow[i] > near || toLight[i] > near) continue;
      const l = sl[i];
      if (l >= t1 && l < t2) {
        const x = i % w, y = (i / w) | 0;
        let lo = l, hi = l;
        for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++) {
          for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) {
            const v = sl[yy * w + xx];
            if (v < lo) lo = v;
            else if (v > hi) hi = v;
          }
        }
        if (lo >= t1 || hi < t2) continue;
      }
      zone[i] = smoothL[i] < mid ? 0 : 2;
    }
  }

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
  const EDGE_BAND = 1;      // middle bands thinner than twice this many blur sigmas (+2 px) can be cleared

  /*
   * opts: {
   *   blurRadius, smoothing: 'soft' | 'edge',   // how values are simplified
   *   minSize, t1, t2,                          // shape + value settings (L*)
   *   grayMode: 'average' | 'custom', customL: [L, L, L],
   *   colorsPerZone, outlines
   * }
   */
  function process(prep, opts) {
    const { w, h, rgba } = prep;
    const n = w * h;
    const bl = blurred(prep, opts.blurRadius, opts.smoothing);

    // 1. Three value zones from the simplified lightness
    const zone = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const l = bl.L[i];
      zone[i] = l < opts.t1 ? 0 : l < opts.t2 ? 1 : 2;
    }
    // With Simplify off every pixel is split as it is
    if (opts.blurRadius >= 1) {
      clearEdgeBands(zone, prep, bl.L, opts.t1, opts.t2, EDGE_BAND * blurSigma(opts.blurRadius) + 1);
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
    chamfer(dist, w, h);
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
    autoThresholds: (prep, blurRadius, smoothing) => autoThresholds(blurred(prep, blurRadius, smoothing).L),
    histogram,
    lightnessOf,
    chromaOf,
    grayForL,
    compare,
    applyGains,
    neutralGains,
    deltaE2000,
    DIFF_BINS,
  };
})();
