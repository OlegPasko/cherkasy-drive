# @driver_game_bot – the Telegram bot of Cherkasy Drive

Players file requests in Telegram. Every request becomes a GitHub issue in `OlegPasko/cherkasy-drive`, and whatever
happens to the issue (a comment, `in-progress`, closing) comes back to the player in Ukrainian. The player can answer
from Telegram, and the answer lands in the same issue.

## What the player can do

| Menu | Minimum donation | GitHub labels | After "done" |
|---|---|---|---|
| 🏠 Покращити об'єкт (non-commercial: homes, schools, parks) | 50 грн | `object-improvement` | a one-off job, no fix rounds |
| 📣 Реклама: заклад | 1000 грн | `ad` | up to 2 fixes, the 3rd goes to @olegpasko |
| 📣 Заклад + білборд | 2000 грн | `ad`, `ad-billboard` | the same |
| 📣 Білборд (alone) | 1000 грн | `ad-billboard` | the same |
| 📣 Бус (the traffic vans' livery) | 2000 грн | `ad-van` | the same |
| 📣 Повітряна куля | 10 000 грн | `ad-balloon` | the same |
| 💡 Ідея або відгук | free | `feature` / `bug` / `feedback` (Jev sorts it) | a message only |
| 📋 Мої заявки | – | – | the list, status, "write into the request", ✅/✏️ |

Every request also gets `telegram`.

## Donations instead of payments

Paid requests are paid by a donation to the monobank jar «На матеріали» of 3D-кузня (the 3D forge,
https://www.instagram.com/3d_kuznya/; https://send.monobank.ua/jar/6JmQWTvEpW). The bot names the forge and links its
Instagram wherever the jar comes up. The jar collects for consumables to make useful things for the defence forces.
There is no payment processing.

1. After submitting, the issue gets `awaiting-donation`. The player sees:
   - the jar button, the forge's Instagram button and the QR (`static/jar-qr.png`), whose caption says to send a proof next;
   - the minimum sum ("any amount, but at least N");
   - the comment to write: `Драйвер #N`.
2. The player sends a screenshot or a receipt (a PDF or an image).
   - The player first sees "🔎 Аналізуємо платіж…".
   - A model **only reads it** (`proof.js`): sum, date and time, recipient, comment, receipt id, transcription.
     - **Darkbloom `gemma-4-26b`** runs first, on Oleg's own nodes, so it is free. **DeepSeek `deepseek-flash`** is the
       fallback on a timeout, an HTTP error or broken JSON.
     - Images go in as images. For a PDF, its text layer is pulled out in the function (`unpdf`) and sent as text.
     - The issue comment records which model read it, the time, the tokens, the reasoning tokens and the failed
       attempts.
   - Jev **judges it**: is it a completed payment (not a form, a jar page or a shop order), and is it to our jar? Our jar
     is recognised by title, owner, or the IBAN `UA74 3220 0100 0002 6209 3293 6892 8`, which also works for PrivatBank
     and other banks. The IBAN, or the exact title in «quotes» beside the word "банка" (all that monobank's own operation
     screen shows), settles the jar in code; Jev alone rates a bare title at only ~0.55.
   - Code checks the plain facts:
     - the sum ≥ the minimum; partial donations add up;
     - the time is not before the request, compared as Kyiv wall clock with 3 h of slack (a phone shows its own zone);
     - the same receipt is never counted twice (`proofs/<key>.json`).
3. The outcome:
   - **Sure (≥ 0.9 on both; ≥ 0.8 "genuine" once the jar is settled by IBAN or title)**: `donation-ok`, a comment with the facts, and the player is thanked.
   - **Unsure** (e.g. only the "Банку поповнено" screen, where the title is generic): the bot asks for the bank
     **receipt** (квитанція).
   - **Still unsure, unreadable twice, or no model could read it**: `donation-review`, a comment, the proof is copied
     to Oleg in Telegram, and the player gets "перевіримо вручну, питання – @olegpasko".
   - **Wrong jar or a payment older than the request**: the bot says so and asks again.
4. Oleg approves by hand with the **`donation-ok` label**, and the bot thanks the player.

Proof files are private in Spaces (`driver-bot/proofs/files/…`), because receipts carry names. Only the extracted facts
go into the issue.

Flows:

- **Improve.** A place, then what to change, then optional photos, then confirm.
  - The place can be an address, a Google Maps link, coordinates or a Telegram location.
  - The first screen shows the Zhuzhoma shot as the example.
  - On submit the bot looks the object up in OSM (Nominatim: name, type, `wikidata` / `wikipedia` / `heritage` tags)
    and asks Jev whether it is a city landmark. At 0.6 or above the issue gets `landmark` and a note with the OSM and
    Wikipedia links; between 0.4 and 0.6 it gets a "Можливо, лендмарк – перевірте" note. A landmark also gets a badge on
    the game's maps (`src/world/cherkasy/places.js`). The whole job is in `docs/improve-object.md`.
- **Ad.** A format, then an exact point (with a how-to for copying a Google Maps point), then what is advertised and
  the website, then optional photos and logo, then the customer's own artwork (optional), then confirm.
  - The van and the balloon skip the point (vans drive all over the city).
  - **Artwork moderation** (`moderate.js`). A vision model (the proof readers: Gemma on Darkbloom, then DeepSeek) only
    describes the picture: the scene, every piece of text, symbols and people. Jev then judges whether it is fit for a
    family-friendly game:
    - at 0.75 or above it is accepted;
    - at 0.25 or below it is turned away with the reason (sexual, violence, hate, drugs or betting, politics or calls to
      action, scam);
    - anything in between, a non-raster file or a checker outage is accepted, and the issue gets `art-review`.
    Each image is kept in `art/<chat>/<draft>/` with a `.json` verdict beside it, and the issue shows all of them,
    rejected ones marked ⛔.
- **Feedback.** Text plus an optional screenshot, then send.
- **Navigation.** Every screen has "← Назад"; `/start` and `/my` always work.
- **News.** A daily post at 21:00 Kyiv about what reached the game that day, and nothing on days without news.
  - Offered right on `/start` (the first button and a line under the welcome), then in the menu ("🔔 Підписатись" /
    "🔕 Відписатись"), by `/news` and `/stop`, and from the game's "🔔 Новини" chip (`?start=sub` subscribes at once).
  - A subscriber is `subs/<chat>.json` in Spaces (and `sub: true` in the session, for the menu button).
  - `news.js` posts it at 21:00 Kyiv from the `daily-news` trigger: GPT-6 Luna (Gemma as the fallback) writes it from
    `main`'s new commits, and there is no model call and no post when nothing is new (`docs/news.md`; `bot/broadcast.mjs`
    runs the same by hand). Chats that blocked the bot are dropped. Every post and `news/last.json` stay in Spaces.

## How Oleg works the issues

- **New issues are assigned to the repo owner** (`GITHUB_ASSIGNEE` overrides it). GitHub never emails you about your
  own actions, and the bot files issues with Oleg's token, so the reliable alert is the admin chat (`ADMIN_CHAT_ID`):
  "🆕 #N …" with a GitHub button. The assignment is for the "Assigned to me" filter.
- **A comment goes to the player** as "💬 Відповідь по заявці #N". Write in Ukrainian; the text is sent as is.
- **A comment that starts with `//` is internal.** The player never sees it.
- **The `in-progress` label** sends "🔧 Заявку взяли в роботу".
- **Close as completed:**
  - for ads, the player gets "Все ок / Потрібна правка";
  - "Правка" reopens the issue with `rework-1` / `rework-2` and the player's comment;
  - "Все ок" adds `confirmed`;
  - for the other kinds, a "done" message only.
- **Close as not planned** sends "закрито без виконання".
- **Bot comments** (player replies, fixes, confirmations) carry `<!-- bot -->` and are never echoed back.
- **A player's reply or fix request** also goes to the admin chat ("💬 Гравець відповів · #N" / "🛠 Правка k від гравця",
  the text and a GitHub button): the bot comments with Oleg's token, so GitHub itself never notifies him.
- **Photos** are public files in Spaces (`everlabs-file-uploads/driver-bot/media/<mid>/…`, `mid` a random id per chat,
  never the chat id), shown inline in the issue.
- **The issues are public**, so they carry no player names and no chat ids: the footer says only "Від гравця через
  Telegram-бот". Who asked is in Oleg's "🆕 #N" Telegram message (@username and chat id).

## How it works

```
Telegram ──webhook──┐                                   ┌── GitHub issue (public: no names, no chat ids)
                    ├─> DO Function default/driver_bot ─┤
GitHub  ──webhook───┘   (nodejs:24, web: raw)           └── Spaces: sessions/<chat>.json, issues/<n>.json, media/…, static/…
                                 │
                                 └─> TypeSafe Jev: guardrail on every typed reply
```

Code in `packages/default/driver_bot/`:

- `index.js` – the entry point. It tells the two webhooks apart by their auth:
  - Telegram's `secret_token` header;
  - GitHub's HMAC `X-Hub-Signature-256`.

  Anything else gets 403.
- `bot.js` – the step machine, the drafts, issue creation, "my requests" and the GitHub events.
- `texts.js` – all copy, the prices and the labels.
  - `JAR` and `DONATE` hold the jar link, IBAN and the wording.
- `proof.js` – donation proofs: the read (Darkbloom → DeepSeek, PDFs via `unpdf`), the Jev judgement, the amount and
  time checks. This is the one npm dependency (`unpdf`); DO installs it on deploy.
- `jev.js` – the guardrail on typed replies:
  - one Choice decides accept / off_topic / junk;
  - a Noul asks "is this a business?" in the free-improvement flow;
  - a Choice sorts feature / bug / feedback.

  If Jev fails, the reply is accepted.
- `place.js` – Google Maps links (including short links), coordinates, the Cherkasy box, and the deep links from the
  game.
- `spaces.js` – S3 SigV4 without dependencies.
- `tg.js`, `gh.js` – thin API wrappers.

State:

- The conversation (step and draft) lives in `sessions/<chat>.json` in Spaces.
- The request itself lives in the issue.
- The link back from an issue to its chat is `issues/<n>.json` in Spaces (`{ chat, kind, at? }`). The first issues
  (#1–#4) carried it as a hidden `<!-- tg:{…} -->` in the body, which is still read when Spaces has no record.

## Links into the game

A finished request carries a **🚗 Подивитись у грі** button, on the "done" message and in the request card. It links to
`https://driver.ck.ua/?at=lat,lon&road=…`, and the game starts on that street right before the object (`src/game/placeat.js`).

- The point comes from the request: a pin or coordinates as given, or a typed address geocoded with OSM Nominatim
  (`geo.js`, bounded to Cherkasy).
- The street name comes from a building-level reverse lookup and is kept in the issue's mark (`at`, also a hidden `<!-- at:[…] -->` line in the body). Older issues are
  geocoded from their "Де" line when they close.
- Override the base with `GAME_URL`.

## Links from the game

`src/ui/botlink.js` builds them:

- the "✈ Бот" chip next to H;
- a line in the H card;
- a button on the big map;
- a line in the partner card ("Хочете тут свою рекламу?");
- a **right click on the big map**: "Покращити цей об'єкт" / "Реклама тут" with that point.
  - The deep link is `t.me/driver_game_bot?start=imp_p4944412_3205912`, i.e. lat/lon × 1e5.

## Deploy

```
cp bot/.env.example bot/.env                  # fill it in once (gitignored)
doctl serverless deploy bot                   # from the repo root
node bot/setup.mjs                            # Telegram webhook/commands, labels, GitHub webhook, example shot
node tests/bot.test.mjs                       # flows against fakes
node bot/broadcast.mjs --status               # news subscribers and the last post (see docs/news.md)
doctl serverless activations logs --function driver_bot --follow   # live logs
```

`bot/.env` is the single source of the secrets. Values typed in the DO console are overwritten on every deploy.

## TODO

- Proof readers are configured by `DARKBLOOM_API_KEY` and `DEEPSEEK_API_KEY` in `bot/.env` (`none` = unset); the models
  can be overridden with `DARKBLOOM_MODEL` / `DEEPSEEK_MODEL`.
- The balloon and the billboards themselves in the world, with "тут може бути ваша реклама" and a bot link.
