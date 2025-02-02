import { TimeInfo } from './meetingTypes';

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

export function parseDateInput(input: string): Date | null {
  const today = new Date();
  const lowerInput = input.toLowerCase();

  // Handle common expressions
  if (lowerInput.includes('today')) return today;
  if (lowerInput.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow;
  }

  // Handle various date formats
  const patterns = [
    // dd/mm or dd-mm
    /^(\d{1,2})[-\/](\d{1,2})(?:[-\/](\d{4}))?$/,
    // 3rd Feb, 3 Feb, etc.
    /^(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s*,?\s*(\d{4}))?$/i,
    // Feb 3rd, Feb 3, etc.
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?$/i
  ];

  for (const pattern of patterns) {
    const match = lowerInput.match(pattern);
    if (match) {
      let day: number, month: number, year = today.getFullYear();

      if (pattern.source.startsWith('^\\d')) {
        // dd/mm format
        day = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        if (match[3]) year = parseInt(match[3]);
      } else if (pattern.source.startsWith('^\\d')) {
        // 3rd Feb format
        day = parseInt(match[1]);
        month = getMonthNumber(match[2]);
        if (match[3]) year = parseInt(match[3]);
      } else {
        // Feb 3rd format
        month = getMonthNumber(match[1]);
        day = parseInt(match[2]);
        if (match[3]) year = parseInt(match[3]);
      }

      const date = new Date(year, month, day);
      return isValidFutureDate(date) ? date : null;
    }
  }

  return null;
}

function getMonthNumber(monthStr: string): number {
  const months: { [key: string]: number } = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };
  return months[monthStr.toLowerCase()] || 0;
}

export function extractTime(timeStr: string): TimeInfo | null {
  // Normalize the time string
  timeStr = timeStr.toLowerCase().replace(/\s+/g, '');
  
  // Handle 24-hour format (HH:mm)
  const militaryTimeMatch = timeStr.match(/^(\d{1,2}):?(\d{2})$/);
  if (militaryTimeMatch) {
    const hours = parseInt(militaryTimeMatch[1]);
    const minutes = parseInt(militaryTimeMatch[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes };
    }
  }

  // Handle 12-hour format with AM/PM
  const twelveHourMatch = timeStr.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (twelveHourMatch) {
    let hours = parseInt(twelveHourMatch[1]);
    const minutes = twelveHourMatch[2] ? parseInt(twelveHourMatch[2]) : 0;
    const isPM = twelveHourMatch[3] === 'pm';

    if (hours > 0 && hours <= 12 && minutes >= 0 && minutes < 60) {
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      return { hours, minutes };
    }
  }

  // Handle simple hour format (e.g., "9am", "2pm")
  const simpleMatch = timeStr.match(/^(\d{1,2})(am|pm)$/);
  if (simpleMatch) {
    let hours = parseInt(simpleMatch[1]);
    const isPM = simpleMatch[2] === 'pm';

    if (hours > 0 && hours <= 12) {
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      return { hours, minutes: 0 };
    }
  }

  return null;
} 