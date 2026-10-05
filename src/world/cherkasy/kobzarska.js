// OWNER: cherkasy. Кобзарська вулиця, the former Монастирська (quest card `kobzarska`): the Pokrova Old Believer
// convent that named the street (from 1893) is gone; a school was built on its site early in the 20th century –
// Черкаська ЗОШ №15 (Wikipedia, «Покровський старообрядницький жіночий монастир»), founded 1906 for the workers of the
// Tereshchenko sugar refinery (school15.ck.ua), today at Кобзарська 77. Built here:
//   - the school's main building (OSM relation 6775690): three storeys of cream render round an inner yard, wide
//     windows in brown frames, a flat roof behind a parapet; on the street front the two upper storeys of the entrance
//     block stand forward on dusty-pink columns over the glazed vestibule and carry the swallows mural (from the
//     school's own photo and site header), a broad flight of steps up to the doors;
//   - «Старий корпус» (OSM 401155172) behind it, two storeys of old red brick with arched windows (a guess: no photo);
//   - a small heritage street sign «вул. Монастирська» on a cast-iron post at the card's spot on Кобзарська, where
//     the street's west end meets провулок Черняховського.
//   KOBZARSKA_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildKobzarska({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, spots } | null
//     spots: { sign: [x, z], mural: [x, z] (the middle of the mural's foot), base, eave } (tests)
// Walls are bay-atlas quads (bayatlas.js): school bays in rows 0-2, the old brick building's in rows 3-4; the mural
// and the sign are their own small canvases.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, bboxOf, inPoly, area2 } from './geo.js';
import { ringFaces, box, quad, at, finish } from './slabkit.js';
import { bayAtlas, band, blockBase, brickTex, brickRows } from './bayatlas.js';
import { OVERHANG } from '../collision.js';

const SCHOOL = 6775690, OLD = 401155172;
export const KOBZARSKA_SKIP = new Set([SCHOOL, OLD]);

const FH = 3.6, A0 = { fh: FH, cols: 4, rows: 5 };
const KIND = { school: { r0: 0, nk: 3, bay: 3.3 }, old: { r0: 3, nk: 2, bay: 3.6 } };
const PORCH = 3.0;                                // the entrance block's upper storeys stand this far forward
const PORCH_AT = [132.7, 3884.7];                 // the west end of its street face (OSM ring corner 8)
const SIGN = [-1284, 3830.6];                     // on the north verge of Кобзарська, facing the road (+z)

function cell(r) {
  return (g, x, y, w, h, i, j) => {
    if (j < 3) {
      // cream render, a wide window in brown frames (a transom, three lights), a pale band at the floor
      g.fillStyle = '#efdfbd'; g.fillRect(x, y, w, h);
      for (let k = 0; k < 50; k++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(90,70,40,0.05)'; g.fillRect(x + r() * w, y + r() * h, 3, 2); }
      g.fillStyle = '#efe6d0'; g.fillRect(x, y + h - 6, w, 6);
      const ww = w * 0.7, wh = h * 0.5, wx = x + (w - ww) / 2, wy = y + h * 0.24;
      g.fillStyle = '#9c5c48'; g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      g.fillStyle = r() < 0.5 ? '#56656e' : '#4a5860'; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(200,215,225,0.25)'; g.fillRect(wx, wy, ww, wh * 0.35);
      g.fillStyle = '#9c5c48';
      for (const t of [0.2, 0.4, 0.6, 0.8]) g.fillRect(wx + ww * t - 1, wy, 2, wh);
      g.fillRect(wx, wy + wh * 0.28, ww, 3);
      g.fillStyle = '#d9cfb8'; g.fillRect(wx - 5, wy + wh + 3, ww + 10, 3);
      return [[wx, wy, ww, wh]];
    }
    // old red brick, a tall window under a segmental arch, white frames
    brickRows(g, x, y, w, h, r() < 0.5 ? '#9b4f3a' : '#a65841', r);
    g.fillStyle = 'rgba(220,170,140,0.5)'; g.fillRect(x, y + h - 6, w, 5);
    const ww = w * 0.36, wh = h * 0.56, wx = x + (w - ww) / 2, wy = y + h * 0.2;
    g.fillStyle = '#b8694d'; g.beginPath(); g.ellipse(wx + ww / 2, wy + 2, ww / 2 + 5, 10, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#f0eee8'; g.beginPath(); g.ellipse(wx + ww / 2, wy + 2, ww / 2, 7, 0, Math.PI, 0); g.fill(); g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#4e5a61'; g.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
    g.fillStyle = '#f0eee8'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); g.fillRect(wx, wy + wh * 0.3, ww, 3);
    return [[wx, wy, ww, wh]];
  };
}

// the swallows: a flock of long-winged birds in navy, violet and rust sweeping right to left over cream
function muralTex(r) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#ebe2cc'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 1; k < 8; k++) g.fillRect((w * k) / 8, 0, 2, h);
    const bird = (x, y, s, a) => {
      g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
      for (const [col, wd, dy] of [['#1f2a52', 11, 0], ['#3c5a9a', 6, -3], ['#7b5c96', 3.5, -5], ['#c0703f', 1.5, -7]]) {
        g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, dy); g.quadraticCurveTo(-40, -50 + dy, -110, -70 + dy); g.stroke();        // upper wing
        g.beginPath(); g.moveTo(0, dy + 4); g.quadraticCurveTo(-30, 40 + dy, -95, 62 + dy); g.stroke();        // lower wing
      }
      g.fillStyle = '#1f2645'; g.beginPath(); g.ellipse(-8, 2, 30, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b5643c'; g.beginPath(); g.ellipse(14, 0, 9, 7, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1f2645'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(-34, 2); g.lineTo(-70, -12); g.moveTo(-34, 4); g.lineTo(-68, 18); g.stroke();      // the forked tail
      g.restore();
    };
    for (let k = 0; k < 26; k++) bird(90 + r() * (w - 120), 30 + r() * (h - 50), 0.7 + r() * 0.75, -0.6 + r() * 0.9);
  }, { repeat: false });
}

function signTex() {
  return canvasTex(512, 168, (g, w, h) => {
    g.fillStyle = '#1d3b2e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8c48a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#efe6c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 54px Georgia, serif'; g.fillText('вул. Монастирська', w / 2, h * 0.42, w - 50);
    g.font = 'italic 26px Georgia, serif'; g.fillText('з 1893 р. · нині Кобзарська', w / 2, h * 0.76, w - 60);
  }, { repeat: false });
}

export function buildKobzarska({ root, map, solids: S, heightAt }) {
  const get = (id) => map.buildings.filter((q) => q.id === id);
  const sch = get(SCHOOL)[0], old = get(OLD)[0];
  const t0 = performance.now(), r = rng(SCHOOL % 65521), n0 = S.count;
  const B = { wall: new MB(), plain: new MB(), det: new MB(), roof: new MB(), lit: new MB(), mural: new MB() }, D = B.det;
  const BS = { det: new MB(), sign: new MB() };   // the sign: its own root, far from the school (proxies.js, farcull.js)
  const footprints = [], rings = [], spots = { sign: SIGN };

  // the faces of a ring and of its holes, all with their normals pointing out of the building
  const facesOf = (ring, holes = []) => [...ringFaces(ring), ...holes.flatMap((h) => ringFaces(h).map((f) => Object.assign(f, { nx: -f.nx, nz: -f.nz, N: [-f.nx, 0, -f.nz], hole: true })))];
  function block(ring, holes, k, n, skip = () => false) {
    const all = [ring, ...holes].flat(), gLo = Math.min(...all.map(([x, z]) => heightAt(x, z))), gHi = Math.max(...all.map(([x, z]) => heightAt(x, z)));
    const K = KIND[k], base = Math.max(gLo + 0.6, gHi + 0.15), eave = base + n * FH, A = { ...A0, bay: K.bay, base: blockBase(A0, K.r0, K.nk, base) };
    const F = facesOf(ring, holes);
    for (const f of F) {
      const y0 = skip(f) ? base + FH : base;
      B.plain.setColor(k === 'old' ? '#7a4535' : '#c9b99a');
      quad(B.plain, at(f, 0, gLo - 1.5), at(f, f.L, gLo - 1.5), at(f, f.L, base), at(f, 0, base), f.N, [[0, 0], [f.L, 0], [f.L, base - gLo + 1.5], [0, base - gLo + 1.5]]);
      if (skip(f) === 'mural') continue;
      if (f.L >= 1.6) { B.wall.setColor('#ffffff'); band(B.wall, f, A, y0, eave); }
      else { B.plain.setColor(k === 'old' ? '#a65841' : '#efdfbd'); quad(B.plain, at(f, 0, y0), at(f, f.L, y0), at(f, f.L, eave), at(f, 0, eave), f.N, [[0, y0], [f.L, y0], [f.L, eave], [0, eave]]); }
    }
    // a flat roof behind a parapet with a light coping
    B.roof.setColor('#6d6c69').fill(ring, holes, eave + 0.05, true);
    for (const f of F) {
      B.plain.setColor(k === 'old' ? '#a65841' : '#efdfbd'); box(B.plain, f, 0, f.L, eave, eave + 0.7, -0.25, 0, 'fb', [1, 1]);
      D.setColor('#bdb8ad'); box(D, f, -0.05, f.L + 0.05, eave + 0.7, eave + 0.8, -0.3, 0.06, 'ftu');
    }
    return { base, eave, gLo, top: eave + 0.8, F };
  }

  if (sch) {
    const ring = ringPts(sch.p), holes = (sch.holes || []).map(ringPts);
    // the entrance block: the longest face toward the street (-z) with short returns; its ground storey is open
    const F0 = ringFaces(ring), front = F0.find((f) => Math.hypot(f.ax - PORCH_AT[0], f.az - PORCH_AT[1]) < 1.5 && f.nz < -0.9);
    const returns = front ? F0.filter((f) => Math.abs(f.L - PORCH) < 0.4 && (Math.hypot(f.ax - front.ax, f.az - front.az) < 3.5 || Math.hypot(f.ax - at(front, front.L, 0)[0], f.az - at(front, front.L, 0)[2]) < 0.5)) : [];
    const isPorch = (f) => front && Math.abs(f.ax - front.ax) < 0.01 && Math.abs(f.az - front.az) < 0.01 ? 'mural' : returns.some((q) => Math.abs(q.ax - f.ax) < 0.01 && Math.abs(q.az - f.az) < 0.01);
    const m = block(ring, holes, 'school', 3, isPorch);
    rings.push(ring); footprints.push({ poly: ring, h: m.top - m.gLo, kind: 'school', name: 'Школа №15' });
    // collision: the whole outline above the vestibule, the building behind the porch line below it
    S.prism(ring.flat(), m.base + FH - 0.2, m.top, 0, 0, 'wall', OVERHANG);
    if (front) {
      const ff = front, y0 = m.base + FH, y1 = m.eave;
      // the mural over the two upper storeys, read left to right from the street
      B.mural.setColor('#ffffff');
      const flip = ff.ux * ff.nz - ff.uz * ff.nx < 0, [ua, ub] = flip ? [1, 0] : [0, 1];
      quad(B.mural, at(ff, 0, y0), at(ff, ff.L, y0), at(ff, ff.L, y1), at(ff, 0, y1), ff.N, [[ua, 0], [ub, 0], [ub, 1], [ua, 1]]);
      spots.mural = (() => { const p = at(ff, ff.L / 2, 0); return [p[0], p[2]]; })();
      // the soffit under the block, the glazed vestibule at the back of the porch, the columns, the steps
      D.setColor('#d8cfbb'); quad(D, at(ff, 0, y0 - 0.02, 0), at(ff, ff.L, y0 - 0.02, 0), at(ff, ff.L, y0 - 0.02, -PORCH), at(ff, 0, y0 - 0.02, -PORCH), [0, -1, 0]);
      B.lit.setColor('#ffffff'); quad(B.lit, at(ff, 0, m.base, -PORCH), at(ff, ff.L, m.base, -PORCH), at(ff, ff.L, y0, -PORCH), at(ff, 0, y0, -PORCH), ff.N);
      D.setColor('#f2f0ea');
      for (let s = 0; s <= ff.L + 0.01; s += ff.L / 8) box(D, ff, s - 0.06, s + 0.06, m.base, y0, -PORCH, -PORCH + 0.1, 'flr');
      box(D, ff, 0, ff.L, m.base + 2.6, m.base + 2.72, -PORCH, -PORCH + 0.1, 'ftu');
      D.setColor('#b0726a');
      const nc = 5;
      for (let k = 0; k < nc; k++) {
        const s = 1.2 + ((ff.L - 2.4) * k) / (nc - 1);
        box(D, ff, s - 0.35, s + 0.35, m.base, y0, -0.7, 0, 'fblr');
        const c = [at(ff, s - 0.35, 0, -0.7), at(ff, s + 0.35, 0, -0.7), at(ff, s + 0.35, 0, 0), at(ff, s - 0.35, 0, 0)].map((p) => [p[0], p[2]]);
        S.prism((area2(c) < 0 ? c.reverse() : c).flat(), m.gLo - 1, y0, 0, 0, 'wall');
      }
      const back = [at(ff, 0, 0, -PORCH), at(ff, ff.L, 0, -PORCH), at(ff, ff.L, 0, -PORCH - 2), at(ff, 0, 0, -PORCH - 2)].map((p) => [p[0], p[2]]);
      S.prism((area2(back) < 0 ? back.reverse() : back).flat(), m.gLo - 1, y0, 0, 0, 'wall');
      // the floor of the porch and a broad flight of steps down to the path, 16 cm risers, 32 cm treads
      D.setColor('#6e5a52'); box(D, ff, -0.4, ff.L + 0.4, m.gLo - 0.3, m.base, -PORCH, 0.3, 'ftlr');
      const gf = heightAt(...(([x, , z]) => [x, z])(at(ff, ff.L / 2, 0, 1))), ns = Math.min(10, Math.max(1, Math.ceil((m.base - gf) / 0.16)));
      for (let k = 1; k <= ns; k++) {
        D.setColor(k % 2 ? '#8a7a72' : '#7f6f68');
        box(D, ff, 0.6, ff.L - 0.6, m.gLo - 0.3, m.base - (k * (m.base - gf)) / (ns + 0.5), 0.3, 0.3 + k * 0.32, 'ftlr');
      }
    }
    // the rest of the building below the porch storey: every face but the porch's, as thin wall slabs
    for (const f of m.F) {
      if (isPorch(f)) continue;
      const P = [at(f, 0, 0, 0), at(f, f.L, 0, 0), at(f, f.L, 0, -0.4), at(f, 0, 0, -0.4)].map((p) => [p[0], p[2]]);
      S.prism((area2(P) < 0 ? P.reverse() : P).flat(), m.gLo - 1, m.base + FH, 0, 0, 'wall');
    }
    spots.base = m.base; spots.eave = m.eave;
  }

  if (old) {
    const ring = ringPts(old.p), m = block(ring, [], 'old', 2);
    S.prism(ring.flat(), m.gLo - 1, m.top, 0, 0, 'wall');
    rings.push(ring); footprints.push({ poly: ring, h: m.top - m.gLo, kind: 'school', name: 'Школа №15, старий корпус' });
  }

  // ---- the heritage street sign: a black cast-iron post with a ball finial, the plate across the top
  {
    const [x, z] = SIGN, g = heightAt(x, z) - 0.1, D = BS.det;
    D.setColor('#1c1d1f'); D.cyl(x, g, z, 0.12, 0.09, 0.5, 10); D.cyl(x, g + 0.5, z, 0.055, 0.05, 2.6, 8, false);
    D.ellipsoid([x, g + 3.18, z], [0.09, 0.09, 0.09], 8, 6);
    // the plate hangs off the post on an arm, its near end a hand's width from the post
    const w = 1.3, h = 0.43, y0 = g + 2.35, x0 = x + 0.12, x1 = x0 + w;
    D.setColor('#1c1d1f'); D.box(x0 - 0.04, y0 - 0.04, z - 0.03, x1 + 0.04, y0 + h + 0.04, z + 0.03);
    D.box(x, y0 + h + 0.04, z - 0.02, x1 - 0.1, y0 + h + 0.09, z + 0.02);
    for (const xa of [x0 + 0.15, x1 - 0.25]) D.box(xa - 0.01, y0 + h + 0.04, z - 0.01, xa + 0.01, y0 + h + 0.09, z + 0.01);
    D.ellipsoid([x + 0.06, y0 + h / 2, z], [0.05, 0.05, 0.05], 6, 4);
    BS.sign.setColor('#ffffff');
    quad(BS.sign, [x0, y0, z + 0.032], [x1, y0, z + 0.032], [x1, y0 + h, z + 0.032], [x0, y0 + h, z + 0.032], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    quad(BS.sign, [x1, y0, z - 0.032], [x0, y0, z - 0.032], [x0, y0 + h, z - 0.032], [x1, y0 + h, z - 0.032], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    S.cyl(x, z, g - 0.5, g + 2.4, 0.12, 0.12, 'pole');
  }

  const AT = bayAtlas({ cols: 4, rows: 5, cw: 128, ch: 128, r, lit: 0.5, cell: cell(r) });
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: AT.tex, emissiveMap: AT.mask, emissive: 0xfff0d0, emissiveIntensity: 0, roughness: 0.85, vertexColors: true }),
    plain: new THREE.MeshStandardMaterial({ map: brickTex(r), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    lit: new THREE.MeshStandardMaterial({ color: 0x55656e, roughness: 0.15, metalness: 0.3, emissive: 0xffe8c0, emissiveIntensity: 0 }),
    mural: new THREE.MeshStandardMaterial({ map: muralTex(r), roughness: 0.85, vertexColors: true }),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.5, metalness: 0.2, vertexColors: true }),
  };
  const out = finish(root, 'kobzarska', B, M, { shade: ['wall', 'plain', 'det', 'roof', 'mural'] });
  const os = finish(root, 'monastyrska-sign', BS, M, { shade: ['det'] });
  out.verts += os.verts; out.meshes += os.meshes;
  console.log(`[cherkasy] School 15 and the Monastyrska sign: ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bbs = rings.map(bboxOf);
  return {
    footprints, spots,
    clear: (x, z) => rings.some((ring, i) => x > bbs[i].x0 - 2 && x < bbs[i].x1 + 2 && z > bbs[i].z0 - 2 && z < bbs[i].z1 + 2 && inPoly(ring, x, z)) || Math.hypot(x - SIGN[0], z - SIGN[1]) < 1.5,
    update() { const k = nightK.value; M.wall.emissiveIntensity = 1.1 * k; M.lit.emissiveIntensity = 0.9 * k; },
  };
}
