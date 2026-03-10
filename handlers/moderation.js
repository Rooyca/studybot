// warnings de palabras + sistema de mute

const { isMuted, cleanExpiredMutes, log } = require('./storage');

let _wordRegexes = null;

function getWordRegexes(words) {
  if (!_wordRegexes) {
    _wordRegexes = words.map(w => ({ word: w, re: new RegExp(`\\b${w.toLowerCase()}\\b`, 'i') }));
  }
  return _wordRegexes;
}

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

  // Eliminar mensaje (solo si el bot es admin en el grupo)
  try {
    // msg.delete(true) puede fallar silenciosamente si canAdminRevokeMsg()
    // devuelve false porque el store del grupo aún no está cargado en caché.
    // Llamamos sendRevokeMsgs directamente para forzar la revocación como admin.
    const revoked = await msg.client.pupPage.evaluate(async (msgId) => {
      const message = window.Store.Msg.get(msgId)
        || (await window.Store.Msg.getMessagesById([msgId]))?.messages?.[0];
      if (!message) return false;
      const chat = window.Store.Chat.get(message.id.remote)
        || (await window.Store.Chat.find(message.id.remote));
      if (!chat) return false;
      try {
        if (window.compareWwebVersions(window.Debug.VERSION, '>=', '2.3000.0')) {
          await window.Store.Cmd.sendRevokeMsgs(
            chat, { list: [message], type: 'message' }, { clearMedia: true }
          );
        } else {
          await window.Store.Cmd.sendRevokeMsgs(
            chat, [message], { clearMedia: true, type: 'Admin' }
          );
        }
        return true;
      } catch (_) {
        return false;
      }
    }, msg.id._serialized);

    if (!revoked) {
      console.warn('[MUTE] No se pudo revocar el mensaje (¿el bot es admin del grupo?)');
    }
  } catch (err) {
    console.warn('[MUTE] Error al borrar mensaje:', err.message);
  }

  // Avisar al usuario en privado
  try {
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
  const match = getWordRegexes(config.wordWarnings.words).find(({ re }) => re.test(text));
  if (!match) return false;
  const found = match.word;

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
