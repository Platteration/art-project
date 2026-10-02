/*
 * Generated portraits to paint: a Loomis / Asaro style planar head, painted after seven masters.
 *
 * The head, neck and shoulders are flat facets in 3D (forehead, brow, eye sockets, the nose's
 * ridge, sides and underside, cheekbones, muzzle, lips, chin, jaw, ear), turned and tilted, then
 * lit by one lamp. Each facet is filled with a single colour from the painter's palette for how
 * much light it catches, so a portrait reads like a colour-block study: big flat planes of light,
 * half tone and shadow. Hair, beards, hats, collars and clothes are planes too. Every portrait is
 * drawn from a seed, so it comes out the same each time.
 */
(function () {
  'use strict';

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
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // ---- The planar head ------------------------------------------------------------

  // Points on the right half, in head units (y up, z toward the viewer); the left half mirrors them
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

  // Facets a beard or moustache covers, by their first two points
  const BEARD = new Set(['labiomental chinSide', 'lipLow corner', 'nasolabial hollow', 'hollow ramus', 'chin chinSide', 'chinSide jawFront', 'jawFront jawAngle', 'chinUnder jawUnder', 'lowerLip lipLow', 'ramus earLow']);
  const MOUSTACHE = new Set(['philtrum nasolabial', 'subnasale philtrum']);

  // Rings of points round the head, for hats, buns and ruffs: n points at height y, radius r,
  // centred at (cx, cz), squashed front to back by k
  function ring(n, y, r, cx = 0, cz = 0, k = 1) {
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r * k];
    });
  }
  // Faces joining two rings (a band), and a ring to a point (a cap)
  function band(part, lo, hi, opts = {}) {
    return lo.map((p, i) => ({ part, pts: [p, lo[(i + 1) % lo.length], hi[(i + 1) % hi.length], hi[i]], ...opts }));
  }
  function cap(part, rim, top, opts = {}) {
    return rim.map((p, i) => ({ part, pts: [p, rim[(i + 1) % rim.length], top], ...opts }));
  }

  /*
   * Extra planes for a look: hats, a bun, a turban's tail, a ruff. Each is
   * { part, pts (3D, unturned), twoSided, bias (drawn later), centre (inside point for the normal) }.
   */
  function extras(look) {
    const out = [];
    if (look.hat === 'beret') {
      // a soft beret, tilted to one side and pulled forward
      const lo = ring(10, 0.5, 0.58, 0.06, 0.02, 0.95), mid = ring(10, 0.63, 0.5, 0.08, 0.0, 0.95);
      const top = [0.1, 0.7, -0.02];
      out.push(...band('hat', lo, mid, { centre: [0.08, 0.6, 0], bias: 3 }), ...cap('hat', mid, top, { centre: [0.08, 0.6, 0], bias: 3 }));
    }
    if (look.hat === 'brim' || look.hat === 'straw') {
      const part = look.hat === 'straw' ? 'straw' : 'hat';
      // a broad brim, tilted up at the front, and a crown
      const tilt = (p) => [p[0], p[1] + p[2] * 0.12, p[2]];
      const brimOut = ring(14, 0.48, 0.86, 0, 0.02).map(tilt), brimIn = ring(14, 0.48, 0.44, 0, 0.0).map(tilt);
      const crownTop = ring(14, 0.84, 0.4, 0, -0.02).map(tilt);
      out.push(...band(part, brimIn, brimOut, { twoSided: true, bias: 3 }));
      out.push(...band(part, brimIn, crownTop, { centre: [0, 0.65, 0], bias: 3.2 }));
      out.push(...cap(part, crownTop, tilt([0, 0.88, -0.02]), { centre: [0, 0.65, 0], bias: 3.2 }));
    }
    if (look.hat === 'turban') {
      // Vermeer's turban: the cloth wound round the head, its knot on top, and a tail falling behind
      out.push(...cap('turban', ring(9, 0.6, 0.3, 0, -0.12), [0, 0.8, -0.1], { centre: [0, 0.6, -0.1], bias: 2 }));
      out.push({ part: 'tail', pts: [[0.12, 0.66, -0.3], [0.28, 0.6, -0.36], [0.36, -0.2, -0.32], [0.22, -0.18, -0.28]], twoSided: true });
    }
    if (look.hair === 'bun') {
      const c = [0, 0.4, -0.66], r = 0.24;
      const pts = [[c[0], c[1] + r, c[2]], [c[0], c[1] - r, c[2]], [c[0] + r, c[1], c[2]], [c[0] - r, c[1], c[2]], [c[0], c[1], c[2] - r], [c[0], c[1], c[2] + r]];
      const [t, b, rr, l, bk, f] = pts;
      [[t, rr, bk], [t, bk, l], [t, l, f], [t, f, rr], [b, bk, rr], [b, l, bk], [b, f, l], [b, rr, f]].forEach((tri) => out.push({ part: 'hair', pts: tri, centre: c }));
    }
    if (look.collar === 'ruff') {
      // a stiff white ruff round the neck, under the chin
      const up = ring(16, -0.64, 0.5, 0, -0.08, 0.85), down = ring(16, -0.84, 0.5, 0, -0.08, 0.85);
      const inner = ring(16, -0.64, 0.28, 0, -0.08, 0.85);
      out.push(...band('ruff', down, up, { centre: [0, -0.74, -0.08], bias: 0.2 }));
      out.push(...band('ruff', up, inner, { twoSided: true, bias: 0.15 }));
    }
    return out;
  }

  // ---- Painters' palettes -------------------------------------------------------------
  /*
   * Each part has a ramp from the edge of the light to full light, a shadow colour and a reflected
   * light colour that warms (or cools) shadow planes facing the bounce. light: the lamp's direction
   * in view space (x right, y up, z toward the viewer); the side it comes from varies per portrait.
   */
  const p = (shadow, reflect, ramp) => ({ shadow, reflect, ramp });
  const WHITE_LINEN = p('#4c4639', '#5f5747', ['#8a8170', '#b0a690', '#d2c9b2', '#e6dfcb', '#f1ebdb']);
  const BLACK_CLOTH = p('#0c0b0b', '#141212', ['#181616', '#201d1c', '#2a2624', '#35302d', '#403a36']);

  const STYLES = {
    rembrandt: {
      painter: 'Rembrandt', light: [0.62, 0.55, 0.56], bounce: [0.5, -0.6, 0.4],
      ground: '#1c140c', groundLight: '#33251a',
      skin: p('#3c2416', '#5c3521', ['#6e4229', '#9c6644', '#c48d62', '#deaf82', '#efcda2']),
      lips: p('#3e2016', '#55301f', ['#6a3a28', '#8e5840', '#ad7254', '#c48a68', '#d49e7c']),
      eye: p('#20120b', '#2e1b11', ['#3a2216', '#523424', '#6a4632', '#7e5840', '#8e684e']),
      ear: p('#3e2216', '#5a3020', ['#6e4229', '#9c6444', '#c08660', '#d8a47a', '#e6b88e']),
      neck: p('#2e1a10', '#4a2a1a', ['#5e3822', '#86583a', '#ac7a54', '#c89670', '#d8ac86']),
      hair: p('#140d08', '#24180f', ['#2e2016', '#45311f', '#5e4429', '#755636', '#8a6844']),
      hat: p('#0a0705', '#120d09', ['#16100b', '#1e1610', '#281d15', '#33261b', '#3e2f22']),
      collar: WHITE_LINEN, ruff: WHITE_LINEN,
      clothes: p('#0c0806', '#140e0a', ['#18110c', '#221812', '#2e2118', '#3a2a1e', '#463326']),
    },
    zorn: {
      painter: 'Zorn', light: [0.7, 0.35, 0.62], bounce: [0.6, -0.4, 0.5],
      ground: '#2a2522', groundLight: '#3c3631',
      skin: p('#5a3226', '#7a4232', ['#8a5a44', '#b07a5c', '#cf9a78', '#e6b996', '#f2d2b4']),
      lips: p('#5a2a24', '#76382e', ['#8a4838', '#aa5c48', '#c0705a', '#d0846c', '#dc9880']),
      eye: p('#33201a', '#462a22', ['#583a30', '#704c3e', '#86604e', '#98705e', '#a8806c']),
      ear: p('#5c2a22', '#7c3a2e', ['#94503e', '#b86852', '#d07e66', '#de947a', '#eaa88e']),
      neck: p('#4e2c22', '#6a3a2c', ['#7a5040', '#9e6e58', '#bc8a70', '#d2a486', '#e0b89c']),
      hair: p('#1c1614', '#2c2420', ['#382c24', '#4c3c30', '#62503e', '#76624c', '#8a765e']),
      hat: BLACK_CLOTH,
      collar: p('#5c544c', '#70675c', ['#9a9286', '#bab2a4', '#d6cfc2', '#e8e2d6', '#f4efe6']), ruff: WHITE_LINEN,
      clothes: p('#151110', '#2a1a16', ['#7a2a22', '#922f24', '#a83a2c', '#bc4a38', '#cc5c48']),
    },
    sargent: {
      painter: 'Sargent', light: [0.55, 0.6, 0.6], bounce: [0.5, -0.3, 0.6],
      ground: '#35343a', groundLight: '#4a4746',
      skin: p('#5a4038', '#6e5048', ['#8e6c60', '#b08e80', '#cfae9e', '#e4c8b8', '#f2ddd0']),
      lips: p('#5a3434', '#704444', ['#8a5452', '#a86a66', '#c0807a', '#d0948c', '#dca8a0']),
      eye: p('#2e2422', '#3e302e', ['#4e3c38', '#665048', '#7c645a', '#8e746a', '#9e847a']),
      ear: p('#5e3c36', '#744c44', ['#966a5e', '#b6887a', '#cea496', '#dcb8aa', '#e8cabe']),
      neck: p('#4e3832', '#644840', ['#806258', '#a08074', '#bc9c90', '#d2b4a8', '#e0c6bc']),
      hair: p('#16100e', '#241a16', ['#2e221c', '#3e2e26', '#523e32', '#644e40', '#76604e']),
      hat: BLACK_CLOTH,
      collar: p('#584a44', '#6a5a54', ['#8c766c', '#ae9488', '#cab0a4', '#dec6ba', '#ecd8ce']), ruff: WHITE_LINEN,
      clothes: BLACK_CLOTH,
    },
    sorolla: {
      painter: 'Sorolla', light: [0.45, 0.8, 0.4], bounce: [0.4, -0.7, 0.5],
      ground: '#c9b48c', groundLight: '#e2d2ac',
      skin: p('#7a5450', '#986860', ['#a8704e', '#c88e66', '#e0ac82', '#efc69c', '#f9dcb8']),
      lips: p('#6e3e40', '#884e4c', ['#a05a4c', '#bc6e5c', '#d0846e', '#de9882', '#e8ac96']),
      eye: p('#46302e', '#5a3e3a', ['#6a4a48', '#84604e', '#9c7660', '#b08a72', '#c09c84']),
      ear: p('#7c5250', '#9a665e', ['#b8705a', '#d48a70', '#e4a486', '#f0ba9c', '#f8ccb0']),
      neck: p('#6c4a4a', '#886058', ['#9c6a52', '#bc8668', '#d4a080', '#e4b898', '#f0caac']),
      hair: p('#221814', '#32241c', ['#3a2a24', '#4e382c', '#644836', '#7a5a44', '#8e6e56']),
      straw: p('#6e5a6a', '#8a7478', ['#b49a64', '#ccb478', '#e0ca8e', '#eedaa4', '#f8e8bc']),
      hat: p('#6e5a6a', '#8a7478', ['#b49a64', '#ccb478', '#e0ca8e', '#eedaa4', '#f8e8bc']),
      collar: p('#7a7698', '#9894b0', ['#c4c0c8', '#d8d2d4', '#eae4de', '#f4efe8', '#fffaf2']), ruff: WHITE_LINEN,
      clothes: p('#7a7698', '#9894b0', ['#c4c0c8', '#d8d2d4', '#eae4de', '#f4efe8', '#fffaf2']),
    },
    velazquez: {
      painter: 'Velázquez', light: [0.6, 0.5, 0.62], bounce: [0.5, -0.5, 0.5],
      ground: '#3e3e34', groundLight: '#5a5848',
      skin: p('#4a3426', '#5e4232', ['#7a5a44', '#9c765c', '#ba9276', '#d0aa8c', '#e0c0a2']),
      lips: p('#4a2c24', '#5e3a2e', ['#76483a', '#94604c', '#ac7660', '#c08a72', '#cc9c84']),
      eye: p('#261a14', '#34241c', ['#443024', '#5a4230', '#6e5440', '#80644e', '#8e725c']),
      ear: p('#4c3024', '#623e2e', ['#7e5440', '#a07058', '#bc8a70', '#d0a086', '#dcb298']),
      neck: p('#3e2a20', '#523628', ['#6c4e3c', '#8c6a54', '#a8846c', '#bc9a80', '#ccac94']),
      hair: p('#120e0c', '#1e1814', ['#261e18', '#342820', '#44362a', '#544434', '#625240']),
      hat: BLACK_CLOTH,
      collar: p('#5a5650', '#6e6a62', ['#9a968c', '#bab6ac', '#d6d2c8', '#e8e4da', '#f4f1e8']), ruff: p('#5a5650', '#6e6a62', ['#9a968c', '#bab6ac', '#d6d2c8', '#e8e4da', '#f4f1e8']),
      clothes: BLACK_CLOTH,
    },
    hals: {
      painter: 'Frans Hals', light: [0.55, 0.6, 0.58], bounce: [0.5, -0.5, 0.5],
      ground: '#4e4a3c', groundLight: '#6c6652',
      skin: p('#5a3226', '#76422e', ['#9a5e44', '#c07e5e', '#da9c78', '#eab894', '#f4ceac']),
      lips: p('#5a2a22', '#74382c', ['#94483a', '#b05e4a', '#c8745e', '#d88a72', '#e49e86']),
      eye: p('#30201a', '#422c22', ['#56382c', '#6e4c3a', '#86604a', '#9a725a', '#aa8468']),
      ear: p('#5c2e22', '#783c2c', ['#a05a42', '#c4785a', '#da9474', '#e8ac8c', '#f2c0a2']),
      neck: p('#4c2c20', '#64382a', ['#86543e', '#a87058', '#c48c70', '#d8a488', '#e4b89c']),
      hair: p('#24160e', '#342016', ['#46301e', '#5e4228', '#765434', '#8c6842', '#a07a50']),
      hat: BLACK_CLOTH,
      collar: p('#56585a', '#6a6c6e', ['#9a9c9a', '#b8bab6', '#d4d4ce', '#e6e6e0', '#f2f2ec']),
      ruff: p('#56585a', '#6a6c6e', ['#9a9c9a', '#b8bab6', '#d4d4ce', '#e6e6e0', '#f2f2ec']),
      clothes: BLACK_CLOTH,
    },
    vermeer: {
      painter: 'Vermeer', light: [0.65, 0.45, 0.6], bounce: [0.5, -0.5, 0.5],
      ground: '#101010', groundLight: '#1e1d18',
      skin: p('#4a3a30', '#5a4a3e', ['#8a7060', '#b8987e', '#d8bc9e', '#ecd4b8', '#f8e8d2']),
      lips: p('#5a2e2a', '#703a34', ['#904a40', '#ac5c4e', '#c27060', '#d28474', '#de9888']),
      eye: p('#2c221c', '#3a2e26', ['#4c3c32', '#645044', '#7a6454', '#8e7664', '#9e8674']),
      ear: p('#4e3a30', '#604a3e', ['#8e6e5c', '#b28c76', '#cea88e', '#e0bea6', '#ecd0ba']),
      neck: p('#40322a', '#54443a', ['#7a6252', '#9e826e', '#bca088', '#d2b8a0', '#e0cab4']),
      hair: p('#1a140e', '#281e16', ['#36281c', '#4a3826', '#5e4830', '#72583c', '#846a4a']),
      turban: p('#101a3e', '#18264e', ['#24387a', '#304c98', '#4466b2', '#5c80c6', '#7c9cd6']),
      tail: p('#4a3c14', '#5c4c1c', ['#9a7a2c', '#b8963a', '#d0ae4c', '#e2c262', '#eed480']),
      hat: BLACK_CLOTH,
      collar: WHITE_LINEN, ruff: WHITE_LINEN,
      clothes: p('#2e2210', '#3e2e16', ['#6a4e22', '#8a6a30', '#a88440', '#c09c54', '#d2b06a']),
    },
  };
  // A deeper skin tone, for portraits after Velázquez's Juan de Pareja and others
  const DEEP = {
    skin: p('#24140c', '#34200f', ['#4a2e1e', '#683f28', '#865436', '#9e6846', '#b07a56']),
    lips: p('#2a140e', '#3a1e14', ['#4e281c', '#663626', '#7c4634', '#8e5642', '#9c6452']),
    eye: p('#120a06', '#1a100a', ['#22140c', '#2e1c12', '#3a2418', '#462e1e', '#503626']),
    ear: p('#26140c', '#36200f', ['#4e2e1e', '#6c4028', '#8a5434', '#a06644', '#b07654']),
    neck: p('#1e100a', '#2c1a0e', ['#42281a', '#5e3a24', '#7a4e30', '#90603e', '#a0704c']),
  };
  const SAME = { socket: 'skin', under: 'skin' };

  const hexRgb = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
  const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  // A plane's colour: the ramp by how squarely it faces the lamp, or the shadow colour tinted by the
  // bounce light for planes turned away
  function planeColor(part, lam, bounce) {
    if (lam <= 0.02) return mixRgb(hexRgb(part.shadow), hexRgb(part.reflect), clamp01(bounce) * 0.9);
    const ramp = part.ramp, t = clamp01(lam) * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(t));
    return mixRgb(hexRgb(ramp[i]), hexRgb(ramp[i + 1]), t - i);
  }

  /*
   * Draws one portrait. look: { hair: 'short' | 'bun', beard, moustache, hat: 'beret' | 'brim' |
   * 'straw' | 'turban', collar: 'flat' | 'ruff' | 'open' | 'none', clothes: a palette part name to
   * use for the clothes, deep: true for a deeper skin tone }
   */
  function drawPortrait(styleId, seed, look = {}, size = 1) {
    const base = STYLES[styleId];
    const s = Object.assign({}, base, look.deep ? DEEP : {}, look.clothes ? { clothes: look.clothes === 'black' ? BLACK_CLOTH : look.clothes === 'white' ? WHITE_LINEN : base[look.clothes] } : {});
    const r = rng(seed);
    const W = Math.round(600 * size), H = Math.round(750 * size);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.scale(size, size);
    const side = r() < 0.65 ? 1 : -1;
    const yaw = side * between(r, 0.25, 0.55);              // a three-quarter turn
    const pitch = between(r, -0.1, 0.0);
    const roll = between(r, -0.06, 0.06);
    const lightSide = r() < 0.75 ? -1 : 1;                 // usually lit from the left
    const unit = between(r, 250, 270) * (look.hat === 'brim' || look.hat === 'straw' ? 0.9 : 1);
    const ox = 300 + between(r, -18, 18), oy = 300 + between(r, -8, 12) + (look.hat ? 30 : 0);

    // background: flat, with a lighter block on the face's shadow side, as painters set it to turn the head
    g.fillStyle = s.ground;
    g.fillRect(0, 0, 600, 750);
    g.fillStyle = s.groundLight;
    g.beginPath();
    const bx = ox - lightSide * between(r, 40, 80);
    g.moveTo(bx, 0);
    g.lineTo(lightSide > 0 ? 0 : 600, 0);
    g.lineTo(lightSide > 0 ? 0 : 600, 750);
    g.lineTo(bx - lightSide * between(r, 60, 140), 750);
    g.closePath();
    g.fill();

    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // roll, then pitch, then turn; the body (k < 1) turns less than the head
    const rot = ([x, y, z], k) => {
      const ya = yaw * k, cY = Math.cos(ya), sY = Math.sin(ya);
      const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
      const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
      return [x1 * cY + z2 * sY, y2, -x1 * sY + z2 * cY];
    };
    const unitVec = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const L = unitVec([Math.abs(s.light[0]) * lightSide, s.light[1], s.light[2]]);
    const B = unitVec([-Math.abs(s.bounce[0]) * lightSide, s.bounce[1], s.bounce[2]]);

    const facets = [];
    FACETS.forEach(([part0, ...names]) => {
      [false, true].forEach((mirror) => {
        let part = part0;
        const key = names[0] + ' ' + names[1];
        if (look.beard && BEARD.has(key)) part = 'hair';
        if ((look.beard || look.moustache) && MOUSTACHE.has(key)) part = 'hair';
        if (look.hat === 'turban' && part === 'hair') part = 'turban';
        if (part === 'collar') part = look.collar === 'open' ? 'neck' : look.collar === 'none' || look.collar === 'ruff' ? 'clothes' : 'collar';
        const body = part0 === 'clothes' || part0 === 'collar';
        const k = body ? 0.45 : part0 === 'neck' ? 0.75 : 1;
        const pts = names.map((n) => { const q = P[n]; return [mirror ? -q[0] : q[0], q[1], q[2]]; });
        facets.push({ part, pts, k, centre: body ? [0, -1.4, -0.05] : part0 === 'neck' ? [0, -0.75, -0.08] : [0, 0, 0], bias: body ? -0.6 : 0 });
      });
    });
    extras(look).forEach((e) => facets.push({ k: e.part === 'ruff' ? 0.75 : 1, centre: e.centre || [0, 0, 0], bias: 0, ...e }));

    const polys = [];
    facets.forEach((f) => {
      const pts = f.pts.map((q) => rot(q, f.k));
      // Newell's normal, pointed away from the inside of the form
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        nx += (a[1] - b[1]) * (a[2] + b[2]);
        ny += (a[2] - b[2]) * (a[0] + b[0]);
        nz += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const mid = pts.reduce((m, q) => [m[0] + q[0] / pts.length, m[1] + q[1] / pts.length, m[2] + q[2] / pts.length], [0, 0, 0]);
      const inside = rot(f.centre, f.k);
      if (!f.twoSided && nx * (mid[0] - inside[0]) + ny * (mid[1] - inside[1]) + nz * (mid[2] - inside[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (f.twoSided && nz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // a brim or cloth seen from either side
      if (nz <= 0.01) return;                                         // facing away from the viewer
      const lam = nx * L[0] + ny * L[1] + nz * L[2];
      const bounce = nx * B[0] + ny * B[1] + nz * B[2];
      const pal = s[f.part] || s[SAME[f.part]] || s.hair;
      polys.push({ pts, z: mid[2] + f.bias, color: planeColor(pal, lam, bounce) });
    });
    polys.sort((a, b) => a.z - b.z);
    g.lineJoin = 'round';
    polys.forEach((q) => {
      g.beginPath();
      q.pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x * unit, oy - y * unit) : g.moveTo(ox + x * unit, oy - y * unit)));
      g.closePath();
      g.fillStyle = g.strokeStyle = css(q.color);
      g.lineWidth = 1.2;
      g.fill();
      g.stroke();
    });
    return c;
  }

  // ---- The 25 portraits ------------------------------------------------------------------

  const L = (painter, seed, look, title) => ({ id: `${painter}-${seed}`, painter, seed, look, title });
  const PORTRAITS = [
    L('rembrandt', 7, { hat: 'beret', moustache: true, collar: 'flat' }, 'Man in a beret'),
    L('rembrandt', 21, { hat: 'beret', beard: true, collar: 'none' }, 'Bearded man in a beret'),
    L('rembrandt', 33, { beard: true, collar: 'flat' }, 'Old man with a beard'),
    L('rembrandt', 45, { hair: 'bun', collar: 'flat' }, 'Young woman'),
    L('zorn', 11, { hair: 'bun', collar: 'open' }, 'Woman in red'),
    L('zorn', 52, { moustache: true, collar: 'flat', clothes: 'black' }, 'Man with a moustache'),
    L('zorn', 64, { hair: 'bun', collar: 'open', clothes: 'black' }, 'Woman in black'),
    L('zorn', 70, { beard: true, collar: 'none', clothes: 'black' }, 'Bearded man'),
    L('sargent', 81, { hair: 'bun', collar: 'open' }, 'Lady in a black gown'),
    L('sargent', 92, { moustache: true, collar: 'flat' }, 'Gentleman'),
    L('sargent', 103, { hair: 'bun', collar: 'open', clothes: 'white' }, 'Lady in white'),
    L('sargent', 114, { collar: 'flat' }, 'Young man'),
    L('sorolla', 125, { beard: true, collar: 'none' }, 'Man in white'),
    L('sorolla', 136, { hair: 'bun', collar: 'open' }, 'Woman in the sun'),
    L('sorolla', 147, { hat: 'straw', moustache: true, collar: 'none' }, 'Man in a straw hat'),
    L('velazquez', 158, { moustache: true, collar: 'flat' }, 'Courtier'),
    L('velazquez', 169, { beard: true, collar: 'flat', deep: true }, 'Man with a lace collar'),
    L('velazquez', 180, { hair: 'bun', collar: 'ruff' }, 'Lady with a ruff'),
    L('velazquez', 191, { beard: true, collar: 'ruff' }, 'Bearded man with a ruff'),
    L('hals', 202, { hat: 'brim', beard: true, collar: 'ruff' }, 'Cavalier'),
    L('hals', 213, { beard: true, collar: 'ruff' }, 'Burgher'),
    L('hals', 224, { hair: 'bun', collar: 'ruff' }, 'Woman with a ruff'),
    L('vermeer', 235, { hat: 'turban', collar: 'flat' }, 'Girl in a blue turban'),
    L('vermeer', 246, { hair: 'bun', collar: 'flat' }, 'Woman in a yellow jacket'),
    L('vermeer', 257, { hat: 'brim', collar: 'flat', clothes: 'black' }, 'Man in a hat'),
  ];

  // The portrait's picture, at size (1 = 600 x 750); kept so it is drawn only once
  const cache = new Map();
  function picture(id, size = 1) {
    const key = id + '@' + size;
    if (!cache.has(key)) {
      const pt = PORTRAITS.find((x) => x.id === id);
      if (!pt) return null;
      cache.set(key, drawPortrait(pt.painter, pt.seed, pt.look, size));
    }
    return cache.get(key);
  }

  window.Subjects = {
    PORTRAITS,
    painterOf: (id) => { const pt = PORTRAITS.find((x) => x.id === id); return pt ? STYLES[pt.painter].painter : ''; },
    picture,
    drawPortrait,
  };
})();
