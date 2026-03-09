# StudyBot 🤖📚

Bot de WhatsApp para grupos de estudio con recordatorios de entregas, seguimiento de tareas, compartir apuntes, compartir recursos, preguntas anónimas, moderación, FAQ y leaderboard. Construido con [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

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
| `prefix` | Carácter de prefijo para comandos (por defecto `"!"`) |
| `subjects` | Lista de materias con alias y links de Drive (ver abajo) |
| `reminderDays` | Días antes del vencimiento para enviar recordatorios (ej: `[4, 2, 0]`) |
| `weeklySummary` | Configuración del resumen semanal (día, hora, plantilla de mensaje) |
| `messages` | Plantillas de notificación de recordatorios (4 días, 2 días, hoy) |
| `wordWarnings` | Auto-advertencia por palabras prohibidas |
| `mute` | Duraciones de silencio y plantillas de mensajes |
| `welcome` | Mensaje de bienvenida para nuevos miembros |
| `anonymous` | Configuración de preguntas anónimas (habilitado, plantillas de mensajes) |
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
- `driveFolder` — URL de Google Drive que se autocompleta cuando un usuario propone una tarea
- `notesFolder` — URL de Google Drive que se autocompleta cuando un usuario propone apuntes

## Comandos

> **Tip:** Los comandos toleran un espacio después del prefijo — `! tareas` funciona igual que `!tareas`. La mayoría también tienen alias cortos indicados junto al nombre completo.

### Públicos

| Comando | Descripción |
|---|---|
| `!ayuda` | Mostrar los comandos disponibles |
| `!admins` | Listar los administradores del grupo |
| `!recordatorios` / `!r` | Ver próximas fechas de entrega |
| `!proponer-recordatorio` / `!pr` `"Título" YYYY-MM-DD [desc]` | Proponer un recordatorio para revisión de un admin |
| `!tareas` / `!t` | Ver todas las tareas aprobadas con IDs numéricos |
| `!ver-tarea` / `!vt` `[n]` | Ver el detalle completo de la tarea número N |
| `!buscar-tarea` / `!bt` `[consulta]` | Buscar tareas por materia, título o descripción |
| `!proponer-tarea` / `!pt` `materia \| título \| desc \| link` | Proponer una tarea (link opcional si la materia está configurada) |
| `!apuntes` / `!a` | Ver todos los apuntes aprobados con IDs numéricos |
| `!ver-apuntes` / `!va` `[n]` | Ver el detalle completo del apunte número N |
| `!buscar-apuntes` / `!ba` `[consulta]` | Buscar apuntes por materia, título o descripción |
| `!proponer-apuntes` / `!pa` `materia \| título \| desc \| link` | Compartir apuntes para revisión de un admin |
| `!recursos` / `!rc` | Ver todos los recursos aprobados con IDs numéricos |
| `!ver-recurso` / `!vrc` `[n]` | Ver el detalle completo del recurso número N |
| `!buscar-recurso` / `!brc` `[consulta]` | Buscar recursos por tipo, título o descripción |
| `!proponer-recurso` / `!prc` `tipo \| título \| desc \| link` | Proponer un recurso para revisión de un admin *(tipos sugeridos: video, pdf, libro, herramienta, guía, enlace, ejercicios, otro)* |
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
| `!borrar-recurso [id]` | Eliminar un recurso aprobado |
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

## Comportamientos automáticos

| Comportamiento | Disparador |
|---|---|
| **Mensaje de bienvenida** | Se envía al grupo cuando se une un nuevo miembro |
| **Notificaciones de recordatorio** | Se envían al grupo a las 8:00 AM (Bogotá) en los días configurados antes de un vencimiento |
| **Resumen semanal** | Se envía el día/hora configurados con todas las entregas de los próximos 7 días |
| **Advertencias de palabras** | El bot advierte en el grupo si detecta una palabra prohibida |
| **Aplicación del silencio** | Los mensajes de usuarios silenciados son eliminados y reciben un aviso por privado |
| **Revisión de inactividad** | Se ejecuta diariamente a las 10:00 AM (Bogotá); advierte tras `warnAfterDays` días y remueve tras `removeAfterDays` días adicionales |
| **Auto-respuesta de FAQ** | Cuando un mensaje del grupo contiene una palabra clave que coincide con una entrada de FAQ, el bot responde automáticamente |
| **FAQ desde recordatorios** | Al agregar un recordatorio con `!recordatorio`, se crea automáticamente una entrada de FAQ con palabras clave extraídas del título y descripción. Al borrar el recordatorio, también se eliminan sus FAQs. |
| **Puntos por responder preguntas** | Responder (citando) el mensaje de una pregunta anónima en el grupo otorga +2 puntos |

## Sistema de puntos

| Acción | Puntos |
|---|---|
| Tarea aprobada | +7 |
| Tarea propuesta | +3 |
| Apunte aprobado | +5 |
| Apunte propuesto | +2 |
| Recurso aprobado | +2 |
| Recurso propuesto | +1 |
| Pregunta anónima respondida | +2 |
| Pregunta anónima enviada | +1 |
| Recordatorio aprobado | +1 |

## Licencia

[MIT](LICENSE)
