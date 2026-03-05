import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import type { Repo } from "../db/repo.js";
import { IDS } from "../ui/ids.js";
import { qlGetItems, qlGetItem } from "../questlog/client.js";

type Cfg = { questlogBase: string; language: string; itemSearchRoute: string };

function extractPageData(data: any) {
  return data?.result?.data?.pageData ?? data?.result?.data ?? data?.pageData ?? [];
}
function extractPageCount(data: any) {
  return data?.result?.data?.pageCount ?? data?.pageCount ?? 1;
}

export const itemCommand = new SlashCommandBuilder()
  .setName("item")
  .setDescription("Item keresés Questlogból + roll")
  .addStringOption(o => o.setName("query").setDescription("pl. karnix").setRequired(true));

export async function handleItem(interaction: any, repo: Repo, cfg: Cfg) {
  const q = interaction.options.getString("query", true);

  const nonce = repo.newId("itm");
  const page = 1;

  const data = await qlGetItems({
    base: cfg.questlogBase,
    route: cfg.itemSearchRoute,
    input: { language: cfg.language, query: q, page, facets: {}, mainCategory: "weapons" } // facets/mainCategory optional; Questlog ignores unknown
  });

  const pageData = extractPageData(data) as any[];
  const pageCount = extractPageCount(data);

  if (!pageData.length) {
    await interaction.reply({ content: "Nincs találat.", ephemeral: true });
    return;
  }

  const top = pageData.slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.itemPick(nonce, page))
    .setPlaceholder("Válassz itemet…")
    .addOptions(top.map((it: any) => ({
      label: String(it.name ?? it.id).slice(0, 100),
      value: String(it.id),
      description: `${it.mainCategory ?? ""}/${it.subCategory ?? ""}`.slice(0, 100) || undefined,
    })));

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IDS.itemPrev(nonce, page)).setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(IDS.itemNext(nonce, page)).setLabel("Next ➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= pageCount),
  );

  const embed = new EmbedBuilder()
    .setTitle("Item keresés")
    .setDescription(`Keresés: **${q}**\nOldal: **${page}/${pageCount}**\nTalálatok: **${pageData.length}**`);

  // stash state in-memory is complicated; easiest: encode query + page in message content for later reads
  await interaction.reply({
    embeds: [embed],
    components: [row1, row2],
    ephemeral: true,
  });

  // Store last search in interaction.client memory map
  const client = interaction.client as any;
  client.__itemSearch ??= new Map();
  client.__itemSearch.set(nonce, { q, pageCount, createdBy: interaction.user.id, language: cfg.language });
}

export async function handleItemPaging(interaction: any, repo: Repo, cfg: Cfg) {
  const parts = interaction.customId.split(":");
  // item:prev:nonce:page  OR item:next:nonce:page
  const action = parts[1];
  const nonce = parts[2];
  const currentPage = Number(parts[3]);

  const client = interaction.client as any;
  const state = client.__itemSearch?.get(nonce);
  if (!state) return interaction.reply({ content: "Lejárt keresés (indíts új /item-et).", ephemeral: true });
  if (state.createdBy !== interaction.user.id) return interaction.reply({ content: "Ezt a keresést csak az indító használhatja.", ephemeral: true });

  const nextPage = action === "prev" ? Math.max(1, currentPage - 1) : currentPage + 1;

  const data = await qlGetItems({
    base: cfg.questlogBase,
    route: cfg.itemSearchRoute,
    input: { language: cfg.language, query: state.q, page: nextPage, facets: {} }
  });

  const pageData = extractPageData(data) as any[];
  const pageCount = extractPageCount(data);

  if (!pageData.length) {
    return interaction.reply({ content: "Nincs találat ezen az oldalon.", ephemeral: true });
  }

  const top = pageData.slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.itemPick(nonce, nextPage))
    .setPlaceholder("Válassz itemet…")
    .addOptions(top.map((it: any) => ({
      label: String(it.name ?? it.id).slice(0, 100),
      value: String(it.id),
      description: `${it.mainCategory ?? ""}/${it.subCategory ?? ""}`.slice(0, 100) || undefined,
    })));

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IDS.itemPrev(nonce, nextPage)).setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(nextPage <= 1),
    new ButtonBuilder().setCustomId(IDS.itemNext(nonce, nextPage)).setLabel("Next ➡️").setStyle(ButtonStyle.Secondary).setDisabled(nextPage >= pageCount),
  );

  const embed = new EmbedBuilder()
    .setTitle("Item keresés")
    .setDescription(`Keresés: **${state.q}**\nOldal: **${nextPage}/${pageCount}**\nTalálatok: **${pageData.length}**`);

  client.__itemSearch.set(nonce, { ...state, pageCount });

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

export async function handleItemPick(interaction: any, repo: Repo, cfg: Cfg) {
  const parts = interaction.customId.split(":");
  // item:pick:nonce:page
  const nonce = parts[2];
  const client = interaction.client as any;
  const state = client.__itemSearch?.get(nonce);
  if (!state) return interaction.reply({ content: "Lejárt keresés (indíts új /item-et).", ephemeral: true });
  if (state.createdBy !== interaction.user.id) return interaction.reply({ content: "Ezt a keresést csak az indító használhatja.", ephemeral: true });

  const id = interaction.values?.[0];
  if (!id) return interaction.reply({ content: "Nincs kiválasztás.", ephemeral: true });

  const data = await qlGetItem({ base: cfg.questlogBase, id, language: cfg.language });
  const item = data?.result?.data ?? data?.result ?? data;
  const name = item?.name ?? id;

  // Post to the channel (public) with roll buttons
  const rollMsg = await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(name)
        .setDescription(`ID: \`${id}\`\n\n🎲 Nyomj Roll-t a jelentkezéshez.`)
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`roll:do:PENDING`).setLabel("🎲 Roll (1-100)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`roll:results:PENDING`).setLabel("📊 Results").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`roll:close:PENDING`).setLabel("⛔ Close").setStyle(ButtonStyle.Danger),
      )
    ]
  });

  // Fix customIds with real message id
  await rollMsg.edit({
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`roll:do:${rollMsg.id}`).setLabel("🎲 Roll (1-100)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`roll:results:${rollMsg.id}`).setLabel("📊 Results").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`roll:close:${rollMsg.id}`).setLabel("⛔ Close").setStyle(ButtonStyle.Danger),
      )
    ]
  });

  repo.createRollSession({
    messageId: rollMsg.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    itemId: id,
    itemName: name,
    createdBy: interaction.user.id,
    now: Date.now(),
  });

  await interaction.reply({ content: `Kiraktam: **${name}** (roll üzenet).`, ephemeral: true });
}