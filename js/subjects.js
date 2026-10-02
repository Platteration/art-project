/*
 * Generated subjects to paint: simplified portraits and fruit still lifes in the manner of old
 * and modern masters, drawn in code from a seed so each one is the same every time.
 *
 * Each subject is modelled as a relief: every form (head, hair, hat, coat, fruit, jug, cloth,
 * table) is a height field over the picture, so it has surface normals, and one lamp lights the
 * lot. Form shadows, cast shadows (the nose on the cheek, a hat brim on the brow, fruit on the
 * table) and reflected light all come from that light, which is what a value study needs to find.
 */
(function () {
  'use strict';

  // ---- Small tools ------------------------------------------------------------

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const between = (r, a, b) => a + (b - a) * r();
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const gauss = (a, b) => Math.exp(-(a * a + b * b));

  const toLin = (c) => Math.pow(c / 255, 2.2);
  const toSrgb = (v) => 255 * Math.pow(clamp01(v), 1 / 2.2);
  // '#rrggbb' -> linear [r, g, b]
  function lin(h) {
    const v = parseInt(h.slice(1), 16);
    return [toLin(v >> 16), toLin((v >> 8) & 255), toLin(v & 255)];
  }
  const mixLin = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ---- The relief renderer ----------------------------------------------------------

  /*
   * A scene is a depth buffer over the picture. add() rasterises one form: a height function
   * h(x, y) (null outside the form) and its colour (albedo, linear RGB) and shine. The highest
   * form wins each pixel. render() lights the forms and lays them over what is already on the
   * canvas; pixels no form covers keep the painted background.
   */
  function Scene(w, h) {
    const n = w * h;
    this.w = w; this.h = h;
    this.z = new Float32Array(n).fill(-1e9);
    this.nx = new Float32Array(n); this.ny = new Float32Array(n); this.nz = new Float32Array(n);
    this.alb = new Float32Array(n * 3);
    this.spec = new Float32Array(n);
    this.gloss = new Float32Array(n);
  }

  // x0..x1, y0..y1: the form's box. height(x, y) -> number or null. paint(x, y, h, out3) sets
  // the albedo. mat: { spec, gloss }
  Scene.prototype.add = function (x0, y0, x1, y1, height, paint, mat) {
    const { w, h: H } = this;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(w - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
    const bw = x1 - x0 + 3, bh = y1 - y0 + 3;
    // heights on a grid one pixel larger all round, for the normals at the edge
    const hf = new Float32Array(bw * bh).fill(NaN);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const v = height(x0 - 1 + x, y0 - 1 + y);
        if (v !== null) hf[y * bw + x] = v;
      }
    }
    const out = [0, 0, 0];
    for (let y = 1; y < bh - 1; y++) {
      for (let x = 1; x < bw - 1; x++) {
        const k = y * bw + x;
        const z = hf[k];
        if (z !== z) continue;
        const px = x0 - 1 + x, py = y0 - 1 + y;
        if (px < 0 || py < 0 || px >= w || py >= H) continue;
        const i = py * w + px;
        if (z <= this.z[i]) continue;
        const l = hf[k - 1], r = hf[k + 1], u = hf[k - bw], d = hf[k + bw];
        const dx = ((r === r ? r : z) - (l === l ? l : z)) / ((r === r) + (l === l) || 1);
        const dy = ((d === d ? d : z) - (u === u ? u : z)) / ((d === d) + (u === u) || 1);
        // a form's own edge falls away steeply, so its silhouette turns from the light
        const edge = (l !== l) + (r !== r) + (u !== u) + (d !== d);
        let nx = -dx, ny = -dy, nz = edge ? 0.6 : 1;
        if (edge) { nx -= (l !== l) - (r !== r); ny -= (u !== u) - (d !== d); }
        const len = Math.hypot(nx, ny, nz);
        this.z[i] = z;
        this.nx[i] = nx / len; this.ny[i] = ny / len; this.nz[i] = nz / len;
        paint(px, py, z, out);
        this.alb[i * 3] = out[0]; this.alb[i * 3 + 1] = out[1]; this.alb[i * 3 + 2] = out[2];
        this.spec[i] = mat ? mat.spec || 0 : 0;
        this.gloss[i] = mat ? mat.gloss || 12 : 12;
      }
    }
  };

  /*
   * light: { dir: [x, y, z] toward the lamp (y up the picture is negative), key: linear RGB,
   * ambient: linear RGB, bounce: linear RGB from below, shadowSoft: px }
   */
  Scene.prototype.render = function (g, light) {
    const { w, h, z } = this;
    const n = w * h;
    let [lx, ly, lz] = light.dir;
    const ll = Math.hypot(lx, ly, lz);
    lx /= ll; ly /= ll; lz /= ll;
    // cast shadows: march from each pixel toward the lamp over the depth buffer
    const lit = new Float32Array(n);
    const sx = lx / Math.hypot(lx, ly), sy = ly / Math.hypot(lx, ly);
    const rise = lz / Math.hypot(lx, ly);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (z[i] < -1e8) continue;
        let free = 1;
        for (let t = 2; t < 160; t += 1.5) {
          const qx = Math.round(x + sx * t), qy = Math.round(y + sy * t);
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) break;
          if (z[qy * w + qx] > z[i] + 1.5 + t * rise) { free = 0; break; }
        }
        lit[i] = free;
      }
    }
    // soften the shadow edges a little, as paint and the eye do
    const soft = boxBlur(lit, w, h, light.shadowSoft || 2);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const [kr, kg, kb] = light.key, [ar, ag, ab] = light.ambient, [br, bg, bb] = light.bounce || [0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (z[i] < -1e8) continue;
      const nx = this.nx[i], ny = this.ny[i], nz = this.nz[i];
      const dot = nx * lx + ny * ly + nz * lz;
      const lam = Math.max(0, dot) * (lit[i] ? soft[i] : soft[i] * 0.6);
      // ambient is stronger on forms facing the viewer and up; bounce light comes from below
      const amb = 0.55 + 0.45 * nz;
      const up = Math.max(0, ny);
      // the shine: Blinn-Phong toward a viewer straight in front
      let sp = 0;
      if (this.spec[i] && lam > 0) {
        const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz);
        sp = this.spec[i] * Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), this.gloss[i]) * soft[i];
      }
      const a = i * 3;
      d[i * 4] = toSrgb(this.alb[a] * (kr * lam + ar * amb + br * up) + sp * kr);
      d[i * 4 + 1] = toSrgb(this.alb[a + 1] * (kg * lam + ag * amb + bg * up) + sp * kg);
      d[i * 4 + 2] = toSrgb(this.alb[a + 2] * (kb * lam + ab * amb + bb * up) + sp * kb);
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };

  function boxBlur(src, w, h, r) {
    if (r < 1) return src;
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          b[y * w + x] = s / (2 * r + 1);
          s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = s / (2 * r + 1);
          s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
        }
      }
    }
    return a;
  }

  /*
   * An oil-paint look (the Kuwahara filter): each pixel takes the mean colour of whichever of the
   * four squares around it is the most even, so gradients settle into flat strokes while edges
   * between forms stay sharp. Integral images keep it to a few operations per pixel.
   */
  function paintify(img, rad) {
    const { width: w, height: h, data } = img;
    const W1 = w + 1;
    const sum = [0, 1, 2].map(() => new Float64Array(W1 * (h + 1)));
    const sq = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      const rs = [0, 0, 0];
      let rq = 0;
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        let lum = 0;
        for (let c = 0; c < 3; c++) { rs[c] += data[p + c]; lum += data[p + c]; }
        rq += (lum / 3) * (lum / 3);
        const k = (y + 1) * W1 + x + 1, up = y * W1 + x + 1;
        for (let c = 0; c < 3; c++) sum[c][k] = sum[c][up] + rs[c];
        sq[k] = sq[up] + rq;
      }
    }
    const box = (arr, x0, y0, x1, y1) => arr[y1 * W1 + x1] - arr[y0 * W1 + x1] - arr[y1 * W1 + x0] + arr[y0 * W1 + x0];
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = Infinity, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
        for (let q = 0; q < 4; q++) {
          const x0 = Math.max(0, q & 1 ? x : x - rad), x1 = Math.min(w, (q & 1 ? x + rad : x) + 1);
          const y0 = Math.max(0, q & 2 ? y : y - rad), y1 = Math.min(h, (q & 2 ? y + rad : y) + 1);
          const n = (x1 - x0) * (y1 - y0);
          const m = (box(sum[0], x0, y0, x1, y1) + box(sum[1], x0, y0, x1, y1) + box(sum[2], x0, y0, x1, y1)) / (3 * n);
          const v = box(sq, x0, y0, x1, y1) / n - m * m;
          if (v < best) { best = v; bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; }
        }
        const n = (bx1 - bx0) * (by1 - by0), p = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) out[p + c] = box(sum[c], bx0, by0, bx1, by1) / n;
        out[p + 3] = 255;
      }
    }
    data.set(out);
  }

  // Oil-paint strokes, canvas grain, a faint weave and a darkened edge: the painting's surface
  function finish(c, r, vignette, brush) {
    const g = c.getContext('2d');
    const { width: w, height: h } = c;
    const img = g.getImageData(0, 0, w, h);
    paintify(img, brush || 4);
    const d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const x = p % w, y = (p / w) | 0;
      const weave = ((x + y) % 6 < 3 ? 1.2 : -1.2) + ((x - y + 6000) % 6 < 3 ? 0.8 : -0.8);
      const nse = (r() - 0.5) * 8 + weave;
      d[i] += nse; d[i + 1] += nse; d[i + 2] += nse;
    }
    g.putImageData(img, 0, 0);
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${vignette})`);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }

  // A solid colour as an albedo painter
  const flat = (col) => (x, y, z, out) => { out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; };

  // ---- Portraits: a planar head ------------------------------------------------------
  /*
   * A Loomis / Asaro style planar head: the head, neck and shoulders built from flat facets in 3D
   * (forehead, brow, eye sockets, the nose's ridge, sides and underside, cheekbones, muzzle,
   * lips, chin, jaw, ear), turned and tilted, then lit by one lamp. Each facet is filled with a
   * single colour from the painter's palette for how much light it catches, so the result reads
   * like a colour-block study: big flat planes of light, half tone and shadow.
   */

  // Points on the right half of the head, in head units (y up, z toward the viewer). Points on
  // the centre line have x = 0; the left half mirrors the right.
  const P = {
    // centre line
    crown: [0, 0.64, -0.04], vertexBack: [0, 0.52, -0.38], back: [0, 0.16, -0.52], occiput: [0, -0.14, -0.46], nape: [0, -0.4, -0.34],
    hairline: [0, 0.46, 0.43], foreheadMid: [0, 0.3, 0.52], glabella: [0, 0.135, 0.545], nasion: [0, 0.06, 0.515],
    bridge: [0, -0.03, 0.565], tip: [0, -0.165, 0.68], columella: [0, -0.215, 0.61], subnasale: [0, -0.25, 0.565],
    upperLip: [0, -0.325, 0.588], stomion: [0, -0.368, 0.565], lowerLip: [0, -0.41, 0.574], labiomental: [0, -0.46, 0.535],
    chin: [0, -0.52, 0.556], menton: [0, -0.6, 0.45], throat: [0, -0.63, 0.16],
    neckFront: [0, -0.97, 0.18], neckBack: [0, -0.92, -0.3], chestTop: [0, -1.06, 0.24], chest: [0, -1.75, 0.32],
    // right half
    foreheadTop: [0.2, 0.44, 0.405], foreheadSide: [0.22, 0.28, 0.455], templeTop: [0.33, 0.36, 0.22], temple: [0.37, 0.18, 0.2],
    browIn: [0.08, 0.14, 0.525], browMid: [0.18, 0.155, 0.485], browOut: [0.295, 0.12, 0.385],
    lidUpIn: [0.07, 0.055, 0.475], lidUpOut: [0.245, 0.045, 0.405], eye: [0.155, 0.03, 0.47],
    lidLowIn: [0.08, 0.0, 0.475], lidLowOut: [0.235, 0.0, 0.415], orbitLow: [0.17, -0.065, 0.45], orbitOut: [0.305, 0.02, 0.33],
    noseUp: [0.05, 0.0, 0.505], noseLow: [0.06, -0.12, 0.585], tipSide: [0.04, -0.155, 0.645],
    wingTop: [0.09, -0.14, 0.53], wing: [0.105, -0.205, 0.535], nostril: [0.05, -0.215, 0.58],
    cheek: [0.17, -0.12, 0.475], cheekbone: [0.275, -0.06, 0.395], cheekboneSide: [0.355, -0.04, 0.22], zygoma: [0.375, 0.02, 0.08],
    hollow: [0.275, -0.255, 0.335], nasolabial: [0.13, -0.25, 0.505], philtrum: [0.05, -0.29, 0.575],
    lipUp: [0.08, -0.335, 0.553], corner: [0.13, -0.372, 0.49], lipLow: [0.08, -0.412, 0.546],
    chinSide: [0.1, -0.5, 0.505], jawFront: [0.22, -0.49, 0.33], jawAngle: [0.335, -0.385, 0.02], ramus: [0.365, -0.14, 0.05],
    chinUnder: [0.12, -0.6, 0.37], jawUnder: [0.25, -0.53, 0.13],
    earTop: [0.395, 0.07, -0.03], earLow: [0.375, -0.2, -0.03], earBackTop: [0.445, 0.05, -0.17], earBackLow: [0.415, -0.22, -0.16],
    skullTop: [0.28, 0.56, -0.04], skull: [0.43, 0.22, -0.14], backSide: [0.34, 0.31, -0.38], backLow: [0.32, -0.1, -0.39],
    neckTop: [0.25, -0.48, -0.12], neckSide: [0.29, -0.93, -0.04], neckSideBack: [0.24, -0.91, -0.28],
    collarbone: [0.36, -1.0, 0.17], shoulder: [0.76, -1.06, -0.05], shoulderBack: [0.68, -1.06, -0.33],
    chestSide: [0.44, -1.75, 0.24], arm: [0.84, -1.75, -0.1], armBack: [0.76, -1.75, -0.38],
  };

  // Facets, each listed on the right half and mirrored. part: what it is painted as.
  const FACETS = [
    // cranium, under the hair
    ['hair', 'crown', 'skullTop', 'foreheadTop', 'hairline'],
    ['hair', 'crown', 'vertexBack', 'backSide', 'skullTop'],
    ['hair', 'skullTop', 'backSide', 'skull', 'templeTop'],
    ['hair', 'skullTop', 'templeTop', 'foreheadTop'],
    ['hair', 'vertexBack', 'back', 'backLow', 'backSide'],
    ['hair', 'backSide', 'backLow', 'earBackTop', 'skull'],
    ['hair', 'templeTop', 'skull', 'earTop', 'temple'],
    ['hair', 'skull', 'earBackTop', 'earTop'],
    ['hair', 'back', 'occiput', 'backLow'],
    ['hair', 'occiput', 'nape', 'neckTop', 'jawAngle', 'earBackLow', 'backLow'],
    ['hair', 'backLow', 'earBackLow', 'earBackTop'],
    // forehead: front, side and the turn to the temple
    ['skin', 'hairline', 'foreheadTop', 'foreheadSide', 'foreheadMid'],
    ['skin', 'foreheadMid', 'foreheadSide', 'browMid', 'browIn', 'glabella'],
    ['skin', 'foreheadTop', 'templeTop', 'temple', 'browOut', 'foreheadSide'],
    ['skin', 'foreheadSide', 'browOut', 'browMid'],
    // brow, lids and the eye
    ['skin', 'glabella', 'browIn', 'lidUpIn', 'nasion'],
    ['socket', 'browIn', 'browMid', 'browOut', 'lidUpOut', 'lidUpIn'],
    ['eye', 'lidUpIn', 'lidUpOut', 'eye'],
    ['eye', 'lidUpIn', 'eye', 'lidLowIn'],
    ['eye', 'eye', 'lidUpOut', 'lidLowOut'],
    ['eye', 'lidLowIn', 'eye', 'lidLowOut'],
    ['skin', 'lidLowIn', 'lidLowOut', 'orbitLow'],
    ['socket', 'browOut', 'orbitOut', 'lidLowOut', 'lidUpOut'],
    ['skin', 'temple', 'zygoma', 'orbitOut', 'browOut'],
    ['skin', 'temple', 'earTop', 'zygoma'],
    // nose: bridge, ridge, side, wing and underside
    ['skin', 'nasion', 'lidUpIn', 'noseUp', 'bridge'],
    ['skin', 'bridge', 'noseUp', 'noseLow', 'tipSide', 'tip'],
    ['skin', 'lidUpIn', 'lidLowIn', 'wingTop', 'noseLow', 'noseUp'],
    ['skin', 'noseLow', 'wingTop', 'wing', 'tipSide'],
    ['under', 'tip', 'tipSide', 'nostril', 'columella'],
    ['under', 'tipSide', 'wing', 'nostril'],
    ['under', 'columella', 'nostril', 'philtrum', 'subnasale'],
    // cheek
    ['skin', 'lidLowIn', 'orbitLow', 'cheek', 'wingTop'],
    ['skin', 'orbitLow', 'lidLowOut', 'orbitOut', 'cheekbone', 'cheek'],
    ['skin', 'orbitOut', 'zygoma', 'cheekboneSide', 'cheekbone'],
    ['skin', 'cheek', 'cheekbone', 'hollow', 'nasolabial'],
    ['skin', 'cheek', 'nasolabial', 'wing', 'wingTop'],
    ['skin', 'cheekbone', 'cheekboneSide', 'hollow'],
    ['skin', 'cheekboneSide', 'zygoma', 'ramus', 'hollow'],
    // muzzle and mouth
    ['skin', 'wing', 'nasolabial', 'philtrum', 'nostril'],
    ['skin', 'subnasale', 'philtrum', 'lipUp', 'upperLip'],
    ['skin', 'philtrum', 'nasolabial', 'corner', 'lipUp'],
    ['lips', 'upperLip', 'lipUp', 'corner', 'stomion'],
    ['lips', 'stomion', 'corner', 'lipLow', 'lowerLip'],
    ['under', 'lowerLip', 'lipLow', 'chinSide', 'labiomental'],
    ['skin', 'labiomental', 'chinSide', 'chin'],
    ['skin', 'lipLow', 'corner', 'jawFront', 'chinSide'],
    ['skin', 'nasolabial', 'hollow', 'jawFront', 'corner'],
    // jaw, the plane before the ear, and the ear
    ['skin', 'hollow', 'ramus', 'jawAngle', 'jawFront'],
    ['skin', 'zygoma', 'earTop', 'earLow', 'ramus'],
    ['skin', 'ramus', 'earLow', 'jawAngle'],
    ['ear', 'earTop', 'earBackTop', 'earBackLow', 'earLow'],
    // under the chin and jaw
    ['skin', 'chin', 'chinSide', 'chinUnder', 'menton'],
    ['skin', 'chinSide', 'jawFront', 'jawUnder', 'chinUnder'],
    ['neck', 'jawFront', 'jawAngle', 'neckTop', 'jawUnder'],
    ['neck', 'chinUnder', 'jawUnder', 'neckTop', 'throat', 'menton'],
    // neck
    ['neck', 'throat', 'neckTop', 'neckSide', 'neckFront'],
    ['neck', 'neckTop', 'nape', 'neckBack', 'neckSideBack', 'neckSide'],
    // shoulders and chest
    ['collar', 'neckFront', 'neckSide', 'collarbone', 'chestTop'],
    ['clothes', 'neckSide', 'shoulder', 'collarbone'],
    ['clothes', 'neckSide', 'neckSideBack', 'shoulderBack', 'shoulder'],
    ['clothes', 'chestTop', 'collarbone', 'chestSide', 'chest'],
    ['clothes', 'collarbone', 'shoulder', 'arm', 'chestSide'],
    ['clothes', 'shoulder', 'shoulderBack', 'armBack', 'arm'],
  ];

  /*
   * Painters' palettes. Each part has a ramp from the edge of the light to full light, a shadow
   * colour and a reflected-light colour that tints shadow planes facing the bounce. light: the
   * lamp's direction in view space (x right, y up, z toward the viewer).
   */
  const PORTRAIT_STYLES = {
    rembrandt: {
      painter: 'Rembrandt',
      light: [-0.62, 0.55, 0.56], bounce: [0.5, -0.6, 0.4],
      ground: '#1c140c', groundLight: '#33251a',
      skin: { shadow: '#3c2416', reflect: '#5c3521', ramp: ['#6e4229', '#9c6644', '#c48d62', '#deaf82', '#efcda2'] },
      lips: { shadow: '#3e2016', reflect: '#55301f', ramp: ['#6a3a28', '#8e5840', '#ad7254', '#c48a68', '#d49e7c'] },
      eye: { shadow: '#20120b', reflect: '#2e1b11', ramp: ['#3a2216', '#523424', '#6a4632', '#7e5840', '#8e684e'] },
      ear: { shadow: '#3e2216', reflect: '#5a3020', ramp: ['#6e4229', '#9c6444', '#c08660', '#d8a47a', '#e6b88e'] },
      neck: { shadow: '#2e1a10', reflect: '#4a2a1a', ramp: ['#5e3822', '#86583a', '#ac7a54', '#c89670', '#d8ac86'] },
      hair: { shadow: '#140d08', reflect: '#24180f', ramp: ['#2e2016', '#45311f', '#5e4429', '#755636', '#8a6844'] },
      collar: { shadow: '#4a4234', reflect: '#5e5442', ramp: ['#8a8170', '#b0a690', '#d2c9b2', '#e6dfcb', '#f1ebdb'] },
      clothes: { shadow: '#0c0806', reflect: '#140e0a', ramp: ['#18110c', '#221812', '#2e2118', '#3a2a1e', '#463326'] },
    },
    zorn: {
      painter: 'Zorn',
      light: [-0.7, 0.35, 0.62], bounce: [0.6, -0.4, 0.5],
      ground: '#2a2522', groundLight: '#3c3631',
      skin: { shadow: '#5a3226', reflect: '#7a4232', ramp: ['#8a5a44', '#b07a5c', '#cf9a78', '#e6b996', '#f2d2b4'] },
      lips: { shadow: '#5a2a24', reflect: '#76382e', ramp: ['#8a4838', '#aa5c48', '#c0705a', '#d0846c', '#dc9880'] },
      eye: { shadow: '#33201a', reflect: '#462a22', ramp: ['#583a30', '#704c3e', '#86604e', '#98705e', '#a8806c'] },
      ear: { shadow: '#5c2a22', reflect: '#7c3a2e', ramp: ['#94503e', '#b86852', '#d07e66', '#de947a', '#eaa88e'] },
      neck: { shadow: '#4e2c22', reflect: '#6a3a2c', ramp: ['#7a5040', '#9e6e58', '#bc8a70', '#d2a486', '#e0b89c'] },
      hair: { shadow: '#1c1614', reflect: '#2c2420', ramp: ['#382c24', '#4c3c30', '#62503e', '#76624c', '#8a765e'] },
      collar: { shadow: '#5c544c', reflect: '#70675c', ramp: ['#9a9286', '#bab2a4', '#d6cfc2', '#e8e2d6', '#f4efe6'] },
      clothes: { shadow: '#151110', reflect: '#2a1a16', ramp: ['#7a2a22', '#922f24', '#a83a2c', '#bc4a38', '#cc5c48'] },
    },
  };

  const hexRgb = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
  const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  // The colour of a plane: the ramp by how squarely it faces the lamp, or the shadow colour
  // warmed by bounce light for planes turned away
  const SAME = { socket: 'skin', under: 'skin' };

  function planeColor(part, lam, bounce) {
    if (lam <= 0.02) return mixRgb(hexRgb(part.shadow), hexRgb(part.reflect), clamp01(bounce) * 0.9);
    const ramp = part.ramp, t = clamp01(lam) * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(t));
    return mixRgb(hexRgb(ramp[i]), hexRgb(ramp[i + 1]), t - i);
  }

  function drawPortrait(styleId, seed) {
    const s = PORTRAIT_STYLES[styleId];
    const r = rng(seed);
    const W = 600, H = 750;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const side = r() < 0.65 ? 1 : -1;
    const yaw = side * between(r, 0.28, 0.55);              // a three-quarter turn
    const pitch = between(r, -0.1, 0.0);                    // level, or lifted a touch
    const roll = between(r, -0.06, 0.06);
    const lightSide = r() < 0.75 ? -1 : 1;
    const unit = between(r, 255, 275);
    const ox = 300 + between(r, -20, 20), oy = 300 + between(r, -10, 15);

    // background: flat, with a lighter block behind the head on the shadow side, as painters set it
    g.fillStyle = s.ground;
    g.fillRect(0, 0, W, H);
    // a lighter block of background on the face's shadow side, as painters set it to turn the head
    g.fillStyle = s.groundLight;
    g.beginPath();
    const bx = ox - lightSide * between(r, 40, 80);
    g.moveTo(bx, 0);
    g.lineTo(lightSide > 0 ? 0 : W, 0);
    g.lineTo(lightSide > 0 ? 0 : W, H);
    g.lineTo(bx - lightSide * between(r, 60, 140), H);
    g.closePath();
    g.fill();

    // rotate a point: roll, then pitch, then yaw
    const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const turnPoint = ([x, y, z]) => {
      // the shoulders turn less than the head
      return [x, y, z];
    };
    const rot = ([x, y, z], k) => {
      const ya = yaw * k, cY = Math.cos(ya), sY = Math.sin(ya);
      let x1 = x * cr - y * sr, y1 = x * sr + y * cr, z1 = z;
      let y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;
      return [x1 * cY + z2 * sY, y2, -x1 * sY + z2 * cY];
    };
    const point = (name, mirror) => {
      const p = P[name];
      return [mirror ? -p[0] : p[0], p[1], p[2]];
    };
    let L = s.light.slice(); L[0] *= -lightSide === 1 ? 1 : -1;
    L[0] = Math.abs(L[0]) * lightSide;
    const ll = Math.hypot(...L); L = L.map((v) => v / ll);
    let B = s.bounce.slice(); B[0] = -Math.abs(B[0]) * lightSide;
    const bl = Math.hypot(...B); B = B.map((v) => v / bl);

    const polys = [];
    FACETS.forEach(([part, ...names]) => {
      [false, true].forEach((mirror) => {
        const body = part === 'clothes' || part === 'collar';
        const k = body ? 0.45 : part === 'neck' ? 0.75 : 1;     // the body turns less than the head
        const pts = names.map((n) => rot(turnPoint(point(n, mirror)), k));
        // Newell's normal, pointed away from the inside of the form
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          nx += (a[1] - b[1]) * (a[2] + b[2]);
          ny += (a[2] - b[2]) * (a[0] + b[0]);
          nz += (a[0] - b[0]) * (a[1] + b[1]);
        }
        const centre = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]);
        const inside = rot(body ? [0, -1.4, -0.05] : part === 'neck' ? [0, -0.75, -0.08] : [0, 0, 0], k);
        if (nx * (centre[0] - inside[0]) + ny * (centre[1] - inside[1]) + nz * (centre[2] - inside[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        if (nz <= 0.01) return;                       // facing away from the viewer
        const lam = nx * L[0] + ny * L[1] + nz * L[2];
        const bounce = nx * B[0] + ny * B[1] + nz * B[2];
        polys.push({ pts, z: centre[2] + (body ? -0.6 : 0), color: planeColor(s[part] || s[SAME[part]], lam, bounce) });
      });
    });
    polys.sort((a, b) => a.z - b.z);
    g.lineJoin = 'round';
    polys.forEach((p) => {
      g.beginPath();
      p.pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * unit, oy - y * unit) : g.moveTo(ox + x * unit, oy - y * unit)));
      g.closePath();
      g.fillStyle = g.strokeStyle = css(p.color);
      g.lineWidth = 1.2;
      g.fill();
      g.stroke();
    });
    return c;
  }

  // ---- Still lifes ----------------------------------------------------------------

  const STILL_STYLES = {
    dutch: {
      painter: 'Dutch Golden Age',
      wall: ['#3e3a28', '#0c0b08'],
      tableTop: '#6a4a2c', tableFront: '#2a1a0e', cloth: '#ece6d6',
      vessel: 'jug', vesselColor: '#5a3a22',
      light: { dir: [-0.7, -0.62, 0.45], key: [1.2, 1.05, 0.85], ambient: [0.06, 0.055, 0.05], bounce: [0.03, 0.025, 0.02], shadowSoft: 3 },
      vignette: 0.45,
    },
  };

  const FRUITS = {
    apple: { colors: ['#b8321e', '#9aa23a', '#c8642a'], r: [44, 52], squash: 0.9, spec: 0.25, gloss: 30 },
    lemon: { colors: ['#e6c020'], r: [34, 38], squash: 0.8, spec: 0.2, gloss: 22, lemon: true },
    peach: { colors: ['#e08a50'], r: [40, 46], squash: 0.95, spec: 0.05, gloss: 8 },
    orange: { colors: ['#e0701a'], r: [40, 48], squash: 0.95, spec: 0.12, gloss: 14 },
    pear: { colors: ['#b4a03a'], r: [36, 42], squash: 0.9, spec: 0.1, gloss: 14, pear: true },
    plum: { colors: ['#4a2450'], r: [24, 28], squash: 0.9, spec: 0.2, gloss: 26 },
    cherry: { colors: ['#9a1420'], r: [14, 16], squash: 1, spec: 0.5, gloss: 50 },
  };

  function drawStillLife(styleId, seed) {
    const s = STILL_STYLES[styleId];
    const r = rng(seed);
    const W = 750, H = 600;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const L = r() < 0.75 ? 1 : -1;
    const backY = between(r, 300, 330);     // where the table meets the wall
    const frontY = backY + 170;             // the table's front edge
    // depth on the table: 0 at the back, 160 at the front edge
    const tz = (y) => 20 + 160 * clamp01((y - backY) / (frontY - backY));

    // the wall, lit from one side
    g.fillStyle = s.wall[1];
    g.fillRect(0, 0, W, H);
    const gr = g.createRadialGradient(W / 2 - L * 220, 60, 20, W / 2 - L * 120, 150, 560);
    gr.addColorStop(0, s.wall[0]);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);

    const sc = new Scene(W, H);
    // the wall itself as a form, so shadows can fall on it
    sc.add(0, 0, W, backY, () => 0, (x, y, z, out) => {
      const k = 0.35 + 0.65 * clamp01(1 - Math.hypot(x - (W / 2 - L * 200), y - 80) / 620);
      const col = mixLin(lin(s.wall[1]), lin(s.wall[0]), k);
      out[0] = col[0] * 3; out[1] = col[1] * 3; out[2] = col[2] * 3;
    }, {});
    // table top and front edge
    const top = lin(s.tableTop), front = lin(s.tableFront);
    sc.add(0, backY, W, frontY, (x, y) => tz(y), (x, y, z, out) => { out[0] = top[0]; out[1] = top[1]; out[2] = top[2]; }, { spec: 0.05, gloss: 8 });
    sc.add(0, frontY, W, H, (x, y) => 180 - (y - frontY) * 0.05, flat(front), {});

    // a white cloth on one side: lying on the table, then falling over the front edge in folds
    const clothC = lin(s.cloth);
    const cx0 = L > 0 ? between(r, 10, 50) : W - between(r, 10, 50) - 300, cx1 = cx0 + 300;
    const ph = [between(r, 0, 6), between(r, 0, 6)];
    sc.add(cx0, backY + 50, cx1, H, (x, y) => {
      const k = (x - cx0) / (cx1 - cx0);
      // the far edge is a soft curve; below the table edge the cloth narrows a little as it hangs
      if (y < backY + 50 + 18 * Math.sin(k * Math.PI)) return null;
      const inset = y > frontY ? (y - frontY) * 0.08 : 0;
      if (x < cx0 + inset || x > cx1 - inset) return null;
      if (y <= frontY) return tz(y) + 4 + 3 * Math.sin(k * 9 + ph[0]) * smooth(backY + 60, frontY, y);
      // hanging folds: a few broad ones, deepening as the cloth falls
      const hang = smooth(frontY, frontY + 60, y);
      return 196 + hang * (8 * Math.sin(k * Math.PI * 3.5 + ph[0]) + 3 * Math.sin(k * Math.PI * 8 + ph[1]));
    }, flat(clothC), { spec: 0.03, gloss: 6 });

    // a stoneware jug standing at the back
    const jx = W / 2 + L * between(r, 90, 140), jBase = backY + 55, jTop = jBase - 230;
    const jugC = lin(s.vesselColor);
    const profile = (y) => {
      const t = (jBase - y) / (jBase - jTop);     // 0 at the foot, 1 at the lip
      if (t < 0 || t > 1) return 0;
      return 48 + 30 * Math.sin(Math.PI * clamp01(t / 0.7)) * (t < 0.7 ? 1 : 0) + (t > 0.7 ? 22 + 10 * smooth(0.85, 1, t) - 26 * (t - 0.7) : 0);
    };
    sc.add(jx - 90, jTop, jx + 90, jBase, (x, y) => {
      const rad = profile(y);
      const u = (x - jx) / rad;
      if (!rad || Math.abs(u) >= 1) return null;
      return tz(jBase) + 60 + rad * Math.sqrt(1 - u * u);
    }, (x, y, z, out) => {
      const t = (jBase - y) / (jBase - jTop);
      const col = t > 0.62 && t < 0.66 ? mixLin(jugC, lin('#c8b896'), 0.6) : jugC;   // a pale band
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
    }, { spec: 0.6, gloss: 40 });
    // its handle
    sc.add(jx - L * 130, jTop + 30, jx + L * 130, jBase - 60, (x, y) => {
      const hx = jx - L * 70, hy = jTop + 110;
      const d = Math.hypot((x - hx) / 1.1, y - hy);
      const ring = Math.abs(d - 52);
      if (ring > 9 || (x - jx) * -L < 40) return null;
      return tz(jBase) + 70 + 9 * Math.sqrt(1 - (ring / 9) ** 2);
    }, flat(jugC), { spec: 0.6, gloss: 40 });

    // a pewter plate in front, and the fruit
    const plate = { x: W / 2 - L * between(r, 20, 60), y: backY + 100, rx: 150, ry: 40 };
    sc.add(plate.x - plate.rx, plate.y - plate.ry, plate.x + plate.rx, plate.y + plate.ry, (x, y) => {
      const q = ((x - plate.x) / plate.rx) ** 2 + ((y - plate.y) / plate.ry) ** 2;
      if (q >= 1) return null;
      return tz(y) + 10 + (q > 0.6 ? 6 * smooth(0.6, 0.85, q) : 0);
    }, flat(lin('#8a8a84')), { spec: 0.7, gloss: 30 });

    const fruit = [];
    const add = (type, x, y) => {
      const f = FRUITS[type];
      fruit.push({ type, x, y, rad: between(r, f.r[0], f.r[1]), col: lin(pick(r, f.colors)), ...f });
    };
    add('lemon', plate.x + L * 45, plate.y - 26);
    add(pick(r, ['apple', 'peach', 'orange']), plate.x - L * 50, plate.y - 34);
    add(pick(r, ['pear', 'apple']), plate.x - L * 120, plate.y - 22);
    add('plum', plate.x + L * 190, backY + 112);
    add('cherry', plate.x + L * 150, backY + 138);
    add('cherry', plate.x + L * 172, backY + 144);
    add(pick(r, ['apple', 'orange', 'peach']), plate.x - L * 230, backY + 120);
    fruit.forEach((f) => {
      const ry = f.rad * f.squash;
      const base = tz(f.y + ry) + (Math.abs(f.y - plate.y) < 40 && Math.abs(f.x - plate.x) < plate.rx ? 10 : 0);
      sc.add(f.x - f.rad * 1.4, f.y - ry * 2.2, f.x + f.rad * 1.4, f.y + ry, (x, y) => {
        let q;
        if (f.lemon) {
          const dx = (x - f.x) / (f.rad * 1.18), dy = (y - f.y) / ry;
          q = dx * dx + dy * dy * (1 + 0.5 * dx * dx) - 0.12 * gauss((Math.abs(dx) - 1) / 0.08, dy / 0.2);
        } else {
          const dy = (y - f.y) / ry;
          // a pear narrows smoothly toward its stalk
          const wdt = f.pear ? (dy < 0 ? 1 - 0.42 * smooth(0, 1.6, -dy) : 1) : 1;
          const span = f.pear ? (dy < 0 ? 1.9 : 1) : 1;
          q = ((x - f.x) / (f.rad * wdt)) ** 2 + (dy / span) ** 2;
        }
        return q < 1 ? base + f.rad * Math.sqrt(1 - q) : null;
      }, flat(f.col), { spec: f.spec, gloss: f.gloss });
    });
    // grapes, hanging over the plate's edge toward the viewer
    const gx = plate.x + L * 110, gy = plate.y - 6;
    const grapeC = lin('#3a2a4a');
    const grapes = [];
    for (let i = 0; i < 22; i++) {
      const row = Math.floor(i / 4);
      grapes.push({ x: gx + (i % 4 - 1.5) * 20 * (1 - row * 0.12) + between(r, -4, 4), y: gy + row * 17 + between(r, -3, 3), r: between(r, 12, 14) });
    }
    sc.add(gx - 60, gy - 20, gx + 60, gy + 120, (x, y) => {
      let best = null;
      for (const gp of grapes) {
        const q = ((x - gp.x) / gp.r) ** 2 + ((y - gp.y) / gp.r) ** 2;
        if (q < 1) { const hh = tz(plate.y) + 30 + (gp.y - gy) * 0.4 + gp.r * Math.sqrt(1 - q); if (best === null || hh > best) best = hh; }
      }
      return best;
    }, flat(grapeC), { spec: 0.45, gloss: 40 });

    sc.render(g, { ...s.light, dir: [s.light.dir[0] * L, s.light.dir[1], s.light.dir[2]] });
    // stalks on the cherries
    g.strokeStyle = '#3a2614';
    g.lineWidth = 2.5;
    fruit.filter((f) => f.type === 'cherry').forEach((f) => {
      g.beginPath();
      g.moveTo(f.x, f.y - f.rad);
      g.quadraticCurveTo(f.x - L * 10, f.y - f.rad - 28, f.x + 8, f.y - f.rad - 44);
      g.stroke();
    });
    finish(c, r, s.vignette);
    return c;
  }

  window.Subjects = { drawPortrait, drawStillLife, PORTRAIT_STYLES, STILL_STYLES };
})();
