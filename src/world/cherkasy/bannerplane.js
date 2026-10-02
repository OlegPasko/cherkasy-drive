// OWNER: cherkasy. A banner-towing light plane, like the ad planes over the Florida beaches: a Piper PA-18 Super Cub
// (high wing, taildragger, one prop; Cub yellow with the black lightning stripe, tundra tyres) towing a short banner
// (14 x 4.5 m) on a 45 m line. It flies one wide closed loop round the city at 27 m/s (~100 km/h, a real tow speed),
// a constant ~190 m over the river (~150 m over the highest ground under the loop): north-west off Sosnivka, down the
// Dnipro 150 m out over the water past the Kazbet beach, the Rose Valley, the Mytnytsia beach and the embankment to
// the river station, then inland and back up over bul. Shevchenka and the centre (Druzhba, Soborna square), turning
// out to the river short of the TV tower. A lap is ~8 min, paced by the wall clock (like the balloon), so every player
// sees it in the same place. It banks into the turns (a coordinated turn: lift = g + the centripetal pull, capped at
// 35 degrees), the prop is a spinning blurred disc, and at night it shows red / green / white nav lights and double-flash
// wingtip strobes. The banner trails along the flown path (so it swings wide round the turns behind the plane), hangs
// from its lead pole with the weight at the bottom and flutters harder toward its tail (a cheap per-frame update of a
// 25 x 5 vertex ribbon). No sound: there is no recorded light-plane engine in public/assets/audio (do not generate one).
//
// The banner art is a canvas slot ready to be sold the way the balloon's band is (balloon.js, the bot's `ad-balloon`
// flow): today it shows the Ukrainian flag (#0057B7 over #FFD700). A sold banner (a future `ad-banner` flow in bot/,
// not built yet) sets ART below to { bg, fg, accent?, logo?, logoAspect?, text } or calls setArt(draw) at run time;
// the canvas is BW x BHpx for the 14 x 4.5 m cloth, read from the plane's right side (the shore's side on the river leg;
// the other side shows it mirrored, as on a real banner).
//   buildBannerPlane({ root, heightAt }) -> { update(dt), clear(x, z), plane: { x, y, z, fx, fz (heading), d (m along the loop), lap (s) }, setArt(draw(g, w, h)) }
// No collision (the car flies through it); 6 draw calls; the update allocates nothing.
import * as THREE from 'three';
import { MB, rotX } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { WATER_Y } from '../water.js';

// the loop (map x, z), a closed centripetal Catmull-Rom: the shore leg ~150 m out over the water (sampled off
// ground.isWater), then inland over bul. Shevchenka and the centre, turning back to the river 500 m short of the TV tower
const LOOP = [
  [520, -2280], [800, -2350], [1000, -1700], [1060, -1150], [1080, -600], [1090, -50], [1300, 450], [1180, 1050],
  [1180, 1600], [1600, 2050], [1720, 2350], [1500, 2800], [1300, 3200], [800, 3500], [200, 3200], [-60, 2400],
  [-40, 1500], [10, 700], [80, 0], [160, -800], [260, -1500], [330, -2000]];
const SPEED = 27, G = 9.81, MAX_BANK = 35 * Math.PI / 180;
const ALT = 190, CLEAR = 150;         // m over the river datum / at least over the highest ground under the loop
const DS = 4;                         // path sample spacing (m)
const TOW = 45, BL = 14, BH = 4.5;    // tow line, banner length and height (m)
const COLS = 24, ROWS = 4;            // banner ribbon grid
const BW = 1024, BHpx = 330;          // banner canvas (px), the cloth's aspect
// the banner art: null = the Ukrainian flag; a sold banner: { bg, fg, accent?, logo? (public/assets/brand/<logo>.svg), logoAspect?, text }
const ART = null;
const CUB = '#f2c21b', BLACK = '#17181a', GLASS = '#2d3a44', GREY = '#55585c', TYRE = '#1c1c1c', SILVER = '#b9bcc0';

// fuselage stations: x (forward), half width, y bottom, y top (the wing sits on the cabin top at 0.78)
const ST = [[2.95, 0.34, -0.3, 0.42], [2.3, 0.42, -0.48, 0.58], [0.8, 0.42, -0.56, 0.78], [-0.8, 0.4, -0.55, 0.78],
  [-2.2, 0.27, -0.32, 0.6], [-4.45, 0.05, 0.08, 0.36]];

function paintFlag(g, w, h) {
  g.fillStyle = '#0057b7'; g.fillRect(0, 0, w, h / 2);
  g.fillStyle = '#ffd700'; g.fillRect(0, h / 2, w, h / 2);
}
function paintAd(art) {
  return (g, w, h) => {
    g.fillStyle = art.bg; g.fillRect(0, 0, w, h);
    g.fillStyle = art.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(h * 0.42)}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    g.fillText(art.text, w * (art.logo ? 0.6 : 0.5), h * 0.52, w * (art.logo ? 0.72 : 0.92));
  };
}

function buildCub() {
  const b = new MB();
  // fuselage: side bands (lower yellow, the black stripe, upper yellow / the cabin windows), top, bottom
  const side = (a, c, f0, f1, s) => {
    const ya = (q, f) => q[2] + (q[3] - q[2]) * f;
    b.face([[a[0], ya(a, f0), s * a[1]], [c[0], ya(c, f0), s * c[1]], [c[0], ya(c, f1), s * c[1]], [a[0], ya(a, f1), s * a[1]]], [0, 0, s]);
  };
  for (let i = 0; i < ST.length - 1; i++) {
    const a = ST[i], c = ST[i + 1], cabin = i === 2;
    for (const s of [-1, 1]) {
      b.setColor(CUB); side(a, c, 0, 0.42, s);
      b.setColor(BLACK); side(a, c, 0.42, 0.54, s);
      b.setColor(CUB); side(a, c, 0.54, cabin ? 0.62 : 1, s);
      if (cabin) { b.setColor(GLASS); side(a, c, 0.62, 0.95, s); b.setColor(CUB); side(a, c, 0.95, 1, s); }
    }
    b.setColor(i === 1 ? GLASS : CUB); // the windshield slopes from the cowl up to the wing
    b.face([[a[0], a[3], -a[1]], [a[0], a[3], a[1]], [c[0], c[3], c[1]], [c[0], c[3], -c[1]]], [0, 1, 0]);
    b.setColor(CUB);
    b.face([[a[0], a[2], -a[1]], [c[0], c[2], -c[1]], [c[0], c[2], c[1]], [a[0], a[2], a[1]]], [0, -1, 0]);
  }
  const [f, t] = [ST[0], ST.at(-1)];
  b.face([[f[0], f[2], -f[1]], [f[0], f[2], f[1]], [f[0], f[3], f[1]], [f[0], f[3], -f[1]]], [1, 0, 0]);
  b.face([[t[0], t[2], -t[1]], [t[0], t[3], -t[1]], [t[0], t[3], t[1]], [t[0], t[2], t[1]]], [-1, 0, 0]);
  // spinner (the lathe stands on +y: lay it along +x)
  b.setColor(SILVER).with(new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(2.95, 0.06, 0), (s) => s.lathe([[0.17, 0], [0.15, 0.12], [0.08, 0.28], [0, 0.34]], 10));
  // the wing on the cabin top, 10.7 m span, 1.6 m chord, a black band at the tips; flaps / ailerons are paint lines
  b.setColor(CUB).box(-0.85, 0.78, -4.6, 0.75, 0.9, 4.6);
  b.setColor(BLACK).box(-0.85, 0.78, -5.35, 0.75, 0.9, -4.6).box(-0.85, 0.78, 4.6, 0.75, 0.9, 5.35);
  b.setColor(GREY);
  for (const s of [-1, 1]) { // V struts from the lower longeron to the wing, the gear legs, the tundra tyres
    b.tube([0.55, -0.45, s * 0.4], [0.55, 0.78, s * 3.0], 0.035, 5).tube([-0.3, -0.45, s * 0.4], [-0.45, 0.78, s * 3.0], 0.035, 5);
    b.tube([1.7, -0.5, s * 0.35], [1.85, -1.15, s * 0.95], 0.045, 5).tube([1.0, -0.5, s * 0.3], [1.85, -1.15, s * 0.95], 0.035, 5);
  }
  b.setColor(TYRE);
  for (const s of [-1, 1]) b.with(rotX(Math.PI / 2).setPosition(1.85, -1.15, s * 0.95 + s * 0.13), (q) => q.lathe([[0.2, -0.13], [0.36, -0.1], [0.4, 0], [0.36, 0.1], [0.2, 0.13]], 12));
  b.setColor(GREY).tube([-4.2, 0.08, 0], [-4.45, -0.25, 0], 0.03, 4);
  b.setColor(TYRE).with(rotX(Math.PI / 2).setPosition(-4.45, -0.3, 0.04), (q) => q.cyl(0, 0, 0, 0.1, 0.1, 0.08, 8));
  // tail: the stabiliser, the fin and rudder (a black-edged rudder), the tow hook at the tail post
  b.setColor(CUB).box(-4.55, 0.26, -1.6, -3.65, 0.31, 1.6);
  b.setColor(BLACK).box(-4.55, 0.26, -1.6, -4.4, 0.31, 1.6);
  for (const s of [-1, 1]) {
    b.setColor(CUB).face([[-3.7, 0.36, s * 0.03], [-4.25, 1.45, s * 0.03], [-4.6, 1.45, s * 0.03], [-4.45, 0.36, s * 0.03]], [0, 0, s]);
    b.setColor(BLACK).face([[-4.45, 0.36, s * 0.035], [-4.6, 1.45, s * 0.035], [-4.72, 1.35, s * 0.035], [-4.72, 0.36, s * 0.035]], [0, 0, s]);
  }
  b.setColor(GREY).box(-4.75, 0.02, -0.03, -4.45, 0.08, 0.03);
  return b.build();
}

export function buildBannerPlane({ root, heightAt }) {
  const t0 = performance.now();
  // ---- the path: spaced samples with the heading and the banked "up" (lift) vector, all in flat arrays
  const curve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  curve.arcLengthDivisions = 6000;
  const total = curve.getLength(), N = Math.round(total / DS), ds = total / N;
  const pts = curve.getSpacedPoints(N); // N + 1 points, the last = the first
  const PX = new Float32Array(N), PZ = new Float32Array(N), FX = new Float32Array(N), FZ = new Float32Array(N);
  const AX = new Float32Array(N), AZ = new Float32Array(N), UX = new Float32Array(N), UY = new Float32Array(N), UZ = new Float32Array(N);
  let hiGround = WATER_Y;
  for (let i = 0; i < N; i++) {
    PX[i] = pts[i].x; PZ[i] = pts[i].z;
    const h = heightAt(PX[i], PZ[i]); if (Number.isFinite(h)) hiGround = Math.max(hiGround, h);
  }
  const Y = Math.max(WATER_Y + ALT, hiGround + CLEAR);
  const w = (i) => (i + N) % N;
  for (let i = 0; i < N; i++) {
    const dx = PX[w(i + 1)] - PX[w(i - 1)], dz = PZ[w(i + 1)] - PZ[w(i - 1)], l = Math.hypot(dx, dz) || 1;
    FX[i] = dx / l; FZ[i] = dz / l;
  }
  // centripetal acceleration v^2 * curvature (dT/ds points to the turn centre), smoothed over ~±60 m so the roll eases in
  const K = 15, ax = new Float32Array(N), az = new Float32Array(N);
  for (let i = 0; i < N; i++) { ax[i] = SPEED * SPEED * (FX[w(i + 1)] - FX[w(i - 1)]) / (2 * ds); az[i] = SPEED * SPEED * (FZ[w(i + 1)] - FZ[w(i - 1)]) / (2 * ds); }
  const maxA = G * Math.tan(MAX_BANK);
  let maxBank = 0;
  for (let i = 0; i < N; i++) {
    let sx = 0, sz = 0;
    for (let k = -K; k <= K; k++) { sx += ax[w(i + k)]; sz += az[w(i + k)]; }
    sx /= 2 * K + 1; sz /= 2 * K + 1;
    const a = Math.hypot(sx, sz); if (a > maxA) { sx *= maxA / a; sz *= maxA / a; }
    AX[i] = sx; AZ[i] = sz;
    const l = Math.hypot(sx, G, sz); UX[i] = sx / l; UY[i] = G / l; UZ[i] = sz / l;
    maxBank = Math.max(maxBank, Math.acos(UY[i]));
  }
  // linear lookup at arc length d (wrapped): position and heading, plus the lift vector when asked
  const S = { x: 0, z: 0, fx: 1, fz: 0, ux: 0, uy: 1, uz: 0 };
  const sample = (d, up) => {
    d = ((d % total) + total) % total;
    const f = d / ds, i = Math.floor(f) % N, j = (i + 1) % N, k = f - Math.floor(f);
    S.x = PX[i] + (PX[j] - PX[i]) * k; S.z = PZ[i] + (PZ[j] - PZ[i]) * k;
    S.fx = FX[i] + (FX[j] - FX[i]) * k; S.fz = FZ[i] + (FZ[j] - FZ[i]) * k;
    if (up) { S.ux = UX[i] + (UX[j] - UX[i]) * k; S.uy = UY[i] + (UY[j] - UY[i]) * k; S.uz = UZ[i] + (UZ[j] - UZ[i]) * k; }
    return S;
  };

  // ---- the plane: body, prop disc, nav lights / strobes (points), one group placed by a basis matrix
  const body = new THREE.Mesh(buildCub(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }));
  body.castShadow = true;
  const propTex = canvasTex(128, 128, (g) => { // two blurred blades: dark smears fading out from the hub, a yellow tip ring
    const c = 64; g.clearRect(0, 0, 128, 128);
    for (let a = 0; a < 360; a += 3) {
      const r = (a * Math.PI) / 180, k = Math.pow(Math.abs(Math.cos(r)), 6) * 0.55 + 0.12;
      g.strokeStyle = `rgba(30,30,30,${k})`; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(r) * 60, c + Math.sin(r) * 60); g.stroke();
    }
    g.strokeStyle = 'rgba(240,200,40,0.5)'; g.lineWidth = 4; g.beginPath(); g.arc(c, c, 58, 0, Math.PI * 2); g.stroke();
  }, { repeat: false });
  const prop = new THREE.Mesh(new THREE.CircleGeometry(0.96, 24).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: propTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 }));
  prop.position.set(3.08, 0.06, 0);
  const glowTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, { repeat: false, srgb: false });
  // left tip red, right tip green, tail white, two wingtip strobes (white)
  const LP = new Float32Array([0, 0.84, -5.4, 0, 0.84, 5.4, -4.75, 0.4, 0, -0.3, 0.84, -5.4, -0.3, 0.84, 5.4]);
  const LC = new Float32Array(15), BASE = [[3, 0.15, 0.1], [0.15, 3, 0.4], [2.2, 2.2, 2.2]];
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.BufferAttribute(LP, 3));
  lightGeo.setAttribute('color', new THREE.BufferAttribute(LC, 3));
  const lightMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: glowTex, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const lights = new THREE.Points(lightGeo, lightMat);
  lights.frustumCulled = false;
  const plane = Object.assign(new THREE.Group(), { name: 'bannerplane', matrixAutoUpdate: false });
  plane.add(body, prop, lights);
  for (const o of [body, prop, lights]) o.updateMatrix();

  // ---- the banner: a ribbon of (COLS + 1) x (ROWS + 1) vertices rewritten each frame, u along the cloth from the pole
  const nV = (COLS + 1) * (ROWS + 1), BP = new Float32Array(nV * 3), BN = new Float32Array(nV * 3), BUV = new Float32Array(nV * 2), idx = [];
  for (let c = 0; c <= COLS; c++) for (let r = 0; r <= ROWS; r++) { const v = c * (ROWS + 1) + r; BUV[2 * v] = c / COLS; BUV[2 * v + 1] = 1 - r / ROWS; }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const a = c * (ROWS + 1) + r; idx.push(a, a + 1, a + ROWS + 2, a, a + ROWS + 2, a + ROWS + 1); }
  const bannerGeo = new THREE.BufferGeometry();
  bannerGeo.setAttribute('position', new THREE.BufferAttribute(BP, 3).setUsage(THREE.DynamicDrawUsage));
  bannerGeo.setAttribute('normal', new THREE.BufferAttribute(BN, 3).setUsage(THREE.DynamicDrawUsage));
  bannerGeo.setAttribute('uv', new THREE.BufferAttribute(BUV, 2));
  bannerGeo.setIndex(idx);
  let draw = ART ? paintAd(ART) : paintFlag;
  const art = canvasTex(BW, BHpx, (g, cw, ch) => draw(g, cw, ch), { repeat: false });
  const repaint = () => { const g = art.image.getContext('2d'); g.clearRect(0, 0, BW, BHpx); draw(g, BW, BHpx); art.needsUpdate = true; };
  if (ART?.logo && typeof Image !== 'undefined') { // a sold banner's logo, drawn on its left once the SVG is in
    const img = new Image();
    img.onload = () => { const base = draw; draw = (g, cw, ch) => { base(g, cw, ch); const lh = ch * 0.6, lw = lh / (ART.logoAspect ?? 1); g.drawImage(img, cw * 0.04, (ch - lh) / 2, lw, lh); }; repaint(); };
    img.src = `${import.meta.env?.BASE_URL ?? '/'}assets/brand/${ART.logo}.svg`;
  }
  const banner = new THREE.Mesh(bannerGeo, new THREE.MeshStandardMaterial({ map: art, roughness: 0.85, side: THREE.DoubleSide }));
  banner.frustumCulled = false; // rewritten every frame: no stale bounds
  // the lead pole with its weight, and the tow line + the bridle as line segments (hook, 5 sag points, the two bridle legs)
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, BH + 0.5, 6).translate(0, -BH / 2, 0);
  const pole = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6 }));
  const weight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6).translate(0, -BH - 0.25, 0), pole.material);
  pole.add(weight); weight.updateMatrix();
  const RP = new Float32Array(9 * 3 * 2), SAG = 1.5; // 7 rope segments + 2 bridle legs
  const ropeGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(RP, 3).setUsage(THREE.DynamicDrawUsage));
  const rope = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: 0x3a3a38 }));
  rope.frustumCulled = false;
  const group = Object.assign(new THREE.Group(), { name: 'bannerplane-rig' });
  group.add(plane, banner, pole, rope);
  root.add(group);

  const live = { x: 0, y: Y, z: 0, fx: 1, fz: 0, d: 0, lap: total / SPEED };
  const m = plane.matrix.elements, rope3 = (k, x, y, z) => { RP[k * 3] = x; RP[k * 3 + 1] = y; RP[k * 3 + 2] = z; };
  const epoch = Date.now() - performance.now(); // the wall clock at sub-ms resolution: smooth, and the same for everyone
  let t = 0, spin = 0;
  console.log(`[cherkasy] Banner plane: ${(total / 1000).toFixed(1)} km loop, ${(total / SPEED / 60).toFixed(1)} min a lap, ${Y.toFixed(0)} m (ground under the loop up to ${hiGround.toFixed(0)} m), bank up to ${(maxBank * 180 / Math.PI).toFixed(0)} deg, ${body.geometry.attributes.position.count} verts in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    plane: live,
    clear: () => false,
    setArt(fn) { draw = fn || paintFlag; repaint(); },
    update(dt) {
      t += dt;
      const d = (((epoch + performance.now()) / 1000) * SPEED) % total;
      const y = Y + Math.sin(t * 0.37) * 2.5 + Math.sin(t * 1.1) * 0.4; // gentle bumps
      const s = sample(d, true);
      // basis: x forward (level heading), y the banked lift vector made square to it, z = x * y (the right wing)
      let fx = s.fx, fz = s.fz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const wob = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 2.3) * 0.012; // a little roll in the bumps
      let ux = s.ux, uy = s.uy, uz = s.uz; const dot = ux * fx + uz * fz; ux -= dot * fx; uz -= dot * fz;
      let ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      let rx = -uy * fz, ry = fz * ux - fx * uz, rz = uy * fx; // f x u with f.y = 0
      const cw = Math.cos(wob), sw = Math.sin(wob); // roll u about f: u cos + (f x u) sin
      ux = ux * cw + rx * sw; uy = uy * cw + ry * sw; uz = uz * cw + rz * sw;
      ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      rx = -uy * fz; ry = fz * ux - fx * uz; rz = uy * fx;
      m[0] = fx; m[1] = 0; m[2] = fz; m[4] = ux; m[5] = uy; m[6] = uz; m[8] = rx; m[9] = ry; m[10] = rz;
      m[12] = s.x; m[13] = y; m[14] = s.z;
      plane.matrixWorldNeedsUpdate = true;
      live.x = s.x; live.y = y; live.z = s.z; live.fx = fx; live.fz = fz; live.d = d;
      const hx = s.x - fx * 4.75 + ux * 0.05, hy = y + uy * 0.05, hz = s.z - fz * 4.75 + uz * 0.05; // the tow hook
      spin += dt * 230; prop.rotation.x = spin % (Math.PI * 2);

      // the banner: column c sits on the flown path TOW + c * BL / COLS behind; it hangs a little below the line and
      // flutters sideways, more toward the tail, with a twist down the rows
      const top = y - 3;
      for (let c = 0; c <= COLS; c++) {
        const q = sample(d - TOW - (c * BL) / COLS, false), k = c / COLS;
        const nx = -q.fz, nz = q.fx; // the side normal of the path there
        for (let r = 0; r <= ROWS; r++) {
          const v = c * (ROWS + 1) + r, h = r / ROWS;
          const amp = 0.08 + 0.55 * k * k, ph = k * 9.5 - t * 11 + h * 0.8;
          const off = amp * Math.sin(ph) + 0.05 * Math.sin(t * 23 + c * 1.7);
          BP[3 * v] = q.x + nx * off; BP[3 * v + 1] = top - h * BH - k * k * 0.6 * h; BP[3 * v + 2] = q.z + nz * off;
          // the cloth runs back along -f bending by g = d(off)/ds: its normal is (n + f g) / |..|
          const g = (amp * 9.5 / BL) * Math.cos(ph), ln = Math.hypot(1, g);
          BN[3 * v] = (nx + q.fx * g) / ln; BN[3 * v + 1] = 0; BN[3 * v + 2] = (nz + q.fz * g) / ln;
        }
        if (c === 0) pole.position.set(BP[0], top, BP[2]);
      }
      bannerGeo.attributes.position.needsUpdate = true; bannerGeo.attributes.normal.needsUpdate = true;
      // the line: hook -> a shallow sag -> the bridle ring 3 m ahead of the pole, then two legs to the pole's ends
      const bx = BP[0], bz = BP[2], br = sample(d - TOW + 3, false), ex = br.x, ey = top - BH * 0.5, ez = br.z;
      for (let i = 0; i < 7; i++) {
        for (let e = 0; e < 2; e++) {
          const u = (i + e) / 7, sag = 4 * u * (1 - u) * SAG;
          rope3(i * 2 + e, hx + (ex - hx) * u, hy + (ey - hy) * u - sag, hz + (ez - hz) * u);
        }
      }
      rope3(14, ex, ey, ez); rope3(15, bx, top + 0.2, bz);
      rope3(16, ex, ey, ez); rope3(17, bx, top - BH - 0.1, bz);
      ropeGeo.attributes.position.needsUpdate = true;

      // lights: steady nav lights at dusk and night, the double strobe flash every 1.2 s day and night
      const nk = nightK.value, nav = nk, ph = t % 1.2, flash = ph < 0.05 || (ph > 0.15 && ph < 0.2) ? 1 : 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) LC[i * 3 + j] = BASE[i][j] * nav;
      for (let i = 3; i < 5; i++) for (let j = 0; j < 3; j++) LC[i * 3 + j] = flash * (1 + 3 * nk);
      lightGeo.attributes.color.needsUpdate = true;
      lightMat.size = 4 + 8 * nk;
    },
  };
}
