# StudyBot 🤖📚

WhatsApp bot for study groups with deadline reminders, homework tracking, notes sharing, resource sharing, daily questions, moderation, FAQ, and leaderboard. Built with [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

> Bot interface and commands are in Spanish. See [README.md](README.md) for the Spanish version.



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
| `prefix` | Command prefix character (default `"!"`) |
| `subjects` | List of subjects with aliases and Drive folder links (see below) |
| `reminderDays` | Days before deadline to send reminders (e.g. `[4, 2, 0]`) |
| `reminderTodayRepeat` | Repeat "due today" reminders throughout the day (`enabled`, `times`, `startHour`, `endHour`) |
| `weeklySummary` | Weekly digest config (day, hour, message template) |
| `messages` | Reminder notification templates (4 days, 2 days, today) |
| `wordWarnings` | Auto-warn on forbidden words |
| `mute` | Mute durations (`defaultMinutes`, `maxMinutes`) and message templates |
| `welcome` | Welcome message for new members |
| `dailyQuestions` | Daily questions config (`enabled`, `questionsPerDay`, `startHour`, `endHour`, `message`) |
| `activityCheck` | Inactivity warning and removal thresholds (`warnAfterDays`, `removeAfterDays`) |

### Subjects (`config.subjects`)

Configure the subjects for the current semester so users can propose homeworks or notes without needing to paste a Drive link manually. The bot normalizes subject name variants (aliases) and auto-fills the Drive folder link.

```json
"subjects": [
  {
    "name": "Algoritmos I",
    "aliases": ["algoritmos 1", "algo 1", "algoritmos i"],
    "driveFolder": "https://drive.google.com/drive/folders/YOUR_FOLDER_ID",
    "notesFolder": "https://drive.google.com/drive/folders/YOUR_FOLDER_ID_TWO"
  }
]
```

- `name` — canonical display name used in all messages
- `aliases` — alternative spellings accepted from users (case-insensitive)
- `driveFolder` — Google Drive folder URL auto-filled when a user proposes a homework
- `notesFolder` — Google Drive folder URL auto-filled when a user proposes notes

### Daily questions bank (`data/daily-questions.json`)

Each entry in the pool is an object with the question, its reference answer, and a difficulty level:

```json
[
  {
    "question": "What is the difference between an array and a linked list?",
    "answer": "An array stores elements contiguously in memory with O(1) index access, while a linked list uses nodes with pointers allowing O(1) insert/delete but O(n) access.",
    "difficulty": "normal"
  }
]
```

- `question` — question text the bot will publish to the group
- `answer` — reference correct answer used to validate user replies
- `difficulty` — difficulty level: `easy`, `normal`, or `hard`

| Difficulty | Points |
|---|---|
| `easy` (🟢) | +2 |
| `normal` (🟡) | +3 |
| `hard` (🔴) | +4 |

When the bot publishes a question it is removed from the pool. User replies are validated by keyword similarity against `answer` (25 % threshold). Admins can also add questions directly from the chat using `!add-pregunta`.

## Commands

> **Tip:** Commands are tolerant of a leading space after the prefix — `! tareas` works the same as `!tareas`. Most commands also have short aliases listed alongside the full name.

### Public

| Command | Description |
|---|---|
| `!ayuda` / `!help` | Show available commands |
| `!admins` | List group admins |
| `!recordatorios` / `!r` | View upcoming deadlines |
| `!proponer-recordatorio` / `!pr` `"Title" YYYY-MM-DD [desc]` | Propose a reminder for admin review |
| `!tareas` / `!t` | View all approved homeworks with numeric IDs |
| `!ver-tarea` / `!vt` `[n]` | View full details of homework number N |
| `!buscar-tarea` / `!bt` `[query]` | Search homeworks by subject, title, or description |
| `!proponer-tarea` / `!pt` `subject \| title \| desc \| link` | Propose a homework (link optional if subject is configured) |
| `!apuntes` / `!a` | View all approved notes with numeric IDs |
| `!ver-apuntes` / `!va` `[n]` | View full details of notes entry number N |
| `!buscar-apuntes` / `!ba` `[query]` | Search notes by subject, title, or description |
| `!proponer-apuntes` / `!pa` `subject \| title \| desc \| link` | Share notes for admin review |
| `!recursos` / `!rc` | View all approved resources with numeric IDs |
| `!ver-recurso` / `!vrc` `[n]` | View full details of resource number N |
| `!buscar-recurso` / `!brc` `[query]` | Search resources by type, title, or description |
| `!proponer-recurso` / `!prc` `type \| title \| desc \| link` | Propose a resource for admin review *(suggested types: video, pdf, libro, herramienta, guía, enlace, ejercicios, otro)* |
| `!preguntas` | View recent daily questions and their answers |
| `!faq` | View frequently asked questions |
| `!tabla` | Group leaderboard |
| `!puntos` | Your personal score and stats |
| `!premio` | Current leaderboard prize |

### Admin

| Command | Description |
|---|---|
| `!recordatorio "Title" YYYY-MM-DD [desc]` | Add a reminder directly (no review needed) |
| `!borrar-recordatorio [id]` | Delete a reminder |
| `!pendientes` | View **all** pending proposals — homeworks, notes, and reminders — in one place |
| `!aprobar [id]` | Approve any pending proposal (homework, notes, or reminder) |
| `!rechazar [id] [reason]` | Reject any pending proposal with an optional reason |
| `!borrar-tarea [id]` | Delete an approved homework |
| `!borrar-apuntes [id]` | Delete approved notes |
| `!borrar-recurso [id]` | Delete approved resource |
| `!add-faq keyword1,keyword2 \| Question \| Answer` | Add an FAQ entry |
| `!del-faq [id]` | Delete an FAQ entry |
| `!add-pregunta easy\|normal\|hard \| Question \| Answer` | Add a question to the daily questions bank |
| `!conf-premio Prize \| Points \| Sponsor` | Set the leaderboard prize |
| `!mutear [@user] [minutes] [reason]` | Mute a user |
| `!desmutear [@user]` | Unmute a user |
| `!muteados` | List currently muted users |
| `!inactivos` | List members inactive for ≥30 days |
| `!dar-puntos` `<id\|number\|@mention> N [reason]` | Award bonus points to a user |
| `!usuarios` | List all tracked users with their short numeric IDs and last-seen date |
| `!msg` `[message]` | Send a message to the group as the bot (only from a private chat with the bot) |
| `!todos [message]` | Send a private DM to every non-admin group member |
| `!resumen-semanal` | Force the weekly digest |
| `!test-recordatorios` | Force reminder check |
| `!test-actividad` | Force inactivity check |

## Automatic behaviours

| Behaviour | Trigger |
|---|---|
| **Welcome message** | Sent to the group when a new member joins |
| **Reminder notifications** | Sent to the group at 8:00 AM (Bogotá) on configured days before a deadline |
| **"Due today" repeat reminders** | When `reminderTodayRepeat.enabled` is true, the same-day deadline alert is sent `times` times evenly spread between `startHour` and `endHour` |
| **Weekly digest** | Sent on the configured weekday/hour with all deadlines for the next 7 days |
| **Daily questions** | The bot automatically publishes `questionsPerDay` questions from the pool (`daily-questions.json`) spread throughout the day between `startHour` and `endHour` |
| **Daily question scoring** | Quoting/replying to a daily question validates the answer by keyword similarity against the correct answer (25 % threshold). Awards variable points based on difficulty to the first correct answerer: 🟢 easy +2, 🟡 normal +3, 🔴 hard +4. Incorrect answers receive the correct answer as feedback. |
| **Word warnings** | Bot warns in-group when a forbidden word is detected |
| **Mute enforcement** | Muted users' messages are deleted and they receive a DM |
| **Inactivity check** | Runs daily at 10:00 AM (Bogotá); warns after `warnAfterDays`, removes after an additional `removeAfterDays` |
| **FAQ auto-reply** | When a group message contains a keyword matching an FAQ entry, the bot replies automatically |
| **FAQ from reminders** | Adding a reminder via `!recordatorio` automatically creates an FAQ entry with keywords extracted from the title/description. Deleting the reminder removes its FAQ entries. |
| **Activity tracking** | Every message sent in the group updates the member's last-seen timestamp. Each member is assigned a short sequential numeric ID used to target them in commands like `!dar-puntos`. |

## Points system

| Action | Points |
|---|---|
| Task approved | +7 |
| Task proposed | +3 |
| Notes approved | +5 |
| Notes proposed | +2 |
| Resource approved | +2 |
| Resource proposed | +1 |
| Daily question answered — 🟢 Easy | +2 |
| Daily question answered — 🟡 Normal | +3 |
| Daily question answered — 🔴 Hard | +4 |
| Daily question asked (via `!add-pregunta`) | +1 |
| Reminder approved | +1 |

## License

[MIT](LICENSE)
