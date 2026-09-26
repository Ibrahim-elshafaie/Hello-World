# Villa 2D175B interior layout

Furnished layout for plot 2D175B (Rockwood cluster, villa type TH-M), made from `plans/2D175B-floor-plans.jpg`.

- `brief.md`: design assumptions (household, style, layout rules)
- `design.json`: rooms, doors, windows, fixtures and furniture, all in mm
- `build.py`: generates the outputs from `design.json`
- `layout.html`: both floors drawn to scale, with the furniture schedule
- `furniture.csv`: the schedule, which opens in Excel or Google Sheets
- `tour.html`: 3D walk-through of both floors, built from the same data. It is one self-contained file that works offline.
- `viewer.js`: the 3D viewer code; `tour_bundle.js` is it bundled with three.js
- `tour_template.html`: the page that `build.py` fills with the data and the bundle

To change the design, edit `design.json` (or ask Claude to) and run this to regenerate the plans, schedule and 3D tour:

```bash
python3 build.py
```

## Using the 3D tour

- Walk: drag to look around, move with W A S D or the arrow keys (Shift to go faster). On a phone, use the on-screen arrows.
- Dollhouse: drag to orbit, scroll or pinch to zoom.
- "Go to room" drops you in the doorway of any room. The Ground and First buttons switch floors.

Furniture is modelled as simple shapes at real sizes and heights. For photoreal renders, open the same layout in Blender or SketchUp, or use an image-generation tool with the plan and `brief.md`.

If you change `viewer.js`, rebuild the bundle first (needs Node.js):

```bash
npm install
npm run bundle
python3 build.py
```
