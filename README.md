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
   - **Feedback**: what's working, your next step and the three value masses (see below).
   - **Color accuracy** (0–100): each shape scores `100 − 2.5 × ΔE`, weighted by its area.
   - **Value accuracy** (0–100): the same idea using lightness only, `100 − 5 × |ΔL*|`. Half a value step off scores 75.
   - **Value shapes match**: the share of the picture that lands in the same shadow, middle or light mass.
   - **Biggest differences**: the five shapes that cost the most, with the reference and your color side by side and plain notes such as "too pink, too light by 0.4 value", in the same terms as the next step (below). The list folds away; it starts open on wide screens and closed on phones.
   - **Accuracy by shape**: the reference's color zones, each labelled with its match percentage (`100 − 2.5 × ΔE`, the same per-shape score the color accuracy averages). The biggest differences get white labels numbered as in the list, and what's working gets green labels lettered as in the feedback (a strongest area below 90% keeps a gray label with its letter). The next step's shape is ringed in white. Zones too small to hold a label stay unlabelled. Labels and ring are part of the picture, so **Save PNG** keeps them. Hover any zone to see the reference color next to yours.

### Feedback: what's working, then one next step

Above the score, three short blocks read your painting the way a teacher marks it: a real strength first, then one change you can make, value before color.

- **What's working**: up to three of the largest shapes that match at 90% or better, named by their mass and where they sit ("The light shape at the upper left is spot on: 96% match"). They are lettered A, B and C, with green labels to match on **Accuracy by shape**. A whole mass is praised too when 90% or more of it sits in the same place as the reference's, or when its values score 90 or more. Praise is only given when it is true: if no shape reaches 90%, the block names your strongest large shape, lettered A in gray on the map, and says none is at 90% yet. That is never one of the biggest differences, the next step or a shape that is far off (50% or less), so a costly shape is never called strong. With no such shape it names the mass most in place (when at least half of it is), or says plainly that nothing matches closely yet.
- **Your next step**: the one shape worth the most points, with what to do with the brush ("Make the middle-value shape at the upper left less pink and darken it by about 0.4 value") and the reference and your color side by side. It says what matching that shape alone does to your color score, from 68 to 75 for example: the points it loses now (its share of the picture × (100 − its match)) added back. The figure is exact for that one shape at the current settings. While value accuracy is under 70, the step is always a value fix: the shape worth the most value points, worded with lightness only, and its payoff is in value points. A step worth less than a point isn't given; with nothing left to fix it says so.
- **The brush instruction** names the fewest changes that close at least three quarters of the shape's difference, biggest first, so it never leaves out the main error while the payoff counts it. The changes are value (lighten or darken by about so much), warm-cool, the hue across warm-cool and chroma (gray it down or give it more color). On a warm color such as skin that hue reads as pink or yellow ("less pink"); on grays and cool colors as purple or green ("less purple", or "more green" where your color is gray and the reference greenish). A value change of 0.3 or more is always named.
- **Value masses**: for shadow, middle and light, a bar for that mass's value accuracy, which way it leans (too light or too dark when it is off by 0.3 value or more on average, on target, or some of each) and its shape match: how much of your mass overlaps the reference's, as a share of both together.

Places come from how a shape falls on a 3 × 3 grid over the picture: the cell holding half of it or more ("at the upper left", "in the center"), else the row, column or corner holding three quarters ("across the top", "down the left side", "toward the lower right"), else the sides it reaches ("at the top and sides", "around the edges"). So nudging your photo moves a name to a neighboring one at most, never across the picture. They are coarse on purpose: the tool knows shapes, not anatomy, so a nose shadow may be called "in the center". The letter or ring on the map shows exactly which shape is meant.

**Just my next step** hides everything but the step. The choice is remembered in your browser. The grade under the color score is worded as progress, such as "Close: a few shapes to adjust". Below 60 it reads "Solid start: the big shapes are there" only when 70% or more of the value shapes match.

A photo that is tilted or off-center makes shapes look wrong that aren't. When the value shapes match under 75% and the photo hasn't been moved, the next step adds a reminder to line it up first if it is. The line-up panel's "moved, N% left out" note stays in view in every mode.

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
