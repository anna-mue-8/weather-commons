"""Export the radar used on page A · III as georeferenced GeoTIFFs for GIS (QGIS, ArcGIS ...).

Run from the sketch folder (radar day files in assets/radklim/days/):
    .venv/Scripts/python scripts/export_radar_gis.py

Writes to assets/gis/ (not in git):
  radar-<date>/radolan-grid/radklim-yw_<date>T<hhmm>Z.tif   one file per 5 minutes, the radar's own grid
  radar-<date>/radolan-grid/rain-minutes_<date>_<from>-<to>Z.tif   minutes with rain over the time-lapse
  radar-<date>/utm33/...                                    the same, reprojected to ETRS89 / UTM 33N (EPSG:25833)
  places.geojson                                            the plant, towns for orientation, DWD stations
  README.txt                                                units, coordinate systems, source and credit

Values: rain in mm per 5 minutes (float32); no radar data = NoData (NaN). 'rain-minutes' counts the
5-minute steps with at least 0.05 mm, times 5 (int16).

Coordinate systems:
- radolan-grid: the DWD RADOLAN polar stereographic projection (sphere R = 6370.04 km, true at 60 N,
  centre meridian 10 E), 1 km cells, exactly as delivered (no resampling). Its corner: x = -443.4622 km,
  y = -4758.6447 km (1100 x 900 grid). The cell corner convention may shift positions by up to half a cell.
- utm33: ETRS89 / UTM zone 33N (EPSG:25833), 1 km cells, nearest-neighbour resampling (values unchanged,
  cells shifted by up to half a cell).

Source: DWD RADKLIM version 2017.002, product YW, opendata.dwd.de, CC BY 4.0,
"Datenbasis: Deutscher Wetterdienst". Observed (reprocessed radar).
"""

import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import Resampling, calculate_default_transform, reproject

sys.path.insert(0, str(Path(__file__).resolve().parent))
import radklim as rk                     # noqa: E402
import make_radar_timelapse as tl        # noqa: E402
import shower_days as sd                 # noqa: E402

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "assets" / "gis"
HALF = 100   # km: 200 x 200 km around the plant
RADOLAN = CRS.from_proj4("+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6370040 +b=6370040 "
                         "+x_0=0 +y_0=0 +units=m +no_defs")
UTM = CRS.from_epsg(25833)
CREDIT = "Datenbasis: Deutscher Wetterdienst (DWD), RADKLIM v2017.002 YW, CC BY 4.0"


def cut(mm):
    """200 x 200 km around the plant, north up, and its geotransform in the RADOLAN grid."""
    r, c = rk.to_grid(*rk.PLACES["Schwarze Pumpe"])
    r, c = int(round(r)), int(round(c))
    a = mm[r - HALF:r + HALF, c - HALF:c + HALF][::-1]
    left = (rk.X0 + c - HALF) * 1000
    top = (rk.Y0 + r + HALF) * 1000
    return a, from_origin(left, top, 1000, 1000)


def write(path, a, transform, crs, nodata, tags):
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, "w", driver="GTiff", width=a.shape[1], height=a.shape[0], count=1,
                       dtype=a.dtype, crs=crs, transform=transform, nodata=nodata, compress="deflate") as dst:
        dst.write(a, 1)
        dst.update_tags(**tags)


def to_utm(a, transform, nodata):
    h, w = a.shape
    left, top = transform.c, transform.f
    bounds = (left, top - h * 1000, left + w * 1000, top)
    t2, w2, h2 = calculate_default_transform(RADOLAN, UTM, w, h, *bounds, resolution=1000)
    out = np.full((h2, w2), nodata, dtype=a.dtype)
    reproject(a, out, src_transform=transform, src_crs=RADOLAN, src_nodata=nodata,
              dst_transform=t2, dst_crs=UTM, dst_nodata=nodata, resampling=Resampling.nearest)
    return out, t2


def main():
    for d in tl.DAYS:
        date = d["date"]
        frames = [(st, mm) for st, mm in rk.read_day(tl.DAYS_DIR / f"YW2017.002_{date}.tar.gz")
                  if d["from"] <= st[6:10] <= d["to"]]
        base = OUT / f"radar-{date}"
        count = None
        for st, mm in frames:
            a, tf = cut(mm)
            a = a.astype(np.float32)
            stamp = f"{date}T{st[6:10]}Z"
            tags = {"TIFFTAG_DATETIME": f"{date[:4]}:{date[4:6]}:{date[6:]} {st[6:8]}:{st[8:10]}:00",
                    "time_utc": f"{date[:4]}-{date[4:6]}-{date[6:]}T{st[6:8]}:{st[8:10]}:00Z",
                    "units": "mm per 5 minutes (precipitation in the 5 minutes ending at this time)",
                    "source": CREDIT}
            name = f"radklim-yw_{stamp}.tif"
            write(base / "radolan-grid" / name, a, tf, RADOLAN, np.nan, tags)
            u, tu = to_utm(a, tf, np.nan)
            write(base / "utm33" / name, u, tu, UTM, np.nan, tags)
            wet = (np.nan_to_num(a) >= 0.05).astype(np.int16)
            count = wet if count is None else count + wet
        minutes = (count * 5).astype(np.int16)
        tags = {"units": "minutes with rain (>= 0.05 mm per 5 minutes)",
                "period_utc": f"{date} {d['from']}-{d['to']}", "source": CREDIT + "; derived"}
        name = f"rain-minutes_{date}_{d['from']}-{d['to']}Z.tif"
        write(base / "radolan-grid" / name, minutes, tf, RADOLAN, -1, tags)
        u, tu = to_utm(minutes, tf, -1)
        write(base / "utm33" / name, u, tu, UTM, -1, tags)
        print(date, len(frames), "frames ->", base)

    # points: the plant, towns for orientation, DWD stations used
    feats = [{"type": "Feature", "properties": {"name": n, "kind": "power station" if n == "Schwarze Pumpe" else "town (approximate centre)"},
              "geometry": {"type": "Point", "coordinates": [lo, la]}} for n, (la, lo) in tl.PLACES.items()]
    for sid, (name, la, lo) in sd.GAUGES.items():
        kind = "DWD rain gauge (10 min)" + (" and wind" if sid in sd.WIND else "")
        feats.append({"type": "Feature", "properties": {"name": name, "kind": kind, "dwd_id": sid},
                      "geometry": {"type": "Point", "coordinates": [lo, la]}})
    (OUT / "places.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats},
                                                    ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "README.txt").write_text(__doc__.strip() + "\n", encoding="utf-8")
    print("places.geojson, README.txt ->", OUT)


if __name__ == "__main__":
    main()
