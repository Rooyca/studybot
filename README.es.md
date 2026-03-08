# StudyBot 🤖📚

Bot de WhatsApp para grupos de estudio con recordatorios de entregas, seguimiento de tareas, compartir apuntes, preguntas anónimas, moderación, FAQ y leaderboard. Construido con [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

> La interfaz y los comandos del bot están en español. Ver [README.md](README.md) para la versión en inglés.

## Requisitos

- [Node.js](https://nodejs.org/) v16+
- Una cuenta de WhatsApp dedicada (se requiere escanear el QR en el primer inicio)
- El bot debe ser **administrador del grupo** para poder eliminar mensajes y remover miembros inactivos

## Instalación

```bash
git clone https://github.com/your-user/bot_unip.git
cd bot_unip
npm install
cp -r data_example data
```

Editá `config.json` con tus números de admin, el ID del grupo y las preferencias. Para obtener el ID del grupo, enviá cualquier mensaje y revisá la consola — loguea el chat ID en cada mensaje recibido.

## Ejecución

```bash
npm start        # producción
npm run dev      # desarrollo (reinicio automático)
```

En el primer inicio, escaneá el código QR que aparece en la terminal. La sesión se guarda en `.wwebjs_auth/` para los siguientes inicios.

## Configuración

Toda la configuración vive en `config.json`. Ver `config.json.example` para la estructura completa. Secciones principales:

| Clave | Descripción |
|---|---|
| `admins` | Array de números de admin (sin `+`, ej: `"573111111111"`) |
| `groupId` | ID del grupo de WhatsApp (ej: `"12345@g.us"`) |
| `subjects` | Lista de materias con alias y links de Drive (ver abajo) |
| `reminderDays` | Días antes del vencimiento para enviar recordatorios (ej: `[4, 2, 0]`) |
| `weeklySummary` | Configuración del resumen semanal (día, hora, plantilla de mensaje) |
| `wordWarnings` | Auto-advertencia por palabras prohibidas |
| `mute` | Duraciones de silencio y plantillas de mensajes |
| `welcome` | Mensaje de bienvenida para nuevos miembros |
| `activityCheck` | Umbrales de advertencia y remoción por inactividad |

### Materias (`config.subjects`)

Configurá las materias del cuatrimestre para que los usuarios puedan proponer tareas o apuntes sin necesidad de pegar un link de Drive manualmente. El bot normaliza variantes del nombre de la materia (alias) y autocompleta el link de Drive.

```json
"subjects": [
  {
    "name": "Algoritmos I",
    "aliases": ["algoritmos 1", "algo 1", "algoritmos i"],
    "driveFolder": "https://drive.google.com/drive/folders/ID_DE_TU_CARPETA",
    "notesFolder": "https://drive.google.com/drive/folders/ID_DE_TU_CARPETA_APUNTES"
  }
]
```

- `name` — nombre canónico que aparece en todos los mensajes
- `aliases` — variantes aceptadas (sin distinguir mayúsculas/minúsculas)
- `driveFolder` — URL de Google Drive que se autocompleta si el usuario no provee un link

## Comandos

### Públicos

| Comando | Descripción |
|---|---|
| `!ayuda` | Mostrar los comandos disponibles |
| `!admins` | Listar los administradores del grupo |
| `!recordatorios` | Ver próximas fechas de entrega |
| `!proponer-recordatorio "Título" YYYY-MM-DD [desc]` | Proponer un recordatorio para revisión de un admin |
| `!tareas` | Ver todas las tareas aprobadas con IDs numéricos |
| `!ver-tarea [n]` | Ver el detalle completo de la tarea número N |
| `!buscar-tarea [consulta]` | Buscar tareas por materia, título o descripción |
| `!proponer-tarea materia \| título \| desc \| link` | Proponer una tarea (link opcional si la materia está configurada) |
| `!apuntes` | Ver todos los apuntes aprobados con IDs numéricos |
| `!ver-apuntes [n]` | Ver el detalle completo del apunte número N |
| `!buscar-apuntes [consulta]` | Buscar apuntes por materia, título o descripción |
| `!proponer-apuntes materia \| título \| desc \| link` | Compartir apuntes para revisión de un admin |
| `!pregunta [texto]` | Enviar una pregunta anónima al grupo *(solo desde privado)* |
| *(responder citando el mensaje de la pregunta)* | Responder una pregunta anónima y ganar puntos |
| `!preguntas` | Ver preguntas anónimas recientes con sus respuestas |
| `!faq` | Ver preguntas frecuentes |
| `!tabla` | Leaderboard del grupo |
| `!puntos` | Tu puntaje personal y estadísticas |
| `!premio` | Ver el premio actual del leaderboard |

### Admin

| Comando | Descripción |
|---|---|
| `!recordatorio "Título" YYYY-MM-DD [desc]` | Agregar un recordatorio directamente (sin revisión) |
| `!borrar-recordatorio [id]` | Eliminar un recordatorio |
| `!pendientes` | Ver **todas** las propuestas pendientes — tareas, apuntes y recordatorios — en un solo lugar |
| `!aprobar [id]` | Aprobar cualquier propuesta pendiente (tarea, apuntes o recordatorio) |
| `!rechazar [id] [motivo]` | Rechazar cualquier propuesta con un motivo opcional |
| `!borrar-tarea [id]` | Eliminar una tarea aprobada |
| `!borrar-apuntes [id]` | Eliminar apuntes aprobados |
| `!add-faq keyword1,keyword2 \| Pregunta \| Respuesta` | Agregar una entrada de FAQ |
| `!del-faq [id]` | Eliminar una entrada de FAQ |
| `!conf-premio Premio \| Puntos \| Patrocinador` | Configurar el premio del leaderboard |
| `!mutear [@usuario] [minutos] [motivo]` | Silenciar un usuario |
| `!desmutear [@usuario]` | Desilenciar un usuario |
| `!muteados` | Ver usuarios actualmente silenciados |
| `!inactivos` | Listar miembros inactivos hace ≥30 días |
| `!todos [mensaje]` | Enviar un mensaje privado a todos los miembros no-admin del grupo |
| `!resumen-semanal` | Forzar el resumen semanal |
| `!test-recordatorios` | Forzar la revisión de recordatorios |
| `!test-actividad` | Forzar la revisión de inactividad |

## Licencia

[MIT](LICENSE)
