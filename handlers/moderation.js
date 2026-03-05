// warnings de palabras + sistema de mute

const { isMuted, cleanExpiredMutes, log } = require('./storage');

/**
 * Formatea hora "HH:MM" desde un ISO string
 */
function formatTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
}

/**
 * Si el usuario está muteado, elimina su mensaje y lo avisa por privado.
 * Retorna true si estaba muteado.
 */
async function handleMutedMessage(msg, config) {
  const contact = await msg.getContact();
  const muteEntry = isMuted(contact.number);
  if (!muteEntry) return false;

  // Eliminar mensaje (solo si el bot es admin)
  try {
    await msg.delete(true); // true = borrar para todos
  } catch (err) {
    // No era admin o no pudo borrar — igual se avisa
    console.warn('[MUTE] No se pudo borrar mensaje:', err.message);
  }

  // Avisar al usuario en privado
  try {
    const chat = await msg.getChat();
    const warningText = config.mute.deletedMessage
      .replace('{until}', formatTime(muteEntry.until));
    await contact.sendMessage(warningText);
    log('mute_delete', { user: contact.number, name: contact.pushname });
  } catch (err) {
    console.error('[MUTE NOTIFY ERROR]', err.message);
  }

  return true;
}

/**
 * Revisa palabras monitoreadas y envía advertencia si aplica.
 * Retorna true si se encontró una palabra.
 */
async function handleWordWarning(msg, config) {
  if (!config.wordWarnings.enabled) return false;
  const text = (msg.body || '').toLowerCase();
  const found = config.wordWarnings.words.find(w =>
    new RegExp(`\\b${w.toLowerCase()}\\b`, 'i').test(text)
  );
  if (!found) return false;

  const contact = await msg.getContact();
  const userName = contact.pushname || contact.number;
  const warning = config.wordWarnings.message
    .replace('{user}', userName)
    .replace('{word}', found);

  try {
    await msg.reply(warning);
    log('word_warning', { user: contact.number, name: userName, word: found, snippet: text.substring(0, 80) });
    return true;
  } catch (err) {
    console.error('[WORD WARNING ERROR]', err.message);
    return false;
  }
}

/**
 * Pipeline de moderación completo.
 * Retorna true si el mensaje fue interceptado (muteado).
 */
async function runModeration(msg, config) {
  cleanExpiredMutes(); // limpiar expirados con cada mensaje
  const wasMuted = await handleMutedMessage(msg, config);
  if (wasMuted) return true;
  await handleWordWarning(msg, config);
  return false;
}

module.exports = { runModeration, formatTime };
