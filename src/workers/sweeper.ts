import type { Client } from "discord.js";
import type { Repo } from "../db/repo.js";
import { pollResultsText } from "../ui/embeds.js";

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
    const due = repo.getDuePolls(now);

    for (const poll of due) {
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
  }, 30_000);
}
