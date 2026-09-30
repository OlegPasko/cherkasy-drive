// OWNER: cherkasy. Вулиця Байди Вишневецького, 34: the head post office (Головпоштамт, 1964–65, Ukrtelecom upstairs),
// rebuilt after the Wikimedia Commons photos (Поштамт.JPG, 2010; the panoramio night shot of the corner) and the Esri
// satellite view. A U round a back yard, faced in small ochre ceramic tiles: the five-storey wing along the street,
// thirteen bays of white windows in red-brown surrounds over a shop-window ground floor, and a taller corner block at
// the south-west end. The corner block's street end is one full-height bay of dark mirror glass in a cream frame over a
// white portico on slender round columns, with the blue «ПОШТАМТ» sign in yellow letters on its corner; its side on
// the boulevard is blank toward the street but for the wire relief of two globes and a letter scroll, with a column
// of windows further back. Plain window rows on the yard sides, a red-and-white lattice mast on the corner block's
// roof, lit windows and sign at night.
//   POSHTAMT_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildPoshtamt({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The OSM ring is cut at the line x = XC of the map frame (which runs along the street) into the corner block and the
// U of the wings; each part's walls come from civic.js faces. The wing's wall on the cut is inside the block.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, inPoly } from './geo.js';
import { canvasTex } from './sculpt.js';
import { wallFaces, at, quad, skin, plate, fbox, fsolid, wallAround, fillOpening, tileTex, stoneTex, pack } from './civic.js';

const OSM_ID = 157506758;
export const POSHTAMT_SKIP = new Set([OSM_ID]);

const LIFT = 0.3, GF = 4.0, FH = 3.3, NW = 4, GFC = 4.6, FHC = 3.6, ATTIC = 2.2, PARA = 0.6; // wing / corner block storeys
const TILE = '#ffffff', TRIM = '#e6d6b2', PLINTH = '#8a4f3c', SURROUND = '#7a4332', PVC = '#f2f1ec';
const GLASS = ['#56626a', '#4d5960', '#667077', '#5b666c'], BLINDS = ['#e0ddd2', '#d4d0c2'];
const TU = [2.0, 1.6]; // metres per tile repeat (8 x 16 tiles of 25 x 10 cm)

// the vertical sign: yellow letters on blue, one under another
const signTex = () => canvasTex(128, 640, (g, w, h) => {
  g.fillStyle = '#1d4fa0'; g.fillRect(0, 0, w, h);
  Object.assign(g, { fillStyle: '#f6cf2a', font: 'bold 84px Arial, Helvetica, sans-serif', textAlign: 'center', textBaseline: 'middle' });
  let y = 50;
  for (const ch of 'ПОШТАМТ') { g.fillText(ch, w / 2, y); y += 90; }
}, { repeat: false });
// the wire relief: two meridian globes and a letter scroll, pale metal on transparent
const reliefTex = () => canvasTex(512, 512, (g) => {
  Object.assign(g, { strokeStyle: '#e8e6e0', lineCap: 'round' });
  const line = (w, draw) => { g.lineWidth = w; g.beginPath(); draw(); g.stroke(); };
  const R = 88;
  for (const gx of [150, 330]) { // a globe: the rim and two meridians, three parallels
    for (const k of [1, 0.7, 0.35]) line(6, () => g.ellipse(gx, 150, R * k, R, 0, 0, Math.PI * 2));
    for (const dy of [-50, 0, 50]) { const half = Math.sqrt(R * R - dy * dy); line(6, () => { g.moveTo(gx - half, 150 + dy); g.lineTo(gx + half, 150 + dy); }); }
  }
  // the scroll: a curled sheet, its two rolled ends and four lines of writing
  line(9, () => { g.moveTo(110, 270); g.bezierCurveTo(200, 250, 300, 300, 400, 270); g.lineTo(380, 420); g.bezierCurveTo(300, 450, 220, 400, 130, 430); g.closePath(); });
  line(9, () => { g.moveTo(400, 270); g.bezierCurveTo(450, 280, 450, 330, 395, 330); });
  line(9, () => { g.moveTo(130, 430); g.bezierCurveTo(80, 440, 70, 380, 120, 372); });
  for (let y = 310; y < 410; y += 26) line(5, () => { g.moveTo(160, y); g.bezierCurveTo(230, y - 10, 290, y + 15, 350, y - 5); });
}, { repeat: false });

export function buildPoshtamt({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const ring = ringPts(b.p), xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const X0 = Math.min(...xs), X1 = Math.max(...xs), Z0 = Math.min(...zs), Z1 = Math.max(...zs);
  // the corner block's north-east wall: the ring corners 12–16 m in from the south-west end
  const XC = Math.max(...xs.filter((x) => x > X0 + 10 && x < X0 + 18)) + 0.1;
  const clip = (keepLow) => {
    const out = [];
    ring.forEach((a, i) => {
      const c = ring[(i + 1) % ring.length], ia = (a[0] < XC) === keepLow, ic = (c[0] < XC) === keepLow;
      if (ia) out.push(a);
      if (ia !== ic) { const t = (XC - a[0]) / (c[0] - a[0]); out.push([XC, a[1] + t * (c[1] - a[1])]); }
    });
    return out;
  };
  const block = clip(true), wing = clip(false);
  const bF = wallFaces(block), wF = wallFaces(wing).filter((f) => !(f.nx < -0.99 && Math.abs(f.ax - XC) < 0.05)); // the cut is inside the block

  const hs = ring.map(([x, z]) => heightAt(x, z));
  const streetZ = Z1 + 4, gS = heightAt((X0 + X1) / 2, streetZ), gC = heightAt(X0 + 7, streetZ);
  const yF = Math.max(gS, gC) + LIFT, gBase = Math.min(...hs) - 0.5;
  const flW = (k) => yF + (k ? GF + (k - 1) * FH : 0), flC = (k) => yF + (k ? GFC + (k - 1) * FHC : 0);
  const yRW = flW(NW + 1), yTW = yRW + PARA, yRC = flC(NW + 1) + ATTIC, yTC = yRC + PARA;

  const B = { tile: new MB(), plinth: new MB(), det: new MB(), glass: new MB(), lit: new MB(), mirror: new MB(), sign: new MB(), relief: new MB() };
  let nWin = 0;
  const acs = [];
  const glazing = (litP = 0.3) => ({ glass: r() < 0.3 ? BLINDS[Math.floor(r() * 2)] : GLASS[Math.floor(r() * GLASS.length)], lit: r() < litP });
  const win = (f, s0, s1, y0, y1, extra = {}) => { f.open.push({ s0, s1, y0, y1, dep: 0.2, frame: PVC, rev: SURROUND, pane: 0.8, sill: '#b9b4a8', ...glazing(), ...extra }); nWin++; };
  const sOf = (f, x, z) => (x - f.ax) * f.rx + (z - f.az) * f.rz;
  const bays = (w, step, margin = 0.8) => { const n = Math.max(1, Math.floor((w - 2 * margin) / step)), o = (w - n * step) / 2; return Array.from({ length: n }, (_, i) => o + (i + 0.5) * step); };

  // ---- the wings: windows in bays of ~3.7 m, the street side with a shop-window ground floor
  for (const f of wF) {
    const street = f.nz > 0.9 && f.w > 20, step = street ? f.w / Math.round(f.w / 3.73) : 3.6;
    if (f.w < 2.5) continue;
    for (const c of bays(f.w, step, street ? 0 : 0.6)) {
      if (street) {
        const door = Math.abs(c - f.w * 0.62) < step / 2 || Math.abs(c - f.w * 0.2) < step / 2;
        if (door) win(f, c - 1.1, c + 1.1, yF - LIFT + 0.15, yF + 2.9, { frame: '#9ca0a2', door: true, glass: '#39434a', lit: true, pane: 1.1, sill: null });
        else win(f, c - 1.35, c + 1.35, yF + 0.45, yF + 3.1, { frame: '#e9e9e4', pane: 0.9, sill: null, low: 0.25, lowCol: '#e4dcc4' });
      } else if (r() < 0.9) win(f, c - 0.8, c + 0.8, yF + 1.0, yF + 2.8);
      for (let k = 1; k <= NW; k++) {
        const y0 = flW(k) + 0.9;
        win(f, c - 0.8, c + 0.8, y0, y0 + 1.75);
        if (r() < 0.12) acs.push([f, c + 1.05, y0 + 0.4]);
      }
    }
  }

  // ---- the corner block
  const endF = bF.filter((f) => f.nz > 0.9).reduce((m, f) => (f.w > m.w ? f : m));   // the glass end on the street
  const sideF = bF.find((f) => f.nx < -0.9);                                            // on the boulevard
  for (const f of bF) {
    if (f === endF || f.w < 2.5) continue;
    if (f === sideF) { // windows in the back half, the relief toward the street
      const sStreet = sOf(f, X0, Z1), back = sStreet < f.w / 2 ? [f.w * 0.52, f.w - 0.8] : [0.8, f.w * 0.48];
      for (let c = back[0] + 1.6; c < back[1] - 1.2; c += 3.2) {
        win(f, c - 0.75, c + 0.75, yF + 1.0, yF + 3.2);
        for (let k = 1; k <= NW; k++) { const y0 = flC(k) + 1.0; win(f, c - 0.75, c + 0.75, y0, y0 + 1.8); }
      }
      const m = sStreet < f.w / 2 ? f.w * 0.26 : f.w * 0.74, rw = 9;
      plate(B.relief, f, m - rw / 2, m + rw / 2, flC(2) + 0.5, flC(2) + 0.5 + rw, 0.12);
    } else if (f.nx > 0.9 || f.nz < -0.9) { // yard walls: a window pair per storey where the wing does not cover them
      for (const c of bays(f.w, 3.4, 0.8)) {
        const [x, , z] = at(f, c, 0, 0.6), covered = inPoly(wing, x, z); // blank where the lower wing abuts
        if (!covered) for (let k = 0; k <= NW; k++) { const y0 = flC(k) + 1.0; win(f, c - 0.75, c + 0.75, y0, y0 + (k ? 1.8 : 2.0)); }
      }
    }
  }
  // the glass end: a cream frame round one bay of mirror glass, the portico and the post hall under it
  {
    const f = endF, fr = 0.75, g0 = flC(1) + 0.25, g1 = yRC - 0.7;
    f.open.push({ s0: fr, s1: f.w - fr, y0: g0, y1: g1 });
    const M = B.mirror, cols = Math.max(4, Math.round((f.w - 2 * fr) / 1.7)), cw = (f.w - 2 * fr) / cols;
    M.setColor('#2c3638');
    quad(M, at(f, fr, g0, -0.1), at(f, f.w - fr, g0, -0.1), at(f, f.w - fr, g1, -0.1), at(f, fr, g1, -0.1), f.N);
    B.det.setColor('#5a3a2c');
    for (let i = 0; i <= cols; i++) { const s = fr + i * cw; fbox(B.det, f, s - 0.04, s + 0.04, g0, g1, -0.1, 0.02, 1 | 4 | 8); }
    for (let y = g0, i = 0; y <= g1 + 1e-3; y += (g1 - g0) / 10, i++) fbox(B.det, f, fr, f.w - fr, y - 0.04, y + 0.04, -0.1, 0.02, 1 | 16 | 32);
    // a few staggered bars across single panes, as in the photo
    for (let i = 0; i < 9; i++) { const c = Math.floor(r() * cols), y = g0 + (g1 - g0) * (0.1 + 0.8 * r()); fbox(B.det, f, fr + c * cw, fr + (c + 1) * cw, y - 0.05, y + 0.05, -0.1, 0.03, 1 | 16 | 32); }
    B.det.setColor(TRIM);
    fbox(B.det, f, fr - 0.05, f.w - fr + 0.05, g0 - 0.12, g0, -0.1, 0.05, 1 | 16);
    // ground floor: the red-brown panel on the left, the glazed post hall behind the portico
    const p0 = f.w * 0.3;
    win(f, p0 + 0.4, f.w - 0.4, yF, flC(1) - 0.4, { frame: '#e8e8e4', glass: '#3b454b', lit: true, pane: 1.2, door: true, rev: '#ecebe6', sill: null, dep: 0.3 });
    B.det.setColor('#f2f2ee');
    const pd = 2.6, py = flC(1) - 0.2;
    fbox(B.det, f, p0 - 0.3, f.w + 0.4, py, py + 0.55, 0, pd, 1 | 4 | 8 | 16 | 32);
    fsolid(S, f, p0 - 0.3, f.w + 0.4, -0.05, pd, py, py + 0.55, 'awning', 1);
    for (let i = 0; i < 4; i++) {
      const s = p0 + 0.6 + i * (f.w - p0 - 0.6) / 3.3, [x, , z] = at(f, s, 0, pd - 0.45);
      B.det.cyl(x, heightAt(x, z) - 0.2, z, 0.22, 0.2, py - heightAt(x, z) + 0.2, 10, false);
      S.cyl(x, z, heightAt(x, z) - 0.2, py, 0.24);
    }
    B.det.setColor('#b1aea7'); fbox(B.det, f, p0 - 0.3, f.w + 0.4, gBase, yF, 0, pd, 1 | 4 | 8 | 16);
    fsolid(S, f, p0 - 0.3, f.w + 0.4, 0, pd, gBase, yF, 'steps');
    // the sign on the left edge of the end, over the ground floor
    const sy0 = flC(1) + 0.4, sh = 7.2, sw = sh * 128 / 640;
    B.det.setColor('#16335f'); fbox(B.det, f, 0.1, 0.1 + sw, sy0, sy0 + sh, 0, 0.22, 4 | 8 | 16 | 32);
    plate(B.sign, f, 0.1, 0.1 + sw, sy0, sy0 + sh, 0.22);
    wallAround(B.plinth, f, gBase, flC(1), [1.2, 0.8], PLINTH);
    f.open.push({ s0: 0, s1: f.w, y0: gBase - 1, y1: flC(1) }); // the ground floor is done: keep the tiles off it
  }

  // ---- wall surfaces: red-brown plinth, ochre tiles, the corner block's cream quoins
  for (const f of [...wF, ...bF]) {
    const blockW = bF.includes(f), yT = blockW ? yTC : yTW;
    wallAround(B.plinth, f, gBase, yF + 0.35, [1.2, 0.8], PLINTH);
    wallAround(B.tile, f, yF + 0.35, yT, TU, TILE);
    for (const q of f.open) if (q.frame) fillOpening(B, f, q);
    // parapet inside, coping, roof edge anchors
    const yR = blockW ? yRC : yRW;
    B.det.setColor('#cfc1a3'); skin(B.det, { ...f, N: [-f.nx, 0, -f.nz] }, 0, f.w, yR, yT, -0.3);
    B.det.setColor('#8f9190'); fbox(B.det, f, -0.03, f.w + 0.03, yT, yT + 0.05, -0.32, 0.05, 1 | 16);
    const a = at(f, 0, 0, -0.1), c = at(f, f.w, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], yT, f.nx, f.nz);
  }
  for (const f of bF) { // cream corner strips up the block
    if (f.w < 5) continue;
    B.det.setColor(TRIM);
    fbox(B.det, f, -0.02, 0.5, yF + 0.35, yTC, 0, 0.04, 1 | 4);
    fbox(B.det, f, f.w - 0.5, f.w + 0.02, yF + 0.35, yTC, 0, 0.04, 1 | 8);
  }
  B.det.setColor('#8f8a80'); B.det.fill(wing, [], yRW + 0.02, true);
  B.det.setColor('#77746d'); B.det.fill(block, [], yRC + 0.02, true);

  // ---- roof: the lattice mast on the corner block, vents and TV aerials on the wings
  {
    // seven tapering sections, red and white by turns: four legs each and an X brace on top
    const mx = X0 + 4, mz = (Z0 + Z1) / 2 - 6, H = 14, SEG = 7, LEGS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const leg = ([dx, dz], t) => { const h = 0.55 - 0.45 * t; return [mx + dx * h, yRC + H * t, mz + dz * h]; };
    for (let i = 0; i < SEG; i++) {
      const ta = i / SEG, tb = (i + 1) / SEG;
      B.det.setColor(i & 1 ? '#f0f0ee' : '#c8362d');
      LEGS.forEach((c) => B.det.tube(leg(c, ta), leg(c, tb), 0.05, 4));
      B.det.tube(leg(LEGS[0], tb), leg(LEGS[2], tb), 0.03, 4);
      B.det.tube(leg(LEGS[1], tb), leg(LEGS[3], tb), 0.03, 4);
    }
    B.det.setColor('#e4e4e0'); B.det.ellipsoid([mx - 0.2, yRC + H - 1.2, mz + 0.5], [0.12, 0.45, 0.45], 8, 5);
    S.box(mx - 0.6, yRC, mz - 0.6, mx + 0.6, yRC + H, mz + 0.6, 'pole');
    B.det.setColor('#9c998f');
    for (let i = 0; i < 5; i++) { const x = XC + 4 + r() * (X1 - XC - 8), z = Z1 - 4 - r() * 9; B.det.box(x - 0.5, yRW, z - 0.5, x + 0.5, yRW + 0.8, z + 0.5, 55); }
    B.det.setColor('#6d7174');
    for (let i = 0; i < 3; i++) { const x = XC + 8 + i * 13, z = Z1 - 8; B.det.cyl(x, yRW, z, 0.035, 0.03, 3.5, 5, false); B.det.box(x - 0.8, yRW + 3.1, z - 0.02, x + 0.8, yRW + 3.14, z + 0.02); }
  }
  B.det.setColor('#e3e3de');
  for (const [f, s, y] of acs) if (s + 0.4 < f.w) fbox(B.det, f, s - 0.4, s + 0.4, y, y + 0.55, 0, 0.3, 1 | 4 | 8 | 16 | 32);
  S.prism(block.flat(), gBase, yTC, 0, 0, 'wall');
  S.prism(wing.flat(), gBase, yTW, 0, 0, 'wall');

  // ---- meshes
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tileTex(r, [214, 168, 118], { cols: 8, rows: 16, grout: [186, 160, 128], spread: 0.16 }), vertexColors: true, roughness: 0.6 }),
    plinth: new THREE.MeshStandardMaterial({ map: stoneTex(r, [236, 230, 226], { cols: 2, rows: 2, joint: 0.3, grain: 0.1 }), vertexColors: true, roughness: 0.55 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffe6bf, emissiveIntensity: 0 }),
    mirror: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.85, envMapIntensity: 1.6, emissive: 0x6a5a40, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 }),
    relief: new THREE.MeshStandardMaterial({ map: reliefTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }),
  };
  M.sign.emissiveMap = M.sign.map;
  const st = pack(root, 'poshtamt', B, M, ['glass', 'lit', 'mirror', 'sign', 'relief']);
  console.log(`[cherkasy] Poshtamt: ${nWin} windows, block cut at x ${XC.toFixed(1)}, ${(st.verts / 1000).toFixed(1)}k verts, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, floor ${yF.toFixed(1)} m, in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: yTC - gS, kind: b.k, name: 'Поштамт' }],
    // trees keep off the walls and the portico in front of the glass end
    clear: (x, z) => x > X0 - 3 && x < X1 + 3 && z > Z0 - 3 && z < Z1 + 3 + (x < XC ? 3 : 0),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.2 * k; M.sign.emissiveIntensity = 0.9 * k; M.mirror.emissiveIntensity = 0.18 * k; },
  };
}
