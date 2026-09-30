// Where a request is on the map, for the "look in the game" link: OpenStreetMap Nominatim turns a typed address into a
// point (bounded to Cherkasy) and a pin into its street name. Best effort: a slow or empty answer gives null.
//   geocode(text) -> { lat, lon, road } | null;  reverse(lat, lon) -> road | '';  gameLink(base, { lat, lon, road }) -> URL
//   feature({ lat, lon } | { text }) -> { name, kind: 'category/type', osm: 'way/123', lat, lon, tags: { wikidata, wikipedia,
//     heritage, historic, tourism, building, … } } | null   the OSM object there, for spotting landmarks (bot.js)
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const VIEWBOX = '31.9,49.53,32.22,49.33'; // left, top, right, bottom – the same box as place.js
const HEADERS = { 'user-agent': 'driver-game-bot/1.0 (+https://t.me/driver_game_bot)', 'accept-language': 'uk' };

async function get(path) {
  try {
    const r = await fetch(`${NOMINATIM}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null; // awaited: a non-JSON 200 lands in the catch
  } catch { return null; }
}

async function geocode(text) {
  if (!text) return null;
  const q = /черкас/i.test(text) ? text : `${text}, Черкаси`;
  const [hit] = (await get(`/search?format=jsonv2&limit=1&addressdetails=1&bounded=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`)) || [];
  return hit ? { lat: +hit.lat, lon: +hit.lon, road: hit.address?.road || '' } : null;
}

async function reverse(lat, lon) {
  const hit = await get(`/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lon}`);
  return hit?.address?.road || '';
}

const NOTABLE = ['wikidata', 'wikipedia', 'heritage', 'heritage:operator', 'historic', 'tourism', 'building', 'amenity', 'leisure', 'memorial', 'architect', 'start_date', 'name:en'];
async function feature(where) {
  if (!where) return null;
  const q = where.lat != null ? `/reverse?format=jsonv2&zoom=18&extratags=1&namedetails=1&lat=${where.lat}&lon=${where.lon}`
    : `/search?format=jsonv2&limit=1&extratags=1&namedetails=1&bounded=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(/черкас/i.test(where.text) ? where.text : `${where.text}, Черкаси`)}`;
  const r = await get(q), hit = Array.isArray(r) ? r[0] : r;
  if (!hit || hit.error) return null;
  const x = hit.extratags || {}, tags = Object.fromEntries(NOTABLE.filter((k) => x[k]).map((k) => [k, x[k]]));
  return { name: hit.name || hit.namedetails?.name || '', kind: `${hit.category}/${hit.type}`, osm: `${hit.osm_type}/${hit.osm_id}`, lat: +hit.lat, lon: +hit.lon, tags };
}

function gameLink(base, { lat, lon, road }) {
  const u = new URL(base);
  u.searchParams.set('at', `${lat.toFixed(5)},${lon.toFixed(5)}`);
  if (road) u.searchParams.set('road', road);
  u.searchParams.set('utm_source', 'telegram');
  return u.href;
}

module.exports = { geocode, reverse, feature, gameLink };
