"""Read DWD RADKLIM radar files (product YW: precipitation every 5 minutes, 1 x 1 km) and cut out
the area around a place, for sketch 21 (Schwarze Pumpe).

Source: Deutscher Wetterdienst, RADKLIM version 2017.002, opendata.dwd.de
  climate_environment/CDC/grids_germany/5_minutes/radolan/reproc/2017_002/bin/
Licence: CC BY 4.0, "Datenbasis: Deutscher Wetterdienst". Observed (radar, reprocessed by DWD).

The monthly .tar holds one .tar.gz per day; each day holds 288 binary files (one per 5 minutes, UTC).
Each file: an ASCII header ending with byte 0x03, then 1100 rows x 900 columns of 2-byte little-endian
values, starting with the south-west corner. The lowest 12 bits are the value (here in 0.01 mm per
5 minutes); bit 13 (0x2000) marks 'no data'.

The grid is the RADOLAN polar stereographic projection (true at 60 N, centre meridian 10 E,
Earth radius 6370.04 km), 1 km cells; the 1100 x 900 grid's south-west corner is at
x = -443.4622 km, y = -4758.6447 km.
"""

import math
import tarfile
from pathlib import Path

import numpy as np

ROWS, COLS = 1100, 900
X0, Y0 = -443.4622, -4758.6447   # km, south-west corner of the 1100 x 900 grid
R = 6370.04                      # km
PHI0, LAM0 = math.radians(60), math.radians(10)

PLACES = {
    "Schwarze Pumpe": (51.5371, 14.3533),
    "Niederaussem": (50.996, 6.669),   # the power station in the DWD article
}


def to_grid(lat, lon):
    """Latitude/longitude to (row from south, column from west), in grid cells (km)."""
    phi, lam = math.radians(lat), math.radians(lon)
    m = (1 + math.sin(PHI0)) / (1 + math.sin(phi))
    x = R * m * math.cos(phi) * math.sin(lam - LAM0)
    y = -R * m * math.cos(phi) * math.cos(lam - LAM0)
    return y - Y0, x - X0


def read_yw(data):
    """Bytes of one YW file -> (header text, mm per 5 minutes as float array with NaN for no data).
    Row 0 is the southernmost row."""
    end = data.index(b"\x03")
    header = data[:end].decode("latin-1")
    raw = np.frombuffer(data[end + 1:end + 1 + ROWS * COLS * 2], dtype="<u2").reshape(ROWS, COLS)
    prec = 0.01
    if "PR E-01" in header:
        prec = 0.1
    elif "PR E+00" in header:
        prec = 1.0
    mm = (raw & 0x0FFF).astype(np.float32) * prec
    mm[(raw & 0x2000) > 0] = np.nan
    return header, mm


def read_day(day_targz):
    """A day's .tar.gz -> sorted list of (time 'YYMMDDhhmm', mm array)."""
    out = []
    with tarfile.open(day_targz, "r:gz") as t:
        for m in t.getmembers():
            if not m.isfile():
                continue
            stamp = m.name.split("-")[2]          # raa01-yw2017.002_10000-1802021515-dwd---bin
            _, mm = read_yw(t.extractfile(m).read())
            out.append((stamp, mm))
    return sorted(out, key=lambda s: s[0])


def window(mm, lat, lon, half):
    """Cut a (2*half) x (2*half) km square around a place, north up (row 0 = north)."""
    r, c = to_grid(lat, lon)
    r, c = int(round(r)), int(round(c))
    return mm[r - half:r + half, c - half:c + half][::-1]


def day_from_month(month_tar, day, out_dir):
    """Take one day's .tar.gz out of a monthly .tar (e.g. day='20180202')."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(month_tar) as t:
        name = next(n for n in t.getnames() if n.endswith(f"_{day}.tar.gz"))
        t.extract(name, out_dir)
    return out_dir / name
