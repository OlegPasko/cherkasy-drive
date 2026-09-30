# Daily news to the bot's subscribers

Players subscribe to the game news in `@driver_game_bot`: on `/start`, from the menu, with `/news`, or with the
"🔔 Новини" chip in the game (`?start=sub`). Each day at 21:00 Kyiv time, a scheduled Claude task on Oleg's Mac
(`cherkasy-daily-news`, cron `0 20 * * *` in local CET/CEST, which is 21:00 in Kyiv) reads what reached `main` since the
last post. It writes a short post for players and sends it with `bot/broadcast.mjs`. On a day with nothing new for
players, nothing is sent.

- The task works in its own detached worktree, `../cherkasy-drive-news`, at `origin/main`. It never touches the main
  checkout or other sessions' work. The secrets come from the main checkout's `bot/.env` through `BOT_ENV`.
- `node bot/broadcast.mjs --status` shows the subscriber count and the last post: its Kyiv day, the `origin/main` sha it
  covered, and the sent and dropped counts.
- `--to <chat>` sends a preview to one chat, `--dry` prints the post without sending, and `--force` posts a second time
  on the same day.
- Spaces keeps every post as `driver-bot/news/<day>.html`.

## The task prompt

```
Daily news post for Cherkasy Drive's Telegram subscribers. Kyiv time, unattended: do not ask questions.

MAIN=/Users/olegpasko/sites/ai-playground/cherkasy-drive
NEWS=/Users/olegpasko/sites/ai-playground/cherkasy-drive-news
export BOT_ENV=$MAIN/bot/.env

1. Worktree. If $NEWS does not exist: git -C $MAIN fetch origin && git -C $MAIN worktree add --detach $NEWS origin/main.
   Otherwise: git -C $NEWS fetch origin && git -C $NEWS checkout --detach --force origin/main. Work only in $NEWS; never
   edit, commit or push anything.
2. cd $NEWS && node bot/broadcast.mjs --status. If last.day is today (Kyiv), stop: already posted.
3. The range. If last.sha exists and `git merge-base --is-ancestor <last.sha> origin/main` succeeds, use
   `git log --no-merges --format='%h %ad %s%n%b' --date=iso <last.sha>..origin/main`. Otherwise use
   `--since="24 hours ago"` on origin/main. Read `git show --stat <sha>` for any commit that is unclear.
4. Keep only what a player can see or feel in the game: new or rebuilt buildings and landmarks, new missions,
   features, controls, sounds, map changes, performance and visible bug fixes, new ways to take part (bot flows, ads).
   Drop docs, tests, tooling, refactors, analytics, deploy, bot internals and anything a player would not notice.
   If nothing is left, stop: do not post, and say "no news today" in the report.
5. Write the post in Ukrainian as Telegram HTML (only <b>, <i>, <a href>; escape & < > in text). Use en-dashes (–),
   never em-dashes. The shape:
     🗞 <b>Що нового в Cherkasy Drive</b>
     (blank line)
     2–7 lines, each an emoji and one short, lively sentence about one change, in terms of what the player sees
     ("На Замковій горі тепер …"). Merge related commits into one line. A request built for a player may be named
     "за заявкою гравця", never with a name, username or issue number.
     (blank line)
     🔄 Щоб побачити – оновіть сторінку гри без кешу: Cmd + Shift + R (Mac) або Ctrl + F5 (Windows).
   Keep it under 1200 characters. No internal words (commit, PR, refactor, module names), and no promises about the future.
6. Save it to a temp file (mktemp) and send:
   node bot/broadcast.mjs --file <that file> --sha $(git rev-parse origin/main)
7. Report in one or two lines, in Ukrainian: how many subscribers got it (or why nothing went out), and the post text.
```
