// DigitalOcean Function entry (web: raw). One URL takes both webhooks and tells them apart by their auth header:
//   Telegram:  X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET  -> bot.onUpdate(update)
//   GitHub:    X-Hub-Signature-256 == HMAC(GITHUB_WEBHOOK_SECRET, body)    -> bot.onGitHub(event, payload)
// Anything else gets 403. Errors are logged and answered 200, so Telegram does not retry a poisoned update forever.
// The 'daily-news' scheduled trigger (project.yml) calls it with { job: 'news' } and no __ow_headers -> news.daily();
// a web call always carries __ow_headers, and raw web actions keep query and body out of args, so it cannot fake that.
//   main(args) -> { statusCode, body }
const crypto = require('node:crypto');
const { createBot } = require('./bot');
const { createTelegram } = require('./tg');
const { createGitHub } = require('./gh');
const { createSpaces } = require('./spaces');
const { createJev } = require('./jev');
const { createProof } = require('./proof');
const { createModeration } = require('./moderate');
const { createNews } = require('./news');
const { JAR } = require('./texts');

let bot = null, news = null;
// doctl rejects empty values, so an unset key is written "none" in bot/.env
const clean = (raw) => Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === 'none' ? '' : v]));
const services = (env) => ({
  tg: createTelegram(env.TELEGRAM_BOT_TOKEN),
  gh: createGitHub({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO || 'OlegPasko/cherkasy-drive', assignee: env.GITHUB_ASSIGNEE || undefined }),
  store: createSpaces({ key: env.SPACES_KEY, secret: env.SPACES_SECRET, bucket: env.SPACES_BUCKET, region: env.SPACES_REGION || 'fra1' }),
  adminChat: env.ADMIN_CHAT_ID ? Number(env.ADMIN_CHAT_ID) : null,
  gameUrl: env.GAME_URL || undefined,
});
function buildNews(raw) { // the post: GPT-6 Luna, then Gemma on Darkbloom when OpenAI fails
  const env = clean(raw);
  return createNews({ ...services(env), writers: [
    { name: 'openai', url: 'https://api.openai.com/v1', key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-6-luna', effort: 'high', timeout: 90000 },
    { name: 'darkbloom', url: 'https://api.darkbloom.dev/v1', key: env.DARKBLOOM_API_KEY, model: env.DARKBLOOM_MODEL || 'gemma-4-26b', timeout: 60000 },
  ] });
}
function build(raw) {
  const env = clean(raw);
  const jev = createJev(env.TYPESAFE_API_KEY);
  const readers = [ // vision for proofs and ad artwork: Gemma on Oleg's own Darkbloom nodes (free), DeepSeek when that fails
    { name: 'darkbloom', url: 'https://api.darkbloom.dev/v1', key: env.DARKBLOOM_API_KEY, model: env.DARKBLOOM_MODEL || 'gemma-4-26b', timeout: 15000 },
    { name: 'deepseek', url: 'https://api.deepseek.com', key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL || 'deepseek-flash', timeout: 12000 },
  ];
  return createBot({
    ...services(env),
    jev,
    proof: createProof({ jev, jar: JAR, readers }),
    moderate: createModeration({ jev, readers }),
  });
}

function rawBody(args) { // raw web actions pass the body as text, or base64 for types the platform deems binary
  const b = args.__ow_body || '';
  return /^\s*[{[]/.test(b) ? Buffer.from(b) : Buffer.from(b, 'base64');
}
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function main(args) {
  const env = process.env;
  if (!args.__ow_headers && args.job === 'news') {
    news ||= buildNews(env);
    try { const r = await news.daily(); console.log('[news]', JSON.stringify({ ...r, text: undefined })); return { body: r }; }
    catch (e) { console.error('[news]', e.stack || e); return { body: { error: e.message } }; }
  }
  const h = args.__ow_headers || {};
  bot ||= build(env);
  try {
    const raw = rawBody(args);
    const tgSecret = h['x-telegram-bot-api-secret-token'];
    if (tgSecret) {
      if (!env.TELEGRAM_WEBHOOK_SECRET || !same(tgSecret, env.TELEGRAM_WEBHOOK_SECRET)) return { statusCode: 403, body: 'bad secret' };
      await bot.onUpdate(JSON.parse(raw.toString('utf8')));
      return { statusCode: 200, body: 'ok' };
    }
    const sig = h['x-hub-signature-256'];
    if (sig) {
      const want = 'sha256=' + crypto.createHmac('sha256', env.GITHUB_WEBHOOK_SECRET || '').update(raw).digest('hex');
      if (!env.GITHUB_WEBHOOK_SECRET || !same(sig, want)) return { statusCode: 403, body: 'bad signature' };
      const r = await bot.onGitHub(h['x-github-event'], JSON.parse(raw.toString('utf8')));
      return { statusCode: 200, body: typeof r === 'string' ? r : 'ok' };
    }
    return { statusCode: 403, body: 'forbidden' };
  } catch (e) {
    console.error('[driver_bot]', e.stack || e);
    return { statusCode: 200, body: 'error logged' };
  }
}

module.exports = { main, buildNews };
