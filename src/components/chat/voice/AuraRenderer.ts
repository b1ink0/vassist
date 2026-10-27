/*!
Aura shader adapted from LiveKit components-js, Copyright 2023 LiveKit, Inc.
Licensed under Apache-2.0. See licenses/livekit-aura.txt in source and
THIRD-PARTY-LICENSES.txt in distributed builds for the full license.
Modified for VAssist: monochrome line shape, compact rendering, external audio envelopes, simplified WebGL host.
Source: https://github.com/livekit/components-js/blob/main/packages/shadcn/components/agents-ui/agent-audio-visualizer-aura.tsx
*/

const fragmentSource = `precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uAmplitude;
uniform float uLevel;
uniform float uSpeed;
uniform float uMix;
uniform vec3 uColor;
const float uScale = 0.20;
const float uFrequency = 0.65;
const float uVariance = 0.1;
const float uSpacing = 0.5;
const float uBlur = 0.2;
const float uSmoothing = 1.0;

const float TAU = 6.283185;

// SDF shapes
float sdLine(vec2 p, float r) {
  float halfLen = r * 2.0;
  vec2 a = vec2(-halfLen, 0.0);
  vec2 b = vec2(halfLen, 0.0);
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}


vec2 turb(vec2 pos, float t, float it) {
  // Initial rotation matrix for swirl direction
  mat2 rotation = mat2(0.6, -0.25, 0.25, 0.9);
  // Secondary rotation applied each iteration (approx 53 degree rotation)
  mat2 layerRotation = mat2(0.6, -0.8, 0.8, 0.6);

  float frequency = mix(2.0, 15.0, uFrequency);
  float amplitude = uAmplitude;
  float frequencyGrowth = 1.4;
  float animTime = t * 0.1 * uSpeed;

  const int LAYERS = 4;
  for(int i = 0; i < LAYERS; i++) {
    // Calculate wave displacement for this layer
    vec2 rotatedPos = pos * rotation;
    vec2 wave = sin(frequency * rotatedPos + (float(i) + 1.0) * animTime + it);

    // Apply displacement along rotation direction
    pos += (amplitude / frequency) * rotation[0] * wave;

    // Evolve parameters for next layer
    rotation *= layerRotation;
    amplitude *= mix(1.0, max(wave.x, wave.y), uVariance);
    frequency *= frequencyGrowth;
  }

  return pos;
}

const float ITERATIONS = 16.0;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  vec3 pp = vec3(0.0);

  float t = iTime * 0.5;
  vec2 pos = uv - 0.5;

  vec2 prevPos = turb(pos, t, 0.0 - 1.0 / ITERATIONS);
  float spacing = mix(1.0, TAU, uSpacing);
  float envelope = pow(max(sin(uv.x * 3.141593), 0.0), 1.4);

  for(float i = 1.0; i < ITERATIONS + 1.0; i++) {
    float iter = i / ITERATIONS;
    float phase = iter * TAU;
    float displacement = envelope * uLevel * (
      0.26 * sin(pos.x * 11.5 - iTime * 3.2 + phase * 0.85) +
      0.11 * sin(pos.x * 24.0 + iTime * 2.3 + phase * 1.4)
    );
    vec2 samplePos = pos - vec2(0.0, displacement);
    vec2 st = turb(samplePos, t, iter * spacing);
    float d = sdLine(st, uScale);
    float pd = distance(st, prevPos);
    prevPos = st;
    float dynamicBlur = min(exp2(pd * 2.0 * 1.4426950408889634) - 1.0, 0.035);
    float ds = smoothstep(0.0, uBlur * 0.05 + max(dynamicBlur * uSmoothing, 0.001), d);

    vec3 color = vec3(1.0);


    pp += (ds - 1.0) * color;
  }

  pp *= 1.0 / ITERATIONS;

  float edgeFade = smoothstep(0.0, 0.13, uv.x) * smoothstep(0.0, 0.13, 1.0 - uv.x);
  float verticalFade = smoothstep(0.0, 0.12, uv.y) * smoothstep(0.0, 0.12, 1.0 - uv.y);
  float alpha = clamp(-pp.r * uMix * 2.7, 0.0, 1.0) * edgeFade * verticalFade;
  fragColor = vec4(uColor, alpha);
}
void main() { mainImage(gl_FragColor, gl_FragCoord.xy); }
`;

export class AuraRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly uniforms: Record<string, WebGLUniformLocation> = {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("Aura requires WebGL");
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Cannot create Aura shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error ?? "Cannot compile Aura shader");
      }
      return shader;
    };
    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    try {
      vertex = compile(
        gl.VERTEX_SHADER,
        "attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }",
      );
      fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      if (!program) throw new Error("Cannot create Aura program");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(
          gl.getProgramInfoLog(program) ?? "Cannot link Aura shader",
        );
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("Cannot create Aura buffer");
      this.program = program;
      this.buffer = buffer;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const name of [
        "iResolution",
        "iTime",
        "uAmplitude",
        "uLevel",
        "uSpeed",
        "uMix",
        "uColor",
      ]) {
        const location = gl.getUniformLocation(program, name);
        if (location !== null) this.uniforms[name] = location;
      }
    } catch (error) {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      throw error;
    } finally {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
  }

  draw(time: number, level: number, thinking: boolean, color: number[]) {
    const { gl, canvas, uniforms } = this;
    if (gl.isContextLost()) return;
    // The bar is only 36 CSS pixels high. Avoid a retina-sized extra GPU surface.
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform2f(uniforms.iResolution ?? null, width, height);
    gl.uniform1f(uniforms.iTime ?? null, time);
    gl.uniform1f(uniforms.uSpeed ?? null, thinking ? 8 : 20);
    gl.uniform1f(uniforms.uLevel ?? null, level);
    gl.uniform1f(uniforms.uAmplitude ?? null, 0.05 + level * 0.55);
    gl.uniform1f(uniforms.uMix ?? null, thinking ? 0.65 : 1);
    gl.uniform3f(
      uniforms.uColor ?? null,
      color[0] ?? 1,
      color[1] ?? 1,
      color[2] ?? 1,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
