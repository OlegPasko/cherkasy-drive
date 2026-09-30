// Links into the game's Telegram bot (bot/ in the repo): requests, ads and feedback end up as GitHub issues there.
// A map point travels as the /start payload in lat/lon (1e-5°), the only frame the bot and Google Maps share.
//   BOT_NAME, botLink(start?) -> t.me URL;  latLon(frame, x, z) -> { lat, lon };  worldXZ(frame, lat, lon) -> { x, z }
//     (frame: map.json's { lat0, lon0, rot })
//   pointLink(frame, x, z, flow = 'imp' | 'ad') -> t.me URL that opens that flow at that point
export const BOT_NAME = 'driver_game_bot';
export const botLink = (start = '') => `https://t.me/${BOT_NAME}${start ? `?start=${start}` : ''}`;

const M_PER_DEG = 111320;
export function latLon({ lat0, lon0, rot }, x, z) { // undo tools/cherkasy/build_map.mjs: rotate back to east / north
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const east = x * c + z * s, north = x * s - z * c;
  return { lat: lat0 + north / M_PER_DEG, lon: lon0 + east / (M_PER_DEG * Math.cos(lat0 * Math.PI / 180)) };
}
export function worldXZ({ lat0, lon0, rot }, lat, lon) { // the forward projection (game links: ?at=lat,lon)
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const east = (lon - lon0) * M_PER_DEG * Math.cos(lat0 * Math.PI / 180), north = (lat - lat0) * M_PER_DEG;
  return { x: east * c + north * s, z: east * s - north * c };
}
export function pointLink(frame, x, z, flow = 'imp') {
  if (!frame) return botLink(flow);
  const { lat, lon } = latLon(frame, x, z);
  return botLink(`${flow}_p${Math.round(lat * 1e5)}_${Math.round(lon * 1e5)}`);
}
