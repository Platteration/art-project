/*
 * A library of common artist paints, and palettes well-known painters used.
 *
 * Each paint has its tube color (a thick swatch) and a tint of 1 part paint to 4 parts titanium
 * white, both as they would photograph in daylight. These are estimates for typical artist-grade
 * oils, not measurements of any maker's tubes: brands differ, and the mixes made from them are
 * starting points to adjust by eye.
 */
(function () {
  'use strict';

  const CATEGORIES = [
    { id: 'white', name: 'Whites' },
    { id: 'yellow', name: 'Yellows' },
    { id: 'orange', name: 'Oranges' },
    { id: 'red', name: 'Reds' },
    { id: 'violet', name: 'Pinks and violets' },
    { id: 'blue', name: 'Blues' },
    { id: 'green', name: 'Greens' },
    { id: 'earth', name: 'Earths' },
    { id: 'black', name: 'Blacks and grays' },
  ];

  // [code, name, pigment, category, tube color, 1 : 4 tint with white]
  const ROWS = [
    ['TW', 'Titanium White', 'PW6', 'white', '#F3F1EA', ''],
    ['ZW', 'Zinc White', 'PW4', 'white', '#F0F1EE', ''],
    ['LW', 'Lead White', 'PW1', 'white', '#EFEADC', ''],

    ['CLm', 'Cadmium Lemon', 'PY35', 'yellow', '#E8D51F', '#F5EE9E'],
    ['CYL', 'Cadmium Yellow Light', 'PY35', 'yellow', '#F2C318', '#F7E79E'],
    ['CYM', 'Cadmium Yellow Medium', 'PY35', 'yellow', '#F0A30F', '#F7DA90'],
    ['CYD', 'Cadmium Yellow Deep', 'PY35 / PO20', 'yellow', '#EA8912', '#F6CE8A'],
    ['HYL', 'Hansa Yellow Light', 'PY3', 'yellow', '#EEE13A', '#F6F2AA'],
    ['HYM', 'Hansa Yellow Medium', 'PY74', 'yellow', '#F2BE1A', '#F8E59D'],
    ['IY', 'Indian Yellow', 'PY153', 'yellow', '#D58714', '#F0CC8A'],
    ['NY', 'Naples Yellow', 'mixed', 'yellow', '#E6C27E', '#F2E3C2'],
    ['NTY', 'Nickel Titanate Yellow', 'PY53', 'yellow', '#EDDF97', '#F4EFCB'],

    ['CO', 'Cadmium Orange', 'PO20', 'orange', '#E5651B', '#F4B88E'],
    ['PyO', 'Pyrrole Orange', 'PO73', 'orange', '#E5501F', '#F3A98D'],
    ['TPO', 'Transparent Pyrrole Orange', 'PO71', 'orange', '#C8451F', '#EDAA8E'],
    ['PeO', 'Perinone Orange', 'PO43', 'orange', '#E05A1C', '#F2AE8C'],

    ['CRL', 'Cadmium Red Light', 'PR108', 'red', '#D0412C', '#EFA594'],
    ['CSc', 'Cadmium Scarlet', 'PR108', 'red', '#CB352A', '#EC9E94'],
    ['CRM', 'Cadmium Red Medium', 'PR108', 'red', '#B92E2B', '#E79A98'],
    ['CRD', 'Cadmium Red Deep', 'PR108', 'red', '#962428', '#DB9396'],
    ['PyR', 'Pyrrole Red', 'PR254', 'red', '#CB2B2B', '#EE9A9A'],
    ['NR', 'Naphthol Red', 'PR112', 'red', '#C2283A', '#EA96A4'],
    ['Vm', 'Vermilion', 'PR106 / hue', 'red', '#D6442A', '#F0A694'],
    ['QR', 'Quinacridone Red', 'PV19', 'red', '#AE1F3E', '#EB9AB0'],
    ['AC', 'Alizarin Crimson', 'PR83', 'red', '#5C1A26', '#D98399'],
    ['PAC', 'Permanent Alizarin Crimson', 'PR177 / PV19', 'red', '#66192A', '#DC889E'],
    ['PMr', 'Perylene Maroon', 'PR179', 'red', '#5A1C1F', '#CF9A99'],

    ['PRs', 'Permanent Rose', 'PV19', 'violet', '#B0205A', '#EC9EC0'],
    ['QM', 'Quinacridone Magenta', 'PR122', 'violet', '#8A2557', '#E2A0C7'],
    ['RM', 'Rose Madder', 'NR9 / hue', 'violet', '#A2334E', '#E6A6B8'],
    ['QV', 'Quinacridone Violet', 'PV19', 'violet', '#6A1E4A', '#D99CC0'],
    ['DP', 'Dioxazine Purple', 'PV23', 'violet', '#2E1A3F', '#A28FC6'],
    ['CV', 'Cobalt Violet', 'PV14', 'violet', '#8B5A9C', '#D5BDDD'],
    ['UV', 'Ultramarine Violet', 'PV15', 'violet', '#4D3A7A', '#B5A8D6'],
    ['MV', 'Mars Violet', 'PR101', 'violet', '#5A3036', '#B89A9C'],

    ['UB', 'Ultramarine Blue', 'PB29', 'blue', '#22285E', '#7D8ACB'],
    ['CoB', 'Cobalt Blue', 'PB28', 'blue', '#2A4AA0', '#8FA6DA'],
    ['CeB', 'Cerulean Blue', 'PB35 / PB36', 'blue', '#2E7DB7', '#9DC4E3'],
    ['PBG', 'Phthalo Blue (green shade)', 'PB15:3', 'blue', '#0D2E4A', '#6FA2D3'],
    ['PBR', 'Phthalo Blue (red shade)', 'PB15:1', 'blue', '#14245A', '#7590D3'],
    ['PrB', 'Prussian Blue', 'PB27', 'blue', '#172537', '#7F95AE'],
    ['InB', 'Indanthrone Blue', 'PB60', 'blue', '#1E2142', '#8A8FBE'],
    ['MnB', 'Manganese Blue', 'PB15 / hue', 'blue', '#2A8BAF', '#A6D3E3'],
    ['CoT', 'Cobalt Teal', 'PG50', 'blue', '#2BA39E', '#A5DDD6'],
    ['Ind', 'Indigo', 'mixed', 'blue', '#1E2433', '#8D93A3'],

    ['Vir', 'Viridian', 'PG18', 'green', '#1F5E4E', '#8FC0AE'],
    ['PG', 'Phthalo Green (blue shade)', 'PG7', 'green', '#0E3B33', '#6FB6A0'],
    ['PGY', 'Phthalo Green (yellow shade)', 'PG36', 'green', '#134A38', '#7DC0A0'],
    ['COG', 'Chromium Oxide Green', 'PG17', 'green', '#5A7144', '#B5C2A2'],
    ['SG', 'Sap Green', 'mixed', 'green', '#475A23', '#B3BF8F'],
    ['TV', 'Terre Verte', 'PG23', 'green', '#6F7A5A', '#C2C6B4'],
    ['PGL', 'Permanent Green Light', 'mixed', 'green', '#4E9A3A', '#B8DAA2'],
    ['CdG', 'Cadmium Green', 'PY35 / PG18', 'green', '#3C7B4C', '#A9CDB0'],
    ['HG', "Hooker's Green", 'mixed', 'green', '#2D5131', '#A0BBA2'],
    ['OG', 'Olive Green', 'mixed', 'green', '#5C5C2C', '#C1C09E'],

    ['YO', 'Yellow Ochre', 'PY43', 'earth', '#B98A44', '#E8D2A6'],
    ['YOP', 'Yellow Ochre Pale', 'PY43', 'earth', '#C9A464', '#EEDDB9'],
    ['GO', 'Gold Ochre', 'PY42', 'earth', '#B67B2C', '#E8CC9C'],
    ['TOY', 'Transparent Oxide Yellow', 'PY42', 'earth', '#A3721E', '#E3CC98'],
    ['RS', 'Raw Sienna', 'PBr7', 'earth', '#A2652A', '#E1C2A1'],
    ['BS', 'Burnt Sienna', 'PBr7', 'earth', '#7A3B24', '#D7A891'],
    ['TOR', 'Transparent Oxide Red', 'PR101', 'earth', '#8B3A1E', '#DDAE96'],
    ['LR', 'Light Red', 'PR101', 'earth', '#94402F', '#DFA79A'],
    ['VR', 'Venetian Red', 'PR101', 'earth', '#8A3A2E', '#D9A39B'],
    ['IR', 'Indian Red', 'PR101', 'earth', '#6C3330', '#C9A0A0'],
    ['TR', 'Terra Rosa', 'PR101', 'earth', '#A1513D', '#E1B1A4'],
    ['CM', 'Caput Mortuum', 'PR101', 'earth', '#4B2A2C', '#B39A9B'],
    ['RU', 'Raw Umber', 'PBr7', 'earth', '#3F3428', '#A79D90'],
    ['BU', 'Burnt Umber', 'PBr7', 'earth', '#4A3123', '#B39B8C'],
    ['VDB', 'Van Dyke Brown', 'NBr8 / hue', 'earth', '#3A2A22', '#A69588'],
    ['TOB', 'Transparent Oxide Brown', 'PR101 / PY42', 'earth', '#5E3220', '#C9A693'],

    ['IB', 'Ivory Black', 'PBk9', 'black', '#1C1E21', '#7B7F86'],
    ['MB', 'Mars Black', 'PBk11', 'black', '#1E1E1E', '#737373'],
    ['LB', 'Lamp Black', 'PBk6', 'black', '#1A1B1D', '#6F7379'],
    ['ChB', 'Chromatic Black', 'PG7 / PR101', 'black', '#1E2420', '#7C857F'],
    ['PyG', "Payne's Gray", 'mixed', 'black', '#2A3440', '#8C98A6'],
    ['DG', "Davy's Gray", 'PBk19', 'black', '#6E6C5F', '#BAB8AD'],
  ];

  const LIBRARY = ROWS.map(([code, name, pigment, category, hex, tint]) => ({ code, name, pigment, category, hex, tint }));
  const BY_CODE = new Map(LIBRARY.map((p) => [p.code, p]));

  // Palettes painters are known for, in the paints of this library nearest to what they used
  const PRESETS = [
    {
      id: 'zorn', name: 'Zorn', paints: ['TW', 'YO', 'CRL', 'IB'],
      about: 'Anders Zorn’s four colors. Warm and unified; next to warm skin, black and white read as blue.',
    },
    {
      id: 'zorn-blue', name: 'Zorn with a blue', paints: ['TW', 'YO', 'CRL', 'IB', 'UB'],
      about: 'Zorn’s four plus ultramarine, for cool shadows, eyes and blue clothing.',
    },
    {
      id: 'primary', name: 'Three primaries', paints: ['TW', 'CYM', 'CRM', 'UB'],
      about: 'A yellow, a red and a blue with white: everything is mixed, so the colors stay related.',
    },
    {
      id: 'cmy', name: 'Modern primaries (CMY)', paints: ['TW', 'HYM', 'QM', 'PBG'],
      about: 'Cyan, magenta and yellow pigments. Clean, strong mixes; skin needs care to keep from going pink.',
    },
    {
      id: 'split', name: 'Split primary', paints: ['TW', 'CLm', 'CYM', 'CRL', 'PAC', 'UB', 'PBG'],
      about: 'A warm and a cool version of each primary, so secondaries stay bright.',
    },
    {
      id: 'reilly', name: 'Frank Reilly', paints: ['TW', 'CYL', 'CO', 'CRL', 'AC', 'Vir', 'UB', 'RU', 'BU', 'IB'],
      about: 'The organized portrait palette Reilly taught at the Art Students League.',
    },
    {
      id: 'schmid', name: 'Richard Schmid', paints: ['TW', 'CLm', 'CYL', 'CYD', 'CO', 'CRM', 'PAC', 'TR', 'YOP', 'TOR', 'Vir', 'PG', 'CoB', 'UB'],
      about: 'The main palette from Alla Prima. No black: darks are mixed.',
    },
    {
      id: 'rembrandt', name: 'Rembrandt (earths)', paints: ['LW', 'YO', 'RS', 'BS', 'LR', 'RU', 'BU', 'IB', 'Vm'],
      about: 'Lead white, ochres, siennas, umbers and black, with a little vermilion.',
    },
    {
      id: 'sorolla', name: 'Sorolla (studio portraits)', paints: ['LW', 'NY', 'YO', 'RS', 'BS', 'Vm', 'RM', 'RU', 'BU', 'CoB', 'IB'],
      about: 'The palette Sorolla used for portraits indoors: earths, vermilion, rose madder, cobalt and black.',
    },
    {
      id: 'monet', name: 'Monet (impressionist)', paints: ['LW', 'CYL', 'CYM', 'Vm', 'RM', 'CoB', 'UB', 'Vir', 'PGL'],
      about: 'Bright pure colors with no earths or black, as the impressionists painted outdoors.',
    },
  ];

  window.Paints = { CATEGORIES, LIBRARY, PRESETS, byCode: (code) => BY_CODE.get(code) };
})();
