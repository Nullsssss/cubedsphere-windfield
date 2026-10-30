// 4x4 Catmull-Rom bicubic lookup over a sampler2DArray.
//
// NOTE: the interior is exact, the boundary is not. Every tap is clamped to the face
// limits, which is only right where the neighbour does not exist (nowhere) — a real
// implementation walks the face adjacency table and pulls the tap from the neighbour
// face with its uv rotated. See the open issue in the README.
vec4 crWeights(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(-0.5 * t3 + t2 - 0.5 * t,
               1.5 * t3 - 2.5 * t2 + 1.0,
              -1.5 * t3 + 2.0 * t2 + 0.5 * t,
               0.5 * t3 - 0.5 * t2);
}

vec2 bicubicFace(sampler2DArray tex, int face, vec2 uv, float size) {
  vec2 tc = uv * size - 0.5;
  vec2 ip = floor(tc);
  vec2 f  = tc - ip;
  vec4 wx = crWeights(f.x);
  vec4 wy = crWeights(f.y);
  ivec2 lim = ivec2(int(size)) - 1;

  vec2 lo = vec2(1e6), hi = vec2(-1e6);
  vec2 acc = vec2(0.0);

  for (int j = 0; j < 4; ++j) {
    vec2 row = vec2(0.0);
    for (int k = 0; k < 4; ++k) {
      ivec2 t = ivec2(ip) + ivec2(k - 1, j - 1);
      t = clamp(t, ivec2(0), lim);
      vec2 v = texelFetch(tex, ivec3(t, face), 0).rg;
      lo = min(lo, v);
      hi = max(hi, v);
      row += wx[k] * v;
    }
    acc += wy[j] * row;
  }

  // Clamp the overshoot back into the sampled neighbourhood. Without this the negative
  // lobes of the kernel overshoot at the jet maximum by ~9%.
  return clamp(acc, lo, hi);
}
