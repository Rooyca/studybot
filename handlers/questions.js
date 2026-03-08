// sistema de preguntas anónimas

const { saveQuestion, getQuestions, updateQuestion, incrementStat } = require('./storage');

/**
 * Publica la pregunta en el grupo y guarda el groupMsgId devuelto.
 * Retorna la entrada guardada.
 */
async function publishQuestion(client, config, askerNumber, askerName, questionText) {
  const entry = saveQuestion({
    question: questionText,
    askedBy:  askerNumber,
    askedByName: askerName,
  });
  incrementStat(askerNumber, askerName, 'questionsAsked');

  const groupText =
    `🙋 *Pregunta anónima:*\n\n${questionText}\n\n` +
    `_Responde citando este mensaje para ganar puntos._`;

  // Guardar el ID del mensaje publicado para poder vincularlo cuando alguien responda
  const sentMsg = await client.sendMessage(config.groupId, groupText);
  updateQuestion(entry.id, { groupMsgId: sentMsg.id._serialized });

  return entry;
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
    return '🙋 No hay preguntas anónimas registradas todavía.';
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

  return `🙋 *Preguntas anónimas recientes:*\n\n${lines.join('\n\n')}`;
}

module.exports = { publishQuestion, processAnswer, buildQuestionsList };
