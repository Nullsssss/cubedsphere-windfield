// Cubed-sphere parameterisation.
//
// Each face is a gnomonic projection: q(s,t) with s,t in [-1,1], then normalised.
// The same formulas are duplicated in GLSL (see shaders/draw.vert) — keep them in sync,
// a mismatch shows up as velocity that is continuous in one hemisphere and not the other.

export const FACE_DS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0],
];
export const FACE_DT: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, -1, 0],
];

export type Vec3 = [number, number, number];

export function faceQ(face: number, s: number, t: number): Vec3 {
  switch (face) {
    case 0: return [1, -t, -s];
    case 1: return [-1, -t, s];
    case 2: return [s, 1, t];
    case 3: return [s, -1, -t];
    case 4: return [s, -t, 1];
    default: return [-s, -t, -1];
  }
}

export const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Orthonormal tangent basis on a face, from the unnormalised face derivatives. */
export function faceBasis(face: number, p: Vec3): [Vec3, Vec3] {
  const ds = FACE_DS[face], dt = FACE_DT[face];
  const a = dot(ds as Vec3, p), b = dot(dt as Vec3, p);
  const es = norm([ds[0] - a * p[0], ds[1] - a * p[1], ds[2] - a * p[2]]);
  const et = norm([dt[0] - b * p[0], dt[1] - b * p[1], dt[2] - b * p[2]]);
  return [es, et];
}

/** Combines the analytic basis with a 2D face velocity into a 3D tangent vector. */
export function toTangent3D(face: number, p: Vec3, us: number, ut: number): Vec3 {
  const [es, et] = faceBasis(face, p);
  return [us * es[0] + ut * et[0], us * es[1] + ut * et[1], us * es[2] + ut * et[2]];
}

/**
 * Synoptic test field used when no GRIB is loaded: two zonal jets plus four
 * vortices. Only meant to exercise the sampler — not a physically meaningful field.
 */
const VORTICES = [
  { c: norm([0.45, 0.86, -0.25]), w: 26, r: 0.52 },
  { c: norm([-0.62, -0.52, 0.58]), w: -30, r: 0.44 },
  { c: norm([0.72, 0.10, 0.68]), w: 18, r: 0.36 },
  { c: norm([-0.30, 0.42, -0.86]), w: -14, r: 0.62 },
] as const;

export function synthWind(p: Vec3): Vec3 {
  const lat = Math.asin(Math.max(-1, Math.min(1, p[1])));
  const east = norm(cross([0, 1, 0], p));
  const j = 34 * Math.exp(-Math.pow((Math.abs(lat) - 0.78) / 0.30, 2))
          -  9 * Math.exp(-Math.pow(lat / 0.22, 2));
  let v: Vec3 = [east[0] * j, east[1] * j, east[2] * j];

  for (const vx of VORTICES) {
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(p, vx.c as Vec3))));
    const f = Math.exp(-Math.pow(ang / vx.r, 2));
    if (f < 1e-4) continue;
    const tg = cross(vx.c as Vec3, p);
    const l = Math.hypot(tg[0], tg[1], tg[2]) + 1e-6;
    const k = (vx.w * f) / l;
    v = [v[0] + tg[0] * k, v[1] + tg[1] * k, v[2] + tg[2] * k];
  }

  const rd = dot(v, p);              // project back onto the tangent plane
  return [v[0] - rd * p[0], v[1] - rd * p[1], v[2] - rd * p[2]];
}
