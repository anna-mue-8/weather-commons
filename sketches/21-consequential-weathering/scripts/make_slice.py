"""Build the inputs for the side-view cloud simulation: one line across
Partwitzer See, the ground along it in 1991 and 2025, and hourly weather.

Run from the sketch folder, after fetch_landsat.py and fetch_autumn.py:
    .venv/Scripts/python scripts/make_slice.py        (Windows)

Writes one file per season (see SEASONS below):
- data/slice-partwitz-summer.json   7 August 1991 and 12 August 2025, hot, dry, clear days
- data/slice-partwitz-autumn.json   26 October 1991 and 8 November 2025, cold, calm, clear mornings
Each holds:
- the ground along a 20 km line west to east through Partwitzer See, from two
  Landsat frames: the open pit (1991) and the lake (2025). For each 30 m step:
  surface temperature (°C), and whether it is water, bare ground or vegetation
  (from the green, red and near-infrared bands). Observed.
- hourly weather for each Landsat day: at DWD station 00880 Cottbus (31 km from
  the lake, the nearest station with hourly records in 1991) for both years, and
  at 07393 Hoyerswerda (8 km, records from 2010) for 2025. Air temperature,
  relative humidity, dew point, pressure, wind, cloud cover and rain. Observed.
  DWD hours are in UTC (local time is UTC + 2 in summer, UTC + 1 in winter).

The station files are kept in assets/dwd/hourly/ (ignored by git), so a second
run doesn't download them again.

Sources: USGS Landsat Collection 2 Level-2 via Microsoft Planetary Computer
(public domain); Deutscher Wetterdienst, Climate Data Center (CC BY 4.0).
"""

import csv
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from pystac_client import Client
from rasterio.warp import transform

import fetch_landsat as fl  # same box, grid and reader as the frames

HERE = Path(__file__).resolve().parent.parent
FRAMES = [HERE / "assets" / "landsat" / "frames.json", HERE / "assets" / "landsat" / "autumn-frames.json"]
CACHE = HERE / "assets" / "dwd" / "hourly"

LINE = {"name": "West–east through Partwitzer See", "lat": 51.5215, "lon_from": 14.00, "lon_to": 14.29}
STATIONS = {
    "00880": {"name": "Cottbus", "distance_km": 31},
    "07393": {"name": "Hoyerswerda", "distance_km": 8},
}
SEASONS = [
    {"name": "summer", "pit": "1991-08-07", "lake": "2025-08-12", "weather": [
        ("cottbus-1991", "00880", "1991-08-07"),
        ("cottbus-2025", "00880", "2025-08-12"),
        ("hoyerswerda-2025", "07393", "2025-08-12"),
    ]},
    {"name": "autumn", "pit": "1991-10-26", "lake": "2025-11-08", "weather": [
        ("cottbus-1991", "00880", "1991-10-26"),
        ("cottbus-2025", "00880", "2025-11-08"),
        ("hoyerswerda-2025", "07393", "2025-11-08"),
    ]},
]
HOURLY = "https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/"
KINDS = {"tu": ("air_temperature", "TU"), "rr": ("precipitation", "RR"), "ff": ("wind", "FF"),
         "nn": ("cloudiness", "N"), "tf": ("moisture", "TF")}


def line_pixels():
    lons = np.linspace(LINE["lon_from"], LINE["lon_to"], 2000)
    xs, ys = transform("EPSG:4326", fl.CRS_OUT, lons, [LINE["lat"]] * len(lons))
    inv = ~fl.TRANSFORM
    cols, rows = zip(*(inv * (x, y) for x, y in zip(xs, ys)))
    pix = []
    for r, c in zip(rows, cols):
        p = (int(r), int(c))
        if not pix or pix[-1] != p:
            pix.append(p)
    length = float(np.hypot(xs[-1] - xs[0], ys[-1] - ys[0]))
    return pix, length


def surface(item, st_file, pix):
    def band(key):
        a = fl.read(item.assets[key].href).astype("float32")
        return a * 0.0000275 - 0.2
    green, red, nir = band("green"), band("red"), band("nir08")
    with rasterio.open(st_file) as s:
        st = s.read(1)
    out = {"st_c": [], "kind": []}
    for r, c in pix:
        g, rd, n = green[r, c], red[r, c], nir[r, c]
        ndwi = (g - n) / (g + n + 1e-6)
        ndvi = (n - rd) / (n + rd + 1e-6)
        kind = "water" if ndwi > 0.05 else ("vegetation" if ndvi > 0.3 else "bare")
        out["kind"].append(kind)
        out["st_c"].append(None if np.isnan(st[r, c]) else round(float(st[r, c]), 1))
    return out


def download(kind, code, station, period):
    """One DWD hourly zip (historical or recent), kept in assets/dwd/hourly/."""
    folder = f"{HOURLY}{kind}/{period}/"
    if period == "recent":
        name = f"stundenwerte_{code}_{station}_akt.zip"
    else:
        found = list(CACHE.glob(f"stundenwerte_{code}_{station}_*_hist.zip"))
        if found:
            return found[0]
        index = urllib.request.urlopen(folder, timeout=60).read().decode("latin1")
        names = re.findall(rf"stundenwerte_{code}_{station}_\d+_\d+_hist\.zip", index)
        if not names:
            return None
        name = names[0]
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        try:
            with urllib.request.urlopen(folder + name, timeout=300) as r:
                path.write_bytes(r.read())
        except Exception as err:  # not every station has every kind
            print("  no", name, err)
            return None
    return path


def rows(kind, code, station):
    """All hours for one station and one kind, historical and recent together."""
    out = {}
    for period in ("historical", "recent"):
        path = download(kind, code, station, period)
        if path is None:
            continue
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.startswith("produkt_"))
        for row in csv.DictReader(io.StringIO(z.read(name).decode("latin1")), delimiter=";"):
            row = {k.strip(): v.strip() for k, v in row.items()}
            out.setdefault(row["MESS_DATUM"], row)
    return out


def num(v):
    try:
        x = float(v)
        return None if x == -999 else x
    except (TypeError, ValueError):
        return None


def main():
    frames = {}
    for f in FRAMES:
        frames.update({x["date"]: x for x in json.load(open(f))["frames"] if x.get("found")})
    client = Client.open(fl.STAC, modifier=planetary_computer.sign_inplace)
    coll = client.get_collection("landsat-c2-l2")
    pix, length = line_pixels()
    station = {s: {key: rows(kind, code, s) for key, (kind, code) in KINDS.items()} for s in STATIONS}

    for season in SEASONS:
        grounds = {}
        for role in ("pit", "lake"):
            d = season[role]
            f = frames[d]
            item = coll.get_item(f["product_id"])
            g = surface(item, HERE / "assets" / "landsat" / f["surface_temperature_c"], pix)
            g["role"] = role
            g["satellite"] = f["satellite"]
            g["scene_id"] = f["scene_id"]
            g["overpass_utc"] = round(item.datetime.hour + item.datetime.minute / 60, 2)
            grounds[d] = g
            print(season["name"], role, d, {k: g["kind"].count(k) for k in ("water", "bare", "vegetation")})

        weather = {}
        for key, sid, date in season["weather"]:
            stamp = date.replace("-", "")
            s = station[sid]
            hours = []
            for h in range(24):
                r = lambda k: s[k].get(f"{stamp}{h:02d}", {})
                hours.append({
                    "utc": h,
                    "temp_c": num(r("tu").get("TT_TU")),
                    "rel_humidity_pct": num(r("tu").get("RF_TU")),
                    "dew_point_c": num(r("tf").get("TD_STD")),
                    "pressure_hpa": num(r("tf").get("P_STD")),
                    "wind_ms": num(r("ff").get("F")),
                    "wind_from_deg": num(r("ff").get("D")),
                    "cloud_okta": num(r("nn").get("V_N")),
                    "rain_mm": num(r("rr").get("R1")),
                })
            missing = sum(h["temp_c"] is None for h in hours)
            weather[key] = {
                "station": f"{sid} {STATIONS[sid]['name']} (DWD)",
                "station_name": STATIONS[sid]["name"],
                "distance_km": STATIONS[sid]["distance_km"],
                "date": date,
                "hours_utc": hours,
            }
            t = [h["temp_c"] for h in hours if h["temp_c"] is not None]
            print(f"  {key} {date}: {24 - missing} hours, {min(t)} to {max(t)} °C")

        data = {
            "about": "Inputs for the side-view simulation. Ground and weather are observed; the simulation built on them is modelled.",
            "season": season["name"],
            "line": {**LINE, "length_m": round(length), "step_m": round(length / (len(pix) - 1), 1), "points": len(pix)},
            "pit": season["pit"],
            "lake": season["lake"],
            "ground": grounds,
            "ground_note": "Kind from Landsat bands: water if NDWI > 0.05, vegetation if NDVI > 0.3, else bare. Surface temperature at the satellite's overpass (overpass_utc, hours UTC).",
            "weather": weather,
            "weather_note": "Hours in UTC. -999 values left out as null. Cottbus has no hourly rain before 1995.",
            "sources": [
                "USGS Landsat Collection 2 Level-2, via Microsoft Planetary Computer, public domain",
                "Deutscher Wetterdienst, Climate Data Center, hourly observations, CC BY 4.0",
            ],
        }
        out = HERE / "data" / f"slice-partwitz-{season['name']}.json"
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("wrote", out, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
