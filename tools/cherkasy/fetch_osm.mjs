// Downloads the raw OpenStreetMap data for the Cherkasy map (Overpass API) into tools/cherkasy/raw/<part>.json.
// Data (c) OpenStreetMap contributors, ODbL. Run: node tools/cherkasy/fetch_osm.mjs [part...]
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

export const BBOX = [49.395, 31.965, 49.49, 32.115]; // south, west, north, east
const b = BBOX.join(',');
const PARTS = {
  buildings: `way["building"](${b}); relation["building"](${b}); way["building:part"](${b});`,
  roads: `way["highway"](${b}); way["railway"](${b}); way["area:highway"](${b}); way["bridge"](${b});`,
  land: `way["natural"](${b}); node["natural"="tree"](${b}); way["landuse"](${b}); relation["landuse"](${b}); way["leisure"](${b}); relation["leisure"](${b}); way["waterway"](${b});`,
  water: `relation["natural"="water"](${b}); relation["natural"]["natural"!="water"](${b});`,
  poi: `way["amenity"](${b}); node["amenity"](${b}); way["man_made"](${b}); node["man_made"](${b}); way["historic"](${b}); node["historic"](${b}); way["tourism"](${b}); node["tourism"](${b}); node["place"](${b}); way["barrier"](${b});`,
};
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PARTS);
mkdirSync(new URL('./raw/', import.meta.url), { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failed = 0;
for (const part of want) {
  const out = new URL(`./raw/${part}.json`, import.meta.url);
  if (existsSync(out) && !process.env.FORCE) { console.log(part, 'cached'); continue; }
  const query = `[out:json][timeout:300];(${PARTS[part]});out geom;`;
  let ok = false;
  for (let attempt = 0; attempt < 6 && !ok; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      console.log(part, 'from', url);
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'cherkasy-drive/1.0' } });
      const txt = await r.text();
      if (!r.ok || txt[0] !== '{') { console.warn('  failed', r.status); await sleep(15000); continue; }
      writeFileSync(out, txt);
      console.log('  saved', (txt.length / 1e6).toFixed(1), 'MB,', JSON.parse(txt).elements.length, 'elements');
      ok = true;
    } catch (e) { console.warn('  error', e.message); await sleep(15000); }
  }
  if (!ok) failed++;
  await sleep(3000);
}
process.exit(failed ? 1 : 0);
