import { faceQ, norm, faceBasis, synthWind, dot } from "./cubesphere";

/**
 * Bakes a field into a TEXTURE_2D_ARRAY of 6 faces.
 *
 * Channel layout: RG = velocity in the face tangent basis, B unused, A = 1.
 * Storing tangent components (not lon/lat) keeps the value continuous across an
 * edge — neighbouring faces disagree on the basis, not on the wind vector itself.
 */
export function buildWindTexture(
  faceSize: number,
  field: (p: [number, number, number]) => [number, number, number] = synthWind,
): Float32Array {
  const out = new Float32Array(faceSize * faceSize * 6 * 4);
  let o = 0;

  for (let face = 0; face < 6; face++) {
    for (let j = 0; j < faceSize; j++) {
      const t = ((j + 0.5) / faceSize) * 2 - 1;
      for (let i = 0; i < faceSize; i++) {
        const s = ((i + 0.5) / faceSize) * 2 - 1;
        const p = norm(faceQ(face, s, t));
        const [es, et] = faceBasis(face, p);
        const v = field(p);
        out[o++] = dot(v, es);
        out[o++] = dot(v, et);
        out[o++] = 0;
        out[o++] = 1;
      }
    }
  }
  return out;
}

export function uploadTexture(gl: WebGL2RenderingContext, data: Float32Array, faceSize: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  // RGBA16F + FLOAT source type is legal in WebGL2 and lets the driver do the conversion.
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA16F, faceSize, faceSize, 6, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
