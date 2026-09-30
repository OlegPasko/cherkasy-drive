// Where a request points: a Telegram location, coordinates typed or pasted, or a Google Maps link (short
// maps.app.goo.gl links are resolved through their redirects). Anything else is kept as a plain address.
//   parsePlace(text | { latitude, longitude }) -> Promise<{ lat, lon, text?, url } | { text } | null>
//   inCherkasy({ lat, lon }) -> bool;  mapsUrl(lat, lon) -> string;  fromStart('p4944412_3205912') -> { lat, lon } | null
const BOX = { lat: [49.33, 49.53], lon: [31.9, 32.22] }; // the city with its outskirts and the far bank

const mapsUrl = (lat, lon) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
const inCherkasy = ({ lat, lon }) => lat > BOX.lat[0] && lat < BOX.lat[1] && lon > BOX.lon[0] && lon < BOX.lon[1];

// the dropped pin wins over the viewport centre: !3d!4d (place data), then q= / ll= / query=, then @lat,lon, then bare
const PATTERNS = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /[?&](?:q|ll|query|destination|center)=(?:loc:)?(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /(-?\d{1,2}\.\d{2,})\s*[,;\s]\s*(-?\d{1,3}\.\d{2,})/,
];
function coordsIn(s) {
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m) { const lat = +m[1], lon = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }; }
  }
  return null;
}

async function resolveShort(url) { // follow up to 4 redirects by hand, reading each Location
  let u = url;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
      const next = r.headers.get('location');
      if (!next) break;
      u = new URL(next, u).href;
      if (coordsIn(decodeURIComponent(u))) break;
    } catch { break; }
  }
  return u;
}

async function parsePlace(input) {
  if (!input) return null;
  if (typeof input === 'object' && 'latitude' in input) {
    const lat = input.latitude, lon = input.longitude;
    return { lat, lon, url: mapsUrl(lat, lon) };
  }
  const text = String(input).trim();
  const link = text.match(/https?:\/\/\S+/)?.[0];
  let c = coordsIn(text);
  if (!c && link && /goo\.gl|maps\.app|g\.co/.test(link)) c = coordsIn(decodeURIComponent(await resolveShort(link)));
  if (c) {
    const rest = text.replace(/https?:\/\/\S+/, '').replace(/-?\d+\.\d+\s*[,;\s]\s*-?\d+\.\d+/, '').trim();
    return { ...c, url: mapsUrl(c.lat, c.lon), ...(rest && { text: rest }) };
  }
  return { text };
}

function fromStart(s) { // deep link from the game: p<lat*1e5>_<lon*1e5>
  const m = /^p(\d{7})_(\d{7})$/.exec(s || '');
  if (!m) return null;
  const q = { lat: +m[1] / 1e5, lon: +m[2] / 1e5 };
  return inCherkasy(q) ? q : null;
}

module.exports = { parsePlace, inCherkasy, mapsUrl, fromStart };
