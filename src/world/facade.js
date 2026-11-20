// Facade geometry + material. A wall is one quad; windows, floors, storefronts, weathering, interiors seen through the
// glass and lit windows at night are all drawn by the facade shader from compact per-vertex parameters.
//
// Exports
//   STYLE = { BLANK, PUNCHED, CURTAIN, RIBBON, STAIR }   window treatments; STAIR is a one-bay stair column (windows on
//           the half-landings, lit most of the night), split out of a wall over an entrance by the city generator
//   PLUS = { PANEL, TILED, BRICK, STALIN (one of, 1..4), FRAMES, PIPES (bits), STRIP, SCREEN, RECESS (stair variants) }
//           opt-in type detail, p.plus = an OR of them, 0 = none (every hand-built site, the far stand-ins): panel
//           seams and tones / tiled spandrels, brick lintels, aprons, belts and a dentil course, a stalinka's rusticated
//           ground floor, architraves, string course and cornice; FRAMES mixes old wooden and new white windows per
//           window, PIPES draws downpipes; all of it only where the window detail shows, so the far path costs the same
//   LAYER = { STUCCO, WHITE, BUFF, RED2, CONCRETE, METAL, GRANITE, TERRA, LIME, ROOF, ROOF_MEMBRANE, ROOF_GRAVEL }
//           (+ aliases PLASTER, SILICATE, BRICK, STONE) – wall / roof albedo layers of T.wallLayers (kit/textures.js)
//   FacadeBuilder  new FacadeBuilder(); .v / .n vertex count
//     .quad(origin, dir, L, y0, y1, normal, p, style = PUNCHED, gH = 0)   vertical wall rectangle from origin along
//          the unit horizontal dir for L metres, y0..y1, facing the horizontal normal (winding follows the normal)
//     .wall(ax, az, bx, bz, y0, y1, p, style, gH)  ring edge a->b, outward normal (dz, -dx) / L (outer rings with
//          positive map area, see kit/mesh.js ringArea2; holes reversed)
//     .box(x0,y0,z0,x1,y1,z1, p, rules = {all|px|nx|pz|nz: {style, gH}}, cap = false)   axis-aligned block
//     .poly(pts3D, normal, p)                     planar vertical blank polygon (gable ends)
//     .fill(outer, holes, y, p)                   horizontal roof cap with holes, p.layer = roof layer
//     .build() -> BufferGeometry | null (empty)   attributes: position, normal (int8), fuv, fgrid, fmat, ftint, fext
//   p (facade parameters, all optional): floorH (m), bayW (m), winW / winH (window size as fraction of bay / floor),
//     layer, base (plinth layer), seed (0..255 per building), resid (0/1), lintel (0..3), glass (mirror glazing 0/1),
//     depth (reveal m), margin (blank m at wall ends for ribbons), tint [r,g,b] (multiplies the layer, 0..2),
//     baseY (floor line the grid counts from, default y0), topY (wall top for the parapet band, default y1), plinth (m),
//     plus (PLUS bits, the spare byte fext.w), u0 (whole bays added to the bay index, so the segments of one split wall
//     do not repeat each other's window hashes; not for RIBBON)
//   gH: ground floor height; > 0 = storefront floor of that height, < 0 = plain ground floor ending at |gH|, 0 = auto
//   createFacadeMaterial(T) -> MeshStandardMaterial (shared by all facade tiles; night via materials.js cityUniforms);
//     mat.setSigns(tex), mat.setDetail(k = 1): k > 1 trades the window detail (frames, rooms, blinds) for the flat
//     far average k times nearer – the lower graphics levels; 1 is the full picture
import * as THREE from 'three';
import { Grow, triangulateRings } from '../kit/mesh.js';
import { WALL_LAYERS } from '../kit/textures.js';
import { GLSL_COMMON, bindCityUniforms, patchMaterial } from './materials.js';

// style ids double as shader constants (see FRAG_MAIN)
export const STYLE = Object.freeze(Object.fromEntries(['BLANK', 'PUNCHED', 'CURTAIN', 'RIBBON', 'STAIR'].map((k, i) => [k, i])));
// type detail bits of p.plus (see FRAG_MAIN): type 1..4 in bits 0-2, FRAMES bit 3, PIPES bit 4, the stair variant in bits 5-6
export const PLUS = Object.freeze({ PANEL: 1, TILED: 2, BRICK: 3, STALIN: 4, FRAMES: 8, PIPES: 16, STRIP: 32, SCREEN: 64, RECESS: 96 });
export const LAYER = Object.fromEntries(WALL_LAYERS.map((n, i) => [n, i]));
Object.assign(LAYER, { PLASTER: LAYER.STUCCO, SILICATE: LAYER.WHITE, BRICK: LAYER.RED2, STONE: LAYER.LIME });

const u8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
// vertex streams: [field, typed array, components, normalized]
const STREAMS = [['P', Float32Array, 3, false, 'position'], ['N', Int8Array, 3, true, 'normal'], ['UV', Float32Array, 4, false, 'fuv'],
  ['G', Uint8Array, 4, false, 'fgrid'], ['M', Uint8Array, 4, false, 'fmat'], ['T', Uint8Array, 4, true, 'ftint'], ['E', Uint8Array, 4, false, 'fext']];

export class FacadeBuilder {
  constructor() {
    for (const [f, Type] of STREAMS) this[f] = new Grow(Type, 1024);
    this.I = new Grow(Uint32Array, 1024); this.v = 0;
  }
  get n() { return this.v; }

  // packed per-quad parameters (same for all its vertices)
  _pack(p, style, gH, bayW) {
    const t = p.tint ?? [1, 1, 1];
    const flags = (p.resid ? 1 : 0) | (p.glass ? 2 : 0) | ((Math.min(3, p.lintel | 0)) << 2) | (gH > 0.01 ? 16 : 0);
    return [
      u8((p.floorH ?? 3) * 20), u8(bayW * 20), u8((p.winW ?? 0.45) * 255), u8((p.winH ?? 0.52) * 255),
      u8(p.layer ?? LAYER.STUCCO), u8((style & 7) + flags * 8), u8(p.seed ?? 0), u8(p.base ?? LAYER.CONCRETE),
      u8((t[0] / 2) * 255), u8((t[1] / 2) * 255), u8((t[2] / 2) * 255), u8(((p.depth ?? 0.15) / 0.5) * 255),
      u8(Math.abs(gH) * 10), u8((p.plinth ?? 0.6) * 50), u8((p.margin ?? 0.6) * 100), u8(p.plus ?? 0),
    ];
  }
  _vert(x, y, z, n, u, h, H, nb, k) {
    this.P.push3(x, y, z); this.N.push3(Math.round(n[0] * 127), Math.round(n[1] * 127), Math.round(n[2] * 127));
    this.UV.push4(u, h, H, nb);
    this.G.push4(k[0], k[1], k[2], k[3]); this.M.push4(k[4], k[5], k[6], k[7]); this.T.push4(k[8], k[9], k[10], k[11]); this.E.push4(k[12], k[13], k[14], k[15]);
    return this.v++;
  }

  quad(o, d, L, y0, y1, n, p = {}, style = STYLE.PUNCHED, gH = 0) {
    if (!(L > 0.05) || !(y1 - y0 > 0.01)) return this;
    const nl = Math.hypot(n[0], n[2]) || 1, N = [n[0] / nl, 0, n[2] / nl];
    const bay = Math.max(0.5, p.bayW ?? 3);
    let nb = 0;
    if (style === STYLE.CURTAIN) nb = Math.max(1, Math.round(L / bay));
    else if (style !== STYLE.BLANK) nb = L >= bay * 0.62 ? Math.max(1, Math.round(L / bay)) : 0;
    if (!nb && style !== STYLE.CURTAIN) style = STYLE.BLANK;
    const bw = nb ? L / nb : bay, span = nb || L / bay;
    if (!gH) gH = -((p.plinth ?? 0.6) + (p.floorH ?? 3));
    const k = this._pack(p, style, gH, Math.min(12.7, bw));
    const base = p.baseY ?? y0, H = (p.topY ?? y1) - base;
    // u counts bays left -> right as seen from outside: right = (nz, 0, -nx)
    const fwd = d[0] * N[2] - d[2] * N[0] >= 0, off = style === STYLE.RIBBON ? 0 : p.u0 | 0;
    const u0 = (fwd ? 0 : span) + off, u1 = (fwd ? span : 0) + off;
    const x1 = o[0] + d[0] * L, z1 = o[2] + d[2] * L;
    const a = this._vert(o[0], y0, o[2], N, u0, y0 - base, H, nb, k), b = this._vert(x1, y0, z1, N, u1, y0 - base, H, nb, k);
    const c = this._vert(x1, y1, z1, N, u1, y1 - base, H, nb, k), e = this._vert(o[0], y1, o[2], N, u0, y1 - base, H, nb, k);
    // (b - a) x up = (-dz, 0, dx)
    if (-d[2] * N[0] + d[0] * N[2] > 0) { this.I.push3(a, b, c); this.I.push3(a, c, e); } else { this.I.push3(a, c, b); this.I.push3(a, e, c); }
    return this;
  }

  wall(ax, az, bx, bz, y0, y1, p, style, gH) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) return this;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    return this.quad([ax, 0, az], [ux, 0, uz], len, y0, y1, [uz, 0, -ux], p, style, gH);
  }

  box(x0, y0, z0, x1, y1, z1, p = {}, rules = {}, cap = false) {
    const sx = x1 - x0, sz = z1 - z0;
    // [rule key, start corner, run direction, run length, normal]
    const sides = [['px', [x1, 0, z0], [0, 0, 1], sz, [1, 0, 0]], ['nx', [x0, 0, z0], [0, 0, 1], sz, [-1, 0, 0]],
      ['pz', [x0, 0, z1], [1, 0, 0], sx, [0, 0, 1]], ['nz', [x0, 0, z0], [1, 0, 0], sx, [0, 0, -1]]];
    for (const [key, o, dir, len, nrm] of sides) {
      const rule = rules[key] ?? rules.all ?? {};
      this.quad(o, dir, len, y0, y1, nrm, p, rule.style ?? STYLE.PUNCHED, rule.gH ?? 0);
    }
    if (cap) {
      const roof = { ...p, layer: p.roofLayer ?? LAYER.ROOF_MEMBRANE, tint: p.roofTint ?? [0.6, 0.6, 0.6] };
      this.fill([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [], y1, roof);
    }
    return this;
  }

  poly(pts, n, p = {}) {
    if (pts.length < 3) return this;
    const hl = Math.hypot(n[0], n[2]) || 1, nx = n[0] / hl, nz = n[2] / hl, N = [nx, 0, nz], bay = Math.max(0.5, p.bayW ?? 3);
    const ys = pts.map((q) => q[1]), base = p.baseY ?? Math.min(...ys), top = p.topY ?? Math.max(...ys);
    const k = this._pack(p, STYLE.BLANK, 0, bay), [ox, , oz] = pts[0];
    const ids = pts.map(([x, y, z]) => this._vert(x, y, z, N, ((x - ox) * nz - (z - oz) * nx) / bay, y - base, top - base, 0, k));
    // winding from the outline's own orientation (Newell x / z terms) against the requested normal
    const nw = pts.reduce((acc, a, i) => {
      const b = pts[(i + 1) % pts.length];
      acc[0] += (a[1] - b[1]) * (a[2] + b[2]); acc[1] += (a[0] - b[0]) * (a[1] + b[1]);
      return acc;
    }, [0, 0]);
    const rev = nw[0] * nx + nw[1] * nz < 0;
    ids.slice(2).forEach((id, j) => { const prev = ids[j + 1]; rev ? this.I.push3(ids[0], id, prev) : this.I.push3(ids[0], prev, id); });
    return this;
  }

  fill(outer, holes = [], y = 0, p = {}) {
    const T = triangulateRings(outer, holes);
    if (!T) return this;
    const k = this._pack(p, STYLE.BLANK, 0, 3), first = this.v;
    for (const q of T.pts) this._vert(q[0], y, q[1], [0, 1, 0], q[0], q[1], 0, -1, k); // fuv.w = -1 marks a roof cap
    const P = T.pts, I = T.idx;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const i = I[t], j = I[t + 1], m = I[t + 2];
      const up = (P[j][1] - P[i][1]) * (P[m][0] - P[i][0]) - (P[j][0] - P[i][0]) * (P[m][1] - P[i][1]) > 0;
      this.I.push3(first + i, first + (up ? j : m), first + (up ? m : j));
    }
    return this;
  }

  build() {
    if (!this.v) return null;
    const geo = new THREE.BufferGeometry();
    for (const [f, , size, norm, name] of STREAMS) geo.setAttribute(name, new THREE.BufferAttribute(this[f].take(), size, norm));
    geo.setIndex(new THREE.BufferAttribute(this.v > 65535 ? this.I.take() : Uint16Array.from(this.I.view()), 1));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  }
}

// ---------------------------------------------------------------------------------------------- shader
const VERT_DECL = /* glsl */ `
attribute vec4 fuv;
attribute vec4 fgrid;
attribute vec4 fmat;
attribute vec4 ftint;
attribute vec4 fext;
varying vec4 vFuv;
flat varying vec4 vGrid;
flat varying vec4 vMat;
flat varying vec4 vTint;
flat varying vec4 vExt;
varying vec3 vWPos;
varying vec3 vWN;
`;
const VERT_MAIN = /* glsl */ `
vFuv = fuv; vGrid = fgrid; vMat = fmat; vTint = ftint; vExt = fext;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWN = normalize(mat3(modelMatrix) * objectNormal);
`;

const FRAG_DECL = /* glsl */ `
${GLSL_COMMON}
uniform highp sampler2DArray tLayers;
uniform float layerScale[${WALL_LAYERS.length}];
uniform sampler2D tNoise;
uniform sampler2D tSigns;
uniform float hasSigns;
uniform float facadeDetail;
varying vec4 vFuv;
flat varying vec4 vGrid;
flat varying vec4 vMat;
flat varying vec4 vTint;
flat varying vec4 vExt;
varying vec3 vWPos;
varying vec3 vWN;

vec4 layerTex(float layer, vec2 m) { return texture(tLayers, vec3(m / layerScale[int(layer + 0.5)], layer)); }
// box-filtered band a..b of x at a pixel footprint w: thin courses fade out instead of shimmering
float fBand(float x, float a, float b, float w) { return clamp((x - a) / w + 0.5, 0.0, 1.0) - clamp((x - b) / w + 0.5, 0.0, 1.0); }

// interior seen through a window: ray from the glass into a room box (bay wide, floor high, a few metres deep)
vec3 roomLook(vec3 V, vec3 N, vec3 T, vec2 p, float bw, float fh, float rh) {
  vec3 d = vec3(-dot(V, T), -V.y, -dot(V, N));
  d.z = min(d.z, -0.05);
  float depth = 3.0 + 3.0 * rh;
  float tx = ((d.x > 0.0 ? bw * 0.5 : -bw * 0.5) - p.x) / (abs(d.x) > 1e-4 ? d.x : 1e-4);
  float ty = ((d.y > 0.0 ? fh : 0.0) - p.y) / (abs(d.y) > 1e-4 ? d.y : 1e-4);
  float tz = -depth / d.z;
  float t = min(min(abs(tx), abs(ty)), tz);
  vec3 hp = vec3(p, 0.0) + d * t;
  vec3 wallC = mix(vec3(0.75, 0.68, 0.58), vec3(0.62, 0.7, 0.72), fract(rh * 7.3));
  vec3 c = wallC;
  if (t == abs(ty)) c = d.y < 0.0 ? vec3(0.42, 0.3, 0.2) : vec3(0.85);
  else if (t == abs(tx)) c = wallC * 0.78;
  else if (fract(rh * 13.7) > 0.45 && abs(hp.x) < bw * 0.3 && hp.y < fh * 0.7) c = vec3(0.3, 0.22, 0.16); // furniture
  return c * mix(1.0, 0.45, clamp(-hp.z / depth, 0.0, 1.0));
}
`;

const FRAG_MAIN = /* glsl */ `
  vec3 fN = normalize(vWN);
  vec3 fV = normalize(cameraPosition - vWPos);
  vec3 fT = vec3(fN.z, 0.0, -fN.x);
  float layer = vMat.x, styleF = mod(vMat.y, 8.0), flags = floor(vMat.y / 8.0 + 0.01);
  float resid = mod(flags, 2.0), mirror = mod(floor(flags / 2.0), 2.0), lintel = mod(floor(flags / 4.0), 4.0), shop = mod(floor(flags / 16.0), 2.0);
  float bseed = vMat.z;
  vec3 tint = vTint.rgb * 2.0;
  float reveal = vTint.a * 0.5;
  float floorH = max(vGrid.x / 20.0, 1.0), bayW = max(vGrid.y / 20.0, 0.5), winW = vGrid.z / 255.0, winH = vGrid.w / 255.0;
  float gAbs = vExt.x / 10.0, plinth = vExt.y / 50.0, margin = vExt.z / 100.0;
  vec3 fCol; float fRough = 0.88, fMetal = 0.0; vec3 fEmit = vec3(0.0);
  if (vFuv.w < -0.5) {
    // roof cap: world-space roof layer
    vec4 rt = layerTex(layer, vFuv.xy);
    float n = texture2D(tNoise, vFuv.xy * 0.013).r;
    fCol = rt.rgb * tint * (0.82 + 0.36 * n);
    fRough = 0.92;
  } else {
    float u = vFuv.x, h = vFuv.y, Hw = vFuv.z, nB = vFuv.w;
    float um = u * bayW;
    float faceK = cHash(vec2(bseed, floor(atan(fN.z, fN.x) * 2.0 + 0.5)));
    vec4 wt = layerTex(layer, vec2(um, h));
    vec3 wall = wt.rgb * tint * (0.95 + 0.1 * faceK);
    if (h < plinth) wall = layerTex(vMat.w, vec2(um, h)).rgb * vec3(0.9, 0.88, 0.85);
    // weathering: grime at the base, rain streaks, darker parapet run-off
    float st = texture2D(tNoise, vec2(um * 0.23 + bseed * 0.37, h * 0.012)).g;
    wall *= mix(0.8, 1.0, smoothstep(0.0, 2.2, h)) * (0.94 + 0.12 * st) * mix(1.0, 0.88, smoothstep(Hw - 1.2, Hw, h) * step(2.0, Hw));
    wall *= mix(0.85, 1.0, wt.a);

    // floors: ground floor tops at G, upper floors every floorH, no windows in the top parapet band
    float G = shop > 0.5 ? gAbs : max(gAbs, plinth + floorH * 0.8);
    float fh = h - (G - floorH);
    float k = floor(fh / floorH), fv = fh / floorH - k;
    // + 0.2: a wall that ends right at a slab (pitched roofs and houses, no parapet) keeps its top floor's windows
    // (- 0.3 dropped it: every two-storey house showed one row); a parapet still gets none, a window top stays >= 0.3 m down
    float nFl = floor((Hw - G + 0.2) / floorH) + 1.0;
    float inFl = step(0.0, k) * step(k, nFl - 1.0);
    float bi = floor(u), fu = u - bi;
    float aa = max(fwidth(um) + fwidth(h), 1e-3);
    // far: average the window grid away before it aliases (facadeDetail > 1 does it nearer: the lower graphics levels)
    float pxs = max(fwidth(fh) / floorH, fwidth(u)) * facadeDetail;
    float detail = 1.0 - smoothstep(0.18, 0.55, pxs);
    // opt-in type detail (fext.w; 0 on every hand-built wall): kW / fvW keep the wall's own rows for seams and courses
    float plusB = vExt.w, kW = k, fvW = fv, pvar = 0.0;
    if (styleF > 3.5) { // stair column: its windows sit on the half-landings, none under the first (the door is there)
      pvar = floor(plusB / 32.0 + 0.01);
      float fs = fh - 0.5 * floorH;
      k = floor(fs / floorH); fv = fs / floorH - k;
      inFl = step(0.0, k) * step(k, nFl - 2.0);
    }
    float yl = fv * floorH;
    float cover = 0.0; // window area fraction (for the far average)
    float d = 1e3; vec2 wp = vec2(0.0); float ww = bayW, wid = 0.0;
    float sill = (1.0 - winH) * 0.62 * floorH, wh = winH * floorH;
    if (styleF > 0.5 && styleF < 1.5) { // punched
      float hw = winW * bayW * 0.5;
      wp = vec2((fu - 0.5) * bayW, yl);
      d = max(abs(wp.x) - hw, max(sill - yl, yl - sill - wh));
      cover = winW * winH; wid = bi;
    } else if (styleF > 3.5) { // stair column (one bay)
      float hw = winW * bayW * 0.5;
      wp = vec2((fu - 0.5) * bayW, yl); wid = bi + 31.0;
      if (pvar > 0.5 && pvar < 2.5) { // 1: one glazed strip from the first floor up, 2: a perforated concrete screen
        d = max(abs(wp.x) - hw, max(G + 0.2 - h, h - Hw + 1.1));
        if (pvar > 1.5) { vec2 c = (fract(vec2(wp.x + 64.0, h) / 0.4) - 0.5) * 0.4; d = max(d, max(abs(c.x), abs(c.y)) - 0.11); }
        inFl = 1.0; cover = winW * (pvar > 1.5 ? 0.3 : 0.8);
      } else { // 0: a window on every half-landing; 3: the same, in a recessed strip
        d = max(abs(wp.x) - hw, max(sill - yl, yl - sill - wh));
        cover = winW * winH;
      }
    } else if (styleF > 2.5) { // ribbon: one band per floor, mullions every half bay
      float span = nB * bayW;
      d = max(max(margin - um, um - span + margin), max(sill - yl, yl - sill - wh));
      wp = vec2((fu - 0.5) * bayW, yl); cover = winH * 0.9; wid = floor(u * 0.5);
    } else if (styleF > 1.5) { // curtain wall: glass floor to floor, spandrel band at each slab
      d = max(0.35 - yl, yl - floorH + 0.05);
      wp = vec2((fu - 0.5) * bayW, yl); cover = 0.85; wid = bi;
      inFl = step(0.0, fh) * step(h, Hw - 0.25);
    }
    if (styleF > 1.5 && styleF < 2.5 && shop < 0.5 && k < 0.5) inFl = step(0.0, fh) * step(h, Hw - 0.25);
    d = inFl > 0.5 ? d : 1e3;
    // storefront floor: display windows and a sign band
    float isShop = shop * step(h, G) * step(0.0, h);
    float signM = 0.0;
    if (isShop > 0.5) {
      float sw = bayW * 0.44;
      wp = vec2((fu - 0.5) * bayW, h - 0.45);
      d = max(abs(wp.x) - sw, max(0.45 - h, h - (G - 1.05)));
      signM = step(G - 0.95, h) * step(h, G - 0.2);
      cover = 0.5; wid = bi + 100.0; ww = bayW;
    }
    float win = 1.0 - smoothstep(-aa, aa, d);
    float frameW = styleF > 1.5 ? 0.05 : 0.07;
    float rh = cHash(vec2(bseed * 7.1 + wid, k * 3.7 + faceK * 11.0));
    vec3 frameC = rh < 0.7 ? vec3(0.9, 0.9, 0.88) : (rh < 0.88 ? vec3(0.32, 0.22, 0.15) : vec3(0.55, 0.57, 0.58));
    if (styleF > 3.5 && pvar > 0.5 && pvar < 2.5) frameC = pvar > 1.5 ? wall * 0.9 : vec3(0.8, 0.82, 0.82); // one frame up the whole strip / bare concrete round the holes
    // PLUS.FRAMES: a building's share of windows keeps the old wooden frame (brown or faded paint, thicker, with a
    // mullion and a vent pane), the rest are new white ones
    float oldF = 0.0;
    if (plusB > 7.5 && detail > 0.0 && mod(floor(plusB / 8.0 + 0.01), 2.0) > 0.5 && (styleF < 1.5 || styleF > 3.5)) {
      oldF = step(fract(rh * 41.7), 0.2 + 0.4 * cHash(vec2(bseed, 9.0)));
      frameC = oldF > 0.5 ? (fract(rh * 17.3) < 0.6 ? vec3(0.27, 0.18, 0.12) : vec3(0.6, 0.68, 0.73)) : vec3(0.92, 0.92, 0.9);
      frameW += 0.03 * oldF;
    }
    float glass = 1.0 - smoothstep(-aa, aa, d + frameW);
    // mullions: centre bar on wide punched windows, half-bay bars on ribbons / curtain walls
    float mx = styleF > 1.5 ? abs(fract(u * 2.0) - 0.5) * bayW * 0.5 : (winW * bayW > 1.1 ? abs(wp.x) : 1e3);
    if (styleF > 3.5) mx = pvar > 1.5 && pvar < 2.5 ? 1e3 : min(winW * bayW > 1.0 ? abs(wp.x) : 1e3, pvar > 0.5 && pvar < 1.5 ? abs(fract(h / 0.8) - 0.5) * 0.8 : 1e3);
    if (oldF > 0.5) mx = min(abs(wp.x), wp.x < 0.0 ? abs(yl - sill - wh * 0.72) : 1e3);
    glass *= smoothstep(0.02, 0.02 + aa, mx - 0.03);
    // fake reveal: a shaded band inside the top / side of the opening
    float rv = styleF < 1.5 || styleF > 3.5 ? smoothstep(-reveal - aa, -reveal + aa, -(d + frameW) - 0.0) : 1.0;
    // interior (only where the window detail shows: the room ray is the costliest part of the shader)
    vec3 room = detail <= 0.0 ? vec3(0.0) : roomLook(fV, fN, fT, vec2(wp.x, (isShop > 0.5 ? h : yl) - (isShop > 0.5 ? 0.0 : 0.0)), ww, isShop > 0.5 ? G : floorH, rh);
    float blind = step(1.0 - fract(rh * 5.3) * 0.7, (yl - sill) / max(wh, 0.1)) * step(0.55, fract(rh * 3.1)) * (1.0 - isShop) * step(styleF, 3.5);
    vec3 inside = mix(room * 0.22, vec3(0.62, 0.6, 0.55), blind * 0.8);
    if (mirror > 0.5) inside = mix(inside, vec3(0.04, 0.07, 0.08), 0.75);
    // night: a modest, varied subset of rooms lit warm (shops mostly lit)
    float litFrac = isShop > 0.5 ? 0.7 : mix(0.1, 0.22, resid);
    if (styleF > 3.5) litFrac = 0.62; // the stair lights burn most of the night
    float lit = step(fract(rh * 97.3), litFrac);
    vec3 warm = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.85, 0.62), fract(rh * 31.1));
    if (fract(rh * 57.7) > 0.93) warm = vec3(0.55, 0.65, 1.0); // a TV-blue room here and there
    if (styleF > 3.5) warm = vec3(0.62, 0.56, 0.38); // one dim bulb per landing
    vec3 glow = warm * (0.3 + 0.5 * room) * mix(1.0, 1.25, blind) * lit * glowK * nightFactor;
    // panel seams on precast concrete blocks
    if (int(layer + 0.5) == ${LAYER.CONCRETE} && resid > 0.5) {
      float sd = min(min(fv, 1.0 - fv) * floorH, min(fu, 1.0 - fu) * bayW);
      wall *= 1.0 - 0.3 * (1.0 - smoothstep(0.012, 0.012 + aa, sd)) * step(G - floorH, h);
    }
    // stucco decor: lintel band above the windows
    if (lintel > 0.5 && styleF > 0.5 && styleF < 1.5) {
      float lb = step(sill + wh, yl) * step(yl, sill + wh + 0.2 + 0.1 * lintel) * step(abs(wp.x), winW * bayW * 0.5 + 0.12);
      wall *= 1.0 + 0.12 * lb * inFl;
    }
    // PLUS type detail, only where the window detail shows (the far average stays as it was)
    if (plusB > 0.5 && detail > 0.0) {
      vec3 w0 = wall;
      float pt = mod(plusB, 8.0), up = step(G - floorH, h);
      // pw: this cell holds a punched window (also a stair landing's); sx < 0 across its width
      float pw = ((styleF > 0.5 && styleF < 1.5) || (styleF > 3.5 && (pvar < 0.5 || pvar > 2.5)) ? inFl : 0.0) * (1.0 - isShop);
      float sx = abs(wp.x) - winW * bayW * 0.5, inX = 1.0 - smoothstep(-aa, aa, sx - 0.06);
      if (pvar > 2.5) wall *= 1.0 - 0.2 * (1.0 - smoothstep(-aa, aa, sx - 0.3)) * up; // the recessed stair strip
      if (pt > 0.5 && pt < 2.5) { // precast panels: each its own tone; seams where the block rule above draws none
        wall *= 1.0 + (cHash(vec2(bi * 1.7 + bseed, kW + 3.0)) - 0.5) * 0.1 * up;
        if (!(int(layer + 0.5) == ${LAYER.CONCRETE} && resid > 0.5)) {
          float sd = min(min(fvW, 1.0 - fvW) * floorH, min(fu, 1.0 - fu) * bayW);
          wall *= 1.0 - 0.3 * (1.0 - smoothstep(0.012, 0.012 + aa, sd)) * up;
        }
        if (pt > 1.5) { // tiled spandrels: an apron under each window, or one band along the floor
          float tk = cHash(vec2(bseed, 5.0));
          vec3 tc = tk < 0.3 ? vec3(0.27, 0.38, 0.5) : (tk < 0.55 ? vec3(0.3, 0.45, 0.36) : (tk < 0.8 ? vec3(0.5, 0.31, 0.22) : vec3(0.62, 0.53, 0.32)));
          float ap = pw * fBand(yl, 0.16, sill - 0.14, aa) * (fract(tk * 7.0) < 0.55 ? inX : 1.0);
          wall = mix(wall, tc * (0.75 + 0.4 * st), 0.88 * ap);
        }
      } else if (pt > 2.5 && pt < 3.5) { // brick: lintel courses, aprons or belts in the other brick, a dentil course under the roof
        float bk = cHash(vec2(bseed, 6.0));
        vec3 trim = int(layer + 0.5) == ${LAYER.RED2} ? wall * 1.7 : wall * vec3(0.74, 0.37, 0.29);
        wall *= 1.0 - 0.15 * pw * fBand(yl, sill + wh, sill + wh + 0.15, aa) * (1.0 - smoothstep(-aa, aa, sx - 0.12));
        if (bk < 0.3) wall = mix(wall, trim, 0.9 * pw * fBand(yl, sill - 0.86, sill - 0.09, aa) * (1.0 - smoothstep(-aa, aa, sx)));
        else if (bk < 0.55) wall = mix(wall, trim, 0.9 * fBand(fvW * floorH, 0.0, 0.16, aa) * step(G - 0.1, h) * step(h, Hw - 1.0));
        wall *= 1.0 - 0.24 * fBand(h, Hw - 0.74, Hw - 0.56, aa) * step(0.5, fract(um / 0.5)) * step(4.0, Hw);
        wall *= 1.0 + 0.1 * fBand(h, Hw - 0.56, Hw - 0.46, aa) * step(4.0, Hw);
      } else if (pt > 3.5 && pt < 4.5) { // stalinka: rusticated ground floor, architraves, a string course and a cornice
        vec3 pl = mix(wall, vec3(0.8, 0.78, 0.72), 0.7);
        if (cHash(vec2(bseed, 7.0)) < 0.6) {
          float jd = abs(fract(h / 0.46) - 0.5) * 0.46;
          wall *= 1.0 - (0.07 + 0.2 * (1.0 - smoothstep(0.014, 0.014 + aa, jd))) * step(plinth, h) * step(h, G - 0.16);
        }
        wall = mix(wall, pl, 0.85 * pw * (1.0 - smoothstep(0.11, 0.11 + aa, d)));
        wall *= 1.0 - 0.25 * fBand(h, G - 0.16, G - 0.06, aa);
        wall = mix(wall, pl, 0.9 * fBand(h, G - 0.06, G + 0.14, aa));
        wall *= 1.0 - 0.32 * fBand(h, Hw - 0.6, Hw - 0.44, aa);
        wall = mix(wall, pl * 1.04, 0.92 * fBand(h, Hw - 0.44, Hw - 0.1, aa));
      }
      // window sill: a light drip edge with its shadow line
      wall = mix(wall, vec3(0.64, 0.64, 0.61), 0.8 * pw * inX * fBand(yl, sill - 0.07, sill, aa));
      wall *= 1.0 - 0.2 * pw * inX * fBand(yl, sill - 0.13, sill - 0.07, aa);
      // PLUS.PIPES: a downpipe on every fifth bay line, with its funnel under the eaves, brackets and a shadow
      if (mod(floor(plusB / 16.0 + 0.01), 2.0) > 0.5 && mod(bi + floor(bseed * 0.5), 5.0) < 0.5) {
        float pk = cHash(vec2(bseed, 8.0)), px = fu * bayW - 0.12;
        float pr = 0.055 * (1.0 + 0.9 * smoothstep(Hw - 0.95, Hw - 0.6, h)), ph = step(shop > 0.5 ? G : 0.3, h) * step(h, Hw - 0.42);
        vec3 pc = pk < 0.6 ? vec3(0.47, 0.49, 0.5) : (pk < 0.85 ? vec3(0.3, 0.17, 0.12) : vec3(0.74));
        pc *= (0.62 + 0.5 * (1.0 - px * px / (pr * pr))) * (1.0 - 0.35 * step(fract(h / 1.9), 0.035));
        wall *= 1.0 - 0.25 * ph * fBand(px, pr, pr + 0.09, aa);
        wall = mix(wall, pc, ph * fBand(px, -pr, pr, aa));
      }
      wall = mix(w0, wall, detail);
    }
    // sign band: atlas row per shop pair, or a flat colour
    vec3 signC = mix(vec3(0.6, 0.1, 0.08), vec3(0.1, 0.25, 0.6), step(0.5, fract(rh * 9.1)));
    if (hasSigns > 0.5) { float row = floor(cHash(vec2(bseed, floor(u * 0.5))) * 16.0); vec2 su = vec2(fract(u * 0.5), (h - (G - 0.95)) / 0.75); signC = texture2D(tSigns, vec2(su.x, 1.0 - (row + 1.0) / 16.0 + clamp(su.y, 0.02, 0.98) / 16.0)).rgb; }
    wall = mix(wall, signC, signM);
    fEmit += signC * signM * nightFactor * 0.6;

    vec3 near = mix(wall, frameC, win);
    near = mix(near, inside * mix(0.55, 1.0, rv), glass);
    vec3 nearEmit = glow * glass + skyReflect(fN, fV, mirror > 0.5 ? 0.25 : 0.05) * glass;
    float cov = cover * inFl + (isShop > 0.5 ? 0.45 : 0.0);
    vec3 avgWin = mix(vec3(0.07, 0.08, 0.09), frameC * 0.3, 0.3);
    vec3 far = mix(wall, avgWin, clamp(cov, 0.0, 0.9));
    vec3 farEmit = warm * litFrac * cov * glowK * nightFactor * 0.6 + skyReflect(fN, fV, mirror > 0.5 ? 0.25 : 0.05) * cov;
    fCol = mix(far, near, detail);
    fEmit += mix(farEmit, nearEmit, detail);
    float g = glass * detail;
    fRough = mix(0.88, 0.1, g); fMetal = 0.0;
  }
  diffuseColor.rgb = fCol;
`;

export function createFacadeMaterial(T = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 });
  mat.name = 'city-facade';
  const U = {
    tLayers: { value: T.wallLayers ?? null },
    layerScale: { value: Array.from(T.layerScale ?? WALL_LAYERS.map(() => 3)) },
    tNoise: { value: T.noise ?? null },
    tSigns: { value: T.signs ?? null },
    hasSigns: { value: T.signs ? 1 : 0 },
    facadeDetail: { value: 1 },
  };
  if (!U.tLayers.value) { // fallback: flat white layers so the city still renders without the texture bundle
    console.warn('[facade] no wall layer textures, using a flat fallback');
    const t = new THREE.DataArrayTexture(new Uint8Array(4 * WALL_LAYERS.length).fill(220), 1, 1, WALL_LAYERS.length);
    t.needsUpdate = true; U.tLayers.value = t;
  }
  const texel = (...rgba) => Object.assign(new THREE.DataTexture(Uint8Array.from(rgba), 1, 1), { needsUpdate: true });
  U.tNoise.value ??= texel(128, 128, 128, 128);
  U.tSigns.value ??= texel(128, 128, 128, 255);
  mat.userData.facade = U;
  mat.setSigns = (tex) => { U.tSigns.value = tex; U.hasSigns.value = tex ? 1 : 0; };
  mat.setDetail = (k = 1) => { U.facadeDetail.value = k; }; // k > 1: windows average out k times nearer (lower graphics)
  patchMaterial(mat, 'city-facade-v1', (s) => {
    bindCityUniforms(s);
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = fMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += fEmit;');
  });
  return mat;
}
