# StudyBot 🤖📚

Bot de WhatsApp para grupos de estudio con recordatorios de entregas, seguimiento de tareas, compartir apuntes, compartir recursos, preguntas del día, moderación, FAQ y leaderboard. Construido con [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

> La interfaz y los comandos del bot están en español. Ver [README.en.md](README.en.md) para la versión en inglés.

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
| `reminderTodayRepeat` | Repetición del recordatorio de "hoy es el día" (`enabled`, `times`, `startHour`, `endHour`) |
| `weeklySummary` | Configuración del resumen semanal (día, hora, plantilla de mensaje) |
| `messages` | Plantillas de notificación de recordatorios (4 días, 2 días, hoy) |
| `wordWarnings` | Auto-advertencia por palabras prohibidas |
| `mute` | Duraciones de silencio (`defaultMinutes`, `maxMinutes`) y plantillas de mensajes |
| `welcome` | Mensaje de bienvenida para nuevos miembros |
| `dailyQuestions` | Preguntas del día (`enabled`, `questionsPerDay`, `startHour`, `endHour`, `message`) |
| `activityCheck` | Umbrales de advertencia y remoción por inactividad (`warnAfterDays`, `removeAfterDays`) |

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

### Banco de preguntas del día (`data/daily-questions.json`)

Cada entrada del banco es un objeto con la pregunta, su respuesta de referencia y la dificultad:

```json
[
  {
    "question": "¿Cuál es la diferencia entre un arreglo y una lista enlazada?",
    "answer": "Un arreglo almacena elementos contiguos en memoria con acceso por índice en O(1), mientras que una lista enlazada usa nodos con punteros.",
    "difficulty": "normal"
  }
]
```

- `question` — texto de la pregunta que el bot publicará en el grupo
- `answer` — respuesta correcta de referencia usada para validar las respuestas de los usuarios
- `difficulty` — nivel de dificultad: `easy`, `normal` o `hard`

| Dificultad | Puntos |
|---|---|
| `easy` (🟢 Fácil) | +2 |
| `normal` (🟡 Normal) | +3 |
| `hard` (🔴 Difícil) | +4 |

Cuando el bot publica una pregunta la elimina del banco. Las respuestas de los usuarios se validan por similitud de palabras clave contra `answer` (umbral 25 %). También podés agregar preguntas desde el chat con `!add-pregunta` sin necesidad de editar el archivo directamente.

## Comandos

> **Tip:** Los comandos toleran un espacio después del prefijo — `! tareas` funciona igual que `!tareas`. La mayoría también tienen alias cortos indicados junto al nombre completo.

### Públicos

| Comando | Descripción |
|---|---|
| `!ayuda` / `!help` | Mostrar los comandos disponibles |
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
| `!preguntas` | Ver preguntas del día recientes con sus respuestas |
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
| `!add-pregunta fácil\|normal\|difícil \| Pregunta \| Respuesta` | Agregar una pregunta al banco de preguntas del día |
| `!conf-premio Premio \| Puntos \| Patrocinador` | Configurar el premio del leaderboard |
| `!mutear [@usuario] [minutos] [motivo]` | Silenciar un usuario |
| `!desmutear [@usuario]` | Desilenciar un usuario |
| `!muteados` | Ver usuarios actualmente silenciados |
| `!inactivos` | Listar miembros inactivos hace ≥30 días |
| `!dar-puntos` `<id\|número\|@mención> N [motivo]` | Otorgar puntos extra a un usuario |
| `!usuarios` | Ver todos los usuarios registrados con sus IDs numéricos cortos y última actividad |
| `!msg` `[mensaje]` | Enviar un mensaje al grupo como el bot (solo desde chat privado con el bot) |
| `!todos [mensaje]` | Enviar un mensaje privado a todos los miembros no-admin del grupo |
| `!resumen-semanal` | Forzar el resumen semanal |
| `!test-recordatorios` | Forzar la revisión de recordatorios |
| `!test-actividad` | Forzar la revisión de inactividad |

## Comportamientos automáticos

| Comportamiento | Disparador |
|---|---|
| **Mensaje de bienvenida** | Se envía al grupo cuando se une un nuevo miembro |
| **Notificaciones de recordatorio** | Se envían al grupo a las 8:00 AM (Bogotá) en los días configurados antes de un vencimiento |
| **Recordatorio de "hoy es el día"** | Si `reminderTodayRepeat.enabled` está activo, el aviso de entrega para el mismo día se repite `times` veces distribuidas entre `startHour` y `endHour` |
| **Resumen semanal** | Se envía el día/hora configurados con todas las entregas de los próximos 7 días |
| **Preguntas del día** | El bot publica automáticamente `questionsPerDay` preguntas del banco (`daily-questions.json`) distribuidas a lo largo del día entre `startHour` y `endHour` |
| **Respuesta a pregunta del día** | Responder (citando) el mensaje de una pregunta del día compara la respuesta contra la respuesta correcta almacenada usando similitud de palabras clave. Si supera el umbral, otorga puntos variables según la dificultad al primero en responder correctamente: 🟢 fácil +2, 🟡 normal +3, 🔴 difícil +4. Respuestas incorrectas reciben la respuesta correcta como guía. Respuestas adicionales válidas se guardan como aportes extra sin puntos. |
| **Advertencias de palabras** | El bot advierte en el grupo si detecta una palabra prohibida |
| **Aplicación del silencio** | Los mensajes de usuarios silenciados son eliminados y reciben un aviso por privado |
| **Revisión de inactividad** | Se ejecuta diariamente a las 10:00 AM (Bogotá); advierte tras `warnAfterDays` días y remueve tras `removeAfterDays` días adicionales |
| **Auto-respuesta de FAQ** | Cuando un mensaje del grupo contiene una palabra clave que coincide con una entrada de FAQ, el bot responde automáticamente |
| **FAQ desde recordatorios** | Al agregar un recordatorio con `!recordatorio`, se crea automáticamente una entrada de FAQ con palabras clave extraídas del título y descripción. Al borrar el recordatorio, también se eliminan sus FAQs. |
| **Registro de actividad** | Cada mensaje en el grupo actualiza la fecha de última actividad del miembro. Cada miembro recibe un ID numérico corto y secuencial usado para apuntarlos en comandos como `!dar-puntos`. |

## Sistema de puntos

| Acción | Puntos |
|---|---|
| Tarea aprobada | +7 |
| Tarea propuesta | +3 |
| Apunte aprobado | +5 |
| Apunte propuesto | +2 |
| Recurso aprobado | +2 |
| Recurso propuesto | +1 |
| Pregunta del día respondida — 🟢 Fácil | +2 |
| Pregunta del día respondida — 🟡 Normal | +3 |
| Pregunta del día respondida — 🔴 Difícil | +4 |
| Pregunta del día agregada (vía `!add-pregunta`) | +1 |
| Recordatorio aprobado | +1 |

## Licencia

[MIT](LICENSE)
