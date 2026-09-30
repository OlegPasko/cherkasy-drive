# Architecture

Three.js (r186) + Vite, plain ES modules, no framework. One page, one canvas, one render loop.
Units: metres, seconds, y up. The world frame is the one `tools/cherkasy/build_map.mjs` writes (+x north-east toward
the Dnipro, +z south-east, origin at Soborna square).

## Layout

    src/
      main.js                 bootstrap: renderer, scene, camera, world, car, hud, missions, loop
      core/
        input.js              keyboard + mouse + gamepad -> action state (held / pressed this frame / axes)
        events.js             tiny pub/sub used between systems
      render/
        renderer.js           WebGLRenderer setup (reversed depth, shadows, colour space)
        post.js               post chain: SSAO (n8ao), bloom, tone mapping, AA (postprocessing lib)
        adaptive.js           adaptive render resolution: steps the pixel ratio down on a machine that misses 48 fps
        sky.js                sky dome, sun/moon, fog, environment map
        daylight.js           time of day; nightFactor() in [0..1] used by lamps and windows
        shadows.js            cascaded sun shadows (three's CSM addon)
      kit/
        mesh.js               MeshBuilder: merges boxes / cylinders / prisms / extrusions / quads with per-vertex colour
                              into one BufferGeometry; small 4x4 transform helpers; colour helpers (hex -> linear)
        batch.js              splits big static geometry into spatial tiles for culling
        instances.js          instanced pools with distance LOD
        textures.js           procedural canvas textures (asphalt, pavement, grass, brick, plaster, glass)
      world/
        facade.js             building facade material: window grid, floors, lit windows at night, per-building style
        buildings.js          extruded OSM footprints -> walls + roofs using facade.js
        trees.js              procedural low-poly trees, instanced LODs, breakable items
        water.js              river surface, reflections, wet shoreline bands
        collision.js          static collision world: grid of boxes / cylinders / prisms; ray, ground height,
                              capsule / box push-out
        cherkasy/             Oleg's Cherkasy modules: landmarks, ground, city assembly
      npc/
        lanes.js              lane graph from OSM roads; junctions; traffic lights
        vehicles.js           loads public/assets/vehicles/*.glb; instanced bodies with LOD and paint colours
        traffic.js            traffic simulation + wrecks (rigid bodies, dents)
        people.js             pedestrians: procedural low-poly people, instanced, walk / run / idle / flee
        gibs.js               debris and gibs
      game/
        car/                  the flying Cybertruck
        missions.js           dispatcher + mission types (ported)
        partners.js           partner rings at the door, building light-up, the site card (O opens the site)
        explore.js            standing quest: visit every sight (proximity), visited ids in localStorage, map marks
      audio/
        engine.js             sample player: buses, positional one-shots, loops, one voice line at a time + ducking
        game.js               car motor / fans / wind, place ambience, event sounds, dispatcher and passenger lines
        radio.js              car radio (Q / E): Oleg's songs, fetched only once turned on, streamed
        cue.js                cue(name, data): world modules ask for a sound without holding the audio system
      ui/
        hud.js, hud.css       speed, minimap, objective, mission marker at the screen edge, damage bars, money
        mapdraw.js            shared map painter: feature index, cached tiles per zoom level, place badges, street chains
        bigmap.js             full-screen city map (M): zoom / pan, street names, sights, partners, missions;
                              right click -> the Telegram bot at that point
        botlink.js            t.me links into @driver_game_bot (game x/z -> lat/lon for the /start payload)

    bot/                      the Telegram bot (DigitalOcean Function, nodejs:24): requests -> GitHub issues,
                              issue comments / statuses -> the player; see bot/README.md

## Rules

- Each module exports a `create*` / `build*` function that returns a plain object with `update(dt, ...)` where it
  needs one. No globals except `window.__game` for debugging (and the single listener slot in `audio/cue.js`).
- Static world geometry is merged and tiled; everything repeated is instanced.
- The map JSON is the only source of city data.
- Code comments in English; UI text in Ukrainian.
