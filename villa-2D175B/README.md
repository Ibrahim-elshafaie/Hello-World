# Villa 2D175B interior layout

Furnished layout for plot 2D175B (Rockwood cluster, villa type TH-M), made from `plans/2D175B-floor-plans.jpg`.

- `brief.md`: design assumptions (household, style, layout rules)
- `design.json`: rooms, doors, windows, fixtures and furniture, all in mm
- `build.py`: generates the outputs from `design.json`
- `layout.html`: both floors drawn to scale, with the furniture schedule
- `furniture.csv`: the schedule, which opens in Excel or Google Sheets

To change the design, edit `design.json` (or ask Claude to) and run:

```bash
python3 build.py
```
