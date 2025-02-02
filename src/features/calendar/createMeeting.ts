import { BotContext } from '../../types';
import { google } from 'googleapis';
import {
  MeetingState,
  oauth2Client,
  userTokens,
  userMeetingStates,
  isUserAuthorized,
  startAuthProcess,
  extractTime,
  parseDateInput,
  validateEmail
} from './calendar';
import { Context } from 'telegraf';
import { handleMeetingCreation } from './createMeetingService';

export async function createMeeting(
  userId: number,
  summary: string,
  description: string,
  startTime: Date,
  endTime: Date,
  attendees: string[]
): Promise<boolean> {
  try {
    const userToken = userTokens.get(userId.toString());
    if (!userToken) return false;

    oauth2Client.setCredentials(userToken);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        attendees: attendees.map(email => ({ email })),
        reminders: {
          useDefault: true
        }
      },
      sendUpdates: 'all'
    });

    return true;
  } catch (error) {
    console.error('Error creating meeting:', error);
    return false;
  }
}

function parseInitialMessage(message: string) {
  const details = {
    date: null as Date | null,
    time: undefined as string | undefined,
    attendees: [] as string[],
    duration: undefined as number | undefined,
    description: undefined as string | undefined
  };

  // Extract all information
  const attendeeMatch = message.match(/with\s+(\S+@\S+|\S+)/i);
  const durationMatch = message.match(/for\s+(\d+)\s*(?:min|minutes?)/i);
  const timeMatch = message.match(/at\s+(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/i);
  const dateMatch = message.match(/(?:on|for|tomorrow|today|next|this)\s*([^,]+)(?:,|$)/i) || 
                   (message.toLowerCase().includes('tomorrow') ? { 1: 'tomorrow' } : null) ||
                   (message.toLowerCase().includes('today') ? { 1: 'today' } : null);

  // Process each piece of information
  if (dateMatch) {
    const parsedDate = parseDateInput(dateMatch[1].trim());
    if (parsedDate) details.date = parsedDate;
  }

  if (timeMatch) {
    const timeInfo = extractTime(timeMatch[1]);
    if (timeInfo) {
      details.time = `${String(timeInfo.hours).padStart(2, '0')}:${String(timeInfo.minutes).padStart(2, '0')}`;
    }
  }

  if (attendeeMatch) {
    let email = attendeeMatch[1];
    if (!email.includes('@')) email += '@gmail.com';
    if (validateEmail(email)) details.attendees = [email];
  }

  if (durationMatch) {
    const duration = parseInt(durationMatch[1]);
    if (!isNaN(duration) && duration > 0) details.duration = duration;
  }

  return details;
}

export async function handleMeetingRequest(ctx: Context, userId: number, message: string): Promise<void> {
  if (!isUserAuthorized(userId)) {
    const authUrl = await startAuthProcess(userId);
    await ctx.reply(
      'Please authorize the bot to access your Google Calendar first:\n' + authUrl
    );
    return;
  }

  let state = userMeetingStates.get(userId);
  
  // Check for cancellation
  if (message.toLowerCase().match(/\b(cancel|stop|exit)\b/)) {
    if (state) {
      userMeetingStates.delete(userId);
      await ctx.reply("Meeting scheduling cancelled. Let me know when you want to schedule another meeting!");
    }
    return;
  }

  // Handle initial message
  if (!state) {
    const details = parseInitialMessage(message);
    state = {
      step: 'date',
      details: {
        ...details,
        duration: details.duration || 30 // default duration if not provided
      }
    };

    // Determine the next required information
    if (!state.details.date) {
      state.step = 'date';
    } else if (!state.details.time) {
      state.step = 'time';
    } else if (state.details.attendees.length === 0) {
      state.step = 'email';
    } else if (!state.details.duration) {
      state.step = 'duration';
    } else {
      state.step = 'confirm';
    }

    // If we have all required information, go to confirmation
    if (state.details.date && state.details.time && 
        state.details.attendees.length > 0 && state.details.duration) {
      state.step = 'confirm';
      await ctx.reply(
        `Please confirm these meeting details:\n\n` +
        `📅 Date: ${state.details.date.toLocaleDateString()}\n` +
        `⏰ Time: ${state.details.time}\n` +
        `👥 With: ${state.details.attendees[0]}\n` +
        `⏱️ Duration: ${state.details.duration} minutes\n` +
        `📝 Description: No description\n\n` +
        `Is this correct? (Reply with 'yes' to confirm or 'no' to start over)`
      );
      userMeetingStates.set(userId, state);
      return;
    }

    // Ask for the next required information
    switch (state.step) {
      case 'date':
        await ctx.reply("When would you like to schedule the meeting? (e.g., today, tomorrow, next Monday, Feb 3)");
        break;
      case 'time':
        await ctx.reply('What time would you like to schedule the meeting? (e.g., 2:30 PM)');
        break;
      case 'email':
        await ctx.reply('Who would you like to meet with? (Please provide their email)');
        break;
      case 'duration':
        await ctx.reply('How long should the meeting be? (e.g., 30 minutes)');
        break;
    }

    userMeetingStates.set(userId, state);
    return;
  }

  // Handle ongoing conversation
  switch (state.step) {
    case 'date':
      const date = parseDateInput(message);
      if (date) {
        state.details.date = date;
        state.step = state.details.time ? 'email' : 'time';
        await ctx.reply(state.details.time ? 
          'Who would you like to meet with? (Please provide their email)' :
          'What time would you like to schedule the meeting? (e.g., 2:30 PM)');
      } else {
        await ctx.reply('Please provide a valid date (e.g., today, tomorrow, next Monday, Feb 3).');
      }
      break;

    case 'time':
      const timeInfo = extractTime(message);
      if (timeInfo) {
        state.details.time = `${String(timeInfo.hours).padStart(2, '0')}:${String(timeInfo.minutes).padStart(2, '0')}`;
        state.step = state.details.attendees.length > 0 ? 'duration' : 'email';
        await ctx.reply(state.details.attendees.length > 0 ?
          'How long should the meeting be? (e.g., 30 minutes)' :
          'Who would you like to meet with? (Please provide their email)');
      } else {
        await ctx.reply('Please provide a valid time (e.g., 2:30 PM).');
      }
      break;

    case 'email':
      if (validateEmail(message)) {
        state.details.attendees = [message];
        state.step = state.details.duration ? 'description' : 'duration';
        await ctx.reply(state.details.duration ?
          'Would you like to add a description for the meeting? (Type "skip" to skip)' :
          'How long should the meeting be? (e.g., 30 minutes)');
      } else {
        await ctx.reply('Please provide a valid email address.');
      }
      break;

    case 'duration':
      const duration = parseInt(message);
      if (!isNaN(duration) && duration > 0) {
        state.details.duration = duration;
        state.step = 'description';
        await ctx.reply('Would you like to add a description for the meeting? (Type "skip" to skip)');
      } else {
        await ctx.reply('Please provide a valid duration in minutes (e.g., 30).');
      }
      break;

    case 'description':
      if (message.toLowerCase() !== 'skip') {
        state.details.description = message;
      }
      state.step = 'confirm';
      await ctx.reply(
        `Please confirm these meeting details:\n\n` +
        `📅 Date: ${state.details.date?.toLocaleDateString()}\n` +
        `⏰ Time: ${state.details.time}\n` +
        `👥 With: ${state.details.attendees[0]}\n` +
        `⏱️ Duration: ${state.details.duration} minutes\n` +
        `📝 Description: ${state.details.description || 'No description'}\n\n` +
        `Is this correct? (Reply with 'yes' to confirm or 'no' to start over)`
      );
      break;

    case 'confirm':
      if (message.toLowerCase() === 'yes') {
        try {
          const startTime = new Date(state.details.date!);
          const [hours, minutes] = state.details.time!.split(':').map(Number);
          startTime.setHours(hours, minutes);
          const endTime = new Date(startTime.getTime() + (state.details.duration! * 60000));

          const success = await createMeeting(
            userId,
            `Meeting with ${state.details.attendees[0].split('@')[0]}`,
            state.details.description || 'Meeting scheduled via Remo',
            startTime,
            endTime,
            state.details.attendees
          );

          if (success) {
            await ctx.reply('✅ Meeting scheduled successfully! Calendar invite has been sent to all attendees.');
          } else {
            await ctx.reply('Sorry, I couldn\'t schedule the meeting. Please try again.');
          }
          userMeetingStates.delete(userId);
        } catch (error: any) {
          await ctx.reply(`Error scheduling meeting: ${error.message}`);
        }
      } else {
        userMeetingStates.delete(userId);
        await ctx.reply('No problem, let\'s start over. Just let me know when you want to schedule a meeting.');
      }
      break;
  }

  userMeetingStates.set(userId, state);
} 