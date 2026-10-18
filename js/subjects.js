/*
 * Generated portraits to paint: a Loomis / Asaro style planar head, painted after seven masters.
 *
 * The head, neck and shoulders are flat facets in 3D (forehead, brow, eye sockets, the nose's
 * ridge, sides and underside, cheekbones, muzzle, lips, chin, jaw, ear), turned and tilted, then
 * lit by one lamp. Each facet is filled with a single colour from the painter's palette for how
 * much light it catches, so a portrait reads like a colour-block study: big flat planes of light,
 * half tone and shadow. Hair, beards, collars and clothes are planes too. Every portrait is
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

  // A woman's head: a smaller, narrower jaw and chin, a smaller nose, a softer brow, fuller lips,
  // larger eyes, a slimmer neck and narrower shoulders. Each entry moves a point to [x, y, z].
  const WOMAN = {
    glabella: [0, 0.135, 0.535], browMid: [0.18, 0.165, 0.48], browOut: [0.29, 0.135, 0.38],
    lidUpIn: [0.07, 0.065, 0.475], lidUpOut: [0.245, 0.058, 0.405], lidLowIn: [0.08, -0.008, 0.475], lidLowOut: [0.235, -0.008, 0.415],
    bridge: [0, -0.03, 0.55], tip: [0, -0.155, 0.645], tipSide: [0.036, -0.15, 0.615], noseLow: [0.055, -0.115, 0.565],
    columella: [0, -0.2, 0.59], nostril: [0.045, -0.2, 0.565], wing: [0.095, -0.195, 0.525], wingTop: [0.085, -0.135, 0.52],
    upperLip: [0, -0.32, 0.6], lipUp: [0.08, -0.33, 0.565], corner: [0.125, -0.368, 0.49], stomion: [0, -0.368, 0.57],
    lowerLip: [0, -0.418, 0.586], lipLow: [0.08, -0.42, 0.556], labiomental: [0, -0.462, 0.54],
    chin: [0, -0.51, 0.545], menton: [0, -0.575, 0.45], chinSide: [0.085, -0.49, 0.5], chinUnder: [0.1, -0.575, 0.37],
    jawFront: [0.19, -0.465, 0.33], jawAngle: [0.3, -0.36, 0.03], jawUnder: [0.22, -0.5, 0.14], hollow: [0.26, -0.24, 0.34],
    neckTop: [0.22, -0.46, -0.12], neckSide: [0.24, -0.93, -0.06], neckSideBack: [0.2, -0.9, -0.26], throat: [0, -0.6, 0.14], neckFront: [0, -0.97, 0.15],
    collarbone: [0.32, -1.02, 0.15], shoulder: [0.66, -1.1, -0.06], shoulderBack: [0.58, -1.1, -0.32],
    chestSide: [0.4, -1.75, 0.22], arm: [0.74, -1.75, -0.1], armBack: [0.66, -1.75, -0.36],
  };
  // ...and her hair, drawn down over the temples and the top of the ears from a centre parting
  const HAIR_OVER = new Set(['foreheadTop templeTop', 'temple earTop', 'temple zygoma', 'zygoma earTop', 'earTop earBackTop']);

  // Rings of points round the neck, for ruffs: n points at height y, radius r,
  // centred at (cx, cz), squashed front to back by k
  function ring(n, y, r, cx = 0, cz = 0, k = 1) {
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r * k];
    });
  }
  // Faces joining two rings
  function band(part, lo, hi, opts = {}) {
    return lo.map((p, i) => ({ part, pts: [p, lo[(i + 1) % lo.length], hi[(i + 1) % hi.length], hi[i]], ...opts }));
  }

  /*
   * Extra planes for a look: a bun, long hair, a pearl, a ruff. Each is
   * { part, pts (3D, unturned), twoSided, bias (drawn later), centre (inside point for the normal) }.
   */
  function extras(look, side) {
    const out = [];
    if (look.hair === 'long') {
      // hair falling behind the ears to the shoulders: a curved sheet round the back of the head
      const arc = (y, r, cz) => Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI * (0.42 + (i / 8) * 1.16);
        return [Math.sin(a) * r, y, cz + Math.cos(a) * r * 0.9];
      });
      const top = arc(0.1, 0.47, -0.1), mid = arc(-0.45, 0.45, -0.16), low = arc(-0.98, 0.5, -0.2);
      const sheet = (lo, hi) => lo.slice(0, -1).map((q, i) => ({ part: 'hair', pts: [q, lo[i + 1], hi[i + 1], hi[i]], twoSided: true, bias: -0.35 }));
      out.push(...sheet(mid, top), ...sheet(low, mid));
    }
    if (look.pearl) {
      // a pearl under the ear lobe nearer the viewer (the head turns away from it)
      [-side].forEach((m) => {
        const c = [0.39 * m, -0.3, -0.02], r = 0.04;
        const t = [c[0], c[1] + r, c[2]], b = [c[0], c[1] - r, c[2]], l = [c[0] - r, c[1], c[2]], rr = [c[0] + r, c[1], c[2]], f = [c[0], c[1], c[2] + r], k = [c[0], c[1], c[2] - r];
        [[t, rr, f], [t, f, l], [t, l, k], [t, k, rr], [b, f, rr], [b, l, f], [b, k, l], [b, rr, k]].forEach((tri) => out.push({ part: 'pearl', pts: tri, centre: c, bias: 0.3 }));
      });
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
      blue: p('#101a3e', '#18264e', ['#24387a', '#304c98', '#4466b2', '#5c80c6', '#7c9cd6']),
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
  // more cloth colors, muted as the painters kept them; a look names one as `clothes`
  const CLOTHES = {
    black: BLACK_CLOTH,
    white: WHITE_LINEN,
    navy: p('#0a0e1c', '#121a30', ['#121a30', '#1a2642', '#243456', '#2f4268', '#3d527c']),
    green: p('#0c1610', '#14241a', ['#16281c', '#1f3a28', '#2b4e36', '#386244', '#487a55']),
    wine: p('#1c0a0c', '#2a1014', ['#2e1216', '#451a20', '#5c2229', '#742c34', '#8a3a42']),
    ochre: p('#2a2010', '#3c2e16', ['#4a3818', '#6a5222', '#8c6e2e', '#a98a3e', '#c4a458']),
    slate: p('#16181c', '#20242a', ['#262a32', '#363c46', '#485060', '#5c6678', '#727e92']),
  };
  // white hair, for the old
  const GREY_HAIR = p('#2a2826', '#3a3836', ['#4a4846', '#7a7773', '#a9a59f', '#cac6bf', '#e6e2da']);
  // An older face, as shifts of the head's points: hollower cheeks and temples, deeper eye sockets
  // under a heavier brow, thinner lips, a longer nose, a lower jaw and chin and a slacker throat
  const AGE = {
    cheek: [-0.01, -0.012, -0.02], hollow: [-0.035, 0.0, -0.04], nasolabial: [0, -0.01, -0.012], cheekbone: [0.005, -0.01, 0.012],
    temple: [-0.025, 0, -0.025], templeTop: [-0.015, 0, -0.012],
    orbitLow: [0, -0.015, -0.022], orbitOut: [0, -0.01, -0.015], browMid: [0, 0, 0.012], browOut: [0, 0, 0.01], browIn: [0, 0, 0.008],
    lipUp: [0, 0, -0.014], lipLow: [0, 0, -0.016], upperLip: [0, 0, -0.01], lowerLip: [0, 0, -0.012], stomion: [0, 0, -0.008],
    tip: [0, -0.022, 0.022], columella: [0, -0.016, 0.01], bridge: [0, 0, 0.01], tipSide: [0, -0.016, 0.01],
    jawFront: [0, -0.03, -0.01], jawUnder: [0, -0.04, 0], chinUnder: [0, -0.04, 0], chin: [0, -0.012, 0.01], menton: [0, -0.05, 0.0],
    throat: [0, -0.035, 0.01], earLow: [0, -0.03, 0], earBackLow: [0, -0.03, 0],
  };
  const PEARL = p('#4a4a50', '#6a6a72', ['#8e8e96', '#b4b4ba', '#d6d6da', '#eeeef0', '#ffffff']);

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
   * Closes any gap inside a figure drawn on a transparent layer: pixels the outside can't reach
   * that are empty or only half covered (a hairline seam between two planes, say) take the average
   * color of the solid pixels around them, working inward from the gap's edge. The figure's own
   * soft edge, within two pixels of the outside, is left alone.
   */
  function closeGaps(canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const outside = new Uint8Array(w * h), stack = [];
    const push = (x, y) => { const i = y * w + x; if (!outside[i] && d[i * 4 + 3] < 8) { outside[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    // the outside, grown by two pixels: where the figure's edge is allowed to be soft
    const near = new Uint8Array(w * h);
    for (let pass = 0; pass < 2; pass++) {
      const src = pass ? near : outside, grown = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (src[i]) { grown[i] = 1; continue; }
          if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) grown[i] = 1;
        }
      }
      near.set(grown);
    }
    let gap = [];
    const isGap = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (!near[i] && d[i * 4 + 3] < 250) { isGap[i] = 1; gap.push(i); }
    if (!gap.length) return;
    for (let pass = 0; pass < 16 && gap.length; pass++) {
      const fill = [], rest = [];
      gap.forEach((i) => {
        const x = i % w, y = (i / w) | 0;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (isGap[j] || d[j * 4 + 3] < 250) continue;
            r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
          }
        }
        if (n) fill.push([i, r / n, g / n, b / n]); else rest.push(i);
      });
      if (!fill.length) break;
      fill.forEach(([i, r, g, b]) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; isGap[i] = 0; });
      gap = rest;
    }
    ctx.putImageData(img, 0, 0);
  }

  // A background color, shifted by the portrait's tint and shade
  function bgColor(hex, look) {
    let c = hexRgb(hex);
    if (look.bgTint) c = mixRgb(c, hexRgb(look.bgTint.c), look.bgTint.k);
    const sh = look.bgShade || 0;
    return css(sh >= 0 ? mixRgb(c, [255, 255, 255], sh) : mixRgb(c, [0, 0, 0], -sh));
  }

  /*
   * Draws one portrait. look: { woman, hair: 'short' | 'bun' | 'long', beard, moustache, pearl,
   * collar: 'flat' | 'ruff' | 'open' | 'none', clothes: 'black', 'white' or a palette part name,
   * deep: true for a deeper skin tone, age: 'old', view: 'profile' | 'front' | 'three-quarter',
   * light: 'side' | 'soft' | 'dramatic' | 'top', bg: 'block' | 'wedge' | 'band' | 'window' | 'plain',
   * bgTint, bgShade }
   */
  function drawPortrait(styleId, seed, look = {}, size = 1) {
    const base = STYLES[styleId];
    const old = look.age === 'old';
    const s = Object.assign({}, base, look.deep ? DEEP : {}, old ? { hair: GREY_HAIR } : {}, look.clothes ? { clothes: CLOTHES[look.clothes] || base[look.clothes] || base.clothes } : {});
    const r = rng(seed);
    const W = Math.round(600 * size), H = Math.round(750 * size);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.scale(size, size);
    // the figure is drawn alone on a transparent layer first, so gaps in it can be found and closed
    const layer = document.createElement('canvas');
    layer.width = W; layer.height = H;
    const f = layer.getContext('2d');
    f.scale(size, size);
    const side = r() < 0.65 ? 1 : -1;
    const view = look.view || 'three-quarter';
    // the turn of the head: three-quarter, nearly full face, or in profile
    const yaw = side * (view === 'profile' ? between(r, 1.05, 1.3) : view === 'front' ? between(r, 0.04, 0.2) : between(r, 0.25, 0.6));
    const pitch = between(r, -0.1, 0.0);
    const roll = between(r, -0.06, 0.06);
    const lightSide = r() < 0.75 ? -1 : 1;                 // usually lit from the left
    const unit = between(r, 250, 270);
    // a head in profile sits off-centre toward where it faces, so shift it back
    const ox = 300 + between(r, -18, 18) - (view === 'profile' ? side * 45 : 0), oy = 300 + between(r, -8, 12);

    // background: flat colors, set against the head as painters do to turn it
    const ground = bgColor(s.ground, look), groundLight = bgColor(s.groundLight, look);
    const dark = bgColor(s.ground, Object.assign({}, look, { bgShade: (look.bgShade || 0) - 0.4 }));
    const away = -lightSide;                                // the side the head's shadow falls toward
    const edge = away > 0 ? 600 : 0;
    g.fillStyle = ground;
    g.fillRect(0, 0, 600, 750);
    const bgKind = look.bg || 'block';
    g.fillStyle = groundLight;
    if (bgKind === 'block') {
      // a lighter block on the shadow side
      const bx = ox + away * between(r, 40, 80);
      g.beginPath();
      g.moveTo(bx, 0); g.lineTo(edge, 0); g.lineTo(edge, 750); g.lineTo(bx + away * between(r, 60, 140), 750);
      g.closePath(); g.fill();
    } else if (bgKind === 'wedge') {
      // a lighter wedge from the top corner
      g.beginPath();
      g.moveTo(ox + away * between(r, -10, 50), 0); g.lineTo(edge, 0); g.lineTo(edge, between(r, 380, 560));
      g.closePath(); g.fill();
    } else if (bgKind === 'band') {
      // a darker table or floor across the bottom
      g.fillStyle = dark;
      g.fillRect(0, between(r, 520, 590), 600, 230);
    } else if (bgKind === 'window') {
      // a pale window pane behind the shadow side, with its bars
      const ww = between(r, 150, 210), x0 = away > 0 ? ox + between(r, 50, 100) : ox - between(r, 50, 100) - ww;
      const y0 = between(r, 20, 90), y1 = between(r, 380, 470);
      g.fillRect(x0, y0, ww, y1 - y0);
      g.fillStyle = ground;
      g.fillRect(x0 + ww / 2 - 3, y0, 6, y1 - y0);
      g.fillRect(x0, y0 + (y1 - y0) * 0.42, ww, 6);
    }

    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // roll, then pitch, then turn; the body (k < 1) turns less than the head
    const rot = ([x, y, z], k) => {
      const ya = yaw * k, cY = Math.cos(ya), sY = Math.sin(ya);
      const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
      const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
      return [x1 * cY + z2 * sY, y2, -x1 * sY + z2 * cY];
    };
    const unitVec = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    // the lamp: the painter's, made more sideways, frontal or overhead, and nudged a little
    const [kx, ky, kz] = { side: [1, 1, 1], dramatic: [1.5, 0.9, 0.35], soft: [0.45, 0.9, 1.35], top: [0.7, 1.9, 0.8] }[look.light || 'side'];
    const nudge = () => between(r, -0.1, 0.1);
    const L = unitVec([Math.abs(s.light[0]) * kx * lightSide + nudge(), s.light[1] * ky + nudge(), s.light[2] * kz + nudge()]);
    const B = unitVec([-Math.abs(s.bounce[0]) * lightSide, s.bounce[1], s.bounce[2]]);

    const facets = [];
    FACETS.forEach(([part0, ...names]) => {
      [false, true].forEach((mirror) => {
        let part = part0;
        const key = names[0] + ' ' + names[1];
        if (look.beard && BEARD.has(key)) part = 'hair';
        if ((look.beard || look.moustache) && MOUSTACHE.has(key)) part = 'hair';
        if (look.woman && HAIR_OVER.has(key)) part = 'hair';
        if (part === 'collar') part = look.collar === 'open' ? 'neck' : look.collar === 'none' || look.collar === 'ruff' ? 'clothes' : 'collar';
        const body = part0 === 'clothes' || part0 === 'collar';
        const pts = names.map((n) => {
          const q = (look.woman && WOMAN[n]) || P[n], d = old && AGE[n] || [0, 0, 0];
          return [(mirror ? -1 : 1) * (q[0] + d[0]), q[1] + d[1], q[2] + d[2]];
        });
        facets.push({ part, pts, k: null, centre: body ? [0, -1.4, -0.05] : part0 === 'neck' ? [0, -0.75, -0.08] : [0, 0, 0], bias: body ? -0.6 : 0 });
      });
    });
    extras(look, side).forEach((e) => facets.push({ k: e.part === 'ruff' ? 0.75 : 1, centre: e.centre || [0, 0, 0], bias: 0, ...e }));

    // The turn eases from the head (all of it) down through the neck to the shoulders (0.45 of it).
    // It depends on height alone, so a point shared by head, neck and body lands in one place and
    // the joins have no gaps.
    const twist = (y) => (y >= -0.6 ? 1 : y >= -1.05 ? 1 - 0.4 * ((-0.6 - y) / 0.45) : y >= -1.45 ? 0.6 - 0.15 * ((-1.05 - y) / 0.4) : 0.45);
    const kOf = (f, q) => (f.k == null ? twist(q[1]) : f.k);
    const polys = [];
    facets.forEach((f) => {
      const pts = f.pts.map((q) => rot(q, kOf(f, q)));
      // Newell's normal, pointed away from the inside of the form
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        nx += (a[1] - b[1]) * (a[2] + b[2]);
        ny += (a[2] - b[2]) * (a[0] + b[0]);
        nz += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const mid = pts.reduce((m, q) => [m[0] + q[0] / pts.length, m[1] + q[1] / pts.length, m[2] + q[2] / pts.length], [0, 0, 0]);
      const inside = rot(f.centre, kOf(f, f.centre));
      if (!f.twoSided && nx * (mid[0] - inside[0]) + ny * (mid[1] - inside[1]) + nz * (mid[2] - inside[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (f.twoSided && nz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // a brim or cloth seen from either side
      const pal = f.part === 'pearl' ? PEARL : s[f.part] || s[SAME[f.part]] || s.hair;
      if (nz <= 0.01) {
        // Facing away from the viewer. The body's own planes are skipped, but a hidden plane of the
        // head, neck or shoulders is laid at the very back in its shadow color: it is covered by
        // everything in front and only shows where the front planes leave a gap (under the jaw, say)
        if (f.k == null) polys.push({ pts, z: -10, color: planeColor(pal, 0, 0) });
        return;
      }
      const lam = nx * L[0] + ny * L[1] + nz * L[2];
      const bounce = nx * B[0] + ny * B[1] + nz * B[2];
      polys.push({ pts, z: mid[2] + f.bias, color: planeColor(pal, lam, bounce) });
    });
    polys.sort((a, b) => a.z - b.z);
    f.lineJoin = 'round';
    polys.forEach((q) => {
      f.beginPath();
      q.pts.forEach(([x, y], i) => (i ? f.lineTo(ox + x * unit, oy - y * unit) : f.moveTo(ox + x * unit, oy - y * unit)));
      f.closePath();
      f.fillStyle = f.strokeStyle = css(q.color);
      f.lineWidth = 1.2;
      f.fill();
      f.stroke();
    });
    if (look._layer === 'raw') return layer;             // for tests: the figure alone, as drawn
    closeGaps(layer);
    if (look._layer) return layer;                       // ...and with its gaps closed
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(layer, 0, 0);
    return c;
  }

  // ---- A new portrait every time -----------------------------------------------------------

  /*
   * Nothing is stored: a portrait is a painter and a seed, written "hals-48213". The seed decides
   * everything else, from who the sitter is (a man or a woman, a beard, a bun or long hair, a pearl,
   * a collar, the clothes) to how the head is turned and lit, so the same id always draws the same
   * portrait and a fresh random seed draws a new one. The choices follow each painter's habits.
   */
  const PAINTERS = Object.keys(STYLES);
  // what each painter tends to put on a sitter: collars and clothes, for men and for women
  const HABITS = {
    rembrandt: { collar: ['flat', 'flat', 'none', 'open'], clothes: { man: [undefined, undefined, 'wine'], woman: [undefined, 'wine', 'green'] } },
    zorn: { collar: ['open', 'flat', 'none'], clothes: { man: ['black', 'black', undefined, 'slate'], woman: [undefined, 'black', 'ochre'] } },
    sargent: { collar: ['open', 'flat', 'flat'], clothes: { man: [undefined, 'slate', 'navy'], woman: [undefined, 'white', 'navy', 'wine'] } },
    sorolla: { collar: ['open', 'none', 'open'], clothes: { man: [undefined, 'slate'], woman: [undefined, 'ochre', 'green'] } },
    velazquez: { collar: ['flat', 'ruff', 'flat'], clothes: { man: [undefined, 'slate'], woman: [undefined, 'wine', 'green'] } },
    hals: { collar: ['ruff', 'ruff', 'flat'], clothes: { man: [undefined, 'slate'], woman: [undefined, 'wine'] } },
    vermeer: { collar: ['flat', 'flat', 'open'], clothes: { man: [undefined, 'black', 'green'], woman: [undefined, 'blue', 'wine'] } },
  };
  const pickOf = (r, list) => list[Math.floor(r() * list.length)];

  function lookFor(painter, seed) {
    const r = rng((seed ^ 0x5bd1e995) >>> 0);
    const h = HABITS[painter];
    const woman = r() < 0.5;
    const look = { collar: pickOf(r, h.collar) };
    if (woman) {
      look.woman = true;
      look.hair = r() < 0.55 ? 'bun' : 'long';
      if (r() < 0.4) look.pearl = true;
      // a bare neck suits a woman better than none at all
      if (look.collar === 'none') look.collar = 'open';
    } else {
      const beard = r() < 0.42;
      if (beard) look.beard = true;
      if (r() < (beard ? 0.25 : 0.45)) look.moustache = true;
    }
    const clothes = pickOf(r, h.clothes[woman ? 'woman' : 'man']);
    if (clothes) look.clothes = clothes;
    if (painter === 'velazquez' && r() < 0.14) look.deep = true;
    // age, the turn of the head, the lamp and the wall behind
    if (r() < 0.26) look.age = 'old';
    const v = r();
    look.view = v < 0.13 ? 'profile' : v < 0.3 ? 'front' : 'three-quarter';
    const lt = r();
    look.light = lt < 0.5 ? 'side' : lt < 0.72 ? 'soft' : lt < 0.92 ? 'dramatic' : 'top';
    const bg = r();
    look.bg = bg < 0.34 ? 'block' : bg < 0.5 ? 'wedge' : bg < 0.66 ? 'band' : bg < 0.84 ? 'window' : 'plain';
    look.bgShade = between(r, -0.18, 0.16);
    if (r() < 0.55) look.bgTint = { c: pickOf(r, ['#3a4a5c', '#5a3a2a', '#3c4a3a', '#4a3a52']), k: between(r, 0.08, 0.28) };
    return look;
  }

  function titleFor(look) {
    const who = look.age === 'old' ? (look.woman ? 'Old woman' : 'Old man') : look.woman ? 'Woman' : 'Man';
    const extra = look.beard ? 'with a beard' : look.moustache ? 'with a moustache' : look.pearl ? 'with a pearl earring' : look.hair === 'long' ? 'with loose hair' : look.collar === 'ruff' ? 'in a ruff' : '';
    return [who, extra, look.view === 'profile' ? 'in profile' : ''].filter(Boolean).join(' ');
  }

  // The portrait an id names, or null if the painter is unknown
  function entry(id) {
    const m = /^([a-z]+)-(\d+)$/.exec(id || '');
    if (!m || !STYLES[m[1]]) return null;
    const seed = +m[2];
    const look = lookFor(m[1], seed);
    return { id, painter: m[1], seed, look, title: titleFor(look) };
  }

  // A new id: a random painter and seed, never the one given
  function random(not) {
    for (;;) {
      const id = `${pickOf(Math.random, PAINTERS)}-${Math.floor(Math.random() * 1e6)}`;
      if (id !== not) return id;
    }
  }

  // The portrait's picture, at size (1 = 600 x 750); the last few are kept so they are not redrawn
  const cache = new Map();
  function picture(id, size = 1) {
    const key = id + '@' + size;
    if (!cache.has(key)) {
      const pt = entry(id);
      if (!pt) return null;
      if (cache.size >= 6) cache.delete(cache.keys().next().value);
      cache.set(key, drawPortrait(pt.painter, pt.seed, pt.look, size));
    }
    return cache.get(key);
  }

  window.Subjects = {
    PAINTERS,
    entry,
    random,
    painterOf: (id) => { const pt = entry(id); return pt ? STYLES[pt.painter].painter : ''; },
    picture,
    drawPortrait,
  };
})();
