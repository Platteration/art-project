# Portrait Value Studio

A browser tool for drawing and painting from reference portraits. Load a photo and it makes two studies next to the original (a Paint by numbers game and a Studio to paint in follow, in their own tabs, and a drawer checks your painting against the reference):

- **Dark, middle, light** (the three-value study): the photo simplified into large shadow, middle and light masses, each painted a single gray.
- **Big color shapes** (the color-block study): the same value masses, split into a few color groups per value. Each group is filled with its most prominent color: the color that covers the most of it in the photo, not a mix of everything in it. **Lean toward lighter tones** (in Colors and paints, 60% by default) corrects a dark bias in that choice: in a lit face most pixels of a group sit on its darker side, so the busiest color reads dark and a few lighter highlights lose. With the lean up, a group takes the lightest color of the same hue that is still common enough in it (at 100%, one a quarter as common as the busiest), so lit skin keeps its lights; at Off it takes the most common color as before. The same setting applies to the game board and to Check my painting, which reads both pictures the same way, so it doesn't count as a miss. It is remembered between visits. The switch above it shows the blocks in the photo's colors (**Photo**) or as your palette mixes them (for example **Zorn**): each block is repainted with the closest mix the palette makes, so you can see the painting your paints would give. The palette is the one chosen under **Colors and paints**, or, until you choose one, the known palette that mixes the study best. The choice is remembered, and the magnifier and **Save PNG** use the colors shown.

A bar of tool icons sits beside the images (a row pinned to the top of the screen on a phone). Press an icon to use that tool; press it again to turn it off, so touching an image just scrolls the page.

- **Magnifier** (on at the start): hover any image to see the pixels under the pointer magnified, with the hex code and the value on a 0–10 scale. Click to keep that color in **Picked colors**.
- **Lines**, **Measure** and **Plumb**: the drawing and measuring tools below. Each shows how many lines, measures or plumb points it has drawn. While one is on, its options (line color, undo, clear, the unit on your canvas) and a short how-to sit above the images.
- **Grid**: steps through off, 3 × 3 and 4 × 4.

The settings fold away into three drawers beside the tool bar (above it on a phone), so the page shows only the studies until you need more. Each drawer's header says what it is set to, such as `Splits at V 2.7 and 4.6`, so it can stay closed. The drawers you leave open are opened again on your next visit.

- **Dark, middle, light**: in Simple mode a Detail preset (Soft, Normal, Sharp); in Advanced mode Simplify, Smoothing, Merge small shapes, Working size, the value splits and gray values.
- **Colors and paints**: Colors per value, and paints for the study: known palettes ranked for this photo, or a palette chosen from the paints you own, with a starting mix for every color.
- **Picked colors**: the colors you clicked. Sort them dark to light, copy them as hex codes, or save them as a PNG. They are kept in your browser between visits and shared by every tab you have the tool open in.

### Grid and reference lines

The tool bar adds drawing aids that appear on every image at once:

- **Grid**: a 3 × 3 or 4 × 4 grid for transferring proportions to your paper.
- **Lines**: choose it and drag on any image to draw a straight reference line, such as the eye line or the tilt of the head. Hold Shift to snap to 15° steps. The loupe shows the line's tilt while you draw. Pick a line color, **Undo line** (or Ctrl/⌘+Z), or **Clear lines**.
- **Measure** and **Plumb**: compare lengths against a unit, and see what lines up. See below.

**Save PNG** includes the grid, lines, measures and plumb lines when they are showing. Inside another site's frame, such as an artifact viewer, downloads can be blocked without any sign, so there **Save PNG** and the picked colors' **Save as PNG** start the download and also open the image in a dialog: if no download arrives, right-click or long-press it to save. Opened directly, or in a frame on the same site that allows downloads, they just download.

### Measure in units: plumb lines and levels

Proportion mistakes, such as eyes set too high, a head too narrow or a mouth off the center line, are the most common ones in a portrait. Atelier painters catch them by comparative measuring: choose one length you can see on the sitter as the unit, such as eye line to chin, and check every other length against it. Two more tools on the tool bar do this. Like the lines, everything they draw shows on every image at once, including the panels on the **Check my painting** tab, so the reference's measurements lie over your painting.

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

### Paints for the study

**Colors and paints** plans the paints for the color-block study. Every color in it gets a starting mix: which paints, in roughly how many parts, such as `TW 6 · YO 2 · CRL 1 · IB touch`. A badge says how close the mix comes: **Close** (ΔE under 3), **Near** (under 6) or **Out of reach**. **Darkest you can mix** and **Lightest you can mix** mark a photo's darks and lights that go further than paint does. Hover a mix for the paints' full names, and press **+** to keep that color with your picked colors.

- **Known palettes** lists ten palettes painters are known for, ranked by how many of this study's colors each can mix and then by how closely: Zorn, Zorn with a blue, three primaries, modern primaries (cyan, magenta and yellow), split primary, Frank Reilly, Richard Schmid, Rembrandt's earths, Sorolla's studio portrait palette and Monet's impressionist palette. Pick one to see its paints and the mixes. The ranking changes with the photo: a warm portrait on a gray ground suits Zorn, while a blue shirt needs a palette with a blue.
- **My paints**: **Choose my paints** opens a library of 77 artist paints in nine families (whites, yellows, oranges, reds, pinks and violets, blues, greens, earths, and blacks and grays), each with its pigment code and a swatch of the tube color beside its tint with white. Tick the paints you own, or tick a known palette's paints in one go. **Suggest a palette** then chooses a working palette from them for this photo: a white (titanium if you have it), then one paint at a time, whichever brings the study's colors closest with what is already on the palette, until another paint would barely help or the palette reaches the size you set (3 to 10 paints plus white). With no paints ticked, it chooses from the whole library. Your paints are kept in your browser between visits.

The mixes are worked out with a pigment model, not by averaging screen colors (which would make yellow and blue gray instead of green). Each paint is a reflectance curve over the visible spectrum, rebuilt from its color the way spectral.js does it, and paints mix by single-constant Kubelka-Munk theory, weighted by each paint's tinting strength, which is fitted to its tint with white. A recipe tries every set of up to three paints plus white in every proportion, then refines the best. The paint colors are estimates for typical artist-grade oils, not measurements of any maker's tubes, so every mix is a starting point to adjust by eye.

### Studio

The second tab is a paper to paint on, with the studio's own paints and mixing model. The paper fills the screen; one strip of small icons holds every tool, at the bottom on a phone and down the left on a wider screen. A tool's options, the paints, the reference, the canvas and the zoom open as small sheets over the paper and close when you paint. On a phone the page header and tabs step aside while you paint; the first icon on the strip leads back.

- **Brushes**: the chisel (a flat tip at a fixed angle, in small, medium and large), the round brush (with a scale slider), the pencil (graphite in 2H, HB and 4B, or charcoal in hard, medium and soft, both with a size slider and drawing in black or white only; pen pressure counts), the underdrawing brush (the same pencil on its own layer beneath the paint, which can be shown, hidden or cleared and never mixes with the painting; **Copy the Study lines** draws the grid, lines, measures and plumb lines from the Study tab on it in pencil, with the lead, hardness, size and color set for the underdrawing, fitted to the paper as the reference would be) and the blend fan brush (drags the paint already on the paper, with size and strength). The brushes share one icon: tap it after another tool to get the last brush back as it was, or while a brush is in hand to open the row of brushes and their options.
- **Eraser**: tap to use it, tap again for its size. It rubs out whichever layer was drawn on last.
- **Paints**: the known palettes and My paints from the Study tab; until you choose one here, the palette follows the Study tab's. Tap a paint to put a part of it in the mixing well (the amount per tap is a slider), and the well shows the mix as the pigment model predicts it. **Lock in** keeps the mix under My mixes and puts it on the brush; tap a kept mix to paint with it and to put its parts back in the well, ready to build on. The palette starts with eight skin tones mixed from it (a light complexion in the light, half tone and shadow, a medium and a deep one in the light and shadow, and a cheek), found by trying every pair of its paints with a little to a lot of white. Mixes you lock in are kept between visits.
- **Reference**: the Study tab's photo, or a generated portrait as the game deals them, floating over the paper where you drag it. Show it as the original, the three-value study or the color-block study, as the Study tab makes them; size it, or hide it.
- **Canvas**: the ground (raw canvas, a thin wash of one of your paints at a chosen strength, or a mid-value gray), a linen or paper texture over everything, and **Save as PNG**, which flattens the ground, underdrawing, paint and texture into one picture.
- **Zoom and pan**: zoom up to four times with sliders that slide the paper under the brush, and **Fit to screen**.
- **Undo**, **Turn the paper** (portrait or landscape, keeping what is on it) and **Clear**.

### Paint by numbers

The third tab is a timed game on the color-block study. The reference becomes a paint-by-numbers board: its color groups, outlined in black and numbered from the darkest (1) to the lightest. A photo is simplified exactly as the **Study the reference** tab simplifies it, with the same working size, value splits, simplify, smoothing and merge, so the board has the shapes of the color-block study; the difficulty only sets how many colors each value gets (Medium's 3 matches the study's default). The side panels step aside while you play.

1. Choose what to paint from. **My photo** uses the reference loaded in the app (the sample portrait until you load your own; **Load another photo** opens a new one). **A painting** draws you a brand-new portrait each time, after Rembrandt, Zorn, Sargent, Sorolla, Velázquez, Frans Hals or Vermeer. Nothing is stored: a portrait is a painter and a random seed, and the seed decides everything else (a man or a woman, a beard, a moustache, a bun or long hair, a pearl, the collar and clothes, how the head is turned and lit), following that painter's habits, so there is no fixed set; about half are women. Roughly a quarter are old (white hair or beard, hollower cheeks and temples, deeper eye sockets under a heavier brow, thinner lips, a longer nose), most heads are turned three-quarters but some are nearly full face or in profile, the lamp can be the painter's usual side light, a soft frontal light, a dramatic raking one or one from above, and the wall behind can be a lighter block, a wedge, a window with its bars, a darker table or plain, in a tint and shade of the painter's ground. The head, neck and shoulders turn by an amount that eases with height, so the joins between them have no gaps, planes that face away are laid at the very back in shadow, and a last pass closes any seam left inside the figure, so no background shows through a portrait. Clothes come in each painter's colors, such as wine, green, navy, ochre or slate, as well as black and white. **Another painting** draws a different one, and a new visit draws a new one. Each is a planar head in the Loomis and Asaro manner, turned three-quarters and lit by one lamp, with every plane filled with one flat color from that painter's palette, so it already reads like a color-block study. The women have a finer jaw, chin and nose, fuller lips, a slimmer neck and narrower shoulders, with their hair over the temples in a bun or falling to the shoulders, some with a pearl earring. Painting boards keep the planes' straight edges, and your best score is kept for each painting.
2. Choose a difficulty, a mode and a palette. **Easy** has up to 6 numbers and 3 minutes, **Medium** up to 9 and 5 minutes, **Hard** up to 12 and 8 minutes; a photo with fewer distinct colors gets fewer numbers. The palette can be any of the known palettes or, once you have ticked at least two, **My paints**. The game suggests a palette for the portrait (marked **suggested** and chosen for you): the one whose mixes come closest to its colors, or of those within a point of the best, the one with fewest paints. Whichever palette you use, the reference is mixed from it: each number's color becomes the closest mix the pigment model finds for the study's color with those paints, in amounts you can tap, so every number can be matched exactly. The setup says how many of the study's colors that palette mixes closely, so you can see how far it strays from the photo.
3. **Start painting.** Choose a number with its button, or tap a shape on the board. Then tap paints to mix its color. **Amount per tap** sets how much each tap adds, from ¼ part (a touch of a strong paint) to 4 parts (a pile of white), and holding a paint keeps adding. Every shape with that number takes the mix at once. **Undo** takes back the last part and **Clear** empties the mix. **Copy mix** saves mixing a color twice: with a painted number chosen, press it, then tap the numbers or shapes that should get the same mix, part for part (the copy can then be changed on its own). Press **Done**, tap the original number again or press Esc to stop. The mix is predicted with the same pigment model as the palette planner, so yellow and blue make green and white cools a red as it lightens it. The reference stays beside the board to match by eye: **Photo** shows the photo itself and **Blocks** shows its color-block study as mixed from your palette, the flat colors each number is scored against (the choice is remembered). On a phone it sits in the board's corner: drag it anywhere over the board, or hide it. On a phone the game takes the whole screen while you play: the page header and tabs step aside, and the timer bar, the painting and the palette fill the screen, the painting as large as the space left allows. Under the painting are the paints in a row; a palette too long for the screen gets a big scroll bar under it (drag the handle, tap the track to jump there, or swipe the paints) and a thin row with **Amount** and a quick undo; the mix, **Copy mix** and the number buttons are just below. Tap ✕ in the bar twice to quit a game early. Each tap on a paint clicks like a mechanical keyboard key (a bright switch click over a short thock, with a softer click as you let go); the speaker button in the bar turns the sound off and on, and the choice is remembered.
4. **Lock in portrait** when you are done. When the clock runs out, the portrait locks in by itself. **Play again** asks whether to try the same portrait again or take on a new one: a new painting is dealt at random and starts straight away, and a new photo opens the file picker.

**Modes.** The setup's **Mode** changes how a game is played; your best score is kept per mode.

- **Classic**: beat the clock.
- **Relaxed**: no clock and no time bonus (the timer counts up as a stopwatch, and the score is out of 1,000).
- **Memory**: the reference shows for 10 seconds, with the clock waiting (press **Ready** to hide it sooner), then hides. A **Peek** shows it again for 3 seconds and costs 10 seconds on the clock, up to 3 times. You can't paint during the look.
- **Value first**: a greyscale stage before the color. The reference is shown in grey; pick each number's value, black to white, on a slider (tap a number or a shape, slide, and every shape with that number takes it). **Done with values** moves on to the color stage, where each number you haven't mixed yet keeps its grey as an underpainting. The value study scores against the reference's own values and is worth up to 100 points, with the colors worth 900 instead of 1,000.
- **Mystery palette**: white and three paints dealt at random (a hand that mixes the portrait's colors reasonably well is kept), shown in the setup with **Deal again** to deal another. A new portrait deals a new hand. Every color to match is still mixed from those paints.

**Game feel.** When a number's mix comes within 5% of its color (a 95% match or better), a two-note chime plays, the phone vibrates where it can, and the mix swatch and number pulse with a **Spot on!** badge (the speaker button turns the chime and vibration off together with the key clicks). **Next ▸**, beside the number buttons, jumps to the next number with no value or mix yet and flashes its shapes gold on the board; when none are left it nudges **Lock in portrait**. After you lock in and close the score, **Compare with target** lays the colors to match over your portrait: drag the divider (or use the arrow keys) to wipe between them. **Share card** makes a picture with your portrait, score, stars, palette and mode, and opens the share sheet on phones that have one, or saves it as a PNG.

The score is out of 1,200. Color accuracy gives up to 1,000: each number scores `100 − 2.5 × ΔE` (CIEDE2000) against its color as mixed from your palette, weighted by its area, and an unpainted number scores 0. If every number is painted, the time left adds up to 200 more, scaled by your accuracy, so speed only pays when the colors are right. When the portrait locks in, the score pops up over it, arcade style: your color match counting up to its percentage, a rating out of five stars (one star from 30%, two from 50%, three from 65%, four from 78%, five from 88%) and a flashing **New best!** when you beat your score. Close it with × to look at your portrait. **Analyze** opens the details below: the points, your portrait beside the colors to match and the photo, and every number from furthest off to closest with what was wrong (such as "too light by 0.6 value, too warm") and the recipe its color was mixed from. Your best score for each portrait, level and palette is kept in your browser.

### How close did I get? (Check my painting)

**How close did I get?**, the last drawer of the Study tab, scores your finished piece against the reference. Open it and the results appear below the studies; its badge keeps the score.

1. Load, drop or paste a photo of your painting, or press **Use my Studio painting** to score the paper on the Studio tab as it stands (if the Studio was painting from a dealt portrait, that portrait becomes the reference here). Shoot a photo straight on, framed like the reference. It is cropped (or stretched) to match the reference and broken into color blocks with the same settings.
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

With the built-in sample, the drawer opens with a made-up example painting, photographed slightly tilted, so you can see how the scoring and alignment work.

## Simple and Advanced

The switch at the top of the page chooses how much to show. **Simple**, the default, is for beginners and classrooms: the Study tab shows a Detail preset (Soft, Normal, Sharp) instead of the Simplify, Smoothing and Merge sliders, hides the value splits, gray values, the lighter-tones lean and My paints, and offers three palettes with a reason for each (Zorn, Three primaries and Rembrandt's earths). The scoring hints say what the numbers mean in plain words, with the formulas behind **Show the details**. **Advanced** shows every setting. The choice is remembered.

The Studio keeps your work: the paper, the underdrawing, the ground and texture and which way the paper is turned are saved in the browser a moment after each change (in IndexedDB, as the pictures are too big for localStorage) and come back on the next visit. **Clear the paper** takes two taps, and Undo brings a cleared paper back.

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
- `js/app.js`: tool bar, drawers, controls, loupe, picked colors and the built-in sample portrait
- `js/paints.js`: the paint library and known palettes
- `js/mixing.js`: the pigment mixing model, recipes and palette suggestions
- `js/palette.js`: the paints part of the Colors and paints drawer
- `js/subjects.js`: the generated portraits for the game (a planar head painted after seven masters)
- `js/game.js`: the Paint by numbers game
- `js/painting.js`: the Studio tab

Palette sources: [Zorn](https://www.naturalpigments.com/artist-materials/zorn-palette-four-colors), [Frank Reilly](https://methods.art/painters/frank-reilly), [Richard Schmid](https://www.wetcanvas.com/forums/topic/the-color-palette-of-richard-schmid-in-his-own-words/), [Rembrandt](https://www.naturalpigments.com/artist-materials/rembrandt-van-rijn-color-palette), [Sorolla](https://www.naturalpigments.com/artist-materials/joaquin-sorolla-palette), [Monet](https://www.liveabout.com/impressionist-masters-palettes-techniques-claude-monet-2578614), [split primary](https://www.handprint.com/HP/WCL/palette4r.html). The spectral data in `js/mixing.js` is from [spectral.js](https://github.com/rvanwijnen/spectral.js) (MIT license).
