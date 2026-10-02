// The daily news post to the bot's subscribers ('subs/<chat>.json'), written by a model from the day's commits on main.
//   createNews({ tg, gh, store, writers, adminChat, gameUrl }) -> {
//     daily({ now?, dry?, base?, anyHour? }) -> { skip: why } | { day, sha, text, sent, dropped, failed, writer }
//     write(commits) -> { text | null (nothing for players), writer, tried }
//     broadcast(text, { sha, day }) -> { day, sha, at, sent, dropped, failed }
//     kyiv(date) -> { day: 'YYYY-MM-DD', hour }, tg, store }
//   writers: OpenAI-compatible chat endpoints tried in order [{ name, url, key, model, effort?, timeout }]
// The 'daily-news' trigger in project.yml calls daily() at 18:00 and 19:00 UTC; the run that lands on 21:00 Kyiv does the
// work (the winter 18:00 is 20:00 Kyiv and returns at once), so summer time needs no cron change; a failed summer run is
// retried at 22:00 by the second one. 'news/cursor.json' = { day, sha }: the
// last Kyiv day checked and the main commit it covered. No new commits: no model call and no post. Nothing a player
// would notice (the model answers NONE): no post. Either way the cursor moves on. bot/broadcast.mjs runs the same by hand.
const { T } = require('./texts');

const PROMPT = `Ти пишеш щоденний допис про оновлення для гравців браузерної гри Cherkasy Drive (відкритий світ у реальному місті Черкаси: машина, що літає, місії, пам'ятки). Нижче – коміти за день англійською.

Залиш лише те, що гравець побачить або відчує в грі: нові чи перебудовані будівлі й пам'ятки, місії, можливості, керування, звуки, карта, продуктивність і помітні виправлення, нові способи долучитися (бот, реклама). Відкинь документацію, тести, інструменти, рефакторинг, аналітику, деплой, внутрішню кухню бота і все, чого гравець не помітить. Якщо не лишилося нічого – відповідай рівно словом NONE.

Формат – Telegram HTML (лише <b>, <i>, <a href>), українською, тире лише «–» (ніколи «—»):
🗞 <b>Оновлення Cherkasy Drive</b>
(порожній рядок)
2–7 рядків: емодзі й одне коротке живе речення про одну зміну, так, як це бачить гравець («На Замковій горі тепер …»). Пов'язані коміти злий в один рядок. Зроблене на прохання гравця можна назвати «за заявкою гравця», без імен і номерів.
(порожній рядок)
🔄 Щоб побачити – оновіть сторінку гри без кешу: Cmd + Shift + R (Mac) або Ctrl + F5 (Windows).

До 1200 символів. Жодних внутрішніх слів (коміт, PR, рефакторинг, назви модулів) і жодних обіцянок на майбутнє. Відповідай лише текстом допису.

Коміти:
`;
const TAGS = /<(?!\/?[bi]>|a href="[^"<>]*">|\/a>)/; // anything but <b>, <i>, <a href="…"> breaks Telegram's HTML or the rules
const HOUR = 21;

function kyiv(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

function createNews({ tg, gh, store, writers, adminChat = null, gameUrl = 'https://driver.ck.ua/', sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const kb = [[{ text: '🚗 Грати', url: gameUrl }], [{ text: T.NEWS_OFF, data: 'nw:0' }]];
  const tell = (text) => (adminChat ? tg.send(adminChat, text).catch(() => {}) : null);

  async function ask(w, content) {
    const r = await fetch(`${w.url}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(w.timeout || 60000),
      headers: { authorization: `Bearer ${w.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: w.model, messages: [{ role: 'user', content }], ...(w.effort ? { reasoning_effort: w.effort } : { temperature: 0.4 }) }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return String((await r.json()).choices?.[0]?.message?.content || '').trim();
  }

  async function write(commits) {
    const content = PROMPT + commits.map((c) => `- ${c.message}`).join('\n\n'), tried = [];
    for (const w of writers.filter((x) => x.key)) {
      try {
        const raw = await ask(w, content);
        if (/^NONE\b/.test(raw)) return { text: null, writer: w.name, tried };
        const text = raw.replace(/—/g, '–').replace(/(\p{L})'(\p{L})/gu, '$1’$2');
        if (!text.startsWith('🗞') || text.length > 3000 || TAGS.test(text)) throw new Error('bad shape');
        return { text, writer: w.name, tried };
      } catch (e) { tried.push(`${w.name}: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`); }
    }
    throw new Error(`no writer: ${tried.join('; ') || 'no keys'}`);
  }

  async function broadcast(text, { sha = null, day }) {
    const chats = (await store.list('subs/')).filter((k) => k.endsWith('.json')).map((k) => Number(k.slice(5, -5)));
    let sent = 0; const dropped = [], failed = [];
    for (const chat of chats) {
      try { await tg.send(chat, text, kb); sent++; }
      catch (e) {
        const code = e.tg?.error_code, wait = e.tg?.parameters?.retry_after;
        if (code === 403 || /chat not found/.test(e.message)) { dropped.push(chat); await store.del(`subs/${chat}.json`); } // blocked the bot, or gone
        else if (code === 429 && wait) { await sleep(wait * 1000); try { await tg.send(chat, text, kb); sent++; } catch { failed.push(chat); } }
        else failed.push(chat);
      }
      await sleep(50); // Telegram allows ~30 messages a second to different chats
    }
    const rec = { day, sha, at: new Date().toISOString(), sent, dropped: dropped.length, failed: failed.length };
    await store.put(`news/${day}.html`, text, { type: 'text/html; charset=utf-8' });
    await store.put('news/last.json', JSON.stringify(rec), { type: 'application/json' });
    await store.put('news/cursor.json', JSON.stringify({ day, sha }), { type: 'application/json' });
    await tell(`📰 Оновлення ${day}: надіслано ${sent}, відписались ${dropped.length}, помилки ${failed.length}`);
    return rec;
  }

  async function daily({ now = new Date(), dry = false, base, anyHour = dry } = {}) {
    const { day, hour } = kyiv(now);
    if (hour < HOUR && !anyHour) return { skip: `before ${HOUR}:00 Kyiv` };
    const cursor = await store.getJSON('news/cursor.json'), last = await store.getJSON('news/last.json');
    if (!dry && (cursor?.day === day || last?.day === day)) return { skip: `done for ${day}` };
    const from = base ?? cursor?.sha ?? last?.sha ?? null;
    const { head, commits } = await gh.log(from, new Date(now - 864e5).toISOString());
    const done = (skip) => (dry ? { skip, head } : store.put('news/cursor.json', JSON.stringify({ day, sha: head }), { type: 'application/json' }).then(() => ({ skip, head })));
    if (!commits.length) return done('no new commits');
    let w;
    try { w = await write(commits); }
    catch (e) { if (!dry) await tell(`📰 Оновлення ${day} не вийшло: ${e.message}`); throw e; }
    if (!w.text) return done(`nothing for players in ${commits.length} commits (${w.writer})`);
    if (dry) return { day, sha: head, text: w.text, writer: w.writer, tried: w.tried, commits: commits.length };
    return { ...(await broadcast(w.text, { sha: head, day })), text: w.text, writer: w.writer };
  }

  return { daily, write, broadcast, kyiv, tg, store };
}

module.exports = { createNews, kyiv };
