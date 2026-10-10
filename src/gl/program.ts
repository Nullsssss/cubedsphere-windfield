export function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    // ANGLE reports these as "ERROR: 0:<line>: ..." — keep the log verbatim, it is the only
    // thing that tells you which of the four samplers you broke.
    throw new Error(`shader compile failed\n${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

export interface ProgramOptions {
  vs: string;
  fs: string;
  /** transform feedback varyings, interleaved into a single buffer */
  varyings?: string[];
}

export function createProgram(gl: WebGL2RenderingContext, opts: ProgramOptions): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, opts.vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, opts.fs));
  if (opts.varyings?.length) {
    // INTERLEAVED, not SEPARATE. With SEPARATE every varying wants its own
    // buffer base and binding only index 0 silently writes nothing.
    gl.transformFeedbackVaryings(p, opts.varyings, gl.INTERLEAVED_ATTRIBS);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link failed\n${gl.getProgramInfoLog(p)}`);
  }
  return p;
}
