// Telegram bot (bot/packages/default/driver_bot) against in-memory fakes of Telegram, GitHub, Spaces and Jev:
// the request flows, the issue marker, GitHub events back to the chat, the two-fix limit, place parsing and the
// webhook auth in index.js. Run: node tests/bot.test.mjs
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const dir = '../bot/packages/default/driver_bot/';
const { createBot, markOf } = require(dir + 'bot.js');
const { parsePlace, fromStart, inCherkasy } = require(dir + 'place.js');
const { createProof, kyivNow } = require(dir + 'proof.js');

function fakes({ verdict = 'accept', commercial = 0, kind = 'feature', proofs = [], arts = [] } = {}) {
  const sent = [], files = new Map(), issues = new Map();
  let msgId = 100, issueNo = 0;
  const tg = {
    send: async (chat, text, kb) => { sent.push({ chat, text, kb }); return { message_id: ++msgId }; },
    edit: async (chat, id, text, kb) => { sent.push({ chat, text, kb, edit: id }); return {}; },
    photo: async () => { throw new Error('no example'); },
    answer: async () => {},
    file: async () => Buffer.from('jpeg'),
    call: async (method, p) => { sent.push({ chat: p.chat_id, text: `[${method}]` }); return {}; },
  };
  const gh = {
    create: async ({ title, body, labels }) => { const n = ++issueNo; const i = { number: n, title, body, labels: labels.map((name) => ({ name })), state: 'open', comments: [], html_url: `https://gh/${n}`, created_at: new Date().toISOString() }; issues.set(n, i); return i; },
    get: async (n) => { const i = issues.get(n); if (!i) throw new Error('404'); return i; },
    comment: async (n, body) => { issues.get(n).comments.push(body); },
    labels: async (n, add = [], rm = []) => { const i = issues.get(n); i.labels = i.labels.filter((l) => !rm.includes(l.name)).concat(add.map((name) => ({ name }))); },
    state: async (n, s) => { issues.get(n).state = s; },
  };
  const store = {
    get: async (p) => files.get(p) ?? null,
    getJSON: async (p) => (files.has(p) ? JSON.parse(files.get(p)) : null),
    put: async (p, b) => { files.set(p, b); },
    list: async (p) => [...files.keys()].filter((k) => k.startsWith(p)).sort(),
    del: async (p) => files.delete(p),
    url: (p) => `https://cdn/${p}`,
  };
  const jev = { check: async () => ({ verdict, commercial, kind }), landmark: async ({ request, osm }) => (/wikidata/.test(osm || '') ? 0.95 : 0.1) };
  const proof = { read: async () => ({ fields: {}, meta: { reader: 'fake', model: 'm', ms: 1200, tokens: { in: 300, out: 50, reasoning: 20 }, tried: ['darkbloom: timeout'] } }), judge: async () => proofs.shift() }; // each proof sent takes the next verdict
  const geo = { ...require(dir + 'geo.js'), geocode: async (t) => (/Хіміків/.test(t) ? { lat: 49.40684, lon: 32.04566, road: 'проспект Хіміків' } : null), reverse: async () => 'бульвар Шевченка',
    feature: async (w) => (/Дружба/.test(w?.text || '') ? { name: 'Палац культури Дружба Народів', kind: 'amenity/community_centre', osm: 'way/104299448', lat: 49.4378, lon: 32.0725, tags: { wikidata: 'Q12137549', wikipedia: 'uk:Палац культури «Дружба народів»' } } : null) };
  const moderate = { check: async () => arts.shift() || { verdict: 'ok', why: 'acceptable 0.97', p: 0.97, desc: 'A bakery logo', meta: { reader: 'fake', model: 'm', ms: 900 } } };
  return { sent, files, issues, bot: createBot({ tg, gh, store, jev, proof, moderate, geo, adminChat: 1 }) };
}
const CHAT = 42, from = { id: CHAT, username: 'tester', first_name: 'T' };
const msg = (text, extra = {}) => ({ message: { message_id: 1, chat: { id: CHAT, type: 'private' }, from, text, ...extra } });
const tap = (data) => ({ callback_query: { id: 'q', data, from, message: { message_id: 7, chat: { id: CHAT, type: 'private' } } } });
const last = (f) => f.sent.at(-1);
const buttons = (m) => (m.kb || []).flat().map((b) => b.data || b.url);

// place parsing
{
  const a = await parsePlace('https://www.google.com/maps/place/X/@49.44,32.05,17z/data=!3d49.44412!4d32.05912');
  assert.equal(a.lat, 49.44412); assert.equal(a.lon, 32.05912);
  const b = await parsePlace('49.44412, 32.05912');
  assert.ok(inCherkasy(b));
  assert.deepEqual(await parsePlace({ latitude: 49.4, longitude: 32.1 }).then((p) => [p.lat, p.lon]), [49.4, 32.1]);
  assert.equal((await parsePlace('вул. Жужоми, 10')).text, 'вул. Жужоми, 10');
  assert.ok(!inCherkasy(await parsePlace('50.45, 30.52'))); // Kyiv
  assert.deepEqual(fromStart('p4944412_3205912'), { lat: 49.44412, lon: 32.05912 });
  assert.equal(fromStart('p5045000_3052000'), null);
}

// proof judging: time window (Kyiv wall clock, 3 h slack), the 90% bar, the jar's IBAN from another bank
{
  const jar = { title: 'На матеріали', owner: 'Олександр З.', iban: 'UA743220010000026209329368928' };
  const judgeWith = (g, j) => createProof({ jev: { ask: async () => ({ genuine: { noul: g }, to_jar: { noul: j } }) }, jar }).judge;
  const created = new Date(Date.now() - 3600e3).toISOString(), now = kyivNow();
  const f = (o) => ({ is_payment: true, amount: 50, datetime: now, text: 'Банку поповнено', ...o });
  assert.equal((await judgeWith(0.97, 0.95)(f(), { min: 50, createdAt: created })).verdict, 'ok');
  assert.equal((await judgeWith(0.97, 0.95)(f({ amount: 20 }), { min: 50, createdAt: created })).verdict, 'low');
  assert.equal((await judgeWith(0.97, 0.95)(f({ datetime: kyivNow(new Date(Date.now() - 86400e3)) }), { min: 50, createdAt: created })).verdict, 'old');
  assert.equal((await judgeWith(0.6, 0.95)(f(), { min: 50, createdAt: created })).verdict, 'unsure');
  assert.equal((await judgeWith(0.95, 0.4)(f(), { min: 50, createdAt: created })).verdict, 'unsure');
  assert.equal((await judgeWith(0.95, 0.4)(f({ text: 'ПриватБанк. Отримувач UA74 3220 0100 0002 6209 3293 6892 8' }), { min: 50, createdAt: created })).verdict, 'ok');
  // monobank's own operation screen: only the jar title in «quotes» next to "Банка"; the settled jar lowers the bar to 80%
  const mono = { text: 'Поповнення «На матеріали»\nБанка\n-50.00 ₴\nПовторити платіж', recipient: 'Банка «На матеріали»' };
  assert.equal((await judgeWith(0.87, 0.56)(f(mono), { min: 50, createdAt: created })).verdict, 'ok');
  assert.equal((await judgeWith(0.87, 0.56)(f({ text: 'Переказ на картку', recipient: 'На матеріали' }), { min: 50, createdAt: created })).verdict, 'unsure');
  assert.equal((await judgeWith(0.87, 0.95)(f(), { min: 50, createdAt: created })).verdict, 'unsure');
  assert.equal((await judgeWith(0.1, 0.9)(f(), { min: 50, createdAt: created })).verdict, 'unreadable');
  assert.equal((await judgeWith(0.95, 0.95)({ is_payment: false }, { min: 50, createdAt: created })).verdict, 'unreadable');
  assert.equal((await createProof({ jev: {}, jar }).judge(null, { min: 50, createdAt: created })).verdict, 'unsure');
}

// improve: where -> what -> photo -> confirm -> issue with marker, awaiting payment
{
  const f = fakes();
  await f.bot.onUpdate(msg('/start'));
  assert.match(last(f).text, /Cherkasy Drive/);
  await f.bot.onUpdate(tap('imp'));
  assert.match(last(f).text, /Покращення об'єкта/);
  await f.bot.onUpdate(msg('50.45, 30.52'));
  assert.match(last(f).text, /поза Черкасами/);
  await f.bot.onUpdate(msg('https://maps.google.com/?q=49.44412,32.05912'));
  assert.match(last(f).text, /Що змінити/);
  await f.bot.onUpdate(tap('b'));
  assert.match(last(f).text, /Який об'єкт покращити/);
  await f.bot.onUpdate(msg('49.44412, 32.05912'));
  await f.bot.onUpdate(msg('Фасад зараз бежевий, 9 поверхів, а не 5'));
  assert.match(last(f).text, /Фото/);
  await f.bot.onUpdate(msg(null, { photo: [{ file_id: 'a', file_unique_id: 'u1' }] }));
  assert.match(last(f).text, /Фото додано/);
  await f.bot.onUpdate(tap('n'));
  assert.match(last(f).text, /Перевірте заявку/); assert.match(last(f).text, /Фото: 1/); assert.match(last(f).text, /50 грн/); assert.match(last(f).text, /3D-кузні/);
  await f.bot.onUpdate(tap('sub'));
  const i = f.issues.get(1);
  assert.ok(i, 'issue created');
  assert.deepEqual(markOf(i.body), { chat: CHAT, kind: 'improve', at: [49.44412, 32.05912, 'бульвар Шевченка'] });
  assert.ok(i.labels.some((l) => l.name === 'awaiting-donation') && i.labels.some((l) => l.name === 'object-improvement'));
  assert.match(i.body, /<img src="https:\/\/cdn\/media\/42\//);
  assert.ok(f.sent.some((s) => /Драйвер #1/.test(s.text) && /від 50 грн/.test(s.text)), 'donation how-to');
  assert.ok(buttons(last(f)).includes('https://send.monobank.ua/jar/6JmQWTvEpW'));
  assert.ok(f.sent.some((s) => s.chat === 1 && /#1/.test(s.text)), 'admin notified');
  // improve has no fix rounds: closing just reports done
  await f.bot.onGitHub('issues', { action: 'closed', issue: { ...i, state: 'closed', state_reason: 'completed' } });
  assert.match(last(f).text, /оновлено/);
  assert.deepEqual(buttons(last(f)), ['https://driver.ck.ua/?at=49.44412%2C32.05912&road=%D0%B1%D1%83%D0%BB%D1%8C%D0%B2%D0%B0%D1%80+%D0%A8%D0%B5%D0%B2%D1%87%D0%B5%D0%BD%D0%BA%D0%B0&utm_source=telegram']);
  // an older issue with only a typed address: geocoded when it closes
  f.issues.get(1).body = f.issues.get(1).body.replace(/<!-- tg:.*-->/, '<!-- tg:{"chat":42,"kind":"improve"} -->').replace(/\*\*Де:\*\*.*/, '**Де:**  Проспект Хіміків 44');
  await f.bot.onGitHub('issues', { action: 'closed', issue: { ...f.issues.get(1), state: 'closed', state_reason: 'completed' } });
  assert.match(buttons(last(f))[0], /at=49\.40684%2C32\.04566&road=/);
}

// donation proofs: sure -> donation-ok; partial amounts add up; unsure -> receipt, then a person; reuse refused
{
  const doc = (name = 'r.pdf') => msg(null, { document: { file_id: 'd', file_unique_id: 'u', mime_type: 'application/pdf', file_name: name } });
  const setup = async (proofs) => {
    const f = fakes({ proofs });
    await f.bot.onUpdate(tap('imp')); await f.bot.onUpdate(msg('вул. Смілянська, 2')); await f.bot.onUpdate(msg('Фасад не того кольору'));
    await f.bot.onUpdate(tap('n')); await f.bot.onUpdate(tap('sub'));
    return f;
  };
  let f = await setup([{ verdict: 'low', amount: 20, when: '2026-09-29 13:24', key: 'k1', why: 'g' }, { verdict: 'ok', amount: 30, when: '2026-09-29 13:30', key: 'k2', why: 'g' }]);
  await f.bot.onUpdate(msg('ось'));
  assert.match(last(f).text, /скріншот або квитанцію/);
  await f.bot.onUpdate(doc());
  assert.match(last(f).text, /20 грн.*мінімум.*50 грн/s);
  await f.bot.onUpdate(msg(null, { photo: [{ file_id: 'p', file_unique_id: 'u2' }] }));
  const i = f.issues.get(1);
  assert.ok(i.labels.some((l) => l.name === 'donation-ok') && !i.labels.some((l) => l.name === 'awaiting-donation'));
  assert.match(i.comments.at(-1), /разом 50 грн/); assert.match(i.comments.at(-1), /fake \(m\) за 1\.2 с.*20 на роздуми.*darkbloom: timeout/);
  assert.ok(f.sent.some((s) => s.chat === 1 && /copyMessage/.test(s.text)), 'proof copied to Oleg');
  await f.bot.onGitHub('issues', { action: 'labeled', label: { name: 'donation-ok' }, issue: i });
  assert.match(last(f).text, /Дякуємо за донат/);

  f = await setup([{ verdict: 'unsure', amount: 50, when: 'x', key: 'k3', why: 'genuine 0.6' }, { verdict: 'unsure', amount: 50, when: 'x', key: 'k3', why: 'genuine 0.7' }]);
  await f.bot.onUpdate(msg(null, { photo: [{ file_id: 'p', file_unique_id: 'u3' }] }));
  assert.match(last(f).text, /квитанція/);
  await f.bot.onUpdate(doc());
  assert.match(last(f).text, /ручну перевірку/); assert.ok(buttons(last(f)).includes('https://t.me/olegpasko'));
  assert.ok(f.issues.get(1).labels.some((l) => l.name === 'donation-review'));
  await f.bot.onUpdate(tap('i:1'));
  assert.match(last(f).text, /на перевірці/);

  f = await setup([{ verdict: 'ok', amount: 50, when: 'x', key: 'same', why: 'g' }]);
  f.files.set('proofs/same.json', '{"n":9}');
  await f.bot.onUpdate(doc());
  assert.match(last(f).text, /вже зараховане/);
  await f.bot.onUpdate(tap('i:1'));
  assert.ok(buttons(last(f)).includes('pf:1'));
}

// a business typed into the improvement flow is steered to ads
{
  const f = fakes({ commercial: 0.9 });
  await f.bot.onUpdate(tap('imp'));
  await f.bot.onUpdate(msg('Кав\'ярня Зерно на Смілянській'));
  assert.ok(buttons(last(f)).includes('ad') && buttons(last(f)).includes('go!'));
  await f.bot.onUpdate(tap('go!'));
  assert.match(last(f).text, /Що змінити/);
}

// junk is turned away
{
  const f = fakes({ verdict: 'junk' });
  await f.bot.onUpdate(tap('fb'));
  await f.bot.onUpdate(msg('asdkjh qwe'));
  assert.match(last(f).text, /не відповідь/);
  assert.equal(f.issues.size, 0);
}

// feedback: Jev sorts it, free, sent at once; GitHub comments come back, the user's reply goes in
{
  const f = fakes({ kind: 'bug' });
  await f.bot.onUpdate(tap('fb'));
  await f.bot.onUpdate(msg('Машина провалюється під міст біля порту'));
  assert.match(last(f).text, /Баг/);
  await f.bot.onUpdate(tap('sub'));
  const i = f.issues.get(1);
  assert.ok(i.labels.some((l) => l.name === 'bug'));
  assert.match(last(f).text, /прийнято/);
  await f.bot.onGitHub('issue_comment', { action: 'created', issue: i, comment: { body: 'Дякую, виправимо до п\'ятниці', user: { type: 'User' } } });
  assert.match(last(f).text, /Відповідь по заявці #1/); assert.match(last(f).text, /п'ятниці/);
  const n = f.sent.length;
  await f.bot.onGitHub('issue_comment', { action: 'created', issue: i, comment: { body: '// internal note', user: { type: 'User' } } });
  await f.bot.onGitHub('issue_comment', { action: 'created', issue: i, comment: { body: 'x <!-- bot -->', user: { type: 'User' } } });
  assert.equal(f.sent.length, n, 'internal and echoed comments stay in GitHub');
  await f.bot.onUpdate(tap('s:1'));
  await f.bot.onUpdate(msg('Ще й на мості через Дніпро'));
  assert.match(i.comments.at(-1), /Користувач/); assert.match(i.comments.at(-1), /мості/);
  // reply-to-message shortcut
  await f.bot.onUpdate(msg('І ще одне', { reply_to_message: { from: { is_bot: true }, text: '💬 Відповідь по заявці #1' } }));
  assert.match(i.comments.at(-1), /І ще одне/);
  // someone else's issue is refused
  f.issues.get(1).body = f.issues.get(1).body.replace('"chat":42', '"chat":7');
  await f.bot.onUpdate(tap('i:1'));
  assert.match(last(f).text, /не знайдено/);
}

// van ad: no place step (vans drive all over the city); back from "what" returns to the formats
{
  const f = fakes();
  await f.bot.onUpdate(tap('ad'));
  assert.match(last(f).text, /бусах/);
  await f.bot.onUpdate(tap('t:van'));
  assert.match(last(f).text, /Що рекламуємо/);
  await f.bot.onUpdate(tap('b'));
  assert.match(last(f).text, /Оберіть формат/);
  await f.bot.onUpdate(tap('t:van'));
  await f.bot.onUpdate(msg('Пекарня Колосок. Хліб щоранку, доставка по місту. kolosok.ck.ua'));
  await f.bot.onUpdate(tap('n'));
  assert.match(last(f).text, /борту буса/);
  await f.bot.onUpdate(tap('n'));
  assert.match(last(f).text, /2 000 грн|2000 грн/);
  await f.bot.onUpdate(tap('sub'));
  assert.ok(f.issues.get(1).labels.some((l) => l.name === 'ad-van'));
}

// a landmark: the OSM object has wikidata -> `landmark` label and a note to add it to the maps; a plain house gets neither
{
  const f = fakes();
  await f.bot.onUpdate(tap('imp')); await f.bot.onUpdate(msg('Палац культури Дружба народів')); await f.bot.onUpdate(msg('Фасад зараз інший, з мозаїкою'));
  await f.bot.onUpdate(tap('n')); await f.bot.onUpdate(tap('sub'));
  const i = f.issues.get(1);
  assert.ok(i.labels.some((l) => l.name === 'landmark')); assert.match(i.body, /Схоже на лендмарк/); assert.match(i.body, /places\.js/);
  const g = fakes();
  await g.bot.onUpdate(tap('imp')); await g.bot.onUpdate(msg('вул. Смілянська, 2')); await g.bot.onUpdate(msg('Фасад не того кольору'));
  await g.bot.onUpdate(tap('n')); await g.bot.onUpdate(tap('sub'));
  assert.ok(!g.issues.get(1).labels.some((l) => l.name === 'landmark'));
}

// ad artwork: a clear no is turned away (not counted), an unsure one goes on the issue with `art-review`
{
  const f = fakes({ arts: [{ verdict: 'reject', reason: 'politics', why: 'acceptable 0.08' }, { verdict: 'review', why: 'acceptable 0.6', desc: 'A poster' }] });
  const pic = (id) => msg(undefined, { document: { file_id: id, file_unique_id: id, mime_type: 'image/png', file_name: 'art.png' } });
  await f.bot.onUpdate(tap('ad'));
  await f.bot.onUpdate(tap('t:bb'));
  await f.bot.onUpdate(msg('49.43, 32.06'));
  await f.bot.onUpdate(msg('Кав\'ярня Зерно. Кава, сніданки. zerno.ck.ua'));
  await f.bot.onUpdate(tap('n'));
  assert.match(last(f).text, /для білборда/);
  await f.bot.onUpdate(pic('a1'));
  assert.match(last(f).text, /не можемо розмістити – політика/);
  await f.bot.onUpdate(pic('a2'));
  assert.match(last(f).text, /перегляне людина/);
  await f.bot.onUpdate(msg('Логотип по центру, будь ласка'));
  await f.bot.onUpdate(tap('n'));
  assert.match(last(f).text, /Макет: 1/);
  await f.bot.onUpdate(tap('b'));
  assert.match(last(f).text, /Ваша картинка/);
  await f.bot.onUpdate(tap('n'));
  await f.bot.onUpdate(tap('sub'));
  const i = f.issues.get(1);
  assert.ok(i.labels.some((l) => l.name === 'art-review'));
  assert.match(i.body, /Макет замовника/); assert.match(i.body, /⛔ відхилено/); assert.match(i.body, /Логотип по центру/);
}

// ad: type -> place -> what -> photos -> confirm; done -> check; two fixes, the third goes to Oleg
{
  const f = fakes();
  await f.bot.onUpdate(tap('ad'));
  await f.bot.onUpdate(tap('t:ad_bb'));
  assert.match(last(f).text, /вхід у ваш заклад/);
  await f.bot.onUpdate(tap('hm'));
  assert.match(last(f).text, /Затисніть пальцем/);
  await f.bot.onUpdate(msg('https://www.google.com/maps/@49.43,32.06,19z'));
  await f.bot.onUpdate(msg('Кав\'ярня Зерно. Кава, сніданки. zerno.ck.ua'));
  await f.bot.onUpdate(tap('n'));
  await f.bot.onUpdate(tap('n'));
  assert.match(last(f).text, /2 000 грн|2000 грн/);
  await f.bot.onUpdate(tap('sub'));
  const i = f.issues.get(1);
  assert.ok(i.labels.some((l) => l.name === 'ad-billboard'));
  const close = () => f.bot.onGitHub('issues', { action: 'closed', issue: { ...f.issues.get(1), state_reason: 'completed' } });
  await close();
  assert.deepEqual(buttons(last(f)).slice(1), ['ok:1', 'fx:1']); assert.match(buttons(last(f))[0], /^https:\/\/driver\.ck\.ua\/\?at=49\.43000/);
  for (const k of [1, 2]) {
    f.issues.get(1).state = 'closed'; f.issues.get(1).state_reason = 'completed';
    await f.bot.onUpdate(tap('fx:1'));
    assert.match(last(f).text, new RegExp(`правка ${k} з 2`));
    await f.bot.onUpdate(msg('Логотип замалий'));
    assert.equal(f.issues.get(1).state, 'open');
    assert.ok(f.issues.get(1).labels.some((l) => l.name === `rework-${k}`));
  }
  await f.bot.onUpdate(tap('fx:1'));
  assert.match(last(f).text, /@olegpasko/);
  f.issues.get(1).state = 'closed';
  await f.bot.onUpdate(tap('i:1'));
  assert.ok(buttons(last(f)).includes('ok:1'));
  await f.bot.onUpdate(tap('ok:1'));
  assert.ok(f.issues.get(1).labels.some((l) => l.name === 'confirmed'));
  await f.bot.onUpdate(tap('my'));
  assert.match(buttons(last(f))[0], /^i:1$/);
}

// deep link from the game map
{
  const f = fakes();
  await f.bot.onUpdate(msg('/start imp_p4944412_3205912'));
  assert.ok(f.sent.some((s) => /Точку з гри/.test(s.text)));
  assert.match(last(f).text, /Що змінити/);
}

// an ad from a map point: the type is asked, the place is not
{
  const f = fakes();
  await f.bot.onUpdate(msg('/start ad_p4944412_3205912'));
  assert.match(last(f).text, /Реклама в грі/);
  await f.bot.onUpdate(tap('t:bb'));
  assert.match(last(f).text, /Що рекламуємо/);
}

// news: offered on /start, subscribe by button or deep link, the menu flips to unsubscribe, /stop drops it
{
  const f = fakes();
  await f.bot.onUpdate(msg('/start'));
  assert.match(last(f).text, /Новини гри/);
  assert.equal(buttons(last(f))[0], 'nw:1');
  await f.bot.onUpdate(tap('nw:1'));
  assert.ok(f.files.has(`subs/${CHAT}.json`));
  assert.match(last(f).text, /підписані/);
  assert.equal(last(f).edit, undefined); // under a news post: answered below it, the post stays
  await f.bot.onUpdate(tap('m'));
  assert.ok(buttons(last(f)).includes('nw:0'));
  await f.bot.onUpdate(msg('/stop'));
  assert.ok(!f.files.has(`subs/${CHAT}.json`));
  await f.bot.onUpdate(msg('/start sub'));
  assert.ok(f.files.has(`subs/${CHAT}.json`));
  await f.bot.onUpdate(msg('/start'));
  assert.doesNotMatch(last(f).text, /Нічого не додали/);
}

// daily news (news.js): only after 21:00 Kyiv, the model only when main has new commits, one post a day, fallbacks
{
  const { createNews, kyiv } = require(dir + 'news.js');
  assert.deepEqual(kyiv(new Date('2026-09-30T18:00:00Z')), { day: '2026-09-30', hour: 21 }); // summer: UTC+3
  assert.deepEqual(kyiv(new Date('2026-12-01T19:30:00Z')), { day: '2026-12-01', hour: 21 }); // winter: UTC+2
  const f = fakes(), sent = f.sent, realFetch = globalThis.fetch;
  let head = 'a1', commits = [], asked = [], answers = [];
  const gh = { log: async (base) => { assert.equal(base, f.files.has('news/cursor.json') ? JSON.parse(f.files.get('news/cursor.json')).sha : 'a0'); return { head, commits }; } };
  globalThis.fetch = async (url, o) => { asked.push(url); const a = answers.shift(); if (a instanceof Error) throw a;
    return { ok: true, json: async () => ({ choices: [{ message: { content: a } }] }) }; };
  const tg = { send: async (chat, text, kb) => { if (chat === 13) { const e = new Error('tg: blocked'); e.tg = { error_code: 403 }; throw e; } sent.push({ chat, text, kb }); } };
  f.files.set('news/last.json', JSON.stringify({ day: '2026-09-29', sha: 'a0' }));
  for (const c of [42, 7, 13]) f.files.set(`subs/${c}.json`, '{}');
  const news = createNews({ tg, gh, store: { ...f.bot && {}, get: async (p) => f.files.get(p) ?? null, getJSON: async (p) => (f.files.has(p) ? JSON.parse(f.files.get(p)) : null),
    put: async (p, b) => { f.files.set(p, b); }, list: async (p) => [...f.files.keys()].filter((k) => k.startsWith(p)), del: async (p) => f.files.delete(p) },
    writers: [{ name: 'openai', url: 'u1', key: 'k', model: 'm' }, { name: 'gemma', url: 'u2', key: 'k', model: 'g' }, { name: 'off', url: 'u3', key: '', model: 'x' }],
    adminChat: 1, sleep: async () => {} });
  const at = (h, d = '2026-09-30') => new Date(`${d}T${String(h - 3).padStart(2, '0')}:00:00Z`);
  try {
    assert.match((await news.daily({ now: at(20) })).skip, /before 21/);
    assert.match((await news.daily({ now: at(21) })).skip, /no new commits/); // same head: GitHub only, no model
    assert.equal(asked.length, 0);
    assert.equal(JSON.parse(f.files.get('news/cursor.json')).day, '2026-09-30');
    assert.match((await news.daily({ now: at(22) })).skip, /done for 2026-09-30/);
    head = 'b2'; commits = [{ sha: 'b1', message: 'Update docs' }, { sha: 'b2', message: 'Tidy tests' }]; answers = ['NONE'];
    assert.match((await news.daily({ now: at(21, '2026-10-01') })).skip, /nothing for players in 2 commits \(openai\)/);
    assert.equal(JSON.parse(f.files.get('news/cursor.json')).sha, 'b2');
    head = 'c1'; commits = [{ sha: 'c1', message: 'Hand-build the market' }];
    answers = [new Error('HTTP 500'), '🗞 <b>Що нового</b>\n\n🏛 Ринок — як справжній, і з\'явився дах.'];
    const r = await news.daily({ now: at(21, '2026-10-02') });
    assert.deepEqual([r.writer, r.sent, r.dropped, r.sha], ['gemma', 2, 1, 'c1']);
    assert.equal(r.text, '🗞 <b>Що нового</b>\n\n🏛 Ринок – як справжній, і з’явився дах.'); // no em-dash, a real apostrophe
    assert.deepEqual(asked, ['u1/chat/completions', 'u1/chat/completions', 'u2/chat/completions']); // the NONE run, then u1 fails, u2 writes
    assert.ok(!f.files.has('subs/13.json')); // blocked the bot: unsubscribed
    assert.equal(JSON.parse(f.files.get('news/last.json')).day, '2026-10-02');
    assert.ok(f.files.get('news/2026-10-02.html').startsWith('🗞'));
    assert.deepEqual(sent.filter((m) => m.chat !== 1).map((m) => m.kb.flat().map((b) => b.url || b.data)), [['https://driver.ck.ua/', 'nw:0'], ['https://driver.ck.ua/', 'nw:0']]);
    assert.match(sent.at(-1).text, /надіслано 2, відписались 1/); // the report to Oleg
    head = 'd1'; commits = [{ sha: 'd1', message: 'x' }]; answers = ['<script>x</script>', 'Просто текст'];
    await assert.rejects(news.daily({ now: at(22, '2026-10-03') }), /no writer: openai: bad shape; gemma: bad shape/);
    assert.equal(sent.at(-1).text.startsWith('📰 Новини 2026-10-03 не вийшли'), true); // Oleg hears about it
    assert.equal(sent.filter((m) => m.chat !== 1).length, 2); // nobody else got anything; the cursor stays for a retry
    assert.equal(JSON.parse(f.files.get('news/cursor.json')).sha, 'c1');
    const n = sent.length; answers = ['🗞 ok']; const d = await news.daily({ now: at(23, '2026-10-03'), dry: true });
    assert.deepEqual([d.text, sent.length, JSON.parse(f.files.get('news/cursor.json')).sha], ['🗞 ok', n, 'c1']); // dry: nothing sent or stored
  } finally { globalThis.fetch = realFetch; }
}

// webhook auth in index.js
{
  process.env.TELEGRAM_WEBHOOK_SECRET = 'tgs'; process.env.GITHUB_WEBHOOK_SECRET = 'ghs';
  const { main } = require(dir + 'index.js');
  assert.equal((await main({ __ow_headers: {}, __ow_body: '{}' })).statusCode, 403);
  assert.equal((await main({ __ow_headers: {}, __ow_body: '{}', job: 'news' })).statusCode, 403); // a web call never runs the news job
  assert.equal((await main({ __ow_headers: { 'x-telegram-bot-api-secret-token': 'nope' }, __ow_body: '{}' })).statusCode, 403);
  const body = JSON.stringify({ zen: 'hi' });
  const sig = 'sha256=' + crypto.createHmac('sha256', 'ghs').update(body).digest('hex');
  const r = await main({ __ow_headers: { 'x-hub-signature-256': sig, 'x-github-event': 'ping' }, __ow_body: body });
  assert.deepEqual([r.statusCode, r.body], [200, 'no marker']);
  assert.equal((await main({ __ow_headers: { 'x-hub-signature-256': 'sha256=00', 'x-github-event': 'ping' }, __ow_body: body })).statusCode, 403);
}

console.log('bot: ok');
