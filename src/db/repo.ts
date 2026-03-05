import crypto from "node:crypto";

export class Repo {
  constructor(private db: any) {}

  init(schemaSql: string) {
    // Base schema (CREATE TABLE IF NOT EXISTS + indexes)
    this.db.exec(schemaSql);

    // ---- Lightweight migrations (safe for existing DBs)
    // Add roll_sessions.ends_at if missing
    try {
      const cols = this.db.prepare(`PRAGMA table_info(roll_sessions)`).all() as any[];
      const hasEndsAt = cols.some((c) => String(c.name).toLowerCase() === "ends_at");
      if (!hasEndsAt) {
        this.db.exec(`ALTER TABLE roll_sessions ADD COLUMN ends_at INTEGER`);
      }
    } catch {}

    // Ensure helpful indexes exist (IF NOT EXISTS is safe)
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_roll_sessions_due ON roll_sessions(is_closed, ends_at);
        CREATE INDEX IF NOT EXISTS idx_roll_entries_message ON roll_entries(message_id);

        CREATE INDEX IF NOT EXISTS idx_polls_due ON polls(is_closed, ends_at);
        CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_user ON poll_votes(poll_id, user_id);

        CREATE INDEX IF NOT EXISTS idx_events_message ON events(message_id);
        CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_id);
      `);
    } catch {}
  }

  // ---- Rolls
  createRollSession(p: {
    messageId: string; guildId: string; channelId: string;
    itemId: string; itemName: string; createdBy: string; now: number;
    endsAt?: number | null; // unix ms, nullable
  }) {
    this.db.prepare(`
      INSERT INTO roll_sessions(message_id,guild_id,channel_id,item_id,item_name,created_by,created_at,ends_at,is_closed)
      VALUES (@messageId,@guildId,@channelId,@itemId,@itemName,@createdBy,@now,@endsAt,0)
    `).run({ ...p, endsAt: p.endsAt ?? null });
  }

  getRollSession(messageId: string) {
    return this.db.prepare(`SELECT * FROM roll_sessions WHERE message_id=?`).get(messageId) as any;
  }

  closeRollSession(messageId: string) {
    this.db.prepare(`UPDATE roll_sessions SET is_closed=1 WHERE message_id=?`).run(messageId);
  }

  getDueRollSessions(now: number) {
    return this.db.prepare(`
      SELECT * FROM roll_sessions
      WHERE is_closed=0 AND ends_at IS NOT NULL AND ends_at<=?
    `).all(now) as any[];
  }

  getRollEntry(messageId: string, userId: string) {
    return this.db.prepare(`SELECT * FROM roll_entries WHERE message_id=? AND user_id=?`).get(messageId, userId) as any;
  }

  insertRollEntry(p: { messageId: string; userId: string; userName: string; value: number; now: number; }) {
    this.db.prepare(`
      INSERT INTO roll_entries(message_id,user_id,user_name,roll_value,created_at)
      VALUES (@messageId,@userId,@userName,@value,@now)
      ON CONFLICT(message_id,user_id) DO NOTHING
    `).run(p);
  }

  getRollEntries(messageId: string) {
    return this.db.prepare(`SELECT user_name, roll_value, created_at FROM roll_entries WHERE message_id=?`).all(messageId) as any[];
  }

  // ---- Polls
  createPoll(p: {
    pollId: string; messageId: string; guildId: string; channelId: string;
    title: string; mode: "single"|"multi"; maxVotes: number;
    endsAt: number | null;
    createdBy: string; now: number;
  }) {
    this.db.prepare(`
      INSERT INTO polls(poll_id,message_id,guild_id,channel_id,title,mode,max_votes,ends_at,is_closed,created_by,created_at)
      VALUES (@pollId,@messageId,@guildId,@channelId,@title,@mode,@maxVotes,@endsAt,0,@createdBy,@now)
    `).run(p);
  }

  getPoll(pollId: string) {
    return this.db.prepare(`SELECT * FROM polls WHERE poll_id=?`).get(pollId) as any;
  }

  getPollByMessage(messageId: string) {
    return this.db.prepare(`SELECT * FROM polls WHERE message_id=?`).get(messageId) as any;
  }

  addPollOption(pollId: string, optionId: string, label: string) {
    this.db.prepare(`INSERT INTO poll_options(poll_id,option_id,label) VALUES (?,?,?)`).run(pollId, optionId, label);
  }

  getPollOptions(pollId: string) {
    return this.db.prepare(`SELECT option_id, label FROM poll_options WHERE poll_id=? ORDER BY option_id`).all(pollId) as any[];
  }

  clearUserVotes(pollId: string, userId: string) {
    this.db.prepare(`DELETE FROM poll_votes WHERE poll_id=? AND user_id=?`).run(pollId, userId);
  }

  addUserVote(p: { pollId: string; userId: string; userName: string; optionId: string; now: number; }) {
    this.db.prepare(`
      INSERT OR IGNORE INTO poll_votes(poll_id,user_id,user_name,option_id,created_at)
      VALUES (@pollId,@userId,@userName,@optionId,@now)
    `).run(p);
  }

  closePoll(pollId: string) {
    this.db.prepare(`UPDATE polls SET is_closed=1 WHERE poll_id=?`).run(pollId);
  }

  getDuePolls(now: number) {
    return this.db.prepare(`SELECT * FROM polls WHERE is_closed=0 AND ends_at IS NOT NULL AND ends_at<=?`).all(now) as any[];
  }

  getPollResults(pollId: string) {
    return this.db.prepare(`
      SELECT o.option_id as option_id, o.label as label, COUNT(v.option_id) as count
      FROM poll_options o
      LEFT JOIN poll_votes v ON v.poll_id=o.poll_id AND v.option_id=o.option_id
      WHERE o.poll_id=?
      GROUP BY o.option_id
    `).all(pollId) as any[];
  }

  // ---- Events
  createEvent(p: {
    eventId: string; messageId: string; guildId: string; channelId: string;
    type: string; title: string; startAt: number; durationMins: number | null; notes: string | null;
    createdBy: string; now: number;
  }) {
    this.db.prepare(`
      INSERT INTO events(event_id,message_id,guild_id,channel_id,type,title,start_at,duration_mins,notes,is_locked,created_by,created_at)
      VALUES (@eventId,@messageId,@guildId,@channelId,@type,@title,@startAt,@durationMins,@notes,0,@createdBy,@now)
    `).run(p);
  }

  getEvent(eventId: string) {
    return this.db.prepare(`SELECT * FROM events WHERE event_id=?`).get(eventId) as any;
  }

  getEventByMessage(messageId: string) {
    return this.db.prepare(`SELECT * FROM events WHERE message_id=?`).get(messageId) as any;
  }

  setEventLocked(eventId: string, locked: boolean) {
    this.db.prepare(`UPDATE events SET is_locked=? WHERE event_id=?`).run(locked ? 1 : 0, eventId);
  }

  upsertRsvp(p: { eventId: string; userId: string; userName: string; status: "tank"|"healer"|"dps"|"cant"; now: number; }) {
    this.db.prepare(`
      INSERT INTO event_rsvps(event_id,user_id,user_name,status,updated_at)
      VALUES (@eventId,@userId,@userName,@status,@now)
      ON CONFLICT(event_id,user_id) DO UPDATE SET
        user_name=excluded.user_name,
        status=excluded.status,
        updated_at=excluded.updated_at
    `).run(p);
  }

  getEventRsvps(eventId: string) {
    return this.db.prepare(`SELECT user_name, status FROM event_rsvps WHERE event_id=? ORDER BY status, user_name`).all(eventId) as any[];
  }

  // utils
  newId(prefix: string) {
    return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
  }
}