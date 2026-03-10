// recordatorios y cron scheduling

const cron = require('node-cron');
const { getActiveReminders, getReminders } = require('./storage');
const { checkInactivity } = require('./activity');
const { sendScheduledQuestion } = require('./questions');

const TZ = 'America/Bogota';

function todayBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Diferencia en días entre una fecha objetivo y HOY en Bogotá
 */
function daysDiff(targetDate) {
  const todayStr  = todayBogota();
  const todayMs   = new Date(todayStr + 'T00:00:00').getTime();
  const targetMs  = new Date(targetDate + 'T00:00:00').getTime();
  return Math.round((targetMs - todayMs) / 86400000);
}

/**
 * Formatea "YYYY-MM-DD" → "DD/MM/YYYY"
 */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function fillTemplate(template, reminder) {
  return template
    .replace('{title}', reminder.title)
    .replace('{date}', formatDate(reminder.date))
    .replace('{description}', reminder.description || 'Sin descripción adicional');
}

async function checkAndSendReminders(client, config) {
  const reminders = getActiveReminders();
  const { reminderDays, messages, groupId } = config;
  for (const reminder of reminders) {
    const diff = daysDiff(reminder.date);
    let msg = null;
    if (diff === 4 && reminderDays.includes(4)) msg = fillTemplate(messages.reminder4days, reminder);
    if (diff === 2 && reminderDays.includes(2)) msg = fillTemplate(messages.reminder2days, reminder);
    // diff === 0 is handled separately by checkAndSendTodayReminders
    if (msg) {
      try { await client.sendMessage(groupId, msg); }
      catch (err) { console.error('[REMINDER ERROR]', err.message); }
    }
  }
}

/**
 * Sends the "today is due" reminder for every active reminder whose date is today.
 * Called multiple times throughout the day based on reminderTodayRepeat config.
 */
async function checkAndSendTodayReminders(client, config) {
  if (!config.reminderDays.includes(0)) return;
  const reminders = getActiveReminders();
  for (const reminder of reminders) {
    if (daysDiff(reminder.date) !== 0) continue;
    const msg = fillTemplate(config.messages.reminderToday, reminder);
    try { await client.sendMessage(config.groupId, msg); }
    catch (err) { console.error('[REMINDER TODAY ERROR]', err.message); }
  }
}

async function sendWeeklySummary(client, config) {
  const todayStr     = todayBogota();
  const todayMs      = new Date(todayStr + 'T00:00:00').getTime();
  const inSevenDays  = todayMs + 7 * 86400000;

  const upcoming = getReminders().filter(r => {
    const rMs = new Date(r.date + 'T00:00:00').getTime();
    return rMs >= todayMs && rMs <= inSevenDays;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!upcoming.length) {
    await client.sendMessage(config.groupId,
      '📅 *Resumen semanal*\n\n✅ No hay entregas programadas para esta semana. ¡Buena semana a todos! 💪'
    );
    return;
  }

  const lines = upcoming.map(r => {
    const diff = daysDiff(r.date);
    const when = diff === 0 ? '🚨 HOY' : diff === 1 ? '⚠️ Mañana' : `📅 En ${diff} días`;
    return `${when} — *${r.title}*\n   📅 ${formatDate(r.date)}\n   📝 ${r.description || '—'}`;
  });

  const msg = config.weeklySummary.message.replace('{entries}', lines.join('\n\n'));
  await client.sendMessage(config.groupId, msg);
}

function startCrons(client, config) {
  // 4-day and 2-day advance reminders at 8:00 AM
  cron.schedule('0 8 * * *', () => checkAndSendReminders(client, config), { timezone: TZ });

  const { dayOfWeek = 1, hour = 9 } = config.weeklySummary;
  cron.schedule(`0 ${hour} * * ${dayOfWeek}`, () => {
    if (config.weeklySummary.enabled) sendWeeklySummary(client, config);
  }, { timezone: TZ });

  // Daily inactivity check at 10:00
  cron.schedule('0 10 * * *', () => checkInactivity(client, config), { timezone: TZ });

  // "Today is due" reminders: repeated throughout the day
  const tr = config.reminderTodayRepeat;
  if (tr && tr.enabled && config.reminderDays.includes(0)) {
    const start = tr.startHour ?? 8;
    const end   = tr.endHour   ?? 20;
    const times = tr.times     ?? 1;
    const slotSize = (end - start) / times;

    for (let i = 0; i < times; i++) {
      const slotHour = start + i * slotSize + slotSize / 2;
      const h = Math.floor(slotHour);
      const m = Math.round((slotHour - h) * 60);
      cron.schedule(`${m} ${h} * * *`, () => {
        checkAndSendTodayReminders(client, config).catch(err =>
          console.error('[REMINDER TODAY ERROR]', err.message)
        );
      }, { timezone: TZ });
      console.log(`[REMINDER TODAY] Programado para las ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} (aviso ${i + 1}/${times})`);
    }
  }

  // Daily questions: spread evenly between startHour and endHour
  const dq = config.dailyQuestions;
  if (dq && dq.enabled && dq.questionsPerDay > 0) {
    const start = dq.startHour ?? 8;
    const end   = dq.endHour   ?? 20;
    const count = dq.questionsPerDay;
    const slotSize = (end - start) / count;

    for (let i = 0; i < count; i++) {
      const slotHour = start + i * slotSize + slotSize / 2;
      const h = Math.floor(slotHour);
      const m = Math.round((slotHour - h) * 60);
      cron.schedule(`${m} ${h} * * *`, () => {
        sendScheduledQuestion(client, config).catch(err =>
          console.error('[DAILY QUESTION ERROR]', err.message)
        );
      }, { timezone: TZ });
      console.log(`[DAILY QUESTION] Programada para las ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} (slot ${i + 1}/${count})`);
    }
  }
}

function parseReminderCommand(args) {
  const titleMatch = args.match(/"([^"]+)"/);
  if (!titleMatch) return { error: 'Pon el título entre comillas. Ej: "Entrega Taller 2"' };
  const title = titleMatch[1].trim();
  const rest = args.replace(`"${title}"`, '').trim().split(/\s+/);
  const dateStr = rest[0];
  const description = rest.slice(1).join(' ');
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: 'Fecha inválida. Usa formato YYYY-MM-DD' };
  if (isNaN(new Date(dateStr).getTime())) return { error: 'Fecha no válida.' };
  if (daysDiff(dateStr) < 0) return { error: 'No puedes agregar recordatorios con fecha pasada.' };
  return { title, date: dateStr, description };
}

module.exports = { startCrons, checkAndSendReminders, checkAndSendTodayReminders, sendWeeklySummary, parseReminderCommand, formatDate, daysDiff };
