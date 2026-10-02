# AGENTS.md

Cherkasy Drive is an open-world driving and flying game set in the real city of Cherkasy, Ukraine. You drive a
Cybertruck-style car that can also fly. The city has traffic, pedestrians, landmarks along the Dnipro, and
missions: couriers, taxi, chases and muggings. It is built with three.js r186 and Vite, as plain ES modules
without a framework. The code is open source under the GNU AGPL-3.0 (see `LICENSE`).

## Run

    npm install
    npm run dev                  # http://127.0.0.1:5174  (the game)
    npm run build                # production build into dist/
    for t in tests/*.mjs; do node $t; done   # headless tests, no framework

The dev server serves the demo pages. Each one isolates a single subsystem on the real city data:
`/demos/{render,buildings,nature,collision,traffic,people,landmarks,world,car}.html`.

## Layout

See `ARCHITECTURE.md` for the module map. Where things live:

- `src/main.js` – `createCore` (renderer, scene, camera, input, daylight, sky, shadows, post, systems loop) and
  `startGame` (world → car → HUD → missions).
  - Frame order: input → daylight → systems (car → traffic player sync → world → missions → HUD) → sky →
    shadows → post.
- `src/render/` – renderer, post chain, sky and haze, daylight, shadows.
  - The post chain is N8AO → bloom + PBR Neutral tone mapping → SMAA.
  - `daylight.js` exports `nightFactor()` and `nightK`.
  - `adaptive.js` – adaptive resolution: when the real frame interval stays over 1/48 s and the CPU is not the limit, it
    lowers the render pixel ratio in ~0.2 steps (1.6 → 1.4 → 1.2 → 1.0, never below 1 or the quality's own base) and
    gives it back once there is room; reset on every quality change, never saved. `?noadapt` turns it off.
  - Shadows use three's `SunLight` with 2 cascades.
  - Graphics levels (`QUALITY_LEVELS` low / medium / high in `main.js`, saved as `cd.quality`; G steps down, F9 cycles,
    both live, no reload). Each render module has its own table (`post.js`: AO, AA, render scale, max pixel ratio;
    `shadows.js`: map size, reach, rate; `sky.js`: cloud octaves, env size), and `world.setQuality(q)` sets what the
    city draws (`DETAIL` in `city.js`): tree LOD bands and tree-shadow reach (`trees.setDetail`), roof-detail and
    building-shadow reach (`buildings.js setDetail`), the hand-built sites' draw-distance cull (`world/farcull.js`:
    small far meshes leave the picture, far ones stop casting), people and traffic draw reach / LOD distances
    (`setDrawDistance`; the simulation, mission actors and the traffic's on-screen logic stay the same), the river mirror
    (off at low, 8 Hz at a smaller size at medium) and the facade window detail (`facadeMat.setDetail`). 'high' is the
    full picture, every module's default. Trees and buildings keep their colliders at every level.
- `src/kit/` – mesh building blocks:
  - `mesh.js` – `MeshBuilder`/`MB`, `M4`, `hexLin`;
  - `logo.js` – brand SVGs from `public/assets/brand/` as recoloured textures (the Everlabs plate on the car, roof signs), or in their own colours (`color: null`, the Торс disc, the URBAN letters); a new logo adds its aspect to `ASPECT`;
  - `batch.js` – spatial tiles;
  - `instances.js` – LOD pools;
  - `textures.js` – procedural textures.
- `src/world/` – general world systems:
  - `facade.js` and `materials.js` – the facade shader, lit windows and the `DP` part ids;
  - `buildings.js` – OSM building extrusion;
  - `trees.js` – procedural trees with LODs and breakable items;
  - `farcull.js` – the draw-distance cull of the hand-built sites on the lower graphics levels;
  - `water.js`;
  - `collision.js` – boxes, cylinders and prisms in a grid, with `walkSlope`.
- `src/world/cherkasy/` – the city itself:
  - `city.js` – `buildCherkasy`, which returns the world; its API is documented in the file header;
  - `ground.js` – terrain, roads, markings, kerbs and shore, built in workers;
  - `geo.js` – shared 2D helpers;
  - the hand-made landmarks: `landmarks`, `pagorb`, `rosevalley`, `restinn`, `embankment`, `dam`, `yachtclub`,
    `beaches`, `zhuzhoma`, `prystan`, `restaurants`, `yalynka`, `facadekit`, `khimikiv`, `druzhba` (Palace of Culture);
  - `zamkova.js` – Zamkova hora: the hilltop lift (`shapeZamkova`, the terrain hook in `city.js`), platform, wall, monuments;
  - `zamkovapark.js` – the planned park at the foot of Zamkova hora, between the hill, Князя Ольгерда and Замковий узвіз
    (a project, not built yet): the round fountain with animated jets on its levelled plaza (`shapeZamkovaPark`, the only
    terrain change), light paths, lawns, rose beds, hedges, trees (`spots` / `clear`), benches, lamps, the playground,
    wooden pavilions and pergolas on the east, kiosks round a small plaza on the west, a bus shelter, and zig-zag stairs
    up the slope to the platform of `zamkova.js` (it reuses `PLATEAU` / `VIEW` from there). The park's ground is its own
    draped mesh painted from the plan (the ground workers read `map.json` themselves). It also restores two old houses in
    place of their OSM ids (`ZAMKPARK_SKIP`): the Kupershtein «Будинок з грифонами» (Замковий узвіз 1, 1890s, as it
    stood before the 2024 rebuild: two storeys, whitewashed, hipped roof) and the small stone house with the arched gate
    (Замковий узвіз 7). On the maps the park is a sight (`zamkpark`), the house an `improved` object (`kupershtein`).
  - more hand-built sights: `market` (the round covered market), `bilyidim` (Budynok rad), `kobzar`, `museum` (local
    history), `philharmonic` (with the «Висока нота» violinist), `wedding` (Palace of weddings), `bohdan` (the
    Khmelnytsky monument; it shares its bronze helpers with the others), `boyan` (the Boyan monument on площа 700-річчя Черкас: the seated
    singer, the three spears, the granite pool with jets), `su7` (the Су-7БКЛ memorial at the park 30-річчя Перемоги entrance by the Смілянська roundabout: the jet climbing
    on its slanted pylon over the white wedge and the red granite plinth, in the 2020 blue-and-yellow stripes), `lotus` (White Lotus temple on its slope), `lovebridge` (Bridge of Lovers over a carved
    ravine), `andriy` (the church of St Andrew the First-Called by the Mytnytsia roundabout, with its gate belfry,
    brick fence and thujas), `station` (railway station, platforms, footbridge, parked trains) and `station_rails` (the whole `rails`
    layer: track, level crossings – none where the road or the line is on an OSM bridge –, catenary on the electrified lines).
    `overpass` (issues #21 / #22) is road infrastructure, not a sight: the Дахнівська overpass over Сумгаїтська and the
    line to the dam by the Sosnivka park. `shapeOverpass` cuts the lower road and the track into a cutting along their own
    grades (the DEM sees one flat hilltop), the deck spans every height-lattice cell the cut touched, with piers, blue
    railings and lamps, plus the pipeline footbridge beside it and guard rails in the cutting; the ground's Дахнівська strip
    under the deck turns to lawn. Its `deckAt(x, z)` reaches the lane network (`buildCherkasyTraffic({ deckAt })`), so
    the bridge lanes ride the deck. `khimbridge` (issue #24) raises просп. Хіміків on its 1983 viaduct («Горбатий міст»,
    OSM 72051299) over the station tracks: an ~8.4 m crest, closed ramps between retaining walls at each end, an open
    deck on paired round columns where it clears the tracks and the side streets, lamps and railings; its `deckAt` feeds the
    lanes too. `railbridge` (issue #24) lays the line east of the centre on an embankment (a mesh in the ground material,
    no terrain change) with short beam bridges over Смілянська, Байди Вишневецького, Грушевського and Сумгаїтська;
    `railLevelFn` gives `station_rails` the bed height there (`buildStation({ railLevel })`). `bridgekit` holds the
    helpers the three bridge modules share (frames along an axis, planar prisms, resurfacing, paint drop, deck meshes).
    `gerb` is the coat-of-arms stele (Стела з гербом України, 2017) on the Велике коло, площа Перемоги. Several shape the terrain with a guarded
    `shape*` / `level*` hook next to `shapeZamkova`. A site builder that reads `ground` must be listed in `GROUND_SITES`
    in `city.js`; the others build while the ground workers run.
  - hand-built ordinary buildings (not sights, not in `places.js`): `simeinyi` (ЖК «Сімейний Lux», Героїв Дніпра 4),
    `fitness34` (fitness club «3-4», Надпільна 252), `torhivli` (Будинок торгівлі with the corner pavilion), `chnu` (ЧНУ
    main building), `chdtu` (ЧДТУ campus: корпуси 1–4 and the canteen), `bankinst` (the banking institute, Чорновола 164). `khrcity`
    (ТРЦ «Хрещатик-Сіті», Дашковича 19: the horseshoe round its courtyard, the arch, the towers and the atrium pavilions)
    is built the same way and marked on the maps as an `improved` object. So are its two neighbours at the Khreshchatyk
    crossing, `improved` under their own names: `blakytnyi` (Блакитний палац, the former hotel «Слов’янський», Дашковича 20:
    the ochre two-storey hotel with lancet windows, pinnacles, the chamfered corner with its balcony, gable, turrets and slate
    spire, round a courtyard, plus the plain five-storey office wing of the same OSM relation) and `nbu` (the National Bank's
    Cherkasy office, Дашковича 21: a cheap rebuild with the four-column portico and pediment, arched windows, hipped roofs).
    `civic.js` also holds the arch, face-polygon and hipped-roof helpers they share.
    Twenty more well-known buildings are built the same way, each marked as an `improved` object: `miskrada` (city
    council), `poshtamt` (head post office), `oblbiblioteka` (regional library), `medakademia` (medical academy),
    `podatkova` (tax office, Хрещатик 235), `school17`, `kinoukraina` (Ukraina cinema), `chnu3` (ЧНУ building 3),
    `epicentr`, `grandmarket`, `dytlikarnya` (regional children's hospital), `budivelnyk` and `spartak` (sports palaces),
    `lyubava`, `pioner`, `slavutych`, `dniproplaza` and `depot` (malls), `hoteldnipro` and `politekhkoledzh` (the
    polytechnic college in the old wine warehouse). Two supermarkets from issue #12 are built the same way and marked `improved`:
    `delikat` («Делікат», Благовісна 300) and `atb` (АТБ, бульвар Шевченка 239), and so is
    `mcdonalds` (McDonald's, Смілянська 31: the McDrive lane, the terrace and the pylon). A player's idea (issue #20) added two
    more, both `improved`: `catcafe` (the nine-storey block at Байди Вишневецького 19 with its shop annex and CatCafe's front)
    and `praska` (the ten-storey «будинок-праска» at Остафія Дашковича 4: red-banded balconies, Gothic gables, a round nose). Issue #27 added two more on бульвар Шевченка, both `improved`: `delikat399` (the «Делікат» at 399/2:
    a one-storey ribbed-sheet box with a taupe band and a glazed entrance block; it reuses `signTex` from `delikat.js`) and
    `glassrotunda` (the bar next to it, drawn without its name or any lettering: a cassette-clad cube with a glass drum, a
    canopy ring, a terrace and a curved steel screen).
    Issue #25 added two more, both `improved`: `ekvator` (ТЦ «Екватор», просп. Хіміків 74: the 470 m grey hall with the orange
    entrance block and its sign frame, and its parking lot on Лейтенанта Мукана made a drift lot – `levelEkvator` levels the lot
    to its own median and the hall to the lot (`hf.pad(ring, margin, level)`), and the lot is one flat asphalt slab 0.22 m over
    it with a matching collision prism, ramps on its open edges, painted stalls, light poles only round the edges;
    `tests/ekvator.test.mjs`) and `sportlife` (the Sport Life club at Митниця, Козацька 2: silver panels, the blue-and-red
    portal with its sign, the glazed hall). They share five small wall kits: `civic.js`, `blockkit.js`,
    `bldkit.js`, `shellkit.js` and `slabkit.js` (walls per footprint edge, windows with reveals, collision, mesh wrap-up).
  - `places.js` – the sights, the paying partners (kind `ad`) and the non-landmark objects rebuilt on request (kind
    `improved`: a grey footprint only, "Покращений об’єкт" in the big map's legend) for both maps: icon, name, note, the OSM buildings
    whose footprints get highlighted, and for partners the site `url` (with `utm_source=driver.ck.ua`) and the pitch
    lines. `world.places` is the resolved list. Only paid placements are ads: today U space (the south tower of the
    Rest Inn block) and Everlabs (the offices over the hotel next to it, a lit logo on the roof), both built in
    `restinn.js`, and Торс (the rehabilitation centre at бульвар Шевченка 266: `tors.js` hangs a small lit logo disc on the
    OSM block's wall toward the boulevard and its door with a fascia on the annex; a site's `partners` gives the ring its door and glow), and
    URBAN (street food, Надпільна 252/1А: `urban.js` builds the whole one-storey brick shop row with the «Маркет води» unit, the
    lettering, blue awnings and bins, and – a proof of concept, not real – a steel stair up to a roof terrace with thujas, tables
    and umbrellas; a new building OSM lacks, placed by its `SITE` line, mirrored by `URBAN_RING` for the maps, its lot levelled by
    `levelUrban`); the other hand-built venues stay in the world unadvertised.
  - `balloon.js` – a hot-air balloon in the pixel tower's colours, its band sold through the bot's `ad-balloon` flow, today U space's
  ad (logo `public/assets/brand/uspace.svg`, the offer, the address and the phone): it hangs over the Rose Valley fountain, then drifts at a walker's pace along the Dnipro shore,
    over the water, to the river station and back (wall-clock paced); it bobs, turns and fires its burner (a night glow).
  - `plane.js` – a light plane, a Super Cub style taildragger in a Ukrainian livery (fuselage blue over yellow, the fin
    and rudder the flag, yellow wings with blue tips, the fictional registration UR-CKD; one ~4k-vertex mesh, the livery and
    glossy windows painted on a canvas): one 13 km closed loop (a spline) at ~190 m, down the Dnipro off the beaches and the
    embankment to the river station, back over bul. Shevchenka and the centre, a lap in ~8 min, wall-clock paced like the
    balloon. It banks into the turns, the prop is a blurred disc, nav lights and strobes show at night; no collision, not on
    the maps (the balloon is not either). Its engine loop (`plane_engine`) is heard only within ~120 m of it (`audio/game.js`).
  - `yacht.js` – an 11 m cruising sloop (white hull, navy boot stripe, teak deck, bellied main and jib, rigging as lines, a
    Ukrainian flag) sailing a ~2 km loop of open water off the Rose Valley, short of the yacht club, at 2.5 m/s (a lap in ~13 min,
    wall-clock paced like the balloon). A fixed cross-river breeze trims it: boom and jib go to leeward by the point of sail and
    cross over at the loop's ends, it heels, bobs, the sails flog head to wind; a foam wake; masthead and red / green bow lights
    by `nightK`. Its `collide(p, r, h)` (hull box + mast) joins `world.collideDynamic` after the traffic, so the car cannot
    drive or fly through it. Five draw calls, ~3.1k vertices; `tests/yacht.test.mjs`.
  - `billboards.js` – roadside billboards sold through the bot: the `BILLBOARDS` list (spot, facing, art) and the
    builder; unsold ones show the "ваша реклама / @driver_game_bot" placeholder. The header says how to add a real one.
- `src/npc/` – everything that moves on its own:
  - `lanes.js` – the lane graph and signals; with `opts.deckAt` (a site's deck heights) the lanes of a chain with an
    OSM bridge way take the deck's height where they end on it, split into pieces of at most `DECK_STEP` (16 m) on a
    deck so they follow a humped one;
  - `vehicles.js` – loads the glb models, instanced fleet, `makeMesh`; the ad tiles on vans, bus sides and backs and roof signs (tile 1 is URBAN's, paid: a quarter of the 12 m buses wear it in URBAN blue) and `makeUrbanLivery`, the URBAN box-truck livery (sides and back doors) a quarter of the box trucks wear; both are picked in `defaultDress` in `traffic.js`;
  - `traffic.js` and `wrecks.js` – the traffic sim, rigid-body wrecks and dents; the car rams through
    `ram(q)`;
  - `people.js` and `people/` – procedural, GPU-animated pedestrians and pigeons;
  - `gibs.js` – gore chunks and debris.
- `src/game/` – gameplay:
  - `car/` – `car.js` (control, flight, camera), `model.js` (the Cybertruck), `collide.js` (car
    collider);
  - `partners.js` – a partner's soft pink ring at its door, the building's light-up on approach, and the card that
    slides in on the right inside the ring (O or a click opens the site in a new tab);
  - `explore.js` – the standing quest "visit every sight": every `places.js` sight counts once the car comes within
    reach; visited ids (and the ids already known, so a returning player hears about new ones) live in localStorage
    under `cherkasy.explore`; +50 ₴ per sight. Sights get `visited` true/false, which the map badges show (dim until
    visited, then a green check) and the HUD counter under the money. A new sight in `places.js` joins it by itself;
  - `missions.js` – the dispatcher and the five mission types; fines; money is stored in localStorage under
    `cherkasy.money`;
  - `testworld.js` – a small flat world for car tests.
- `src/audio/` – the sound, all recorded with ElevenLabs:
  - `engine.js` – the sample player: buses (sfx, ui, amb, motor, dispatcher `vo` with a radio band-pass, passenger
    `pax`), positional one-shots, seamless loops, one voice line at a time with ducking;
  - `game.js` – the car's electric motor, drift squeal, fans and wind from car state; the place ambience (city,
    Sosnivka forest from `map.cover.forest`, altitude, day/night); the plane's engine (full within 30 m, silent beyond
    120 m, panned; `planeGain`); event one-shots; mission lines;
  - `radio.js` – the car radio (Q on / off, E next; off by default): Oleg's own songs, credited "ANATHEM (with
    Suno)". Nothing is fetched until it is turned on, then only the playing track, streamed. Add songs with
    `node tools/audio/radio.mjs <files…>` (levels, encodes to `public/assets/radio/`, appends to `tracks.json`).
  - `cue.js` – `cue(name, data)`, how world modules (wrecks, trees, people, birds, missions, partners) ask for a sound.
    Running people over is a soft "chpok", never a scream.
  - Assets: `public/assets/audio/<group>/<id>_<k>.mp3` + `index.json`, made by `node tools/audio/gen.mjs` from
    `tools/audio/sounds.json` (prompts, voice lines, gains). The key is the keychain item `ELEVENLABS_MACOS_LOCAL`.
    Existing files are kept; `--only id,id` redoes some, `--index` rebuilds the index. Dispatcher voice: Alex Nekrasov
    (shared library); passenger: Volodymyr.
- `src/ui/hud.js` and `hud.css` – speed/altitude readout, minimap (with a few street names, pinned to their streets), the in-flight "S – glide down" tip, objective, the edge-pinned mission marker,
  damage bars, money and help. UI text is Ukrainian.
  - `mapdraw.js` – the painter both maps share: feature index, canvas tiles per zoom level (one LRU cache), place
    badges, the street-name chains built from `map.json` road names and `layAlong`, which lays a name's glyphs along a
    street for both maps. Motor-road bridges (`br`) are drawn last, with a dark edge each side, so a road or a railway
    under one reads as passing under it.
  - `perfhint.js` – watches the real frame rate; after ~6 s under 40 fps it offers G (simpler graphics, one quality
    step down) in a pill at the bottom, but only once the adaptive resolution has nothing lower left to try. G works any time and goes round (the lowest wraps to the highest); F9 cycles the levels upward.
  - `bigmap.js` – the full-screen map on M: north up, wheel / drag / arrows or the + / − buttons, street names along the streets, sight and
    partner badges with hover notes, mission markers and the objective. A left click elsewhere plants the player's own mark (a yellow flag; a click on it
    clears it, driving within 25 m clears it too; `cherkasy.mark` in localStorage), which the minimap shows as a flag or a
    yellow arrow on its rim. A click on a paying partner asks
    "Переміститись сюди?" and moves the car to the road beside it (`hud.onGo` in `main.js`, missions carry on; the
    site stays in its ring in the world); only paid placements are teleport targets – sights and improved objects are reached by driving.
    The game pauses while it is open (`ctx.paused`: only systems added with `{ always: true }` run, nothing renders).
- `src/ui/consent.js` and `consent.css` – the consent card on the loading screen: the main keys and the terms (an
  entertainment game, toy people not modelled on real residents, toy crashes, open-data city with nothing military or
  live). Any key (browser shortcuts aside) or a click anywhere accepts it, a press during the load as soon as the game is
  ready; the game reads keys by `e.code`, so a Cyrillic layout works the same. The loop starts once it is accepted; acceptance is stored as `cherkasy.consent` = the `TERMS` version, so bump
  `TERMS` when the text changes materially and everyone sees it again.
- `src/ui/botlink.js` – links into the Telegram bot: the "Бот" chip next to H, the "🔔 Оновлення" chip (`?start=sub`), the H card line, the big-map button,
  the right-click menu (improve / advertise at that point) and the partner card line.
- `src/analytics.js` – Google Analytics 4: loads only on `driver.ck.ua` (never in dev, demos or tests); `track(name, params)`
  sends the game events listed in its header (missions, partner clicks, sights, load time).
- `src/mapview.js` and `ui/mapview.css` – the phone page: `index.html` sends touch-only devices and phone user agents here
  instead of the game (`?mobile` / `?desktop` force either). It loads only `map.json` + `map_buildings.json` and opens the
  big map with no car (`createBigMap({ player: null })`; one finger pans, two pinch (or the + / − buttons), a tap shows a badge's card and a
  second tap opens a partner's site), under a card that says the ride is on a computer. A second tap on a sight or an improved
  object with a hand-built model opens `ui/peek3d.js`: the map centres on it, and the site module the game uses (the `SITES`
  table there: place id -> module, builder, terrain hook) builds it on its own, cropped to a disc round the place, on the
  map's tiles draped over the DEM with the OSM neighbours as a white massing model. It rises out of the map, then one finger turns it and two
  zoom. three.js, the textures, `dem.bin` and the module load only on the first peek, and the game never imports it; a new hand-built
  object joins by a line in `SITES`. `__mapview.peek.tick(n)` steps it by hand (a hidden tab has no frames).
- `bot/` – `@driver_game_bot`, a DigitalOcean Function (Node 24, one npm dep: `unpdf`) outside the game bundle. It turns
  requests (object improvement, ads, billboard, van livery, balloon – paid as a minimum donation to the 3D forge's monobank jar and proven by a screenshot or receipt; free ideas and feedback) into GitHub issues in
  this repo and relays comments and statuses back to Telegram. It uses Jev as the guardrail on typed input and to judge donation proofs (read by Gemma on Darkbloom, DeepSeek as the fallback), and
  Spaces for sessions and photos. Players can subscribe to the game news: the function itself posts what reached the game each day at 21:00 Kyiv (`news.js`, written by GPT-6 Luna from the day's commits; `docs/news.md`). `docs/improve-object.md` is the step-by-step playbook for building a requested object (and adding a landmark to the maps). `bot/README.md` covers the flows, how to work the issues (`//` = internal comment,
  `in-progress`, closing), deploy and setup. The secrets live only in `bot/.env` (gitignored). Test with
  `node tests/bot.test.mjs`.
- `public/assets/cherkasy/` – `map.json`, `map_buildings.json` and `dem.bin`, compiled by
  `tools/cherkasy/build_map.mjs`.
  - That script reads the raw data from `tools/cherkasy/raw/`, which is gitignored and fetched with
    `fetch_osm.mjs` and `fetch_dem.mjs`.
  - A full rebuild takes about 5.5 minutes, and the output is deterministic.
- `public/assets/vehicles/*.glb` – generated by `tools/blender/cars_small.py` and `cars_big.py`.
  - Mesh naming is `type`, `type_l1`, `type_l2`.
  - `uv1.x` holds the part id and `COLOR_0` holds the baked AO.

## Conventions

- Every module exports `create*` or `build*` and returns a plain object with `update(dt, …)` where needed.
- Each file starts with a short header comment that states its contract: exports, arguments and the returned
  shape. Keep that header up to date.
- The code is compact, and comments explain *why*. Code, comments and commit messages are in English; UI text is
  in Ukrainian.
- Static geometry is merged and tiled; anything repeated is instanced.
- `map.json` is the only source of city data.
- Performance target: 60 fps on an M-series laptop with the full city loaded.
  - The city has about 55k buildings, 92k trees, 130 cars and 600 people.
  - It loads in about 2–3 s.

## Debugging and verification

- URL flags:
  - `?testworld` – the flat test world;
  - `?paused` – start without the loop;
  - `?notraffic`, `?nopeds`, `?noworkers`;
  - `?blood` – blood droplets and splats on pedestrian hits (off by default);
  - `?fresh` – ignore the saved car position (`cherkasy.pos` in localStorage, saved every 10 s) and start at the
    default spawn;
  - `?coll` – collision overlay;
  - `?cam=x,y,z,tx,ty,tz`.
  - `?at=lat,lon[&road=street]` – start on the road beside that point, with the point ahead on the right (`src/game/placeat.js`);
    the Telegram bot's "🚗 Подивитись у грі" links use it.
  - `?noga` – no Google Analytics on the production site;
  - `?noadapt` – no adaptive resolution (steady pixel ratio for perf measurements);
  - `?stilltime` – the clock stands still (the game runs a day per hour of play and skips the night, `startGame` in `main.js`);
  - `?nosound` – no sound at all (no AudioContext, nothing fetched, the radio muted); use it for every dev and test run;
  - `?mobile` / `?desktop` – force the phone map page or the game (`src/mapview.js`).
- Handles: `window.__game` (ctx with `world`, `car`, `hud` (`hud.map`, `hud.painter`), `missions`, `perf`), `window.__car`,
  `window.__missions`, `window.__cherkasyTraffic`, `window.__cherkasyPeds`.
- `window.tick(n, dt)` pauses the loop, steps n frames deterministically and returns a snapshot.
  `__game.start()` resumes the loop. Use this for scripted checks.
- In the game: M opens the city map (Esc or M closes it), H (or the always-visible H chip) shows the controls card –
  every key, grouped; add new keys to `HELP` in `hud.js` –, F2 hides the HUD, T jumps to a time of day (morning, midday, evening – the clock runs on from there, a day per hour, and skips the night; the evening has the lights on: windows, lamps, signs, car lights, from `daylight.state.lamps`),
  Q turns the radio on / off and E skips a track, F honks the horn (people in a cone ahead dash off to the sides), G lowers the graphics quality one step (from the lowest back to the highest; besides the post chain a lower level draws
  less: shorter tree / building / site / people / traffic draw and shadow distances, no river mirror at low), F9 cycles quality, B (or Home, or the "На старт" chip) takes a stuck car back to the start, N skips a mission call, O opens a partner's site inside its ring, Enter retries after a failure, and Backspace abandons a mission.
- Chrome gives hidden tabs no animation frames, so a background tab looks frozen. Keep the tab in front, or use
  `tick()`.
- Reversed depth buffer: use `decalBias()` from `render/renderer.js` for decals and road markings, never
  negative `polygonOffsetUnits`.
- Custom `ShaderMaterial`s need the three fog chunks to receive the height haze.
- Known gap: the dam road and bridge are not in `map.json`, so on the minimap that area shows as water.

## Working agreements (Oleg)

- Reply in the language of Oleg's message; he usually writes Ukrainian. Use en-dashes (–), never em-dashes.
- Never add a Co-Authored-By or any other Claude attribution line to commits. Commit and push only when asked.
- Nothing gets published (share links, public repos) without an explicit request.
