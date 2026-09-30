// The standing quest "Пам'ятки Черкас": visit every sight of world.places (kind 'sight'). A sight counts once the car
// comes within its reach (the footprint's size plus a street's width, on the ground or in low flight). Visited ids live
// in localStorage ('cherkasy.explore'), and so does the list of sights the player has already seen on the map: when new
// ones are added to places.js, a returning player is told how many are new and the counter grows with them. Ids that
// left places.js stay stored (harmless) but do not count.
// Each tracked place gets p.visited = true | false, which the map badges read (mapdraw.js: dim until visited, then a
// check); places without the flag (the phone map) draw as before.
//   createExplore({ world, player, hud?, reward?(n) (money for a new sight), storage? (localStorage) })
//     -> { update(dt), visit(id) (debug), reset() (debug), visited: n, total: n, list: [place] }
//   reachOf(place) -> metres (pure: the footprint's radius around its anchor + 40, at least 60)
import { track } from '../analytics.js';

const KEY = 'cherkasy.explore';
const REWARD = 50, REWARD_ALL = 1000;
const MAX_ALT = 180;   // metres over the ground: a low pass over a sight counts, a cruise high above it does not
const EVERY = 0.25;    // s between checks

export function reachOf(p) {
  let r = 0;
  for (const ring of p.rings || []) for (let i = 0; i < ring.length; i += 2) r = Math.max(r, Math.hypot(ring[i] - p.x, ring[i + 1] - p.z));
  return Math.max(60, r + 40);
}

export function createExplore({ world, player, hud = null, reward = null, storage = globalThis.localStorage }) {
  const list = (world?.places || []).filter((q) => q.kind === 'sight' && Number.isFinite(q.x) && Number.isFinite(q.z));
  const reach = new Map(list.map((q) => [q, reachOf(q)]));
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(KEY) || 'null') || {}; } catch { /* storage off or a bad record */ }
  const done = new Set(Array.isArray(saved.visited) ? saved.visited : []);
  const known = new Set(Array.isArray(saved.known) ? saved.known : []);
  const fresh = known.size ? list.filter((q) => !known.has(q.id) && !done.has(q.id)).length : 0; // added since the last visit
  for (const q of list) { q.visited = done.has(q.id); known.add(q.id); }
  const count = () => list.reduce((n, q) => n + (q.visited ? 1 : 0), 0);
  const save = () => { try { storage?.setItem(KEY, JSON.stringify({ visited: [...done], known: [...known] })); } catch { /* storage off */ } };
  save();
  hud?.setExplore?.(count(), list.length);
  let t = 0, greet = fresh ? 4 : -1; // the "new sights" note waits for the loading screen to fade

  function visit(q) {
    if (!q || q.visited) return false;
    q.visited = true; done.add(q.id); save(); track('sight_visited', { sight: q.id });
    const n = count(), all = n === list.length;
    reward?.(all ? REWARD + REWARD_ALL : REWARD);
    hud?.setExplore?.(n, list.length, true);
    hud?.mission?.banner(all ? 'Усі пам’ятки відкрито!' : `${q.icon} ${q.name}`,
      all ? `${n} з ${n} · +${REWARD + REWARD_ALL} ₴` : `Пам’ятка ${n} з ${list.length} · +${REWARD} ₴`, '#f2c14e');
    return true;
  }

  return {
    list,
    get visited() { return count(); },
    get total() { return list.length; },
    visit: (id) => visit(list.find((q) => q.id === id)),
    reset() { done.clear(); for (const q of list) q.visited = false; save(); hud?.setExplore?.(0, list.length); },
    update(dt) {
      if (greet > 0 && (greet -= dt) <= 0) hud?.mission?.banner(`Нові пам’ятки: ${fresh}`, 'Вони вже на мапі (M) – ще не відвідані', '#f2c14e');
      if ((t += dt) < EVERY) return;
      t = 0;
      const P = player.position;
      let alt = null;
      for (const q of list) {
        if (q.visited || Math.hypot(P.x - q.x, P.z - q.z) > reach.get(q)) continue;
        alt ??= P.y - (world.groundHeight?.(P.x, P.z) ?? P.y);
        if (alt < MAX_ALT) visit(q);
      }
    },
  };
}
