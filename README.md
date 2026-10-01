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

### Warm / cool map

Mixing one flesh color and lightening or darkening it with white and black makes skin look chalky: what models a head is the shift in temperature inside each value. **Show → Warm / cool** puts a map of those shifts next to the original. It keeps every pixel's value exactly and replaces its color with an exaggerated reading against the skin:

- **Map**: **Warm / cool** tints the skin orange where it is warmer than the skin spot, blue where it is cooler and gray where it is the same. **Red / yellow** reads across that: red where the skin is redder, yellow where it is yellower. That is how the forehead, cheeks and nose differ, and for skin a turn of hue barely moves it warmer or cooler.
- **Skin spot**: the color that shows as gray. Without a pick it is the typical color of the face the tool finds by itself: the most central, best-lit area of smooth, skin-colored pixels. **Pick skin spot**, then click a patch of skin on the original or on the map, such as the lit forehead. The five-by-five pixel patch there becomes the zero point and is ringed on the map. Spots that are too dark, nearly gray, or not between red and yellow the way skin is (a green wall, a blue shirt) are refused. **Use the whole face** goes back to the automatic one.
- **Compare with**: **Skin spot** measures everything against that one color. **Same value** measures the skin's light, halftone and shadow each against its own typical color, so only the shifts within a value show.
- **Detail**: **Smooth** reads each pixel, through the Simplify blur or a light blur of its own. **Blocks** reads each color block.
- **Exaggerate**: 1× to 5×, 3× by default. The map's colors are exaggerated on purpose: mix the shift, not the map's color.
- **Fade all but the skin** turns everything outside the measured skin pale gray and outlines the skin, so hair, clothes and background don't pull the eye.

Only the skin is measured. From the spot, the tool takes the connected pixels whose hue and chroma are close to the spot's at any value (shadows on skin keep their chroma; dark hair, red curtains and blue shirts don't match), stops at sharp value edges such as a hairline, and leaves out anything textured: skin is smooth, while hair, beards and fabric are not. That skin is split into its own light, halftone and shadow with the same three-class Otsu as **Auto split**, because a picture's value masses often put a whole face in one mass.

**Across the form**, under the map, lists the typical (median) color of each of the three parts and how it differs from the spot, then says how the temperature moves, for example: "The shadow is cooler than the light by 3: redder and grayer. The halftone is warmer than both the light and the shadow: keep the turn rich and warm rather than graying it." The numbers are steps in L\*a\*b\* along the map's axis; about 2 is just visible side by side. Hover the map and the loupe gives the same reading for the pixel under the cursor, with a chip of the color it is compared with next to the photo's color. A short card lists the three color zones of the face (forehead yellow; cheeks, nose and ears red; mouth to chin blue-gray) so you can test them on your own photo.

The map's settings are kept in your browser. Open `index.html#warm-cool` to start on this view.

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
