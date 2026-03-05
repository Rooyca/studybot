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

## Commands

### Public

| Command | Description |
|---|---|
| `!ayuda` | Show available commands |
| `!recordatorios` | View upcoming deadlines |
| `!proponer-recordatorio "Title" YYYY-MM-DD [desc]` | Propose a reminder |
| `!tareas` | View approved tasks |
| `!buscar-tarea [keyword]` | Search tasks |
| `!proponer-tarea subject \| title \| desc \| link` | Propose a task |
| `!pregunta [text]` | Send anonymous question *(DM only)* |
| `!responder [text]` | Answer an anonymous question (quote it) |
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
| `!pendientes` | View pending task proposals |
| `!aprobar [id]` / `!rechazar [id] [reason]` / `!borrar-tarea [id]` | Manage tasks |
| `!add-faq keyword1,keyword2 \| Question \| Answer` | Add FAQ entry |
| `!del-faq [id]` | Delete FAQ entry |
| `!conf-premio Prize \| Points \| Sponsor` | Set prize |
| `!mutear [@user] [minutes] [reason]` / `!desmutear [@user]` / `!muteados` | Manage mutes |
| `!inactivos` | List members inactive ≥30 days |
| `!resumen-semanal` / `!test-recordatorios` / `!test-actividad` | Force scheduled tasks |

## License

[MIT](LICENSE)
