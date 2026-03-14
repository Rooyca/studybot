// inactivity warning & auto-removal

const { getActivity, write, setWarnedAt, log } = require('./storage');

const MS_PER_DAY = 86400000;

/**
 * Runs the daily inactivity check.
 *
 * Flow:
 *   1. User hasn't sent a message for >= warnAfterDays (default 30) → DM warning + record warnedAt.
 *   2. User was already warned AND still hasn't sent a message for >= removeAfterDays (default 7)
 *      since the warning → remove from group.
 *
 * @param {import('whatsapp-web.js').Client} client
 * @param {object} config
 */
async function checkInactivity(client, config) {
  const cfg = config.activityCheck;
  if (!cfg || !cfg.enabled) return;

  const { warnAfterDays = 30, removeAfterDays = 7, warningMessage, removalMessage } = cfg;
  const now = Date.now();

  const activity = getActivity();

  for (const [number, entry] of Object.entries(activity)) {
    const lastSeenMs = new Date(entry.lastSeen).getTime();
    const daysSinceMsg = (now - lastSeenMs) / MS_PER_DAY;

    if (entry.warnedAt) {
      // Already warned — check if grace period expired
      const warnedMs = new Date(entry.warnedAt).getTime();
      const daysSinceWarn = (now - warnedMs) / MS_PER_DAY;

      if (daysSinceWarn >= removeAfterDays) {
        await removeInactiveUser(client, config, number, entry.name, removalMessage);
      }
    } else if (daysSinceMsg >= warnAfterDays) {
      // Not yet warned — send warning DM
      await warnInactiveUser(client, number, entry.name, warnAfterDays, warningMessage);
    }
  }
}

/**
 * Prunes activity data older than 90 days to prevent unbounded growth.
 * Should be called weekly.
 */
function pruneActivityData() {
  const activity = getActivity();
  const cutoffMs = Date.now() - (90 * MS_PER_DAY);
  
  let removed = 0;
  const pruned = {};
  
  for (const [number, entry] of Object.entries(activity)) {
    const lastSeenMs = new Date(entry.lastSeen).getTime();
    if (lastSeenMs > cutoffMs) {
      pruned[number] = entry;
    } else {
      removed++;
    }
  }
  
  if (removed > 0) {
    write('activity', pruned);
    console.log(`[ACTIVITY] Pruned ${removed} inactive users (>90 days)`);
    log('activity_pruned', { removedCount: removed });
  }
}

async function warnInactiveUser(client, number, name, warnAfterDays, template) {
  const chatId = `${number}@c.us`;
  const text = (template || '⚠️ Hola {name}, llevas más de {days} días sin enviar mensajes en el grupo de estudio. Si no envías un mensaje en los próximos 7 días serás removido del grupo.')
    .replace('{name}', name)
    .replace('{days}', warnAfterDays);

  try {
    await client.sendMessage(chatId, text);
    setWarnedAt(number);
    log('inactivity_warning', { user: number, name });
    console.log(`[ACTIVITY] Warning sent to ${name} (${number})`);
  } catch (err) {
    console.error(`[ACTIVITY] Could not warn ${number}:`, err.message);
  }
}

async function removeInactiveUser(client, config, number, name, template) {
  try {
    const groupChat = await client.getChatById(config.groupId);

    // Notify user via DM before removal
    const text = (template || '👋 Hola {name}, has sido removido del grupo de estudio por inactividad (más de 30 días sin enviar mensajes). Puedes volver a unirte cuando quieras.')
      .replace('{name}', name);

    try {
      await client.sendMessage(`${number}@c.us`, text);
    } catch (_) { /* DM may fail if user blocked bot */ }

    await groupChat.removeParticipants([`${number}@c.us`]);
    log('inactivity_removal', { user: number, name });
    console.log(`[ACTIVITY] Removed inactive user ${name} (${number})`);
  } catch (err) {
    console.error(`[ACTIVITY] Could not remove ${number}:`, err.message);
  }
}

module.exports = { checkInactivity, pruneActivityData };
