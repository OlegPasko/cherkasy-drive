// One-off (idempotent) wiring after a deploy: node bot/setup.mjs [--example other.jpg]
//   - Telegram: webhook -> the function URL with the secret token, commands, descriptions
//   - GitHub: the request labels, and the repo webhook (issues + issue_comment) via the gh CLI (needs repo admin)
//   - Spaces: uploads the Zhuzhoma example shot (improvement flow) and the jar's QR code (bot/assets/)
// Reads bot/.env; the function URL comes from `doctl serverless functions get driver_bot --url`.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSpaces } = require('./packages/default/driver_bot/spaces.js');

const env = Object.fromEntries(readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')
  .filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const url = execFileSync('doctl', ['serverless', 'functions', 'get', 'driver_bot', '--url']).toString().trim();
const repo = env.GITHUB_REPO || 'OlegPasko/cherkasy-drive';

async function tg(method, params) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
  const j = await r.json(); console.log(`tg ${method}:`, j.ok ? 'ok' : j.description);
}
await tg('setWebhook', { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
await tg('setMyCommands', { commands: [{ command: 'start', description: 'Головне меню' }, { command: 'my', description: 'Мої заявки' }, { command: 'news', description: 'Новини гри раз на день' }, { command: 'stop', description: 'Відписатись від новин' }] });
await tg('setMyShortDescription', { short_description: 'Cherkasy Drive – гра на driver.ck.ua (на комп\'ютері). Тут: покращити об\'єкт, реклама, ідеї.' });
await tg('setMyDescription', { description: 'Бот гри Cherkasy Drive – Черкаси, які ми будуємо разом. Сама гра – на driver.ck.ua, у браузері на комп\'ютері чи ноутбуці (з телефона – лише мапа міста). Тут можна замовити покращення будинку чи скверу в грі, рекламу закладу, білборд або повітряну кулю, запропонувати ідею чи повідомити про баг. Статуси й відповіді приходять сюди.' });

const LABELS = [
  ['object-improvement', 'c5def5', 'Бот: покращення об\'єкта'], ['ad', 'ff4f8b', 'Бот: реклама закладу'], ['ad-billboard', 'ff8fb8', 'Бот: білборд'],
  ['ad-van', 'f9c784', 'Бот: бус'], ['art-review', 'e99695', 'Бот: макет реклами – перевірити вручну'], ['landmark', 'c5a3ff', 'Бот: лендмарк – додати на мапу'], ['ad-balloon', 'ffb3cf', 'Бот: повітряна куля'], ['feature', 'a2eeef', 'Ідея'], ['feedback', 'd4c5f9', 'Відгук'],
  ['telegram', '229ed9', 'Заявка з Telegram-бота'], ['awaiting-donation', 'fbca04', 'Чекає донату в банку'], ['donation-ok', 'f5c518', 'Донат підтверджено (поставте вручну після перевірки – бот подякує)'], ['donation-review', 'e4a11b', 'Донат – ручна перевірка'], ['in-progress', '0e8a16', 'В роботі (бот повідомить)'],
  ['rework-1', 'f9d0c4', 'Правка 1 від користувача'], ['rework-2', 'e99695', 'Правка 2 від користувача'], ['confirmed', '0e8a16', 'Користувач підтвердив'],
];
for (const [name, color, description] of LABELS) {
  try { execFileSync('gh', ['label', 'create', name, '-R', repo, '--color', color, '--description', description, '--force'], { stdio: 'pipe' }); console.log('label', name); }
  catch (e) { console.warn('label', name, e.stderr?.toString().trim()); }
}

const hooks = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/hooks`]).toString());
const config = { url, content_type: 'json', secret: env.GITHUB_WEBHOOK_SECRET, insecure_ssl: '0' };
const old = hooks.find((h) => h.config?.url === url);
const hookArgs = ['-X', old ? 'PATCH' : 'POST', old ? `repos/${repo}/hooks/${old.id}` : `repos/${repo}/hooks`, '--input', '-'];
execFileSync('gh', ['api', ...hookArgs], { input: JSON.stringify({ config, events: ['issues', 'issue_comment'], active: true }) });
console.log('github webhook', old ? 'updated' : 'created');

const ex = process.argv.indexOf('--example');
const shot = ex > 0 ? process.argv[ex + 1] : new URL('assets/zhuzhoma.jpg', import.meta.url);
const store = createSpaces({ key: env.SPACES_KEY, secret: env.SPACES_SECRET, bucket: env.SPACES_BUCKET, region: env.SPACES_REGION || 'fra1' });
await store.put('static/zhuzhoma.jpg', readFileSync(shot), { type: 'image/jpeg', pub: true });
console.log('example uploaded:', store.url('static/zhuzhoma.jpg'));
await store.put('static/jar-qr.png', readFileSync(new URL('assets/jar-qr.png', import.meta.url)), { type: 'image/png', pub: true });
console.log('jar QR uploaded:', store.url('static/jar-qr.png'));
