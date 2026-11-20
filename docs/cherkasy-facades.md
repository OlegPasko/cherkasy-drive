# Cherkasy facades – a reference for the generated buildings

What ordinary buildings in Cherkasy look like, as far as open sources show it, and how the city generator maps
that to its building types (`typify` in `src/world/buildings.js`, the type detail in `src/world/facade.js`, the
entrances in `src/world/cherkasy/facadekit.js`). Hand-built sites have their own references in their modules.

Researched 2026-11 from Ukrainian Wikipedia's series pages and Wikimedia Commons street photos. Mapillary did not
load, so nothing here comes from street-level sequences. Each fact is marked: **seen** (a Cherkasy photo or a source
naming a Cherkasy address), **series** (true of the series in general, not checked on a Cherkasy house) or
**guess**.

## Which series stand here

| Series | What | Evidence in Cherkasy |
|---|---|---|
| 87 (114-87, 124-87) | nine-storey brick sections and towers, 1970s–90s | **seen**: Смілянська 115/1, 126/2 |
| 121 | nine-storey large-panel, made by the Cherkasy house-building plant (ДБК) | **seen**: Корольова 32, Героїв Дніпра 81 / 87 |
| 182 «Мобіль» | panel-frame nine- and ten-storey | **seen**: Смілянська 128 |
| II-29 | nine-storey brick slab | **seen**: бул. Шевченка 220, 222 |
| 86-030, 164-80-3 | dormitories | **seen** (listed with Cherkasy addresses) |
| 1-447, 1-438 | five-storey brick «хрущовки» | not confirmed by a source; five-storey silicate-brick blocks of this kind are all over the centre and Хімселище (**seen** as a type: Шевченка 345, Лазарєва) |
| 1-464, 1-480 | five-storey large-panel | not confirmed; a few grey panel five-storeys exist (**seen** as a type: Смілянська 117 / 119, 1969) |
| 111-94, 111-96, 1-КГ-480 («чешка»), БПС-6 | Kyiv / other regions' nine-storey panel series | not confirmed for Cherkasy – the local plant made the 121 |

So the game does not name a series on a house. It draws four types that cover what the photos show: panel,
tiled panel, brick, and plastered pre-war / 1950s.

## Facts by type

**Five-storey brick (1-447 kind, 1958–70s).** Floor height 2.7–2.8 m (**series**). Sections of 16–20 m, one stair
per section, four flats a landing (**series**). Walls of white silicate brick, often with red-brick patterns: bands
at sill height, aprons under windows, flat lintel courses (**seen**: Шевченка 345, Черкассы 2020 photos). The stair
shows as one column of smaller windows set half a storey off the flat windows, over the door (**seen**). Roofs: pitched
slate with outside downpipes on the early ones, flat with inside drains later (**series**). Balconies on every second
bay or so, steel bar fronts with flat sheets (**seen**).

**Five-storey panel (1-464 / 1-480 kind).** One panel per room, 2.6 or 3.2 m bays, dark joints between panels both
ways (**series**; **seen** on Смілянська 117). Flat roof, no downpipes (**series**).

**Nine-storey panel, series 121.** Sections of 20–26 m. The stair and lift core shows as a full-height strip of
perforated concrete screens, one per section (**seen**: Корольова 32). Blank end walls with panels of small green or
ochre tile (**seen**). Loggias in vertical stacks. Entrances are porches: side walls and a deep concrete slab over a
few steps; some glazed in later (**guess** from one photo and the common practice).

**Nine-storey brick, series 87.** Silicate or yellow brick; the stair is a recessed darker strip with small square
windows (**seen**: Смілянська 113/1 and 115/1); a dentil band of bricks under the parapet (**seen**).

**Pre-war and 1950s blocks («сталінки»).** Two to five storeys, plastered, with a rusticated ground floor, a string
course over it, plaster window surrounds, a moulded cornice, a pitched roof and outside downpipes; shops on the
ground floor along the main streets (**seen**: Лазарєва 2 and 6, бул. Шевченка).

**Entrances.** бул. Шевченка 200 (panel block, main entrance): a concrete slab on posts over about eight steps
(**seen**). School 11: a canopy on four square piers over a wide stair of about six steps (**seen**). Everything else
about canopies – which series got a bare slab, pipe posts, brick cheek walls, a new sheet visor – is a **guess**
from what such houses have across Ukraine; no Cherkasy photo set covers it. Entrance door colours are a guess too
(brown, grey, dark green, blue steel; wooden leaves on the old houses).

**Windows.** Clearly more than half of the flats have white PVC windows by now; the rest keep brown or
painted-white wooden frames with a T-shaped mullion (**seen** in every 2020 photo; the share is an estimate).

**Industrial.** Цех заводу «Фотоприлад»: a long brick-and-panel shed with ribbon glazing (**seen**). Gates, loading
docks and staff doors are not visible in any photo found – the generated ones are generic (**guess**).

## What the generator does with it

| Type (`PLUS`) | Given to | Shader detail (near only) | Entrance (`kind`) |
|---|---|---|---|
| `PANEL` | concrete-look apartment blocks, public and industrial ones | panel joints per bay and storey, a tone per panel | five storeys: `K`; six and up: `N` porch, stair column plain / perforated screen / glazed strip |
| `TILED` | half of the concrete blocks of six storeys and up | the same, with tiled spandrel panels | `N` |
| `BRICK` | the white, buff and red brick looks | lintel courses, aprons and belts in the other brick, a dentil course under the roof | `K`, or `N` with the recessed stair strip |
| `STALIN` | plastered blocks up to five storeys, some low public ones | rusticated ground floor, string course, window surrounds, cornice | `S` (up to three storeys): plaster architrave, a gable or a hood; else `K` |
| `FRAMES` | every old apartment block | a per-window mix of brown wooden and white frames | |
| `PIPES` | pitched roofs, a third of the low brick ones | a downpipe with a funnel on every fifth bay line | |

- `K`: a door in a portal over a low landing; the canopy is a bare slab, a slab on pipe posts, a slab between cheek
  walls, or a profiled-sheet visor. A lamp, a house plate, a bench by four in ten.
- `N`: a porch with cheek walls, a deep slab and steps; about a third glazed in as a vestibule.
- `M` (new blocks): a glazed lobby under a thin canopy.
- `P` / `p` (public): glazed double doors up a wide stair under a slab on two piers, toward the street; a plain
  door on small ones. None where a shopfront floor already faces a main street.
- Industrial: one to three gates and a staff door on the street-most long wall.

Entrances stand one per section: every 15.5–19 m on five storeys, 20–26 m on nine, one lobby per 30 m of tower.
The stair column over each is its own bay in the wall.

An entrance is built only where its whole footprint is free: no other building, no carriageway (the map's motor and
dirt roads by their widths), and ground its steps can meet. A porch or a public stair that does not fit becomes a
plain door; with a driveway right along the wall the door keeps only a doorstep under its canopy; with no room at all,
or where the ground is more than 1.5 m over the floor line or 2.2 m under it, the stair column stays without a door
(about 5 % of the planned ones). Doors follow the terrain along a sloping block.

The main-street shop porches of the older kit follow the same carriageway rule: one that would reach a carriageway is a
0.55 m doorstep, or nothing where even that would. A townhouse row's door stands in the pier between its unit's two
windows.

Every entrance the kit builds is handed out as a record (place on the wall line, outward normal, half width, reach of
its approach: 4 m, 5 m for the deep `N` porch, 5.5 m for a public stair, 8 m for a gate; `doorways.js`). The street
furniture, the generated trees and the shrubs keep that approach clear (the door's width plus 0.5 m each side).

## Not covered

No balcony glazing styles by series, no real house numbers, no loading docks. Apartment entrances are on the yard side by
rule; real blocks along a boulevard sometimes open to the street.

## Sources

Ukrainian Wikipedia: «Серія 87», «Серія 121», «Серія 182», «1-438», «1-447», «1-464», «1-480», «1-КГ-480», «Серія 94»,
«Серія 96», «1-204».
Wikimedia Commons (category «Buildings in Cherkasy» and its street subcategories): `Вул. Смілянська, 113·1 і 115·1.jpg`,
`Вул. Академіка Корольова, 32.jpg`, `Вул. Смілянська, 128.jpg`, `Бул. Шевченко, 220 і 222.jpg`, `Шевченка 345.jpg`,
`Черкассы, 2020, 44.jpg` / `68` / `86`, `Вулиця Лазарєва б.2.JPG` / `б.6.JPG`, `Бул. Шевченка, 200, головний вхід.jpg`,
`Черкаська школа № 11.jpg`, `Цех заводу «Фотоприлад».jpg`.
