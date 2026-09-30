// OWNER: cherkasy. Geographic frame of the Cherkasy map (tools/cherkasy/build_map.mjs FRAME): lat/lon <-> map x/z.
// +x north-east, +z south-east (the city grid rotated by frame.rot degrees), metres, origin at (lat0, lon0).
export function FRAME_OF(map) {
  const F = map.frame, KY = 111320, KX = 111320 * Math.cos(F.lat0 * Math.PI / 180);
  const c = Math.cos(F.rot * Math.PI / 180), s = Math.sin(F.rot * Math.PI / 180);
  return {
    toXZ(lat, lon) { const e = (lon - F.lon0) * KX, n = (lat - F.lat0) * KY; return [e * c + n * s, e * s - n * c]; },
    toLatLon(x, z) { const e = x * c + z * s, n = x * s - z * c; return [F.lat0 + n / KY, F.lon0 + e / KX]; },
    // compass: map direction of true north (unit x/z)
    north: [s, -c],
  };
}
