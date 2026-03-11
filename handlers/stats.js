// estadísticas y leaderboard

const { getLeaderboard, getStats, getPrize } = require('./storage');

const MEDALS = ['🥇', '🥈', '🥉'];
const LEADERBOARD_MAX_PTS = 100;

/**
 * Genera el mensaje del leaderboard
 */
function buildLeaderboard(limit = 5) {
  const board = getLeaderboard(limit);

  if (!board.length) {
    return '📊 *Leaderboard*\n\nAún no hay estadísticas registradas.\n\n_Las puntuaciones se acumulan cuando los usuarios proponen tareas y responden preguntas._';
  }

  const lines = board.map((user, i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    const pts   = user.totalPoints;
    const bar   = buildBar(pts);
    return (
      `${medal} *${user.name || user.number}*\n` +
      `${bar} ${pts} pts`
    );
  });

  const prize = getPrize();
  const prizeFooter = prize
    ? `\n🎁 *Premio:* ${prize.prize}\n🎯 Meta: ${prize.points} pts — _Patrocinado por ${prize.sponsor}_`
    : '';

  return `🏆 *Leaderboard — Top ${board.length}*\n\n${lines.join('\n\n')}\n${prizeFooter}`;
}

/**
 * Genera barra de progreso visual
 */
function buildBar(value) {
  const ratio = Math.min(1, Math.max(0, value / LEADERBOARD_MAX_PTS));
  const filled = Math.round(ratio * 5);
  return '▰'.repeat(filled) + '▱'.repeat(5 - filled);
}

/**
 * Genera el perfil de stats de un usuario individual
 * @param {string}  number — phone number
 * @param {boolean} isSelf — true when the caller is viewing their own stats
 */
function buildUserStats(number, isSelf = true) {
  const stats = getStats();
  const user  = stats[number];
  if (!user) return null;

  const board = getLeaderboard(100);
  const rank  = board.findIndex(u => u.number === number) + 1;

  const header = isSelf ? '📊 *Tus estadísticas*' : `📊 *Estadísticas de ${user.name || number}*`;

  return (
    `${header}\n\n` +
    `👤 ${user.name || number}\n` +
    `🏆 Posición: #${rank}\n` +
    `⭐ Puntos totales: ${user.totalPoints}\n\n` +
    `📚 Tareas propuestas: ${user.tasksProposed}\n` +
    `✅ Tareas aprobadas: ${user.tasksApproved}\n` +
    `📖 Apuntes aprobados: ${user.notesApproved}\n` +
    `💬 Preguntas respondidas: ${user.questionsAnswered}\n`
  );
}

module.exports = { buildLeaderboard, buildUserStats };
