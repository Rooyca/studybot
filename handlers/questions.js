// sistema de preguntas del día

const { saveQuestion, getQuestions, updateQuestion, incrementStat, getDailyQuestions, saveDailyQuestions } = require('./storage');

// ─── Difficulty → points mapping ──────────────────────────────────────────────

const DIFFICULTY_LABELS = { easy: '🟢 Fácil', normal: '🟡 Normal', hard: '🔴 Difícil' };
const DIFFICULTY_POINTS = { easy: 2, normal: 3, hard: 4 };

/**
 * Normalises a user-supplied difficulty string to 'easy' | 'normal' | 'hard'.
 * Returns null if unrecognised.
 */
function parseDifficulty(raw) {
  const s = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['facil', 'easy', 'f', 'e'].includes(s))        return 'easy';
  if (['normal', 'media', 'medio', 'n', 'm'].includes(s)) return 'normal';
  if (['dificil', 'hard', 'h', 'd'].includes(s))      return 'hard';
  return null;
}

// ─── Similarity helpers ────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','unos','unas','de','del','al','a','en','y','o',
  'que','es','son','se','su','sus','por','para','con','sin','pero','como','más',
  'no','sí','si','hay','lo','le','les','me','mi','te','tu','nos','esto','esta',
  'este','eso','esa','ese','entre','sobre','cada','solo','ser','una','fue','han',
  'has','he','ya','bien','también','donde','cuando','porque','aunque','mientras',
  'sino','muy','todo','todos','toda','todas','otro','otra','otros','otras','qué',
  'cuál','cuáles','cómo','quién','quiénes','dónde','cuándo','cuánto','tanto',
  'tener','puede','pueden','hacer','tiene','tienen',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function computeSimilarity(studentAnswer, correctAnswer) {
  const correctTokens = tokenize(correctAnswer);
  if (!correctTokens.length) return 1;
  const studentTokens = new Set(tokenize(studentAnswer));
  const matches = correctTokens.filter(t => studentTokens.has(t)).length;
  return matches / correctTokens.length;
}

const SIMILARITY_THRESHOLD = 0.25;

// ─── Core functions ────────────────────────────────────────────────────────────

/**
 * Picks a random question from the daily-questions pool, removes it from the
 * file, sends it to the group and registers it in questions.json.
 *
 * Pool entries are objects: { question, answer, difficulty }
 * Returns true if a question was sent, false if the pool is empty.
 */
async function sendScheduledQuestion(client, config) {
  const pool = getDailyQuestions();
  if (!pool.length) {
    console.log('[DAILY QUESTION] No hay preguntas disponibles en el banco.');
    return false;
  }

  const idx   = Math.floor(Math.random() * pool.length);
  const entry = pool[idx];

  // Backward-compat: plain strings have no difficulty
  const questionText  = typeof entry === 'string' ? entry        : entry.question;
  const correctAnswer = typeof entry === 'string' ? ''           : (entry.answer     || '');
  const difficulty    = typeof entry === 'string' ? 'normal'     : (entry.difficulty || 'normal');
  const points        = DIFFICULTY_POINTS[difficulty] ?? 2;

  pool.splice(idx, 1);
  saveDailyQuestions(pool);

  const saved = saveQuestion({ question: questionText, correctAnswer, difficulty, points, askedBy: 'bot', askedByName: 'Bot' });

  const diffLabel = DIFFICULTY_LABELS[difficulty];
  const { message = '🤔 *Pregunta del día:*\n\n{question}\n\n_Responde citando este mensaje para ganar puntos._' } = config.dailyQuestions;
  const groupText = message.replace('{question}', `${questionText}\n\n${diffLabel} — *${points} pts*`);

  const sentMsg = await client.sendMessage(config.groupId, groupText);
  updateQuestion(saved.id, { groupMsgId: sentMsg.id._serialized });

  console.log(`[DAILY QUESTION] Enviada [${difficulty}/${points}pts]: "${questionText.slice(0, 60)}…"`);
  return true;
}

/**
 * Attempts to process a reply to a daily question.
 *
 * Returns:
 *   { status: 'no_quote' | 'not_a_question' | 'incoherent' |
 *             'wrong_answer' | 'already_answered' | 'accepted', points? }
 */
async function processAnswer(msg, responderNumber, responderName, answerText) {
  if (!msg.hasQuotedMsg) return { status: 'no_quote' };

  const quoted   = await msg.getQuotedMessage();
  const question = getQuestions().find(q => q.groupMsgId === quoted.id._serialized);
  if (!question) return { status: 'not_a_question' };

  if (answerText.trim().length <= 1) {
    return { status: 'incoherent', reason: 'Escribe algo más elaborado.', question: question.question };
  }

  if (question.correctAnswer) {
    const similarity = computeSimilarity(answerText, question.correctAnswer);
    if (similarity < SIMILARITY_THRESHOLD) {
      return {
        status:        'wrong_answer',
        question:      question.question,
        correctAnswer: question.correctAnswer,
        similarity,
      };
    }
  }

  if (question.acceptedAnswer) {
    const extras = question.extraAnswers || [];
    extras.push({ by: responderNumber, byName: responderName, text: answerText, at: new Date().toISOString() });
    updateQuestion(question.id, { extraAnswers: extras });
    return {
      status:        'already_answered',
      question:      question.question,
      firstAnswerer: question.acceptedAnswer.byName || question.acceptedAnswer.by,
    };
  }

  const points = question.points ?? DIFFICULTY_POINTS[question.difficulty] ?? 2;

  updateQuestion(question.id, {
    acceptedAnswer: { by: responderNumber, byName: responderName, text: answerText, at: new Date().toISOString() },
    answeredAt: new Date().toISOString(),
  });
  // Track count and accumulate variable points separately
  incrementStat(responderNumber, responderName, 'questionsAnswered');
  incrementStat(responderNumber, responderName, 'questionPoints', points);

  return { status: 'accepted', question: question.question, questionId: question.id, points };
}

/**
 * Builds the recent daily-questions list with their answers and difficulty.
 */
function buildQuestionsList(limit = 5) {
  const questions = getQuestions().slice(-limit).reverse();

  if (!questions.length) return '🤔 No hay preguntas del día registradas todavía.';

  const lines = questions.map(q => {
    const diff   = q.difficulty || 'normal';
    const pts    = q.points ?? DIFFICULTY_POINTS[diff] ?? 2;
    const label  = DIFFICULTY_LABELS[diff] || diff;
    const status = q.acceptedAnswer ? '✅ Respondida' : '⏳ Sin respuesta';

    const userAnswer = q.acceptedAnswer
      ? `   💬 *R (estudiante):* ${q.acceptedAnswer.text}\n   👤 Por: ${q.acceptedAnswer.byName || 'Anónimo'}`
      : `   ⚬ _Sé el primero en responder citando la pregunta._`;
    const correctLine = q.correctAnswer ? `\n   📖 *R (correcta):* ${q.correctAnswer}` : '';
    const extras = q.extraAnswers?.length ? `\n   📎 +${q.extraAnswers.length} respuesta(s) adicional(es)` : '';

    return `${status} ${label} *(${pts} pts)* — *P:* ${q.question}\n${userAnswer}${correctLine}${extras}`;
  });

  return `🤔 *Preguntas del día recientes:*\n\n${lines.join('\n\n')}`;
}

module.exports = { sendScheduledQuestion, processAnswer, buildQuestionsList, parseDifficulty, DIFFICULTY_POINTS, DIFFICULTY_LABELS };
