"""A discord.py bot with an /earn command. verify.hu calls your web address when a player finishes.

    VERIFYHU_KEY=...  DISCORD_TOKEN=...  python examples/discordpy_webhook.py

Needs discord.py 2.x (which brings aiohttp).
"""

import hashlib
import hmac
import json
import os
import time

import aiohttp
import discord
from aiohttp import web
from discord import app_commands

BASE_URL = "https://verify.hu"
KEY = os.environ["VERIFYHU_KEY"]
MAX_WEBHOOK_AGE_SECONDS = 300

client = discord.Client(intents=discord.Intents.default())
tree = app_commands.CommandTree(client)

# Replace these two with your own storage and your own reward.
paid_rounds: set[str] = set()


async def give_reward(user_id: str, finished: dict) -> None:
    coins = 10 if finished["quality"] == "low" else 50 + finished["streak"] * 5
    print(f"reward {coins} coins to {user_id} for round {finished['round']}")


async def start_round(user_id: int) -> dict:
    """Ask verify.hu for a one-time link. Only the player's Discord user ID is sent."""
    timeout = aiohttp.ClientTimeout(total=8)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{BASE_URL}/api/partner/start",
            headers={"Authorization": f"Bearer {KEY}"},
            json={"user_id": str(user_id)},
        ) as response:
            response.raise_for_status()
            return await response.json()


def verify_webhook(raw_body: bytes, timestamp: str, signature: str) -> dict:
    """Return the message if it really came from verify.hu, otherwise raise ValueError."""
    try:
        age = abs(time.time() - int(timestamp))
    except (TypeError, ValueError):
        raise ValueError("webhook timestamp is missing") from None
    if age > MAX_WEBHOOK_AGE_SECONDS:
        raise ValueError("webhook timestamp is too old")

    expected = hmac.new(KEY.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature or ""):
        raise ValueError("webhook signature does not match")
    return json.loads(raw_body)


@tree.command(name="earn", description="Answer a few quick questions for a reward")
async def earn(interaction: discord.Interaction) -> None:
    # The link is personal, so the reply is only visible to the player who asked.
    await interaction.response.defer(ephemeral=True)

    try:
        round_ = await start_round(interaction.user.id)
    except aiohttp.ClientError as error:
        print(f"verify.hu start_round failed: {error}")
        await interaction.followup.send("Earning is unavailable right now. Please try again in a minute.")
        return

    if not round_["ok"]:
        done_today = round_["reason"] == "cap"
        await interaction.followup.send(
            "You are done for today. Come back tomorrow!" if done_today else "There is nothing to answer right now."
        )
        return

    view = discord.ui.View()
    view.add_item(discord.ui.Button(label="Start", url=round_["activity_url"] or round_["url"]))
    await interaction.followup.send(f"Answer {round_['questions']} quick questions to earn your reward.", view=view)


async def on_webhook(request: web.Request) -> web.Response:
    """verify.hu sends a POST here when a player finishes. Answer 2xx quickly; it retries if you do not."""
    try:
        finished = verify_webhook(
            await request.read(),
            request.headers.get("X-VerifyHu-Timestamp", ""),
            request.headers.get("X-VerifyHu-Signature", ""),
        )
    except ValueError:
        return web.Response(status=401)

    # The same round can arrive more than once (a retry after a slow answer): pay it only once.
    if finished.get("event") == "earn.finished" and finished["answers"] > 0 and finished["round"] not in paid_rounds:
        paid_rounds.add(finished["round"])
        await give_reward(finished["user_id"], finished)
    return web.Response(status=204)


@client.event
async def setup_hook() -> None:
    await tree.sync()
    app = web.Application()
    app.router.add_post("/verifyhu", on_webhook)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, port=int(os.environ.get("PORT", "3000"))).start()


if __name__ == "__main__":
    client.run(os.environ["DISCORD_TOKEN"])
