import { EmbedBuilder } from "discord.js";

export function rollResultsEmbed(itemName: string, entries: { user_name: string; roll_value: number }[]) {
  const sorted = [...entries].sort((a, b) => b.roll_value - a.roll_value);
  const top = sorted.slice(0, 25).map((e, i) => `${i + 1}. **${e.user_name}** — ${e.roll_value}`);
  return new EmbedBuilder()
    .setTitle(`🎲 Roll eredmények – ${itemName}`)
    .setDescription(top.length ? top.join("\n") : "Még senki nem rollolt.");
}

export function rollSessionEmbed(p: {
  itemName: string;
  itemId: string;
  endsAt?: number | null;
  closed?: boolean;
  entries: { user_name: string; roll_value: number }[];
}) {
  const sorted = [...p.entries].sort((a, b) => b.roll_value - a.roll_value);
  const lines = sorted.slice(0, 25).map((e, i) => `${i + 1}. **${e.user_name}** — ${e.roll_value}`);

  const endBlock = p.endsAt
    ? `Lejár: <t:${Math.floor(p.endsAt / 1000)}:R>\nPontosan: <t:${Math.floor(p.endsAt / 1000)}:F>`
    : "Lejárat: manuálisan (Close gomb)";

  return new EmbedBuilder()
    .setTitle(`🎲 ${p.itemName}`)
    .setDescription(`ID: \`${p.itemId}\`\n${endBlock}\nÁllapot: ${p.closed ? "⛔ Lezárva" : "🟢 Nyitva"}`)
    .addFields({
      name: `Rollok (${sorted.length})`,
      value: lines.length ? lines.join("\n") : "Még senki nem rollolt.",
    });
}

export function rollWinnerText(itemName: string, entries: { user_name: string; roll_value: number }[]) {
  if (!entries.length) {
    return `🎲 **${itemName}** — a roll lezárult, de nem érkezett dobás.`;
  }

  const sorted = [...entries].sort((a, b) => {
    if (b.roll_value !== a.roll_value) return b.roll_value - a.roll_value;
    return 0;
  });

  const best = sorted[0];
  const tied = sorted.filter((e) => e.roll_value === best.roll_value);

  if (tied.length > 1) {
    const names = tied.map((e) => `**${e.user_name}**`).join(", ");
    return `🎲 **${itemName}** — döntetlen az első helyen (${best.roll_value}): ${names}`;
  }

  return `🏆 **${itemName}** nyertese: **${best.user_name}** (${best.roll_value})`;
}

export function pollResultsText(title: string, rows: { label: string; count: number }[]) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const lines = sorted.map(r => `**${r.label}** — ${r.count}`);
  return `🗳️ **Szavazás vége:** ${title}\n${lines.length ? lines.join("\n") : "Nem érkezett szavazat."}`;
}

export function eventEmbed(p: {
  type: string; title: string; startAt: number; durationMins: number | null; notes: string | null;
  locked: boolean;
  rsvps: { user_name: string; status: string }[];
}) {
  const groups: Record<string, string[]> = { tank: [], healer: [], dps: [], cant: [] };
  for (const r of p.rsvps) (groups[r.status] ??= []).push(r.user_name);

  const block = (label: string, list: string[]) =>
    `${label} (${list.length})\n${list.length ? list.map(n => `• ${n}`).join("\n") : "—"}`;

  const e = new EmbedBuilder()
    .setTitle(`[${p.type}] ${p.title}`)
    .addFields(
      { name: "Időpont", value: `<t:${Math.floor(p.startAt / 1000)}:F>\n<t:${Math.floor(p.startAt / 1000)}:R>`, inline: true },
      { name: "Állapot", value: p.locked ? "🔒 Zárva" : "🟢 Nyitva", inline: true },
    )
    .addFields(
      { name: "🛡️ Tank", value: block("Tank", groups.tank), inline: true },
      { name: "💚 Healer", value: block("Healer", groups.healer), inline: true },
      { name: "⚔️ DPS", value: block("DPS", groups.dps), inline: true },
      { name: "❌ Nem jövök", value: block("Can't", groups.cant), inline: false },
    );

  if (p.durationMins) e.addFields({ name: "Időtartam", value: `${p.durationMins} perc`, inline: true });
  if (p.notes) e.setDescription(p.notes);

  return e;
}
