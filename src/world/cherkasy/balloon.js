// OWNER: cherkasy. A hot-air balloon of the kind the city's festivals fly over the Rose Valley, half again the size of
// a usual one (envelope ~24 m across, ~30 m tall) and a little higher than the tethered festival balloons. It hangs over
// the valley's round fountain, then drifts at a walker's pace (1.3 m/s) down the Dnipro, 45 m out over the water along
// the shore, to the river station and back – about an hour each way, paced by the wall clock so every player sees it
// in the same place. The envelope wears the Zhuzhomy 4 "pixel" tower's palette (maroon / red / orange / yellow cells on
// white, zhuzhoma.js) and an equator band sold through the bot's `ad-balloon` flow: today U space's (the office tower at
// Nadpilna 252, restinn.js) – their logo (public/assets/brand/uspace.svg, white on their near-black) over the offer, the
// address and the phone, three times round. It bobs and turns slowly so the band reads from every side; at night the burner
// fires now and then and the envelope glows from inside.
//   buildBalloon({ root, heightAt }) -> { update(dt), clear(x, z), balloon: { x, z, y } } | null
// No collision: the solids grid is static and the balloon keeps moving (the car flies through it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { WATER_Y } from '../water.js';

const HOME = [700, -185];          // map x, z: the Rose Valley's round fountain
// the flight line: from the valley's shore 45 m out over the Dnipro, round the bank, to off the river station (map x, z;
// the OSM river outline offset onto the water, smoothed, a point every ~60 m)
const ROUTE = [
  949, -107, 951, -59, 967, -13, 991, 37, 1017, 79, 1053, 113, 1100, 147, 1150, 187, 1194, 239, 1226, 298, 1244, 365,
  1240, 435, 1223, 493, 1207, 548, 1187, 604, 1167, 652, 1150, 702, 1129, 763, 1092, 821, 1055, 861, 1041, 900, 1026,
  958, 1004, 1007, 997, 1033, 991, 1083, 987, 1134, 993, 1188, 994, 1252, 987, 1311, 975, 1377, 941, 1439, 907, 1482,
  885, 1529, 864, 1583, 843, 1633, 831, 1681, 826, 1730, 834, 1769, 857, 1805, 860, 1819, 889, 1807, 942, 1801, 979,
  1784, 1024, 1748, 1074, 1713, 1129, 1678, 1189, 1653, 1240, 1635, 1284, 1608, 1334, 1571, 1412, 1559, 1476, 1609,
  1500, 1668, 1524, 1724, 1534, 1792, 1533, 1851, 1539, 1900, 1558, 1947, 1581, 2000, 1592, 2046, 1604, 2070, 1643,
  2060, 1631, 2027, 1594, 2037, 1619, 2089, 1665, 2152, 1660, 2220, 1634, 2281, 1606, 2336, 1576, 2388, 1548, 2440,
  1521, 2493, 1494, 2546, 1467, 2598, 1447, 2642, 1442, 2674, 1442, 2725, 1441, 2748, 1411, 2793, 1374, 2834, 1338,
  2869, 1312, 2907, 1299, 2945];
const SPEED = 1.3, DWELL = 240;    // m/s (a walker's pace); seconds it hangs at each end
const LIFT = 70;                   // basket bottom over the ground (the festival balloons hang ~20–50 m up)
const R = 12, H = 30, ROPE = 5.2;  // envelope radius / height (1.5 x a 2200 m³ balloon), throat-to-basket cables
const GORES = 16, ROWS = 18;       // envelope panels round and up (the pixel cells follow them)
const BAND = [0.47, 0.71];         // the lettered band, as a share of the profile's arc length
// the pixel tower's palette: weight, colour (null = white), as in zhuzhoma.js
const CELLS = [[6.5, null], [2.2, '#7a2a44'], [1.1, '#b8404f'], [1.6, '#dd7a43'], [1.3, '#e6bd46']];
const WHITE = '#efede7', MAROON = '#7a2a44';
// the band's ad: U space (a paid placement, see places.js)
const AD = { bg: '#111827', fg: '#f3f4f6', accent: '#e6bd46', logo: 'uspace', logoAspect: 58 / 206,
  lines: ['Комфортні офіси з резервним живленням,', 'ефективним опаленням і вентиляцією'], contact: 'Надпільна, 252 · +38 (093) 098-80-80' };

// radius (share of R) over height (share of H) from the throat up: a teardrop with the widest point at ~2/3
const PROFILE = [[0.15, 0], [0.24, 0.05], [0.42, 0.15], [0.62, 0.27], [0.8, 0.39], [0.93, 0.5], [0.99, 0.6], [1, 0.67],
  [0.97, 0.75], [0.88, 0.84], [0.72, 0.91], [0.5, 0.96], [0.26, 0.99], [0, 1]];

function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
function pick(u) { let t = CELLS.reduce((s, c) => s + c[0], 0) * u; for (const [w, c] of CELLS) { if ((t -= w) < 0) return c; } return null; }

export function buildBalloon({ root, heightAt }) {
  const t0 = performance.now();
  const [x, z] = HOME, y0 = heightAt(x, z) + LIFT;
  // the line: home, then the route; cumulative lengths for the pace
  const L = [HOME[0], HOME[1], ...ROUTE], cum = [0];
  for (let i = 2; i < L.length; i += 2) cum.push(cum.at(-1) + Math.hypot(L[i] - L[i - 2], L[i + 1] - L[i - 1]));
  const total = cum.at(-1), cycle = 2 * (total / SPEED + DWELL);
  const at = (d, out) => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    out[0] = L[2 * i - 2] + (L[2 * i] - L[2 * i - 2]) * k; out[1] = L[2 * i - 1] + (L[2 * i + 1] - L[2 * i - 1]) * k; return out; };
  const pos = [0, 0];
  // smooth profile through the control points, then a lathe with uv v = arc length share (so cells keep their size)
  const curve = new THREE.SplineCurve(PROFILE.map(([r, h]) => new THREE.Vector2(r * R, h * H)));
  const pts = curve.getSpacedPoints(40);
  pts[pts.length - 1].x = 0;
  const env = new THREE.LatheGeometry(pts, 48);
  // the throat sits ROPE over the basket top (1.4 m) – the whole rig hangs from one group at the basket bottom
  env.translate(0, 1.4 + ROPE, 0);

  // envelope skin: gores round (u), rows up (v); the lathe's v runs along the spaced points, i.e. arc length
  const W = 2048, Hh = 1024;
  let logoAt = null;
  const skin = canvasTex(W, Hh, (g) => {
    const gw = W / GORES, rh = Hh / ROWS;
    g.fillStyle = WHITE; g.fillRect(0, 0, W, Hh);
    for (let i = 0; i < GORES * 2; i++) for (let j = 0; j < ROWS; j++) { // two pixel columns per gore
      const v = (j + 0.5) / ROWS; if (v > BAND[0] - 0.02 && v < BAND[1] + 0.02) continue;
      const c = v > 0.9 ? MAROON : pick(hash(i >> 0, j)); if (!c) continue;
      g.fillStyle = c; g.fillRect(i * gw / 2, Hh - (j + 1) * rh, gw / 2 + 1, rh + 1);
    }
    g.fillStyle = MAROON; g.fillRect(0, Hh * (1 - 0.06), W, Hh * 0.06); // the scoop round the throat
    // the band: the advertiser's colour with maroon rules, the ad three times round (a third of the girth faces the viewer)
    const b0 = Hh * (1 - BAND[1]), b1 = Hh * (1 - BAND[0]), bh = b1 - b0;
    g.fillStyle = AD.bg; g.fillRect(0, b0, W, bh);
    g.fillStyle = MAROON; g.fillRect(0, b0, W, bh * 0.07); g.fillRect(0, b1 - bh * 0.07, W, bh * 0.07);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = (w, px) => `${w} ${Math.round(px)}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    for (const k of [0, 1, 2]) {
      const cx = W * (1 / 6 + k / 3);
      g.fillStyle = AD.fg; g.font = font(600, bh * 0.085); // kept to a quarter of the girth: the band's curve hides the rest
      g.fillText(AD.lines[0], cx, b0 + bh * 0.54, W * 0.22); g.fillText(AD.lines[1], cx, b0 + bh * 0.65, W * 0.22);
      g.fillStyle = AD.accent; g.font = font(800, bh * 0.1);
      g.fillText(AD.contact, cx, b0 + bh * 0.81, W * 0.24);
    }
    logoAt = (img) => { // the logo, once its SVG has loaded: white on the band, over the offer
      const lh = bh * 0.32, lw = lh / AD.logoAspect;
      for (const k of [0, 1, 2]) g.drawImage(img, W * (1 / 6 + k / 3) - lw / 2, b0 + bh * 0.1, lw, lh);
    };
    g.fillStyle = 'rgba(60,40,40,0.35)'; // load-tape seams between the gores
    for (let i = 0; i < GORES; i++) g.fillRect(i * gw - 1, 0, 3, Hh);
  }, { repeat: false });
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => { logoAt(img); skin.needsUpdate = true; };
    img.src = `${import.meta.env?.BASE_URL ?? '/'}assets/brand/${AD.logo}.svg`;
  }
  const envMat = new THREE.MeshStandardMaterial({ map: skin, emissiveMap: skin, emissive: 0xffb070, emissiveIntensity: 0, roughness: 0.75, side: THREE.DoubleSide });
  const envMesh = new THREE.Mesh(env, envMat);
  envMesh.castShadow = true;

  // basket, burner frame and the cables from the throat to the basket corners
  const parts = [];
  const box = (w, h, d, px, py, pz) => parts.push(new THREE.BoxGeometry(w, h, d).translate(px, py, pz));
  box(2.2, 1.4, 1.7, 0, 0.7, 0);                   // wicker basket
  box(2.4, 0.16, 1.9, 0, 1.42, 0);                  // leather rim
  box(1.1, 0.5, 0.9, 0, 1.4 + ROPE * 0.55, 0);      // burner block
  const top = 1.4 + ROPE, rt = PROFILE[0][0] * R;
  for (let i = 0; i < 8; i++) {                     // cables: throat ring to the basket's corners / burner frame
    const a = (i / 8) * Math.PI * 2, tx = Math.cos(a) * rt, tz = Math.sin(a) * rt;
    const bx = Math.sign(Math.cos(a)) * 1.05 * (Math.abs(Math.cos(a)) > 0.3 ? 1 : 0.5), bz = Math.sign(Math.sin(a)) * 0.8 * (Math.abs(Math.sin(a)) > 0.3 ? 1 : 0.5);
    const p0 = new THREE.Vector3(bx, 1.45, bz), p1 = new THREE.Vector3(tx, top, tz), len = p0.distanceTo(p1);
    const c = new THREE.CylinderGeometry(0.03, 0.03, len, 4);
    c.applyMatrix4(new THREE.Matrix4().lookAt(p0, p1, new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));
    c.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    parts.push(c);
  }
  const rig = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  const n = rig.attributes.position.count, col = new Float32Array(n * 3), wicker = new THREE.Color('#8a6238'), dark = new THREE.Color('#3a3634');
  for (let i = 0; i < n; i++) { const c = rig.attributes.position.getY(i) < 1.6 ? wicker : dark; col.set([c.r, c.g, c.b], i * 3); }
  rig.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const rigMesh = new THREE.Mesh(rig, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  rigMesh.castShadow = true;

  // the burner flame: an additive cone that shows during a burst
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 10, 1, true).translate(0, 1.4 + ROPE * 0.55 + 1.5, 0), flameMat);
  flame.visible = false;

  const group = Object.assign(new THREE.Group(), { name: 'balloon' });
  group.add(envMesh, rigMesh, flame);
  group.position.set(x, y0, z);
  root.add(group);


  let t = 0, burst = 0, nextBurst = 3, yLift = null;
  console.log(`[cherkasy] Balloon: at ${x}, ${z}, basket ${LIFT} m up, envelope ${2 * R} x ${H} m, ${(env.attributes.position.count + n) / 1000 | 0}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    balloon: { x, z, y: y0 },
    clear: () => false,
    update(dt) {
      t += dt;
      // where on the line: hang at home, drift out at a steady walker's pace, hang at the river station, drift back
      const c = (Date.now() / 1000) % cycle, run = total / SPEED, half = cycle / 2;
      const u = c < half ? Math.min(1, Math.max(0, (c - DWELL) / run)) : 1 - Math.min(1, Math.max(0, (c - half - DWELL) / run));
      at(total * u, pos);
      const yg = Math.max(heightAt(pos[0], pos[1]), WATER_Y) + LIFT;  // over the water: the river's surface
      yLift = yLift === null ? yg : yLift + (yg - yLift) * Math.min(1, dt * 0.05); // rise and sink gently, never a jump
      group.position.set(pos[0], yLift + Math.sin(t * 0.3) * 1.2, pos[1]);
      group.rotation.y = t * 0.035;                              // a full turn in ~3 min: the band shows every side
      group.rotation.z = Math.sin(t * 0.21) * 0.012;
      if ((nextBurst -= dt) < 0) { burst = 1.6 + Math.random() * 1.2; nextBurst = 7 + Math.random() * 9; }
      burst = Math.max(0, burst - dt);
      const on = burst > 0 ? 0.75 + 0.25 * Math.sin(t * 40) : 0, nk = nightK.value;
      flame.visible = on > 0; flameMat.opacity = on * 0.9;
      envMat.emissiveIntensity = nk * (0.05 + 0.45 * on);        // the night glow: the envelope lights up on each burst
    },
  };
}
