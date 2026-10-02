# Daily news to the bot's subscribers

Players subscribe to the game news in `@driver_game_bot`: on `/start`, from the menu, with `/news`, or with the
"🔔 Оновлення" chip in the game (`?start=sub`). Each day at 21:00 Kyiv time, the bot's own DigitalOcean function writes a
short post about what reached `main` and sends it to every subscriber. On a day with nothing new for players, nothing is
sent. It runs in the cloud, so no Mac has to be awake.

## How it runs

- The `daily-news` scheduled trigger in `bot/project.yml` calls the `driver_bot` function with `{ job: 'news' }` at 18:00
  and 19:00 UTC. The cron is in UTC, and Kyiv is UTC+3 in summer and UTC+2 in winter. So one of the two runs lands on
  21:00 Kyiv and does the work, and the other returns at once. A failed summer run is retried by the 22:00 one.
- `news.js` asks GitHub for `main`'s new commits since `news/cursor.json` (the last day checked and the commit it
  covered). No new commits means no model call and no post. Otherwise the commit messages go to the writer, `gpt-6-luna`
  on OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL` overrides). If that fails, Gemma on Darkbloom writes instead. The writer
  keeps only what a player can see, or answers `NONE`, and then nothing is sent.
- A post must start with 🗞 and use only `<b>`, `<i>` and `<a href>`. Em-dashes become en-dashes, and `'` inside a word
  becomes `’`. A post that breaks these goes to the next writer.
- It sends to every `subs/<chat>.json` with "🚗 Грати" and "🔕 Відписатись". Chats that blocked the bot are
  unsubscribed. Spaces keeps every post as `driver-bot/news/<day>.html` and the run as `news/last.json`. Oleg gets a
  one-line report, or the reason when no writer managed.
- A web request can never start it: web calls always carry `__ow_headers` and get 403.
- The prompt, the checks and the rules for the text are in `bot/packages/default/driver_bot/news.js`.

## By hand

    node bot/broadcast.mjs --status                 # subscribers, the cursor and the last post
    node bot/broadcast.mjs --run --dry              # what tonight's run would post; nothing sent or stored
    node bot/broadcast.mjs --run --dry --base <sha> # the same from an older commit, to try the writer
    node bot/broadcast.mjs --run                    # post now, at any hour (still once per Kyiv day)
    node bot/broadcast.mjs --file post.html [--to <chat>] [--force]   # a hand-written post, or a preview to one chat
    doctl serverless triggers list                  # the trigger and its last run
    doctl serverless activations logs --function driver_bot   # "[news] …" lines

Before this function took over, a scheduled Claude task on Oleg's Mac (`cherkasy-daily-news`) wrote the post. That task
is now disabled.
