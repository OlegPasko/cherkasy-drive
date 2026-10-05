// OWNER: cherkasy. Named places for the maps (minimap icons, the big M map): the city's sights, the paying partners
// (kind 'ad': a pink badge and footprint, a link to their site, a soft ring at the door in the world – game/partners.js)
// and the objects rebuilt on a player's request that are not landmarks (kind 'improved': no badge, no name, only a
// quiet grey footprint; the big map names the kind in its legend and on hover – docs/improve-object.md).
// Each is anchored on OSM buildings (their footprints get highlighted on the map) or on a lat / lon / map point.
//   PLACES: [{ id, kind: 'sight' | 'ad' | 'improved', name, note?, issue? (GitHub issue of the request), icon (emoji), logo? (public/assets/brand/<logo>.svg), url?,
//             pitch?: [headline, line, ...], bld?: [OSM building ids], cut?: { p: [x, z], n: [nx, nz] } or a list of them
//             (only the part of the footprints on the +n side of every cut), ring?: flat ring [x, z, …] (a footprint OSM
//             does not have yet), rings?: several such rings, ll?: [lat, lon], xz?: [x, z] }]
//   resolvePlaces(map, geo) -> [{ id, kind, name, note, icon, logo, url, pitch, x, z, rings: [flat ring, ...], ringIds }]
//     ringIds[i]: the OSM building id rings[i] came from (`bld`), null for a place's own `ring` / `rings`
//     geo: FRAME_OF(map) (lat / lon -> x / z); places whose anchor cannot be found are dropped
//   USPACE_CUT: the line between the REST INN hotel and the U space office tower in OSM way 129420363 (restinn.js);
//   EVERLABS_CUT: the north end of the Everlabs offices over the hotel (the section next to the tower)
//   clipRing(flat ring, cut) -> flat ring (the part on the +n side; [] when nothing is left)
//   URBAN_RING: the URBAN shop row's footprint (urban.js SITE; a new building OSM does not have)
//   HD34_RING: the outline of the new block at Героїв Дніпра, 34 (hd34.js)
//   PERLYNA_RING: the footprint of ЖК «Перлина Дніпра» (perlyna.js; not in OSM yet)
//   SHEV22_RING: the new block at бульвар Шевченка, 22 (shev22.js SHEV22_BOX; not in OSM yet)
//   ONIX_RINGS (onix_data.js): the ЖК Onix sections, one ring each (most of them are not in OSM yet)
//   NARB10_RING: the outline of the new block at Нарбутівська, 10 (narbutivska10.js)
//   NADP249_RING: the stepped outline of the new club house at Надпільна, 249 (nadpilna249.js)
import { ONIX_RINGS } from './onix_data.js';

//   OLIMPM_RINGS: the section outlines of ЖК «Олімп Модерн» (olimpmodern.js; a place's `ring` may be a list of flat rings)
//   SMIL52_RING: the outline of the new tower at вул. Смілянська, 52 (smilianska.js)
// the south end of the Rest Inn block (past the step in its east wall), square to the long Nadpilna façade
export const USPACE_CUT = { p: [-756.4, 1438.4], n: [0.0123, 0.9999] };
export const EVERLABS_CUT = { p: [-756.9, 1398.4], n: [0.0123, 0.9999] };
const BELOW_USPACE = { p: USPACE_CUT.p, n: USPACE_CUT.n.map((v) => -v) };
export const URBAN_RING = [-751.5, 1369.5, -728.5, 1369.5, -728.5, 1379.7, -751.5, 1379.7];
// the new block at Героїв Дніпра, 34 (hd34.js hd34Outline, not in OSM yet; tests/hd34.test.mjs keeps the two in step)
export const HD34_RING = [685, 1901.3, 683.2, 1905, 693, 1909, 704.4, 1898.9, 704, 1896.4, 708.9, 1895.6, 709.1, 1896.8, 735.8, 1892.3, 733.7, 1880, 707.1, 1884.5, 707.3, 1885.7, 702.3, 1886.5, 701.9, 1884.1, 696.9, 1884.9, 683.3, 1868.9, 684.8, 1864.2, 682.5, 1863.4, 684, 1858.6, 685.2, 1859, 693.7, 1833.4, 681.9, 1829.4, 673.4, 1855.1, 674.6, 1855.5, 673, 1860.2, 670.6, 1859.4, 658.8, 1869.2, 661.3, 1879.4, 665.2, 1878.2];
// ЖК «Перлина Дніпра»: a new block OSM does not have yet (perlyna.js PERLYNA_OUTLINE)
export const PERLYNA_RING = [813.4, 939.2, 759.5, 904.6, 748.5, 921.8, 786.3, 946.1, 768, 974.8, 783.9, 985];
// ЖК «Олімп Модерн», Квіткова 10 (olimpmodern.js olimpModernRings, mostly not in OSM yet; tests/olimpmodern.test.mjs keeps them in step)
export const OLIMPM_RINGS = [[-2473.2, -1560.5, -2472.6, -1548.2, -2486.1, -1547.5, -2486.8, -1559.8], [-2472.6, -1548.2, -2469.6, -1492.3, -2483.2, -1491.5, -2486.1, -1547.5], [-2468.9, -1479, -2467.8, -1458.6, -2481.4, -1457.9, -2482.5, -1478.3], [-2467.8, -1458.6, -2466.5, -1434.6, -2480.1, -1433.9, -2481.4, -1457.9], [-2466.5, -1434.6, -2465.5, -1415.1, -2479.1, -1414.4, -2480.1, -1433.9], [-2480.1, -1433.9, -2479.1, -1414.4, -2503, -1413.1, -2504, -1432.7], [-2504.2, -1436.7, -2503.3, -1418.7, -2527.2, -1417.4, -2528.2, -1435.4], [-2536.2, -1435, -2535.2, -1417, -2559.2, -1415.7, -2560.1, -1433.7], [-2561.9, -1466.7, -2559.2, -1415.7, -2573.2, -1415, -2575.9, -1465.9], [-2553.1, -1566.3, -2548.5, -1479.4, -2562.5, -1478.6, -2567.1, -1565.5], [-2493.1, -1567.4, -2492.4, -1553.4, -2528.3, -1551.5, -2529.1, -1565.5], [-2529.2, -1567.5, -2528.4, -1553.5, -2552.4, -1552.3, -2553.1, -1566.3]];
// the new block at Нарбутівська, 10 (narbutivska10.js NARB10_RING, not in OSM yet; tests/narbutivska10.test.mjs compares them)
export const NARB10_RING = [-921.6, 1395.2, -921.6, 1429.1, -947.8, 1429.1, -947.8, 1410.9, -941.6, 1410.9, -941.6, 1395.2];
// the new block at бульвар Шевченка, 22 (shev22.js SHEV22_BOX; tests/shev22.test.mjs keeps the two in step)
export const SHEV22_RING = [-65, -2476, -65, -2446, -87, -2446, -87, -2476];
// the new block at бульвар Шевченка, 184–186 (shev184.js shev184Local.outline(), not in OSM yet; tests/shev184.test.mjs keeps them in step)
export const SHEV184_RING = [-75.2, -592, -74.5, -591.9, -73.8, -591.6, -73.2, -591.2, -72.8, -590.6, -72.5, -589.9, -72.4, -589.2, -72.6, -563, -91.1, -563.1, -90.9, -592.1];

// the north-west tower of «Надія» at вул. Смілянська, 52 (smilianska.js SMIL52_RING; OSM has only a misplaced marker;
// tests/smilianska.test.mjs keeps the two in step)
export const SMIL52_RING = [-386.7, 294.1, -372.7, 294.1, -358.4, 280, -358.4, 266, -376.7, 266, -386.7, 276];
// the new club house at Надпільна, 249 (nadpilna249.js NADP249_RING, not in OSM yet; tests/nadpilna249.test.mjs compares them)
export const NADP249_RING = [-696.3, -518.8, -685.9, -518.8, -685.9, -519.4, -681.9, -519.4, -681.9, -516.3, -671.5, -516.3, -671.5, -516.9, -667.5, -516.9, -667.5, -513.8, -657.1, -513.8, -657.1, -503.6, -667.5, -503.6, -667.5, -502.8, -671.5, -502.8, -671.5, -506.1, -681.9, -506.1, -681.9, -505.3, -685.9, -505.3, -685.9, -508.6, -696.3, -508.6];

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
  { id: 'kupershtein', kind: 'improved', name: 'Покращений об’єкт', note: 'Будинок з грифонами (Куперштейна, 1890-ті) · Замковий узвіз, 1', bld: [178369998] },
  { id: 'khrcity', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Остафія Дашковича, 19', bld: [6287196] },
  { id: 'blakytnyi', kind: 'improved', name: 'Блакитний палац', note: 'колишній готель «Слов’янський» · вул. Остафія Дашковича, 20', bld: [2810576] },
  { id: 'nbu', kind: 'improved', name: 'Національний банк України', note: 'Черкаське управління · вул. Остафія Дашковича, 21', bld: [157594229] },
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
  { id: 'atb26', kind: 'improved', name: 'Покращений об’єкт', note: 'АТБ · Остафія Дашковича, 26', issue: 28, bld: [157528369] },
  { id: 'school7', kind: 'improved', name: 'Покращений об’єкт', note: 'Школа №7 · Добровольчих батальйонів, 13', issue: 29, bld: [158065243, 158065244] },
  { id: 'atb239', kind: 'improved', name: 'Покращений об’єкт', note: 'АТБ · бульвар Шевченка, 239', issue: 12, bld: [408254373] },
  { id: 'catcafe', kind: 'improved', name: 'Покращений об’єкт', note: 'CatCafe · вул. Байди Вишневецького, 19', issue: 20, bld: [6286345, 422816412] },
  { id: 'praska', kind: 'improved', name: 'Покращений об’єкт', note: 'Будинок-праска · вул. Остафія Дашковича, 4', issue: 20, bld: [258795947, 927234847] },
  { id: 'delikat399', kind: 'improved', name: 'Покращений об’єкт', note: 'Делікат · бульвар Шевченка, 399/2', issue: 27, bld: [399652294] },
  { id: 'rotunda397', kind: 'improved', name: 'Покращений об’єкт', note: 'Будівля зі скляною ротондою · бульвар Шевченка, 397', issue: 27, bld: [418579439] },
  { id: 'ekvator', kind: 'improved', name: 'Покращений об’єкт', note: 'ТЦ «Екватор» · просп. Хіміків, 74', issue: 25, bld: [147261886] },
  { id: 'sportlife', kind: 'improved', name: 'Покращений об’єкт', note: 'Sport Life · вул. Козацька, 2', issue: 25, bld: [159700781] },
  { id: 'avrora', kind: 'improved', name: 'Покращений об’єкт', note: 'Аврора · вул. Смілянська, 144/2', issue: 26, bld: [415321196] },
  { id: 'sviatotroitskyi', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Святотроїцький» · бульвар Шевченка, 202', bld: [997523173] },
  { id: 'hd34', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Героїв Дніпра, 34', ring: HD34_RING },
  { id: 'hrafskyi', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Графський» · вул. Байди Вишневецького, 68', bld: [1193290975, 1193290976, 989035400, 1193288998, 989035398, 989035397, 973321831, 19744972] },
  { id: 'perlyna', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Перлина Дніпра» · вул. Героїв Дніпра, 77', ring: PERLYNA_RING },
  { id: 'premierbay', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК Premier Bay (будується) · вул. Героїв Дніпра / вул. Козацька', bld: [1526030153, 1526030154, 1526030155, 1526030156] },
  { id: 'onix', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК Onix · вул. Сковороди / Теліги', rings: ONIX_RINGS },
  { id: 'pasterivskyi', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Пастерівський» (проєкт) · вул. Олександра Маламужа, 31', bld: [1430787298, 1430787299, 1430787297, 1430787300] },
  { id: 'ekohouse', kind: 'improved', name: 'Покращений об’єкт', note: 'КМ «Екохаус» · вул. Гетьмана Сагайдачного / Симиренківська', bld: [1441670084, 1441670085],
    rings: [[-1461, 4222.5, -1434.5, 4222.5, -1434.5, 4233.8, -1461, 4233.8], [-1461, 4194.7, -1434.5, 4194.7, -1434.5, 4206, -1461, 4206]] }, // ekohouse.js EKO_ROWS 3 and 4
  { id: 'voldim', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК VOLDIM · вул. Володимира Великого, 41/3', bld: [1198239247] },
  { id: 'ridnyidim', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Рідний Дім» · вул. Надпільна, 222', bld: [1430800366, 1430800367, 1318431924, 973321830, 1430800368] },
  { id: 'olimp', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Олімп» · вул. Сумгаїтська, 15/5', bld: [21402178] },
  { id: 'harmony', kind: 'improved', name: 'Покращений об’єкт', note: 'Клубний комплекс Harmony · просп. Перемоги, 69', bld: [1507392909] },
  { id: 'olimpmodern', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Олімп Модерн» · вул. Квіткова, 10', ring: OLIMPM_RINGS },
  { id: 'hoholia204', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Гоголя, 204', bld: [1303437479] },
  { id: 'pryportova', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Припортова, 22/1', bld: [874640721, 997356687, 997356688, 1303296241] },
  { id: 'narbutivska10', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Нарбутівська, 10', ring: NARB10_RING },
  { id: 'parkovyi', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Парковий квартал» · вул. Івана Кожедуба, 59', bld: [1522301396, 1522301395, 984246825, 1430817645, 1560091949, 1430817647, 1430817646] },
  { id: 'shev22', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · бульвар Шевченка, 22', ring: SHEV22_RING },
  { id: 'shev184', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · бульвар Шевченка, 184–186', ring: SHEV184_RING },
  { id: 'comfortpark', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Комфорт Парк» · вул. В’ячеслава Чорновола, 243/1', bld: [411921795] },
  { id: 'zhktemp', kind: 'improved', name: 'Покращений об’єкт', note: 'ЖК «Темп» · вул. Юрія Іллєнка, 4', bld: [117808102, 996032042] },
  { id: 'smilianska48', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Смілянська, 48, 50, 54', bld: [546773841] },
  { id: 'smilianska52', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Смілянська, 52', ring: SMIL52_RING },
  { id: 'ambrosa35', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Сергія Амброса, 35', bld: [1160384062] },
  { id: 'nadpilna249', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Надпільна, 249', ring: NADP249_RING },
  { id: 'taraskova5', kind: 'improved', name: 'Покращений об’єкт', note: 'Новобудова · вул. Тараскова, 5', bld: [994859234, 1318428500] },
  { id: 'chnudorms', kind: 'improved', name: 'Покращений об’єкт', note: 'Гуртожитки №3 і №4 ЧНУ · вул. Хрещатик, 62–64', issue: 35, bld: [104380675, 103587765] },
  { id: 'lunashops', kind: 'improved', name: 'Покращений об’єкт', note: 'АТБ і магазини · вул. Генерала Момота, 1', issue: 34, bld: [1041448576] },
  { id: 'smil117', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Смілянська, 117', issue: 40, bld: [105315513] },
  { id: 'smil119', kind: 'improved', name: 'Покращений об’єкт', note: 'вул. Смілянська, 119', issue: 40, bld: [105315529] },
  { id: 'belakhov', kind: 'improved', name: 'Будинок Белахова', note: 'перший кінотеатр Черкас (1908), пам’ятка архітектури 1880-х · вул. Хрещатик, 219', bld: [157594220] },
  { id: 'sklovsky', kind: 'improved', name: 'Будинок Скловського', note: 'колишня синагога (до 1923), третій поверх – 1960-ті · вул. Слави, 11', bld: [157436225] },
  { id: 'horodetsky', kind: 'improved', name: 'Жіноча гімназія Городецького', note: '1903–1905, нині Центр дитячої та юнацької творчості · вул. Смілянська, 33', bld: [108382800] },
  { id: 'tobacco', kind: 'improved', name: 'Тютюнова фабрика Зарицького', note: 'з 1878, нині ЦНАП і шаховий клуб · вул. Благовісна, 170', bld: [157006547, 997923403, 997923404] },
  // sights
  { id: 'mykhailo', kind: 'sight', name: 'Свято-Михайлівський собор', icon: '⛪', bld: [242469769] },
  { id: 'troitsky', kind: 'sight', name: 'Свято-Троїцький собор', icon: '⛪', bld: [157432721] },
  { id: 'andriy', kind: 'sight', name: 'Храм Андрія Первозванного', note: 'Митниця · вул. Героїв Дніпра, 48', icon: '⛪', bld: [159326530] },
  { id: 'tvtower', kind: 'sight', name: 'Телевежа', note: '196 м', icon: '📡', bld: [412764704] },
  { id: 'chimney', kind: 'sight', name: 'Митницька труба', note: '150 м', icon: '🏭', bld: [879198835] },
  { id: 'druzhba', kind: 'sight', name: 'Палац культури «Дружба народів»', note: 'бульвар Шевченка, 249', icon: '🏛️', bld: [104299448] },
  { id: 'drama', kind: 'sight', name: 'Драмтеатр ім. Шевченка', note: 'Музично-драматичний театр · бульвар Шевченка, 234', icon: '🎭', bld: [154341828] },
  { id: 'shevchenko', kind: 'sight', name: 'Пам’ятник Тарасу Шевченку', note: 'Площа перед драмтеатром · 1964', icon: '🗿', xz: [-95.7, 220.1] },
  { id: 'puppets', kind: 'sight', name: 'Театр ляльок', icon: '🎭', bld: [118327679] },
  { id: 'arena', kind: 'sight', name: 'Черкаси-Арена', icon: '🏟️', bld: [928316618, 928316619], xz: [-971, 326] },
  { id: 'rivport', kind: 'sight', name: 'Річковий вокзал', icon: '⚓', bld: [103630072] },
  { id: 'pagorb', kind: 'sight', name: 'Пагорб Слави', note: 'Монумент «Вітчизна-Мати»', icon: '🔥', xz: [550.6, -210.2] },
  { id: 'roses', kind: 'sight', name: 'Долина троянд', icon: '🌹', ll: [49.45063, 32.0647] },
  { id: 'zamkpark', kind: 'sight', name: 'Парк під Замковою горою', note: 'Проєкт парку: фонтан, дитячий майданчик, сходи на Замкову гору', icon: '⛲', ll: [49.44925, 32.06525] },
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
  // a multipolygon relation comes as several entries under one id: every piece is kept
  for (const b of map?.buildings || []) if (want.has(b.id) && b.p?.length >= 6) byId.set(b.id, [...(byId.get(b.id) || []), b.p]);
  const out = [];
  for (const q of PLACES) {
    const own = [...(q.ring ? (Array.isArray(q.ring[0]) ? q.ring : [q.ring]) : []), ...(q.rings || [])];
    const osm = (q.bld || []).flatMap((id) => (byId.get(id) || []).map((r) => [id, [].concat(q.cut || []).reduce(clipRing, r)])).filter(([, r]) => r.length);
    const rings = [...own, ...osm.map(([, r]) => r)], ringIds = [...own.map(() => null), ...osm.map(([id]) => id)];
    let at = q.xz || (q.ll && geo ? geo.toXZ(q.ll[0], q.ll[1]) : null);
    if (!at && rings.length) { // the biggest footprint's centre
      const c = rings.map(ringCentre);
      at = [c.reduce((s, v) => s + v[0], 0) / c.length, c.reduce((s, v) => s + v[1], 0) / c.length];
    }
    if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue;
    out.push({ id: q.id, kind: q.kind, name: q.name, note: q.note || '', icon: q.icon, logo: q.logo || '', url: q.url || '', pitch: q.pitch || [], x: at[0], z: at[1], rings, ringIds });
  }
  return out;
}
