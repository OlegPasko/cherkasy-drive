// OWNER: cherkasy. Named places for the maps (minimap icons, the big M map): the city's sights, the paying partners
// (kind 'ad': a pink badge and footprint, a link to their site, a soft ring at the door in the world – game/partners.js)
// and the objects rebuilt on a player's request that are not landmarks (kind 'improved': no badge, no name, only a
// quiet grey footprint; the big map names the kind in its legend and on hover – docs/improve-object.md).
// Each is anchored on OSM buildings (their footprints get highlighted on the map) or on a lat / lon / map point.
//   PLACES: [{ id, kind: 'sight' | 'ad' | 'improved', name, note?, issue? (GitHub issue of the request), icon (emoji), logo? (public/assets/brand/<logo>.svg), url?,
//             pitch?: [headline, line, ...], bld?: [OSM building ids], cut?: { p: [x, z], n: [nx, nz] } or a list of them
//             (only the part of the footprints on the +n side of every cut), ring?: flat ring [x, z, …] (a footprint OSM
//             does not have yet), ll?: [lat, lon], xz?: [x, z] }]
//   resolvePlaces(map, geo) -> [{ id, kind, name, note, icon, logo, url, pitch, x, z, rings: [flat ring, ...] }]
//     geo: FRAME_OF(map) (lat / lon -> x / z); places whose anchor cannot be found are dropped
//   USPACE_CUT: the line between the REST INN hotel and the U space office tower in OSM way 129420363 (restinn.js);
//   EVERLABS_CUT: the north end of the Everlabs offices over the hotel (the section next to the tower)
//   clipRing(flat ring, cut) -> flat ring (the part on the +n side; [] when nothing is left)
//   URBAN_RING: the URBAN shop row's footprint (urban.js SITE; a new building OSM does not have)
// the south end of the Rest Inn block (past the step in its east wall), square to the long Nadpilna façade
export const USPACE_CUT = { p: [-756.4, 1438.4], n: [0.0123, 0.9999] };
export const EVERLABS_CUT = { p: [-756.9, 1398.4], n: [0.0123, 0.9999] };
const BELOW_USPACE = { p: USPACE_CUT.p, n: USPACE_CUT.n.map((v) => -v) };
export const URBAN_RING = [-751.5, 1369.5, -728.5, 1369.5, -728.5, 1379.7, -751.5, 1379.7];

export const PLACES = [
  // partners (paid placements; the other hand-built venues stay in the world but are not advertised)
  { id: 'uspace', kind: 'ad', name: 'U space', note: 'Оренда офісів · Надпільна, 252', icon: '🏢', bld: [129420363], cut: USPACE_CUT,
    url: 'https://u.everspace.com.ua/?utm_source=driver.ck.ua',
    pitch: ['Офіс, в який хочеться повертатись', 'Цілий поверх 217 м² або окремі кабінети', 'Резервне живлення – працюєте й під час відключень',
      'Утеплення, якісні вікна, автономне опалення', 'Вентиляція з рекуперацією і фільтрами', 'Два провайдери, до 1000 Мбіт/с'] },
  { id: 'everlabs', kind: 'ad', name: 'Everlabs', note: 'AI-трансформація бізнесу · Надпільна, 252/1', icon: '💻', logo: 'everlabs',
    bld: [129420363], cut: [BELOW_USPACE, EVERLABS_CUT], url: 'https://everlabs.com/?utm_source=driver.ck.ua',
    pitch: ['Трансформуємо бізнес із AI', 'Впроваджуємо AI у ваші продукти та процеси', 'Веб і мобільна розробка',
      'Від ідеї до робочого прототипу за лічені дні', 'AI-інструменти × досвідчена команда', '13+ років, понад 100 запущених проєктів', 'Рейтинг 5.0 на Clutch'] },
  { id: 'tors', kind: 'ad', name: 'Торс', note: 'Фізична реабілітація · бульвар Шевченка, 266', icon: '🤸', bld: [274691767],
    url: 'https://www.instagram.com/cfrn_tors_che/?utm_source=driver.ck.ua',
    pitch: ['Центр фізичної реабілітації і навчання', 'Відновлення після травм і операцій', 'Лікування болю в спині, суглобах і м’язах',
      'Індивідуальні програми реабілітації'] },
  { id: 'urban', kind: 'ad', name: 'URBAN', note: 'Шаурма · street food · Надпільна, 252/1А', icon: '🌯', logo: 'urban',
    ring: URBAN_RING, url: 'https://www.instagram.com/urban_252/?utm_source=driver.ck.ua',
    pitch: ['Загортаємо в лаваш все, що ти любиш', 'Ще й без майонезу!', 'Wraps, bowls і напої', 'Пн–Пт 9:00–22:00, Сб–Нд 10:00–21:30'] },
  // rebuilt on request, not landmarks (a landmark goes with the sights below)
  { id: 'khimikiv44', kind: 'improved', name: 'Покращений об’єкт', note: 'просп. Хіміків, 44', issue: 1, bld: [108980190] },
  { id: 'khrcity', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Остафія Дашковича, 19', bld: [6287196] },
  { id: 'spartak', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Остафія Дашковича, 23', bld: [156926550] },
  { id: 'pioner', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Митницька, 13 / бульв. Шевченка, 274', bld: [411245074] },
  { id: 'slavutych', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Небесної Сотні, 105', bld: [161603694] },
  { id: 'lyubava', kind: 'improved', name: 'Покращений об’єкт', note: 'бульв. Шевченка, 208/1', bld: [159065169] },
  { id: 'budivelnyk', kind: 'improved', name: 'Покращений об’єкт', note: 'просп. Хіміків, 50/1', bld: [132429678] },
  { id: 'grandmarket', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Володимира Великого, 55/1', bld: [94984022, 998351799] },
  { id: 'epicentr', kind: 'improved', name: 'Покращений об’єкт', note: 'просп. Перемоги, 29', bld: [117860219] },
  { id: 'dytlikarnya', kind: 'improved', name: 'Покращений об’єкт', note: 'просп. Перемоги, 16', bld: [94981088] },
  { id: 'hoteldnipro', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Верхня Горова, 13', bld: [402917283] },
  { id: 'dniproplaza', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Припортова, 34', bld: [94983922] },
  { id: 'depot', kind: 'improved', name: 'Покращений об’єкт', note: 'бульв. Шевченка, 385', bld: [398694732] },
  { id: 'politekhkoledzh', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Надпільна, 226', bld: [155200995] },
  { id: 'podatkova', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Хрещатик, 235', bld: [2106384] },
  { id: 'school17', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Хрещатик, 218', bld: [104299469] },
  { id: 'kinoukraina', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Смілянська, 21', bld: [405324710, 104299465] },
  { id: 'chnu3', kind: 'improved', name: 'Покращений об’єкт', note: 'бульв. Шевченка, 79', bld: [103576791] },
  { id: 'pixel', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Сержанта Жужоми, 4', bld: [1303243021] },
  { id: 'miskrada', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Байди Вишневецького, 36', bld: [108383954] },
  { id: 'poshtamt', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Байди Вишневецького, 34', bld: [157506758] },
  { id: 'oblbiblioteka', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Байди Вишневецького, 8', bld: [155354151, 1076511725] },
  { id: 'medakademia', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Хрещатик, 215', bld: [155354150] },
  { id: 'mcdonalds', kind: 'improved', name: 'Покращений об’єкт', note: 'McDonald’s · Смілянська, 31', issue: 12, bld: [104299459] },
  { id: 'delikat', kind: 'improved', name: 'Покращений об’єкт', note: 'Делікат · Благовісна, 300', issue: 12, bld: [118327849] },
  { id: 'atb239', kind: 'improved', name: 'Покращений об’єкт', note: 'АТБ · бульвар Шевченка, 239', issue: 12, bld: [408254373] },
  { id: 'catcafe', kind: 'improved', name: 'Покращений об’єкт', note: 'CatCafe · вул. Байди Вишневецького, 19', issue: 20, bld: [6286345, 422816412] },
  { id: 'praska', kind: 'improved', name: 'Покращений об’єкт', note: 'Будинок-праска · вул. Остафія Дашковича, 4', issue: 20, bld: [258795947, 927234847] },
  // sights
  { id: 'mykhailo', kind: 'sight', name: 'Свято-Михайлівський собор', icon: '⛪', bld: [242469769] },
  { id: 'troitsky', kind: 'sight', name: 'Свято-Троїцький собор', icon: '⛪', bld: [157432721] },
  { id: 'andriy', kind: 'sight', name: 'Храм Андрія Первозванного', note: 'Митниця · вул. Героїв Дніпра, 48', icon: '⛪', bld: [159326530] },
  { id: 'tvtower', kind: 'sight', name: 'Телевежа', note: '196 м', icon: '📡', bld: [412764704] },
  { id: 'chimney', kind: 'sight', name: 'Митницька труба', note: '150 м', icon: '🏭', bld: [879198835] },
  { id: 'druzhba', kind: 'sight', name: 'Палац культури «Дружба народів»', note: 'бульвар Шевченка, 249', icon: '🏛️', bld: [104299448] },
  { id: 'drama', kind: 'sight', name: 'Драмтеатр ім. Шевченка', icon: '🎭', bld: [154341828] },
  { id: 'puppets', kind: 'sight', name: 'Театр ляльок', icon: '🎭', bld: [118327679] },
  { id: 'arena', kind: 'sight', name: 'Черкаси-Арена', icon: '🏟️', bld: [928316618, 928316619], xz: [-971, 326] },
  { id: 'rivport', kind: 'sight', name: 'Річковий вокзал', icon: '⚓', bld: [103630072] },
  { id: 'pagorb', kind: 'sight', name: 'Пагорб Слави', note: 'Монумент «Вітчизна-Мати»', icon: '🔥', xz: [550.6, -210.2] },
  { id: 'roses', kind: 'sight', name: 'Долина троянд', icon: '🌹', ll: [49.45063, 32.0647] },
  { id: 'zamkova', kind: 'sight', name: 'Замкова гора', note: 'Оглядовий майданчик, пам’ятник Івану Підкові', icon: '🏰', ll: [49.44815, 32.06505] },
  { id: 'yalynka', kind: 'sight', name: 'Головна ялинка', note: 'Соборна площа', icon: '🎄', bld: [1011542999] },
  { id: 'hyperboloid', kind: 'sight', name: 'Гіперболоїдна вежа', note: 'Водонапірна вежа Шухова', icon: '🗼', xz: [-1499.9, 1193] },
  { id: 'embankment', kind: 'sight', name: 'Митницька набережна', icon: '🌊', ll: [49.4421357, 32.0980605] },
  { id: 'sosnivka', kind: 'sight', name: 'Пляж «Соснівський-1»', icon: '🏖️', ll: [49.464543, 32.035328] },
  { id: 'kazbet', kind: 'sight', name: 'Казбетський пляж', icon: '🏖️', ll: [49.45722, 32.055922] },
  { id: 'mytnbeach', kind: 'sight', name: 'Митницький пляж', icon: '🏖️', ll: [49.446136, 32.078061] },
  { id: 'kobzar', kind: 'sight', name: 'Музей «Кобзаря» Т. Г. Шевченка', note: 'Будинок Цибульських · Хрещатик, 217', icon: '📖', bld: [157594205] },
  { id: 'museum', kind: 'sight', name: 'Обласний краєзнавчий музей', note: 'вул. Слави, 1', icon: '🏺', bld: [12510122] },
  { id: 'market', kind: 'sight', name: 'Критий ринок', note: 'Центральний ринок, «шайба» · вул. Смілянська, 41/55', icon: '🛒', bld: [156943342] },
  { id: 'wedding', kind: 'sight', name: 'Палац одружень', note: 'Будинок Щербини, 1892 · вул. Небесної Сотні, 3', icon: '💍', bld: [207051954] },
  { id: 'bohdan', kind: 'sight', name: 'Пам’ятник Богдану Хмельницькому', note: 'бульвар Шевченка, біля ПК «Дружба народів»', icon: '🗿', xz: [-7.9, 1267] },
  { id: 'boyan', kind: 'sight', name: 'Пам’ятник Бояну', note: 'площа 700-річчя Черкас', icon: '🗿', ll: [49.4200118, 32.1024328] },
  { id: 'su7', kind: 'sight', name: 'Літак Су-7БКЛ', note: 'Пам’ятний знак льотчикам-визволителям · вхід до парку 30-річчя Перемоги', icon: '✈️', ll: [49.4155013, 32.028787] },
  { id: 'gerb', kind: 'sight', name: 'Стела з гербом України', note: 'Велике коло, площа Перемоги · 11 м, 2017', icon: '🔱', ll: [49.4152526, 32.0306315] },
  { id: 'philharmonic', kind: 'sight', name: 'Обласна філармонія ім. О. Кошиця', note: 'вул. Хрещатик, 196 · скульптура «Висока нота»', icon: '🎻', bld: [157594207] },
  { id: 'bilyidim', kind: 'sight', name: 'Будинок рад («Білий дім»)', note: 'Обласна адміністрація й рада · бульвар Шевченка, 185', icon: '🏛️', bld: [1476966] },
  { id: 'lotus', kind: 'sight', name: 'Храм Білого лотосу', note: 'Зарубинецький узвіз, 4 · буддійський храм', icon: '🪷', bld: [402035058, 402035060] },
  { id: 'station', kind: 'sight', name: 'Залізничний вокзал «Черкаси»', note: 'вул. Володимира Ложешнікова, 1', icon: '🚉', bld: [104134847] },
  { id: 'lovebridge', kind: 'sight', name: 'Міст закоханих', note: 'Сосновий бір, 1969 – арка над яром', icon: '❤️', ll: [49.463929, 32.032171] },
  { id: 'bridge', kind: 'sight', name: 'Міст і дамба', note: 'Переправа через Дніпро', icon: '🌉', ll: [49.47930, 32.03975] },
];

// area-weighted centre of a flat ring (falls back to the vertex mean for degenerate rings)
function ringCentre(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = p.length; i < n; i += 2) {
    const j = (i + 2) % n, k = p[i] * p[j + 1] - p[j] * p[i + 1];
    a += k; cx += (p[i] + p[j]) * k; cz += (p[i + 1] + p[j + 1]) * k;
  }
  if (Math.abs(a) > 1e-6) return [cx / (3 * a), cz / (3 * a)];
  let sx = 0, sz = 0; for (let i = 0; i < p.length; i += 2) { sx += p[i]; sz += p[i + 1]; }
  return [sx / (p.length / 2), sz / (p.length / 2)];
}

export function clipRing(p, { p: [ox, oz], n: [nx, nz] }) {
  const out = [], side = (i) => (p[i] - ox) * nx + (p[i + 1] - oz) * nz;
  const put = (x, z) => { const k = out.length; if (!k || Math.hypot(x - out[k - 2], z - out[k - 1]) > 0.05) out.push(x, z); };
  for (let i = 0, n = p.length; i < n; i += 2) {
    const j = (i + 2) % n, a = side(i), b = side(j);
    if (a >= 0) put(p[i], p[i + 1]);
    if ((a >= 0) !== (b >= 0)) { const t = a / (a - b); put(p[i] + (p[j] - p[i]) * t, p[i + 1] + (p[j + 1] - p[i + 1]) * t); }
  }
  if (out.length >= 4 && Math.hypot(out[0] - out[out.length - 2], out[1] - out[out.length - 1]) <= 0.05) out.length -= 2;
  return out.length >= 6 ? out : [];
}

export function resolvePlaces(map, geo) {
  const byId = new Map();
  const want = new Set(PLACES.flatMap((q) => q.bld || []));
  for (const b of map?.buildings || []) if (want.has(b.id) && b.p?.length >= 6) byId.set(b.id, b.p);
  const out = [];
  for (const q of PLACES) {
    const rings = [...(q.ring ? [q.ring] : []), ...(q.bld || []).map((id) => byId.get(id)).filter(Boolean).map((r) => [].concat(q.cut || []).reduce(clipRing, r)).filter((r) => r.length)];
    let at = q.xz || (q.ll && geo ? geo.toXZ(q.ll[0], q.ll[1]) : null);
    if (!at && rings.length) { // the biggest footprint's centre
      const c = rings.map(ringCentre);
      at = [c.reduce((s, v) => s + v[0], 0) / c.length, c.reduce((s, v) => s + v[1], 0) / c.length];
    }
    if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue;
    out.push({ id: q.id, kind: q.kind, name: q.name, note: q.note || '', icon: q.icon, logo: q.logo || '', url: q.url || '', pitch: q.pitch || [], x: at[0], z: at[1], rings });
  }
  return out;
}
