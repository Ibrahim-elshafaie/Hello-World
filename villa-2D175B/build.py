"""Build layout.html and furniture.csv from design.json.

Run: python3 build.py
"""
import csv
import html
import json
import math
from collections import OrderedDict
from pathlib import Path

HERE = Path(__file__).parent
design = json.loads((HERE / "design.json").read_text())
WALL = design["wall"]
HALF = WALL / 2

CAT_COLORS = {
    "seating": "#c9b79c",
    "table": "#b08a5e",
    "storage": "#d8c3a0",
    "bed": "#e4d8c4",
    "soft": "#efe6d6",
    "decor": "#9bb07f",
    "appliance": "#c7ccd1",
}
CAT_NAMES = {
    "seating": "Seating",
    "table": "Tables",
    "storage": "Storage",
    "bed": "Beds",
    "soft": "Rugs",
    "decor": "Plants and lighting",
    "appliance": "Appliances",
}


def esc(s):
    return html.escape(str(s))


def text(x, y, s, size, cls="lbl", rotate=False):
    t = f' transform="rotate(-90 {x} {y})"' if rotate else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" class="{cls}"{t}>{esc(s)}</text>'


def item_label(it):
    w, h = it["w"], it["h"]
    long_side = max(w, h)
    size = max(90, min(170, long_side / 7, min(w, h) / 2.2))
    rotate = h > w * 1.4 and w < 900
    return text(it["x"] + w / 2, it["y"] + h / 2, it["name"], size, "item", rotate)


def shape(it, fill, cls):
    x, y, w, h = it["x"], it["y"], it["w"], it["h"]
    if it.get("shape") == "circle":
        return f'<ellipse cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" fill="{fill}" class="{cls}"/>'
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="30" fill="{fill}" class="{cls}"/>'


def door(d):
    hx, hy = d["at"]
    n = d["len"]
    if d["wall"] == "h":
        ex, ey = hx + d["dir"] * n, hy
        tx, ty = hx, hy + d["swing"] * n
        gap = (min(hx, ex), hy - HALF, n, WALL)
    else:
        ex, ey = hx, hy + d["dir"] * n
        tx, ty = hx + d["swing"] * n, hy
        gap = (hx - HALF, min(hy, ey), WALL, n)
    cross = (tx - hx) * (ey - hy) - (ty - hy) * (ex - hx)
    sweep = 1 if cross > 0 else 0
    return (
        f'<rect x="{gap[0]}" y="{gap[1]}" width="{gap[2]}" height="{gap[3]}" class="floor"/>'
        f'<line x1="{hx}" y1="{hy}" x2="{tx}" y2="{ty}" class="leaf"/>'
        f'<path d="M {tx} {ty} A {n} {n} 0 0 {sweep} {ex} {ey}" class="swing"/>'
    )


def stairs(s):
    x, y, w, h, n = s["x"], s["y"], s["w"], s["h"], s["treads"]
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="stair"/>']
    step = h / n
    for i in range(1, n):
        yy = y + i * step
        out.append(f'<line x1="{x}" y1="{yy}" x2="{x + w}" y2="{yy}" class="tread"/>')
    cx = x + w / 2
    out.append(f'<line x1="{cx}" y1="{y + h - 150}" x2="{cx}" y2="{y + 200}" class="arrow" marker-end="url(#arr)"/>')
    out.append(text(cx, y + h + 260, s["label"], 160, "lbl"))
    return "".join(out)


def floor_svg(fl):
    rooms = fl["rooms"]
    xs = [r["x"] for r in rooms] + [r["x"] + r["w"] for r in rooms]
    ys = [r["y"] for r in rooms] + [r["y"] + r["h"] for r in rooms]
    pad = 700
    x0, y0 = min(xs) - pad, min(ys) - pad
    vw, vh = max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad + 400
    parts = [
        f'<svg viewBox="{x0} {y0} {vw} {vh}" role="img" aria-label="{esc(fl["name"])} furnished plan">',
        '<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">'
        '<path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>',
    ]
    for r in rooms:
        cls = "floor open" if r.get("open") else "floor"
        parts.append(f'<rect x="{r["x"]}" y="{r["y"]}" width="{r["w"]}" height="{r["h"]}" class="{cls}"/>')
    for r in rooms:
        if r.get("open") or r.get("nowalls"):
            continue
        parts.append(
            f'<rect x="{r["x"] - HALF}" y="{r["y"] - HALF}" width="{r["w"] + WALL}" '
            f'height="{r["h"] + WALL}" class="wall" stroke-width="{WALL}"/>'
        )
    for o in fl["openings"]:
        parts.append(f'<rect x="{o["x"]}" y="{o["y"]}" width="{o["w"]}" height="{o["h"]}" class="floor"/>')
    for w in fl["windows"]:
        parts.append(
            f'<line x1="{w["x1"]}" y1="{w["y1"]}" x2="{w["x2"]}" y2="{w["y2"]}" class="glass-bg" stroke-width="{WALL}"/>'
            f'<line x1="{w["x1"]}" y1="{w["y1"]}" x2="{w["x2"]}" y2="{w["y2"]}" class="glass"/>'
        )
    for s in fl["stairs"]:
        parts.append(stairs(s))
    for f in fl["fixed"]:
        parts.append(shape(f, "none", "fixed"))
        parts.append(text(f["x"] + f["w"] / 2, f["y"] + f["h"] / 2, f["name"], 100, "fixed-lbl",
                          f["h"] > f["w"] * 1.4 and f["w"] < 800))
    for layer in ("soft", None):
        for it in fl["furniture"]:
            if (it["cat"] == "soft") != (layer == "soft"):
                continue
            for ex in it.get("extra", []):
                parts.append(shape(ex, CAT_COLORS[it["cat"]], "furn"))
            parts.append(shape(it, CAT_COLORS[it["cat"]], "furn"))
            parts.append(item_label(it))
    for d in fl["doors"]:
        parts.append(door(d))
    for r in rooms:
        if not r.get("name") or r.get("lx", 0) < 0:
            continue
        lx = r.get("lx", r["x"] + r["w"] / 2)
        ly = r.get("ly", r["y"] + r["h"] / 2)
        parts.append(text(lx, ly, r["name"].upper(), 190, "room"))
        if r.get("labeled"):
            parts.append(text(lx, ly + 230, r["labeled"], 140, "dim"))
    for l in fl["labels"]:
        parts.append(text(l["x"], l["y"], l["text"].upper(), 150, "room", True))
    # 1 m scale bar
    sx, sy = min(xs), max(ys) + 450
    parts.append(
        f'<line x1="{sx}" y1="{sy}" x2="{sx + 1000}" y2="{sy}" class="scale"/>'
        + text(sx + 1000 + 120, sy + 50, "1 m", 150, "dim-l")
    )
    parts.append("</svg>")
    return "\n".join(parts)


def schedule_rows():
    rows = OrderedDict()
    for fl in design["floors"]:
        for it in fl["furniture"]:
            key = (fl["name"], it["room"], it["id"])
            if key in rows:
                rows[key]["qty"] += 1
            else:
                rows[key] = {
                    "id": it["id"],
                    "floor": fl["name"],
                    "room": it["room"],
                    "item": it["name"],
                    "size_mm": it.get("size") or f'{max(it["w"], it["h"])} x {min(it["w"], it["h"])}',
                    "qty": 1,
                    "spec": it["spec"],
                    "category": CAT_NAMES[it["cat"]],
                    "link": it.get("link", ""),
                }
    return list(rows.values())


rows = schedule_rows()
with open(HERE / "furniture.csv", "w", newline="") as fh:
    wr = csv.DictWriter(fh, fieldnames=["id", "floor", "room", "item", "size_mm", "qty", "spec", "category", "link"])
    wr.writeheader()
    wr.writerows(rows)

legend = "".join(
    f'<li><span class="sw" style="background:{c}"></span>{CAT_NAMES[k]}</li>' for k, c in CAT_COLORS.items()
) + '<li><span class="sw fixed-sw"></span>Existing fixtures</li>'

table = "".join(
    f"<tr><td>{esc(r['id'])}</td><td>{esc(r['room'])}</td><td>{esc(r['item'])}</td>"
    f"<td class='num'>{esc(r['size_mm'])}</td><td class='num'>{r['qty']}</td><td>{esc(r['spec'])}</td></tr>"
    for r in rows
)

p = design["project"]
notes = "".join(f"<li>{esc(n)}</li>" for n in p["notes"])
floors = "".join(
    f'<section class="plan"><h2>{esc(fl["name"])}</h2>{floor_svg(fl)}</section>' for fl in design["floors"]
)

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Villa {esc(p['plot'])} Layout</title>
<style>
  :root {{
    --bg: #faf8f4; --ink: #2b2723; --muted: #6f675e; --line: #ddd5c8;
    --wall: #2b2723; --floorc: #ffffff; --glass: #5b8fb9; --fixed: #8a8f96;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }}
  main {{ max-width: 1200px; margin: 0 auto; padding: 24px 16px 48px; }}
  h1 {{ font-size: 24px; margin: 0 0 4px; }}
  h2 {{ font-size: 17px; margin: 0 0 8px; }}
  .sub {{ color: var(--muted); margin: 0 0 20px; }}
  .plans {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }}
  .plan {{ background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px; }}
  svg {{ width: 100%; height: auto; display: block; }}
  .floor {{ fill: var(--floorc); }}
  .open {{ fill: #f3f1ed; stroke: var(--muted); stroke-width: 30; stroke-dasharray: 120 90; }}
  .wall {{ fill: none; stroke: var(--wall); }}
  .glass-bg {{ stroke: #fff; }}
  .glass {{ stroke: var(--glass); stroke-width: 50; }}
  .stair {{ fill: #f1ede6; stroke: var(--muted); stroke-width: 20; }}
  .tread {{ stroke: var(--muted); stroke-width: 12; }}
  .arrow {{ stroke: var(--ink); stroke-width: 22; }}
  .arrowhead {{ fill: var(--ink); }}
  .fixed {{ stroke: var(--fixed); stroke-width: 22; stroke-dasharray: 60 40; }}
  .furn {{ stroke: #5c4a36; stroke-width: 16; }}
  .leaf {{ stroke: var(--ink); stroke-width: 30; }}
  .swing {{ fill: none; stroke: var(--muted); stroke-width: 12; stroke-dasharray: 50 40; }}
  .scale {{ stroke: var(--ink); stroke-width: 40; }}
  text {{ font-family: system-ui, -apple-system, "Segoe UI", sans-serif; dominant-baseline: middle; }}
  .room, .dim, .item, .lbl, .fixed-lbl {{ text-anchor: middle; paint-order: stroke; stroke: #fff; stroke-linejoin: round; }}
  .room {{ font-weight: 700; fill: var(--ink); stroke-width: 50; letter-spacing: 10px; }}
  .dim {{ fill: var(--muted); stroke-width: 40; }}
  .dim-l {{ fill: var(--muted); }}
  .item {{ fill: #3b3026; stroke: none; }}
  .lbl {{ fill: var(--ink); stroke-width: 30; font-weight: 600; }}
  .fixed-lbl {{ fill: var(--fixed); stroke-width: 20; }}
  .legend {{ list-style: none; display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 0; margin: 16px 0 0; color: var(--muted); }}
  .sw {{ display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-right: 6px;
    vertical-align: -2px; border: 1px solid #5c4a36; }}
  .fixed-sw {{ background: #fff; border: 1px dashed var(--fixed); }}
  .card {{ background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-top: 20px; }}
  .tbl {{ overflow-x: auto; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 14px; }}
  th, td {{ text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }}
  th {{ color: var(--muted); font-weight: 600; }}
  .num {{ text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
  ul.notes {{ margin: 0; padding-left: 18px; color: var(--muted); }}
</style>
</head>
<body>
<main>
  <h1>Villa {esc(p['plot'])}: furnished layout</h1>
  <p class="sub">{esc(p['cluster'])} cluster, type {esc(p['villa_type'])}. Warm contemporary scheme, all sizes in mm and drawn to scale.</p>
  <div class="plans">{floors}</div>
  <ul class="legend">{legend}</ul>
  <div class="card">
    <h2>Furniture schedule</h2>
    <div class="tbl"><table>
      <thead><tr><th>ID</th><th>Room</th><th>Item</th><th class="num">Size (mm)</th><th class="num">Qty</th><th>Finish</th></tr></thead>
      <tbody>{table}</tbody>
    </table></div>
  </div>
  <div class="card">
    <h2>Notes</h2>
    <ul class="notes">{notes}</ul>
  </div>
</main>
</body>
</html>
"""
(HERE / "layout.html").write_text(page)
print(f"Wrote layout.html and furniture.csv ({len(rows)} schedule rows)")

tour = (HERE / "tour_template.html").read_text()
bundle = (HERE / "tour_bundle.js").read_text().replace("</script", "<\\/script")
tour = tour.replace("/*DESIGN*/null", json.dumps(design).replace("</", "<\\/")).replace("__PLOT__", esc(p["plot"]))
tour = tour.replace("/*BUNDLE*/", bundle)
(HERE / "tour.html").write_text(tour)
print("Wrote tour.html")
