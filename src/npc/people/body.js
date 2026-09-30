// Procedural low-poly people rendered as instanced geometry posed on the GPU.
//   buildBodyGeometry(q) -> THREE.InstancedBufferGeometry   q: 2 near (tapered limbs, face, all clothing parts),
//     1 mid (box limbs), 0 far (legs, torso, arms, head only). Vertices carry aBone (limb segment), aSlot (colour
//     slot, looks.js SLOT) and aFeat (0 = always, k = shown only when look mask bit k-1 is set).
//   createCrowdMaterials() -> { mat, depth, uniforms }   one shader for every LOD; uniforms.uTime.value = seconds
//   createCrowdLayer(q, cap, mats) -> { mesh, begin(), push(p) -> bool, end() }   one draw call per layer
//     p: { x, y, z, ry, phase, clipA, clipB, blend, headYaw, look: { sH, girth, mask, cols }, seed }
//   CLIP: animation ids (idle, walk, run, talk, phone, point, wave, cheer, cower, flee, talk2)
//   patchInstanced(material, { head, main, frag }) -> material   shared onBeforeCompile helper (birds.js uses it)
// Per instance: iA (x, y, z, yaw), iB (walk cycles, clipA + 16 clipB, blend, head yaw), iC (height scale, girth,
// seed, mask), iD / iE (packed 24-bit sRGB colours of the 8 slots). The vertex shader evaluates both clips, blends
// them, derives the pelvis drop from the leg angles (the lower foot stays on the ground) and walks the limb chain.
import * as THREE from 'three';
import { FEAT, SLOT } from './looks.js';

export const CLIP = { idle: 0, walk: 1, run: 2, talk: 3, phone: 4, point: 5, wave: 6, cheer: 7, cower: 8, flee: 9, talk2: 10 };
export const BONE = { PELVIS: 0, SPINE: 1, HEAD: 2, UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6, THIGH_L: 7, SHIN_L: 8, THIGH_R: 9, SHIN_R: 10, FOOT_L: 11, FOOT_R: 12 };

// ------------------------------------------------------------------ geometry
export class Geo {
  constructor() { this.buf = { position: [], normal: [], aBone: [], aSlot: [], aFeat: [] }; this.bone = 0; this.slot = 0; this.feat = 0; }
  set(bone, slot, feat = 0) { this.bone = bone; this.slot = slot; this.feat = feat; return this; }
  // triangle wound so its normal points away from ctr
  tri(a, b, c, ctr) {
    let nrm = cross3(sub3(b, a), sub3(c, a));
    const len = Math.hypot(...nrm); if (len < 1e-12) return;
    nrm = nrm.map(q => q / len);
    const out = sub3([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], ctr);
    if (nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2] < 0) { [b, c] = [c, b]; nrm = nrm.map(q => -q); }
    const f = this.buf;
    for (const v of [a, b, c]) { f.position.push(...v); f.normal.push(...nrm); f.aBone.push(this.bone); f.aSlot.push(this.slot); f.aFeat.push(this.feat); }
  }
  quad(a, b, c, d, ctr) { this.tri(a, b, c, ctr); this.tri(a, c, d, ctr); }
  // rings [{ y, rx, rz, cx, cz }] stacked along y; caps: 'top' | 'bot' | 'both'; warp(v, cosA, ringIndex) edits a vertex
  loft(R, sides, caps = 'both', warp = null) {
    const off = sides === 4 ? Math.PI / 4 : Math.PI / sides, k4 = sides === 4 ? Math.SQRT2 : 1;
    const V = R.map((r, i) => {
      const out = [];
      for (let s = 0; s < sides; s++) {
        const a = off + s * 2 * Math.PI / sides;
        const v = [(r.cx || 0) + r.rx * k4 * Math.sin(a), r.y, (r.cz || 0) + r.rz * k4 * Math.cos(a)];
        if (warp) warp(v, Math.cos(a), i);
        out.push(v);
      }
      return out;
    });
    for (let i = 0; i + 1 < R.length; i++) {
      const ctr = [((R[i].cx || 0) + (R[i + 1].cx || 0)) / 2, (R[i].y + R[i + 1].y) / 2, ((R[i].cz || 0) + (R[i + 1].cz || 0)) / 2];
      for (let s = 0; s < sides; s++) {
        const t = (s + 1) % sides, a = V[i][s], b = V[i][t], c = V[i + 1][t], d = V[i + 1][s];
        const cc = [ctr[0], (a[1] + b[1] + c[1] + d[1]) / 4, ctr[2]];
        this.quad(a, b, c, d, cc);
      }
    }
    const cap = (i, dir) => {
      const r = R[i], ring = V[i];
      const mid = [ring.reduce((s, v) => s + v[0], 0) / sides, ring.reduce((s, v) => s + v[1], 0) / sides, ring.reduce((s, v) => s + v[2], 0) / sides];
      const tip = r.tip !== undefined ? [mid[0], r.tip, mid[2]] : mid;
      const ctr = [mid[0], tip[1] - dir * 0.05, mid[2]];
      for (let s = 0; s < sides; s++) this.tri(ring[s], ring[(s + 1) % sides], tip, ctr);
    };
    if (caps === 'bot' || caps === 'both') cap(0, -1);
    if (caps === 'top' || caps === 'both') cap(R.length - 1, 1);
    return this;
  }
  box(x0, y0, z0, x1, y1, z1, bottom = true) {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const v = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
    const F = [[0, 2, 6, 4], [1, 3, 7, 5], [2, 3, 7, 6], [0, 1, 5, 4], [0, 1, 3, 2], [4, 5, 7, 6]];
    for (let f = 0; f < 6; f++) { if (!bottom && f === 3) continue; const [a, b, cc, d] = F[f].map(v); this.quad(a, b, cc, d, c); }
    return this;
  }
  mirrorX(fn) { fn(1); fn(-1); return this; }
  geometry() {
    const g = new THREE.InstancedBufferGeometry();
    for (const [name, list] of Object.entries(this.buf)) g.setAttribute(name, new THREE.Float32BufferAttribute(list, name === 'position' || name === 'normal' ? 3 : 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7); // culled on the CPU per instance
    return g;
  }
}

const fb = (bit) => bit + 1; // aFeat code of a look bit
const sub3 = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross3 = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const raiseFront = (h) => (v, ca, i) => { if (i === 0 && ca > 0) v[1] += h * ca * ca; };

function near(G) {
  const S = 8;
  // legs
  G.mirrorX((sd) => {
    const cx = 0.095 * sd;
    G.set(sd > 0 ? BONE.THIGH_L : BONE.THIGH_R, SLOT.LEGWEAR).loft([{ y: 0.97, rx: 0.08, rz: 0.086, cx }, { y: 0.74, rx: 0.07, rz: 0.075, cx }, { y: 0.51, rx: 0.056, rz: 0.06, cx }], S, 'none');
    G.set(sd > 0 ? BONE.SHIN_L : BONE.SHIN_R, SLOT.SHIN).loft([{ y: 0.53, rx: 0.056, rz: 0.062, cx }, { y: 0.37, rx: 0.052, rz: 0.06, cx, cz: -0.008 }, { y: 0.1, rx: 0.037, rz: 0.042, cx }], S, 'none');
    G.set(sd > 0 ? BONE.FOOT_L : BONE.FOOT_R, SLOT.SHOES).box(cx - 0.045, 0, -0.06, cx + 0.045, 0.095, 0.1, false).box(cx - 0.042, 0, 0.1, cx + 0.042, 0.062, 0.168, false);
  });
  // pelvis, torso, neck
  G.set(BONE.PELVIS, SLOT.BOTTOM).loft([{ y: 0.84, rx: 0.14, rz: 0.095 }, { y: 0.93, rx: 0.155, rz: 0.1 }, { y: 1.03, rx: 0.148, rz: 0.098 }], S, 'bot');
  G.set(BONE.SPINE, SLOT.TOP).loft([{ y: 1.0, rx: 0.148, rz: 0.098 }, { y: 1.13, rx: 0.145, rz: 0.1 }, { y: 1.26, rx: 0.165, rz: 0.108 }, { y: 1.37, rx: 0.183, rz: 0.106 }, { y: 1.44, rx: 0.17, rz: 0.095 }, { y: 1.475, rx: 0.09, rz: 0.068 }], S, 'top');
  G.set(BONE.HEAD, SLOT.SKIN).loft([{ y: 1.44, rx: 0.05, rz: 0.05 }, { y: 1.545, rx: 0.047, rz: 0.048 }], 6, 'none');
  // head (+z is the face)
  G.set(BONE.HEAD, SLOT.SKIN).loft([{ y: 1.515, rx: 0.045, rz: 0.05, cz: 0.02 }, { y: 1.55, rx: 0.066, rz: 0.078, cz: 0.015 }, { y: 1.6, rx: 0.08, rz: 0.094, cz: 0.005 }, { y: 1.66, rx: 0.086, rz: 0.1 }, { y: 1.715, rx: 0.078, rz: 0.092 }, { y: 1.75, rx: 0.05, rz: 0.06, cz: -0.005, tip: 1.762 }], S);
  G.box(-0.012, 1.605, 0.088, 0.012, 1.645, 0.114);
  G.set(BONE.HEAD, SLOT.DARK).mirrorX((sd) => G.box(sd * 0.022, 1.652, 0.084, sd * 0.042, 1.665, 0.097));
  // arms
  G.mirrorX((sd) => {
    const L = sd > 0;
    G.set(L ? BONE.UARM_L : BONE.UARM_R, SLOT.TOP).loft([{ y: 1.16, rx: 0.042, rz: 0.044, cx: 0.203 * sd }, { y: 1.3, rx: 0.047, rz: 0.05, cx: 0.197 * sd }, { y: 1.45, rx: 0.052, rz: 0.055, cx: 0.19 * sd, tip: 1.49 }], 6, 'top');
    G.set(L ? BONE.FARM_L : BONE.FARM_R, SLOT.FOREARM).loft([{ y: 0.9, rx: 0.03, rz: 0.032, cx: 0.21 * sd }, { y: 1.03, rx: 0.036, rz: 0.038, cx: 0.208 * sd }, { y: 1.175, rx: 0.042, rz: 0.044, cx: 0.203 * sd }], 6, 'none');
    G.set(L ? BONE.FARM_L : BONE.FARM_R, SLOT.SKIN).loft([{ y: 0.8, rx: 0.016, rz: 0.026, cx: 0.212 * sd, tip: 0.785 }, { y: 0.85, rx: 0.022, rz: 0.04, cx: 0.212 * sd }, { y: 0.915, rx: 0.026, rz: 0.036, cx: 0.21 * sd }], 6);
  });
  // clothing and hair (hidden unless the look has the bit)
  G.set(BONE.HEAD, SLOT.HAIR, fb(FEAT.HAIR)).loft([{ y: 1.625, rx: 0.092, rz: 0.106, cz: -0.004 }, { y: 1.7, rx: 0.089, rz: 0.102 }, { y: 1.752, rx: 0.061, rz: 0.071, cz: -0.008, tip: 1.777 }], S, 'top', raiseFront(0.062));
  G.set(BONE.HEAD, SLOT.HAIR, fb(FEAT.LONG)).box(-0.085, 1.4, -0.112, 0.085, 1.7, -0.05).mirrorX((sd) => G.box(sd * 0.074, 1.47, -0.07, sd * 0.096, 1.66, 0.03));
  G.set(BONE.HEAD, SLOT.HAIR, fb(FEAT.BUN)).loft([{ y: 1.69, rx: 0.03, rz: 0.03, cz: -0.1 }, { y: 1.735, rx: 0.048, rz: 0.045, cz: -0.105 }, { y: 1.78, rx: 0.03, rz: 0.03, cz: -0.1, tip: 1.79 }], 6);
  G.set(BONE.HEAD, SLOT.HAT, fb(FEAT.BEANIE)).loft([{ y: 1.645, rx: 0.096, rz: 0.111, cz: -0.004 }, { y: 1.73, rx: 0.092, rz: 0.105 }, { y: 1.79, rx: 0.057, rz: 0.066, tip: 1.81 }], S, 'top', raiseFront(0.035));
  G.set(BONE.HEAD, SLOT.HAT, fb(FEAT.CAP)).loft([{ y: 1.69, rx: 0.093, rz: 0.107 }, { y: 1.745, rx: 0.081, rz: 0.093 }, { y: 1.772, rx: 0.05, rz: 0.058, tip: 1.782 }], S, 'top').box(-0.075, 1.688, 0.08, 0.075, 1.703, 0.19);
  G.set(BONE.HEAD, SLOT.HAT, fb(FEAT.SCARF)).loft([{ y: 1.54, rx: 0.093, rz: 0.1, cz: -0.018 }, { y: 1.63, rx: 0.097, rz: 0.108, cz: -0.006 }, { y: 1.71, rx: 0.091, rz: 0.103 }, { y: 1.76, rx: 0.062, rz: 0.07, tip: 1.787 }], S, 'top',
    (v, ca, i) => { if (i < 2 && ca > 0.2) { v[1] = 1.69 + i * 0.01; v[2] -= 0.02; } }).box(-0.05, 1.46, -0.105, 0.05, 1.56, -0.075);
  G.set(BONE.HEAD, SLOT.HAIR, fb(FEAT.BEARD)).loft([{ y: 1.505, rx: 0.05, rz: 0.04, cz: 0.05 }, { y: 1.555, rx: 0.07, rz: 0.06, cz: 0.04 }, { y: 1.595, rx: 0.08, rz: 0.075, cz: 0.02 }], 6, 'bot', (v) => { if (v[2] < 0) v[2] = 0; });
  G.set(BONE.HEAD, SLOT.DARK, fb(FEAT.GLASSES)).box(-0.07, 1.652, 0.093, 0.07, 1.667, 0.102);
  G.set(BONE.PELVIS, SLOT.TOP, fb(FEAT.COAT)).loft([{ y: 0.55, rx: 0.205, rz: 0.15 }, { y: 0.85, rx: 0.175, rz: 0.125 }, { y: 1.05, rx: 0.158, rz: 0.108 }], S, 'none');
  G.set(BONE.PELVIS, SLOT.BOTTOM, fb(FEAT.SKIRT)).loft([{ y: 0.6, rx: 0.2, rz: 0.15 }, { y: 1.0, rx: 0.152, rz: 0.102 }], S, 'none');
  G.set(BONE.SPINE, SLOT.BAG, fb(FEAT.BAG)).box(0.165, 0.86, -0.08, 0.235, 1.08, 0.12).box(0.14, 1.08, 0.085, 0.165, 1.46, 0.105).box(0.14, 1.08, -0.1, 0.165, 1.46, -0.08);
  G.set(BONE.SPINE, SLOT.BAG, fb(FEAT.BACKPACK)).box(-0.13, 1.05, -0.235, 0.13, 1.42, -0.09).mirrorX((sd) => G.box(sd * 0.075, 1.18, 0.1, sd * 0.1, 1.45, 0.118));
}

function mid(G) {
  G.mirrorX((sd) => {
    const cx = 0.095 * sd;
    G.set(sd > 0 ? BONE.THIGH_L : BONE.THIGH_R, SLOT.LEGWEAR).loft([{ y: 0.51, rx: 0.062, rz: 0.066, cx }, { y: 0.97, rx: 0.078, rz: 0.083, cx }], 4, 'none');
    G.set(sd > 0 ? BONE.SHIN_L : BONE.SHIN_R, SLOT.SHIN).loft([{ y: 0.1, rx: 0.042, rz: 0.048, cx }, { y: 0.53, rx: 0.055, rz: 0.06, cx }], 4, 'none');
    G.set(sd > 0 ? BONE.FOOT_L : BONE.FOOT_R, SLOT.SHOES).box(cx - 0.045, 0, -0.06, cx + 0.045, 0.09, 0.16, false);
    const L = sd > 0;
    G.set(L ? BONE.UARM_L : BONE.UARM_R, SLOT.TOP).loft([{ y: 1.16, rx: 0.044, rz: 0.046, cx: 0.203 * sd }, { y: 1.46, rx: 0.052, rz: 0.055, cx: 0.19 * sd }], 4);
    G.set(L ? BONE.FARM_L : BONE.FARM_R, SLOT.FOREARM).loft([{ y: 0.9, rx: 0.032, rz: 0.034, cx: 0.21 * sd }, { y: 1.175, rx: 0.042, rz: 0.044, cx: 0.203 * sd }], 4, 'none');
    G.set(L ? BONE.FARM_L : BONE.FARM_R, SLOT.SKIN).box(0.19 * sd, 0.8, -0.03, 0.232 * sd, 0.905, 0.035);
  });
  G.set(BONE.PELVIS, SLOT.BOTTOM).loft([{ y: 0.84, rx: 0.142, rz: 0.096 }, { y: 1.03, rx: 0.15, rz: 0.098 }], 4, 'bot');
  G.set(BONE.SPINE, SLOT.TOP).loft([{ y: 1.0, rx: 0.148, rz: 0.098 }, { y: 1.3, rx: 0.172, rz: 0.106 }, { y: 1.46, rx: 0.165, rz: 0.095, tip: 1.49 }], 4, 'top');
  G.set(BONE.HEAD, SLOT.SKIN).loft([{ y: 1.46, rx: 0.045, rz: 0.045 }, { y: 1.53, rx: 0.06, rz: 0.07, cz: 0.012 }, { y: 1.65, rx: 0.084, rz: 0.098 }], 4, 'bot');
  G.set(BONE.HEAD, SLOT.HEADTOP).loft([{ y: 1.64, rx: 0.088, rz: 0.102 }, { y: 1.77, rx: 0.06, rz: 0.07, tip: 1.78 }], 4, 'both', (v, ca, i) => { if (i === 0 && ca > 0) v[1] += 0.03; });
  G.set(BONE.HEAD, SLOT.HAIR, fb(FEAT.LONG)).box(-0.08, 1.42, -0.11, 0.08, 1.68, -0.05);
  G.set(BONE.PELVIS, SLOT.TOP, fb(FEAT.COAT)).loft([{ y: 0.55, rx: 0.2, rz: 0.145 }, { y: 1.05, rx: 0.158, rz: 0.108 }], 4, 'none');
  G.set(BONE.PELVIS, SLOT.BOTTOM, fb(FEAT.SKIRT)).loft([{ y: 0.6, rx: 0.195, rz: 0.145 }, { y: 1.0, rx: 0.152, rz: 0.102 }], 4, 'none');
  G.set(BONE.SPINE, SLOT.BAG, fb(FEAT.BAG)).box(0.165, 0.86, -0.08, 0.235, 1.08, 0.12);
  G.set(BONE.SPINE, SLOT.BAG, fb(FEAT.BACKPACK)).box(-0.13, 1.05, -0.235, 0.13, 1.42, -0.09);
}

function far(G) {
  G.mirrorX((sd) => {
    const cx = 0.095 * sd;
    G.set(sd > 0 ? BONE.THIGH_L : BONE.THIGH_R, SLOT.LEGWEAR).box(cx - 0.065, 0, -0.06, cx + 0.065, 0.95, 0.07, false);
    G.set(sd > 0 ? BONE.UARM_L : BONE.UARM_R, SLOT.TOP).box(sd * 0.165, 0.84, -0.04, sd * 0.235, 1.46, 0.04, false);
  });
  G.set(BONE.SPINE, SLOT.TOP).box(-0.16, 0.95, -0.1, 0.16, 1.47, 0.1);
  G.set(BONE.HEAD, SLOT.SKIN).box(-0.075, 1.47, -0.08, 0.075, 1.66, 0.09, false);
  G.set(BONE.HEAD, SLOT.HEADTOP).box(-0.085, 1.66, -0.095, 0.085, 1.77, 0.095, false);
  G.set(BONE.PELVIS, SLOT.TOP, fb(FEAT.COAT)).box(-0.19, 0.55, -0.13, 0.19, 1.0, 0.13, false);
  G.set(BONE.PELVIS, SLOT.BOTTOM, fb(FEAT.SKIRT)).box(-0.18, 0.6, -0.12, 0.18, 1.0, 0.12, false);
}

export function buildBodyGeometry(q) {
  const G = new Geo();
  (q === 2 ? near : q === 1 ? mid : far)(G);
  return G.geometry();
}

// ------------------------------------------------------------------ shader
const HEAD = /* glsl */`
attribute float aBone; attribute float aSlot; attribute float aFeat;
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD; attribute vec4 iE;
uniform float uTime;
varying vec3 vPplCol;
vec3 pplP; vec3 pplN;
struct Pose { float twist, bob, spP, spY, spR, hdP, hdY, shLP, shLR, shRP, shRR, elL, elR, hpL, hpR, knL, knR, ftL, ftR; };
float pplBit(float m, float b) { return mod(floor(m / exp2(b)), 2.0); }
vec3 pplRGB(float v) { return pow(vec3(floor(v / 65536.0), mod(floor(v / 256.0), 256.0), mod(v, 256.0)) / 255.0, vec3(2.2)); }
void rX(inout vec3 p, inout vec3 n, vec3 o, float a) { float c = cos(a), s = sin(a); vec3 q = p - o; p = o + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c); n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c); }
void rY(inout vec3 p, inout vec3 n, vec3 o, float a) { float c = cos(a), s = sin(a); vec3 q = p - o; p = o + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c); n = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c); }
void rZ(inout vec3 p, inout vec3 n, vec3 o, float a) { float c = cos(a), s = sin(a); vec3 q = p - o; p = o + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z); n = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z); }
Pose poseRest() { return Pose(0., 0., 0., 0., 0., 0., 0., 0., 0.07, 0., 0.07, 0.14, 0.14, 0., 0., 0.04, 0.04, 0., 0.); }
#define PM(f) r.f = mix(a.f, b.f, t)
Pose poseMix(Pose a, Pose b, float t) {
  Pose r = a;
  PM(twist); PM(bob); PM(spP); PM(spY); PM(spR); PM(hdP); PM(hdY); PM(shLP); PM(shLR); PM(shRP); PM(shRR);
  PM(elL); PM(elR); PM(hpL); PM(hpR); PM(knL); PM(knR); PM(ftL); PM(ftR);
  return r;
}
// angles in radians; + limb pitch swings forward, + knee flex bends the shin back, + abduction swings a hanging arm
// outward (a raised arm then leans in over the head, so arms-up clips use negative abduction for a V)
Pose clipPose(float c, float ph, float sd) {
  Pose p = poseRest();
  float t = uTime + sd * 97.0, w = ph * 6.2831853, s = sin(w), co = cos(w);
  float look = sin(t * 0.29) * 0.5 + sin(t * 0.71 + 2.0) * 0.2, sway = sin(t * 0.23);
  bool loco = c > 0.5 && c < 2.5 || c > 8.5 && c < 9.5;
  if (!loco) { // standing: breathing, weight shifting, looking around
    p.spP = 0.015 * sin(t * 1.6); p.hdY = look; p.hdP = 0.04 * sin(t * 0.37);
    p.twist = 0.04 * sway; p.spR = 0.025 * sway;
    p.hpL = 0.03 + 0.03 * sway; p.hpR = -0.02 + 0.03 * sway;
    p.knL = 0.05 + 0.06 * max(0., sway); p.knR = 0.05 + 0.06 * max(0., -sway);
  }
  if (c > 0.5 && c < 1.5) { // walk
    p.hpL = 0.42 * s; p.hpR = -p.hpL;
    p.knL = 0.07 + 0.78 * pow(max(0., co), 1.5); p.knR = 0.07 + 0.78 * pow(max(0., -co), 1.5);
    p.ftL = 0.25 * max(0., co); p.ftR = 0.25 * max(0., -co);
    p.shLP = -0.32 * s; p.shRP = 0.32 * s; p.elL = 0.18 + 0.28 * max(0., -s); p.elR = 0.18 + 0.28 * max(0., s);
    p.twist = -0.07 * s; p.spY = 0.12 * s; p.spP = 0.05; p.hdP = -0.03; p.hdY = look * 0.35;
  } else if (c > 1.5 && c < 2.5 || c > 8.5 && c < 9.5) { // run / flee
    p.hpL = 0.72 * s; p.hpR = -p.hpL;
    p.knL = 0.35 + 1.3 * pow(max(0., co), 1.2); p.knR = 0.35 + 1.3 * pow(max(0., -co), 1.2);
    p.ftL = 0.35 * max(0., co); p.ftR = 0.35 * max(0., -co);
    p.shLP = 0.1 - 0.65 * s; p.shRP = 0.1 + 0.65 * s; p.elL = 1.45; p.elR = 1.45; p.shLR = 0.12; p.shRR = 0.12;
    p.twist = -0.1 * s; p.spY = 0.16 * s; p.spP = 0.2; p.hdP = -0.14; p.bob = 0.03 * abs(co);
    if (c > 8.5) { // flee: arms thrown up, glances back
      p.shLP = 0.9 - 0.5 * s; p.shRP = 0.9 + 0.5 * s; p.shLR = 0.55; p.shRR = 0.55; p.elL = 0.7 + 0.2 * co; p.elR = 0.7 - 0.2 * co;
      p.spP = 0.26; p.hdY = 0.9 * smoothstep(0.55, 0.95, sin(t * 0.8));
    }
  } else if (c > 2.5 && c < 3.5 || c > 9.5) { // talk (talk2: the other hand, livelier)
    float k = c > 9.5 ? 1.4 : 1.0, gate = smoothstep(-0.2, 0.4, sin(t * 0.6 * k)), g1 = sin(t * 2.1 * k), g2 = sin(t * 3.3 * k + 1.0);
    float ap = 0.2 + 0.35 * gate + 0.12 * g1 * gate, ae = 0.45 + 0.9 * gate + 0.3 * g2 * gate;
    if (c > 9.5) { p.shLP = ap; p.elL = ae; p.shLR = 0.14; p.elR = 0.3; } else { p.shRP = ap; p.elR = ae; p.shRR = 0.14; p.elL = 0.3; }
    p.hdP = 0.05 * sin(t * 2.7) * gate; p.hdY = look * 0.3;
  } else if (c > 3.5 && c < 4.5) { // phone, texting
    p.shRP = 0.5; p.shRR = -0.2; p.elR = 1.7; p.shLP = 0.42; p.shLR = -0.18; p.elL = 1.55; p.hdP = 0.42 + 0.03 * sin(t); p.hdY = 0.;
  } else if (c > 4.5 && c < 5.5) { // point
    p.shRP = 1.5 + 0.03 * sin(t * 3.); p.shRR = 0.06; p.elR = 0.05; p.spY = -0.12; p.hdY = 0.; p.hdP = -0.05;
  } else if (c > 5.5 && c < 6.5) { // wave
    p.shRP = 2.75; p.shRR = -0.25 + 0.3 * sin(t * 8.); p.elR = 0.35 + 0.2 * sin(t * 8. + 1.); p.hdY = 0.;
  } else if (c > 6.5 && c < 7.5) { // cheer
    float j = sin(t * 7.);
    p.shLP = 2.8; p.shRP = 2.8; p.shLR = -0.45 - 0.1 * j; p.shRR = -0.45 + 0.1 * j; p.elL = 0.3 + 0.3 * j; p.elR = 0.3 - 0.3 * j; p.bob = 0.06 * max(0., j); p.hdP = -0.15;
  } else if (c > 7.5 && c < 8.5) { // cower: crouched, hands over the head, trembling
    p.hpL = 1.65; p.hpR = 1.65; p.knL = 2.25; p.knR = 2.25; p.spP = 0.7; p.hdP = 0.35; p.spR = 0.02 * sin(t * 23.);
    p.shLP = 2.35; p.shRP = 2.35; p.shLR = 0.35; p.shRR = 0.35; p.elL = 2.1; p.elR = 2.1; p.twist = 0.; p.hdY = 0.;
  }
  return p;
}
void pplRun() {
  vec3 p = position, n = normal;
  float b = aBone, m = iC.w, sd = iC.z, g = iC.y;
  if (aFeat > 0.5 && pplBit(m, aFeat - 1.) < 0.5) { pplP = vec3(0.); pplN = vec3(0., 1., 0.); vPplCol = vec3(0.); return; }
  float sl = aSlot, v = iD.x;
  if (sl > 0.5 && sl < 1.5) v = iD.y; else if (sl > 1.5 && sl < 2.5) v = iD.z; else if (sl > 2.5 && sl < 3.5) v = iD.w;
  else if (sl > 3.5 && sl < 4.5) v = iE.x; else if (sl > 4.5 && sl < 5.5) v = iE.y; else if (sl > 5.5 && sl < 6.5) v = iE.z; else if (sl > 6.5 && sl < 7.5) v = iE.w;
  else if (sl > 8.5 && sl < 9.5) v = pplBit(m, ${FEAT.SHORTSLEEVE}.) > 0.5 ? iD.x : iD.z;
  else if (sl > 9.5 && sl < 10.5) v = pplBit(m, ${FEAT.SHORTS}.) > 0.5 ? iD.x : iE.x;
  else if (sl > 10.5) v = pplBit(m, ${FEAT.BEANIE}.) + pplBit(m, ${FEAT.CAP}.) + pplBit(m, ${FEAT.SCARF}.) > 0.5 ? iE.z : pplBit(m, ${FEAT.HAIR}.) > 0.5 ? iD.y : iD.x;
  vPplCol = sl > 7.5 && sl < 8.5 ? vec3(0.02) : pplRGB(v);
  // body shape: girth, female hips / shoulders, child head
  float fem = pplBit(m, ${FEAT.FEM}.), stoop = floor(m / 32768.0);
  float gL = mix(1., g, 0.55), gxA = g * (1. - 0.07 * fem), gxL = g * (1. + 0.05 * fem);
  bool arm = b > 2.5 && b < 6.5, leg = b > 6.5;
  float side = b == 3. || b == 4. || b == 7. || b == 8. || b == 11. ? 1. : -1.;
  if (b < 1.5) {
    p.x *= g * (1. + fem * (0.07 * (1. - smoothstep(0.95, 1.12, p.y)) - 0.1 * smoothstep(1.18, 1.42, p.y)));
    p.z *= g * (1. + 0.3 * (g - 1.) * smoothstep(0.95, 1.1, p.y) * (1. - smoothstep(1.25, 1.4, p.y)));
  } else if (arm) { p.x = side * 0.185 * gxA + (p.x - side * 0.185) * gL; p.z *= gL; }
  else if (leg) { p.x = side * 0.095 * gxL + (p.x - side * 0.095) * (b < 10.5 ? gL : 1.); if (b < 10.5) p.z *= gL; }
  else { float hk = 1. + max(0., 1. - iC.x) * 0.9; vec3 nk = vec3(0., 1.5, 0.); p = nk + (p - nk) * hk; }
  // pose
  float cA = mod(iB.y, 16.), cB = floor(iB.y / 16.);
  Pose P = clipPose(cA, iB.x, sd);
  if (iB.z > 0.001) P = poseMix(P, clipPose(cB, iB.x, sd), iB.z);
  P.hdY += iB.w; P.spP += 0.12 * stoop; P.hdP -= 0.07 * stoop; P.knL += 0.05 * stoop; P.knR += 0.05 * stoop;
  if (arm) {
    float ax = side * 0.185 * gxA;
    vec3 sh = vec3(ax, 1.43, 0.), el = vec3(ax + side * 0.018 * gL, 1.165, 0.);
    if (b == 4. || b == 6.) rX(p, n, el, -(side > 0. ? P.elL : P.elR));
    rX(p, n, sh, -(side > 0. ? P.shLP : P.shRP));
    rZ(p, n, sh, side * (side > 0. ? P.shLR : P.shRR));
  }
  if (b > 1.5 && b < 2.5) { vec3 nk = vec3(0., 1.5, 0.); rX(p, n, nk, P.hdP); rY(p, n, nk, P.hdY); }
  if (b > 0.5 && b < 6.5) { vec3 ws = vec3(0., 1.0, 0.); rZ(p, n, ws, P.spR); rX(p, n, ws, P.spP); rY(p, n, ws, P.spY); }
  float h = side > 0. ? P.hpL : P.hpR, k = side > 0. ? P.knL : P.knR;
  if (leg) {
    float lx = side * 0.095 * gxL;
    if (b > 10.5) rX(p, n, vec3(lx, 0.085, 0.), h - k + (side > 0. ? P.ftL : P.ftR)); // keeps the sole level, + ft points the toes down
    if (b == 8. || b == 10. || b > 10.5) rX(p, n, vec3(lx, 0.51, 0.), k);
    rX(p, n, vec3(lx, 0.93, 0.), -h);
  }
  rY(p, n, vec3(0.), P.twist);
  float eL = 0.42 * cos(P.hpL) + 0.425 * cos(P.hpL - P.knL), eR = 0.42 * cos(P.hpR) + 0.425 * cos(P.hpR - P.knR);
  p.y += P.bob - (0.845 - max(eL, eR));
  p *= iC.x;
  rY(p, n, vec3(0.), iA.w);
  pplP = p + iA.xyz; pplN = n;
}
`;

// wraps onBeforeCompile so a later assignment (e.g. three's CSM setupMaterial) runs after ours instead of replacing it
export function patchInstanced(material, { head, main = 'pplRun();', frag = null, key }) {
  let other = null;
  const ours = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + head)
      .replace('void main() {', 'void main() {\n' + main)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = pplN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = pplP;');
    if (frag) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + frag.head).replace('#include <color_fragment>', '#include <color_fragment>\n' + frag.color);
    if (material.userData.uniforms) Object.assign(shader.uniforms, material.userData.uniforms);
    other?.(shader);
  };
  Object.defineProperty(material, 'onBeforeCompile', { get: () => ours, set: (f) => { other = f === ours ? null : f; }, configurable: true });
  material.customProgramCacheKey = () => key;
  return material;
}

export function createCrowdMaterials() {
  const uniforms = { uTime: { value: 0 } };
  const frag = { head: 'varying vec3 vPplCol;', color: 'diffuseColor.rgb *= vPplCol;' };
  const mat = patchInstanced(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 }), { head: HEAD, frag, key: 'ppl-body' });
  const depth = patchInstanced(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { head: HEAD, key: 'ppl-depth' });
  mat.userData.uniforms = uniforms; depth.userData.uniforms = uniforms;
  return { mat, depth, uniforms };
}

export function createCrowdLayer(q, cap, mats) {
  const geo = buildBodyGeometry(q);
  const arr = Object.fromEntries(['iA', 'iB', 'iC', 'iD', 'iE'].map(name => [name, new THREE.InstancedBufferAttribute(new Float32Array(4 * cap), 4).setUsage(THREE.DynamicDrawUsage)]));
  Object.entries(arr).forEach(([name, attr]) => geo.setAttribute(name, attr));
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, mats.mat);
  mesh.customDepthMaterial = mats.depth;
  mesh.frustumCulled = false; mesh.castShadow = q > 0; mesh.receiveShadow = q > 0; mesh.name = 'people-lod' + q;
  const A = arr.iA.array, B = arr.iB.array, C = arr.iC.array, D = arr.iD.array, E = arr.iE.array;
  let n = 0;
  return {
    mesh, cap, tris: geo.attributes.position.count / 3,
    get count() { return n; },
    begin() { n = 0; },
    push(p) {
      if (n >= cap) return false;
      const o = n * 4, L = p.look, c = L.cols;
      A[o] = p.x; A[o + 1] = p.y; A[o + 2] = p.z; A[o + 3] = p.ry;
      B[o] = p.phase; B[o + 1] = p.clipA + 16 * p.clipB; B[o + 2] = p.blend; B[o + 3] = p.headYaw;
      C[o] = L.sH; C[o + 1] = L.girth; C[o + 2] = p.seed; C[o + 3] = L.mask;
      D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = c[3];
      E[o] = c[4]; E[o + 1] = c[5]; E[o + 2] = c[6]; E[o + 3] = c[7];
      n++; return true;
    },
    end() {
      geo.instanceCount = n; mesh.visible = n > 0;
      if (!n) return;
      Object.values(arr).forEach(attr => { attr.clearUpdateRanges(); attr.addUpdateRange(0, 4 * n); attr.needsUpdate = true; });
    },
  };
}
