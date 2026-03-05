import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { Repo } from "../db/repo.js";
import { IDS } from "../ui/ids.js";
import { eventEmbed } from "../ui/embeds.js";

function parseDateTime(date: string, time: string) {
  // date: YYYY-MM-DD
  // time: HH:MM

  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);

  const dt = new Date(y, m - 1, d, hh, mm, 0);

  return dt.getTime();
}

export const eventCommand = new SlashCommandBuilder()
  .setName("event")
  .setDescription("Event létrehozása RSVP-vel")
  .addSubcommand(sc =>
    sc
      .setName("create")
      .setDescription("Event kiírás")
      .addStringOption(o =>
        o
          .setName("type")
          .setDescription("Típus")
          .setRequired(true)
          .addChoices(
            { name: "Boonstone", value: "Boonstone" },
            { name: "Riftstone", value: "Riftstone" },
            { name: "Guild Boss", value: "Guild Boss" },
            { name: "Siege", value: "Siege" },
            { name: "Archboss", value: "Archboss" },
            { name: "Other", value: "Other" },
          )
      )
      .addStringOption(o =>
        o.setName("title").setDescription("Cím").setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName("date")
          .setDescription("Dátum (YYYY-MM-DD)")
          .setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName("time")
          .setDescription("Idő (HH:MM)")
          .setRequired(true)
      )
      .addIntegerOption(o =>
        o
          .setName("duration_mins")
          .setDescription("Időtartam percben")
          .setRequired(false)
      )
      .addStringOption(o =>
        o
          .setName("notes")
          .setDescription("Megjegyzés")
          .setRequired(false)
      )
  );

export async function handleEventCreate(interaction: any, repo: Repo) {

  // fontos: így nem timeoutol a Discord 3 mp után
  await interaction.deferReply();

  const type = interaction.options.getString("type", true);
  const title = interaction.options.getString("title", true);
  const date = interaction.options.getString("date", true); // pl: 2026-03-05
  const time = interaction.options.getString("time", true); // pl: 20:30

  const duration = interaction.options.getInteger("duration_mins", false) ?? 60;
  const notes = interaction.options.getString("notes", false);

  // dátum + idő -> unix
  const startDate = new Date(`${date}T${time}:00`);
  const startAt = startDate.getTime();

  if (isNaN(startAt)) {
    await interaction.editReply({
      content: "❌ Hibás dátum vagy idő formátum. Használat: YYYY-MM-DD és HH:MM"
    });
    return;
  }

  const eventId = repo.newId("event");

  const embed = eventEmbed({
    type,
    title,
    startAt,
    durationMins: duration,
    notes,
    locked: false,
    rsvps: []
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.eventRsvp(eventId, "tank"))
      .setLabel("🛡 Tank")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(IDS.eventRsvp(eventId, "healer"))
      .setLabel("💚 Healer")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(IDS.eventRsvp(eventId, "dps"))
      .setLabel("⚔ DPS")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(IDS.eventRsvp(eventId, "cant"))
      .setLabel("❌ Can't")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(IDS.eventLock(eventId))
      .setLabel("🔒 Lock")
      .setStyle(ButtonStyle.Secondary)
  );

  // reply frissítés
  await interaction.editReply({
    embeds: [embed],
    components: [row]
  });

  // message lekérése
  const msg = await interaction.fetchReply();

  repo.createEvent({
    eventId,
    messageId: msg.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    type,
    title,
    startAt,
    durationMins: duration,
    notes,
    createdBy: interaction.user.id,
    now: Date.now()
  });
}