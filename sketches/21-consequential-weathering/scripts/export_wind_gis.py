"""Export DWD 10-minute wind measurements near Schwarze Pumpe for one day, for GIS (QGIS ...).

Run from the sketch folder (station files in assets/dwd-stations/):
    .venv/Scripts/python scripts/export_wind_gis.py 20150109

Writes to assets/gis/wind-<date>/ (not in git):
  wind-points-<date>.geojson   one point per station and 10 minutes (EPSG:4326)
  wind-lines-<date>.geojson    a short line from each station in the direction the wind blew toward,
                               2 km long per m/s of wind (so 5 m/s = 10 km); arrow tip at the far end
  wind-<date>.csv              the same table, for a spreadsheet
  style-wind-points.qml        QGIS style: arrows turned to the wind, sized by speed
  README.txt

Fields: station_id, station, time_utc (end of the 10 minutes, UTC), wind_speed_m_s (10-minute mean,
about 10 m above ground), wind_from_deg (direction the wind comes FROM, 0 = north, 90 = east),
wind_toward_deg (direction it blows TOWARD = from + 180), quality (DWD quality level, QN).

Source: DWD Climate Data Center, 10-minute wind (10minutenwerte_wind_<id>_..._hist.zip),
opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/wind/historical/,
CC BY 4.0, "Datenbasis: Deutscher Wetterdienst". Observed.
"""

import csv
import json
import math
import sys
import zipfile
import glob
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DATA = HERE / "assets" / "dwd-stations"
OUT = HERE / "assets" / "gis"
STATIONS = ["00880", "07393", "01001", "01684"]   # Cottbus, Hoyerswerda, Doberlug-Kirchhain, Görlitz
KM_PER_MS = 2.0


def positions():
    pos = {}
    for line in (DATA / "ff10.txt").read_text(encoding="latin-1").splitlines()[2:]:
        p = line.split()
        if p and p[0] in STATIONS:
            pos[p[0]] = (" ".join(p[6:-2]), float(p[4]), float(p[5]), int(p[3]))
    return pos


def offset(lat, lon, bearing, km):
    b = math.radians(bearing)
    dlat = km * math.cos(b) / 111.2
    dlon = km * math.sin(b) / (111.2 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def main(day):
    pos = positions()
    rows = []
    for sid in STATIONS:
        f = glob.glob(str(DATA / f"10minutenwerte_wind_{sid}_*_hist.zip"))
        f = [x for x in f if "_20100101_" in x] or f
        z = zipfile.ZipFile(f[0])
        name = next(n for n in z.namelist() if n.startswith("produkt"))
        lines = z.read(name).decode("latin-1").splitlines()
        head = [h.strip() for h in lines[0].split(";")]
        for line in lines[1:]:
            r = dict(zip(head, (v.strip() for v in line.split(";"))))
            t = r["MESS_DATUM"]
            if not t.startswith(day):
                continue
            ff, dd = float(r["FF_10"]), float(r["DD_10"])
            if ff < 0 or dd < 0:
                continue
            st, lat, lon, h = pos[sid]
            rows.append({
                "station_id": sid, "station": st, "station_height_m": h, "lat": lat, "lon": lon,
                "time_utc": f"{t[:4]}-{t[4:6]}-{t[6:8]}T{t[8:10]}:{t[10:12]}:00Z",
                "wind_speed_m_s": ff, "wind_from_deg": dd, "wind_toward_deg": (dd + 180) % 360,
                "quality": int(r["QN"]),
            })
    out = OUT / f"wind-{day}"
    out.mkdir(parents=True, exist_ok=True)
    props = lambda r: {k: v for k, v in r.items() if k not in ("lat", "lon")}
    pts = [{"type": "Feature", "properties": props(r),
            "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}} for r in rows]
    lns = []
    for r in rows:
        la2, lo2 = offset(r["lat"], r["lon"], r["wind_toward_deg"], r["wind_speed_m_s"] * KM_PER_MS)
        lns.append({"type": "Feature", "properties": props(r),
                    "geometry": {"type": "LineString", "coordinates": [[r["lon"], r["lat"]], [lo2, la2]]}})
    for name, feats in ((f"wind-points-{day}.geojson", pts), (f"wind-lines-{day}.geojson", lns)):
        (out / name).write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False),
                                encoding="utf-8")
    with open(out / f"wind-{day}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    (out / "style-wind-points.qml").write_text(QML, encoding="utf-8")
    (out / "README.txt").write_text(__doc__.strip() + "\n" + QGIS_HELP, encoding="utf-8")
    for sid in STATIONS:
        rs = [r for r in rows if r["station_id"] == sid]
        print(pos[sid][0], len(rs), "values")
    print("->", out)


QGIS_HELP = """
QGIS:
- Drag wind-lines-<date>.geojson and wind-points-<date>.geojson into QGIS (together with the radar
  GeoTIFFs and places.geojson from assets/gis/). QGIS places them by their coordinates.
- Arrows: right-click the points layer > Properties > Symbology > Style > Load Style >
  style-wind-points.qml. Each point becomes an arrow pointing where the wind blew, larger when stronger.
  (By hand: Simple marker, shape 'arrow'; Rotation > Field type > wind_toward_deg; Size > wind_speed_m_s.)
- For the lines, a Line style with an arrow at the end ('Arrow' symbol layer) shows the direction.
- Time: Properties > Temporal > Dynamic temporal control > Single field with Date/Time > time_utc,
  event duration 10 minutes. Then View > Panels > Temporal Controller plays the day, in step with the
  radar if those layers are set up the same way (5-minute steps).
- Credit when shown: "Datenbasis: Deutscher Wetterdienst (DWD)" (CC BY 4.0).
"""

QML = """<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.28" styleCategories="Symbology">
  <renderer-v2 type="singleSymbol" symbollevels="0" enableorderby="0" forceraster="0">
    <symbols>
      <symbol type="marker" name="0" alpha="1" clip_to_extent="1" force_rhr="0">
        <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
          <Option type="Map">
            <Option type="QString" name="name" value="arrow"/>
            <Option type="QString" name="color" value="255,0,127,255"/>
            <Option type="QString" name="outline_color" value="0,0,0,255"/>
            <Option type="QString" name="outline_width" value="0.2"/>
            <Option type="QString" name="size" value="4"/>
            <Option type="QString" name="size_unit" value="MM"/>
            <Option type="QString" name="angle" value="0"/>
          </Option>
          <data_defined_properties>
            <Option type="Map">
              <Option type="QString" name="name" value=""/>
              <Option name="properties" type="Map">
                <Option name="angle" type="Map">
                  <Option type="bool" name="active" value="true"/>
                  <Option type="QString" name="field" value="wind_toward_deg"/>
                  <Option type="int" name="type" value="2"/>
                </Option>
                <Option name="size" type="Map">
                  <Option type="bool" name="active" value="true"/>
                  <Option type="QString" name="expression" value="2 + 0.6 * &quot;wind_speed_m_s&quot;"/>
                  <Option type="int" name="type" value="3"/>
                </Option>
              </Option>
              <Option type="QString" name="type" value="collection"/>
            </Option>
          </data_defined_properties>
        </layer>
      </symbol>
    </symbols>
  </renderer-v2>
</qgis>
"""

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "20150109")
