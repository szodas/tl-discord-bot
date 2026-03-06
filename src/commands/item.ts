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
import { rollSessionEmbed } from "../ui/embeds.js";

type Cfg = { questlogBase: string; language: string; itemSearchRoute: string };

type MainCategory = "weapons" | "armor" | "accessories";
const SEARCH_CATEGORIES: MainCategory[] = ["weapons", "armor", "accessories"];

function extractPageData(data: any) {
  return data?.result?.data?.pageData ?? data?.result?.data ?? data?.pageData ?? [];
}
function extractPageCount(data: any) {
  return data?.result?.data?.pageCount ?? data?.pageCount ?? 1;
}

function looksLikeItemId(v: string) {
  return /^[a-z0-9_]+$/i.test(v) && v.includes("_") && v.length >= 8;
}

function normalizeName(v: unknown) {
  return String(v ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function scoreItemMatch(item: any, query: string) {
  const q = normalizeName(query);
  const name = normalizeName(item?.name);
  const id = normalizeName(item?.id);

  if (!q) return 0;
  if (name === q) return 1000;
  if (id === q) return 950;
  if (name.startsWith(q)) return 900;
  if (name.includes(q)) return 800;
  if (id.startsWith(q)) return 700;
  if (id.includes(q)) return 600;

  const qWords = q.split(/\s+/).filter(Boolean);
  if (qWords.length && qWords.every((w) => name.includes(w))) return 500;
  if (qWords.length && qWords.every((w) => id.includes(w))) return 400;

  return 0;
}

async function fetchCategoryPage(cfg: Cfg, mainCategory: MainCategory, page: number) {
  const data = await qlGetItems({
    base: cfg.questlogBase,
    route: cfg.itemSearchRoute,
    input: { language: cfg.language, page, facets: {}, mainCategory, subCategory: "" },
  });

  return {
    pageData: extractPageData(data) as any[],
    pageCount: extractPageCount(data),
  };
}

async function searchAcrossCategories(cfg: Cfg, query: string) {
  const allItems: any[] = [];
  const seen = new Set<string>();

  for (const mainCategory of SEARCH_CATEGORIES) {
    const first = await fetchCategoryPage(cfg, mainCategory, 1);
    const pages = Math.max(1, Number(first.pageCount) || 1);

    for (const it of first.pageData) {
      if (it?.id && !seen.has(it.id)) {
        seen.add(it.id);
        allItems.push(it);
      }
    }

    for (let page = 2; page <= pages; page++) {
      const next = await fetchCategoryPage(cfg, mainCategory, page);
      for (const it of next.pageData) {
        if (it?.id && !seen.has(it.id)) {
          seen.add(it.id);
          allItems.push(it);
        }
      }
    }
  }

  return allItems
    .map((it) => ({ it, score: scoreItemMatch(it, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.it?.name ?? a.it?.id).localeCompare(String(b.it?.name ?? b.it?.id));
    })
    .map((x) => x.it);
}

async function postRollMessage(
  interaction: any,
  repo: Repo,
  id: string,
  name: string,
  durationMins?: number | null
) {
  const now = Date.now();
  const endsAt = durationMins && durationMins > 0 ? now + durationMins * 60_000 : null;

  const rollMsg = await interaction.channel.send({
    embeds: [
      rollSessionEmbed({
        itemName: name,
        itemId: id,
        endsAt,
        closed: false,
        entries: [],
      }),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(IDS.rollDo("PENDING")).setLabel("🎲 Roll (1-100)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(IDS.rollResults("PENDING")).setLabel("📊 Results").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(IDS.rollClose("PENDING")).setLabel("⛔ Close").setStyle(ButtonStyle.Danger),
      )
    ]
  });

  await rollMsg.edit({
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(IDS.rollDo(rollMsg.id)).setLabel("🎲 Roll (1-100)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(IDS.rollResults(rollMsg.id)).setLabel("📊 Results").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(IDS.rollClose(rollMsg.id)).setLabel("⛔ Close").setStyle(ButtonStyle.Danger),
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
    now,
    endsAt,
  });

  return rollMsg;
}

export const itemCommand = new SlashCommandBuilder()
  .setName("item")
  .setDescription("Item keresés Questlogból + roll")
  .addStringOption(o =>
    o
      .setName("query")
      .setDescription("Kezdj el gépelni (autocomplete). Pl: karnix")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(o =>
    o
      .setName("duration_mins")
      .setDescription("Roll lejárat percben (opcionális)")
      .setRequired(false)
  );

export async function handleItemAutocomplete(interaction: any, cfg: Cfg) {
  try {
    const focused = String(interaction.options.getFocused?.() ?? "").trim();
    if (!focused) {
      return await interaction.respond([]);
    }

    const results = await searchAcrossCategories(cfg, focused);
    const top = results.slice(0, 25);

    const choices = top.map((it: any) => ({
      name: String(it.name ?? it.id).slice(0, 100),
      value: String(it.id),
    }));

    return await interaction.respond(choices);
  } catch {
    try {
      return await interaction.respond([]);
    } catch {}
  }
}

export async function handleItem(interaction: any, repo: Repo, cfg: Cfg) {
  const q = interaction.options.getString("query", true).trim();
  const durationMins = interaction.options.getInteger("duration_mins", false);

  if (looksLikeItemId(q)) {
    try {
      const data = await qlGetItem({ base: cfg.questlogBase, id: q, language: cfg.language });
      const item = data?.result?.data ?? data?.result ?? data;
      const name = item?.name ?? q;

      await postRollMessage(interaction, repo, q, name, durationMins);
      await interaction.reply({ content: `Kiraktam: **${name}** (roll üzenet).`, ephemeral: true });
      return;
    } catch {
      // fallback to normal search
    }
  }

  const nonce = repo.newId("itm");
  const page = 1;
  const results = await searchAcrossCategories(cfg, q);

  if (!results.length) {
    await interaction.reply({ content: "Nincs találat.", ephemeral: true });
    return;
  }

  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const pageData = results.slice(0, pageSize);

  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.itemPick(nonce, page))
    .setPlaceholder("Válassz itemet…")
    .addOptions(pageData.map((it: any) => ({
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
    .setDescription(`Keresés: **${q}**\nOldal: **${page}/${pageCount}**\nTalálatok: **${results.length}**`);

  await interaction.reply({
    embeds: [embed],
    components: [row1, row2],
    ephemeral: true,
  });

  const client = interaction.client as any;
  client.__itemSearch ??= new Map();
  client.__itemSearch.set(nonce, {
    q,
    pageCount,
    createdBy: interaction.user.id,
    language: cfg.language,
    durationMins,
    results,
  });
}

export async function handleItemPaging(interaction: any, repo: Repo, cfg: Cfg) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const nonce = parts[2];
  const currentPage = Number(parts[3]);

  const client = interaction.client as any;
  const state = client.__itemSearch?.get(nonce);
  if (!state) return interaction.reply({ content: "Lejárt keresés (indíts új /item-et).", ephemeral: true });
  if (state.createdBy !== interaction.user.id) return interaction.reply({ content: "Ezt a keresést csak az indító használhatja.", ephemeral: true });

  const nextPage = action === "prev" ? Math.max(1, currentPage - 1) : Math.min(state.pageCount, currentPage + 1);
  const pageSize = 25;
  const pageData = state.results.slice((nextPage - 1) * pageSize, nextPage * pageSize);

  if (!pageData.length) {
    return interaction.reply({ content: "Nincs találat ezen az oldalon.", ephemeral: true });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(IDS.itemPick(nonce, nextPage))
    .setPlaceholder("Válassz itemet…")
    .addOptions(pageData.map((it: any) => ({
      label: String(it.name ?? it.id).slice(0, 100),
      value: String(it.id),
      description: `${it.mainCategory ?? ""}/${it.subCategory ?? ""}`.slice(0, 100) || undefined,
    })));

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(IDS.itemPrev(nonce, nextPage)).setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(nextPage <= 1),
    new ButtonBuilder().setCustomId(IDS.itemNext(nonce, nextPage)).setLabel("Next ➡️").setStyle(ButtonStyle.Secondary).setDisabled(nextPage >= state.pageCount),
  );

  const embed = new EmbedBuilder()
    .setTitle("Item keresés")
    .setDescription(`Keresés: **${state.q}**\nOldal: **${nextPage}/${state.pageCount}**\nTalálatok: **${state.results.length}**`);

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

export async function handleItemPick(interaction: any, repo: Repo, cfg: Cfg) {
  const parts = interaction.customId.split(":");
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

  await postRollMessage(interaction, repo, id, name, state.durationMins ?? null);
  await interaction.reply({ content: `Kiraktam: **${name}** (roll üzenet).`, ephemeral: true });
}
