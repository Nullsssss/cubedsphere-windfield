#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray uWind;
uniform float uSize;
uniform mat4 uProj;
uniform mat4 uView;

layout(location = 0) in highp vec3 aPrev;
layout(location = 1) in highp vec3 aPos;
layout(location = 2) in highp float aSeed;

out vec3 vColor;

vec4 crW(float t) {
  float t2 = t * t, t3 = t2 * t;
  return vec4(-0.5*t3 + t2 - 0.5*t, 1.5*t3 - 2.5*t2 + 1.0,
              -1.5*t3 + 2.0*t2 + 0.5*t, 0.5*t3 - 0.5*t2);
}

vec4 toFaceUV(vec3 p) {
  vec3 q = abs(p);
  int face; vec2 st;
  if (q.x >= q.y && q.x >= q.z) {
    if (p.x > 0.0) { face = 0; st = vec2(-p.z, -p.y) / q.x; }
    else           { face = 1; st = vec2( p.z, -p.y) / q.x; }
  } else if (q.y >= q.z) {
    if (p.y > 0.0) { face = 2; st = vec2( p.x,  p.z) / q.y; }
    else           { face = 3; st = vec2( p.x, -p.z) / q.y; }
  } else {
    if (p.z > 0.0) { face = 4; st = vec2( p.x, -p.y) / q.z; }
    else           { face = 5; st = vec2(-p.x, -p.y) / q.z; }
  }
  return vec4(float(face), st * 0.5 + 0.5, 1.0);
}

vec2 bicubic(int face, vec2 uv) {
  vec2 tc = uv * uSize - 0.5;
  vec2 ip = floor(tc);
  vec2 f  = tc - ip;
  vec4 wx = crW(f.x), wy = crW(f.y);
  ivec2 lim = ivec2(int(uSize)) - 1;
  vec2 lo = vec2(1e6), hi = vec2(-1e6), acc = vec2(0.0);
  for (int j = 0; j < 4; ++j) {
    vec2 row = vec2(0.0);
    for (int k = 0; k < 4; ++k) {
      vec2 v = texelFetch(uWind, ivec3(clamp(ivec2(ip) + ivec2(k - 1, j - 1), ivec2(0), lim), face), 0).rg;
      lo = min(lo, v); hi = max(hi, v);
      row += wx[k] * v;
    }
    acc += wy[j] * row;
  }
  return clamp(acc, lo, hi);
}

void main() {
  vec4 fu = toFaceUV(aPos);
  vec2 w  = bicubic(int(fu.x), fu.yz);
  float sp = length(w);

  float t = clamp(sp / 42.0, 0.0, 1.0);
  vec3 cold = vec3(0.22, 0.55, 1.00);
  vec3 mid  = vec3(0.25, 0.95, 1.00);
  vec3 hot  = vec3(1.00, 0.86, 0.60);
  vColor = t < 0.55 ? mix(cold, mid, t / 0.55) : mix(mid, hot, (t - 0.55) / 0.45);
  vColor *= 0.62 + 0.38 * fract(aSeed * 91.7);

  vec3 n = normalize(aPos);
  gl_Position = uProj * uView * vec4(aPos, 1.0);
  gl_PointSize = 2.3;

  float facing = max(0.0, dot(n, normalize(vec3(0.0, 0.0, 1.0))));
  vColor *= 0.08 + 0.92 * pow(facing, 0.65);

  // particles that moved further since the last step render brighter
  vColor *= mix(0.45, 1.0, clamp(length(aPos - aPrev) * 220.0, 0.0, 1.0));
}
