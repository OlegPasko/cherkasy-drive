// Downloads elevation tiles (Mapzen / AWS Terrain Tiles, Terrarium encoding: h = R*256 + G + B/256 - 32768 m) covering
// the Cherkasy map into tools/cherkasy/raw/dem/. Sources: SRTM and others, see
// https://github.com/tilezen/joerd/blob/master/docs/attribution.md. Run: node tools/cherkasy/fetch_dem.mjs
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
export const Z = 13, BB = { s: 49.33, n: 49.53, w: 31.90, e: 32.22 };
const lon2x = (lon) => Math.floor((lon + 180) / 360 * 2 ** Z);
const lat2y = (lat) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** Z);
const dir = new URL('./raw/dem/', import.meta.url); mkdirSync(dir, { recursive: true });
let n = 0;
for (let x = lon2x(BB.w); x <= lon2x(BB.e); x++) for (let y = lat2y(BB.n); y <= lat2y(BB.s); y++) {
  const f = new URL(`./${Z}_${x}_${y}.png`, dir); if (existsSync(f)) continue;
  const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
  if (!r.ok) { console.warn('tile', x, y, r.status); continue; }
  writeFileSync(f, Buffer.from(await r.arrayBuffer())); n++;
}
console.log('downloaded', n, 'tiles', lon2x(BB.w), lon2x(BB.e), lat2y(BB.n), lat2y(BB.s));
