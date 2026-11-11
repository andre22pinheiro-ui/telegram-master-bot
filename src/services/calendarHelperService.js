// src/services/calendarHelperService.js — Exportação Google Calendar, ICS & Parser Rápido de Agenda (RGPD-safe)
const formatCompactUtc = (d) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');

/**
 * Gera URL Google Calendar TEMPLATE sem vazar emails pessoais em claro nos logs/mensagens (RGPD).
 */
export function generateGoogleCalendarUrl(title, startDate, durationMinutes = 30, details = '') {
  const start = new Date(startDate);
  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const end = new Date(validStart.getTime() + (Number(durationMinutes) || 30) * 60 * 1000);
  const dates = `${formatCompactUtc(validStart)}/${formatCompactUtc(end)}`;
  const desc = details || 'Agendado no @AndrePinheirobot (Cloud-Native)';

  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(String(title || 'Evento Pessoal').trim())}` +
    `&dates=${dates}` +
    `&details=${encodeURIComponent(desc)}`
  );
}

/**
 * Gera conteúdo iCalendar (.ics) compatível com Google/Apple/Outlook.
 */
export function generateIcsContent(title, startDate, durationMinutes = 30, description = '') {
  const start = new Date(startDate);
  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const end = new Date(validStart.getTime() + (Number(durationMinutes) || 30) * 60 * 1000);
  const safeTitle = String(title || 'Evento').replace(/[\r\n]/g, ' ').trim();
  const safeDesc = String(description || 'Agendado via @AndrePinheirobot').replace(/[\r\n]/g, ' ');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grok Bot Cloud//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:evt-${Date.now()}@andrepinheirobot`,
    `DTSTAMP:${formatCompactUtc(new Date())}`,
    `DTSTART:${formatCompactUtc(validStart)}`,
    `DTEND:${formatCompactUtc(end)}`,
    `SUMMARY:${safeTitle}`,
    `DESCRIPTION:${safeDesc}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Parser rápido de frases de agenda (ex: "amanhã às 15h Pediatra Carolina").
 */
export function parseAgendaEventPhrase(phrase, now = new Date()) {
  if (!phrase || typeof phrase !== 'string') return null;
  const raw = phrase.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  let targetDate = new Date(now.getTime());
  let foundTime = null;
  let cleanTitle = raw;

  if (lower.startsWith('depois de amanhã') || lower.startsWith('depois de amanha')) {
    targetDate.setDate(now.getDate() + 2);
    cleanTitle = cleanTitle.replace(/^depois de amanh[aã]\s*(às|as)?\s*/i, '');
  } else if (lower.startsWith('amanhã') || lower.startsWith('amanha')) {
    targetDate.setDate(now.getDate() + 1);
    cleanTitle = cleanTitle.replace(/^amanh[aã]\s*(às|as)?\s*/i, '');
  } else if (lower.startsWith('hoje')) {
    cleanTitle = cleanTitle.replace(/^hoje\s*(às|as)?\s*/i, '');
  } else {
    const weekDays = [
      { names: ['domingo'], dayIdx: 0 },
      { names: ['segunda-feira', 'segunda'], dayIdx: 1 },
      { names: ['terça-feira', 'terca-feira', 'terça', 'terca'], dayIdx: 2 },
      { names: ['quarta-feira', 'quarta'], dayIdx: 3 },
      { names: ['quinta-feira', 'quinta'], dayIdx: 4 },
      { names: ['sexta-feira', 'sexta'], dayIdx: 5 },
      { names: ['sábado', 'sabado'], dayIdx: 6 }
    ];
    for (const wd of weekDays) {
      const matched = wd.names.find((n) => lower.startsWith(n));
      if (matched) {
        let diff = wd.dayIdx - now.getDay();
        if (diff <= 0) diff += 7;
        targetDate.setDate(now.getDate() + diff);
        cleanTitle = cleanTitle.replace(new RegExp(`^${matched}\\s*(às|as)?\\s*`, 'i'), '');
        break;
      }
    }

    const dateMatch = cleanTitle.match(/^dia\s+(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{2,4}))?\s*(às|as)?\s*/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10);
      const month = dateMatch[2] ? parseInt(dateMatch[2], 10) - 1 : now.getMonth();
      const yearRaw = dateMatch[3] ? parseInt(dateMatch[3], 10) : now.getFullYear();
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
      targetDate = new Date(year, month, day);
      cleanTitle = cleanTitle.replace(dateMatch[0], '');
    }
  }

  const timeMatch = cleanTitle.match(/(?:às|as|\s|^)(\d{1,2})(?:[:h](\d{2})|h)?(?:\s|$)/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      foundTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      cleanTitle = cleanTitle.replace(timeMatch[0], ' ').trim();
    }
  }

  cleanTitle = cleanTitle.replace(/^(às|as|para|de|em|com)\s+/i, '').trim() || 'Evento Pessoal';
  const [hh, mm] = (foundTime || '09:00').split(':').map((n) => parseInt(n, 10));
  targetDate.setHours(hh, mm, 0, 0);

  return {
    title: cleanTitle,
    date: `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`,
    time: foundTime || '09:00',
    startDate: targetDate
  };
}

export default {
  generateGoogleCalendarUrl,
  generateIcsContent,
  parseAgendaEventPhrase
};

