// OWNER: cherkasy. The layout of ЖК Onix (вул. Сковороди / вул. Теліги, Sosnivka), shared by onix.js (the model) and
// places.js (the grey footprint on the maps); no three.js here, so the phone map can import it.
// Taken from the developer's site plan on lun.ua (two U-shaped nine-storey blocks, ten sections, both yards open to
// the south-west), scaled and placed on the one block OSM already has (way 1479490556, вул. Олени Теліги 23 =
// sections 8–10): 0.667 m per plan pixel, the plan's long axis at a bearing of 40°, which matches the OSM block to 0.1°.
//   ONIX_FRAME { O: [x, z], U: [ux, uz], V: [vx, vz] }   the site frame on the map: u along the legs (bearing 40°, NE),
//     v across them (bearing 130°, SE: toward the street); origin the middle of the OSM block's south-west end
//   uvXZ(u, v) -> [x, z]
//   ONIX_SECTIONS: [{ id, b (block 1 | 2), r: [u0, u1, v0, v1], shops: sides with shop fronts ('u0' | 'u1' | 'v0' | 'v1') }]
//     the wall rectangles in the frame (balconies stand out of them); block 2 (sections 5–10) is the one being built,
//     block 1 (1–4) is still a project and stands here as rendered
//   ONIX_RINGS: one flat ring [x, z, …] per section, for places.js
const n2 = (x, z) => { const l = Math.hypot(x, z); return [x / l, z / l]; };
export const ONIX_FRAME = { O: [-3228.29, -626.82], U: n2(0.99979, -0.01065), V: n2(0.01029, 0.99973) };
export const uvXZ = (u, v) => { const { O, U, V } = ONIX_FRAME; return [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v]; };

// the legs are 18.6 m between the walls (the OSM outline, 21 m, takes in the balconies); sections step by a metre
// where the render shows it. The street (an unnamed road in OSM) runs past v1 of the east leg, at v ≈ 22–30; the lane between the two blocks
// (v ≈ -70) has shops on both sides, as in the street-level render.
export const ONIX_SECTIONS = [
  { id: 10, b: 2, r: [0, 26.2, -9.3, 9.3], shops: ['v1', 'u0'] },
  { id: 9, b: 2, r: [26.2, 52.4, -10.3, 8.6], shops: ['v1'] },
  { id: 8, b: 2, r: [52.4, 78.6, -9.3, 9.3], shops: ['v1'] },
  { id: 7, b: 2, r: [59.6, 77.6, -41.7, -9.3], shops: [] },
  { id: 6, b: 2, r: [59.6, 78.6, -60.3, -41.7], shops: ['v0'] },
  { id: 5, b: 2, r: [24, 59.6, -60.3, -41.7], shops: ['v0', 'u0'] },
  { id: 4, b: 1, r: [24, 52, -98.6, -80.0], shops: ['v1', 'u0'] },
  { id: 3, b: 1, r: [52, 78.6, -97.8, -79.2], shops: ['v1'] },
  { id: 2, b: 1, r: [60.6, 77.6, -130.6, -97.8], shops: [] },
  { id: 1, b: 1, r: [48, 78.6, -149.2, -130.6], shops: ['u0'] },
];
export const ONIX_RINGS = ONIX_SECTIONS.map(({ r: [u0, u1, v0, v1] }) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].flatMap(([u, v]) => uvXZ(u, v).map((q) => +q.toFixed(2))));
