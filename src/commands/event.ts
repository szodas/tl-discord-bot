import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { Repo } from "../db/repo.js";
import { IDS } from "../ui/ids.js";
import { eventEmbed } from "../ui/embeds.js";

export const eventCommand = new SlashCommandBuilder()
  .setName("event")
  .setDescription("Event létrehozása RSVP-vel")
  .addSubcommand(sc =>
    sc.setName("create")
      .setDescription("Event kiírás")
      .addStringOption(o => o.setName("type").setDescription("Típus").setRequired(true)
        .addChoices(
          { name: "Boonstone", value: "Boonstone" },
          { name: "Riftstone", value: "Riftstone" },
          { name: "Guild Boss", value: "Guild Boss" },
          { name: "Siege", value: "Siege" },
          { name: "Archboss", value: "Archboss" },
          { name: "Other", value: "Other" },
        ))
      .addStringOption(o => o.setName("title").setDescription("Cím").setRequired(true))
      .addIntegerOption(o => o.setName("start_unix").setDescription("Kezdés UNIX (másodperc)").setRequired(true))
      .addIntegerOption(o => o.setName("duration_mins").setDescription("Időtartam percben").setRequired(false))
      .addStringOption(o => o.setName("notes").setDescription("Megjegyzés").setRequired(false))
  );

export async function handleEventCreate(interaction: any, repo: Repo) {
  const type = interaction.options.getString("type", true);
  const title = interaction.options.getString("title", true);
  const startUnix = interaction.options.getInteger("start_unix", true);
  const durationMins = interaction.options.getInteger("duration_mins", false);
  const notes = interaction.options.getString("notes", false);

  const startAt = startUnix * 1000;
  const now = Date.now();
  const eventId = repo.newId("evt");

  const embed = eventEmbed({ type, title, startAt, durationMins: durationMins ?? null, notes: notes ?? null, locked: false, rsvps: [] });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IDS.eventTank(eventId)).setLabel("🛡️ Tank").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(IDS.eventHealer(eventId)).setLabel("💚 Healer").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(IDS.eventDps(eventId)).setLabel("⚔️ DPS").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.eventCant(eventId)).setLabel("❌ Nem jövök").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(IDS.eventLock(eventId)).setLabel("🔒 Lock").setStyle(ButtonStyle.Secondary),
  );

  const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  repo.createEvent({
    eventId,
    messageId: msg.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    type, title, startAt, durationMins: durationMins ?? null, notes: notes ?? null,
    createdBy: interaction.user.id,
    now,
  });
}
