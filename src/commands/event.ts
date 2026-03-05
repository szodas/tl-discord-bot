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
          ),
      )
      .addStringOption(o => o.setName("title").setDescription("Cím").setRequired(true))
      .addStringOption(o =>
        o.setName("date").setDescription("Dátum (YYYY-MM-DD)").setRequired(true),
      )
      .addStringOption(o =>
        o.setName("time").setDescription("Idő (HH:MM)").setRequired(true),
      )
      .addIntegerOption(o =>
        o.setName("duration_mins").setDescription("Időtartam percben").setRequired(false),
      )
      .addStringOption(o =>
        o.setName("notes").setDescription("Megjegyzés").setRequired(false),
      ),
  );

export async function handleEventCreate(interaction: any, repo: Repo) {
  // --- SAFETY: ha a Koyeb épp restartol / interaction lejárt, ne döljön el a bot
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
  } catch (e: any) {
    // 10062: Unknown interaction (lejárt / már nincs callback)
    if (e?.code === 10062) return;
    throw e;
  }

  const type = interaction.options.getString("type", true);
  const title = interaction.options.getString("title", true);
  const date = interaction.options.getString("date", true); // pl: 2026-03-05
  const time = interaction.options.getString("time", true); // pl: 20:30

  const duration = interaction.options.getInteger("duration_mins", false) ?? 60;
  const notes = interaction.options.getString("notes", false);

  const startAt = parseDateTime(date, time);

  if (isNaN(startAt)) {
    try {
      await interaction.editReply({
        content: "❌ Hibás dátum vagy idő formátum. Használat: YYYY-MM-DD és HH:MM",
      });
    } catch (e: any) {
      if (e?.code === 10062) return;
      throw e;
    }
    return;
  }

  // maradjon kompatibilis a meglévő DB/Repo logikával
  const eventId = repo.newId("evt");

  const embed = eventEmbed({
    type,
    title,
    startAt,
    durationMins: duration,
    notes: notes ?? null,
    locked: false,
    rsvps: [],
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.eventTank(eventId))
      .setLabel("🛡️ Tank")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(IDS.eventHealer(eventId))
      .setLabel("💚 Healer")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(IDS.eventDps(eventId))
      .setLabel("⚔️ DPS")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(IDS.eventCant(eventId))
      .setLabel("❌ Nem jövök")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(IDS.eventLock(eventId))
      .setLabel("🔒 Lock")
      .setStyle(ButtonStyle.Secondary),
  );

  // reply frissítés
  try {
    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (e: any) {
    if (e?.code === 10062) return;
    throw e;
  }

  // message lekérése (ID mentéshez)
  let msg: any;
  try {
    msg = await interaction.fetchReply();
  } catch (e: any) {
    if (e?.code === 10062) return;
    throw e;
  }

  repo.createEvent({
    eventId,
    messageId: msg.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    type,
    title,
    startAt,
    durationMins: duration,
    notes: notes ?? null,
    createdBy: interaction.user.id,
    now: Date.now(),
  });
}