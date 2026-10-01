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
   - **Relationships** (0–100): the same score once one overall shift is set aside (see **Overall shift** below). Color accuracy always counts the shift, so both stay on screen.
   - **Value accuracy** (0–100): the same idea using lightness only, `100 − 5 × |ΔL*|`. Half a value step off scores 75.
   - **Value shapes match**: the share of the picture that lands in the same shadow, middle or light mass.
   - **Overall**: your value range, key and temperature against the reference's (see **Overall shift** below).
   - **Biggest differences**: the five shapes that cost the most, with the reference and your color side by side and plain notes such as "too light by 0.4 value, too warm". **As photographed | After overall shift** switches between the shapes as they are and what is left once the overall shift is set aside.
   - **Accuracy by shape**: the reference's color zones, each labelled with its match percentage (`100 − 2.5 × ΔE`, the same per-shape score the color accuracy averages). The biggest differences get white labels numbered as in the list. Zones too small to hold a label stay unlabelled. Hover any zone to see the reference color next to yours.

**Line up and color-correct your photo** (the panel above the score) makes the comparison fair:

- **Show reference on top** fades the reference over your painting so you can see where they differ.
- **Move**, **Size** and **Rotate** shift your photo until it lines up. Any part of the reference your photo no longer covers is left out of the score. It shows hatched on the accuracy-by-shape view, and the panel says how much was left out.
- **Ignore glare (shiny white spots)**, on by default, leaves out the white spots where light bounced off wet paint or varnish (see below) and says how much of the picture that was.
- **Fix color cast** removes the tint from warm or cool lighting. Click it, then click a spot on your painting that should be white or neutral gray, such as the paper edge. The five-by-five pixel patch there becomes neutral at the same brightness, and the same correction applies to the whole photo. Spots that are clearly a color rather than a white tinted by the light (skin, brick red, leaf green, orange) are refused, and the fix goes no further than ordinary lamps and daylight need: no channel halved, red or green at most doubled, blue at most tripled. Picking again replaces the earlier fix. **Remove color fix** undoes it. It corrects tint only, not exposure.

With the built-in sample, the tab opens with a made-up example painting, photographed slightly tilted, so you can see how the scoring and alignment work. Its darks are lifted and its colors warmer all over, and under that overall shift the lit side of the face is painted too dark and muddy: *As photographed* lists five shapes that all read "too warm", four of them "too light" as well, and *After overall shift* puts the muddy cheek first.

### Overall shift

Values are relationships. A painting whose darks are all a little too light, or whose colors are all a little too warm, gets the same note on shape after shape, and the real local mistakes get buried under it. A photo that is too bright or taken under warm light does the same. The **Overall** card, between the score and the list, names that one shift so you can fix it once, and shows what is left.

- **Value rulers**: two strips of gray chips from V 0 to V 10, the reference's above yours. A bar on each runs from the darkest dark to the lightest light (ignoring the last 2% at each end), and three ticks mark the middle value of the shadow, middle and light masses. Thin lines join each mark to the same mark on the other ruler, so a compressed range or a lifted shadow shows at a glance. Both pictures are read over the reference's masses and over the same pixels, so line your photo up first: if a small nudge would fit it clearly better, the card says so and offers a button that opens the line-up controls.
- **Findings**: up to three, ranked by the points of color accuracy each one costs, each with one thing to try. They name:
  - the **range** ("Your values span 4.5 steps; the reference spans 6.4. Your darks are 0.9 too light, and your lights are within 0.2."), or the **key** when darks and lights moved the same way ("Your whole picture is 0.8 value lighter"), with a reminder that an over- or underexposed photo does this too;
  - the **color shift**: warmer or cooler overall, more saturated or grayer, hues turned toward yellow or red. When light colors moved more than dark ones, the way they do in a photo taken under colored light, it says so and points to **Fix color cast**;
  - **light and shadow separation**: "Your shadows creep into the light", when the lightest quarter of the shadow family and the darkest quarter of the light family close in on each other by more than the range explains;
  - **temperature of the shadows against the lights**: "Your shadows are as warm as your lights; in the reference they are cooler."
- **Relationships** in the score is the color accuracy once the overall shift is set aside. Trust it when your photo's light or exposure differs from the reference. The note under it says how many points the shift costs.
- **After overall shift** re-ranks Biggest differences and relabels the accuracy map on what is left. Each shape is then compared with the reference color moved by the shift (the left swatch: what that shape would be if it followed the rest of your painting), and the notes read "too dark by 1.2 value for the rest of your painting". **Save PNG** on the accuracy map saves the view you are looking at.

How the shift is found: for every shape of a useful size (0.3% of the picture or more), the reference's and your most prominent colors are compared. Value is fitted as a straight line, `L*yours = range × L*ref + offset`; color as one similarity about neutral gray (a change of saturation, a turn of hue and a move), tried twice, once moving every color alike (a painter's habit) and once moving light colors more than dark ones (a photo's color cast), keeping the closer. Each fit is weighted least squares followed by three rounds with Huber weights, so a few badly painted shapes can't steer it. A temperature change between light and shadow can pass for an overall "grayer and warmer"; when moving the shadow and light families separately fits the colors much better, the step is treated as a relationship to fix and stays in the Relationships score. The fit needs at least 8 shapes (raise **Colors per value** if it asks for more), and a painting whose lights and darks don't follow the reference's pattern at all, such as a blank canvas, gets no Relationships score. The fit sets aside real habits along with camera errors, which is the point of the lesson, but it is why Color accuracy stays the main score.

**Glare**: a spot counts as glare if it is near-white and colorless (or clipped), smaller than 0.5% of the picture, clearly lighter than what is around it, and clearly lighter than the reference in the same place. So a white collar is too big to count, and a catchlight or teeth that the reference has too are kept. Glare spots, grown by a couple of pixels for their soft edges, are left out of both pictures and show hatched on the accuracy map; hover one to see "Glare". Turn **Ignore glare** off if it hides paint you meant.

## Running it

No build step or install. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

`index.html#check` opens the check tab, and `index.html#overall` goes straight to the Overall card with the example painting.

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
