"""Find showery days around Kraftwerk Schwarze Pumpe from DWD rain gauges, for sketch 21.

Run from the sketch folder:
    .venv/Scripts/python scripts/shower_days.py 2015 2016

Data (in assets/dwd-stations/, not in git): DWD Climate Data Center, 10-minute precipitation
('10minutenwerte_nieder_<id>_..._hist.zip') and 10-minute wind ('10minutenwerte_wind_<id>_...'),
opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes/. Times in UTC.
Licence CC BY 4.0, "Datenbasis: Deutscher Wetterdienst". Observed.

Why gauges: the automatic stations nearby almost never report 'Schauer' as a weather type and record
no cloud types, so showers are recognised by how they fall: short, local bursts. An hour counts as
'showery' when 1 to 3 of the gauges get rain (>= 0.1 mm) while the others stay dry, and at least one
of them has a burst (>= 0.3 mm in 10 minutes). An hour with rain at 5 or more gauges counts as
widespread rain. A day is a candidate when it has at least 3 showery hours and more showery than
widespread hours. This is a rough, interpretive filter to choose days for the radar, not a
classification of the weather.

Writes assets/research/shower-days-<years>.csv and prints the list.
"""

import csv
import glob
import math
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DATA = HERE / "assets" / "dwd-stations"
OUT = HERE / "assets" / "research"
PLANT = (51.5371, 14.3533)

# Rain gauges within about 35 km (positions from DWD's station list, zehn_min_rr_Beschreibung_Stationen.txt)
GAUGE_IDS = ["01744", "07393", "00633", "03426", "00880", "02627", "03094"]


def load_gauges():
    out = {}
    for line in (DATA / "rr10.txt").read_text(encoding="latin-1").splitlines()[2:]:
        p = line.split()
        if p and p[0] in GAUGE_IDS:
            out[p[0]] = (" ".join(p[6:-2]), float(p[4]), float(p[5]))
    return out


GAUGES = load_gauges()
WIND = ["00880", "07393"]   # Cottbus, Hoyerswerda


def bearing_km(lat, lon):
    la0, lo0 = map(math.radians, PLANT)
    la, lo = math.radians(lat), math.radians(lon)
    dx = (lo - lo0) * math.cos(la0) * 6371
    dy = (la - la0) * 6371
    return round((math.degrees(math.atan2(dx, dy)) + 360) % 360), round(math.hypot(dx, dy), 1)


def rows(kind, sid):
    f = glob.glob(str(DATA / f"10minutenwerte_{kind}_{sid}_*_20191231_hist.zip"))
    if not f:
        return
    z = zipfile.ZipFile(f[0])
    name = next(n for n in z.namelist() if n.startswith("produkt"))
    lines = z.read(name).decode("latin-1").splitlines()
    head = [h.strip() for h in lines[0].split(";")]
    for line in lines[1:]:
        yield dict(zip(head, (v.strip() for v in line.split(";"))))


def main(years):
    # rain per gauge per hour, and the largest 10-minute amount in that hour
    rain = defaultdict(lambda: defaultdict(float))
    burst = defaultdict(lambda: defaultdict(float))
    for sid in GAUGES:
        for r in rows("nieder", sid):
            t = r["MESS_DATUM"]
            if t[:4] not in years:
                continue
            v = float(r["RWS_10"])
            if v < 0:
                continue
            hour = t[:10]
            rain[hour][sid] += v
            burst[hour][sid] = max(burst[hour][sid], v)
    # wind: vector mean per hour over Cottbus and Hoyerswerda
    wind = defaultdict(lambda: [0.0, 0.0, 0])
    for sid in WIND:
        for r in rows("wind", sid):
            t = r["MESS_DATUM"]
            if t[:4] not in years:
                continue
            ff, dd = float(r["FF_10"]), float(r["DD_10"])
            if ff < 0 or dd < 0:
                continue
            w = wind[t[:10]]
            w[0] += ff * math.sin(math.radians(dd))
            w[1] += ff * math.cos(math.radians(dd))
            w[2] += 1

    days = defaultdict(lambda: {"showery": [], "wide": 0, "wet": defaultdict(int), "u": 0.0, "v": 0.0, "n": 0})
    for hour, per in rain.items():
        d = days[hour[:8]]
        wet = [s for s, v in per.items() if v >= 0.1]
        if len(wet) >= 5:
            d["wide"] += 1
        elif 1 <= len(wet) <= 3 and max(burst[hour].values()) >= 0.3:
            d["showery"].append(hour[8:])
            for s in wet:
                d["wet"][s] += 1
            w = wind.get(hour)
            if w and w[2]:
                d["u"] += w[0] / w[2]
                d["v"] += w[1] / w[2]
                d["n"] += 1

    out = []
    for day, d in sorted(days.items()):
        if len(d["showery"]) >= 3 and len(d["showery"]) > d["wide"]:
            ddir = (math.degrees(math.atan2(d["u"], d["v"])) + 360) % 360 if d["n"] else None
            spd = math.hypot(d["u"], d["v"]) / d["n"] if d["n"] else None
            out.append({
                "date": day,
                "showery_hours": len(d["showery"]),
                "hours_utc": " ".join(d["showery"]),
                "widespread_hours": d["wide"],
                "wind_from_deg": round(ddir) if ddir is not None else "",
                "wind_m_s": round(spd, 1) if spd is not None else "",
                **{f"wet_{GAUGES[s][0]}": d["wet"].get(s, 0) for s in GAUGES},
            })
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"shower-days-{'-'.join(sorted(years))}.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print("gauges (bearing from the plant, km):")
    for sid, (name, la, lo) in GAUGES.items():
        print(f"  {sid} {name}: {bearing_km(la, lo)}")
    print(f"{len(out)} candidate days -> {path}")
    return out


if __name__ == "__main__":
    for row in main(set(sys.argv[1:]) or {"2015", "2016"}):
        print(row["date"], f"{row['showery_hours']:>2} showery h", f"wind from {row['wind_from_deg']}° {row['wind_m_s']} m/s", "| hours", row["hours_utc"])
