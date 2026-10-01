# Portrait Value Studio

A browser tool for drawing and painting from reference portraits. Load a photo and it makes two studies next to the original:

- **Three values**: the photo simplified into large shadow, middle and light masses, each painted a single gray.
- **Color blocks**: the same value masses, split into a few color groups per value. Each group is filled with its most prominent color: the color that covers the most of it in the photo, not a mix of everything in it.

Hover any of the three images for a magnifying loupe that shows the pixels under the cursor, the hex code, and the value on a 0–10 scale. Click to add that color to the palette. You can sort the palette dark to light, copy it as hex codes, or save it as a PNG. The palette is kept in your browser between visits and shared by every tab you have the tool open in.

### Grid and reference lines

The toolbar above the images adds drawing aids that appear on every image at once:

- **Grid**: a 3 × 3 or 4 × 4 grid for transferring proportions to your paper.
- **Draw lines**: switch the pointer to *Draw lines* and drag on any image to draw a straight reference line, such as the eye line or the tilt of the head. Hold Shift to snap to 15° steps. The loupe shows the line's tilt while you draw. Pick a line color, **Undo line** (or Ctrl/⌘+Z), or **Clear lines**.
- **Measure** and **Plumb**: compare lengths against a unit, and see what lines up. See below.

**Save PNG** includes the grid, lines, measures and plumb lines when they are showing. Inside another site's frame, such as an artifact viewer, downloads can be blocked without any sign, so there **Save PNG** and **Save palette PNG** start the download and also open the image in a dialog: if no download arrives, right-click or long-press it to save. Opened directly, or in a frame on the same site that allows downloads, they just download.

### Measure in units: plumb lines and levels

Proportion mistakes, such as eyes set too high, a head too narrow or a mouth off the center line, are the most common ones in a portrait. Atelier painters catch them by comparative measuring: choose one length you can see on the sitter as the unit, such as eye line to chin, and check every other length against it. Two more settings of the toolbar's **Pointer** do this. Like the lines, everything they draw shows on every image at once, including the panels on the **Check my painting** tab, so the reference's measurements lie over your painting.

- **Measure**: drag from one landmark to another. The first length you drag is the unit: it is drawn thicker, in yellow, and labelled **1 U**. Every later length is labelled with how many units long it is, plus the nearest whole number, half, third or quarter when the length as shown is within 0.03 of one, and within 4% of a small one, such as `1.48 U ≈ 1½`. So 0.48 U and 0.52 U are both called ½, but 0.36 U is not called ⅓. While you drag, the loupe shows the pixels under the end of the line, its length in units and its tilt; hold Shift to snap to 15°. Lengths are measured on the reference's pixels, so every image and every working size gives the same answer. On the sample, with eye line to chin as the unit, the face's width at the cheekbones reads 1.40 U (250 px over 178 px).
  - **Make last line the unit** turns the newest measure into the unit and relabels the rest.
  - **Unit on my canvas**: type how long you made the unit on your canvas or paper, in cm or inches, and every label adds the length to draw there, such as `1.40 U · 12.6 cm`. Inches are rounded to the nearest eighth, as on a ruler. The length is kept in your browser between visits. With the grid on, the hint also gives a grid cell's width and height in units and on the canvas.
  - Labels sit beside their lines, the unit's first. A label never covers another label, a leader or the accuracy map's percentages, and it keeps off the other lines where it can. It covers another measure's end tick, where a length is read, only when there is no other place for it. When the space beside its line is taken, it slides along the line, steps away from it or sits past an end. A label that has to move away from its line, or that sits as near another measure as its own, gets a thin leader back to its line, ending in a dot. A leader never runs behind another label, so you can follow it from the dot to the reading. On a crowded picture, a label with no room for the whole reading shows the length in units alone, such as `0.98 U`. While you drag out a measure, the other labels stay where they are, and they make room for the new one when you let go. The unit's line is drawn over the others, so it stays yellow where a later measure shares its path. A line too short to show between its end ticks goes without a label, as does one with no room at all, such as on a very small photo or among twenty or more measures; the loupe still reads it while you drag.
- **Plumb**: click an image to drop a plumb line and a level, dashed lines straight down and straight across the whole picture, through that point. They show what sits over what: the inner corner of an eye over the wing of the nose, the top of the ear level with the brow. Drag a point's ring to move it; click the ring again to remove it.

**Undo measure** and **Undo plumb line** take back the last step of their own tool, as **Undo line** does for lines. Ctrl/⌘+Z takes back whichever step came last, from any of the three, including moving or removing a plumb point or changing the unit. Loading a new photo clears all three.

Measurements are true to the photo, not to the sitter. A phone held close to a face enlarges the nose and shrinks the ears, so measure photos taken from 1.5 m or more, zoomed in. While you measure or drop plumb points, touching an image draws instead of scrolling the page, as with **Draw lines**.

### Hard edges stay hard

**Simplify** smooths the photo before it is split into values. A plain blur turns every hard edge, such as a lit face against dark hair, into a ramp through the middle values, and the split would draw that ramp as a thin gray outline the photo doesn't have. Any thin middle band that runs between shadow and light is split between the two at its halfway value instead, so a hard edge goes straight from shadow to light. A narrow halftone with middle values of its own, such as reflected light along the jaw or the side of the nose, stays. Halftones narrower than about 4 px at the working size can't be told apart from the edge itself and are split too. With Simplify off nothing is smoothed, and every pixel is split by its own value.

**Smoothing**, under Simplify, chooses how the photo is smoothed:

- **Soft** blurs everything evenly, for rounder masses.
- **Edge-aware** (the default) flattens detail inside shapes but keeps edges where the photo has them. The corners of shadow shapes stay sharp, small dark shapes such as nostrils keep their place, and the color blocks don't spend a color on the in-between colors along an edge. The more you simplify, the stronger a step has to be to count as an edge, so small features still merge into larger masses. Hair, glasses frames and patterned clothing can stay busier than with Soft; **Merge small shapes** or Soft calms them.

The choice is kept in your browser between visits. The painting check simplifies your painting the same way.

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
| Simplify | Smooths detail before the value split so values gather into larger masses. |
| Smoothing | **Soft** blurs evenly. **Edge-aware** flattens detail inside shapes but keeps edges where the photo has them. |
| Merge small shapes | Folds any shape smaller than a size threshold into the neighbor it shares the most edge with. |
| Working size | The resolution the studies are computed at (600 / 900 / 1400 px on the long side). |
| Shadow / middle and middle / light splits | Where the value scale is cut. **Auto split** picks them from the photo with three-class Otsu thresholding. |
| Gray values | **Set values** lets you choose each output gray (V 2 / 5 / 8.5 by default). **Photo average** uses the average value of each mass. |
| Colors per value | How many color groups (k-means) each value mass is split into. |
| Outline shapes | Draws the shape borders on both studies, for transferring to a drawing. |

## How it works

All the math uses CIE L\*a\*b\*, so "value" means perceived lightness (L\*). Munsell-style value is shown as L\* / 10.

1. The photo is scaled to the working size and converted to Lab (`js/processing.js`, `prepare`).
2. Lightness and color are smoothed (`Simplify`). **Soft** uses three box-blur passes, which approximate a gaussian. **Edge-aware** uses the domain transform recursive filter (Gastal and Oliveira 2011) on L\*, a\* and b\* together, with the same spread as the blur. Along each row and column, a color step counts as distance: a 30 L\* step as much as 1% of the picture's long side, so the smoothing flows inside shapes and stops at hard edges. The filter is guided by the box blur first and then by its own result, two rounds of rolling guidance (Zhang et al. 2014), so fine texture the blur removes, such as hair strands, pores and noise, doesn't stop it.
3. Each pixel goes into shadow, middle or light by its smoothed L\*. Where the middle zone is thinner than about 2σ + 2 px (σ is the blur's spread) and lies between shadow and light, it is split between the two at the smoothed value halfway between the splits. A pixel there keeps the middle value if its own L\* (barely blurred) is a middle value, unless shadow and light values are both within 2 px of it. Small connected shapes are then merged away.
4. Within each value mass, k-means clusters the smoothed colors, weighting chroma a little more than lightness. Small shapes are merged again, but only into shapes of the same value, so blocks never cross value boundaries.
5. Each color group is filled with its most prominent color. The group's original pixels are sorted into Lab bins about 4 L\* by 6 a\*/b\* wide, with neutral gray in the middle of a bin. The fullest bin wins, counting its neighbouring bins too so a color split across a bin edge isn't outvoted, and only its pixels are averaged, so the result is a color that is really in the photo. A bin with under half the pixels of its fullest neighbour can't win, so a nearly empty bin between two full ones is never picked. The painting check measures each shape the same way.

## Files

- `index.html`: page structure
- `styles.css`: layout and theme (light and dark)
- `js/processing.js`: image processing (no dependencies)
- `js/app.js`: controls, loupe, palette and the built-in sample portrait
