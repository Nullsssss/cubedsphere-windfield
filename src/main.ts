import { createProgram } from "./gl/program";
import { buildWindTexture, uploadTexture } from "./gl/texture";
import { createParticles } from "./gl/particles";

import updateVert from "./shaders/update.vert?raw";
import drawVert from "./shaders/draw.vert?raw";
import drawFrag from "./shaders/draw.frag?raw";

const q = new URLSearchParams(location.search);
const FACE_SIZE = Number(q.get("tex") ?? 256);
const PARTICLES = Number(q.get("n") ?? 131072);
const STOP_AFTER = Number(q.get("frames") ?? 0);

const canvas = document.getElementById("c") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2", {
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: Boolean(q.get("export")),
});
if (!gl) throw new Error("WebGL2 unavailable");

const updProg = createProgram(gl, {
  vs: updateVert,
  fs: `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`,
  varyings: ["vPrev", "vPos", "vSeed"],
});

const drawProg = createProgram(gl, { vs: drawVert, fs: drawFrag });

const windTex = uploadTexture(gl, buildWindTexture(FACE_SIZE), FACE_SIZE);
const ps = createParticles(gl, PARTICLES);

const U = {
  upd: {
    wind: gl.getUniformLocation(updProg, "uWind"),
    size: gl.getUniformLocation(updProg, "uSize"),
    dt: gl.getUniformLocation(updProg, "uDt"),
    time: gl.getUniformLocation(updProg, "uTime"),
    gain: gl.getUniformLocation(updProg, "uGain"),
  },
  draw: {
    wind: gl.getUniformLocation(drawProg, "uWind"),
    size: gl.getUniformLocation(drawProg, "uSize"),
    proj: gl.getUniformLocation(drawProg, "uProj"),
    view: gl.getUniformLocation(drawProg, "uView"),
  },
};

function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye: number[], center: number[], up: number[]) {
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
  ];
  const z = nrm(sub(eye, center));
  const x = nrm(crs(up, z));
  const y = crs(z, x);
  const d = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -d(x, eye), -d(y, eye), -d(z, eye), 1,
  ]);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

let frame = 0;

function step(dt: number, time: number) {
  const even = frame % 2 === 0;
  const srcBuf = even ? ps.bufA : ps.bufB;
  const dstVAO = even ? ps.vaoB : ps.vaoA;
  const tf = even ? ps.tfA : ps.tfB;

  // ---- integrate ----
  gl.useProgram(updProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, windTex);
  gl.uniform1i(U.upd.wind, 0);
  gl.uniform1f(U.upd.size, FACE_SIZE);
  gl.uniform1f(U.upd.dt, 0.0026);
  gl.uniform1f(U.upd.time, time);
  gl.uniform1f(U.upd.gain, 1.0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, srcBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 12);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 24);

  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, even ? ps.bufB : ps.bufA);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, PARTICLES);
  gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  gl.disable(gl.RASTERIZER_DISCARD);

  // ---- render ----
  gl.clearColor(0.02, 0.03, 0.05, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(drawProg);
  gl.uniform1i(U.draw.wind, 0);
  gl.uniform1f(U.draw.size, FACE_SIZE);
  gl.uniformMatrix4fv(U.draw.proj, false, perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 10));
  gl.uniformMatrix4fv(U.draw.view, false, lookAt([0, 0.30, 3.35], [-0.10, 0, 0], [0, 1, 0]));

  gl.bindVertexArray(dstVAO);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.drawArrays(gl.POINTS, 0, PARTICLES);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  frame++;
}

if (STOP_AFTER > 0) {
  const t0 = performance.now();
  for (let i = 0; i < STOP_AFTER; i++) step(1 / 60, (i / 60) * 3);
  const ms = (performance.now() - t0) / STOP_AFTER;
  document.getElementById("fps")!.textContent = String(Math.min(60, Math.round(1000 / ms)));
} else {
  let prev = performance.now(), acc = 0, n = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    acc += dt; n++;
    if (acc > 0.5) {
      document.getElementById("fps")!.textContent = String(Math.round(n / acc));
      acc = 0; n = 0;
    }
    step(dt, (now - performance.now()) / 1000 + performance.now() / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
