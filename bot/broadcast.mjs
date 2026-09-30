// The daily news post to the bot's subscribers (bot.js keeps them as 'subs/<chat>.json' in Spaces). Run locally by the
// 21:00 Kyiv scheduled task in docs/news.md, which writes the post from the day's commits; nothing new, no post.
//   node bot/broadcast.mjs --status                   -> { subscribers, last: { day, sha, at, sent, dropped } | null }
//   node bot/broadcast.mjs --file post.html [--sha <origin/main sha>] [--dry] [--to <chat>] [--force]
//     post.html: Telegram HTML (b, i, a, code), under 4096 chars. It goes out with "🚗 Грати" and "🔕 Відписатись".
//     --to sends to one chat only (a preview; nothing is recorded); --dry sends nothing; one post per Kyiv day unless
//     --force. Chats that blocked the bot are dropped from 'subs/'. The post and 'news/last.json' are kept in Spaces.
// Secrets come from bot/.env next to this file, or from the file named by BOT_ENV.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSpaces } = require('./packages/default/driver_bot/spaces.js');
const { createTelegram } = require('./packages/default/driver_bot/tg.js');
const { T } = require('./packages/default/driver_bot/texts.js');

const envPath = process.env.BOT_ENV || new URL('.env', import.meta.url).pathname;
if (!existsSync(envPath)) { console.error(`no ${envPath}: set BOT_ENV to the main checkout's bot/.env`); process.exit(2); }
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split('\n')
  .filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const flag = (name) => process.argv.includes(name);

const store = createSpaces({ key: env.SPACES_KEY, secret: env.SPACES_SECRET, bucket: env.SPACES_BUCKET, region: env.SPACES_REGION || 'fra1' });
const tg = createTelegram(env.TELEGRAM_BOT_TOKEN);
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date()); // YYYY-MM-DD in Kyiv
const subs = async () => (await store.list('subs/')).filter((k) => k.endsWith('.json')).map((k) => Number(k.slice(5, -5)));

if (flag('--status')) {
  console.log(JSON.stringify({ subscribers: (await subs()).length, last: await store.getJSON('news/last.json') }, null, 2));
  process.exit(0);
}

const file = arg('--file');
if (!file) { console.error('usage: node bot/broadcast.mjs --status | --file post.html [--sha X] [--dry] [--to CHAT] [--force]'); process.exit(2); }
const text = readFileSync(file, 'utf8').trim();
if (!text || text.length > 4096) { console.error(`post is ${text.length} chars: must be 1..4096`); process.exit(2); }
const kb = [[{ text: '🚗 Грати', url: env.GAME_URL && env.GAME_URL !== 'none' ? env.GAME_URL : 'https://driver.ck.ua/' }], [{ text: T.NEWS_OFF, data: 'nw:0' }]];

const one = arg('--to');
if (one) { await tg.send(Number(one), text, kb); console.log('preview sent to', one); process.exit(0); }

const last = await store.getJSON('news/last.json');
if (last?.day === day && !flag('--force')) { console.log(`already posted today (${day}); --force to post again`); process.exit(0); }
const chats = await subs();
if (flag('--dry')) { console.log(`would send to ${chats.length} subscribers:\n\n${text}`); process.exit(0); }

let sent = 0; const dropped = [], failed = [];
for (const chat of chats) {
  try { await tg.send(chat, text, kb); sent++; }
  catch (e) {
    const code = e.tg?.error_code, wait = e.tg?.parameters?.retry_after;
    if (code === 403 || /chat not found/.test(e.message)) { dropped.push(chat); await store.del(`subs/${chat}.json`); } // blocked the bot, or gone
    else if (code === 429 && wait) { await new Promise((r) => setTimeout(r, wait * 1000)); try { await tg.send(chat, text, kb); sent++; } catch { failed.push(chat); } }
    else failed.push(chat);
  }
  await new Promise((r) => setTimeout(r, 50)); // Telegram allows ~30 messages a second to different chats
}
const rec = { day, sha: arg('--sha') || null, at: new Date().toISOString(), sent, dropped: dropped.length, failed: failed.length };
await store.put(`news/${day}.html`, text, { type: 'text/html; charset=utf-8' });
await store.put('news/last.json', JSON.stringify(rec), { type: 'application/json' });
console.log(JSON.stringify(rec));
if (env.ADMIN_CHAT_ID) await tg.send(Number(env.ADMIN_CHAT_ID), `📰 Новини ${day}: надіслано ${sent}, відписались ${dropped.length}, помилки ${failed.length}`).catch(() => {});
