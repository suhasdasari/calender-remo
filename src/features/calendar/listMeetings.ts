import { Context } from 'telegraf';
import { google } from 'googleapis';
import {
  oauth2Client,
  userTokens,
  isUserAuthorized,
  startAuthProcess,
  parseDateInput,
  CalendarEvent
} from './calendar';

export async function listUpcomingEvents(
  userId: number,
  days: number = 7,
  startDate: Date = new Date(),
  endDate?: Date
): Promise<CalendarEvent[]> {
  try {
    const userToken = userTokens.get(userId.toString());
    if (!userToken) return [];

    oauth2Client.setCredentials(userToken);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const timeMin = startDate.toISOString();
    const timeMax = endDate ? 
      endDate.toISOString() : 
      new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items as CalendarEvent[];
  } catch (error) {
    console.error('Error listing events:', error);
    return [];
  }
}

export async function handleListMeetingsRequest(ctx: Context, userId: number): Promise<void> {
  try {
    if (!isUserAuthorized(userId)) {
      const authUrl = await startAuthProcess(userId);
      await ctx.reply(
        'Please authorize the bot to access your Google Calendar first:\n' + authUrl
      );
      return;
    }

    const userMessage = ctx.message && 'text' in ctx.message ? ctx.message.text.toLowerCase() : '';
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Extract date from message
    const dateMatch = userMessage.match(/(?:on|for|at)\s+([^,]+)(?:,|$)/i) ||
                     userMessage.match(/\b(tomorrow|today|next\s+\w+|\d{1,2}(?:st|nd|rd|th)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\b\d{1,2}[-\/]\d{1,2}(?:[-\/]\d{4})?)\b/i);

    if (dateMatch) {
      const parsedDate = parseDateInput(dateMatch[1].trim());
      if (parsedDate) {
        startDate = parsedDate;
        endDate = new Date(parsedDate);
        endDate.setHours(23, 59, 59, 999);
      }
    } else if (userMessage.includes('tomorrow')) {
      startDate.setDate(startDate.getDate() + 1);
      endDate.setDate(endDate.getDate() + 1);
    } else if (userMessage.includes('next week')) {
      startDate.setDate(startDate.getDate() + 7);
      endDate.setDate(endDate.getDate() + 7);
    } else if (userMessage.includes('month')) {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      // Check for day names (e.g., Monday, next Thursday)
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (const [index, day] of days.entries()) {
        if (userMessage.includes(day)) {
          const today = new Date();
          let daysToAdd = index - today.getDay();
          if (daysToAdd <= 0 || userMessage.includes('next')) {
            daysToAdd += 7;
          }
          startDate = new Date(today);
          startDate.setDate(today.getDate() + daysToAdd);
          endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        }
      }
    }

    const userToken = userTokens.get(userId.toString());
    oauth2Client.setCredentials(userToken);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items;
    if (!events || events.length === 0) {
      await ctx.reply('No meetings found for the specified time period.');
      return;
    }

    let responseMessage = '📅 Here are your meetings:\n\n';
    for (const event of events) {
      if (event.start?.dateTime) {
        const startTime = new Date(event.start.dateTime);
        const duration = event.end?.dateTime 
          ? Math.round((new Date(event.end.dateTime).getTime() - startTime.getTime()) / 60000)
          : 0;

        responseMessage += `🕒 ${startTime.toLocaleTimeString()} (${duration} mins)\n`;
        responseMessage += `📝 ${event.summary || 'Untitled'}\n`;
        if (event.attendees && event.attendees.length > 0) {
          responseMessage += `👥 With: ${event.attendees.map(a => a.email).join(', ')}\n`;
        }
        responseMessage += '\n';
      }
    }

    await ctx.reply(responseMessage);
  } catch (error) {
    console.error('Error listing meetings:', error);
    await ctx.reply('Sorry, I encountered an error while fetching your meetings. Please try again.');
  }
} 