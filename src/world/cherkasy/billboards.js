// OWNER: cherkasy. Roadside billboards (3 x 6 m "bigboards" on two steel posts, lit from lamp arms at night) that
// players can order through the Telegram bot (@driver_game_bot). Until a slot is sold it shows the placeholder art.
//   BILLBOARDS: [{ id, at: [x, z] | ll: [lat, lon], yaw: radians | 'road', turn?: deg, art: 'placeholder' | url,
//     size?: [w, h] metres (default [6, 3]; keep 2:1), lift?: panel bottom above the ground (default 4) }]
//   buildBillboards({ root, map, solids, zips, heightAt, geo }) -> { update(dt), clear(x, z), boards: [{ id, x, z, yaw }] } | null
//
// Adding a real billboard:
//   1. Pick a spot beside a busy road, ideally just before or at a junction corner: on the grass or the verge, at least
//      ~2 m clear of the carriageway edge (road half-width `w / 2` from its centre line in map.json roads) and of any
//      footway (`c: 'footway'`), and off car parks. The panel hangs 4 m up, so it may overhang a verge, never a lane.
//      In the game, `__game.world.cherkasy.ground.onAsphalt(x, z)` and `__game.world.collision.topAt(x, z).id` (>= 0 is
//      a solid) check a candidate; `?cam=x,y,z,tx,ty,tz` shows it.
//   2. Face the traffic: `yaw: 'road'` turns the face against the flow of the nearest road on the board's side (one-way
//      roads flow in the order of their points, two-way ones drive on the right), then `turn` degrees (default 15)
//      toward the carriageway so drivers see it square-on. A number is an explicit yaw (0 faces +z, pi / 2 faces +x).
//   3. Art: a 2:1 image, 2048 x 1024 px (at least 1536 x 768), JPG or PNG in sRGB, put under public/assets/billboards/
//      and referenced as 'assets/billboards/<id>.jpg' (resolved against the Vite base). Keep text large – drivers read
//      it at 30–80 m – and ~5% margins; the frame covers the outer edge. The placeholder shows until the image loads.
//   4. Add the entry below with a stable id (the bot issue number or the client's name), rebuild, check it by day and
//      at night (T cycles the time of day).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nightK } from '../../render/daylight.js';

export const BILLBOARDS = [
  // Nadpilna (one-way, flowing south-east): the verge between the footway and the U space car park, facing the
  // traffic that has just passed the B. Khmelnytskoho junction; the service drive at the south end of the block is the corner
  { id: 'nadpilna-uspace', at: [-729, 1446], yaw: 'road', size: [8, 4], art: 'placeholder' },
];

const TG = '#229ed9', TG_HI = '#2aabee';
const CAR_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

// the "your ad here" face: Telegram-blue field, two big lines, a white strip with the bot's name
function placeholderArt() {
  const W = 2048, H = 1024, cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, W, H); sky.addColorStop(0, TG_HI); sky.addColorStop(1, '#1b86bd');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const say = (t, x, y, maxW, font, fill, align = 'center') => {
    g.font = font; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = fill;
    const sx = Math.min(1, maxW / g.measureText(t).width);
    g.save(); g.translate(x, y); g.scale(sx, 1); g.fillText(t, 0, 0); g.restore();
  };
  const SANS = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
  say('ТУТ МОЖЕ БУТИ', W / 2, 170, 1800, `900 170px ${SANS}`, '#ffffff');
  say('ВАША РЕКЛАМА', W / 2, 370, 1880, `900 240px ${SANS}`, '#ffffff');
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(80, 540, W - 160, 420, 60); g.fill();
  // the paper plane in a blue disc
  const cx = 280, cy = 750, r = 150;
  g.fillStyle = TG; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath();
  [[-90, -7], [80, -71], [50, 80], [9, 34], [-16, 66], [-21, 23]].forEach(([dx, dy], i) => (i ? g.lineTo : g.moveTo).call(g, cx + dx, cy + dy));
  g.closePath(); g.fill();
  say('Замовляйте в Telegram-боті', 480, 650, 1460, `bold 128px ${SANS}`, '#1d2b36', 'left');
  say('@driver_game_bot', 480, 845, 1460, `900 200px ${SANS}`, TG, 'left');
  return Object.assign(new THREE.CanvasTexture(cv), { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
}

// face yaw from the nearest car road: against the flow on the board's side, turned `turn` degrees toward the lanes
function roadYaw(map, x, z, turn) {
  let best = null;
  for (const r of map.roads ?? []) {
    if (r.k !== 'm' || !CAR_ROADS.has(r.c)) continue;
    const p = r.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], ex = p[i + 2] - ax, ez = p[i + 3] - az, L2 = ex * ex + ez * ez;
      if (!L2) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
      const qx = ax + ex * t - x, qz = az + ez * t - z, d = Math.hypot(qx, qz);
      if (!best || d < best.d) best = { d, qx, qz, ex, ez, ow: !!r.ow };
    }
  }
  if (!best) return 0;
  const L = Math.hypot(best.ex, best.ez);
  let dx = best.ex / L, dz = best.ez / L;
  // right-hand traffic: of the two directions of a two-way road, the one that passes the board on its right
  if (!best.ow && (-best.qx) * -dz + (-best.qz) * dx < 0) { dx = -dx; dz = -dz; }
  const a = (turn * Math.PI) / 180, toRoad = Math.hypot(best.qx, best.qz) || 1;
  const nx = -dx * Math.cos(a) + (best.qx / toRoad) * Math.sin(a), nz = -dz * Math.cos(a) + (best.qz / toRoad) * Math.sin(a);
  return Math.atan2(nx, nz);
}

export function buildBillboards({ root, map, solids, zips, heightAt, geo }) {
  if (typeof document === 'undefined' || !BILLBOARDS.length) return null;
  const steel = new THREE.MeshStandardMaterial({ color: 0x5d6368, roughness: 0.55, metalness: 0.7 });
  const back = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.8, metalness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xfff4dc, emissiveIntensity: 0.1, roughness: 0.3 });
  const faces = [], boards = [];
  let placeholder = null;
  const base = import.meta.env?.BASE_URL ?? '/';

  for (const b of BILLBOARDS) {
    const [x, z] = b.at ?? (geo && b.ll ? geo.toXZ(b.ll[0], b.ll[1]) : [NaN, NaN]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const [W, H] = b.size ?? [6, 3], lift = b.lift ?? 4, D = 0.35, postX = W * 0.3;
    const yaw = typeof b.yaw === 'number' ? b.yaw : roadYaw(map, x, z, b.turn ?? 15);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // local (u across the face, v out of it) -> world; the face points along (sin yaw, cos yaw)
    const wx = (u, v) => x + u * c + v * s, wz = (u, v) => z - u * s + v * c;
    const g0 = Math.min(heightAt(wx(-postX, 0), wz(-postX, 0)), heightAt(wx(postX, 0), wz(postX, 0))) - 0.3;
    const y0 = g0 + 0.3 + lift, y1 = y0 + H;

    // steel in local space: posts, the panel box, a service walkway, three lamp arms
    const parts = [];
    const add = (geom, px, py, pz) => parts.push(geom.translate(px, py, pz));
    for (const u of [-postX, postX]) add(new THREE.CylinderGeometry(0.16, 0.2, y0 - g0 + 0.4, 12), u, (y0 - g0 + 0.4) / 2, -D);
    add(new THREE.BoxGeometry(W + 0.3, H + 0.3, D), 0, lift + 0.3 + H / 2, -D / 2 - 0.02);
    add(new THREE.BoxGeometry(W + 0.3, 0.06, 0.8), 0, lift + 0.1, 0.25);
    const arms = [-W / 3, 0, W / 3];
    for (const u of arms) add(new THREE.BoxGeometry(0.06, 0.06, 1.2), u, lift + 0.3 + H + 0.2, 0.45);
    const frame = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), steel);
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateY(Math.PI).translate(0, lift + 0.3 + H / 2, -D - 0.03), back);
    const lamps = new THREE.Mesh(mergeGeometries(arms.map((u) => new THREE.BoxGeometry(0.5, 0.12, 0.22).translate(u, lift + 0.3 + H + 0.14, 1.0))), lampMat);

    if (!placeholder) placeholder = placeholderArt();
    const mat = new THREE.MeshStandardMaterial({ map: placeholder, emissiveMap: placeholder, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.6 });
    if (b.art && b.art !== 'placeholder') {
      const src = /^(https?:|\/)/.test(b.art) ? b.art : base + b.art;
      new THREE.TextureLoader().load(src, (t) => {
        Object.assign(t, { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
        mat.map = mat.emissiveMap = t; mat.needsUpdate = true;
      }, undefined, (e) => console.warn(`[billboards] ${b.id}: art failed, keeping the placeholder`, e));
    }
    faces.push(mat);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    face.position.set(0, lift + 0.3 + H / 2, 0.01);

    const grp = new THREE.Group();
    grp.name = `billboard-${b.id}`;
    grp.position.set(x, g0, z); grp.rotation.y = yaw;
    for (const m of [frame, rear, lamps, face]) { m.castShadow = m !== lamps; m.receiveShadow = true; grp.add(m); }
    root.add(grp);

    // only the posts and the panel collide; flying into the board stops the car like a wall
    for (const u of [-postX, postX]) solids.cyl(wx(u, -D), wz(u, -D), g0, y0 + 0.3, 0.2, 0.2, 'pole');
    solids.obox(wx(0, -D / 2), wz(0, -D / 2), (W + 0.3) / 2, D / 2 + 0.05, -yaw, y0 - 0.1, y1 + 0.15, 'wall');
    for (const u of [-W / 2, W / 2]) zips?.add(wx(u, -D / 2), y1 + 0.15, wz(u, -D / 2), s, 0, c, 'roofCorner');
    boards.push({ id: b.id, x, z, yaw });
  }
  if (!boards.length) return null;

  return {
    boards,
    clear: (px, pz) => boards.some((b) => (px - b.x) ** 2 + (pz - b.z) ** 2 < 36),
    update() {
      const k = nightK.value;
      for (const m of faces) m.emissiveIntensity = 0.1 + 0.85 * k;
      lampMat.emissiveIntensity = 0.1 + 3 * k;
    },
  };
}
