// 3D kinetic typography (WebGL2), "3D Düğüm": the Codrops "Kinetic
// Typography with Three.js" idea. The spoken line, repeated, scrolls along a
// torus knot whose tube has three flat faces and fades with depth. A
// depth-of-field pass racks the focus slowly along the knot; the line itself
// is read in front of it (kinetic.ts draws that). The output is premultiplied
// and transparent around the knot, so the stage background or the aura shows
// through.

import { captionStack, fontById, type FontId } from "../captions/fonts";
import type { Word } from "../engine";
import type { Cue } from "../lib/cues";
import { hasDottedI } from "../lib/lang";
import type { KineticPalette } from "./kinetic";

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec3 aNormal;

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;

out vec2 vUv;
out vec3 vViewPos;
out vec3 vWorldNormal;

void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  vec4 viewPos = uView * worldPos;
  vViewPos = viewPos.xyz;
  vWorldNormal = mat3(uModel) * aNormal;
  vUv = aUv;
  gl_Position = uProj * viewPos;
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vViewPos;
in vec3 vWorldNormal;

uniform sampler2D uTex;
uniform vec2 uDepthRange;
uniform vec3 uFace;
uniform float uRepeat;
uniform float uScroll;

out vec4 outColor;

void main() {
  vec3 N = normalize(vWorldNormal);
  float fog = smoothstep(0.0, 1.0, clamp((vViewPos.z - uDepthRange.x) / (uDepthRange.y - uDepthRange.x), 0.0, 1.0));
  // Flipped along the tube, so the type reads left to right from outside.
  vec4 tx = texture(uTex, vec2(-vUv.x * uRepeat + uScroll, vUv.y));
  vec3 L = normalize(vec3(-0.4, 0.8, 0.6));
  float diff = 0.4 + 0.6 * max(dot(N, L), 0.0);
  vec3 col = uFace * diff * (1.0 - tx.a) + tx.rgb * (0.7 + 0.3 * diff);
  outColor = vec4(col, 1.0) * fog;
}
`;

// Fullscreen triangle for the post pass.
const POST_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Depth of field as a gather: each pixel takes the samples whose own blur
// disc reaches it, so blurred parts spread over sharp ones in front of them,
// but nothing behind a pixel blurs over it more than the pixel itself is blurred.
const DOF_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uRange;
uniform float uMaxR;
out vec4 outColor;

float dist(vec2 uv) {
  float z = texture(uDepth, uv).r * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}

float coc(float d) {
  return clamp(abs(d - uFocus) / uRange, 0.0, 1.0);
}

void main() {
  float d0 = dist(vUv);
  float c0 = coc(d0);
  vec4 acc = texture(uColor, vUv);
  float wsum = 1.0;
  for (int i = 1; i < 40; i++) {
    float fi = float(i);
    float r = sqrt(fi / 40.0);
    float a = fi * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uMaxR * uTexel;
    float d = dist(uv);
    float c = coc(d);
    if (d > d0 + 0.5) c = min(c, c0);
    float w = smoothstep(r - 0.08, r, c);
    acc += texture(uColor, uv) * w;
    wsum += w;
  }
  outColor = acc / wsum;
}
`;

interface MeshBuffers {
  vao: WebGLVertexArrayObject;
  count: number;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Never narrower than the horizontal view of a 16:9 frame: the meshes are
 * wide, so in square and upright frames the camera widens to keep them whole.
 */
function perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = (1 / Math.tan(fovRad / 2)) * Math.min(1, aspect / (16 / 9));
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function eulerMatrix(rx: number, ry: number, rz: number, tx = 0, ty = 0, tz = 0): Float32Array {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  const r00 = cz * cy;
  const r01 = cz * sy * sx - sz * cx;
  const r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy;
  const r11 = sz * sy * sx + cz * cx;
  const r12 = sz * sy * cx - cz * sx;
  const r20 = -sy;
  const r21 = cy * sx;
  const r22 = cy * cx;

  return new Float32Array([
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    tx, ty, tz, 1,
  ]);
}

/**
 * A torus knot (as three.js builds it) whose tube is a prism with `faces`
 * flat sides. Each side has its own vertices, so it gets a flat normal and
 * v runs 0..1 across it: the whole text height fits on every face. u runs
 * 0..1 along the knot; `length` is the knot's length, for texture repeats.
 */
function buildKnot(
  radius = 6,
  tube = 2,
  tubular = 720,
  faces = 3,
  p = 2,
  q = 3,
): { positions: Float32Array; uvs: Float32Array; normals: Float32Array; indices: Uint32Array; length: number } {
  const curve = (u: number): [number, number, number] => {
    const qu = (q / p) * u;
    const cs = Math.cos(qu);
    return [radius * (2 + cs) * 0.5 * Math.cos(u), radius * (2 + cs) * 0.5 * Math.sin(u), radius * Math.sin(qu) * 0.5];
  };
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // Frames along the curve: centre, normal, binormal.
  const frames: { c: number[]; n: number[]; b: number[] }[] = [];
  let length = 0;
  for (let i = 0; i <= tubular; i++) {
    const u = (i / tubular) * p * Math.PI * 2;
    const p1 = curve(u);
    const p2 = curve(u + 0.01);
    const T = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const B = norm(cross(T, [p2[0] + p1[0], p2[1] + p1[1], p2[2] + p1[2]]));
    const N = norm(cross(B, T));
    if (i) length += Math.hypot(...p1.map((v, k) => v - frames[i - 1].c[k]));
    frames.push({ c: p1, n: N, b: B });
  }

  const perFace = (tubular + 1) * 2;
  const positions = new Float32Array(faces * perFace * 3);
  const uvs = new Float32Array(faces * perFace * 2);
  const normals = new Float32Array(faces * perFace * 3);
  const indices = new Uint32Array(faces * tubular * 6);
  let vp = 0;
  let up = 0;
  let ip = 0;
  for (let f = 0; f < faces; f++) {
    const v0 = (f / faces) * Math.PI * 2;
    const v1 = ((f + 1) / faces) * Math.PI * 2;
    const vm = (v0 + v1) / 2;
    const base = f * perFace;
    for (let i = 0; i <= tubular; i++) {
      const { c, n, b } = frames[i];
      for (const [v, edge] of [
        [v0, 0],
        [v1, 1],
      ]) {
        const cx = -tube * Math.cos(v);
        const cy = tube * Math.sin(v);
        for (let k = 0; k < 3; k++) {
          positions[vp + k] = c[k] + cx * n[k] + cy * b[k];
          normals[vp + k] = -Math.cos(vm) * n[k] + Math.sin(vm) * b[k];
        }
        vp += 3;
        uvs[up++] = i / tubular;
        uvs[up++] = edge;
      }
      if (i < tubular) {
        const a = base + i * 2;
        indices[ip++] = a;
        indices[ip++] = a + 1;
        indices[ip++] = a + 2;
        indices[ip++] = a + 1;
        indices[ip++] = a + 3;
        indices[ip++] = a + 2;
      }
    }
  }
  return { positions, uvs, normals, indices, length };
}

const KNOT_TEX_W = 2048;
const KNOT_TEX_H = 256;
const KNOT_TUBE = 2;
const KNOT_FACES = 3;
const NEAR = 0.5;
const FAR = 100;

const DOF_UNIFORMS = ["uColor", "uDepth", "uTexel", "uNear", "uFar", "uFocus", "uRange", "uMaxR"] as const;

/** Multisampled target for the knot, resolved into textures the DoF pass reads. */
interface DofTargets {
  w: number;
  h: number;
  msaa: WebGLFramebuffer;
  resolve: WebGLFramebuffer;
  color: WebGLTexture;
  depth: WebGLTexture;
  buffers: WebGLRenderbuffer[];
}

const UNIFORMS = ["uProj", "uView", "uModel", "uTex", "uDepthRange", "uFace", "uRepeat", "uScroll"] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

/** Scales the rotation part of a column-major model matrix in place. */
function scaleModel(m: Float32Array, s: number): Float32Array {
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) m[i] *= s;
  return m;
}

export class Kinetic3DStage {
  private glCanvas = new OffscreenCanvas(16, 16);
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private u: Uniforms | null = null;
  private dofProg: WebGLProgram | null = null;
  private dofU: Record<(typeof DOF_UNIFORMS)[number], WebGLUniformLocation | null> | null = null;
  private postVao: WebGLVertexArrayObject | null = null;
  private dof: DofTargets | null = null;
  private knotTex: WebGLTexture | null = null;
  private knotMesh: MeshBuffers | null = null;
  /** Copies of the knot texture along the knot, so the type keeps its aspect. */
  private knotRepeat = 1;
  private knotCanvas = new OffscreenCanvas(KNOT_TEX_W, KNOT_TEX_H);
  private lastKnotKey = "";

  constructor() {
    this.initGl();
  }

  private initGl() {
    const gl = this.glCanvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true, depth: true });
    if (!gl) return;
    this.gl = gl;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[harfiyen] kinetic3d shader", gl.getShaderInfoLog(s));
      return s;
    };
    const link = (vs: string, fs: string) => {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.warn("[harfiyen] kinetic3d link", gl.getProgramInfoLog(prog));
      return prog;
    };
    const prog = link(VERT, FRAG);
    this.prog = prog;
    this.u = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])) as Uniforms;
    const dofProg = link(POST_VERT, DOF_FRAG);
    this.dofProg = dofProg;
    this.dofU = Object.fromEntries(DOF_UNIFORMS.map((n) => [n, gl.getUniformLocation(dofProg, n)])) as typeof this.dofU;
    this.postVao = gl.createVertexArray();

    const makeMesh = (data: {
      positions: Float32Array;
      uvs: Float32Array;
      normals: Float32Array;
      indices: Uint32Array;
    }): MeshBuffers => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const attrib = (loc: number, size: number, arr: Float32Array) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      attrib(0, 3, data.positions);
      attrib(1, 2, data.uvs);
      attrib(2, 3, data.normals);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, count: data.indices.length };
    };

    const knot = buildKnot(6, KNOT_TUBE, 720, KNOT_FACES);
    this.knotMesh = makeMesh(knot);
    const faceW = 2 * KNOT_TUBE * Math.sin(Math.PI / KNOT_FACES);
    this.knotRepeat = Math.max(1, Math.round(knot.length / (faceW * (KNOT_TEX_W / KNOT_TEX_H))));

    // The knot's text repeats along the tube.
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const ext = gl.getExtension("EXT_texture_filter_anisotropic");
    if (ext) {
      const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    this.knotTex = tex;
    // Transparent text texture: premultiplied, so mipmaps do not darken the edges.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  /** (Re)creates the knot's MSAA target and the textures it resolves into, at W×H. */
  private dofTargets(W: number, H: number): DofTargets {
    const gl = this.gl!;
    if (this.dof && this.dof.w === W && this.dof.h === H) return this.dof;
    if (this.dof) {
      gl.deleteFramebuffer(this.dof.msaa);
      gl.deleteFramebuffer(this.dof.resolve);
      gl.deleteTexture(this.dof.color);
      gl.deleteTexture(this.dof.depth);
      for (const b of this.dof.buffers) gl.deleteRenderbuffer(b);
    }
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    const msaa = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
    const buffers = [
      [gl.RGBA8, gl.COLOR_ATTACHMENT0],
      [gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT],
    ].map(([format, attachment]) => {
      const rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, rb);
      return rb;
    });

    const target = (internal: number, format: number, type: number, filter: number) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, W, H, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const color = target(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    // Depth textures cannot be filtered.
    const depth = target(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    const resolve = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, resolve);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (this.dof = { w: W, h: H, msaa, resolve, color, depth, buffers });
  }

  private upload(tex: WebGLTexture, source: OffscreenCanvas) {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** One copy of the knot's band: the spoken line, said words lit, the current one in the accent. */
  private updateKnotTexture(cue: Cue, active: number, fontId: FontId, pal: KineticPalette, lang: string, loud: Set<Word>) {
    const key = `${active}|${fontId}|${pal.id}|${lang}|${cue.start}|${cue.words.map((w) => w.text).join(" ")}`;
    if (key === this.lastKnotKey) return;
    this.lastKnotKey = key;

    const W = KNOT_TEX_W;
    const H = KNOT_TEX_H;
    const ctx = this.knotCanvas.getContext("2d")!;
    const font = fontById(fontId);
    ctx.clearRect(0, 0, W, H);

    const texts = cue.words.map((w) => (hasDottedI(lang) ? w.text.toLocaleUpperCase(lang) : w.text.toUpperCase()));
    const css = (px: number) => `${font.weight} ${px}px ${captionStack(font.id)}`;
    let px = Math.round(H * 0.6);
    ctx.font = css(px);
    const gapOf = (p: number) => p * 0.32;
    const natW = texts.reduce((a, t) => a + ctx.measureText(t).width, 0) + gapOf(px) * Math.max(0, texts.length - 1);
    // Leave a gap of one word space at the seam between copies.
    const room = W - gapOf(px) * 2;
    if (natW > room) {
      px = Math.max(24, Math.floor((px * room) / natW));
      ctx.font = css(px);
    }
    const widths = texts.map((t) => ctx.measureText(t).width);
    const gap = gapOf(px);
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, texts.length - 1);
    const capH = ctx.measureText("H").actualBoundingBoxAscent || px * 0.72;
    const asc = Math.max(capH, ctx.measureText("İÖÜĞ").actualBoundingBoxAscent || capH);
    const desc = Math.max(0, ctx.measureText("ÇŞ").actualBoundingBoxDescent || 0);
    const ty = H / 2 + (asc - desc) / 2;

    ctx.textBaseline = "alphabetic";
    let x = (W - totalW) / 2;
    texts.forEach((txt, wi) => {
      ctx.globalAlpha = wi > active ? 0.32 : 1;
      ctx.fillStyle = wi === active || loud.has(cue.words[wi]) ? pal.accent : pal.text;
      ctx.fillText(txt, x, ty);
      x += widths[wi] + gap;
    });
    ctx.globalAlpha = 1;
    // A dot marks the seam between copies.
    ctx.fillStyle = pal.accent;
    for (const dx of [0, W]) {
      ctx.beginPath();
      ctx.arc(dx, H / 2, px * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.knotTex) this.upload(this.knotTex, this.knotCanvas);
  }

  render(
    targetCtx: OffscreenCanvasRenderingContext2D,
    W: number,
    H: number,
    cue: Cue,
    activeWordInCue: number,
    t: number,
    energy: number,
    punch: number,
    fontId: FontId,
    pal: KineticPalette,
    lang: string,
    loud: Set<Word>,
  ) {
    const { gl, prog, u } = this;
    if (!gl || !prog || !u || !this.knotMesh) return;

    if (this.glCanvas.width !== W) this.glCanvas.width = W;
    if (this.glCanvas.height !== H) this.glCanvas.height = H;

    // The knot goes into a multisampled target first, for the DoF pass.
    const dof = this.dofTargets(W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dof.msaa);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.uTex, 0);
    this.updateKnotTexture(cue, activeWordInCue, fontId, pal, lang, loud);
    gl.bindTexture(gl.TEXTURE_2D, this.knotTex);

    const tz = -27;
    gl.uniformMatrix4fv(u.uProj, false, perspective((40 * Math.PI) / 180, W / H, NEAR, FAR));
    gl.uniformMatrix4fv(u.uView, false, eulerMatrix(0, 0, 0, 0, 0, tz));
    // The knot turns slowly on its own; the voice swells it a little.
    const model = eulerMatrix(0.5 + 0.25 * Math.sin(t * 0.11), t * 0.12, 0.15 * Math.sin(t * 0.07));
    gl.uniformMatrix4fv(u.uModel, false, scaleModel(model, 1 + 0.03 * energy + 0.05 * punch));
    gl.uniform3f(u.uFace, ...hexRgb(pal.bgGlow));
    gl.uniform1f(u.uRepeat, this.knotRepeat);
    gl.uniform1f(u.uScroll, t * 0.15);
    gl.uniform2f(u.uDepthRange, tz - 11, tz + 3);

    gl.bindVertexArray(this.knotMesh.vao);
    gl.drawElements(gl.TRIANGLES, this.knotMesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    // Resolve colour and depth, then blur by depth into the canvas.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, dof.msaa);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dof.resolve);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const du = this.dofU!;
    gl.useProgram(this.dofProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dof.color);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dof.depth);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(du.uColor, 0);
    gl.uniform1i(du.uDepth, 1);
    gl.uniform2f(du.uTexel, 1 / W, 1 / H);
    gl.uniform1f(du.uNear, NEAR);
    gl.uniform1f(du.uFar, FAR);
    // Rack focus: the sharp plane drifts slowly along the knot; a punch pulls it forward.
    gl.uniform1f(du.uFocus, -tz + 6 * Math.sin(t * 0.23) - 4 * punch);
    gl.uniform1f(du.uRange, 6);
    gl.uniform1f(du.uMaxR, Math.min(W, H) * 0.022);
    gl.bindVertexArray(this.postVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    targetCtx.drawImage(this.glCanvas, 0, 0, W, H);
  }
}
