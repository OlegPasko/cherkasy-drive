// OWNER: cherkasy. Partner sign: Центр фізичної реабілітації і навчання «Торс», bul. Shevchenka 266 (OSM way 274691767,
// «Облагробуд», a 5-storey commercial block whose long east wall faces the boulevard, with a one-storey annex, way
// 395532917, along the middle of that wall). The buildings keep their OSM extrusion; this module only hangs the partner's
// branding on them: the round logo (public/assets/brand/tors.svg, in its own colours) as a disc lightbox on a steel frame
// over the block's roof edge toward the boulevard, and on the annex front a glazed door under a dark fascia with the logo
// and the name. Both are lit at dusk and brighten (with a soft pink wash under the disc, like the partner badge on the
// map) as the car comes near.
//   TORS_SKIP: empty (no OSM building is replaced)
//   buildTors({ root, map, solids, heightAt }) -> { update(dt), partners: { tors } } | null
//     tors: { door: { x, y, z, nx, nz } (the pavement in front of the door; nx / nz: outward), glow(0..1) (light-up) }
import * as THREE from 'three';
import { nightK } from '../../render/daylight.js';
import { logoTexture } from '../../kit/logo.js';
import { area2 } from './geo.js';

export const TORS_SKIP = new Set();

const OSM_ID = 274691767, ANNEX_ID = 395532917;
const ROAD = 'бульвар Шевченка';
const ROOF = 18.1;     // buildings.js 'public', 5 levels: plinth 0.6 + 5 x 3.5 m over its g0; the parapet adds 0.9 m
const DISC = 6.2;      // roof disc diameter, metres
const FASCIA = [6.4, 0.9, 2.35]; // width, height, bottom edge over the annex floor (its eaves are at ~3.4 m)

function textTex(aspect) { // the fascia's name panel (height / width = aspect): white «ТОРС» over what it is, on the logo's near-black
  const W = 1024, H = Math.round(W * aspect), c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d');
  g.fillStyle = '#160f12'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(H * 0.5)}px Arial, Helvetica, sans-serif`; g.fillText('ТОРС', H * 0.12, H * 0.36);
  g.fillStyle = '#c9c4f5'; g.font = `${Math.round(H * 0.24)}px Arial, Helvetica, sans-serif`; g.fillText('центр фізичної реабілітації', H * 0.13, H * 0.78);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildTors({ root, map, solids, heightAt }) {
  const road = (map.roads || []).filter((r) => r.n === ROAD);
  const nearRoad = (x, z) => { // the closest point on the boulevard's centre lines (its vertices lie hundreds of metres apart)
    let best = null, bd = Infinity;
    for (const r of road) for (let i = 0; i + 3 < r.p.length; i += 2) {
      const [ax, az, bx, bz] = r.p.slice(i, i + 4), vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1))), px = ax + vx * t, pz = az + vz * t;
      const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = [px, pz]; }
    }
    return best;
  };
  // a building's face toward the boulevard: its longest edge whose outward normal looks at the road, as a frame
  // (s metres along the wall, to the viewer's left seen from outside; o outward) with the ground datum of buildings.js
  const faceOf = (id) => {
    const b = map.buildings?.find((q) => q.id === id);
    if (!b) return null;
    const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    const ccw = area2(P) > 0;
    let E = null;
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], L = Math.hypot(bx - ax, bz - az);
      if (L < 8) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = ccw ? uz : -uz, nz = ccw ? -ux : ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, q = nearRoad(mx, mz);
      const facing = q ? ((q[0] - mx) * nx + (q[1] - mz) * nz) / (Math.hypot(q[0] - mx, q[1] - mz) || 1) : 0;
      if (facing > 0.7 && (!E || L > E.L)) E = { ax, az, ux, uz, nx, nz, L };
    }
    if (!E) return null;
    let gs = 0, cx = 0, cz = 0; for (const [x, z] of P) { gs += heightAt(x, z); cx += x / P.length; cz += z / P.length; }
    E.g0 = (gs + heightAt(cx, cz)) / (P.length + 1) + 0.15; // buildings.js: the mean of the corners and an inner point + 0.15
    E.xz = (s, o) => [E.ax + E.ux * s + E.nx * o, E.az + E.uz * s + E.nz * o];
    E.yaw = Math.atan2(E.nx, E.nz); // object +z -> outward
    E.ang = Math.atan2(E.uz, E.ux);
    return E;
  };
  const E = faceOf(OSM_ID);
  if (!E) return null;
  const A = faceOf(ANNEX_ID); // the door goes on the annex when OSM still has it, else on the block's own wall

  const group = new THREE.Group(); group.name = 'partner-tors'; root.add(group);
  const lit = []; // [material, day, night, approach]
  const litMat = (map, day, night, near, o = {}) => { const m = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: day, roughness: 0.35, ...o }); lit.push([m, day, night, near]); return m; };
  const steel = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.55, metalness: 0.6 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x1b1517, roughness: 0.5, metalness: 0.3 });
  const put = (F, mesh, s, y, o, shadow = true) => { const [x, z] = F.xz(s, o); mesh.position.set(x, y, z); mesh.rotation.y = F.yaw; mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); return mesh; };
  const box = (F, w, h, d, s, y, o, mat) => put(F, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), s, y + h / 2, o);
  const logo = logoTexture('tors', { width: 1024, color: null, pad: 0 });

  // ---- the roof disc: a dark drum with the logo on its face, on two legs and a cross bar behind the parapet
  const discMat = litMat(logo, 0.35, 1.5, 1.3, { roughness: 0.3 });
  const R = DISC / 2, sMid = E.L / 2, yR = E.g0 + ROOF, yC = yR + 1.4 + R, oD = -1.4;
  put(E, new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.35, 64, 1).rotateX(Math.PI / 2), rim), sMid, yC, oD);
  put(E, new THREE.Mesh(new THREE.CircleGeometry(R, 64), discMat), sMid, yC, oD + 0.18, false); // a circle's uv maps the square logo upright
  for (const ds of [-1.6, 1.6]) box(E, 0.16, yC - yR - 0.4, 0.16, sMid + ds, yR, oD - 0.4, steel);
  box(E, 3.8, 0.14, 0.14, sMid, yC - R * 0.55, oD - 0.4, steel);
  solids?.obox?.(...E.xz(sMid, oD - 0.2), R, 0.4, E.ang, yR, yC + R, 'sign');
  // the pink wash on the top floor under the disc (the partner light-up)
  const wash = new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  put(E, new THREE.Mesh(new THREE.PlaneGeometry(DISC + 4, 2.4), wash), sMid, yR - 0.4, 0.08, false).renderOrder = 2;

  // ---- the street door: dark glass in a steel frame, the fascia over it (the logo disc + the name panel)
  const D = A || E, sD = D.L / 2, g = D.g0 - 0.15; // the annex floor sits at its g0 - 0.15 (buildings.js floorY)
  const [fw, fh, fy] = FASCIA;
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.08, metalness: 0.7 });
  box(D, 2.2, 2.15, 0.08, sD, g + 0.05, 0.05, glass);
  for (const ds of [-1.15, 0, 1.15]) box(D, 0.08, 2.2, 0.14, sD + ds, g + 0.05, 0.07, steel);
  box(D, 2.38, 0.08, 0.14, sD, g + 2.2, 0.07, steel);
  box(D, fw + 0.16, fh + 0.16, 0.2, sD, g + fy - 0.08, 0.1, rim); // the fascia box
  put(D, new THREE.Mesh(new THREE.CircleGeometry(fh * 0.47, 48), litMat(logo, 0.35, 1.4, 1.0)), sD + fw / 2 - fh * 0.55, g + fy + fh / 2, 0.205, false); // s runs to the viewer's left: the logo leads
  const nw = fw - fh * 1.25;
  put(D, new THREE.Mesh(new THREE.PlaneGeometry(nw, fh * 0.92), litMat(textTex(fh * 0.92 / nw), 0.3, 1.3, 1.0)), sD - fh * 0.6, g + fy + fh / 2, 0.205, false);
  if (!A) { // on the block itself the door gets a small canopy (the annex has its own eaves)
    box(D, 3.0, 0.12, 1.2, sD, g + 3.4, 0.6, steel);
    solids?.obox?.(...D.xz(sD, 0.6), 1.5, 0.6, D.ang, g + 3.4, g + 3.52, 'awning');
  }

  const [dx, dz] = D.xz(sD, 4.5);
  const door = { x: dx, y: heightAt(dx, dz), z: dz, nx: D.nx, nz: D.nz };
  let near = 0;
  return {
    partners: { tors: { door, glow(k) { near = Math.max(0, Math.min(1, k)); } } },
    update() {
      const k = nightK.value;
      for (const [m, day, night, nearK] of lit) m.emissiveIntensity = day + night * k + nearK * near;
      wash.color.setRGB(1.0, 0.45, 0.75).multiplyScalar(near * (0.5 + 0.5 * k));
    },
  };
}
