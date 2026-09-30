// The daily news to the bot's subscribers by hand. The function posts it on its own every evening (news.js, the
// 'daily-news' trigger in project.yml); this runs the same code locally, with the secrets from bot/.env.
//   node bot/broadcast.mjs --status                   -> { subscribers, cursor: { day, sha }, last: { day, sha, at, sent, dropped } | null }
//   node bot/broadcast.mjs --run [--dry] [--base <sha>]
//     what the trigger does, at any hour: new commits on main since the cursor -> the model's post -> every subscriber.
//     --dry writes the post and prints it, sending and recording nothing; --base picks the first commit to cover.
//   node bot/broadcast.mjs --file post.html [--sha <origin/main sha>] [--dry] [--to <chat>] [--force]
//     post.html: Telegram HTML (b, i, a, code), under 4096 chars. It goes out with "🚗 Грати" and "🔕 Відписатись".
//     --to sends to one chat only (a preview; nothing is recorded); --dry sends nothing; one post per Kyiv day unless
//     --force. Chats that blocked the bot are dropped from 'subs/'. The post and 'news/last.json' are kept in Spaces.
// Secrets come from bot/.env next to this file, or from the file named by BOT_ENV.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildNews } = require('./packages/default/driver_bot/index.js');
const { T } = require('./packages/default/driver_bot/texts.js');

const envPath = process.env.BOT_ENV || new URL('.env', import.meta.url).pathname;
if (!existsSync(envPath)) { console.error(`no ${envPath}: set BOT_ENV to the main checkout's bot/.env`); process.exit(2); }
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split('\n')
  .filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const flag = (name) => process.argv.includes(name);

const news = buildNews(env), { store, tg } = news;
const { day } = news.kyiv(new Date());

if (flag('--status')) {
  const subs = (await store.list('subs/')).filter((k) => k.endsWith('.json')).length;
  console.log(JSON.stringify({ subscribers: subs, cursor: await store.getJSON('news/cursor.json'), last: await store.getJSON('news/last.json') }, null, 2));
  process.exit(0);
}

if (flag('--run')) {
  const r = await news.daily({ now: new Date(), dry: flag('--dry'), base: arg('--base') || undefined, anyHour: true });
  console.log(JSON.stringify({ ...r, text: undefined }, null, 2));
  if (r.text) console.log(`\n${r.text}`);
  process.exit(0);
}

const file = arg('--file');
if (!file) { console.error('usage: node bot/broadcast.mjs --status | --run [--dry] [--base SHA] | --file post.html [--sha X] [--dry] [--to CHAT] [--force]'); process.exit(2); }
const text = readFileSync(file, 'utf8').trim();
if (!text || text.length > 4096) { console.error(`post is ${text.length} chars: must be 1..4096`); process.exit(2); }

const one = arg('--to');
if (one) {
  await tg.send(Number(one), text, [[{ text: '🚗 Грати', url: env.GAME_URL && env.GAME_URL !== 'none' ? env.GAME_URL : 'https://driver.ck.ua/' }], [{ text: T.NEWS_OFF, data: 'nw:0' }]]);
  console.log('preview sent to', one); process.exit(0);
}

const last = await store.getJSON('news/last.json');
if (last?.day === day && !flag('--force')) { console.log(`already posted today (${day}); --force to post again`); process.exit(0); }
if (flag('--dry')) { console.log(`would send to ${(await store.list('subs/')).length} subscribers:\n\n${text}`); process.exit(0); }
console.log(JSON.stringify(await news.broadcast(text, { sha: arg('--sha') || null, day })));
