# Portrait Value Studio

A browser tool for drawing and painting from reference portraits. Load a photo and it makes two studies next to the original:

- **Three values**: the photo simplified into large shadow, middle and light masses, each painted a single gray.
- **Color blocks**: the same value masses, split into a few color groups per value. Each group is filled with its most prominent color: the color that covers the most of it in the photo, not a mix of everything in it.

Hover any of the three images for a magnifying loupe that shows the pixels under the cursor, the hex code, and the value on a 0–10 scale. Click to add that color to the palette. You can sort the palette dark to light, copy it as hex codes, or save it as a PNG. The palette is kept in your browser between visits and shared by every tab you have the tool open in.

### Grid and reference lines

The toolbar above the images adds drawing aids that appear on every image at once:

- **Grid**: a 3 × 3 or 4 × 4 grid for transferring proportions to your paper.
- **Draw lines**: switch the pointer to *Draw lines* and drag on any image to draw a straight reference line, such as the eye line or the tilt of the head. Hold Shift to snap to 15° steps. The loupe shows the line's tilt while you draw. Pick a line color, **Undo line** (or Ctrl/⌘+Z), or **Clear lines**.

**Save PNG** includes the grid and lines when they are showing. Inside another site's frame, such as an artifact viewer, downloads can be blocked without any sign, so there **Save PNG** and **Save palette PNG** start the download and also open the image in a dialog: if no download arrives, right-click or long-press it to save. Opened directly, or in a frame on the same site that allows downloads, they just download.

### Check my painting

The second tab scores a photo of your finished piece against the reference.

1. Load, drop or paste a photo of your painting. Shoot it straight on, framed like the reference. It is cropped (or stretched) to match the reference and broken into color blocks with the same settings.
2. For each shape in the reference's color-block map, the most prominent reference color is compared with the most prominent color your painting has over the same pixels, using the CIEDE2000 color difference (ΔE).
3. You get:
   - **Color accuracy** (0–100): each shape scores `100 − 2.5 × ΔE`, weighted by its area.
   - **Value accuracy** (0–100): the same idea using lightness only, `100 − 5 × |ΔL*|`. Half a value step off scores 75.
   - **Value shapes match**: the share of the picture that lands in the same shadow, middle or light mass.
   - **Biggest differences**: the five shapes that cost the most, with the reference and your color side by side and plain notes such as "too light by 0.4 value, too warm".
   - **Accuracy by shape**: the reference's color zones, each labelled with its match percentage (`100 − 2.5 × ΔE`, the same per-shape score the color accuracy averages). The biggest differences get white labels numbered as in the list. Zones too small to hold a label stay unlabelled. Hover any zone to see the reference color next to yours.

**Line up and color-correct your photo** (the panel above the score) makes the comparison fair:

- **Show reference on top** fades the reference over your painting so you can see where they differ.
- **Move**, **Size** and **Rotate** shift your photo until it lines up. Any part of the reference your photo no longer covers is left out of the score. It shows hatched on the accuracy-by-shape view, and the panel says how much was left out.
- **Fix color cast** removes the tint from warm or cool lighting. Click it, then click a spot on your painting that should be white or neutral gray, such as the paper edge. The five-by-five pixel patch there becomes neutral at the same brightness, and the same correction applies to the whole photo. Spots that are clearly a color rather than a white tinted by the light (skin, brick red, leaf green, orange) are refused, and the fix goes no further than ordinary lamps and daylight need: no channel halved, red or green at most doubled, blue at most tripled. Picking again replaces the earlier fix. **Remove color fix** undoes it. It corrects tint only, not exposure.

With the built-in sample, the tab opens with a made-up example painting, photographed slightly tilted, so you can see how the scoring and alignment work.

### Mixing recipes

**Show recipes** (in the palette header) puts a starting mix under every palette color, made only from the paints you own, such as `W 13 · YO 4 · CR 3 · IB touch`. Each line shows the color next to the predicted mix and a badge with the CIEDE2000 difference:

- **close**: ΔE under 3, hard to see.
- **near**: ΔE 3 to 6, a small difference to correct by eye.
- **out of reach**: these paints can't make it, with a note such as "nearest mix is grayer and lighter". A saturated blue with the Zorn palette is the classic case: the card suggests a nearby gray instead, since next to warm skin, black and white read as blue.
- **darkest mix** / **lightest mix**: the right color, but darker or lighter than paint goes, like a photo's black. Use that mix and keep the values around it in step.

Tap a recipe for the **How to mix** card: the color and the predicted mix side by side, a bar of the proportions, and the steps in order ("Start with 13 parts Titanium White. Add 4 parts Yellow Ochre. Add 3 parts Cadmium Red Light, a little at a time…"). Paints under 1/15 of the pile are written as a touch, with roughly how much ("about 1/40 of the pile"). The last step gives the value to check against the reference.

**My paints** (under the palette header) sets the paints: Zorn (Titanium White, Yellow Ochre, Cadmium Red Light, Ivory Black), Zorn + Ultramarine, Classic portrait oil (nine paints) or Earth palette, each of which you can change, or **My own paints**, which starts with white alone. Each paint has a **tinting strength** (weak, normal or strong) for tubes that go further or less far in white than usual. **Add a paint** takes its tube color and, optionally, a swatch of 1 part paint to 4 parts white: paint both, photograph them in daylight and match the two colors, and the tool fits the paint's strength to the tint. Your paints are kept in your browser.

**Show mixing sheet** (in the Color blocks settings) lists a recipe for every block color, grouped shadow, middle and light and darkest first, to premix before painting. **Copy mixing sheet** copies it as text. With recipes showing, **Copy hex codes and recipes** and **Save palette PNG** include them; in the PNG, the band along the bottom of each swatch is the predicted mix.

Every recipe is a starting mix, to adjust by eye. The paints are modelled from on-screen colors of typical artist-grade oils; real tubes vary by brand, oil and acrylic behave differently, and glazes and drying shifts are ignored. Watercolor, where the paper is the white, isn't covered.

## Running it

No build step or install. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

To load a photo, use **Load photo**, drag it onto the page, or paste it. Transparent parts of a PNG, such as the background of a cut-out portrait, are placed on mid gray.

## Settings

| Setting | What it does |
| --- | --- |
| Simplify | Blurs detail before the value split so values gather into larger masses. |
| Merge small shapes | Folds any shape smaller than a size threshold into the neighbor it shares the most edge with. |
| Working size | The resolution the studies are computed at (600 / 900 / 1400 px on the long side). |
| Shadow / middle and middle / light splits | Where the value scale is cut. **Auto split** picks them from the photo with three-class Otsu thresholding. |
| Gray values | **Set values** lets you choose each output gray (V 2 / 5 / 8.5 by default). **Photo average** uses the average value of each mass. |
| Colors per value | How many color groups (k-means) each value mass is split into. |
| Outline shapes | Draws the shape borders on both studies, for transferring to a drawing. |

## How it works

All the math uses CIE L\*a\*b\*, so "value" means perceived lightness (L\*). Munsell-style value is shown as L\* / 10.

1. The photo is scaled to the working size and converted to Lab (`js/processing.js`, `prepare`).
2. Lightness and color are blurred with three box-blur passes, which approximate a gaussian (`Simplify`).
3. Each pixel goes into shadow, middle or light by its blurred L\*. Small connected shapes are then merged away.
4. Within each value mass, k-means clusters the blurred colors, weighting chroma a little more than lightness. Small shapes are merged again, but only into shapes of the same value, so blocks never cross value boundaries.
5. Each color group is filled with its most prominent color. The group's original pixels are sorted into Lab bins about 4 L\* by 6 a\*/b\* wide, with neutral gray in the middle of a bin. The fullest bin wins, counting its neighbouring bins too so a color split across a bin edge isn't outvoted, and only its pixels are averaged, so the result is a color that is really in the photo. A bin with under half the pixels of its fullest neighbour can't win, so a nearly empty bin between two full ones is never picked. The painting check measures each shape the same way.

Averaging RGB turns yellow and blue gray instead of green, so mixing recipes (`js/mixing.js`) model paint instead. Each paint's color becomes a smooth reflectance curve over 38 wavelength bands with the method from [spectral.js](https://github.com/rvanwijnen/spectral.js) (MIT), and paints mix by single-constant Kubelka–Munk theory: each band's K/S = (1 − R)² / 2R is averaged, weighted by parts × tinting strength, and turned back into reflectance, then L\*a\*b\*. A paint's strength is fitted so its 1 : 4 tint with white matches the tint swatch. The search tries every set of up to three paints besides white in every proportion in tenths, with as much white as brings it to the target's value; fine-tunes the six best sets; and writes each as whole parts (up to 24) plus touches. The cheapest recipe wins: ΔE + 0.6 for each paint after the first + 0.02 per part, so a simpler recipe beats a slightly closer one. Recipes are worked out a few milliseconds at a time so the page stays responsive.

## Files

- `index.html`: page structure
- `styles.css`: layout and theme (light and dark)
- `js/processing.js`: image processing (no dependencies)
- `js/mixing.js`: paint mixing model and recipe search (no dependencies; spectral data from spectral.js, MIT)
- `js/app.js`: controls, loupe, palette and the built-in sample portrait
