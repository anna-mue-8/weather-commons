"""Export radar time-lapses around Schwarze Pumpe for page A · III (radar-player.js).

Run from the sketch folder (radar day files in assets/radklim/days/, station files in assets/dwd-stations/):
    .venv/Scripts/python scripts/make_radar_timelapse.py

For each day below, the DWD RADKLIM 5-minute radar is cut to a 90 x 90 km square around the plant
(north up, 1 px = 1 km) and saved as one greyscale PNG: the frames stacked from top to bottom. Each
pixel is the rain in that 5 minutes in hundredths of a millimetre (0-254), 255 = no radar data.
images/radar/radar.json lists the days, frames, places and the hourly wind.

Observed: DWD RADKLIM version 2017.002 (YW, 5 min, 1 km), opendata.dwd.de, CC BY 4.0,
"Datenbasis: Deutscher Wetterdienst". Wind: DWD stations Cottbus (00880) and Hoyerswerda (07393),
10-minute means averaged per hour. The 'minutes of rain so far' panel is derived from the radar.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import radklim as rk          # noqa: E402
import radar_compare as rc   # noqa: E402
import shower_days as sd     # noqa: E402

HERE = Path(__file__).resolve().parent.parent
DAYS_DIR = HERE / "assets" / "radklim" / "days"
OUT = HERE / "images" / "radar"
H = 45  # half size, km

DAYS = [
    {"date": "20171208", "from": "0830", "to": "1330",
     "title": "8 December 2017",
     "note": "Showers in cold air from the west-southwest. One grows as it crosses the plant, about 10:15–10:25 UTC."},
    {"date": "20150109", "from": "1300", "to": "1800",
     "title": "9 January 2015",
     "note": "Rain falls over the plant without a break from 14:25 to 16:10 UTC; over the whole day, this unbroken spell is longer than at 90 % of the area around it. In total minutes of rain, the plant is only a little above the typical value."},
]
PLACES = {  # for orientation on the map
    "Schwarze Pumpe": rk.PLACES["Schwarze Pumpe"],
    "Spremberg": (51.5717, 14.3794),
    "Hoyerswerda": (51.4380, 14.2350),
    "Cottbus": (51.7563, 14.3329),
    "Weißwasser": (51.5050, 14.6370),
}


def pixel(lat, lon):
    r0, c0 = rk.to_grid(*rk.PLACES["Schwarze Pumpe"])
    r, c = rk.to_grid(lat, lon)
    return round(c - round(c0) + H, 1), round(H - (r - round(r0)), 1)   # x right, y down


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    wind = rc.hourly_wind({d["date"][:4] for d in DAYS})
    meta = {
        "about": "DWD RADKLIM radar around Kraftwerk Schwarze Pumpe, 90 x 90 km, north up, 1 px = 1 km, every 5 minutes (UTC). Observed.",
        "source": "Datenbasis: Deutscher Wetterdienst, RADKLIM version 2017.002 (YW), opendata.dwd.de, CC BY 4.0",
        "wind_source": "DWD stations Cottbus and Hoyerswerda, hourly mean of 10-minute values",
        "encoding": "greyscale PNG, frames stacked top to bottom; value = mm per 5 min x 100, 255 = no data",
        "size_km": 2 * H,
        "places": {k: pixel(*v) for k, v in PLACES.items()},
        "days": [],
    }
    for d in DAYS:
        frames = [(st, mm) for st, mm in rk.read_day(DAYS_DIR / f"YW2017.002_{d['date']}.tar.gz")
                  if d["from"] <= st[6:10] <= d["to"]]
        stack = []
        for st, mm in frames:
            w = rk.window(mm, *rk.PLACES["Schwarze Pumpe"], H)
            v = np.where(np.isnan(w), 255, np.clip(np.round(np.nan_to_num(w) * 100), 0, 254)).astype(np.uint8)
            stack.append(v)
        img = np.concatenate(stack, axis=0)
        name = f"radar-{d['date']}.png"
        Image.fromarray(img, mode="L").save(OUT / name, optimize=True)
        hours = sorted({st[6:8] for st, _ in frames})
        meta["days"].append({
            "date": d["date"], "title": d["title"], "note": d["note"], "file": name,
            "times_utc": [f"{st[6:8]}:{st[8:10]}" for st, _ in frames],
            "wind": {h: [round(wind["20" + d["date"][2:] + h][0]), round(wind["20" + d["date"][2:] + h][1], 1)]
                     for h in hours if ("20" + d["date"][2:] + h) in wind},
        })
        print(name, len(frames), "frames", (OUT / name).stat().st_size, "bytes")
    (OUT / "radar.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
