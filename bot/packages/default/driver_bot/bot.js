// The bot's brain: a small step machine per chat. A request is drafted in the session (Spaces), becomes a GitHub
// issue on submit, and a marker in Spaces ('issues/<n>.json': the chat id) lets GitHub events find their way back. The
// issues are public: they carry no names and no chat ids (Oleg gets the player's @username in his "🆕 #N" message).
//   createBot({ tg, gh, store, jev, proof, moderate?, adminChat?, gameUrl?, geo? (geo.js; tests pass a fake) }) -> { onUpdate(update), onGitHub(event, payload) }
//   the issue marker { chat, kind, at?: [lat, lon, road] } also feeds the "look in the game" button (gameUrl?at=…&road=…)
//   session (store 'sessions/<chat>.json'): { step, draft: { kind, id, where, desc, what, text, note, back }, ctx, issues: [n],
//     paid: { [n]: UAH counted so far }, mid: a random id for this chat's public files (their URLs go into the issues) }
//   photos go to store 'media/<mid>/<draft id>/…' (public) and are listed on submit, so album parts never race
//   ad artwork (the customer's own picture for the billboard / van / balloon) goes to 'art/<mid>/<draft id>/…' with a
//   .json verdict beside each image (moderate.js): a clear no is turned away, anything unsure gets `art-review` on the issue
//   paid requests are donations: the issue waits under `awaiting-donation` until a proof (screenshot / PDF receipt) passes
//   proof.js -> `donation-ok` (or `donation-review` for a person); proofs stay private in 'proofs/…', their keys stop reuse
//   news: a chat that subscribes gets 'subs/<chat>.json' ({ chat, name, at }) and `sub: true` in its session; the daily
//   post goes out from bot/broadcast.mjs, which lists 'subs/'. Offered on /start, in the menu, by /news and by ?start=sub
const { KINDS, T, JAR, OWNER, uah } = require('./texts');
const { esc } = require('./tg');
const { parsePlace, inCherkasy, fromStart, mapsUrl } = require('./place');
const GEO = require('./geo');
const { randomBytes } = require('node:crypto');

const BOT_MARK = '<!-- bot -->';
const NO_POINT = new Set(['van', 'balloon']); // ad formats with no place: they move all over the city
const ART_MARK = { ok: '✅', review: '👀 перевірити вручну:', reject: '⛔ відхилено:' };
// who an issue belongs to: { chat, kind, at? } in Spaces ('issues/<n>.json'), never in the public issue; the first
// issues carried it as a hidden <!-- tg:{…} --> in the body, still read as a fallback
const markOf = (body) => { try { return JSON.parse(/<!-- tg:(\{.*?\}) -->/.exec(body || '')[1]); } catch { return null; } };
const markKey = (n) => `issues/${n}.json`;
const fixesOf = (issue) => issue.labels.map((l) => /^rework-(\d)$/.exec(l.name || l)?.[1]).filter(Boolean).map(Number).reduce((a, b) => Math.max(a, b), 0);
const hasLabel = (issue, name) => issue.labels.some((l) => (l.name || l) === name);
const btn = (text, data) => ({ text, data });
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const plain = (md) => md.replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\(([^)]+)\)/g, '$1').trim();

// the steps; `input` is what the step waits for, `q` is the question the guardrail checks a typed reply against
const STEPS = {
  imp_where: { input: 'place', field: 'where', next: 'imp_desc', back: 'menu', commercial: true, q: 'Which building or place in Cherkasy should be improved in the game? (an address, a map link or a name)', text: () => T.IMP_WHERE, kb: () => [[btn(T.HOW, 'hm')], [btn(T.BACK, 'b')]] },
  imp_desc: { input: 'text', field: 'desc', next: 'imp_photos', back: 'imp_where', commercial: true, q: 'What should change in how this object looks in the game (facade, floors, roof, windows, trees)?', text: () => T.IMP_DESC, kb: () => [[btn(T.BACK, 'b')]] },
  imp_photos: { input: 'photos', next: 'confirm', back: 'imp_desc', q: 'A note about the photos of the object', text: () => T.IMP_PHOTOS, kb: () => [[btn(T.NEXT, 'n')], [btn(T.BACK, 'b')]] },
  ad_type: { input: 'none', back: 'menu', text: () => T.AD_TYPE,
    kb: () => [[btn('🏢 Заклад – 1000 грн', 't:ad')], [btn('🏢 + 🪧 Заклад і білборд – 2000 грн', 't:ad_bb')], [btn('🪧 Білборд – 1000 грн', 't:bb')], [btn('🚐 Бус – 2000 грн', 't:van')], [btn('🎈 Повітряна куля – 10 000 грн', 't:balloon')], [btn(T.BACK, 'b')]] },
  ad_where: { input: 'place', field: 'where', next: 'ad_what', back: 'ad_type', q: 'Where exactly in Cherkasy should the advertisement be placed? (a Google Maps link, coordinates or an address)', text: (d) => T.AD_WHERE(d.kind === 'bb'), kb: () => [[btn(T.HOW, 'hm')], [btn(T.BACK, 'b')]] },
  ad_what: { input: 'text', field: 'what', next: 'ad_photos', back: (d) => (NO_POINT.has(d.kind) ? 'ad_type' : 'ad_where'), q: 'What business or offer is being advertised: its name, what it offers, the lines for the in-game card, and its website?', text: () => T.AD_WHAT, kb: () => [[btn(T.BACK, 'b')]] },
  ad_photos: { input: 'photos', next: 'ad_art', back: 'ad_what', q: 'A note about the photos or logo for the advertisement', text: () => T.AD_PHOTOS, kb: () => [[btn(T.NEXT, 'n')], [btn(T.BACK, 'b')]] },
  ad_art: { input: 'art', next: 'confirm', back: 'ad_photos', q: 'A note about the advertising artwork', text: (d) => T.AD_ART(d.kind), kb: () => [[btn(T.ART_SKIP, 'n')], [btn(T.BACK, 'b')]] },
  fb_text: { input: 'text', field: 'text', next: 'confirm', back: 'menu', kind: true, q: 'What is missing in the game, what do you like or dislike, or what bug did you notice?', text: () => T.FB_TEXT, kb: () => [[btn(T.BACK, 'b')]] },
};
const MENU_KB = [[btn('🏠 Покращити об\'єкт', 'imp')], [btn('📣 Реклама в грі', 'ad')], [btn('💡 Ідея або відгук', 'fb')], [btn('📋 Мої заявки', 'my')]];
const menuKb = (s) => [...MENU_KB, [s?.sub ? btn(T.NEWS_OFF, 'nw:0') : btn(T.NEWS_ON, 'nw:1')]];

function createBot({ tg, gh, store, jev, proof, moderate = null, adminChat = null, gameUrl = 'https://driver.ck.ua/', geo = GEO }) {
  const { geocode, reverse, gameLink, feature } = geo;
  // ---- where a request is, for the game link: a pin gets its street, a typed address gets a point
  async function locate(where) {
    if (!where) return null;
    if (where.lat != null) return [where.lat, where.lon, await reverse(where.lat, where.lon)];
    const g = await geocode(where.text);
    return g && [g.lat, g.lon, g.road];
  }
  async function placeOf(issue, mark) { // older issues have no `at`: read the "Де" line back; never throws
    if (mark?.at) return mark.at;
    const m = /\*\*Де:\*\*\s*(?:\[(-?[\d.]+), (-?[\d.]+)\]\([^)]*\))?\s*([^\n_]*)/.exec(issue.body || '');
    if (!m) return null;
    return locate(m[1] ? { lat: +m[1], lon: +m[2] } : { text: m[3].trim() }).catch(() => null);
  }
  const lookBtn = (at) => at && [{ text: T.LOOK, url: gameLink(gameUrl, { lat: at[0], lon: at[1], road: at[2] }) }];

  // ---- helpers bound to one update
  function context(chat, from, msgId) {
    const c = { chat, from, msgId, s: null, dirty: false };
    c.show = async (text, kb) => { // edit the message a button was pressed on, else send a new one
      if (c.msgId) {
        const id = c.msgId; c.msgId = null;
        try { return await tg.edit(chat, id, text, kb); } catch (e) { if (/not modified/.test(e.message)) return; }
      }
      return tg.send(chat, text, kb);
    };
    return c;
  }
  const load = async (c) => { c.s = (await store.getJSON(`sessions/${c.chat}.json`)) || { issues: [] }; c.orig = JSON.stringify(c.s); };
  const save = async (c) => { const j = JSON.stringify(c.s); if (j !== c.orig) await store.put(`sessions/${c.chat}.json`, j, { type: 'application/json' }); };
  const mid = (c) => (c.s.mid ||= randomBytes(6).toString('hex')); // not the chat id: these URLs are public
  const mediaDir = (c) => `media/${mid(c)}/${c.s.ctx?.media || c.s.draft?.id || 'loose'}/`;
  const photosOf = async (c) => (await store.list(mediaDir(c))).map((k) => store.url(k));
  const artDir = (c) => `art/${mid(c)}/${c.s.draft?.id || 'loose'}/`;
  const artOf = async (c) => { // [{ url, verdict, reason, p, desc, meta }] in upload order
    const keys = (await store.list(artDir(c))).filter((k) => k.endsWith('.json')).sort();
    return (await Promise.all(keys.map((k) => store.getJSON(k)))).filter(Boolean);
  };

  const markFor = async (issue) => (await store.getJSON(markKey(issue.number)).catch(() => null)) || markOf(issue.body);

  async function menu(c, text = T.MENU) { c.s.step = null; c.s.draft = null; c.s.ctx = null; await c.show(text, menuKb(c.s)); }

  // ---- news: once a day at 21:00 Kyiv, what is new in the game (sent by bot/broadcast.mjs, only on days with news)
  async function news(c, on) {
    const who = [c.from?.first_name, c.from?.last_name].filter(Boolean).join(' ') || c.from?.username || '';
    if (on) await store.put(`subs/${c.chat}.json`, JSON.stringify({ chat: c.chat, name: who, at: new Date().toISOString() }), { type: 'application/json' });
    else await store.del(`subs/${c.chat}.json`);
    c.s.sub = on;
    c.msgId = null; // the button may sit under a news post: answer below it instead of editing the post away
    await c.show(on ? T.NEWS_YES : T.NEWS_NO, [[btn(on ? T.NEWS_OFF : T.NEWS_ON, `nw:${on ? 0 : 1}`)], [btn(T.MENU_BTN, 'm')]]);
  }

  async function go(c, name) {
    if (name === 'menu') return menu(c);
    if (name === 'confirm') return confirm(c);
    c.s.step = name;
    const st = STEPS[name];
    await c.show(st.text(c.s.draft || {}), st.kb(c.s.draft || {}));
  }

  function start(c, kind, first) { c.s.draft = { kind, id: Date.now().toString(36) }; c.s.ctx = null; return go(c, first); }

  async function improve(c, at = null) {
    c.s.draft = { kind: 'improve', id: Date.now().toString(36) }; c.s.ctx = null;
    try { await tg.photo(c.chat, store.url('static/zhuzhoma.jpg'), T.IMP_EXAMPLE); c.msgId = null; } catch { /* no example uploaded yet */ }
    if (!at) return go(c, 'imp_where');
    c.s.draft.where = { ...at, url: mapsUrl(at.lat, at.lon), fromGame: true };
    await c.show(T.IMP_FROM_GAME(c.s.draft.where.url));
    return go(c, 'imp_desc');
  }

  // ---- a landmark? the OSM object at the place (name, type, wikidata / heritage tags) and Jev's judgement over it
  const LANDMARK = 0.6, MAYBE = 0.4; // above: `landmark` label; in between: only a note on the issue to check
  async function landmarkOf(d) {
    const f = feature ? await feature(d.where) : null;
    const osm = f && [f.name, f.kind, Object.entries(f.tags).map(([k, v]) => `${k}=${v}`).join(', ')].filter(Boolean).join(' | ');
    const p = await jev.landmark?.({ request: [d.where?.text, d.desc].filter(Boolean).join(' – '), osm });
    return p == null ? null : { p, is: p >= LANDMARK, maybe: p >= MAYBE && p < LANDMARK, f };
  }

  // ---- confirm & submit
  function summary(d, photos, art = []) {
    const k = KINDS[d.kind], L = [T.CONFIRM_HEAD, '', `${k.icon} <b>${k.name}</b>`];
    if (d.where) L.push(`📍 ${d.where.url ? `<a href="${d.where.url}">${d.where.lat.toFixed(5)}, ${d.where.lon.toFixed(5)}</a>` : ''}${d.where.text ? ` ${esc(d.where.text)}` : ''}`);
    for (const f of ['desc', 'what', 'text', 'note']) if (d[f]) L.push(`✍️ ${esc(clip(d[f], 600))}`);
    if (photos.length) L.push(`📷 Фото: ${photos.length}`);
    const ok = art.filter((a) => a.verdict !== 'reject').length;
    if (ok) L.push(`🖼 Макет: ${ok}`);
    if (k.price) L.push('', `Мінімальний донат: <b>${uah(k.price)}</b>`, k.fixes ? T.WITH_FIXES : T.NO_FIXES, '', T.DONATE);
    return L.join('\n');
  }
  async function confirm(c) {
    const d = c.s.draft; c.s.step = 'confirm';
    const photos = await photosOf(c), k = KINDS[d.kind];
    await c.show(summary(d, photos, await artOf(c)), [[btn(k.price ? T.PAY(k.price) : T.SEND, 'sub')], [btn(T.BACK, 'b'), btn(T.CANCEL, 'x')]]);
  }
  function issueBody(d, photos, at, art = [], lm = null) { // public: no names, no chat ids (the mark goes to Spaces)
    const k = KINDS[d.kind];
    const L = [`## ${k.icon} ${k.name}`, ''];
    if (lm?.is || lm?.maybe) L.push(`> 🏛 **${lm.is ? 'Схоже на лендмарк' : 'Можливо, лендмарк – перевірте'}** (${lm.p.toFixed(2)}): ${lm.f?.name || 'без назви'}${lm.f ? ` · ${lm.f.kind} · [OSM ${lm.f.osm}](https://www.openstreetmap.org/${lm.f.osm})` : ''}${lm.f?.tags.wikipedia ? ` · [Wikipedia](https://${lm.f.tags.wikipedia.split(':')[0]}.wikipedia.org/wiki/${encodeURIComponent(lm.f.tags.wikipedia.split(':').slice(1).join(':'))})` : ''}`, '> Після роботи – додати на мапу (`src/world/cherkasy/places.js`), див. `docs/improve-object.md`.', '');
    if (d.where) L.push(`**Де:** ${d.where.url ? `[${d.where.lat.toFixed(5)}, ${d.where.lon.toFixed(5)}](${d.where.url})` : ''} ${d.where.text || ''}${d.where.fromGame ? ' _(точка з гри)_' : ''}`, '');
    const labels = { desc: 'Що змінити', what: 'Що рекламуємо', text: 'Повідомлення', note: 'Коментар' };
    for (const f of Object.keys(labels)) if (d[f]) L.push(`**${labels[f]}:**`, '', d[f], '');
    if (photos.length) L.push('**Фото:**', '', ...photos.map((u) => `<img src="${u}" width="320">`), '');
    if (art.length) L.push('**Макет замовника:**', '', ...art.flatMap((a) => [`<img src="${a.url}" width="480">`, '',
      `${ART_MARK[a.verdict]} ${a.why || ''}${a.reason ? ` · ${a.reason}` : ''}${a.desc ? ` – _${a.desc.replace(/\s+/g, ' ').slice(0, 300)}_` : ''}`,
      a.meta?.reader ? `<sub>🤖 ${a.meta.reader} · ${a.meta.model} · ${(a.meta.ms / 1000).toFixed(1)} s</sub>` : '', '']), '');
    if (k.price) L.push(`**Донат:** від ${k.price} грн у банку «${JAR.title}» – чекаємо підтвердження`, '');
    L.push('---', `Від гравця через Telegram-бот · правок: ${k.fixes}`, ...(at ? [`<!-- at:${JSON.stringify(at)} -->`] : [])); // the resolved point, for whoever builds it
    return L.join('\n');
  }
  async function submit(c) {
    const d = c.s.draft, k = KINDS[d.kind], photos = await photosOf(c), art = await artOf(c);
    const head = d.where?.text || (d.where ? `${d.where.lat.toFixed(4)}, ${d.where.lon.toFixed(4)}` : '');
    const gist = (d.desc || d.what || d.text || '').replace(/\s+/g, ' ');
    const title = clip(`${k.name}: ${[head, gist].filter(Boolean).join(' – ')}`, 110);
    const at = await locate(d.where).catch(() => null);
    const lm = d.kind === 'improve' ? await landmarkOf(d).catch(() => null) : null;
    const review = art.some((a) => a.verdict === 'review') ? ['art-review'] : [];
    const issue = await gh.create({ title, body: issueBody(d, photos, at, art, lm), labels: [...k.labels, 'telegram', ...review, ...(lm?.is ? ['landmark'] : []), ...(k.price ? ['awaiting-donation'] : [])] });
    await store.put(markKey(issue.number), JSON.stringify({ chat: c.chat, kind: d.kind, ...(at && { at }) }), { type: 'application/json' });
    c.s.issues = [issue.number, ...(c.s.issues || []).filter((n) => n !== issue.number)].slice(0, 30);
    c.s.step = null; c.s.draft = null;
    const who = c.from?.username ? `@${c.from.username}` : [c.from?.first_name, c.from?.last_name].filter(Boolean).join(' ');
    if (adminChat) tg.send(adminChat, `🆕 <b>#${issue.number}</b> ${esc(title)}${who ? `\n👤 ${esc(who)} · чат ${c.chat}` : ''}`, [[{ text: 'Відкрити в GitHub', url: issue.html_url }]]).catch(() => {});
    if (!k.price) return c.show(T.SENT(issue.number), [[btn(T.MENU_BTN, 'm'), btn('📋 Мої заявки', 'my')], ...(c.s.sub ? [] : [[btn(T.NEWS_ON, 'nw:1')]])]);
    return askDonation(c, issue.number, k.price, true);
  }

  // ---- donations: the jar, then a proof
  async function askDonation(c, n, min, fresh) {
    c.s.step = 'proof'; c.s.ctx = { n, media: `d${n}` };
    const left = Math.max(10, min - (c.s.paid?.[n] || 0));
    const kb = [[{ text: T.JAR_BTN, url: JAR.url }], [{ text: T.IG_BTN, url: JAR.ig }], [btn('📋 Мої заявки', 'my'), btn(T.MENU_BTN, 'm')]];
    if (!fresh) return c.show(T.PROOF_ASK(n, left), kb);
    await c.show(T.DONATE_HOW(n, left));
    await tg.photo(c.chat, store.url('static/jar-qr.png'), T.JAR_QR, kb).catch(() => tg.send(c.chat, T.JAR_QR, kb));
  }
  async function onProof(c, m) {
    const { n } = c.s.ctx || {};
    const doc = m.document, f = m.photo?.at(-1) || doc;
    const mime = doc ? doc.mime_type || '' : 'image/jpeg';
    if (!n || !f || !(mime === 'application/pdf' || mime.startsWith('image/'))) return tg.send(c.chat, T.PROOF_ONLY);
    const got = await mine(c, n); if (!got) return;
    const min = KINDS[got.kind]?.price || 0, before = c.s.paid?.[n] || 0;
    await tg.send(c.chat, T.PROOF_WAIT);
    const buf = await tg.file(f.file_id);
    await store.put(`proofs/files/${c.chat}/${n}-${Date.now()}.${mime === 'application/pdf' ? 'pdf' : 'jpg'}`, buf, { type: mime }); // private
    const { fields, meta } = await proof.read(buf, mime);
    const tk = meta.tokens || {};
    const tech = (meta.reader
      ? `розпізнав ${meta.reader} (${meta.model}) за ${(meta.ms / 1000).toFixed(1)} с, токени ${tk.in ?? '?'} / ${tk.out ?? '?'}${tk.reasoning != null ? `, ${tk.reasoning} на роздуми` : ''}${meta.pdf ? ', текст із PDF' : ''}`
      : 'жодна модель не прочитала') + (meta.tried?.length ? ` · не вдалося: ${meta.tried.join('; ')}` : '');
    const j = await proof.judge(fields, { min: min - before, createdAt: got.issue.created_at });
    if (j.key && (await store.getJSON(`proofs/${j.key}.json`))) return tg.send(c.chat, T.PROOF_DUP);
    const facts = fields ? `${j.amount ?? '?'} грн, ${j.when || '?'} (Київ), «${fields.recipient || '?'}», коментар «${fields.comment || ''}»` : 'не розпізнано';
    const note = (head) => `${head} ${facts}. ${j.why || ''}`;
    const toAdmin = (head) => adminChat && Promise.resolve()
      .then(() => tg.send(adminChat, [`${head} · #${n}`, esc(facts), esc(j.why || ''), `🤖 ${esc(tech)}`].join('\n'), [[{ text: 'Відкрити в GitHub', url: got.issue.html_url }]]))
      .then(() => tg.call('copyMessage', { chat_id: adminChat, from_chat_id: c.chat, message_id: m.message_id })).catch(() => {});
    // not sure: first ask for a proper bank receipt, then hand it to a person (Oleg approves with the `donation-ok` label)
    const tries = (c.s.ctx.tries || 0) + (fields ? 1 : 2); c.s.ctx.tries = tries; // nothing could read it: straight to a person
    if (j.verdict === 'old') return tg.send(c.chat, T.PROOF_OLD);
    const again = { unsure: T.PROOF_RECEIPT, unreadable: T.PROOF_UNREADABLE, wrong_jar: T.PROOF_WRONG }[j.verdict];
    if (again && tries < 2) return tg.send(c.chat, again, j.verdict === 'wrong_jar' ? [[{ text: T.JAR_BTN, url: JAR.url }]] : undefined);
    if (again) {
      await gh.comment(n, [note('🔎 **Підтвердження донату – потрібна ручна перевірка:**'), 'Якщо все гаразд – поставте мітку `donation-ok`.', `<sub>🤖 ${tech}</sub>`, BOT_MARK].join('\n\n'));
      await gh.labels(n, ['donation-review']);
      await toAdmin('🔎 Донат на перевірку');
      c.s.step = null; c.s.ctx = null;
      return tg.send(c.chat, T.PROOF_SUPPORT, [[{ text: `Написати ${OWNER}`, url: `https://t.me/${OWNER.slice(1)}` }], [btn('📋 Мої заявки', 'my'), btn(T.MENU_BTN, 'm')]]);
    }
    await store.put(`proofs/${j.key}.json`, JSON.stringify({ n, chat: c.chat, amount: j.amount, when: j.when }), { type: 'application/json' });
    const total = before + j.amount;
    c.s.paid = { ...c.s.paid, [n]: total };
    if (total < min) return tg.send(c.chat, T.PROOF_LOW(total, min), [[{ text: T.JAR_BTN, url: JAR.url }]]);
    await gh.comment(n, [note(`💛 **Донат підтверджено автоматично${before ? ` (разом ${total} грн)` : ''}:**`), `<sub>🤖 ${tech}</sub>`, BOT_MARK].join('\n\n'));
    await gh.labels(n, ['donation-ok'], ['awaiting-donation', 'donation-review']); // the webhook thanks the player
    await toAdmin('💛 Донат зараховано');
    c.s.step = null; c.s.ctx = null;
  }

  // ---- my requests
  const statusOf = (issue, kind) => {
    if (issue.state === 'closed') {
      if (issue.state_reason === 'not_planned') return 'closed';
      return KINDS[kind]?.fixes && !hasLabel(issue, 'confirmed') ? 'check' : 'done';
    }
    if (!hasLabel(issue, 'donation-ok')) {
      if (hasLabel(issue, 'donation-review')) return 'review';
      if (hasLabel(issue, 'awaiting-donation') || hasLabel(issue, 'awaiting-payment')) return 'pay';
    }
    if (fixesOf(issue)) return 'fix';
    return hasLabel(issue, 'in-progress') ? 'work' : 'new';
  };
  async function mine(c, n) { // the issue if it belongs to this chat
    const issue = await gh.get(n).catch(() => null);
    const m = issue && await markFor(issue);
    if (!m || m.chat !== c.chat) { await c.show(T.NOT_YOURS, [[btn(T.TO_LIST, 'my')]]); return null; }
    return { issue, kind: m.kind };
  }
  async function list(c) {
    const ns = (c.s.issues || []).slice(0, 12);
    if (!ns.length) return c.show(T.MY_EMPTY, menuKb(c.s));
    const rows = await Promise.all(ns.map(async (n) => {
      const issue = await gh.get(n).catch(() => null), m = issue && await markFor(issue);
      if (!m) return null;
      return [btn(clip(`#${n} ${KINDS[m.kind]?.icon || ''} ${T.STATUS[statusOf(issue, m.kind)]} · ${issue.title.replace(/^[^:]*:\s*/, '')}`, 60), `i:${n}`)];
    }));
    await c.show(T.MY_HEAD, [...rows.filter(Boolean), [btn(T.MENU_BTN, 'm')]]);
  }
  async function view(c, n) {
    const got = await mine(c, n); if (!got) return;
    const { issue, kind } = got, st = statusOf(issue, kind);
    const kb = [];
    if (st === 'check') kb.push([btn(T.OK, `ok:${n}`), btn(T.FIX, `fx:${n}`)]);
    if (st === 'check' || st === 'done') { const b = lookBtn(await placeOf(issue, await markFor(issue))); if (b) kb.push(b); }
    if (st === 'pay') kb.push([{ text: T.JAR_BTN, url: JAR.url }], [btn(T.PROOF_BTN, `pf:${n}`)]);
    kb.push([btn(T.SAY, `s:${n}`)], [btn(T.TO_LIST, 'my')]);
    await c.show(T.ISSUE({ n, kind, title: esc(issue.title), status: T.STATUS[st] }), kb);
  }

  // ---- typed input for the current step (text / place / photo captions)
  async function guard(c, q, message, extra = {}) {
    const r = await jev.check({ question: q, message, ...extra });
    if (r.verdict === 'junk') { await tg.send(c.chat, T.JUNK); return null; }
    if (r.verdict === 'off_topic') { await tg.send(c.chat, T.OFF_TOPIC); return null; }
    return r;
  }
  async function onInput(c, text, location) {
    const name = c.s.step, st = STEPS[name];
    if (name === 'say' || name === 'fix') return onIssueText(c, text);
    if (name === 'proof') return tg.send(c.chat, T.PROOF_ONLY, [[btn(T.MENU_BTN, 'm')]]);
    if (!st || !c.s.draft) {
      if (text) return menu(c, T.USE_MENU);
      return;
    }
    const d = c.s.draft;
    if (st.input === 'place') {
      const p = await parsePlace(location || text);
      if (!p) return;
      if (p.lat != null && !inCherkasy(p)) return tg.send(c.chat, T.OUTSIDE);
      if (p.lat == null) { // an address in words: make sure it is one
        const r = await guard(c, st.q, p.text, { commercial: st.commercial }); if (!r) return;
        if (st.commercial && r.commercial > 0.7) return askCommercial(c, 'where', p);
      }
      d.where = p;
      return go(c, st.next);
    }
    if (!text) return;
    if (st.input === 'text') {
      const r = await guard(c, st.q, text, { commercial: st.commercial, kind: st.kind }); if (!r) return;
      if (st.commercial && r.commercial > 0.7) return askCommercial(c, st.field, text);
      d[st.field] = text;
      if (st.kind && r.kind) d.kind = r.kind;
      return go(c, st.next);
    }
    if (st.input === 'photos' || st.input === 'art') { // a note next to the photos / the artwork
      const r = await guard(c, st.q, text); if (!r) return;
      d.note = [d.note, text].filter(Boolean).join('\n');
      return tg.send(c.chat, T.NOTE_ADDED, st.kb(d));
    }
    return tg.send(c.chat, T.USE_MENU);
  }
  async function askCommercial(c, field, value) {
    c.s.draft.pending = { field, value };
    await tg.send(c.chat, T.COMMERCIAL, [[btn(T.TO_AD, 'ad')], [btn(T.ANYWAY, 'go!')]]);
  }

  async function onIssueText(c, text) {
    const { n, k } = c.s.ctx || {};
    if (!n) return menu(c);
    const photos = await photosOf(c);
    if (!text && !photos.length) return;
    if (text && !(await guard(c, c.s.step === 'fix' ? 'What should be fixed in the finished game object or ad?' : 'A message to the team about this request', text))) return;
    const body = [text || '', ...photos.map((u) => `<img src="${u}" width="320">`)].join('\n\n') + `\n\n${BOT_MARK}`;
    if (c.s.step === 'fix') {
      await gh.comment(n, `${T.GH_FIX(k, '')}${body}`);
      await gh.labels(n, [`rework-${k}`], ['confirmed']);
      await gh.state(n, 'open');
      c.s.step = null; c.s.ctx = null;
      return tg.send(c.chat, T.FIX_SENT(n, k), [[btn(T.MENU_BTN, 'm'), btn('📋 Мої заявки', 'my')]]);
    }
    await gh.comment(n, `${T.GH_SAY('')}${body}`);
    c.s.step = null; c.s.ctx = null;
    return tg.send(c.chat, T.SAY_SENT(n), [[btn(T.MENU_BTN, 'm'), btn('📋 Мої заявки', 'my')]]);
  }

  // ---- ad artwork: stored at once (public, the issue shows it), then checked; a clear no is turned away
  const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp']);
  async function onArt(c, m) {
    const ph = m.photo?.at(-1), doc = m.document;
    const f = ph || doc;
    const mime = ph ? 'image/jpeg' : doc?.mime_type || '';
    if (!f || !(ph || mime.startsWith('image/') || mime === 'application/pdf')) return tg.send(c.chat, T.ART_FORMAT);
    const ext = ph ? 'jpg' : (doc.file_name?.split('.').pop() || 'png').toLowerCase();
    const key = `${artDir(c)}${Date.now()}-${f.file_unique_id}`;
    const buf = await tg.file(f.file_id);
    await store.put(`${key}.${ext}`, buf, { type: mime, pub: true });
    await tg.send(c.chat, T.ART_WAIT);
    const r = RASTER.has(mime) && moderate
      ? await moderate.check(buf, mime, { what: c.s.draft.what || '' }).catch((e) => ({ verdict: 'review', why: `check failed: ${e.message}` }))
      : { verdict: 'review', why: RASTER.has(mime) ? 'no checker' : `${mime}: checked by a person` };
    await store.put(`${key}.json`, JSON.stringify({ url: store.url(`${key}.${ext}`), ...r }), { type: 'application/json' });
    console.log('[art]', c.chat, r.verdict, r.why, r.meta?.reader || '');
    if (r.verdict === 'reject') return tg.send(c.chat, T.ART_REJECT(r.reason), STEPS.ad_art.kb(c.s.draft));
    return tg.send(c.chat, r.verdict === 'ok' ? T.ART_OK : T.ART_REVIEW, [[btn(T.NEXT, 'n')], [btn(T.BACK, 'b')]]);
  }

  async function onPhoto(c, m) {
    if (c.s.step === 'proof') return onProof(c, m);
    if (c.s.step === 'ad_art' && c.s.draft) return onArt(c, m);
    const ph = m.photo?.at(-1), doc = m.document?.mime_type?.startsWith('image/') ? m.document : null;
    const f = ph || doc;
    if (!c.s.draft && !['say', 'fix'].includes(c.s.step)) return menu(c, T.USE_MENU);
    const ext = doc ? (doc.file_name?.split('.').pop() || 'jpg').toLowerCase() : 'jpg';
    const buf = await tg.file(f.file_id);
    await store.put(`${mediaDir(c)}${Date.now()}-${f.file_unique_id}.${ext}`, buf, { type: doc?.mime_type || 'image/jpeg', pub: true });
    const caption = m.caption?.trim();
    if (caption) return onInput(c, caption);
    if (m.media_group_id) return; // album parts arrive at once: stay quiet instead of answering each
    if (['say', 'fix'].includes(c.s.step)) return tg.send(c.chat, T.PHOTO_ADDED(1) + ' Додайте текст або надішліть ще фото.');
    const n = (await store.list(mediaDir(c))).length, st = STEPS[c.s.step];
    await tg.send(c.chat, T.PHOTO_ADDED(n), st?.input === 'photos' ? st.kb(c.s.draft) : undefined);
  }

  // ---- buttons
  async function onButton(c, data) {
    const [cmd, arg] = data.split(':'), n = +arg, d = c.s.draft;
    switch (cmd) {
      case 'm': return menu(c);
      case 'imp': return improve(c);
      case 'ad': return start(c, 'ad', 'ad_type');
      case 'fb': return start(c, 'feedback', 'fb_text');
      case 'my': c.s.step = null; c.s.draft = null; return list(c);
      case 'x': return menu(c);
      case 'hm': return tg.send(c.chat, T.HOW_MAPS);
      case 'nw': return news(c, arg === '1');
      case 't': // a point from the game map skips the "where" step
        if (!d || !KINDS[arg]) return menu(c);
        d.kind = arg;
        return go(c, NO_POINT.has(arg) || d.where ? 'ad_what' : 'ad_where');
      case 'n': return d ? go(c, STEPS[c.s.step]?.next || 'confirm') : menu(c);
      case 'b': {
        if (!d) return menu(c);
        if (c.s.step === 'confirm') return go(c, d.kind === 'improve' ? 'imp_photos' : ['feature', 'bug', 'feedback'].includes(d.kind) ? 'fb_text' : 'ad_art');
        const st = STEPS[c.s.step]; if (!st) return menu(c);
        return go(c, typeof st.back === 'function' ? st.back(d) : st.back);
      }
      case 'go!': { // "not a business" – take the pending value after all
        if (!d?.pending) return menu(c);
        const { field, value } = d.pending, st = STEPS[c.s.step]; delete d.pending;
        d[field] = value;
        return go(c, st?.next || 'confirm');
      }
      case 'pf': { const got = await mine(c, n); if (!got) return; c.s.draft = null; return askDonation(c, n, KINDS[got.kind]?.price || 0, false); }
      case 'sub': return d && c.s.step === 'confirm' ? submit(c) : menu(c);
      case 'i': return view(c, n);
      case 's': { if (!(await mine(c, n))) return; c.s.step = 'say'; c.s.draft = null; c.s.ctx = { n, media: `c${n}-${Date.now().toString(36)}` }; return c.show(T.SAY_ASK(n), [[btn(T.CANCEL, 'x')]]); }
      case 'ok': {
        const got = await mine(c, n); if (!got) return;
        if (!hasLabel(got.issue, 'confirmed')) { await gh.comment(n, `${T.GH_OK}\n\n${BOT_MARK}`); await gh.labels(n, ['confirmed']); }
        return c.show(T.OK_THANKS, [[btn(T.MENU_BTN, 'm')]]);
      }
      case 'fx': {
        const got = await mine(c, n); if (!got) return;
        const k = fixesOf(got.issue) + 1;
        if (k > (KINDS[got.kind]?.fixes ?? 0)) {
          await gh.comment(n, `${T.GH_FIX_LIMIT}\n\n${BOT_MARK}`);
          return c.show(T.FIX_LIMIT, [[{ text: `Написати ${OWNER}`, url: `https://t.me/${OWNER.slice(1)}` }], [btn(T.MENU_BTN, 'm')]]);
        }
        c.s.step = 'fix'; c.s.draft = null; c.s.ctx = { n, k, media: `f${n}-${k}-${Date.now().toString(36)}` };
        return c.show(T.FIX_ASK(n, k), [[btn(T.CANCEL, 'x')]]);
      }
      default: return menu(c);
    }
  }

  // ---- entry points
  async function onUpdate(u) {
    const cb = u.callback_query, m = u.message || cb?.message;
    if (!m || m.chat.type !== 'private') return;
    const c = context(m.chat.id, (cb || u.message).from, cb && !m.photo ? m.message_id : null);
    await load(c);
    try { await route(c, u, cb, m); } finally { await save(c); } // await inside: a returned promise would outrun finally
  }
  async function route(c, u, cb, m) {
    if (cb) { await tg.answer(cb.id).catch(() => {}); await onButton(c, cb.data || ''); return; }
    const text = m.text?.trim();
    if (text?.startsWith('/')) {
      const [cmd, arg] = text.split(/\s+/);
      if (cmd === '/start') {
        const [flow, pt] = (arg || '').split(/_(?=p\d)/), at = fromStart(pt);
        if (flow === 'imp') return improve(c, at);
        if (flow === 'ad') {
          c.s.draft = { kind: 'ad', id: Date.now().toString(36), ...(at && { where: { ...at, url: mapsUrl(at.lat, at.lon), fromGame: true } }) };
          if (at) await c.show(T.IMP_FROM_GAME(c.s.draft.where.url));
          return go(c, 'ad_type');
        }
        if (arg === 'fb') return start(c, 'feedback', 'fb_text');
        if (arg === 'sub') return news(c, true);
        c.s.step = null; c.s.draft = null;
        return c.show(c.s.sub ? T.WELCOME : `${T.WELCOME}\n\n${T.NEWS_OFFER}`, c.s.sub ? menuKb(c.s) : [[btn(T.NEWS_ON, 'nw:1')], ...MENU_KB]);
      }
      if (cmd === '/my') return list(c);
      if (cmd === '/news') return c.show(c.s.sub ? T.NEWS_YES : T.NEWS_ASK, [[btn(c.s.sub ? T.NEWS_OFF : T.NEWS_ON, `nw:${c.s.sub ? 0 : 1}`)], [btn(T.MENU_BTN, 'm')]]);
      if (cmd === '/stop') return news(c, false);
      return menu(c);
    }
    if (m.photo || m.document) return onPhoto(c, m);
    // a reply to one of the bot's messages about an issue goes into that issue
    const ref = m.reply_to_message?.from?.is_bot && /#(\d+)/.exec(m.reply_to_message.text || m.reply_to_message.caption || '');
    if (ref && text && !c.s.draft && !['say', 'fix'].includes(c.s.step)) {
      if (!(await mine(c, +ref[1]))) return;
      c.s.step = 'say'; c.s.ctx = { n: +ref[1], media: `c${ref[1]}-${Date.now().toString(36)}` };
    }
    return onInput(c, text, m.location);
  }

  async function onGitHub(event, p) {
    const issue = p.issue, mark = issue && await markFor(issue);
    if (!mark) return 'no marker';
    const n = issue.number, title = esc(issue.title), kind = mark.kind, chat = mark.chat;
    const to = (text, kb) => tg.send(chat, text, kb);
    if (event === 'issue_comment' && p.action === 'created') {
      const body = p.comment.body || '';
      if (body.includes(BOT_MARK) || body.trim().startsWith('//') || p.comment.user?.type === 'Bot') return 'skipped';
      return to(T.GH_COMMENT(n, title, esc(clip(plain(body), 3500))), [[btn('✍️ Відповісти', `s:${n}`), btn('📋 Заявка', `i:${n}`)]]);
    }
    if (event === 'issues' && p.action === 'closed') {
      if (issue.state_reason === 'not_planned') return to(T.GH_CLOSED(n), [[btn(T.SAY, `s:${n}`)]]);
      const look = lookBtn(await placeOf(issue, mark));
      if (KINDS[kind]?.fixes) return to(T.GH_DONE_CHECK(n, title), [...(look ? [look] : []), [btn(T.OK, `ok:${n}`), btn(T.FIX, `fx:${n}`)]]);
      return to((T.GH_DONE[kind] || T.GH_DONE.other)(n, !!look), look ? [look] : undefined);
    }
    if (event === 'issues' && p.action === 'labeled' && p.label?.name === 'in-progress') return to(T.GH_PROGRESS(n));
    if (event === 'issues' && p.action === 'labeled' && p.label?.name === 'donation-ok') return to(T.DONATION_OK(n));
    return 'ignored';
  }

  return { onUpdate, onGitHub };
}

module.exports = { createBot, markOf, markKey, BOT_MARK };
