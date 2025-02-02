import { google } from 'googleapis';
import { oauth2Client, userTokens, CalendarEvent } from './calendar';
import { extractTime, parseDateInput, validateEmail } from './meetingUtils';

export async function createMeeting(
  userId: string,
  attendeeEmail: string,
  duration: number,
  dateStr: string,
  timeStr: string,
  description?: string
): Promise<CalendarEvent | null> {
  // Validate user authorization
  const userToken = userTokens.get(userId);
  if (!userToken) {
    throw new Error('User not authorized');
  }

  // Validate attendee email
  if (!validateEmail(attendeeEmail)) {
    throw new Error('Invalid attendee email');
  }

  // Parse date
  const date = parseDateInput(dateStr);
  if (!date) {
    throw new Error('Invalid date format');
  }

  // Parse time
  const parsedTime = extractTime(timeStr);
  if (!parsedTime) {
    throw new Error('Invalid time format');
  }

  // Set start and end time
  const startTime = new Date(date);
  startTime.setHours(parsedTime.hours, parsedTime.minutes);

  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + duration);

  // Create calendar event
  oauth2Client.setCredentials(userToken);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `Meeting with ${attendeeEmail}`,
        description: description || `${duration} minute meeting scheduled via Remo`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC'
        },
        attendees: [{ email: attendeeEmail }],
        reminders: {
          useDefault: true
        }
      }
    });

    if (event.data) {
      return {
        id: event.data.id || '',
        summary: event.data.summary || '',
        description: event.data.description || '',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC'
        },
        attendees: [{ email: attendeeEmail }]
      };
    }
  } catch (error) {
    console.error('Error creating meeting:', error);
    throw error;
  }

  return null;
}

export async function handleMeetingCreation(
  userId: string,
  attendeeEmail: string,
  duration: number,
  dateStr: string,
  timeStr: string
): Promise<string> {
  try {
    const meeting = await createMeeting(userId, attendeeEmail, duration, dateStr, timeStr);
    if (meeting) {
      return `Meeting scheduled with ${attendeeEmail} for ${duration} minutes on ${new Date(meeting.start.dateTime).toLocaleString()}`;
    } else {
      return 'Failed to schedule the meeting. Please try again.';
    }
  } catch (error: any) {
    return `Error scheduling meeting: ${error.message}`;
  }
} 