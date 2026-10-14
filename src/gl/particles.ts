// Particle state lives in a single interleaved buffer:
//   [ prev.xyz | pos.xyz | seed ]  = 7 floats = 28 bytes per particle
//
// Two buffers ping-pong through transform feedback. The interleaving is what makes the
// draw pass free: the same buffer the integrator wrote is the one the vertex shader reads,
// with no repacking in between.

export const STRIDE = 7 * 4;

export interface ParticleSystem {
  bufA: WebGLBuffer;
  bufB: WebGLBuffer;
  vaoA: WebGLVertexArrayObject;
  vaoB: WebGLVertexArrayObject;
  tfA: WebGLTransformFeedback;
  tfB: WebGLTransformFeedback;
  count: number;
}

function randomSphere(): [number, number, number] {
  const u = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return [r * Math.cos(phi), u, r * Math.sin(phi)];
}

export function createParticles(gl: WebGL2RenderingContext, count: number): ParticleSystem {
  const initial = new Float32Array(count * 7);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = randomSphere();
    initial[i * 7 + 0] = x; initial[i * 7 + 1] = y; initial[i * 7 + 2] = z;
    initial[i * 7 + 3] = x; initial[i * 7 + 4] = y; initial[i * 7 + 5] = z;
    initial[i * 7 + 6] = Math.random();
  }

  const bufA = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bufA);
  gl.bufferData(gl.ARRAY_BUFFER, initial, gl.DYNAMIC_COPY);

  const bufB = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bufB);
  gl.bufferData(gl.ARRAY_BUFFER, count * STRIDE, gl.DYNAMIC_COPY);

  const makeVAO = (buf: WebGLBuffer) => {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // Locations are pinned with layout(location=…) in the shaders. Relying on
    // getAttribLocation is how you end up with attribute 0 optimised away and the whole
    // point cloud silently dropped by the driver.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 24);
    gl.bindVertexArray(null);
    return vao;
  };

  const vaoA = makeVAO(bufA);
  const vaoB = makeVAO(bufB);

  const tfA = gl.createTransformFeedback()!;
  const tfB = gl.createTransformFeedback()!;
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfA);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufB);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfB);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufA);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  return { bufA, bufB, vaoA, vaoB, tfA, tfB, count };
}
