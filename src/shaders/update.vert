#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray uWind;
uniform float uSize;
uniform float uDt;
uniform float uTime;
uniform float uGain;

layout(location = 0) in highp vec3 aPos;
layout(location = 1) in highp float aSeed;

out vec3 vPrev;
out vec3 vPos;
out float vSeed;

vec4 crW(float t) {
  float t2 = t * t, t3 = t2 * t;
  return vec4(-0.5*t3 + t2 - 0.5*t, 1.5*t3 - 2.5*t2 + 1.0,
              -1.5*t3 + 2.0*t2 + 0.5*t, 0.5*t3 - 0.5*t2);
}

void faceBasis(int f, vec3 p, out vec3 es, out vec3 et) {
  vec3 ds, dt;
  if      (f == 0) { ds = vec3( 0, 0,-1); dt = vec3(0,-1, 0); }
  else if (f == 1) { ds = vec3( 0, 0, 1); dt = vec3(0,-1, 0); }
  else if (f == 2) { ds = vec3( 1, 0, 0); dt = vec3(0, 0, 1); }
  else if (f == 3) { ds = vec3( 1, 0, 0); dt = vec3(0, 0,-1); }
  else if (f == 4) { ds = vec3( 1, 0, 0); dt = vec3(0,-1, 0); }
  else             { ds = vec3(-1, 0, 0); dt = vec3(0,-1, 0); }
  es = normalize(ds - dot(ds, p) * p);
  et = normalize(dt - dot(dt, p) * p);
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

vec3 velocityAt(vec3 p) {
  vec4 fu = toFaceUV(p);
  int face = int(fu.x);
  vec3 es, et;
  faceBasis(face, p, es, et);
  vec2 w = bicubic(face, fu.yz);
  return (w.x * es + w.y * et) * uGain;
}

vec3 hashDir(float s) {
  float a = fract(sin(s * 127.1 + 11.0) * 43758.5453);
  float b = fract(sin(s * 311.7 + 71.0) * 43758.5453);
  float z = 1.0 - 2.0 * a;
  float r = sqrt(max(0.0, 1.0 - z * z));
  float phi = 6.2831853 * b;
  return vec3(r * cos(phi), z, r * sin(phi));
}

void main() {
  float life = fract(aSeed * 7.31 + uTime * 0.055);
  vec3 p = aPos;

  if (life < 0.012) {
    p = hashDir(aSeed * 137.7 + floor(uTime * 60.0));
  } else {
    vec3 k1 = velocityAt(p);
    vec3 k2 = velocityAt(normalize(p + 0.5 * uDt * k1));
    vec3 k3 = velocityAt(normalize(p + 0.5 * uDt * k2));
    vec3 k4 = velocityAt(normalize(p + uDt * k3));
    p = normalize(p + uDt * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0);
  }

  vPrev = aPos;
  vPos  = p;
  vSeed = aSeed;
  gl_Position = vec4(0.0);
}
