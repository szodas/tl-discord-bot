import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import type { Repo } from "../db/repo.js";
import { IDS } from "../ui/ids.js";

export const bossvoteCommand = new SlashCommandBuilder()
  .setName("bossvote")
  .setDescription("Boss szavazás")
  .addSubcommand(sc =>
    sc
      .setName("start")
      .setDescription("Szavazás indítása")
      // ✅ REQUIRED opciók ELŐL
      .addStringOption(o =>
        o.setName("title").setDescription("Szavazás címe").setRequired(true),
      )
      .addStringOption(o =>
        o
          .setName("mode")
          .setDescription("single vagy multi")
          .setRequired(true)
          .addChoices({ name: "single", value: "single" }, { name: "multi", value: "multi" }),
      )
      .addStringOption(o =>
        o
          .setName("options")
          .setDescription("Bossok vesszővel elválasztva (max 25)")
          .setRequired(true),
      )
      // ✅ OPTIONAL opciók UTÁNA
      .addIntegerOption(o =>
        o.setName("maxvotes").setDescription("Multi módban max jelölés").setRequired(false),
      )
      .addIntegerOption(o =>
        o.setName("duration_mins").setDescription("Lejárat percben (opcionális)").setRequired(false),
      ),
  );

export async function handleBossvoteStart(interaction: any, repo: Repo) {
  const title = interaction.options.getString("title", true);
  const mode = interaction.options.getString("mode", true) as "single" | "multi";
  const optionsRaw = interaction.options.getString("options", true);
  const durationMins = interaction.options.getInteger("duration_mins", false);
  const maxVotesIn = interaction.options.getInteger("maxvotes", false);

  const opts = optionsRaw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
    .slice(0, 25);

  if (opts.length < 2) {
    await interaction.reply({
      content: "Adj meg legalább 2 opciót (vesszővel elválasztva).",
      ephemeral: true,
    });
    return;
  }

  const maxVotes =
    mode === "single"
      ? 1
      : Math.min(Math.max(maxVotesIn ?? 3, 1), Math.min(10, opts.length));

  const now = Date.now();
  const endsAt = durationMins ? now + durationMins * 60_000 : null;

  const pollId = repo.newId("poll");

  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.pollSelect(pollId))
    .setPlaceholder(mode === "single" ? "Válassz 1 boss-t" : `Válassz max ${maxVotes} boss-t`)
    .setMinValues(0)
    .setMaxValues(maxVotes)
    .addOptions(opts.map((label: string, idx: number) => ({ label, value: `opt_${idx}` })));

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.pollResults(pollId))
      .setLabel("📊 Results")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.pollClose(pollId))
      .setLabel("⛔ Close")
      .setStyle(ButtonStyle.Danger),
  );

  const content = endsAt
    ? `🗳️ **${title}**\nLejár: <t:${Math.floor(endsAt / 1000)}:R>\n*(Szavazás: a menüben választasz, és kész.)*`
    : `🗳️ **${title}**\nLezárás: manuálisan (Close gomb)\n*(Szavazás: a menüben választasz, és kész.)*`;

  const msg = await interaction.reply({
    content,
    components: [row1, row2],
    fetchReply: true,
  });

  repo.createPoll({
    pollId,
    messageId: msg.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    title,
    mode,
    maxVotes,
    endsAt,
    createdBy: interaction.user.id,
    now,
  });

  opts.forEach((label: string, idx: number) => repo.addPollOption(pollId, `opt_${idx}`, label));
}