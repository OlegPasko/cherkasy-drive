// OWNER: cherkasy. Стела з гербом України on the Velyke kolo roundabout, pl. Peremohy (vul. Smilianska, prosp. Peremohy
// and prosp. Khimikiv; OSM node 9273188656 «Герб України», tourism=artwork, height 11 m; issue #24). Unveiled on
// 23 August 2017, the Day of the State Flag, in place of the 1970s Soviet stele at the entrance from Smila (vycherpno.ck.ua,
// 2017: 11 m in all, the arms 8.2 m by 6 m, five tonnes). Built after those photos and the Wikimedia Commons view from
// above (2019): two tall white pylons with slanted tops and a row of small triangular fins down their outer edges, joined
// at the foot by a deep lintel on short legs; between them the shield – blue with fine horizontal ribs, a gold rim and
// the gold tryzub – under a band of red-and-white embroidery with the blue-and-yellow flag in its middle. It stands a
// little off the island's centre among blue spruces, its face toward prosp. Peremohy. At night it is washed in blue
// light and the shield glows.
//   GERB_SKIP: empty (no OSM building is replaced)
//   buildGerb({ root, geo, solids, heightAt }) -> { update(), clear(x, z), spots } | null
//     clear: the roundabout's island is an open lawn (no generated trees); spots: the blue spruces by the stele
// The site frame: local +z = the way the shield faces, local +x = its right as seen from the front, y up from the
// ground at the node.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE } from '../trees.js';
import { canvasTex } from './sculpt.js';
import { floodlit } from './bohdan.js';

export const GERB_SKIP = new Set();

const LL = [49.4152526, 32.0306315];   // the OSM node
const FACE = [49.415889, 32.0294355];  // where prosp. Peremohy enters the roundabout: the shield faces it
const RING = [49.4152046, 32.0306492, 42]; // the roundabout's centre and its island's radius: an open lawn, no generated trees
const H = 11;                           // the pylons' outer top
const PY = { x: 3.2, hw: 0.45, hd: 0.6, inner: 10.1 };  // pylon centre offset, half width / depth, inner top height
const LINTEL = { y0: 1.15, y1: 2.35, hd: 0.55, over: 0.35 };
const SH = { w: 5.2, h: 6.0, y0: 2.5, t: 0.16 };        // the shield: width, height (point to top), its point's height, half thickness
const BAND = { y0: 8.7, y1: 9.75, hd: 0.2 };
const C = { white: '#eceeef', grey: '#c9ccce', gold: '#e2b23a', plinth: '#8e8c87' };

// the shield outline in its own metres (x across, y up from the point), flat top, round-pointed bottom
function shieldRing(n = 14) {
  const { w, h } = SH, sy = h * 0.42, cy = 0.06 * h, left = [[-w / 2, h], [-w / 2, sy]];
  for (let k = 1; k < n; k++) { const f = k / n, a = 1 - f; left.push([-w / 2 * (a * a + 2 * a * f), sy * a * a + 2 * a * f * cy]); } // a quadratic curve to the point
  return [...left, [0, 0], ...left.slice().reverse().map(([x, y]) => [-x, y])];
}

// the tryzub on a 1000 x 1000 grid (y down), gold
function tryzub(g, gold) {
  g.fillStyle = gold; g.strokeStyle = gold; g.lineJoin = 'miter';
  const mirror = (fn) => { fn(1); g.save(); g.translate(1000, 0); g.scale(-1, 1); fn(-1); g.restore(); };
  mirror(() => {
    // the outer prong: a tall bar with a pointed top bent inward
    g.beginPath(); g.moveTo(180, 640); g.lineTo(180, 150); g.lineTo(210, 50); g.lineTo(275, 160); g.lineTo(242, 160); g.lineTo(242, 640); g.closePath(); g.fill();
    // the bowl from its foot round to the centre
    g.beginPath(); g.moveTo(180, 620); g.quadraticCurveTo(180, 830, 500, 830); g.lineTo(500, 772); g.quadraticCurveTo(242, 772, 242, 620); g.closePath(); g.fill();
    // the inner arm: from the stem's foot up and out to a barbed point
    g.lineWidth = 50; g.beginPath(); g.moveTo(492, 650); g.quadraticCurveTo(350, 615, 350, 330); g.stroke();
    g.beginPath(); g.moveTo(350, 215); g.lineTo(390, 340); g.lineTo(310, 340); g.closePath(); g.fill();
    // the tooth on the outer prong, pointing in
    g.beginPath(); g.moveTo(242, 410); g.lineTo(310, 465); g.lineTo(242, 505); g.closePath(); g.fill();
  });
  // the middle prong: a spear down the axis, the foot below the bowl
  g.beginPath(); g.moveTo(500, 20); g.lineTo(560, 180); g.lineTo(530, 205); g.lineTo(530, 790); g.lineTo(470, 790); g.lineTo(470, 205); g.lineTo(440, 180); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(500, 800); g.lineTo(550, 870); g.lineTo(500, 975); g.lineTo(450, 870); g.closePath(); g.fill();
  g.fillRect(420, 858, 160, 34);
}
const shieldTex = () => canvasTex(520, 600, (g, w, h) => {
  const ring = shieldRing(24).map(([x, y]) => [(x / SH.w + 0.5) * w, (1 - y / SH.h) * h]);
  g.fillStyle = '#d9a52c'; g.fillRect(0, 0, w, h);
  const path = (inset) => { g.beginPath(); const c = [w / 2, h * 0.45]; ring.forEach(([x, y], i) => { const px = c[0] + (x - c[0]) * inset, py = c[1] + (y - c[1]) * inset; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); };
  path(0.95); g.fillStyle = '#1557b0'; g.fill();
  g.save(); path(0.95); g.clip();
  for (let y = 0; y < h; y += 7) { g.fillStyle = 'rgba(160,200,255,0.22)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(0,20,60,0.18)'; g.fillRect(0, y + 3, w, 2); }
  g.restore();
  g.save(); g.translate(w * 0.5 - 0.42 * 500, h * 0.07); g.scale(0.42, 0.47); tryzub(g, '#f2c64a'); g.restore();
}, { repeat: false });
const bandTex = () => canvasTex(1024, 192, (g, w, h) => {
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
  // cross-stitch: red diamonds with black hearts in rows, bordered
  const cell = 12;
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    const i = Math.round(x / cell), j = Math.round(y / cell), mi = i % 16, mj = j % 16;
    const d = Math.abs(mi - 8) + Math.abs(mj - 8);
    if (d === 6 || d === 3 || (d < 2) || j === 0 || j === 15 || (j === 1 && i % 2) || (j === 14 && i % 2)) { g.fillStyle = d < 2 ? '#1c1c1c' : '#c3232b'; g.fillRect(x + 1, y + 1, cell - 2, cell - 2); }
  }
  // the flag in the middle
  const fw = 300, fx = (w - fw) / 2;
  g.fillStyle = '#fff'; g.fillRect(fx - 8, 6, fw + 16, h - 12);
  g.fillStyle = '#1557b0'; g.fillRect(fx, 12, fw, (h - 24) / 2);
  g.fillStyle = '#f7cf2a'; g.fillRect(fx, 12 + (h - 24) / 2, fw, (h - 24) / 2);
}, { repeat: false });

export function buildGerb({ root, geo, solids: S, heightAt }) {
  if (!geo) return null;
  const t0 = performance.now();
  const [ox, oz] = geo.toXZ(...LL), [fx, fz] = geo.toXZ(...FACE), [rx, rz] = geo.toXZ(RING[0], RING[1]);
  const YAW = Math.atan2(fx - ox, fz - oz); // local +z toward FACE
  const sy = Math.sin(YAW), cy = Math.cos(YAW);
  const W = (a, d) => [ox + a * cy + d * sy, oz - a * sy + d * cy]; // local (x, z) -> world
  const ang = Math.atan2(-sy, cy);                                 // local +x as an obox angle
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 30; };
  const Y0 = Math.min(...[[-4, -1], [4, -1], [-4, 1], [4, 1], [0, 0]].map(([a, d]) => g(...W(a, d)))) + 0.15;
  const P = M4(ox, Y0, oz, YAW);
  const B = { white: new MB(), gold: new MB(), plinth: new MB() };
  const box = (a, d, ha, hd, y0, y1, kind = 'wall') => { const [x, z] = W(a, d); return S.obox(x, z, ha, hd, ang, Y0 + y0, Y0 + y1, kind); };

  // ---------------------------------------------------------------- the plinth: a low grey slab round the foot
  B.plinth.setColor(C.plinth).with(P, (q) => q.box(-4.4, -0.6, -1.5, 4.4, 0.2, 1.5, 1 | 2 | 4 | 16 | 32));
  box(0, 0, 4.4, 1.5, -0.6, 0.2, 'ledge');

  // ---------------------------------------------------------------- the pylons, slanted tops, fins down the outside
  B.white.setColor(C.white).with(P, (q) => {
    for (const sg of [-1, 1]) {
      const xi = sg * (PY.x - PY.hw), xo = sg * (PY.x + PY.hw), d = PY.hd;
      const lo = 0.2, pt = (x, top, z) => [x, top, z];
      // the four walls and the slanted top (outer edge high, inner low)
      const yi = PY.inner, yo = H;
      const c = { fi: [xi, lo, d], fo: [xo, lo, d], bi: [xi, lo, -d], bo: [xo, lo, -d] };
      const T = { fi: pt(xi, yi, d), fo: pt(xo, yo, d), bi: pt(xi, yi, -d), bo: pt(xo, yo, -d) };
      q.face([c.fi, c.fo, T.fo, T.fi], [0, 0, 1]);
      q.face([c.bo, c.bi, T.bi, T.bo], [0, 0, -1]);
      q.face([c.fo, c.bo, T.bo, T.fo], [sg, 0, 0]);
      q.face([c.bi, c.fi, T.fi, T.bi], [-sg, 0, 0]);
      q.face([T.fi, T.fo, T.bo, T.bi]);
      // the fins: small triangular blades along the outer face, pointing up and out
      for (let k = 0; k < 7; k++) {
        const y = 2.9 + k * 0.95, ax = xo, bx = xo + sg * 0.42;
        for (const z0 of [0.25, -0.25]) q.face([[ax, y, z0], [bx, y + 0.7, z0], [ax, y + 0.75, z0]], [0, 0, Math.sign(z0)]);
        q.face([[ax, y, 0.25], [bx, y + 0.7, 0.25], [bx, y + 0.7, -0.25], [ax, y, -0.25]]);
        q.face([[bx, y + 0.7, 0.25], [ax, y + 0.75, 0.25], [ax, y + 0.75, -0.25], [bx, y + 0.7, -0.25]]);
      }
      box(sg * PY.x, 0, PY.hw, PY.hd, 0.2, (yi + yo) / 2, 'pole');
    }
    // the lintel on the pylons' legs, a little proud of them all round
    const xl = PY.x + PY.hw + LINTEL.over;
    q.setColor(C.grey).box(-xl, LINTEL.y0, -LINTEL.hd - 0.08, xl, LINTEL.y1, LINTEL.hd + 0.08);
    // the band's frame and the shield's backing rails
    q.setColor(C.white).box(-(PY.x - PY.hw), BAND.y0 - 0.12, -BAND.hd - 0.05, PY.x - PY.hw, BAND.y0, BAND.hd + 0.05);
    q.box(-(PY.x - PY.hw), BAND.y1, -BAND.hd - 0.05, PY.x - PY.hw, BAND.y1 + 0.12, BAND.hd + 0.05);
    q.box(-0.12, LINTEL.y1, -0.12, 0.12, SH.y0 + 0.3, 0.12); // the post under the shield's point
  });
  box(0, 0, PY.x + PY.hw + LINTEL.over, LINTEL.hd + 0.08, LINTEL.y0, LINTEL.y1);
  box(0, 0, PY.x - PY.hw, SH.t + 0.1, SH.y0, BAND.y1 + 0.12);

  // ---------------------------------------------------------------- the shield: a gold-rimmed slab, faces textured
  const ring = shieldRing(18);
  B.gold.setColor(C.gold).with(P, (q) => {
    for (let k = 0; k < ring.length; k++) { // the rim
      const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length], l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-4) continue;
      const n = [(by - ay) / l, -(bx - ax) / l, 0];
      q.face([[ax, SH.y0 + ay, -SH.t], [bx, SH.y0 + by, -SH.t], [bx, SH.y0 + by, SH.t], [ax, SH.y0 + ay, SH.t]], n);
    }
  });
  const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
  const faceGeo = (z, flip) => {
    const geo2 = new THREE.ShapeGeometry(shape, 1);
    const pos = geo2.attributes.position, uv = geo2.attributes.uv;
    // the back is mirrored in x, which also turns its winding to face -z; the uv keep the picture the right way round
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); uv.setXY(i, x / SH.w + 0.5, y / SH.h); pos.setXYZ(i, flip ? -x : x, y + SH.y0, z); }
    const nn = geo2.attributes.normal;
    for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 0, flip ? -1 : 1);
    return geo2;
  };

  // ---------------------------------------------------------------- the meshes
  const group = Object.assign(new THREE.Group(), { name: 'gerb' });
  group.position.set(ox, Y0, oz); group.rotation.y = YAW;
  root.add(group);
  const flood = [];
  for (const sz of [1, -1]) for (const a of [-2.6, 2.6]) { const [x, z] = W(a, sz * 5); flood.push([x, Y0 + 0.4, z]); }
  const M = {
    white: floodlit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x3d6dff, emissiveIntensity: 0 }), flood, 16, 'gerb'),
    gold: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6, emissive: 0xffc860, emissiveIntensity: 0 }),
    plinth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    root.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'gerb-' + k, castShadow: true, receiveShadow: true }));
  }
  const sTex = shieldTex(), bTex = bandTex();
  const sMat = new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.4, metalness: 0.2, emissive: 0xffffff, emissiveMap: sTex, emissiveIntensity: 0 });
  const bMat = new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.6, emissive: 0xffffff, emissiveMap: bTex, emissiveIntensity: 0 });
  group.add(Object.assign(new THREE.Mesh(faceGeo(SH.t + 0.005, false), sMat), { name: 'gerb-shield', castShadow: true }));
  group.add(Object.assign(new THREE.Mesh(faceGeo(-SH.t - 0.005, true), sMat), { name: 'gerb-shield-back' }));
  const bw = 2 * (PY.x - PY.hw), bh = BAND.y1 - BAND.y0;
  for (const sz of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bMat);
    m.position.set(0, (BAND.y0 + BAND.y1) / 2, sz * BAND.hd); if (sz < 0) m.rotation.y = Math.PI;
    group.add(Object.assign(m, { name: 'gerb-band' }));
  }
  const slab = new MB().setColor('#d7d9db').with(new THREE.Matrix4(), (q) => q.box(-bw / 2, BAND.y0, -BAND.hd + 0.01, bw / 2, BAND.y1, BAND.hd - 0.01, 1 | 2));
  group.add(Object.assign(new THREE.Mesh(slab.build(), M.plinth), { name: 'gerb-band-ends' }));
  nV += slab.v + 2 * 60;

  // blue spruces on the island round it, as in the photos (two by the left pylon, one behind)
  const spots = [];
  for (const [a, d, sc] of [[-7.5, 2.5, 0.9], [-9.5, -1.5, 0.75], [-6.5, -4.5, 0.8], [8, -3.5, 0.7], [11, 3.5, 0.65]]) {
    const [x, z] = W(a, d); spots.push({ x, z, kind: 'conifer', variant: 'spruce', sc, pal: PARK_PINE, s3: [0.6, 1.1, 0.6] });
  }
  console.log(`[cherkasy] coat-of-arms stele: ${H} m, shield ${SH.w}x${SH.h} m, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    spots,
    clear: (x, z) => Math.hypot(x - rx, z - rz) < RING[2],
    update() {
      const k = Math.min(1, 3 * nightK.value);
      M.white.emissiveIntensity = 0.55 * k; sMat.emissiveIntensity = 0.35 * k; bMat.emissiveIntensity = 0.3 * k; M.gold.emissiveIntensity = 0.12 * k;
    },
  };
}
