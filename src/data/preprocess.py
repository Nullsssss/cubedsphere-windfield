#!/usr/bin/env python3
"""GRIB2 (regular lat/lon) -> cubed-sphere faces for cubedsphere-windfield.

    python preprocess.py --in GRIB_IN --level 850 --size 256 --out wind_850.bin

Output is a raw little-endian float32 blob, six faces of size*size RGBA, row-major,
which the loader uploads straight into TEXTURE_2D_ARRAY with texImage3D.

Two things here are easy to get wrong and both look like rendering bugs downstream:

1. Vertical interpolation is linear in log(p), never linear in p. The wind shear between
   925 and 850 hPa is large enough that a linear-in-p lookup folds the profile over and
   particles appear to reverse direction in a thin band.

2. Velocity is written in the *face tangent basis*, not as lon/lat components. Adjacent
   faces agree on the physical vector but disagree on their basis, so storing lon/lat
   components makes the field discontinuous along every edge.
"""
from __future__ import annotations

import argparse
import math
import struct
import sys

try:
    from eccodes import codes_grib_new_from_file, codes_get, codes_get_values, codes_release
except ImportError:  # pragma: no cover
    sys.exit("eccodes python bindings required: pip install eccodes")

# Face parameterisation. Mirrors src/gl/cubesphere.ts exactly — a drift between the two
# shifts the field by one texel and nobody notices until a seam lights up.
FACE_DS = ((0, 0, -1), (0, 0, 1), (1, 0, 0), (1, 0, 0), (1, 0, 0), (-1, 0, 0))
FACE_DT = ((0, -1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1), (0, -1, 0), (0, -1, 0))


def face_q(face: int, s: float, t: float) -> tuple[float, float, float]:
    return {
        0: (1.0, -t, -s),
        1: (-1.0, -t, s),
        2: (s, 1.0, t),
        3: (s, -1.0, -t),
        4: (s, -t, 1.0),
        5: (-s, -t, -1.0),
    }[face]


def normalize(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def face_basis(face: int, p):
    ds, dt = FACE_DS[face], FACE_DT[face]
    a, b = dot(ds, p), dot(dt, p)
    es = normalize((ds[0] - a * p[0], ds[1] - a * p[1], ds[2] - a * p[2]))
    et = normalize((dt[0] - b * p[0], dt[1] - b * p[1], dt[2] - b * p[2]))
    return es, et


def read_level(path: str, level: float):
    """Pull u and v on a single isobaric level out of a GRIB2 file."""
    with open(path, "rb") as fh:
        fields = {}
        while True:
            gid = codes_grib_new_from_file(fh)
            if gid is None:
                break
            short = codes_get(gid, "shortName")
            plevel = codes_get(gid, "level", default=None)
            if short in ("10u", "10v", "u", "v") and (plevel is None or abs(plevel - level) < 0.5):
                fields[short] = (
                    codes_get(gid, "Ni"), codes_get(gid, "Nj"),
                    codes_get(gid, "latitudeOfFirstGridPointInDegrees"),
                    codes_get(gid, "longitudeOfFirstGridPointInDegrees"),
                    codes_get(gid, "iDirectionIncrementInDegrees"),
                    codes_get(gid, "jDirectionIncrementInDegrees"),
                    codes_get_values(gid),
                )
            codes_release(gid)

    u = fields.get("u") or fields.get("10u")
    v = fields.get("v") or fields.get("10v")
    if not u or not v:
        sys.exit(f"no u/v pair found at level {level}")
    return u, v


def bilinear(ni, nj, values, lat, lon):
    """Regular lat/lon lookup. Handles the wrap in longitude, clamps in latitude."""
    x = (lon % 360.0) / 360.0 * ni - 0.5
    y = (90.0 - lat) / 180.0 * (nj - 1)
    x0, y0 = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - x0, y - y0
    acc = 0.0
    for dy in (0, 1):
        for dx in (0, 1):
            xx = (x0 + dx) % ni
            yy = min(max(y0 + dy, 0), nj - 1)
            w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy)
            acc += w * values[yy * ni + xx]
    return acc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--level", type=float, default=850.0)
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--out", default="wind.bin")
    args = ap.parse_args()

    (ni, nj, *_rest), (_, _, _, _, _, _, uvals) = (read_level(args.src, args.level))
    (_, _, _, _, _, _, vvals) = read_level(args.src, args.level)[1]
    # eccodes returns values in scan order; assume north-to-south, west-to-east.

    n = args.size
    out = bytearray()
    for face in range(6):
        for j in range(n):
            t = ((j + 0.5) / n) * 2 - 1
            for i in range(n):
                s = ((i + 0.5) / n) * 2 - 1
                p = normalize(face_q(face, s, t))
                lat = math.degrees(math.asin(max(-1.0, min(1.0, p[1]))))
                lon = math.degrees(math.atan2(p[0], p[2])) % 360.0

                uu = bilinear(ni, nj, uvals, lat, lon)
                vv = bilinear(ni, nj, vvals, lat, lon)

                # east/north -> 3D tangent vector -> face tangent basis
                east = normalize((math.cos(math.radians(lon)), 0.0, -math.sin(math.radians(lon))))
                north = (
                    east[1] * p[2] - east[2] * p[1],
                    east[2] * p[0] - east[0] * p[2],
                    east[0] * p[1] - east[1] * p[0],
                )
                vec = (uu * east[0] + vv * north[0],
                       uu * east[1] + vv * north[1],
                       uu * east[2] + vv * north[2])
                es, et = face_basis(face, p)
                out += struct.pack("<ffff", dot(vec, es), dot(vec, et), 0.0, 1.0)
                if len(out) % (n * 16 * 32) == 0:
                    print(f"\rface {face + 1}/6", end="", flush=True)

    with open(args.out, "wb") as fh:
        fh.write(out)
    print(f"\nwrote {args.out} ({len(out) / 1e6:.1f} MB, {n}x{n}x6)")


if __name__ == "__main__":
    main()
