"""Download daily weather station records from the German Weather Service (DWD)
for stations around the Eastern German post-mining lakes, and turn them into
small monthly tables for the page.

Run from the sketch folder:
    python scripts/fetch_dwd.py

What it does:
- downloads the daily climate files ("kl": temperature, humidity, rain, wind,
  sunshine, cloud) for each station, historical and recent, into
  assets/dwd/ (ignored by git, re-downloadable);
- writes data/dwd-monthly.csv: monthly values per station from 1950;
- writes data/dwd-stations.json: station names, positions, record dates,
  distances to the lakes, and where each station stood over time.

Source: Deutscher Wetterdienst, Climate Data Center, CC BY 4.0.
Kind of material: observed.
Uses only the Python standard library.
"""

import csv
import io
import json
import math
import re
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

BASE = "https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/"
HERE = Path(__file__).resolve().parent.parent  # the sketch folder
RAW = HERE / "assets" / "dwd"
OUT = HERE / "data"
START_YEAR = 1950

# Station ids from the DWD station list, chosen for long records near the lakes.
STATIONS = {
    # Central German lake district (south of Leipzig, Geiseltal, Goitzsche)
    "02928": "Leipzig-Holzhausen",
    "02932": "Leipzig/Halle",
    "02878": "Bad Lauchstädt",
    "04036": "Querfurt-Mühle Lodersleben",
    "05750": "Zeitz",
    "02704": "Köthen (Anhalt)",
    "05629": "Wittenberg",
    # Lusatian lake district
    "02627": "Schipkau-Klettwitz",
    "07393": "Hoyerswerda",
    "00880": "Cottbus",
    "01001": "Doberlug-Kirchhain",
    "03426": "Bad Muskau",
}

# Rough centre points of lake areas, only for measuring distances.
# Approximate, to check against LMBV maps.
LAKES = {
    "Cospudener See": (51.27, 12.34),
    "Goitzsche": (51.62, 12.37),
    "Geiseltalsee": (51.31, 11.88),
    "Lusatian lakes (Sedlitz/Partwitz)": (51.52, 14.08),
}

# DWD daily columns kept, with plain names. -999 means missing.
COLUMNS = {
    "TMK": "temp_mean_c",       # daily mean air temperature, °C
    "TXK": "temp_max_c",        # daily maximum, °C
    "TNK": "temp_min_c",        # daily minimum, °C
    "UPM": "rel_humidity_pct",  # daily mean relative humidity, %
    "VPM": "vapour_pressure_hpa",  # daily mean vapour pressure, hPa
    "RSK": "precip_mm",         # daily precipitation, mm (summed per month)
    "SDK": "sunshine_h",        # daily sunshine, hours (summed per month)
    "FM": "wind_mean_ms",       # daily mean wind speed, m/s
    "NM": "cloud_okta",         # daily mean cloud cover, eighths
}
SUMMED = {"RSK", "SDK"}


def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def listing(sub):
    html = get(BASE + sub).decode("latin1")
    return re.findall(r'href="(tageswerte_KL_\d{5}_[^"]+\.zip)"', html)


def distance_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def read_zip(path):
    """Return (daily rows, geography history) from one DWD zip."""
    z = zipfile.ZipFile(path)
    rows, geo = [], []
    for name in z.namelist():
        text = z.read(name).decode("latin1")
        if name.startswith("produkt_klima_tag"):
            reader = csv.reader(io.StringIO(text), delimiter=";")
            header = [h.strip() for h in next(reader)]
            for rec in reader:
                if len(rec) < len(header):
                    continue
                rows.append({h: v.strip() for h, v in zip(header, rec)})
        elif name.startswith("Metadaten_Geographie"):
            reader = csv.reader(io.StringIO(text), delimiter=";")
            header = [h.strip() for h in next(reader)]
            for rec in reader:
                if len(rec) >= len(header) and rec[0].strip().isdigit():
                    geo.append({h: v.strip() for h, v in zip(header, rec)})
    return rows, geo


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    files = {"historical": listing("historical/"), "recent": listing("recent/")}

    stations_meta = []
    monthly_rows = []
    for sid, name in STATIONS.items():
        days = {}  # date -> row; recent fills in after historical ends
        geo_history = []
        for part in ("historical", "recent"):
            matches = [f for f in files[part] if f"_KL_{sid}_" in f]
            for fname in matches:
                path = RAW / fname
                if not path.exists():
                    print("download", fname)
                    path.write_bytes(get(BASE + part + "/" + fname))
                rows, geo = read_zip(path)
                for r in rows:
                    days.setdefault(r["MESS_DATUM"], r)
                if part == "historical" and geo:
                    geo_history = geo

        # monthly values
        acc = defaultdict(lambda: defaultdict(list))
        for date, r in days.items():
            year = int(date[:4])
            if year < START_YEAR:
                continue
            key = date[:6]
            for col in COLUMNS:
                v = r.get(col, "-999")
                try:
                    x = float(v)
                except ValueError:
                    continue
                if x != -999:
                    acc[key][col].append(x)
        for key in sorted(acc):
            row = {"station_id": sid, "station": name, "year": int(key[:4]), "month": int(key[4:])}
            for col, plain in COLUMNS.items():
                vals = acc[key][col]
                if not vals:
                    row[plain] = ""
                elif col in SUMMED:
                    # only sum months that are nearly complete
                    row[plain] = round(sum(vals), 1) if len(vals) >= 25 else ""
                else:
                    row[plain] = round(sum(vals) / len(vals), 2)
            row["days_with_temp"] = len(acc[key]["TMK"])
            monthly_rows.append(row)

        last = geo_history[-1] if geo_history else {}
        lat = float(last.get("Geogr.Breite", "nan"))
        lon = float(last.get("Geogr.Laenge", "nan"))
        stations_meta.append({
            "id": sid,
            "name": name,
            "lat": lat,
            "lon": lon,
            "height_m": last.get("Stationshoehe"),
            "first_day": min(days) if days else None,
            "last_day": max(days) if days else None,
            "distance_km": {k: round(distance_km((lat, lon), c), 1) for k, c in LAKES.items()},
            "locations_over_time": [
                {"from": g.get("von_datum"), "to": g.get("bis_datum"),
                 "lat": g.get("Geogr.Breite"), "lon": g.get("Geogr.Laenge"),
                 "height_m": g.get("Stationshoehe")}
                for g in geo_history
            ],
        })
        print(f"{sid} {name}: {len(days)} days")

    fields = ["station_id", "station", "year", "month", *COLUMNS.values(), "days_with_temp"]
    with open(OUT / "dwd-monthly.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(monthly_rows)
    with open(OUT / "dwd-stations.json", "w", encoding="utf-8") as f:
        json.dump({
            "source": "Deutscher Wetterdienst (DWD), Climate Data Center, daily climate observations (kl)",
            "url": BASE,
            "licence": "CC BY 4.0, https://www.dwd.de/copyright",
            "kind": "observed",
            "lake_points_note": "Lake centre points are approximate, only for distances.",
            "stations": stations_meta,
        }, f, ensure_ascii=False, indent=1)
    print("wrote", OUT / "dwd-monthly.csv", "and", OUT / "dwd-stations.json")


if __name__ == "__main__":
    main()
