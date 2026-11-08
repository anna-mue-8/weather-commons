"""Estimate the hourly weather near Partwitzer See on the 1991 days, from the
readings at Cottbus, 31 km away.

Run from the sketch folder, after make_slice.py:
    .venv/Scripts/python scripts/estimate_weather.py        (Windows)

Why: the nearest station to the lake, 07393 Hoyerswerda (8 km), only has
records from 2010. Cottbus (00880) has them for 1991. Both recorded every hour
from 2010 to 2025, so we can learn how Hoyerswerda differed from Cottbus at a
given time of year, hour of day and type of weather, and apply that to 1991.

How (a simple statistical estimate; the result is modelled, not observed):
- For each hour to estimate, take all hours in 2010-2024 with the same hour
  of day (UTC), within a month of the same date in the year, and the same kind
  of weather at Cottbus: cloud cover (clear 0-2, some 3-5, overcast 6-8 okta)
  and wind (calm < 2, light 2-4, windy > 4 m/s).
- Hoyerswerda = Cottbus + the average difference in those hours, for air
  temperature and dew point; wind speed times the average ratio; pressure plus
  the average difference. Wind direction and cloud cover stay as at Cottbus.
- If fewer than 40 hours match, drop the wind class, then the cloud class.
- On a single night the difference can be far from the average (on clear,
  calm autumn nights from about 4 °C colder to 6 °C warmer), and Cottbus alone
  can't tell which. So there are three versions: "typical" (the average
  difference), "cold" (the average of the coldest tenth of matching hours) and
  "mild" (the warmest tenth). Dew point follows the same hours.
- To check the method, the 2025 days are estimated the same way, from Cottbus,
  and compared with what Hoyerswerda measured. 2025 is never used to learn.

Hoyerswerda is a stand-in for the area around the lake: it is on land, 8 km
away. The model itself works out how the air over the water differs.

Reads the DWD files in assets/dwd/hourly/ (from make_slice.py). Adds weather
"estimated-1991", "estimated-1991-cold", "estimated-1991-mild" and
"estimated-2025" (and its cold and mild versions) to data/slice-partwitz-*.json and writes
the check to data/weather-estimate-check.json.
"""

import csv
import io
import json
import math
import zipfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
CACHE = HERE / "assets" / "dwd" / "hourly"
SEASONS = {"summer": ("1991-08-07", "2025-08-12"), "autumn": ("1991-10-26", "2025-11-08")}
MIN_HOURS = 40


def load(code, station, columns):
    out = {}
    for path in sorted(CACHE.glob(f"stundenwerte_{code}_{station}_*.zip")):
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.startswith("produkt_"))
        for row in csv.DictReader(io.StringIO(z.read(name).decode("latin1")), delimiter=";"):
            row = {k.strip(): v.strip() for k, v in row.items()}
            vals = {}
            for c in columns:
                try:
                    x = float(row[c])
                    vals[c] = None if x == -999 else x
                except (KeyError, ValueError):
                    vals[c] = None
            out.setdefault(row["MESS_DATUM"], {}).update(vals)
    return out


def station(sid):
    s = {}
    for code, cols in (("TU", ["TT_TU"]), ("TF", ["TD_STD", "P_STD"]), ("FF", ["F", "D"]), ("N", ["V_N"])):
        for k, v in load(code, sid, cols).items():
            s.setdefault(k, {}).update(v)
    return s


def cloud_class(n):
    return None if n is None else (0 if n <= 2 else 1 if n <= 5 else 2)


def wind_class(f):
    return None if f is None else (0 if f < 2 else 1 if f <= 4 else 2)


def day_of_year(stamp):
    return date(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:8])).timetuple().tm_yday


def main():
    print("reading station files ...")
    cot, hoy = station("00880"), station("07393")
    # pairs of hours with readings at both stations, 2010-2024 (2025 is kept back for the check)
    pairs = []
    for stamp, h in hoy.items():
        c = cot.get(stamp)
        if not c or not ("2010" <= stamp[:4] <= "2024"):
            continue
        if None in (c.get("TT_TU"), h.get("TT_TU"), c.get("TD_STD"), h.get("TD_STD")):
            continue
        pairs.append({
            "doy": day_of_year(stamp), "hour": int(stamp[8:10]),
            "cloud": cloud_class(c.get("V_N")), "wind": wind_class(c.get("F")),
            "dT": h["TT_TU"] - c["TT_TU"], "dTd": h["TD_STD"] - c["TD_STD"],
            "fc": c.get("F"), "fh": h.get("F"),
            "dp": (h["P_STD"] - c["P_STD"]) if h.get("P_STD") is not None and c.get("P_STD") is not None else None,
        })
    print(len(pairs), "hours with both stations, 2010-2024")

    def estimate(stamp, version="typical"):
        c = cot.get(stamp, {})
        if c.get("TT_TU") is None:
            return None
        doy, hour = day_of_year(stamp), int(stamp[8:10])
        near = [p for p in pairs if p["hour"] == hour and min(abs(p["doy"] - doy), 365 - abs(p["doy"] - doy)) <= 30]
        cc, wc = cloud_class(c.get("V_N")), wind_class(c.get("F"))
        used = "season and hour"
        for label, test in (("season, hour, cloud and wind", lambda p: p["cloud"] == cc and p["wind"] == wc),
                            ("season, hour and cloud", lambda p: p["cloud"] == cc)):
            sel = [p for p in near if test(p)]
            if len(sel) >= MIN_HOURS:
                near, used = sel, label
                break
        mean = lambda xs: sum(xs) / len(xs) if xs else 0.0
        if version != "typical":                      # the coldest or warmest tenth of matching hours
            ranked = sorted(near, key=lambda p: p["dT"])
            tenth = max(4, len(ranked) // 10)
            near = ranked[:tenth] if version == "cold" else ranked[-tenth:]
        dT, dTd = mean([p["dT"] for p in near]), mean([p["dTd"] for p in near])
        fpairs = [(p["fc"], p["fh"]) for p in near if p["fc"] is not None and p["fh"] is not None]
        ratio = (sum(b for a, b in fpairs) / max(0.1, sum(a for a, b in fpairs))) if fpairs else 1.0
        dp = mean([p["dp"] for p in near if p["dp"] is not None])
        T = c["TT_TU"] + dT
        Td = min(T, c["TD_STD"] + dTd) if c.get("TD_STD") is not None else None
        rh = None
        if Td is not None:
            e = lambda t: 6.1094 * math.exp(17.625 * t / (t + 243.04))
            rh = round(100 * e(Td) / e(T))
        return {
            "temp_c": round(T, 1), "dew_point_c": None if Td is None else round(Td, 1), "rel_humidity_pct": rh,
            "pressure_hpa": None if c.get("P_STD") is None else round(c["P_STD"] + dp, 1),
            "wind_ms": None if c.get("F") is None else round(c["F"] * ratio, 1),
            "wind_from_deg": c.get("D"), "cloud_okta": c.get("V_N"), "rain_mm": None,
            "based_on_hours": len(near), "matched_by": used,
            "difference_temp_c": round(dT, 2), "difference_dew_point_c": round(dTd, 2), "wind_ratio": round(ratio, 2),
        }

    check = {}
    for season, days in SEASONS.items():
        path = HERE / "data" / f"slice-partwitz-{season}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for d, version in [(d, v) for d in days for v in ("typical", "cold", "mild")]:
            stamp = d.replace("-", "")
            hours = []
            for h in range(24):
                est = estimate(f"{stamp}{h:02d}", version) or {}
                hours.append({"utc": h, **est})
            key = f"estimated-{d[:4]}" + ("" if version == "typical" else f"-{version}")
            data["weather"][key] = {
                "version": version,
                "station": "estimated for the area near the lake (Hoyerswerda, 8 km) from 00880 Cottbus",
                "station_name": "Near the lake, estimated from Cottbus",
                "distance_km": 8,
                "estimated": True,
                "date": d,
                "hours_utc": hours,
                "method": "Cottbus reading plus the average Hoyerswerda-minus-Cottbus difference in 2010-2024 at the same hour, within a month of the date, in the same cloud and wind class. See scripts/estimate_weather.py.",
            }
            t = [x["temp_c"] for x in hours if x.get("temp_c") is not None]
            print(f"{season} {key} {d}: {min(t)} to {max(t)} °C")
            if d.startswith("2025") and version == "typical":
                obs = data["weather"]["hoyerswerda-2025"]["hours_utc"]
                err = lambda k: [x[k] - o[k] for x, o in zip(hours, obs) if x.get(k) is not None and o.get(k) is not None]
                rmse = lambda e: round(math.sqrt(sum(v * v for v in e) / len(e)), 2)
                bias = lambda e: round(sum(e) / len(e), 2)
                eT, eTd = err("temp_c"), err("dew_point_c")
                mins = (min(t), min(o["temp_c"] for o in obs if o["temp_c"] is not None))
                check[d] = {
                    "temp_rmse_c": rmse(eT), "temp_bias_c": bias(eT),
                    "dew_point_rmse_c": rmse(eTd), "dew_point_bias_c": bias(eTd),
                    "lowest_temp_estimated_c": mins[0], "lowest_temp_observed_c": mins[1],
                    "cottbus_lowest_temp_c": min(o["temp_c"] for o in data["weather"]["cottbus-2025"]["hours_utc"] if o["temp_c"] is not None),
                }
        # lowest temperature in the cold and mild versions, to see whether the observed night falls in between
        d25 = days[1]
        low = lambda key: min(x["temp_c"] for x in data["weather"][key]["hours_utc"] if x.get("temp_c") is not None)
        check[d25]["lowest_temp_cold_version_c"] = low("estimated-2025-cold")
        check[d25]["lowest_temp_mild_version_c"] = low("estimated-2025-mild")
        print("  check against Hoyerswerda:", d25, check[d25])
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    (HERE / "data" / "weather-estimate-check.json").write_text(json.dumps({
        "about": "How well the estimate from Cottbus matches what Hoyerswerda measured, on the 2025 days (2025 not used to learn). RMSE: typical size of the error over the 24 hours. Bias: average error (estimate minus observed).",
        "days": check,
    }, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
