import type { Client } from "discord.js";
import type { Repo } from "../db/repo.js";
import { pollResultsText, rollSessionEmbed, rollWinnerText } from "../ui/embeds.js";

function disableComponentsForEdit(message: any) {
  const rows = (message.components ?? []).map((row: any) => {
    const json = typeof row.toJSON === "function" ? row.toJSON() : row;
    if (json?.components?.length) {
      json.components = json.components.map((c: any) => ({ ...c, disabled: true }));
    }
    return json;
  });
  return rows;
}

export function startSweeper(client: Client, repo: Repo) {
  setInterval(async () => {
    const now = Date.now();

    // Close due polls
    const duePolls = repo.getDuePolls(now);
    for (const poll of duePolls) {
      try {
        const channel = await client.channels.fetch(poll.channel_id);
        if (!channel || !channel.isTextBased()) { repo.closePoll(poll.poll_id); continue; }

        const results = repo.getPollResults(poll.poll_id);
        repo.closePoll(poll.poll_id);

        try {
          const msg = await channel.messages.fetch(poll.message_id);
          await msg.edit({ components: disableComponentsForEdit(msg) });
        } catch {}

        await (channel as any).send(pollResultsText(poll.title, results));
      } catch {
        repo.closePoll(poll.poll_id);
      }
    }

    // Close due roll sessions
    const dueRolls = repo.getDueRollSessions(now);
    for (const roll of dueRolls) {
      try {
        const channel = await client.channels.fetch(roll.channel_id);
        if (!channel || !channel.isTextBased()) { repo.closeRollSession(roll.message_id); continue; }

        const entries = repo.getRollEntries(roll.message_id);
        repo.closeRollSession(roll.message_id);

        try {
          const msg = await channel.messages.fetch(roll.message_id);
          await msg.edit({
            embeds: [
              rollSessionEmbed({
                itemName: roll.item_name,
                itemId: roll.item_id,
                endsAt: roll.ends_at,
                closed: true,
                entries,
              }),
            ],
            components: disableComponentsForEdit(msg),
          });
        } catch {}

        await (channel as any).send(rollWinnerText(roll.item_name, entries));
      } catch {
        repo.closeRollSession(roll.message_id);
      }
    }
  }, 30_000);
}
