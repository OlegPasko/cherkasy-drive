# Cherkasy Drive

An open-world driving (and flying) game set in Cherkasy, Ukraine: a Cybertruck-style car, the real street map,
landmarks along the Dnipro, traffic, pedestrians and small missions (couriers, taxi, chases). Three.js + Vite.

    npm install
    npm run dev          # http://127.0.0.1:5174

Rebuilding the map (optional; the compiled map is committed):

    node tools/cherkasy/fetch_osm.mjs && node tools/cherkasy/fetch_dem.mjs && npm run map

Vehicles are generated in Blender by `tools/blender/cars_small.py` and `cars_big.py`.

## Data and credits

- Map data © OpenStreetMap contributors, available under the Open Database License (ODbL):
  https://www.openstreetmap.org/copyright
- Elevation: Mapzen / AWS Terrain Tiles (SRTM and other sources), see
  https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- three.js (MIT), n8ao (ISC), postprocessing (Zlib).

## License

Copyright (c) 2026 Oleg Pasko. Licensed under the GNU Affero General Public License v3.0 (see `LICENSE`).
Map data, elevation data and the third-party libraries above keep their own licenses.
