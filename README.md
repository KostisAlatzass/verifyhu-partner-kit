# verify.hu partner kit

Let your Discord bot's players earn a reward by answering a few one-tap questions.
Your bot asks verify.hu for a link, the player answers in a small window, and verify.hu tells your bot when they are done. You decide the reward.

This repository is everything that runs inside your bot. It is about 100 lines and has no dependencies.

## What your bot sends, and what it does not

| Sent to verify.hu | Never sent |
|---|---|
| The player's Discord user ID, when they run your command | Usernames, messages, server names, member lists, your bot token |

The user ID is needed so verify.hu can tell your bot who to reward. It is stored with the round, not with the answers.

## How it works

1. A player runs your command (for example `/earn`).
2. Your bot calls `startRound(userId)` and gets a one-time link.
3. Your bot replies with a button to that link. Only that player can see it.
4. The player answers. Skipped and rushed answers do not count.
5. verify.hu tells your bot the round is finished, and your bot gives the reward.

Step 5 works in one of two ways. Pick one:

- **Webhook**: verify.hu sends a signed POST to a web address you give us. Rewards arrive at once.
- **Polling**: your bot asks once a minute who finished. No public address needed.

## Requirements

- Node 18 or newer (the client uses the built-in `fetch`), or Python 3.10+ for the discord.py example.
- A partner key from verify.hu.

There is nothing to install: copy `verifyhu.js` into your bot, or clone this repository next to it.

## Quick start

```js
const { VerifyHu } = require('./verifyhu');
const verifyhu = new VerifyHu({ key: process.env.VERIFYHU_KEY });

const round = await verifyhu.startRound(interaction.user.id);
if (round.ok) {
  // show a link button to round.activity_url ?? round.url
}
```

To run an example, copy `.env.example` to `.env`, fill it in, and start it (Node 20.6 or newer reads the file for you):

```bash
node --env-file=.env examples/discordjs-webhook.js
```

Complete bots to copy from:

| File | For |
|---|---|
| [`examples/discordjs-webhook.js`](examples/discordjs-webhook.js) | discord.js v14, with a webhook |
| [`examples/discordjs-polling.js`](examples/discordjs-polling.js) | discord.js v14, without a public address |
| [`examples/discordpy_webhook.py`](examples/discordpy_webhook.py) | discord.py 2.x, with a webhook |

## Your key

You get one key from verify.hu. Anyone who has it can start rounds as your bot.

- Keep it in an environment variable (`VERIFYHU_KEY`). Never put it in a file you commit.
- If it leaks, ask for a new one. The old key stops working at once.

## Reference

### `startRound(userId)`

Returns one of:

```js
{ ok: true, url, activity_url, expires_in, questions, streak, rounds_left }
{ ok: false, reason: 'cap' | 'off' | 'no_questions', resets_at }
```

| Field | Meaning |
|---|---|
| `url` | Opens the window in the browser. Always present. |
| `activity_url` | Opens the window inside Discord. `null` until your application ID is set on our side. |
| `expires_in` | Seconds until the link stops working. |
| `questions` | Questions in this round. |
| `streak` | Days in a row this player has finished a round. |
| `rounds_left` | Rounds the player may still play today. |
| `reason: 'cap'` | The player is done for today. `resets_at` says when the next day starts (UTC). |
| `reason: 'off'` | Earning is switched off for your bot. |
| `reason: 'no_questions'` | There is nothing to ask right now. |

Calling it again for the same player before they open the link returns the same link.

### The finished round

Sent to your webhook, and returned by `fetchFinished`:

```json
{
  "event": "earn.finished",
  "partner": "your-bot",
  "round": "cm2f…",
  "user_id": "123456789012345678",
  "answers": 4,
  "questions": 5,
  "quality": "ok",
  "streak": 3,
  "day": "2026-10-09",
  "finished_at": "2026-10-09T18:22:41.000Z"
}
```

- `round` is unique. Remember the rounds you have paid, and never pay one twice.
- `answers` can be `0` (everything skipped or rushed). Give no reward then.
- `quality` is `"low"` when the answers look careless. Give less if you like, and do not show the word to the player.

### `verifyWebhook(rawBody, timestamp, signature)`

Pass the body exactly as it arrived and the `X-VerifyHu-Timestamp` and `X-VerifyHu-Signature` headers. It returns the message, or throws if the signature is wrong or the message is more than five minutes old.

The signature is HMAC-SHA256 of `<timestamp>.<body>` with your key, in hex, if you want to check it in another language.

Answer with any 2xx status within five seconds. If you do not, the message is sent again later, up to eight times, with a longer pause each time.

### Testing your webhook

Once your address is saved on verify.hu, we can send it a test message at any time. It is signed like a real one and looks like this:

```json
{ "event": "earn.test", "partner": "your-bot" }
```

`verifyWebhook` accepts it, so your handler runs end to end. Answer 2xx and give no reward: only `earn.finished` is a finished round.

To try the signature check without us, run the tests in this repository:

```bash
npm test
```

### `fetchFinished(since)`

Returns `{ rounds, next }`: up to 100 finished rounds after `since`, oldest first. Save `next` and pass it as `since` on the next call.

## Errors

Network problems and refused requests throw `VerifyHuError` with a `status`:

| Status | Meaning |
|---|---|
| `0` | verify.hu could not be reached. Tell the player to try again in a minute. |
| `400` | The user ID was not a Discord user ID. |
| `401` | The key is wrong. |
| `429` | Too many requests with a wrong key. Wait ten minutes. |

## Licence

MIT. See [LICENSE](LICENSE).
