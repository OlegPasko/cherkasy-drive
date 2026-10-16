// Procedural Roadster (the second player car, after the 2026 Tesla Roadster shown on 2026-10-16), unlocked once every
// sight is found (src/game/garage.js). The same contract as the Cybertruck's model.js:
//   buildRoadsterModel() -> { object, body, set(state, dt), eye, interior, driver, materials, fx }
//   RDIM: { len, wid, wb, track, wheelR, wheelZ, wheelX, height } (car.js reads it like model.js's DIM)
//   fx: a world-space THREE.Points of cold-gas puffs; car.js adds it to the scene while this car is driven.
// Car space as in model.js: +z forward, +x = LEFT (the driver sits at +x), +y up, y 0 = ground contact.
// Shape (4.6 m, 3.0 m wheelbase, 1.15 m tall): one faceted hull lofted through ~20 cross-sections (7 creased strips a side,
// flat-shaded, so every section vertex is a crease): a flat bonnet between two raised front fender peaks with small
// triangular headlights at their tips, a full-width white light bar over a black intake and a splitter; a dark glass
// canopy (windshield, roof, side glass) running into a black glass rear deck between raised rear haunches; sharp
// shoulder and waist creases, a carbon sill; a Kamm tail with a full-width red bar, a thin upper bar, the Everlabs plate
// (as on the Cybertruck) and a black diffuser with four round cold-gas nozzles. Turbine-spoke wheels. The body wears the
// Cybertruck's unpainted stainless (model.js STEEL). Wheel arches are cut by tucking the lower section points inward.
// Butterfly doors: the door strips (glass to sill) are their own groups hinged on the canopy edge; they swing up when
// the car stands parked in the chase view (state.parked). A rear wing on two stalks rises from the deck while the car is
// in the air (state.air). Interior: white bolstered sport seats with grey stripes, a yoke, a low dark dash with a red
// ambient strip, a centre screen (canvas: speed, PRND, gas charge and thrust, altitude), door cards; a driver whose arms
// follow the yoke.
// Gas: state.charge (0..1, building on the ground: vents puff under the sills), state.burst (the jump: a blast down from
// the four belly nozzles that spreads over the ground), state.gasDown (hover jets) and state.gasRear (the four rear
// nozzles, forward thrust). state.groundY is the ground under the car (puffs spread on it).
import * as THREE from 'three';
import { STEEL, bakeStatic, liveCanvas, gradTex } from './model.js';
import { logoTexture } from '../../kit/logo.js';

const { clamp, lerp } = THREE.MathUtils;
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

export const RDIM = { len: 4.6, wid: 2.0, wb: 3.0, track: 1.7, wheelR: 0.36, wheelZ: 1.5, wheelX: 0.85, height: 1.15 };
const EYE = new THREE.Vector3(0.4, 0.97, -0.3);
const NOSE = 2.3, TAIL = -2.3, WSZ = 0.95, CABIN_END = -0.95, GLASS_END = -2.14, WC = RDIM.wheelZ, ARCH_Y = 0.78;

// ---------------------------------------------------------------- hull sections
// piecewise-linear tables [[z, value], ...] from the nose back
const lin = (t, z) => {
  if (z >= t[0][0]) return t[0][1];
  for (let i = 0; i < t.length - 1; i++) {
    const [z0, a] = t[i], [z1, b] = t[i + 1];
    if (z <= z0 && z >= z1) return a + (b - a) * (z0 - z) / (z0 - z1);
  }
  return t[t.length - 1][1];
};
const T = {
  y0: [[NOSE, 0.5], [WSZ, 0.78], [-0.25, 1.2], [-0.7, 1.18], [GLASS_END, 0.9], [TAIL, 0.88]],   // centre line
  x1: [[NOSE, 0.46], [WSZ, 0.56], [-0.2, 0.52], [-0.65, 0.52], [GLASS_END, 0.46], [TAIL, 0.47]], // bonnet / canopy edge
  d1: [[NOSE, 0], [WSZ, 0], [0.4, 0.05], [-0.2, 0.08], [-0.65, 0.08], [GLASS_END, 0.03], [TAIL, 0.02]],
  x2: [[NOSE, 0.7], [WSZ, 0.79], [0.2, 0.87], [-0.7, 0.88], [-1.1, 0.84], [TAIL, 0.89]],        // fender peak / belt / haunch
  y2: [[NOSE, 0.8], [1.5, 0.88], [WSZ, 0.89], [0.2, 0.87], [-0.7, 0.88], [-1.1, 0.97], [-2.0, 0.99], [TAIL, 0.98]],
  x3: [[NOSE, 0.94], [1.9, 0.985], [-0.9, 0.99], [-1.4, 1.03], [TAIL, 1.02]],                                                 // outer shoulder
  y3: [[NOSE, 0.66], [1.5, 0.83], [WSZ, 0.8], [0, 0.76], [-0.9, 0.8], [-1.5, 0.88], [TAIL, 0.86]],
  x4: [[NOSE, 0.99], [1.9, 1.0], [-0.9, 1.0], [-1.4, 1.04], [TAIL, 1.03]],                                                    // waist crease (widest)
  y4: [[NOSE, 0.44], [1.5, 0.52], [0.3, 0.55], [-0.9, 0.58], [-1.5, 0.62], [TAIL, 0.62]],
  x5: [[NOSE, 0.96], [WC - 0.5, 0.96], [0.6, 0.92], [CABIN_END, 0.93], [-WC + 0.5, 0.97], [TAIL, 0.97]], // lower crease (sill top): the doors draw in
  y5: [[NOSE, 0.25], [WC - 0.5, 0.27], [0.2, 0.28], [CABIN_END, 0.34], [-WC - 0.5, 0.33], [TAIL, 0.32]],
  x6: [[NOSE, 0.9], [TAIL, 0.9]], y6: [[NOSE, 0.13], [TAIL, 0.15]],                               // sill bottom
};
// per-vertex z offsets at the two ends: the fender tips and the tail fins reach out, the lower nose / tail tuck in
const DZ_NOSE = [0, 0, 0.05, 0.02, -0.02, -0.12, -0.16, -0.16], DZ_TAIL = [0, 0, -0.06, -0.03, 0.02, 0.18, 0.22, 0.22];
// station z (nose -> tail); the arch stations sit at +-0.4 / +-0.25 m around each wheel centre
const STATIONS = [NOSE, 2.15, WC + 0.5, WC + 0.4, WC + 0.25, WC - 0.25, WC - 0.4, WC - 0.5, WSZ, 0.55, 0.25, -0.2, -0.65, CABIN_END,
  -WC + 0.5, -WC + 0.4, -WC + 0.25, -WC - 0.25, -WC - 0.4, -WC - 0.5, GLASS_END, -2.18, TAIL];
const archD = (z) => Math.min(Math.abs(z - WC), Math.abs(z + WC));
// half section at z: 8 points [x, y, z] from the top centre round the left side to the bottom centre
function section(z, i) {
  const y0 = lin(T.y0, z);
  const P = [
    [0, y0], [lin(T.x1, z), y0 - lin(T.d1, z)], [lin(T.x2, z), lin(T.y2, z)], [lin(T.x3, z), lin(T.y3, z)],
    [lin(T.x4, z), lin(T.y4, z)], [lin(T.x5, z), lin(T.y5, z)], [lin(T.x6, z), lin(T.y6, z)], [0, lin(T.y6, z)],
  ];
  const d = archD(z);
  if (d < 0.45) { // a wheel arch: the waist point rises to the arch top, the lower points tuck in behind the tyre
    const ha = d <= 0.3 ? ARCH_Y : 0.68;
    P[4] = [P[4][0], ha]; P[5] = [0.64, ha]; P[6] = [0.62, P[6][1]]; P[7] = [0, P[6][1]];
  }
  const dz = i === 0 ? DZ_NOSE : i === STATIONS.length - 1 ? DZ_TAIL : null;
  return P.map(([x, y], k) => [x, y, z + (dz ? dz[k] : 0)]);
}

// which material a strip (j: between section points j and j+1) takes over the span centred at zm
function stripMat(j, zm, arch) {
  if (j === 0) return zm > WSZ ? 'paint' : zm > 0.1 ? 'glass' : zm > GLASS_END ? 'dark' : 'paint'; // the roof: black glass
  if (j === 1) return zm > WSZ || zm < CABIN_END ? 'paint' : 'glass';
  if (j === 4) return arch ? 'black' : 'paint';
  if (j === 5) return arch ? 'black' : (zm < 1.0 && zm > -1.0) || zm < -2.0 ? 'carbon' : 'paint';
  if (j === 6) return 'black';
  return 'paint';
}

// a growable non-indexed triangle list (position, normal, uv in metres): flat facets, every section point a crease
function triList() {
  const pos = [], nrm = [], uv = [];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
  const put = (p) => { pos.push(p[0], p[1], p[2]); nrm.push(_n.x, _n.y, _n.z); uv.push(p[2] + p[0] * 0.3, p[1]); };
  const facing = (out) => { _n.normalize(); if (_n.x * out[0] + _n.y * out[1] + _n.z * out[2] < 0) { _n.negate(); return true; } return false; };
  const wind = (a, b, c) => { // keep the triangle's winding in line with _n
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const cx = _a.y * _b.z - _a.z * _b.y, cy = _a.z * _b.x - _a.x * _b.z, cz = _a.x * _b.y - _a.y * _b.x;
    if (cx * _n.x + cy * _n.y + cz * _n.z < 0) { put(a); put(c); put(b); } else { put(a); put(b); put(c); }
  };
  return {
    // a triangle facing `out` (a rough outward direction)
    tri(a, b, c, out) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _n.crossVectors(_a, _b);
      facing(out); wind(a, b, c);
    },
    // a quad a-b-c-d with one normal (across its diagonals), so a slightly warped quad still reads as one facet
    quad(a, b, c, d, out) {
      _a.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _b.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]); _n.crossVectors(_a, _b);
      if (_n.lengthSq() < 1e-12) return;
      facing(out); wind(a, b, c); wind(a, c, d);
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return g;
    },
  };
}

// ---------------------------------------------------------------- the centre screen (canvas)
function makeScreen() {
  const { g, tex } = liveCanvas(768, 448);
  tex.anisotropy = 4;
  const F = (w, px) => `${w} ${px}px "Helvetica Neue", Arial, sans-serif`;
  function bar(x, y, w, v, col, label, txt) {
    g.font = F(500, 20); g.fillStyle = '#8b94a3'; g.textAlign = 'left'; g.fillText(label, x, y - 16);
    g.textAlign = 'right'; g.fillStyle = '#e8ebef'; g.fillText(txt, x + w, y - 16);
    g.fillStyle = '#23272e'; g.fillRect(x, y, w, 14); g.fillStyle = col; g.fillRect(x, y, w * clamp(v, 0, 1), 14);
  }
  function draw(st) {
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 768, 448);
    g.fillStyle = '#141619'; g.fillRect(0, 0, 290, 448);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    ['P', 'R', 'N', 'D'].forEach((k, i) => { g.font = F(k === st.gear ? 700 : 500, 28); g.fillStyle = k === st.gear ? '#fff' : '#5b6370'; g.fillText(k, 80 + i * 42, 46); });
    g.font = F(300, 120); g.fillStyle = '#f2f4f7'; g.fillText(Math.round(Math.abs(st.speed) * 3.6), 145, 160);
    g.font = F(500, 24); g.fillStyle = '#8b94a3'; g.fillText('КМ/ГОД', 145, 236);
    // top view: the four belly jets and the four rear nozzles light up with their thrust
    g.save(); g.translate(145, 350);
    g.fillStyle = '#c9cdd2'; g.beginPath(); g.moveTo(-30, -70); g.lineTo(30, -70); g.lineTo(36, 66); g.lineTo(-36, 66); g.closePath(); g.fill();
    g.fillStyle = '#1d2026'; g.fillRect(-22, -30, 44, 70);
    for (const [x, y] of [[-24, -48], [24, -48], [-24, 44], [24, 44]]) { g.fillStyle = st.gasDown > 0.1 || st.charge > 0.05 ? `rgba(160,220,255,${0.3 + 0.7 * Math.max(st.gasDown, st.charge)})` : '#4a5260'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
    for (let k = 0; k < 4; k++) { g.fillStyle = st.gasRear > 0.1 ? `rgba(160,220,255,${0.3 + 0.7 * st.gasRear})` : '#a0784a'; g.beginPath(); g.arc(-21 + k * 14, 72, 5, 0, 7); g.fill(); }
    g.restore();
    g.textAlign = 'left';
    g.font = F(600, 28); g.fillStyle = '#e8ebef';
    g.fillText(st.air ? 'Газові двигуни' : st.charge > 0.01 ? 'Набір тиску' : 'Режим їзди', 320, 50);
    g.font = F(400, 19); g.fillStyle = '#8b94a3';
    g.fillText(st.air ? 'Shift: зависання · W: тяга · S: гальмо' : 'Тримай Shift: тиск газу, відпусти: стрибок', 320, 84);
    bar(320, 150, 410, st.charge, st.charge > 0.98 ? '#ff5a4a' : '#7fd0ff', 'Тиск', st.charge > 0.01 ? `${Math.round(st.charge * 100)} % · ≈ ${Math.round(st.jumpH || 0)} м` : '–');
    bar(320, 220, 410, st.gasDown, '#7fd0ff', 'Підйомні струмені', `${Math.round(st.gasDown * 100)} %`);
    bar(320, 290, 410, st.gasRear, '#7fd0ff', 'Тяга вперед', `${Math.round(st.gasRear * 100)} %`);
    bar(320, 360, 410, st.air ? st.alt / 120 : 0, '#7fd88a', 'Висота', st.air ? `${Math.round(st.alt)} м` : '–');
    if (st.air) { g.font = F(600, 22); g.fillStyle = st.vy >= 0 ? '#7fd88a' : '#ffb35a'; g.fillText((st.vy >= 0 ? '▲ ' : '▼ ') + Math.abs(st.vy).toFixed(1) + ' м/с', 320, 420); }
    else if (st.handbrake) { g.font = F(600, 22); g.fillStyle = '#ff5050'; g.fillText('(P) Ручник', 320, 420); }
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

// ---------------------------------------------------------------- cold-gas puffs (world space)
const FX_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aAlpha > 0.0 ? min( aSize * uScale / max( -mvPosition.z, 0.3 ), 480.0 ) : 0.0;
  vA = aAlpha;
  #include <fog_vertex>
}`;
const FX_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot( c, c );
  if ( r > 1.0 ) discard;
  float k = 1.0 - r;
  gl_FragColor = vec4( uColor * ( 0.82 + 0.18 * c.y * -1.0 ), vA * k * k );
  #include <fog_fragment>
}`;
function createGasFx(N = 760) {
  const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), s0 = new Float32Array(N), s1 = new Float32Array(N), a0 = new Float32Array(N), gy = new Float32Array(N), ox = new Float32Array(N), oz = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aSize = new THREE.BufferAttribute(size, 1), aAlpha = new THREE.BufferAttribute(alpha, 1);
  for (const a of [aPos, aSize, aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('aSize', aSize); g.setAttribute('aAlpha', aAlpha);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 }, uColor: { value: new THREE.Color(1.3, 1.34, 1.4) } }]),
    vertexShader: FX_VERT, fragmentShader: FX_FRAG, transparent: true, depthWrite: false, fog: true,
  });
  const points = new THREE.Points(g, mat);
  points.name = 'RoadsterGas'; points.frustumCulled = false; points.renderOrder = 9;
  const _sz = new THREE.Vector2();
  points.onBeforeRender = (renderer, scene, camera) => { // metres -> pixels at 1 m: half the buffer height / tan(fov / 2)
    renderer.getDrawingBufferSize(_sz);
    mat.uniforms.uScale.value = _sz.y * 0.5 * (camera.projectionMatrix?.elements[5] || 1);
  };
  let next = 0, live = 0;
  return {
    object: points,
    get live() { return live; },
    clear() { alpha.fill(0); aAlpha.needsUpdate = true; live = 0; }, // off the scene (a swap): no stale puffs on return
    // one puff at p with velocity v: life (s), size from a to b (m), opacity, the ground height under it
    emit(px, py, pz, vx, vy, vz, lf, sa, sb, op, ground) {
      const i = next; next = (next + 1) % N;
      pos[3 * i] = px; pos[3 * i + 1] = py; pos[3 * i + 2] = pz;
      vel[3 * i] = vx; vel[3 * i + 1] = vy; vel[3 * i + 2] = vz;
      age[i] = 0; life[i] = lf; s0[i] = sa; s1[i] = sb; a0[i] = op; gy[i] = ground; ox[i] = px; oz[i] = pz; alpha[i] = op; size[i] = sa;
    },
    update(dt, light) {
      live = 0;
      for (let i = 0; i < N; i++) {
        if (alpha[i] <= 0) continue;
        age[i] += dt;
        const t = age[i] / life[i];
        if (t >= 1) { alpha[i] = 0; continue; }
        live++;
        const k = Math.exp(-2.4 * dt), j = 3 * i;
        vel[j] *= k; vel[j + 2] *= k; vel[j + 1] = vel[j + 1] * k + 0.9 * dt; // drag, a little lift as it warms
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        if (pos[j + 1] < gy[i] + 0.15 && vel[j + 1] < 0) { // hits the ground: the down blast spreads out over it
          let dx = pos[j] - ox[i], dz = pos[j + 2] - oz[i]; const l = Math.hypot(dx, dz) || 1, sp = -vel[j + 1] * 0.75;
          dx /= l; dz /= l; if (l < 0.05) { const a = i * 2.39996; dx = Math.cos(a); dz = Math.sin(a); }
          vel[j] += dx * sp; vel[j + 2] += dz * sp; vel[j + 1] = 0.4; pos[j + 1] = gy[i] + 0.15;
        }
        size[i] = s0[i] + (s1[i] - s0[i]) * Math.sqrt(t);
        alpha[i] = a0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
      }
      mat.uniforms.uColor.value.setRGB(1.3, 1.34, 1.4).multiplyScalar(light);
      aPos.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- build
export function buildRoadsterModel() {
  const root = new THREE.Group(); root.name = 'PlayerRoadster';
  const body = new THREE.Group(); root.add(body);
  const M = {
    paint: new THREE.MeshStandardMaterial({ name: 'RdSteel', ...STEEL, side: THREE.DoubleSide }), // the Cybertruck's stainless
    black: new THREE.MeshStandardMaterial({ name: 'RdBlack', color: 0x101113, metalness: 0.2, roughness: 0.7 }),
    carbon: new THREE.MeshStandardMaterial({ name: 'RdCarbon', color: 0x1b1d20, metalness: 0.35, roughness: 0.38 }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'RdGlass', color: 0x020305, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.92, envMapIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 }),
    dark: new THREE.MeshPhysicalMaterial({ name: 'RdDarkGlass', color: 0x050608, metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
    tire: new THREE.MeshStandardMaterial({ name: 'RdTire', color: 0x141415, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ name: 'RdRim', color: 0x2a2c30, metalness: 0.7, roughness: 0.35 }),
    blade: new THREE.MeshStandardMaterial({ name: 'RdBlade', color: 0xa9adb3, metalness: 0.85, roughness: 0.25 }),
    bronze: new THREE.MeshStandardMaterial({ name: 'RdBronze', color: 0x9a7444, metalness: 0.9, roughness: 0.3 }),
    head: new THREE.MeshStandardMaterial({ name: 'RdHead', color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 2.4 }),
    tail: new THREE.MeshStandardMaterial({ name: 'RdTail', color: 0x400000, emissive: 0xff1010, emissiveIntensity: 1.4 }),
    ambient: new THREE.MeshBasicMaterial({ name: 'RdAmbient', color: new THREE.Color(2.2, 0.12, 0.08), toneMapped: false }),
    dash: new THREE.MeshStandardMaterial({ name: 'RdDash', color: 0x1a1b1e, roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ name: 'RdTrim', color: 0x45484e, metalness: 0.5, roughness: 0.45 }),
    carpet: new THREE.MeshStandardMaterial({ name: 'RdCarpet', color: 0x111214, roughness: 1 }),
    seat: new THREE.MeshStandardMaterial({ name: 'RdSeat', color: 0xe6e5e1, roughness: 0.55 }),
    stripe: new THREE.MeshStandardMaterial({ name: 'RdSeatStripe', color: 0x6c6f75, roughness: 0.6 }),
    skin: new THREE.MeshStandardMaterial({ name: 'RdSkin', color: 0xc28a68, roughness: 0.7 }),
    hoodie: new THREE.MeshStandardMaterial({ name: 'RdHoodie', color: 0x2c3038, roughness: 0.9 }),
    jeans: new THREE.MeshStandardMaterial({ name: 'RdJeans', color: 0x2d3d5c, roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ name: 'RdHair', color: 0x2b1e15, roughness: 0.85 }),
  };
  const add = (geo, mat, parent = body, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, x, y, z, mat, parent = body, shadow = true) => { const m = add(new THREE.BoxGeometry(w, h, d), mat, parent, shadow); m.position.set(x, y, z); return m; };

  // ---- the hull: strips between consecutive sections, both sides; the door strips go to their own lists
  const S = STATIONS.map((z, i) => section(z, i));
  const lists = new Map(), list = (k) => lists.get(k) ?? lists.set(k, triList()).get(k);
  const mir = (p, s) => [p[0] * s, p[1], p[2]];
  for (let i = 0; i < S.length - 1; i++) {
    const za = STATIONS[i], zb = STATIONS[i + 1], zm = (za + zb) / 2, arch = archD(za) < 0.45 || archD(zb) < 0.45;
    for (let j = 0; j < 7; j++) {
      const mat = stripMat(j, zm, arch), door = j >= 1 && j <= 5 && zm < WSZ && zm > CABIN_END;
      for (const s of [1, -1]) {
        const a = mir(S[i][j], s), b = mir(S[i][j + 1], s), c = mir(S[i + 1][j + 1], s), d = mir(S[i + 1][j], s);
        const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cy = (a[1] + b[1] + c[1] + d[1]) / 4, out = [cx, cy - 0.55, 0];
        const L = list(door ? `door${s}|${mat}` : mat);
        L.quad(a, b, c, d, out);
      }
    }
  }
  // end caps: the fender tips / tail fins as their own triangles (the headlights sit on them), the rest fanned
  function cap(sec, dir) {
    const L = list('paint'), out = [0, 0, dir];
    for (const s of [1, -1]) L.tri(mir(sec[1], s), mir(sec[2], s), mir(sec[3], s), out);
    const ring = [sec[0], ...[1, 3, 4, 5, 6].map((k) => sec[k]), sec[7], ...[6, 5, 4, 3, 1].map((k) => mir(sec[k], -1))];
    const c = ring.reduce((m, p) => [m[0] + p[0] / ring.length, m[1] + p[1] / ring.length, m[2] + p[2] / ring.length], [0, 0, 0]);
    for (let k = 0; k < ring.length; k++) L.tri(c, ring[k], ring[(k + 1) % ring.length], out);
  }
  cap(S[0], 1); cap(S[S.length - 1], -1);
  const MATS = { paint: M.paint, glass: M.glass, dark: M.dark, black: M.black, carbon: M.carbon };
  const doors = [];
  for (const [k, L] of lists) {
    const [grp, mat] = k.includes('|') ? k.split('|') : [null, k];
    if (grp) continue;
    const m = add(L.geometry(), MATS[mat], body, mat !== 'glass');
    if (mat === 'glass') { m.renderOrder = 2; m.userData.solo = true; m.receiveShadow = false; }
  }
  // butterfly doors: hinged on the canopy edge (the top of the side glass), swinging up and out
  for (const s of [1, -1]) {
    const A = new THREE.Vector3(s * lin(T.x1, WSZ - 0.05), lin(T.y0, WSZ - 0.05) - lin(T.d1, WSZ - 0.05), WSZ - 0.05);
    const B = new THREE.Vector3(s * lin(T.x1, -0.2), lin(T.y0, -0.2) - lin(T.d1, -0.2), -0.2);
    const axis = B.clone().sub(A).normalize();
    const hinge = new THREE.Group(); hinge.position.copy(A); hinge.userData.live = true; body.add(hinge);
    const leaf = new THREE.Group(); leaf.position.copy(A).negate(); hinge.add(leaf);
    for (const [k, L] of lists) {
      if (!k.startsWith(`door${s}|`)) continue;
      const mat = k.split('|')[1], m = add(L.geometry(), MATS[mat], leaf, mat !== 'glass');
      if (mat === 'glass') { m.renderOrder = 2; m.userData.solo = true; m.receiveShadow = false; }
    }
    // door card: dark panel, a trim strip and the red ambient line, inside the glass
    box(0.03, 0.34, 1.5, s * 0.9, 0.5, -0.05, M.dash, leaf, false);
    box(0.012, 0.02, 1.4, s * 0.88, 0.66, -0.05, M.trim, leaf, false);
    box(0.01, 0.008, 1.3, s * 0.875, 0.6, -0.05, M.ambient, leaf, false);
    box(0.006, 0.42, 0.012, s * 0.995, 0.5, WSZ - 0.02, M.black, leaf, false);           // the door's shut lines
    box(0.006, 0.4, 0.012, s * 1.0, 0.55, CABIN_END + 0.02, M.black, leaf, false);
    bakeStatic(leaf);
    // the sign that lifts the door's lower edge: the sill point must go up when turned by +a
    const p = new THREE.Vector3(s * 0.95, 0.3, 0).sub(A).applyAxisAngle(axis, 0.3).add(A);
    doors.push({ hinge, axis, sign: p.y > 0.3 ? 1 : -1, open: 0 });
  }

  // ---- nose: light bar, intake, splitter, triangular headlights at the fender tips, corner reflectors
  const n0 = S[0];
  box(1.24, 0.026, 0.03, 0, 0.487, NOSE + 0.012, M.head, body, false);
  box(1.3, 0.2, 0.1, 0, 0.37, NOSE - 0.08, M.carbon);                                  // the intake under the light bar, set in
  box(0.9, 0.04, 0.02, 0, 0.31, NOSE - 0.025, M.black, body, false);                   // its lower slot
  { // splitter: a carbon blade swept back at its corners
    const sh = new THREE.Shape([[-0.86, -0.32], [-0.62, 0.02], [0.62, 0.02], [0.86, -0.32]].map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 0.13, NOSE - 0.08);
    add(g, M.carbon);
  }
  for (const s of [1, -1]) {
    const a = mir(n0[1], s), b = mir(n0[2], s), c = mir(n0[3], s);
    const cen = [(a[0] * 2 + b[0] * 2 + c[0]) / 5, (a[1] * 2 + b[1] * 2 + c[1]) / 5, (a[2] * 2 + b[2] * 2 + c[2]) / 5]; // toward the inner edge
    const sh = (p, k, o) => [cen[0] + (p[0] - cen[0]) * k, cen[1] + (p[1] - cen[1]) * k, cen[2] + (p[2] - cen[2]) * k + o];
    const pocket = triList(); pocket.tri(sh(a, 0.66, 0.006), sh(b, 0.66, 0.006), sh(c, 0.66, 0.006), [0, 0, 1]);
    add(pocket.geometry(), M.black, body, false);                                        // a dark pocket round the lamp
    const L = triList(); L.tri(sh(a, 0.4, 0.012), sh(b, 0.4, 0.012), sh(c, 0.4, 0.012), [0, 0, 1]);
    add(L.geometry(), M.head, body, false);
    box(0.08, 0.03, 0.02, s * 0.9, 0.27, NOSE - 0.03, M.tail, body, false);
    // camera "mirrors": small stalks at the A-pillar base
    const mr = new THREE.Group(); mr.position.set(s * 0.86, 0.9, WSZ - 0.12); body.add(mr);
    box(0.1, 0.022, 0.04, s * 0.05, 0, 0, M.black, mr); box(0.04, 0.07, 0.11, s * 0.11, 0.01, 0, M.black, mr);
  }

  // ---- tail: light bars, plate, diffuser with the four gas nozzles, fins
  box(1.94, 0.11, 0.02, 0, 0.845, TAIL - 0.008, M.dark, body, false);
  box(1.86, 0.028, 0.02, 0, 0.828, TAIL - 0.02, M.tail, body, false);
  box(1.1, 0.012, 0.02, 0, 0.874, TAIL - 0.02, M.tail, body, false);
  {
    const tex = logoTexture('everlabs', { width: 1024, color: '#15161a', plate: { bg: '#f2f3ef', edge: '#202226' } }), w = 0.44, h = w * tex.userData.aspect;
    const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ name: 'RdPlate', map: tex, roughness: 0.4, metalness: 0.1 }), body, false);
    m.position.set(0, 0.64, TAIL - 0.012); m.rotation.y = Math.PI;
  }
  box(1.96, 0.035, 0.12, 0, 0.5, TAIL + 0.02, M.carbon);                              // the tail's lip over the diffuser
  box(1.7, 0.32, 0.12, 0, 0.32, TAIL + 0.18, M.black);                                 // the diffuser face, set back
  const NOZ = [-0.48, -0.16, 0.16, 0.48];
  {
    const ring = new THREE.TorusGeometry(0.056, 0.016, 8, 20), cup = new THREE.CylinderGeometry(0.05, 0.044, 0.08, 16, 1, true); cup.rotateX(Math.PI / 2);
    const disc = new THREE.CircleGeometry(0.046, 16);
    for (const x of NOZ) {
      add(ring, M.bronze, body, false).position.set(x, 0.38, TAIL + 0.03);
      add(cup, M.bronze, body, false).position.set(x, 0.38, TAIL + 0.07);
      const d = add(disc, M.black, body, false); d.position.set(x, 0.38, TAIL + 0.1); d.rotation.y = Math.PI;
    }
    // fins under the outlets: deep at the bottom, tapering up into the face
    { const sh = new THREE.Shape([[0, 0], [0.3, 0], [0.3, 0.05], [0, 0.14]].map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(0.01, 0.14, TAIL - 0.04);
      for (const x of [-0.64, -0.32, 0, 0.32, 0.64]) add(g, M.carbon, body, false).position.x = x; }
  }
  // belly nozzles (the jump and hover jets), barely seen from outside
  const BELLY = [[0.62, 1.0], [-0.62, 1.0], [0.62, -0.95], [-0.62, -0.95]];
  { const g = new THREE.CircleGeometry(0.07, 12); g.rotateX(Math.PI / 2); for (const [x, z] of BELLY) add(g, M.bronze, body, false).position.set(x, 0.125, z); }

  // ---- rear wing: rises from the deck on two stalks while airborne
  const wing = new THREE.Group(); wing.position.set(0, 0.92, -2.0); wing.userData.live = true; body.add(wing);
  {
    for (const x of [-0.34, 0.34]) { const st = box(0.03, 0.4, 0.14, x, 0.18, 0.02, M.carbon, wing); st.rotation.x = -0.18; }
    const blade = box(1.96, 0.035, 0.36, 0, 0.38, -0.02, M.paint, wing); blade.rotation.x = 0.1;
    box(1.9, 0.012, 0.05, 0, 0.395, -0.2, M.carbon, wing, false);
    for (const x of [-0.99, 0.99]) box(0.02, 0.16, 0.42, x, 0.36, -0.02, M.carbon, wing);
    bakeStatic(wing);
    wing.visible = false;
  }

  // ---- wheels: tyre, sidewalls, a dark rim face with ten twisted turbine blades
  const R = RDIM.wheelR, TW = 0.28;
  const tire = new THREE.CylinderGeometry(R - 0.01, R - 0.01, TW, 30); tire.rotateZ(Math.PI / 2);
  const side = new THREE.TorusGeometry(R - 0.065, 0.06, 6, 30); side.rotateY(Math.PI / 2);
  const face = new THREE.CylinderGeometry(0.265, 0.265, 0.03, 30); face.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.055, 0.055, 0.05, 14); hub.rotateZ(Math.PI / 2);
  const bladeG = new THREE.BoxGeometry(0.022, 0.21, 0.07); bladeG.translate(0, 0.16, 0); // five pairs of broad turbine blades
  function makeWheel(parent, sx, x = 0) {
    const h = new THREE.Group(); h.position.x = x; parent.add(h);
    add(tire, M.tire, h);
    for (const k of [1, -1]) add(side, M.tire, h, false).position.x = k * (TW / 2 - 0.03);
    const o = sx * (TW / 2 - 0.015);
    add(face, M.rim, h).position.x = o;
    add(hub, M.blade, h, false).position.x = o + sx * 0.01;
    for (let k = 0; k < 10; k++) {
      const b = add(bladeG, M.blade, h, false); b.position.x = o + sx * 0.02;
      b.rotation.set((Math.floor(k / 2) / 5 + (k % 2 ? 0.035 : -0.035)) * Math.PI * 2, sx * 0.5, 0, 'XYZ');
    }
  }
  const wheels = [[1, RDIM.wheelX], [-1, -RDIM.wheelX], [null, 0]].map(([sx, x]) => {
    const piv = new THREE.Group(); piv.position.set(x, R, sx ? WC : -WC); piv.userData.live = true; body.add(piv);
    const spin = new THREE.Group(); piv.add(spin);
    if (sx) makeWheel(spin, sx); else for (const s of [1, -1]) makeWheel(spin, s, s * RDIM.wheelX);
    bakeStatic(spin);
    return { piv, spin, front: !!sx };
  });

  // ---- interior: floor, bulkheads, the low dark dash with its red strip, the centre screen, console, seats, yoke
  const interior = new THREE.Group(); body.add(interior);
  const screen = makeScreen();
  const ib = (w, h, d, x, y, z, mat, parent = interior) => box(w, h, d, x, y, z, mat, parent, false);
  const limb = (p0, p1, r, mat, parent = interior) => {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), m = add(new THREE.CapsuleGeometry(r, Math.max(0.001, a.distanceTo(b)), 4, 10), mat, parent, false);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return m;
  };
  let yokeBase, yoke;
  {
    ib(1.5, 0.02, 1.95, 0, 0.2, -0.05, M.carpet);
    ib(1.5, 0.5, 0.04, 0, 0.45, 1.02, M.dash);                 // footwell front
    ib(1.6, 0.86, 0.04, 0, 0.62, CABIN_END + 0.01, M.dash);   // the bulkhead behind the seats
    ib(1.5, 0.12, 0.42, 0, 0.68, 0.78, M.dash);               // the low dash under the windshield
    ib(1.46, 0.016, 0.01, 0, 0.66, 0.565, M.ambient);         // red ambient strip along its face
    ib(1.46, 0.012, 0.36, 0, 0.745, 0.8, M.carbon);           // dash top
    ib(0.26, 0.24, 1.5, 0, 0.33, -0.15, M.dash);              // tunnel / console
    ib(0.22, 0.015, 0.9, 0, 0.455, 0.05, M.trim);
    ib(0.02, 0.004, 1.2, 0.12, 0.45, -0.1, M.ambient); ib(0.02, 0.004, 1.2, -0.12, 0.45, -0.1, M.ambient);
    for (const s of [1, -1]) ib(0.08, 0.5, 1.9, s * 0.86, 0.42, -0.05, M.dash); // sills inside
    // sport seats: low cushion, high side bolsters, a reclined back with wings, integrated headrest, grey stripes
    for (const s of [1, -1]) {
      const seat = new THREE.Group(); seat.position.set(s * 0.4, 0.24, -0.38); interior.add(seat);
      ib(0.46, 0.08, 0.5, 0, 0.04, 0.08, M.seat, seat);
      ib(0.14, 0.05, 0.46, 0, 0.09, 0.08, M.stripe, seat);
      for (const k of [1, -1]) { const b = ib(0.08, 0.12, 0.48, k * 0.21, 0.1, 0.08, M.seat, seat); b.rotation.z = k * 0.25; }
      const back = new THREE.Group(); back.position.set(0, 0.06, -0.18); back.rotation.x = -0.32; seat.add(back);
      ib(0.44, 0.62, 0.09, 0, 0.31, 0, M.seat, back);
      ib(0.14, 0.5, 0.02, 0, 0.3, 0.05, M.stripe, back);
      for (const k of [1, -1]) { const w = ib(0.08, 0.5, 0.16, k * 0.21, 0.28, 0.04, M.seat, back); w.rotation.y = -k * 0.3; }
      ib(0.26, 0.14, 0.1, 0, 0.66, 0.0, M.seat, back);
    }
    // centre screen on the dash, turned toward the driver
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.187), new THREE.MeshBasicMaterial({ map: screen.tex, color: new THREE.Color(1.4, 1.4, 1.4) }));
    const sg = new THREE.Group(); sg.userData.live = true; sg.position.set(0.03, 0.82, 0.5); sg.rotation.set(0.3, Math.PI - 0.22, 0); interior.add(sg); sg.add(sc);
    box(0.335, 0.2, 0.016, 0, 0, -0.01, M.black, sg, false);
    ib(0.05, 0.1, 0.05, 0.03, 0.74, 0.54, M.black);
    // the yoke: two grips and a lower bar round a dark hub, on a column into the dash
    yokeBase = new THREE.Group(); yokeBase.userData.live = true; yokeBase.position.set(0.4, 0.645, 0.25); yokeBase.rotation.x = 0.5; interior.add(yokeBase);
    yoke = new THREE.Group(); yokeBase.add(yoke);
    for (const k of [1, -1]) limb([k * 0.15, -0.06, 0], [k * 0.15, 0.07, 0], 0.024, M.seat, yoke);
    limb([-0.15, -0.075, 0], [0.15, -0.075, 0], 0.016, M.black, yoke);
    for (const k of [1, -1]) limb([k * 0.04, -0.01, 0], [k * 0.15, 0.02, 0], 0.014, M.black, yoke);
    { const g = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 18); g.rotateX(Math.PI / 2); add(g, M.dash, yoke, false).position.z = -0.01; }
    limb([0.4, 0.635, 0.28], [0.4, 0.6, 0.62], 0.035, M.dash);
  }
  // ---- driver: low seat, legs out, arms to the grips (re-solved as the yoke turns)
  const driver = new THREE.Group(); interior.add(driver);
  const head = new THREE.Group(); head.userData.live = true; head.position.set(0.4, 0.94, -0.37); driver.add(head);
  const L1 = 0.3, L2 = 0.28;
  const arms = [];
  {
    limb([0.4, 0.42, -0.5], [0.4, 0.74, -0.42], 0.12, M.hoodie, driver).scale.set(1.3, 1, 0.8);   // torso, reclined
    limb([0.23, 0.79, -0.42], [0.57, 0.79, -0.42], 0.065, M.hoodie, driver);
    limb([0.32, 0.36, -0.38], [0.48, 0.36, -0.38], 0.095, M.jeans, driver);
    limb([0.4, 0.82, -0.4], [0.4, 0.88, -0.38], 0.042, M.skin, driver);
    const skull = add(new THREE.SphereGeometry(0.1, 14, 10), M.skin, head, false); skull.scale.set(0.92, 1.12, 1);
    const hair = add(new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), M.hair, head, false); hair.position.set(0, 0.022, -0.012); hair.scale.set(0.93, 1.1, 1.02);
    ib(0.15, 0.032, 0.02, 0, 0.02, 0.092, M.black, head);
    for (const k of [1, -1]) {
      const x = 0.4 + k * 0.1, kx = 0.4 + k * 0.11;
      limb([x, 0.36, -0.34], [kx, 0.46, 0.12], 0.07, M.jeans, driver);
      limb([kx, 0.46, 0.12], [kx + k * 0.01, 0.28, 0.62], 0.054, M.jeans, driver);
      ib(0.1, 0.07, 0.24, kx + k * 0.01, 0.25, 0.7, M.black, driver);
    }
    const up = new THREE.CapsuleGeometry(0.042, L1, 4, 10), fore = new THREE.CapsuleGeometry(0.034, L2, 4, 10), palm = new THREE.SphereGeometry(0.044, 10, 8);
    for (const sh of [new THREE.Vector3(0.58, 0.79, -0.42), new THREE.Vector3(0.22, 0.79, -0.42)]) {
      const a = { sh, up: add(up, M.hoodie, driver, false), fore: add(fore, M.hoodie, driver, false), hand: add(palm, M.skin, driver, false), side: sh.x > 0.4 ? 1 : -1 };
      a.hand.scale.set(0.9, 1.1, 0.8); for (const m of [a.up, a.fore, a.hand]) m.userData.live = true; arms.push(a);
    }
  }
  const _h = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const bone = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, _d.subVectors(b, a).normalize()); };
  function poseArms() { // hands on the grips (they turn with the yoke), two-bone arms, elbows out and down
    yokeBase.updateMatrix(); yoke.updateMatrix();
    for (const a of arms) {
      _h.set(a.side * 0.15, 0.01, -0.02).applyMatrix4(yoke.matrix).applyMatrix4(yokeBase.matrix);
      const d = Math.min(a.sh.distanceTo(_h), L1 + L2 - 0.005), dir = _d.subVectors(_h, a.sh).normalize();
      const k = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, L1 * L1 - k * k));
      _p.set(a.side * 0.8, -1, -0.1); _p.addScaledVector(dir, -_p.dot(dir)).normalize();
      _e.copy(a.sh).addScaledVector(dir, k).addScaledVector(_p, hgt);
      _h.copy(a.sh).addScaledVector(dir, d);
      bone(a.up, a.sh, _e); bone(a.fore, _e, _h); a.hand.position.copy(_h);
    }
  }
  poseArms();
  bakeStatic(interior, { receiveShadow: false });
  bakeStatic(head); bakeStatic(yoke);
  interior.userData.live = true;

  bakeStatic(body);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  // ---- gas jets: pale additive cones out of the belly and rear nozzles (length by thrust), puffs below
  const jetTex = gradTex([[0, 'rgba(160,200,255,0)'], [0.7, 'rgba(210,235,255,0.4)'], [1, 'rgba(255,255,255,0.9)']]); // v 1 = the apex at the nozzle
  const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, color: new THREE.Color(1.6, 1.7, 1.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const jets = [];
  {
    const cone = new THREE.ConeGeometry(0.32, 1, 14, 1, true); cone.translate(0, -0.5, 0); // apex at the nozzle (y 0), opening down
    for (const [x, z] of BELLY) { const m = new THREE.Mesh(cone, jetMat); m.position.set(x, 0.12, z); m.userData.live = true; m.renderOrder = 10; m.visible = false; m.frustumCulled = false; body.add(m); jets.push({ m, down: true }); }
    for (const x of NOZ) { const m = new THREE.Mesh(cone, jetMat); m.position.set(x, 0.38, TAIL + 0.05); m.rotation.x = Math.PI / 2; m.userData.live = true; m.renderOrder = 10; m.visible = false; m.frustumCulled = false; body.add(m); jets.push({ m, down: false }); }
  }

  // ---------------------------------------------------------------- gas puffs
  const fx = createGasFx();
  const NZ = {
    belly: BELLY.map(([x, z]) => new THREE.Vector3(x, 0.14, z)),
    rear: NOZ.map((x) => new THREE.Vector3(x, 0.38, TAIL - 0.02)),
    vent: [[0.98, 0.3, 0.95], [-0.98, 0.3, 0.95], [0.98, 0.32, -0.95], [-0.98, 0.32, -0.95]].map((p) => new THREE.Vector3(...p)),
  };
  const _w = new THREE.Vector3(), _dir = new THREE.Vector3(), _side = new THREE.Vector3();
  const rnd = (a) => (Math.random() * 2 - 1) * a;
  let accDown = 0, accRear = 0, accVent = 0;
  function emit(dt, st) {
    const W = body.matrixWorld, vel = st.velocity || { x: 0, y: 0, z: 0 }, gy = Number.isFinite(st.groundY) ? st.groundY : -1e3;
    // the jump: one blast from the belly that hits the ground and rolls out
    if (st.burst > 0) {
      const n = Math.round(70 + 170 * st.burst);
      for (let i = 0; i < n; i++) {
        _w.copy(NZ.belly[i & 3]).applyMatrix4(W);
        const sp = 14 + 12 * st.burst;
        fx.emit(_w.x + rnd(0.2), _w.y, _w.z + rnd(0.2), rnd(3) + vel.x * 0.2, -sp * (0.6 + Math.random() * 0.5), rnd(3) + vel.z * 0.2,
          1.1 + Math.random() * 1.2, 0.3, 2.2 + 1.6 * st.burst, 0.5, gy);
      }
    }
    // hover / balance jets: a steady stream down
    accDown += dt * 220 * st.gasDown;
    _dir.set(0, -1, 0).transformDirection(W);
    while (accDown >= 1) {
      accDown--;
      _w.copy(NZ.belly[(Math.random() * 4) | 0]).applyMatrix4(W);
      const sp = 14 + 10 * st.gasDown, j = Math.random() * dt; // spread over the frame, so the stream has no gaps
      fx.emit(_w.x + _dir.x * sp * j, _w.y + _dir.y * sp * j, _w.z + _dir.z * sp * j, _dir.x * sp + rnd(1.5) + vel.x * 0.6, _dir.y * sp + vel.y * 0.6, _dir.z * sp + rnd(1.5) + vel.z * 0.6,
        0.6 + Math.random() * 0.5, 0.15, 1.5, 0.26, gy);
    }
    // forward thrust: the four rear nozzles
    accRear += dt * 200 * st.gasRear;
    _dir.set(0, 0, -1).transformDirection(W);
    while (accRear >= 1) {
      accRear--;
      _w.copy(NZ.rear[(Math.random() * 4) | 0]).applyMatrix4(W);
      const sp = 16 + 10 * st.gasRear, j = Math.random() * dt;
      fx.emit(_w.x + _dir.x * sp * j, _w.y + _dir.y * sp * j, _w.z + _dir.z * sp * j, _dir.x * sp + rnd(0.8) + vel.x * 0.7, _dir.y * sp + rnd(0.8) + vel.y * 0.7, _dir.z * sp + rnd(0.8) + vel.z * 0.7,
        0.45 + Math.random() * 0.4, 0.1, 1.2, 0.3, gy);
    }
    // charging: pressure bleeds from the sill vents and the belly, more and faster as it builds
    accVent += dt * (st.charge > 0.005 ? 20 + 110 * st.charge : 0);
    while (accVent >= 1) {
      accVent--;
      const k = (Math.random() * 4) | 0;
      _w.copy(k < 2 || Math.random() < 0.5 ? NZ.vent[k] : NZ.belly[k]).applyMatrix4(W);
      _side.set(Math.sign(NZ.vent[k].x) * (2 + 4 * st.charge), -1 - 2 * st.charge, rnd(1)).transformDirection(W).multiplyScalar(2 + 4 * st.charge);
      fx.emit(_w.x, _w.y, _w.z, _side.x + rnd(0.6) + vel.x * 0.8, _side.y, _side.z + rnd(0.6) + vel.z * 0.8, 0.4 + Math.random() * 0.5, 0.08, 0.5 + 0.6 * st.charge, 0.16 + 0.24 * st.charge, gy);
    }
  }

  // ---------------------------------------------------------------- per-frame pose
  let time = 0, dispT = 0, glassIn = false, wingK = 0, doorK = 0, blastK = 0;
  function set(st, dt) {
    time += dt;
    body.position.y = st.heave || 0;
    body.rotation.set(-(st.bodyPitch || 0), 0, st.bodyRoll || 0, 'YXZ');
    for (const w of wheels) { w.piv.rotation.y = w.front ? st.steer : 0; w.spin.rotation.x = st.wheelAngle; }
    yoke.rotation.z = clamp(-st.steer * 4, -1.7, 1.7);
    if (interior.visible) poseArms();
    head.visible = !st.cockpit;
    // rear wing: up while airborne, down on the road
    wingK = clamp(wingK + dt * (st.air ? 2.2 : -1.4), 0, 1);
    wing.visible = wingK > 0.01;
    if (wing.visible) { const k = smooth(wingK); wing.position.y = lerp(0.62, 0.92, k); wing.scale.set(1, lerp(0.3, 1, k), 1); }
    // butterfly doors: open while parked in the chase view
    doorK = clamp(doorK + dt * (st.parked && !st.cockpit ? 0.8 : -2.2), 0, 1);
    for (const d of doors) d.hinge.quaternion.setFromAxisAngle(d.axis, d.sign * 1.15 * smooth(doorK));
    M.tail.emissiveIntensity = st.brake ? 4.5 : 1.4;
    M.head.emissiveIntensity = st.night ? 3.6 : 2.4;
    if (glassIn !== !!st.cockpit) {
      glassIn = !!st.cockpit;
      Object.assign(M.glass, glassIn ? { opacity: 0.12, clearcoat: 0.12, envMapIntensity: 0.3 } : { opacity: 0.92, clearcoat: 1, envMapIntensity: 0.6 });
    }
    dispT -= dt; if (dispT <= 0 && st.cockpit) { dispT = 1 / 15; screen.draw(st); }
    // jets: the belly cones by the lift thrust (a long flash on the jump), the rear ones by the forward thrust
    if (st.burst > 0) blastK = 0.25 + 0.75 * st.burst;
    blastK = Math.max(0, blastK - dt * 2.5);
    for (const j of jets) {
      const k = j.down ? Math.max(st.gasDown || 0, blastK) : st.gasRear || 0, on = k > 0.03;
      j.m.visible = on;
      if (on) {
        const fl = 0.85 + 0.15 * Math.sin(time * 61 + j.m.position.x * 9), r = j.down ? 0.45 + 0.6 * k : 0.3 + 0.25 * k;
        j.m.scale.set(r, (0.5 + (j.down ? 2.4 : 1.8) * k) * fl, r);
      }
    }
    // gas: emit from this frame's pose, then age the puffs
    if (fx.object.parent) {
      (root.parent ?? root).updateMatrixWorld(true); // car.js posed the car's node this frame
      if (st.burst > 0 || st.gasDown > 0.01 || st.gasRear > 0.01 || st.charge > 0.005) emit(dt, st);
      fx.update(dt, st.light ?? 1);
    }
  }
  return { object: root, body, set, eye: EYE.clone(), interior, driver, materials: M, fx: fx.object, gas: fx };
}
