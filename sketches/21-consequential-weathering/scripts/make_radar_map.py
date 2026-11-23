"""Prepare the data for the radar map on page A · III (radar-map.js), following Anna-Lena's QGIS project
assets/gis/Radar GIS file.qgz: same view, same layers, same colours.

Run from the sketch folder:
    .venv/Scripts/python scripts/make_radar_map.py

Writes images/radar-map/:
  sentinel-true.jpg, sentinel-false.jpg   Sentinel-2 L2A true and false colour, 29 Sep 2026, from the
                                          Copernicus Browser files in assets/gis/Copernicus_Browser_images/,
                                          coloured with the stretch saved in the QGIS project
  radar-20150109.png                      DWD RADKLIM rain every 5 min, 13:00-18:00 UTC, on the map's 1 km
                                          grid (frames stacked top to bottom; value = mm per 5 min x 100,
                                          255 = no radar data)
  map.json                                view, image positions, the plant, times, and the wind measured at
                                          four DWD stations every 10 minutes, 13:00-18:00 UTC

Map coordinates: km from the top-left corner of the QGIS view, x to the east, y to the south, in
ETRS89 / UTM 33N (EPSG:25833). The Sentinel files are in WGS 84 / UTM 33N (EPSG:32633); the two
differ by less than a metre here.
"""

import json
import math
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform

sys.path.insert(0, str(Path(__file__).resolve().parent))
import radklim as rk               # noqa: E402
import export_wind_gis as wg       # noqa: E402

HERE = Path(__file__).resolve().parent.parent
GIS = HERE / "assets" / "gis"
OUT = HERE / "images" / "radar-map"
DATE, T0, T1 = "20150109", "1300", "1800"
UTM = CRS.from_epsg(25833)
RADOLAN = CRS.from_proj4("+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6370040 +b=6370040 "
                         "+x_0=0 +y_0=0 +units=m +no_defs")
SENTINEL = {"true": "2026-09-29-00_00_2026-09-29-23_59_Sentinel-2_L2A_True_color.tiff",
            "false": "2026-09-29-00_00_2026-09-29-23_59_Sentinel-2_L2A_False_color.tiff"}


def qgis_project():
    return ET.fromstring(zipfile.ZipFile(GIS / "Radar GIS file.qgz").read("Radar GIS file.qgs"))


def qgis_view():
    e = qgis_project().find(".//mapcanvas/extent")
    return {c.tag: float(c.text) for c in e}


def qgis_stretch(file_name):
    """The min/max QGIS uses for each colour band of a layer (its 'Stretch to min/max' setting)."""
    for ml in qgis_project().iter("maplayer"):
        if (ml.findtext("datasource") or "").endswith(file_name):
            rr = ml.find(".//rasterrenderer")
            return [(float(rr.find(t).findtext("minValue")), float(rr.find(t).findtext("maxValue")))
                    for t in ("redContrastEnhancement", "greenContrastEnhancement", "blueContrastEnhancement")]
    raise SystemExit(f"{file_name} not found in the QGIS project")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    v = qgis_view()
    x0, y1 = v["xmin"], v["ymax"]
    W_km, H_km = (v["xmax"] - v["xmin"]) / 1000, (v["ymax"] - v["ymin"]) / 1000
    to_map = lambda e, n: (round((e - x0) / 1000, 3), round((y1 - n) / 1000, 3))

    # Sentinel-2: web-sized JPGs, and where they sit on the map
    sent = {}
    for key, name in SENTINEL.items():
        with rasterio.open(GIS / "Copernicus_Browser_images" / name) as s:
            a = s.read([1, 2, 3]).astype(np.float32)
            b = s.bounds
        # colours as in QGIS: each band stretched between the min and max saved in the project
        for i, (lo, hi) in enumerate(qgis_stretch(name)):
            a[i] = np.clip((a[i] - lo) / (hi - lo), 0, 1) * 255
        img = Image.fromarray(np.moveaxis(a, 0, -1).round().astype(np.uint8))
        w = 1800
        img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        img.save(OUT / f"sentinel-{key}.jpg", quality=84, optimize=True, progressive=True)
        l, t = to_map(b.left, b.top)
        r, bt = to_map(b.right, b.bottom)
        sent[key] = {"file": f"sentinel-{key}.jpg", "x": l, "y": t, "w": round(r - l, 3), "h": round(bt - t, 3)}

    # Radar: every 5 minutes, reprojected onto the map's 1 km grid (nearest neighbour, values unchanged)
    gw, gh = math.ceil(W_km), math.ceil(H_km)
    dst_tf = from_origin(x0, y1, 1000, 1000)
    rp, cp = rk.to_grid(*rk.PLACES["Schwarze Pumpe"])
    rp, cp = int(round(rp)), int(round(cp))
    half = 170
    src_tf = from_origin((rk.X0 + cp - half) * 1000, (rk.Y0 + rp + half) * 1000, 1000, 1000)
    frames, times = [], []
    for st, mm in rk.read_day(rk_day()):
        if not (T0 <= st[6:10] <= T1):
            continue
        a = mm[rp - half:rp + half, cp - half:cp + half][::-1].astype(np.float32)
        out = np.full((gh, gw), np.nan, np.float32)
        reproject(a, out, src_transform=src_tf, src_crs=RADOLAN, src_nodata=np.nan,
                  dst_transform=dst_tf, dst_crs=UTM, dst_nodata=np.nan, resampling=Resampling.nearest)
        frames.append(np.where(np.isnan(out), 255, np.clip(np.round(np.nan_to_num(out) * 100), 0, 254)).astype(np.uint8))
        times.append(f"{st[6:8]}:{st[8:10]}")
    Image.fromarray(np.concatenate(frames, 0), mode="L").save(OUT / f"radar-{DATE}.png", optimize=True)

    # The plant and the wind stations, in map km
    def utm(lat, lon):
        xs, ys = transform("EPSG:4326", UTM, [lon], [lat])
        return to_map(xs[0], ys[0])
    plant = utm(*rk.PLACES["Schwarze Pumpe"])
    pos = wg.positions()
    stations = []
    for sid in wg.STATIONS:
        name, lat, lon, h = pos[sid]
        series = {}
        z = zipfile.ZipFile(next((GIS.parent / "dwd-stations").glob(f"10minutenwerte_wind_{sid}_20100101_*_hist.zip")))
        prod = next(n for n in z.namelist() if n.startswith("produkt"))
        lines = z.read(prod).decode("latin-1").splitlines()
        head = [h.strip() for h in lines[0].split(";")]
        for line in lines[1:]:
            r = dict(zip(head, (s.strip() for s in line.split(";"))))
            t = r["MESS_DATUM"]
            if t[:8] != DATE or not (T0 <= t[8:12] <= T1):
                continue
            ff, dd = float(r["FF_10"]), float(r["DD_10"])
            if ff >= 0 and dd >= 0:
                series[f"{t[8:10]}:{t[10:12]}"] = [dd, ff]
        x, y = utm(lat, lon)
        stations.append({"id": sid, "name": name, "x": x, "y": y, "wind": series})

    meta = {
        "about": "Radar map of 9 January 2015, 13:00-18:00 UTC, in the view of Anna-Lena Mueller's QGIS project.",
        "crs": "ETRS89 / UTM 33N (EPSG:25833); map units km from the view's top-left corner, x east, y south",
        "view_utm": v, "width_km": round(W_km, 3), "height_km": round(H_km, 3),
        "grid_km": 10,
        "sentinel": sent,
        "sentinel_source": "Contains modified Copernicus Sentinel data 2026 (Sentinel-2 L2A, 29 Sep 2026, Copernicus Browser)",
        "radar": {"file": f"radar-{DATE}.png", "w": gw, "h": gh, "times_utc": times,
                  "encoding": "mm per 5 min x 100; 255 = no data",
                  "source": "Datenbasis: Deutscher Wetterdienst, RADKLIM v2017.002 (YW), CC BY 4.0"},
        "radar_colours": [[0.02, "#a7d7ff"], [0.125, "#5f8eff"], [0.5, "#d26eff"], [10, "#ff74ff"]],
        "plant": {"name": "Schwarze Pumpe", "x": plant[0], "y": plant[1]},
        "wind_source": "Datenbasis: Deutscher Wetterdienst, 10-minute wind (mean speed and direction), CC BY 4.0",
        "stations": stations,
    }
    (OUT / "map.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    for f in sorted(OUT.iterdir()):
        print(f.name, round(f.stat().st_size / 1e3), "KB")


def rk_day():
    return HERE / "assets" / "radklim" / "days" / f"YW2017.002_{DATE}.tar.gz"


if __name__ == "__main__":
    main()
