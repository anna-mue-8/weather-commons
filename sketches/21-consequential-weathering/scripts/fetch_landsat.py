"""Download one clear summer Landsat frame every three years, 1985 to 2025,
for the Lusatian lake district, cut to the same box and grid.

Run from the sketch folder, with the packages in scripts/requirements.txt:
    .venv/Scripts/python scripts/fetch_landsat.py        (Windows)
    .venv/bin/python scripts/fetch_landsat.py            (Mac, Linux)

Source: USGS Landsat Collection 2 Level-2 (surface reflectance and surface
temperature), the same products as on USGS EarthExplorer, read from the copy
on Microsoft Planetary Computer, which needs no account.
Landsat 4-5 TM up to 2011, Landsat 8-9 OLI/TIRS from 2013. Landsat 7 is left
out (its images from 2003 on have stripes of missing data).
Licence: public domain (USGS). Kind of material: observed.

Writes to assets/landsat/ (ignored by git):
- YYYY-MM-DD_<satellite>_rgb.tif   true colour, 8-bit, same stretch for all frames
- YYYY-MM-DD_<satellite>_rgb.jpg   the same as a plain picture
- YYYY-MM-DD_<satellite>_st.tif    surface temperature in °C (float, NaN = no data)
- frames.json                       what was chosen and why
"""

import json
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from PIL import Image
from pystac_client import Client
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds

HERE = Path(__file__).resolve().parent.parent  # the sketch folder
OUT = HERE / "assets" / "landsat"
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"

# Box around the Lusatian lake district: west, south, east, north (degrees).
# Roughly Bergheider See and Senftenberg in the west to Hoyerswerda and Spreetal in the east.
BOX = (13.75, 51.40, 14.35, 51.65)
CRS_OUT = CRS.from_epsg(32633)  # UTM zone 33 north, metres
RES = 30  # metres per pixel, Landsat's own resolution

YEARS = [1985, 1988, 1991, 1994, 1997, 2000, 2003, 2006, 2009, 2011,
         2013, 2016, 2019, 2022, 2025]
SCENE_CLOUD_MAX = 10   # percent, whole scene, as in the EarthExplorer search
TRY_PER_YEAR = 20      # how many candidate scenes to check per year
BOX_CLEAR_ENOUGH = 0.05  # if the best scene still has more cloud or gaps in the box, try the year before or after

# One fixed true-colour stretch for every frame, so frames can be compared.
REFL_MAX = 0.30
GAMMA = 1 / 2.0


def grid():
    w, s, e, n = transform_bounds("EPSG:4326", CRS_OUT, *BOX)
    w, s = np.floor(w / RES) * RES, np.floor(s / RES) * RES
    e, n = np.ceil(e / RES) * RES, np.ceil(n / RES) * RES
    width, height = int((e - w) / RES), int((n - s) / RES)
    return from_origin(w, n, RES, RES), width, height


TRANSFORM, WIDTH, HEIGHT = grid()


def read(href, resampling=Resampling.nearest):
    with rasterio.open(href) as src:
        with WarpedVRT(src, crs=CRS_OUT, transform=TRANSFORM, width=WIDTH, height=HEIGHT,
                       resampling=resampling, src_nodata=0, nodata=0) as vrt:
            return vrt.read(1)


def box_cloud(item):
    """Share of the box that is cloud, cloud shadow or missing, from the QA band."""
    qa = read(item.assets["qa_pixel"].href)
    fill = (qa == 0) | ((qa & 1) == 1)
    cloud = ((qa >> 1) & 1) | ((qa >> 3) & 1) | ((qa >> 4) & 1)
    bad = fill | (cloud == 1)
    return float(bad.mean())


def search(client, year):
    platforms = ["landsat-4", "landsat-5"] if year <= 2011 else ["landsat-8", "landsat-9"]
    for months, cloud in (("06-01/{y}-08-31", SCENE_CLOUD_MAX), ("05-01/{y}-09-30", SCENE_CLOUD_MAX)):
        items = list(client.search(
            collections=["landsat-c2-l2"],
            bbox=BOX,
            datetime=f"{year}-" + months.format(y=year),
            query={"eo:cloud_cover": {"lte": cloud}, "platform": {"in": platforms}},
        ).items())
        if items:
            return sorted(items, key=lambda i: i.properties["eo:cloud_cover"]), months.split("/")[0][:2]
    return [], None


def save(item, stem):
    profile = dict(driver="GTiff", width=WIDTH, height=HEIGHT, crs=CRS_OUT,
                   transform=TRANSFORM, compress="deflate")
    bands = []
    for key in ("red", "green", "blue"):
        dn = read(item.assets[key].href, Resampling.bilinear).astype("float32")
        refl = dn * 0.0000275 - 0.2
        v = np.clip(refl / REFL_MAX, 0, 1) ** GAMMA
        v[dn == 0] = 0
        bands.append((v * 255).round().astype("uint8"))
    rgb = np.stack(bands)
    with rasterio.open(OUT / f"{stem}_rgb.tif", "w", count=3, dtype="uint8", **profile) as dst:
        dst.write(rgb)
    Image.fromarray(np.moveaxis(rgb, 0, -1)).save(OUT / f"{stem}_rgb.jpg", quality=90)

    st_key = "lwir11" if "lwir11" in item.assets else "lwir"
    dn = read(item.assets[st_key].href, Resampling.bilinear).astype("float32")
    st = dn * 0.00341802 + 149.0 - 273.15
    st[dn == 0] = np.nan
    with rasterio.open(OUT / f"{stem}_st.tif", "w", count=1, dtype="float32", nodata=np.nan, **profile) as dst:
        dst.write(st, 1)
    return st_key


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    client = Client.open(STAC, modifier=planetary_computer.sign_inplace)
    frames = []
    for year in YEARS:
        # same satellite era only: Landsat 4-5 up to 2011, Landsat 8-9 from 2013
        tries = [y for y in (year, year - 1, year + 1)
                 if (y <= 2011) == (year <= 2011) and 1984 <= y <= 2025 and y != 2012]
        best, window = None, None
        for y in tries:
            items, win = search(client, y)
            for item in items[:TRY_PER_YEAR]:
                try:
                    c = box_cloud(item)
                except Exception as err:  # a file that can't be read is skipped
                    print("  skip", item.id, err)
                    continue
                if best is None or c < best[1]:
                    best, window = (item, c), win
                if c < 0.01:
                    break
            if best is not None and best[1] <= BOX_CLEAR_ENOUGH:
                break
        if best is None:
            print(year, "no scene under", SCENE_CLOUD_MAX, "% cloud, May to September")
            frames.append({"year": year, "found": False})
            continue
        item, c = best
        date = item.datetime.date().isoformat()
        sat = item.properties["platform"]
        stem = f"{date}_{sat}"
        st_key = save(item, stem)
        print(f"{year}: {date} {sat}  scene cloud {item.properties['eo:cloud_cover']:.0f}%  box cloud {c * 100:.1f}%")
        frames.append({
            "year": year,
            "year_used": item.datetime.year,
            "found": True,
            "date": date,
            "satellite": sat,
            "scene_id": item.properties.get("landsat:scene_id"),
            "product_id": item.id,
            "scene_cloud_pct": item.properties["eo:cloud_cover"],
            "box_cloud_or_missing_pct": round(c * 100, 2),
            "months_searched": "June-August" if window == "06" else "May-September",
            "rgb": f"{stem}_rgb.tif",
            "jpg": f"{stem}_rgb.jpg",
            "surface_temperature_c": f"{stem}_st.tif",
            "temperature_band": st_key,
        })

    with open(OUT / "frames.json", "w", encoding="utf-8") as f:
        json.dump({
            "source": "USGS Landsat Collection 2 Level-2, via Microsoft Planetary Computer (collection landsat-c2-l2)",
            "licence": "public domain (USGS)",
            "kind": "observed",
            "box_lonlat": BOX,
            "crs": "EPSG:32633",
            "pixel_m": RES,
            "size_px": [WIDTH, HEIGHT],
            "true_colour_stretch": f"surface reflectance 0 to {REFL_MAX}, gamma {GAMMA:.2f}, same for every frame",
            "frames": frames,
        }, f, indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
