// sistema de preguntas del día

const { saveQuestion, getQuestions, updateQuestion, incrementStat, getDailyQuestions, saveDailyQuestions } = require('./storage');

/**
 * Picks a random question from the daily-questions pool, removes it from the
 * file, sends it to the group and registers it in questions.json so answers
 * can still be tracked and scored.
 *
 * Returns true if a question was sent, false if the pool is empty.
 */
async function sendScheduledQuestion(client, config) {
  const pool = getDailyQuestions();
  if (!pool.length) {
    console.log('[DAILY QUESTION] No hay preguntas disponibles en el banco.');
    return false;
  }

  const idx = Math.floor(Math.random() * pool.length);
  const questionText = pool[idx];
  pool.splice(idx, 1);
  saveDailyQuestions(pool);

  const entry = saveQuestion({
    question: questionText,
    askedBy:  'bot',
    askedByName: 'Bot',
  });

  const { message = '🤔 *Pregunta del día:*\n\n{question}\n\n_Responde citando este mensaje para ganar puntos._' } = config.dailyQuestions;
  const groupText = message.replace('{question}', questionText);

  const sentMsg = await client.sendMessage(config.groupId, groupText);
  updateQuestion(entry.id, { groupMsgId: sentMsg.id._serialized });

  console.log(`[DAILY QUESTION] Enviada: "${questionText.slice(0, 60)}…"`);
  return true;
}

/**
 * Intenta procesar una respuesta a una pregunta anónima.
 * El usuario debe haber citado (reply) el mensaje del bot en el grupo.
 *
 * Retorna un objeto con el resultado:
 *   { status: 'no_quote' | 'not_a_question' | 'already_answered' | 'incoherent' | 'accepted'... }
 */
async function processAnswer(msg, responderNumber, responderName, answerText) {
  if (!msg.hasQuotedMsg) return { status: 'no_quote' };

  const quoted = await msg.getQuotedMessage();
  const question = getQuestions().find(q => q.groupMsgId === quoted.id._serialized);
  if (!question) return { status: 'not_a_question' };

  const alreadyAnswered = !!question.acceptedAnswer;

  const coherenceResult = checkCoherence(answerText);

  if (!coherenceResult.isCoherent) {
    return { status: 'incoherent', reason: coherenceResult.reason, question: question.question };
  }

  if (alreadyAnswered) {
    // Guardar como respuesta adicional (sin puntos)
    const extras = question.extraAnswers || [];
    extras.push({ by: responderNumber, byName: responderName, text: answerText, at: new Date().toISOString() });
    updateQuestion(question.id, { extraAnswers: extras });

    return {
      status: 'already_answered',
      question: question.question,
      firstAnswerer: question.acceptedAnswer.byName || question.acceptedAnswer.by,
    };
  }

  const acceptedAnswer = {
    by: responderNumber,
    byName: responderName,
    text: answerText,
    at: new Date().toISOString(),
  };
  updateQuestion(question.id, {
    acceptedAnswer,
    answeredAt: new Date().toISOString(),
  });
  incrementStat(responderNumber, responderName, 'questionsAnswered');

  return {
    status: 'accepted',
    question: question.question,
    questionId: question.id,
  };
}

/**
 * Valida que la respuesta tenga más de 5 caracteres (descarta monosílabos y "no sé").
 */
function checkCoherence(answer) {
  const cleaned = answer.trim();
  if (cleaned.length <= 5) {
    return { isCoherent: false, reason: 'Escribe algo más elaborado.' };
  }
  return { isCoherent: true };
}

/**
 * Genera el listado de preguntas recientes con sus respuestas.
 */
function buildQuestionsList(limit = 10) {
  const questions = getQuestions()
    .slice(-limit)
    .reverse(); // más recientes primero

  if (!questions.length) {
    return '🤔 No hay preguntas del día registradas todavía.';
  }

  const lines = questions.map((q, i) => {
    const status = q.acceptedAnswer ? '✅ Respondida' : '⏳ Sin respuesta';
    const answer = q.acceptedAnswer
      ? `   💬 *R:* ${q.acceptedAnswer.text}\n   👤 Por: ${q.acceptedAnswer.byName || 'Anónimo'}`
      : `   ⚬ _Se el primero en responder citando la pregunta._`;
    const extras = q.extraAnswers?.length
      ? `\n   📎 +${q.extraAnswers.length} respuesta(s) adicional(es)`
      : '';
    return `${status} — *P:* ${q.question}\n${answer}${extras}`;
  });

  return `🤔 *Preguntas del día recientes:*\n\n${lines.join('\n\n')}`;
}

module.exports = { sendScheduledQuestion, processAnswer, buildQuestionsList };
