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

### Train your eye

The third tab turns the reference into short drills for judging value and temperature. The loupe, grid and lines are off there, so nothing gives the answer away. A round is ten questions; after each answer a card shows what the spot really is and, when the photo shows one, the likely reason you were off.

- **What value?** A ring marks one spot. Pick its value from the eleven gray chips, V 0 to V 10, or press 0–9. The card puts the spot's color next to the gray of the same value and says how far off you were: within 0.5 is *spot on*, within 1 is *close*. Causes it names: saturated colors read lighter than they are, dark or light surroundings push a spot the other way, and shadows tend to look lighter and lights darker than they are. **Spots from** limits a round to the shadows, middles or lights.
- **Which is lighter?** Two rings, A and B, 0.3 to 1.5 values apart (press A or B, or tap a ring). About six pairs in ten are traps, where the darker spot is the more colorful one or the surroundings make it look lighter; the rest differ in color the other way, so "pick the grayer one" is no shortcut. Spots near black or white are left out, where small differences are noise. A photo with few such pairs falls back to pairs of one color, then to pairs further apart in value, and says so.
- **Shadow, middle or light?** Is the spot in the shadow, middle or light mass of your three-value study (S, M, L)? It follows your splits, and only asks about spots that sit clearly inside a mass.
- **Which is warmer?** Two spots of about the same value. Warmer means nearer orange on the color wheel: when both spots have color, the warmer one also has the hue nearer orange, so a strong pink never counts as warmer than a soft orange.

**See the photo in gray** (or G) shows the whole picture as values after an answer. The round's summary gives the average miss, or how many were right, your bias for each mass ("Shadows: 0.7 too light"), a comparison with your last round of the same drill and, for the pair drills, what fooled you most. Answers are kept in your browser (the last 300) for the long-run bias; without storage they last for the visit.

Spots are only taken where the photo is even: inside the ring the lightness varies by no more than 0.6 of a value between its ninths and its pixels scatter little, and the whole ring sits in one value mass. A spot's value is the median L\* of the pixels inside the ring, divided by 10, so it is the value *in this photo*: it depends on the photo's exposure and on your screen. Skin-colored spots and spots near the middle of the picture come up more often, and pairs favour neighbouring areas. Busy, tiny or flat photos get looser limits or a plain message saying which drill can't run on them and why.

On the **Check my painting** tab, when one value mass of your painting is off by 0.3 or more on average, a **Practice judging** button opens a value round on just that mass.

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
- `js/eye-trainer.js`: the Train your eye drills
- `js/app.js`: controls, loupe, palette and the built-in sample portrait
