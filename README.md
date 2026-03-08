# StudyBot 🤖📚

WhatsApp bot for study groups with deadline reminders, homework tracking, anonymous questions, moderation, FAQ, and leaderboard. Built with [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

> Bot interface and commands are in Spanish.

## Requirements

- [Node.js](https://nodejs.org/) v16+
- A dedicated WhatsApp account (QR scan required on first run)
- Bot must be a **group admin** to delete messages and remove inactive members

## Setup

```bash
git clone https://github.com/your-user/bot_unip.git
cd bot_unip
npm install
cp -r data_example data
```

Edit `config.json` with your admin numbers, group ID, and preferences. To get the group ID, send any message and check the console — it logs the chat ID on each received message.

## Run

```bash
npm start        # production
npm run dev      # development (auto-restart)
```

On first run, scan the QR code printed in the terminal. The session is saved in `.wwebjs_auth/` for subsequent runs.

## Configuration

All settings live in `config.json`. See `config.json.example` for the full structure. Key sections:

| Key | Description |
|---|---|
| `admins` | Array of admin phone numbers (no `+`, e.g. `"573111111111"`) |
| `groupId` | WhatsApp group ID (e.g. `"12345@g.us"`) |
| `subjects` | List of subjects with aliases and Drive folder links (see below) |
| `reminderDays` | Days before deadline to send reminders (e.g. `[4, 2, 0]`) |
| `weeklySummary` | Weekly digest config (day, hour, message template) |
| `wordWarnings` | Auto-warn on forbidden words |
| `mute` | Mute durations and message templates |
| `welcome` | Welcome message for new members |
| `activityCheck` | Inactivity warning and removal thresholds |

### Subjects (`config.subjects`)

Configure the subjects for the current semester so users can propose homeworks without needing to paste a Drive link manually. The bot normalizes subject name variants (aliases) and auto-fills the Drive folder link.

```json
"subjects": [
  {
    "name": "Algoritmos I",
    "aliases": ["algoritmos 1", "algo 1", "algoritmos i"],
    "driveFolder": "https://drive.google.com/drive/folders/YOUR_FOLDER_ID"
  }
]
```

- `name` — canonical display name used in all messages
- `aliases` — alternative spellings accepted from users (case-insensitive)
- `driveFolder` — Google Drive folder URL auto-filled when a user doesn't provide a link

## Commands

### Public

| Command | Description |
|---|---|
| `!ayuda` | Show available commands |
| `!recordatorios` | View upcoming deadlines |
| `!proponer-recordatorio "Title" YYYY-MM-DD [desc]` | Propose a reminder |
| `!tareas` | View all approved homeworks with numeric IDs |
| `!ver-tarea [n]` | View full details of homework number N |
| `!proponer-tarea subject \| title \| desc \| link` | Propose a homework (link optional if subject is configured) |
| `!pregunta [text]` | Send anonymous question *(DM only)* |
| *(reply to question message)* | Answer an anonymous question |
| `!preguntas` | View anonymous questions |
| `!tabla` | Leaderboard |
| `!puntos` | Your stats |
| `!premio` | Current prize |

### Admin

| Command | Description |
|---|---|
| `!recordatorio "Title" YYYY-MM-DD [desc]` | Add a reminder directly |
| `!recordatorios-pendientes` | View pending reminder proposals |
| `!aprobar-r [id]` / `!rechazar-r [id] [reason]` / `!borrar-r [id]` | Manage reminders |
| `!pendientes` | View pending homework proposals |
| `!aprobar [id]` / `!rechazar [id] [reason]` / `!borrar-tarea [id]` | Manage homeworks |
| `!add-faq keyword1,keyword2 \| Question \| Answer` | Add FAQ entry |
| `!del-faq [id]` | Delete FAQ entry |
| `!conf-premio Prize \| Points \| Sponsor` | Set leaderboard prize |
| `!mutear [@user] [minutes] [reason]` / `!desmutear [@user]` / `!muteados` | Manage mutes |
| `!inactivos` | List members inactive ≥30 days |
| `!todos [message]` | Send a private DM to every group member |
| `!resumen-semanal` / `!test-recordatorios` / `!test-actividad` | Force scheduled tasks |

## License

[MIT](LICENSE)
