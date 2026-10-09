'use strict';

// /earn without a webhook: polls for finished rounds once a minute.

const fs = require('node:fs');
const { Client, GatewayIntentBits, MessageFlags, ButtonStyle, ComponentType } = require('discord.js');
const { VerifyHu } = require('../verifyhu');

const POLL_EVERY_MS = 60_000;
const CURSOR_FILE = './verifyhu-cursor.txt';

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

// The cursor is kept in a file, so rounds that finish while the bot restarts are not lost.
function readCursor() {
  try { return fs.readFileSync(CURSOR_FILE, 'utf8').trim() || new Date().toISOString(); }
  catch { return new Date().toISOString(); }
}

async function poll() {
  try {
    const { rounds, next } = await verifyhu.fetchFinished(readCursor());
    for (const round of rounds) {
      if (round.answers === 0 || paidRounds.has(round.round)) continue;
      paidRounds.add(round.round);
      await giveReward(round.user_id, round);
    }
    fs.writeFileSync(CURSOR_FILE, next);
  } catch (error) {
    console.error('verify.hu poll failed:', error.message);
  }
}

client.once('ready', () => setInterval(poll, POLL_EVERY_MS));
client.login(process.env.DISCORD_TOKEN);
