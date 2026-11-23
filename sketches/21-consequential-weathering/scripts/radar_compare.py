"""Compare radar rain downwind of Schwarze Pumpe with rain beside and upwind of it, on showery days.

Run from the sketch folder (after shower_days.py, with the day files in assets/radklim/days/):
    .venv/Scripts/python scripts/radar_compare.py 20150109 20150330 ...

For every showery hour of the given days (from assets/research/shower-days-*.csv, plus the hour
before and after; a day not on that list is used whole), each 5-minute radar picture (DWD RADKLIM YW) is cut to 160 x 160 km around
the plant and turned so that the wind (hourly mean at Cottbus and Hoyerswerda) blows to the right.
Averaging all of them gives a wind-relative map: if the plant set off or strengthened showers, it
would show as a streak to the right of the plant.

Numbers compared (share of 5-minute pictures with rain >= 0.05 mm, i.e. about 0.6 mm/h):
- downwind: a strip 6 km wide from the plant to 40 km downwind
- beside:   the same strips shifted 12-24 km to either side
- upwind:   the strip from 40 km upwind to the plant

Derived from observed data; interpretive. Few days, so differences can easily be chance.
Writes assets/research/radar-wind-relative-<n>days.png and prints the numbers.
"""

import csv
import glob
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import radklim as rk           # noqa: E402
import shower_days as sd      # noqa: E402

HERE = Path(__file__).resolve().parent.parent
DAYS = HERE / "assets" / "radklim" / "days"
OUT = HERE / "assets" / "research"
H = 80          # half size of the square, km
WET = 0.05      # mm in 5 minutes


def hourly_wind(years):
    w = {}
    for sid in sd.WIND:
        for r in sd.rows("wind", sid):
            t = r["MESS_DATUM"]
            if t[:4] not in years:
                continue
            ff, dd = float(r["FF_10"]), float(r["DD_10"])
            if ff < 0 or dd < 0:
                continue
            a = w.setdefault(t[:10], [0.0, 0.0, 0])
            a[0] += ff * math.sin(math.radians(dd))
            a[1] += ff * math.cos(math.radians(dd))
            a[2] += 1
    return {h: ((math.degrees(math.atan2(u, v)) + 360) % 360, math.hypot(u, v) / n) for h, (u, v, n) in w.items() if n}


def showery_hours():
    hours = {}
    for f in glob.glob(str(OUT / "shower-days-*.csv")):
        for row in csv.DictReader(open(f, encoding="utf-8")):
            hours[row["date"]] = [int(h) for h in row["hours_utc"].split()]
    return hours


def turn(a, wind_from):
    """Turn a north-up square so the wind blows to the right (east)."""
    toward = (wind_from + 180) % 360
    img = Image.fromarray(np.nan_to_num(a, nan=-1).astype(np.float32), mode="F")
    out = np.asarray(img.rotate(toward - 90, resample=Image.BILINEAR, fillcolor=-1))
    out = out.copy()
    out[out < 0] = np.nan
    return out


def main(days):
    years = {d[:4] for d in days}
    wind = hourly_wind(years)
    hours = showery_hours()
    wet = np.zeros((2 * H, 2 * H))
    seen = np.zeros((2 * H, 2 * H))
    per_day = []
    for day in days:
        f = DAYS / f"YW2017.002_{day}.tar.gz"
        if not f.exists():
            print("missing", f.name)
            continue
        want = set()
        for h in hours.get(day, []):
            want |= {h - 1, h, h + 1}
        if not want:            # a day not on the station list: use the whole day
            want = set(range(24))
        dw = np.zeros_like(wet)
        ds = np.zeros_like(wet)
        for stamp, mm in rk.read_day(f):
            hh = int(stamp[6:8])
            if hh not in want:
                continue
            w = wind.get("20" + stamp[:8])
            if not w or w[1] < 2:
                continue
            a = turn(rk.window(mm, *rk.PLACES["Schwarze Pumpe"], H), w[0])
            ok = ~np.isnan(a)
            dw[ok] += a[ok] >= WET
            ds[ok] += 1
        wet += dw
        seen += ds
        per_day.append((day, stats(dw, ds)))
    freq = np.where(seen > 0, wet / np.maximum(seen, 1), np.nan)

    print("share of 5-minute pictures with rain, %:  downwind | beside (left, right) | upwind")
    for day, s in per_day:
        print(day, fmt(s))
    total = stats(wet, seen)
    print("all  ", fmt(total))
    picture(freq, total, len(per_day))
    return per_day, total


def strip(a, x0, x1, y0, y1):
    # x: km downwind (right), y: km to the left of the wind; centre of the square is the plant
    return a[H - y1:H - y0, H + x0:H + x1]


def stats(w, s):
    def share(x0, x1, y0, y1):
        ww, ss = strip(w, x0, x1, y0, y1), strip(s, x0, x1, y0, y1)
        return 100 * ww.sum() / max(1, ss.sum())
    return {
        "downwind": share(0, 40, -3, 3),
        "left": share(0, 40, 12, 24),
        "right": share(0, 40, -24, -12),
        "upwind": share(-40, 0, -3, 3),
    }


def fmt(s):
    return f"{s['downwind']:5.1f} | {s['left']:5.1f} {s['right']:5.1f} | {s['upwind']:5.1f}"


def picture(freq, total, n):
    v = np.nan_to_num(freq / max(np.nanmax(freq), 1e-6))
    g = (np.sqrt(np.clip(v, 0, 1)) * 255).astype(np.uint8)
    img = Image.fromarray(np.stack([g, g, g], -1)).resize((640, 640), Image.NEAREST)
    d = ImageDraw.Draw(img)
    k = 640 / (2 * H)
    c = 320
    d.ellipse([c - 6, c - 6, c + 6, c + 6], outline=(255, 0, 0), width=2)
    for (x0, x1, y0, y1), col in [((0, 40, -3, 3), (255, 0, 0)), ((0, 40, 12, 24), (0, 160, 255)),
                                  ((0, 40, -24, -12), (0, 160, 255)), ((-40, 0, -3, 3), (255, 200, 0))]:
        d.rectangle([c + x0 * k, c - y1 * k, c + x1 * k, c - y0 * k], outline=col, width=1)
    d.line([20, 610, 90, 610], fill=(0, 255, 0), width=2)
    d.text((20, 590), "wind", fill=(0, 255, 0))
    d.text((10, 10), f"Schwarze Pumpe, {n} showery days, wind-relative, 160 x 160 km", fill=(255, 255, 0))
    d.text((10, 26), "share of 5-min radar pictures with rain (DWD RADKLIM)", fill=(255, 255, 0))
    d.text((10, 42), f"downwind {total['downwind']:.1f}%  beside {total['left']:.1f}% / {total['right']:.1f}%  upwind {total['upwind']:.1f}%", fill=(255, 255, 0))
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / f"radar-wind-relative-{n}days.png")


if __name__ == "__main__":
    main(sys.argv[1:])
