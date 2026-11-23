"""Sentinel-2 close-ups of Kraftwerk Schwarze Pumpe, 2015-2016, for a time-lapse of its plume.

Run from the sketch folder:
    .venv/Scripts/python scripts/fetch_schwarze_pumpe_s2.py        (Windows)

For every Sentinel-2 Level-2A image of the site from June 2015 (the satellite's start)
to December 2016 with less than 50 % cloud over its whole tile, this cuts out a
10 x 10 km square around the power station in true colour (10 m pixels), and measures
how cloudy that square is from the image's own scene classification (SCL), leaving out
1.5 km around the cooling towers so the plume itself doesn't count as cloud.

Writes to assets/schwarze-pumpe-s2/ (ignored by git):
- YYYY-MM-DD.jpg   the true-colour square, 1000 x 1000 px, north up
- candidates.json  date, time, satellite, tile cloud, local cloud, missing pixels

Then pick the clear days with a visible plume and copy them to images/ (see README).

Source: Copernicus Sentinel-2 Level-2A (ESA), via Microsoft Planetary Computer.
Licence: free and open; credit "Contains modified Copernicus Sentinel data 2015-2016".
"""

import json
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from PIL import Image
from pystac_client import Client
from rasterio.warp import transform
from rasterio.windows import from_bounds

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "assets" / "schwarze-pumpe-s2"
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"

# Kraftwerk Schwarze Pumpe, 51°32'13.67"N 14°21'11.86"E (given by Anna-Lena)
LAT = 51 + 32 / 60 + 13.67 / 3600
LON = 14 + 21 / 60 + 11.86 / 3600
HALF = 5000      # m: the square is 10 x 10 km
KEEP_OUT = 1500  # m: around the towers, not counted when measuring cloud
DATES = "2015-06-01/2016-12-31"
CLOUD = {3, 8, 9, 10}  # SCL: cloud shadow, cloud medium, cloud high, thin cirrus


def window(src, x, y, half):
    return from_bounds(x - half, y - half, x + half, y + half, src.transform)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    client = Client.open(STAC, modifier=planetary_computer.sign_inplace)
    items = client.search(collections=["sentinel-2-l2a"], intersects={"type": "Point", "coordinates": [LON, LAT]},
                          datetime=DATES, query={"eo:cloud_cover": {"lt": 50}}).items()
    rows = []
    for item in sorted(items, key=lambda i: i.datetime):
        day = item.datetime.date().isoformat()
        with rasterio.open(item.assets["visual"].href) as src:
            xs, ys = transform("EPSG:4326", src.crs, [LON], [LAT])
            x, y = xs[0], ys[0]
            rgb = src.read(window=window(src, x, y, HALF), boundless=True, fill_value=0)
        with rasterio.open(item.assets["SCL"].href) as src:
            scl = src.read(1, window=window(src, x, y, HALF), boundless=True, fill_value=0)
        n = scl.shape[0]
        yy, xx = np.mgrid[0:n, 0:n]
        r = np.hypot(xx - n / 2, yy - n / 2) * (2 * HALF / n)
        outer = r > KEEP_OUT
        valid = scl > 0
        missing = 1 - valid.mean()
        cloud = np.isin(scl, list(CLOUD))[outer & valid].mean() if (outer & valid).any() else 1.0
        Image.fromarray(np.moveaxis(rgb, 0, -1)).save(OUT / f"{day}.jpg", quality=88)
        row = {
            "date": day,
            "time_utc": item.datetime.strftime("%H:%M"),
            "satellite": item.properties.get("platform"),
            "tile": item.properties.get("s2:mgrs_tile"),
            "product": item.id,
            "tile_cloud_pct": round(item.properties["eo:cloud_cover"], 1),
            "local_cloud_pct": round(100 * float(cloud), 1),
            "missing_pct": round(100 * float(missing), 1),
        }
        rows.append(row)
        print(row["date"], row["time_utc"], "tile", row["tile_cloud_pct"], "local", row["local_cloud_pct"], "missing", row["missing_pct"])
    (OUT / "candidates.json").write_text(json.dumps({
        "about": "Sentinel-2 L2A true-colour squares, 10 x 10 km around Kraftwerk Schwarze Pumpe. Observed.",
        "centre": {"lat": round(LAT, 5), "lon": round(LON, 5)},
        "size_m": 2 * HALF,
        "local_cloud": f"share of the square classed as cloud, cirrus or cloud shadow (SCL), outside {KEEP_OUT} m of the centre",
        "source": "Copernicus Sentinel-2 Level-2A (ESA), via Microsoft Planetary Computer. Contains modified Copernicus Sentinel data 2015-2016.",
        "images": rows,
    }, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
