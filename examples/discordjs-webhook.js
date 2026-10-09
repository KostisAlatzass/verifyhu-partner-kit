'use strict';

// A discord.js v14 bot with an /earn command. verify.hu calls your web address when a player finishes.
// Use this if your bot has a public https address. If it does not, see discordjs-polling.js.
//
//   VERIFYHU_KEY=...  DISCORD_TOKEN=...  node examples/discordjs-webhook.js

const http = require('node:http');
const { Client, GatewayIntentBits, MessageFlags, ButtonStyle, ComponentType } = require('discord.js');
const { VerifyHu, VerifyHuError } = require('../verifyhu');

const verifyhu = new VerifyHu({ key: process.env.VERIFYHU_KEY });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Replace these two with your own storage and your own reward.
const paidRounds = new Set();
async function giveReward(userId, round) {
  const coins = round.quality === 'low' ? 10 : 50 + round.streak * 5;
  console.log(`reward ${coins} coins to ${userId} for round ${round.round}`);
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'earn') return;

  // The link is personal, so the reply is only visible to the player who asked.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let round;
  try {
    round = await verifyhu.startRound(interaction.user.id);
  } catch (error) {
    console.error('verify.hu startRound failed:', error.message);
    return interaction.editReply('Earning is unavailable right now. Please try again in a minute.');
  }

  if (!round.ok) {
    const message = round.reason === 'cap' ? 'You are done for today. Come back tomorrow!' : 'There is nothing to answer right now.';
    return interaction.editReply(message);
  }

  await interaction.editReply({
    content: `Answer ${round.questions} quick questions to earn your reward.`,
    components: [{
      type: ComponentType.ActionRow,
      components: [{ type: ComponentType.Button, style: ButtonStyle.Link, label: 'Start', url: round.activity_url ?? round.url }],
    }],
  });
});

// verify.hu sends a POST here when a player finishes. Answer 2xx quickly; it retries if you do not.
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/verifyhu') return res.writeHead(404).end();

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    let round;
    try {
      round = verifyhu.verifyWebhook(Buffer.concat(chunks), req.headers['x-verifyhu-timestamp'], req.headers['x-verifyhu-signature']);
    } catch (error) {
      return res.writeHead(error instanceof VerifyHuError ? error.status : 400).end();
    }

    // The same round can arrive more than once (a retry after a slow answer): pay it only once.
    if (round.event === 'earn.finished' && round.answers > 0 && !paidRounds.has(round.round)) {
      paidRounds.add(round.round);
      await giveReward(round.user_id, round);
    }
    res.writeHead(204).end();
  });
});

server.listen(process.env.PORT ?? 3000);
client.login(process.env.DISCORD_TOKEN);
