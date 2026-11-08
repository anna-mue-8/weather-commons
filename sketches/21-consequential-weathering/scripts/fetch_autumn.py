"""Download two autumn Landsat frames for the side-view simulation's
November day, cut to the same box and grid as fetch_landsat.py.

Run from the sketch folder:
    .venv/Scripts/python scripts/fetch_autumn.py        (Windows)

- 2025-11-08, Landsat 8: the lake, photographed on the morning of the
  simulated day (8 November 2025), about 2.5% of the box cloudy.
- 1991-10-26, Landsat 5: the open pit in autumn, about 1% of the box cloudy.
  The clearest autumn frame near 1991.

Source: USGS Landsat Collection 2 Level-2 via Microsoft Planetary Computer.
Licence: public domain (USGS). Kind of material: observed.

Writes to assets/landsat/ (ignored by git): the same _rgb.tif, _rgb.jpg and
_st.tif files as fetch_landsat.py, and autumn-frames.json.
"""

import json

import planetary_computer
from pystac_client import Client

import fetch_landsat as fl

ITEMS = [
    ("lake, morning of the simulated day", "LC08_L2SP_192024_20251108_02_T1"),
    ("open pit, autumn", "LT05_L2SP_192024_19911026_02_T1"),
]


def main():
    fl.OUT.mkdir(parents=True, exist_ok=True)
    coll = Client.open(fl.STAC, modifier=planetary_computer.sign_inplace).get_collection("landsat-c2-l2")
    frames = []
    for role, pid in ITEMS:
        item = coll.get_item(pid)
        date = item.datetime.date().isoformat()
        sat = item.properties["platform"]
        stem = f"{date}_{sat}"
        c = fl.box_cloud(item)
        st_key = fl.save(item, stem)
        print(f"{date} {sat}  box cloud {c * 100:.1f}%  overpass {item.datetime.isoformat()[11:16]} UTC")
        frames.append({
            "role": role,
            "found": True,
            "date": date,
            "overpass_utc": item.datetime.isoformat()[11:19],
            "satellite": sat,
            "scene_id": item.properties.get("landsat:scene_id"),
            "product_id": item.id,
            "scene_cloud_pct": item.properties["eo:cloud_cover"],
            "box_cloud_or_missing_pct": round(c * 100, 2),
            "rgb": f"{stem}_rgb.tif",
            "jpg": f"{stem}_rgb.jpg",
            "surface_temperature_c": f"{stem}_st.tif",
            "temperature_band": st_key,
        })
    with open(fl.OUT / "autumn-frames.json", "w", encoding="utf-8") as f:
        json.dump({
            "source": "USGS Landsat Collection 2 Level-2, via Microsoft Planetary Computer (collection landsat-c2-l2)",
            "licence": "public domain (USGS)",
            "kind": "observed",
            "box_lonlat": fl.BOX,
            "crs": "EPSG:32633",
            "pixel_m": fl.RES,
            "frames": frames,
        }, f, indent=1)
    print("wrote", fl.OUT / "autumn-frames.json")


if __name__ == "__main__":
    main()
