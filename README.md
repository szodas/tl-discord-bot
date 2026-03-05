# Throne and Liberty – Discord Bot (Questlog API + Roll + Boss Vote + Event RSVP)

## Features
- `/item <query>`: search items via Questlog, pick from a dropdown, show item, start a roll session on that message.
- Roll buttons: **🎲 Roll (1-100)**, **📊 Results**, **⛔ Close**
- `/bossvote start`: time-limited (optional) boss vote, **single or multi** selection, auto-close + results
- `/event create`: event post with RSVP buttons **Tank / Healer / DPS / Can't** (+ lock)

## Setup
1. Create a Discord application + bot in the Discord Developer Portal.
2. Copy:
   - Bot token -> `DISCORD_TOKEN`
   - Application (client) id -> `DISCORD_CLIENT_ID`
3. Create `.env` from the example:
   ```bash
   cp .env.example .env
   ```
4. Install & run:
   ```bash
   npm i
   npm run dev
   ```

### Production
```bash
npm run build
npm start
```

## Invite the bot to your server
In the Developer Portal:
- OAuth2 -> URL Generator
- Scopes: `bot`, `applications.commands`
- Permissions (minimum):
  - Send Messages
  - Embed Links
  - Read Message History

Paste the generated URL into the browser to invite.

## Notes
- The bot uses SQLite (`better-sqlite3`) at `SQLITE_PATH`.
- Questlog routes:
  - Search: `database.getItems`
  - Item details: `database.getItem`
