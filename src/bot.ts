import "dotenv/config";
console.log("BOOT: bot.ts started");
import fs from "node:fs";
import path from "node:path";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  InteractionType,
} from "discord.js";

import { openDb } from "./db/db.js";
import { Repo } from "./db/repo.js";
import { rollResultsEmbed, eventEmbed, pollResultsText } from "./ui/embeds.js";
import { startSweeper } from "./workers/sweeper.js";
import { fileURLToPath } from "node:url";

import { eventCommand, handleEventCreate } from "./commands/event.js";
import { bossvoteCommand, handleBossvoteStart } from "./commands/bossvote.js";
import { itemCommand, handleItem, handleItemPaging, handleItemPick } from "./commands/item.js";
import http from "node:http";

const port = Number(process.env.PORT || 8000);
http.createServer((_req, res) => {
  res.writeHead(200);
  res.end("bot running");
}).listen(port, "0.0.0.0", () => console.log("HTTP server running on", port));

process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
process.on("uncaughtException", (e) => console.error("uncaughtException", e));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cfg = {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  questlogBase: process.env.QUESTLOG_BASE ?? "https://questlog.gg/throne-and-liberty/api/trpc",
  language: process.env.QUESTLOG_LANGUAGE ?? "en",
  itemSearchRoute: process.env.QUESTLOG_ITEM_SEARCH_ROUTE ?? "database.getItems",
  sqlitePath: process.env.SQLITE_PATH ?? "./data.sqlite",
};

console.log("DEBUG ENV TOKEN:", process.env.DISCORD_TOKEN ? "OK" : "MISSING");
console.log("DEBUG ENV CLIENT_ID:", process.env.DISCORD_CLIENT_ID ? "OK" : "MISSING");

if (!cfg.token || !cfg.clientId) {
  throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID");
}

const db = openDb(cfg.sqlitePath);
const repo = new Repo(db);

repo.init(
  fs.readFileSync(
    path.join(__dirname, "db", "schema.sql"),
    "utf8"
  )
);

const commands = [eventCommand, bossvoteCommand, itemCommand].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(cfg.token);
  await rest.put(Routes.applicationCommands(cfg.clientId), { body: commands });
  console.log("✅ Slash commands registered");
}

function d100() {
  return Math.floor(Math.random() * 100) + 1;
}

function disableMessageComponents(message: any) {
  const rows = (message.components ?? []).map((row: any) => {
    const json = typeof row.toJSON === "function" ? row.toJSON() : row;

    if (json?.components?.length) {
      json.components = json.components.map((c: any) => ({
        ...c,
        disabled: true,
      }));
    }

    return json;
  });

  return rows;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  startSweeper(client, repo);
});

client.on("interactionCreate", async (interaction: any) => {
  try {

    if (interaction.type === InteractionType.ApplicationCommand) {

      const name = interaction.commandName;
      const sub = interaction.options.getSubcommand(false);

      if (name === "event" && sub === "create") {
        return await handleEventCreate(interaction, repo);
      }

      if (name === "bossvote" && sub === "start") {
        return await handleBossvoteStart(interaction, repo);
      }

      if (name === "item") {
        return await handleItem(interaction, repo, cfg);
      }

      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
      return;
    }

    const parts = interaction.customId.split(":");
    const scope = parts[0];

    if (scope === "item") {

      const action = parts[1];

      if (action === "prev" || action === "next") {
        return await handleItemPaging(interaction, repo, cfg);
      }

      if (action === "pick") {
        return await handleItemPick(interaction, repo, cfg);
      }
    }

    if (scope === "roll" && interaction.isButton()) {

      const action = parts[1];
      const messageId = parts[2];

      const session = repo.getRollSession(messageId);

      if (!session) {
        return interaction.reply({
          content: "Nincs ilyen roll session.",
          ephemeral: true,
        });
      }

      if (session.is_closed) {
        return interaction.reply({
          content: "Ez a roll session le van zárva.",
          ephemeral: true,
        });
      }

      if (action === "do") {

        const existing = repo.getRollEntry(messageId, interaction.user.id);

        if (existing) {
          return interaction.reply({
            content: `Te már rolloltál: **${existing.roll_value}**`,
            ephemeral: true,
          });
        }

        const value = d100();

        repo.insertRollEntry({
          messageId,
          userId: interaction.user.id,
          userName: interaction.user.username,
          value,
          now: Date.now(),
        });

        return interaction.reply({
          content: `Rollod: **${value}** 🎲`,
          ephemeral: true,
        });
      }

      if (action === "results") {

        const entries = repo.getRollEntries(messageId);

        const embed = rollResultsEmbed(session.item_name, entries as any);

        return interaction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      if (action === "close") {

        if (interaction.user.id !== session.created_by) {
          return interaction.reply({
            content: "Ezt csak a session indítója zárhatja le.",
            ephemeral: true,
          });
        }

        repo.closeRollSession(messageId);

        try {
          const msg = await interaction.channel.messages.fetch(messageId);
          await msg.edit({ components: disableMessageComponents(msg) });
        } catch {}

        return interaction.reply({
          content: "⛔ Roll session lezárva.",
          ephemeral: true,
        });
      }
    }

    if (scope === "poll") {

      const action = parts[1];
      const pollId = parts[2];

      const poll = repo.getPoll(pollId);

      if (!poll) {
        return interaction.reply({
          content: "Nincs ilyen szavazás.",
          ephemeral: true,
        });
      }

      if (poll.is_closed) {
        return interaction.reply({
          content: "A szavazás le van zárva.",
          ephemeral: true,
        });
      }

      if (interaction.isStringSelectMenu() && action === "select") {

        const values: string[] = interaction.values ?? [];

        repo.clearUserVotes(pollId, interaction.user.id);

        const now = Date.now();

        for (const v of values) {
          repo.addUserVote({
            pollId,
            userId: interaction.user.id,
            userName: interaction.user.username,
            optionId: v,
            now,
          });
        }

        return interaction.reply({
          content: values.length
            ? `Szavazat mentve: ${values.join(", ")}`
            : "Szavazat törölve.",
          ephemeral: true,
        });
      }

      if (interaction.isButton() && action === "results") {

        const rows = repo.getPollResults(pollId);

        const sorted = [...rows].sort((a, b) => b.count - a.count);

        const lines = sorted.map(r => `**${r.label}** — ${r.count}`);

        return interaction.reply({
          content: lines.join("\n") || "Nincs szavazat.",
          ephemeral: true,
        });
      }

      if (interaction.isButton() && action === "close") {

        if (interaction.user.id !== poll.created_by) {
          return interaction.reply({
            content: "Ezt csak a szavazás indítója zárhatja le.",
            ephemeral: true,
          });
        }

        const results = repo.getPollResults(pollId);

        repo.closePoll(pollId);

        try {
          const msg = await interaction.channel.messages.fetch(poll.message_id);
          await msg.edit({ components: disableMessageComponents(msg) });
        } catch {}

        return interaction.reply({
          content: pollResultsText(poll.title, results),
        });
      }
    }

    // ---- Events RSVP
    if (scope === "event" && interaction.isButton()) {
      const action = parts[1] as "tank" | "healer" | "dps" | "cant" | "lock";
      const eventId = parts[2];

      const ev = repo.getEvent(eventId);
      if (!ev) {
        return interaction.reply({ content: "Nincs ilyen event.", ephemeral: true });
      }

      // Permission / state checks that require an immediate reply
      if (action === "lock") {
        if (interaction.user.id !== ev.created_by) {
          return interaction.reply({ content: "Csak az event indítója tudja lockolni.", ephemeral: true });
        }
      } else {
        if (ev.is_locked) {
          return interaction.reply({ content: "Az event le van zárva.", ephemeral: true });
        }
      }

      // Ack fast to avoid "Interaction failed"
      await interaction.deferUpdate();

      if (action === "lock") {
        repo.setEventLocked(eventId, !ev.is_locked);
      } else {
        repo.upsertRsvp({
          eventId,
          userId: interaction.user.id,
          userName: interaction.user.username,
          status: action,
          now: Date.now(),
        });
      }

      const rsvps = repo.getEventRsvps(eventId);
      const newEv = repo.getEvent(eventId);
      const embed = eventEmbed({
        type: newEv.type,
        title: newEv.title,
        startAt: newEv.start_at,
        durationMins: newEv.duration_mins,
        notes: newEv.notes,
        locked: !!newEv.is_locked,
        rsvps,
      });

      try {
        const msg = await interaction.channel.messages.fetch(newEv.message_id);
        await msg.edit({ embeds: [embed] });
      } catch (err) {
        console.error("Failed to refresh event message", err);
      }

      return;
    }

  } catch (e) {
    console.error(e);

    if (interaction.isRepliable()) {
      try {
        await interaction.reply({
          content: "Hiba történt (logolva).",
          ephemeral: true,
        });
      } catch {}
    }
  }
});

async function main() {

  await registerCommands();

  await client.login(cfg.token);

}

main().catch((err) => {
  console.error("❌ Fatal error", err);
  process.exit(1);
});