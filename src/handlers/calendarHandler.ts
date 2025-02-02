import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { startAuthProcess, isMeetingRequest } from '../features/calendar/calendar';
import { handleMeetingRequest } from '../features/calendar/createMeeting';
import { handleListMeetingsRequest } from '../features/calendar/listMeetings';

export async function handleCalendarMessage(ctx: Context): Promise<void> {
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  // Check if it's a calendar auth callback
  if (messageText.startsWith('/auth')) {
    try {
      const authUrl = await startAuthProcess(userId);
      await ctx.reply(
        'Please authorize the bot to access your Google Calendar by clicking this link:\n' +
        authUrl
      );
    } catch (error) {
      console.error('Error starting auth process:', error);
      await ctx.reply('Error starting authorization process. Please try again.');
    }
    return;
  }

  // Handle meeting requests
  if (messageText.toLowerCase().match(/\b(list|show|view|get)\b/)) {
    await handleListMeetingsRequest(ctx, userId);
  } else {
    await handleMeetingRequest(ctx, userId, messageText);
  }
} 