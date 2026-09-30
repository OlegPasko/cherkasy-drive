# Working an object-improvement request

The playbook for turning a player's "покращити об'єкт" request (a GitHub issue filed by `@driver_game_bot`) into a
hand-built building in the game. Issue #1 (prosp. Khimikiv 44 → `src/world/cherkasy/khimikiv.js`) is
the worked example. Read `AGENTS.md` first: the file-header contract and the conventions apply.

The whole job runs from the repository alone, so it also works in a cloud session (Claude Code on the web): the map
data is committed under `public/assets/cherkasy/`, and no bot secrets are needed. Never touch `bot/.env`.

## 1. Pick the request up

- Take issues labelled `object-improvement` and `donation-ok` (the donation is confirmed). Leave `awaiting-donation`
  and `donation-review` alone: the donation is not in yet.
- Add the label `in-progress`. The bot tells the player "Заявку #N взяли в роботу".
- Read the issue:
  - **Де** – a map link and/or an address, marked _(точка з гри)_ when it came from the game's map;
  - **Що змінити** – what the player says is wrong;
  - **Фото** – the player's photos (public Spaces links). These are the best reference: they are current;
  - the `🏛 Схоже на лендмарк` / `Можливо, лендмарк` note and the `landmark` label, if the bot found one (step 5);
  - the hidden `<!-- at:[lat,lon,road] -->` line: the point the bot resolved, and the street the "look in the game" link
    uses (the first issues had it inside a `<!-- tg:{…} -->` marker).
- Comments that start with `//` stay internal. Every other comment you write on the issue is sent to the player in
  Telegram as it is, so write those in Ukrainian and politely.

## 2. Find the building in the map data

- Convert the point to map metres with `FRAME_OF(map).toXZ(lat, lon)` (`src/world/cherkasy/frame.js`). Here +x points
  north-east and +z south-east, and the origin is Soborna square.
- Find the OSM building at that point in `public/assets/cherkasy/map_buildings.json`, whose entries look like
  `{ id (OSM way id), p: flat ring [x, z, …], k (kind), lv (levels), … }`. Pick the footprint that contains the point,
  or the nearest one:

      node -e "const b=require('./public/assets/cherkasy/map_buildings.json');const [x,z]=[X,Z];
        const c=(p)=>{let s=0,t=0;for(let i=0;i<p.length;i+=2){s+=p[i];t+=p[i+1]}return[s*2/p.length,t*2/p.length]};
        console.log(b.map(o=>({id:o.id,lv:o.lv,d:Math.hypot(c(o.p)[0]-x,c(o.p)[1]-z)})).sort((a,b)=>a.d-b.d).slice(0,5))"

- Check the id on openstreetmap.org (`/way/<id>`): the footprint, `building:levels` and `roof:*`.
- In the game, `?at=lat,lon&road=<street>` spawns the car on the road beside the point, with the point ahead on the
  right. Look at what the generic extrusion shows now.

## 3. Research

- Start from the player's photos. Then check Google Street View (note the capture date – it is often years old),
  photos on Google Maps, and for landmarks Wikipedia / Wikimedia Commons.
- Write down the facts before modelling: storeys, the ground floor above grade, the facade material and colour per
  side, the window rhythm (count per floor per side), balconies and loggias, entrances and canopies, the roof type,
  parapet, plinth, anything distinctive (mosaics, signage, columns).
- Non-commercial objects only (homes, schools, parks, monuments): no shop names or ads on them, unless a sign is large
  and clearly part of the street view. A business goes through the paid ad flow instead.

## 4. Build it

Make one module per object: `src/world/cherkasy/<name>.js`, modelled on `khimikiv.js`.

- **Header.** Start with `// OWNER: cherkasy.`, then the address, the issue number and what was built, then the
  contract:
  - `<NAME>_SKIP` – a `Set` of the OSM ids replaced here, so `buildings.js` skips its own extrusion;
  - `build<Name>({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null`.
- **Wire it into `src/world/cherkasy/city.js`** in three places:
  1. the `SITE_MODULES` glob list;
  2. the skip list (`['<name>', '<NAME>_SKIP']`);
  3. the builders list (`['<Label>', '<name>', 'build<Name>']`).

  Every site is optional and guarded: a throw logs and the city still loads.
- **Geometry.**
  - Work per facade in a face frame, as in `khimikiv.js`.
  - Build the walls as strips between the openings, so the windows keep real reveal depth.
  - Use tiling textures with uv in metres, so the masonry stays crisp up close.
  - Merge everything through `MB` (`src/kit/mesh.js`) into a few meshes.
  - Budget: a few thousand vertices per ordinary building, and no allocations per frame.
- **Night.** Lit windows follow `nightK` (`src/render/daylight.js`).
- **Collision.** Add prisms (`solids.prism`) for the walls and anything you can hit. Mark thin canopies as awnings, so
  the car can drive under them.
- **Footprints.** Return the replaced footprints. They keep trees off the lot and draw the building on the minimap.
- **Ground.** Take the ground height from `heightAt`. On a slope, raise the plinth and do not sink the doors.

## 5. Put it on the maps: a landmark gets a badge, anything else a grey outline

On an improvement request the bot looks the object up in OpenStreetMap (name, type, `wikidata` / `wikipedia` /
`heritage` / `historic` tags) and asks Jev whether it is a landmark:

- at 0.6 or above, the issue gets the `landmark` label and a note with the OSM and Wikipedia links;
- between 0.4 and 0.6, it gets only a "Можливо, лендмарк – перевірте" note.

Double-check this yourself. A place locals know by name counts (a palace of culture, a theatre, a church, a monument,
a stadium, a famous building). An ordinary block does not.

For a landmark, also add it to `PLACES` in `src/world/cherkasy/places.js`:

    { id: 'druzhba', kind: 'sight', name: 'Палац культури «Дружба народів»', note: 'бульвар Шевченка, …', icon: '🏛️', bld: [104299448] },

- `bld` holds the OSM building ids, whose footprints get highlighted. Use `ll: [lat, lon]` or `xz: [x, z]` for a place
  without a building.
- `name` is the Ukrainian name locals use; `note` is optional (an address or a one-line fact); `icon` is one emoji.
- The badge then shows on the minimap and on the big map (M), with the note on hover.
- Only paid partners are `kind: 'ad'`. Never make a sight an ad.
- A sight also joins the standing "visit every sight" quest (`src/game/explore.js`) by itself.

Anything that is not a landmark still goes into `PLACES`, as `kind: 'improved'`, so players can see on the map what
has been rebuilt on request:

    { id: 'khimikiv44', kind: 'improved', name: 'Покращений об’єкт', note: 'просп. Хіміків, 44', issue: 1, bld: [108980190] },

- No icon and no label on the map: only a quiet grey footprint, and a "Покращений об’єкт" item in the big map's legend.
  Hovering (or tapping) the footprint shows the name and the `note` (the address).
- Keep `name: 'Покращений об’єкт'`; `issue` is the request's issue number. It is not a sight and not in the quest.

## 6. Verify

- The dev server runs at `http://127.0.0.1:5174`.
  - Open `?at=lat,lon&road=<street>` to start beside the object.
  - Look from the road, from the yard and from the air. Use T for morning, midday and evening.
  - `window.tick(n)` steps frames deterministically; `?notraffic` keeps the view clean.
- Drive into the walls: the collision should hold with no invisible walls. Fly over it: no floating parts, no gaps at
  the ground.
- On the big map (M), the footprint should show: for a landmark with its badge and name, otherwise in grey.
- Run the checks:

      for t in tests/*.mjs; do node $t; done   # collision.test.mjs is timing-sensitive: rerun once if it fails
      npm run build

- Save screenshots (from the road and from the air, by day and in the evening) for the issue comment.

## 7. Deliver

1. Commit as `Hand-build <object> (issue #N)`, with a short body saying what was built from which references, and push
   to `main`. The site redeploys on its own within a few minutes.
2. Optionally comment on the issue in Ukrainian with a screenshot: the player sees it in Telegram. Notes for yourself
   start with `//`.
3. Close the issue as **completed** after the push. The bot then sends the player "Готово" with the "🚗 Подивитись у
   грі" button and the note to wait ~5 minutes and hard-refresh (Cmd + Shift + R / Ctrl + F5). Closing as **not
   planned** tells them it was closed without the work.
4. Improvements are one-off jobs with no fix rounds. For ads (placements) the player gets ✅ / ✏️ after closing: a fix
   request comes back as a comment, labels the issue `rework-1` or `rework-2` and reopens it, and the third fix goes to
   @olegpasko in person.
