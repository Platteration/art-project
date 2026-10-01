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

### Paint it in steps

The third tab shows the reference as a block-in, painted from big shapes to small in seven steps. It is one method among several (a shadow-first block-in), meant as an order to try, not a rule. Pick a step, or use **Previous step** and **Next step**:

1. **Draw the big shapes**: the outline of the two-value light and shadow shapes, drawn on a toned mid-value ground.
2. **Fill the shadows**: every shadow filled with one dark mix, hair and background darks included.
3. **Fill the lights**: one light mix for the rest, which makes a two-value poster.
4. **Find the halftones**: the shadows stay exactly as they were; the light is split into halftone and light at your **Middle / light split** (or, if that is not above the shadow line, at a split picked from the light shapes).
5. **Shift the color inside each mass**: the same masses, each with two colors from the photo, named by how they differ (warmer and cooler, grayer and more saturated, or lighter and darker).
6. **Paint the smaller shapes**: less simplified shapes, with your **Colors per value**.
7. **Accents and highlights last**: step 6 with the small darkest darks and brightest lights painted in, ringed (solid rings for dark accents, dashed for highlights) and counted, such as "3 dark accents and 5 highlights; keep them this small."

A card next to the picture explains each step in a few sentences and lists the colors it adds, each with **Add to palette** (or **Add all to palette**), with its value and how much of the picture it covers. **Show what's new** grays out everything the step left unchanged: in step 4 only the halftones keep their color, and in step 5 only the second mix of each mass. Hovering samples colors as on the other images, the grid and reference lines appear here too, **Save PNG** saves the step as shown, and the step you were on is remembered.

How the steps are made:

- The steps use their own 600 px copy of the photo, and steps 1 to 5 use fixed Simplify and Merge settings (7 and 8, then 4 and 5) so the shapes stay big. Step 6 uses Simplify 2 and Merge 3.
- The shadow line is a two-class Otsu split of the simplified values.
- The one-mix steps (2 to 4) fill each mass with the average of everything in it, in L\*a\*b\*, so a mass that covers dark hair and skin in shadow gets a color between them. That is a deliberate simplification: from step 5 on, each color group is filled with its most prominent photo color, as in the color blocks.
- Accents are spots of the photo at least 12 L\* darker or lighter than the step 6 shape painted over them, and at least 6 L\* against their own surroundings. Dark accents must be darker than the shadow line, highlights lighter than the halftone split. Thin streaks (a strand of hair, a fold) and spots over half a percent of the picture are left out, a cluster such as flag stars or curls counts once, and only the strongest few are kept, at most six of each. Spots toward the middle of the picture, where the face usually is, rank higher.
- **This photo has flat lighting; start from step 4** appears on steps 1 to 3 when under a fifth of the border between the two-value masses turns gradually. Under directional light much of that border is a form turning slowly into shadow; under flat light the two masses are just dark and light things (hair, clothes, background) with sharp edges between them. The check is cautious: it flags clearly flat photos, but a flat-lit face against a soft, out-of-focus background can pass without the note.

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

## Files

- `index.html`: page structure
- `styles.css`: layout and theme (light and dark)
- `js/processing.js`: image processing (no dependencies)
- `js/app.js`: controls, loupe, palette and the built-in sample portrait
- `js/lesson.js`: the Paint it in steps tab
