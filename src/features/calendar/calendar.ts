import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import * as fs from 'fs/promises';
import * as path from 'path';

const TOKENS_FILE = 'tokens.json';

interface TokenStorage {
  [userId: string]: any;
}

// Types
export interface TimeInfo {
  hours: number;
  minutes: number;
}

export interface MeetingState {
  step: 'date' | 'time' | 'email' | 'duration' | 'description' | 'confirm';
  details: {
    date: Date | null;
    time?: string;
    duration?: number;
    attendees: string[];
    description?: string;
  };
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees: { email: string }[];
}

// Auth and Calendar Setup
export const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const userTokens = new Map<string, any>();
export const userMeetingStates = new Map<number, MeetingState>();

export type BotContext = Context & {
  message?: Message.TextMessage;
};

// Auth Functions
export function isUserAuthorized(userId: string | number): boolean {
  return userTokens.has(userId.toString());
}

export function startAuthProcess(userId: string | number): string {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: userId.toString(),
    prompt: 'consent select_account'
  });
  return authUrl;
}

// Add new functions for token management
export async function storeUserToken(userId: string | number, tokens: any, permanent: boolean = false) {
  userTokens.set(userId.toString(), tokens);
  
  if (permanent) {
    try {
      // Store in persistent storage (you'll need to implement this)
      await savePermanentToken(userId.toString(), tokens);
    } catch (error) {
      console.error('Error storing permanent token:', error);
    }
  }
}

async function savePermanentToken(userId: string, tokens: any) {
  try {
    // Read existing tokens
    let allTokens: TokenStorage = {};
    try {
      const data = await fs.readFile(TOKENS_FILE, 'utf8');
      allTokens = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty object
      allTokens = {};
    }

    // Add or update token
    allTokens[userId] = tokens;

    // Save back to file
    await fs.writeFile(TOKENS_FILE, JSON.stringify(allTokens, null, 2));
    console.log('Token saved successfully for user:', userId);
  } catch (error) {
    console.error('Error saving token:', error);
    throw error;
  }
}

export async function loadPermanentTokens() {
  try {
    // Check if file exists
    try {
      const data = await fs.readFile(TOKENS_FILE, 'utf8');
      const allTokens: TokenStorage = JSON.parse(data);
      
      // Load tokens into memory
      for (const [userId, tokens] of Object.entries(allTokens)) {
        userTokens.set(userId, tokens);
      }
      
      console.log('Permanent tokens loaded successfully');
    } catch (error) {
      // File doesn't exist or is invalid, start with empty state
      console.log('No permanent tokens found');
    }
  } catch (error) {
    console.error('Error loading permanent tokens:', error);
  }
}

// Utility Functions
export function validateEmail(email: string): string | null {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) ? email : null;
}

export function extractTime(message: string): TimeInfo | null {
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?/;
  const match = message.match(timePattern);
  
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const meridian = match[3]?.toLowerCase();

    if (meridian?.includes('p') && hours < 12) hours += 12;
    if (meridian?.includes('a') && hours === 12) hours = 0;

    return { hours, minutes };
  }

  return null;
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

  // Handle day names (e.g., next Monday)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lowerInput.includes(days[i])) {
      const targetDay = i;
      const date = new Date(today);
      let daysToAdd = targetDay - date.getDay();
      if (daysToAdd <= 0 || lowerInput.includes('next')) {
        daysToAdd += 7;
      }
      date.setDate(date.getDate() + daysToAdd);
      return date;
    }
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
      } else if (match[1].match(/^\d/)) {
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

export function isValidFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

// Meeting Intent Recognition
export function isMeetingRequest(message: string): boolean {
  const meetingKeywords = [
    /\b(schedule|set\s*up|book|arrange|plan)\b/i,
    /\b(list|show|view|get)\b/i,
    /\bmeeting\b/i,
    /\bcall\b/i,
    /\bappointment\b/i,
  ];
  return meetingKeywords.some(pattern => pattern.test(message));
}

export type MeetingAction = 'create' | 'list';

export function determineMeetingAction(message: string): MeetingAction {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.match(/\b(list|show|view|get)\b.*\b(meetings|schedule|calendar)\b/)) {
    return 'list';
  }
  return 'create';
} 