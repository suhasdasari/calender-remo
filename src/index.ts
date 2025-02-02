import * as dotenv from 'dotenv';
// Configure dotenv before any other imports
dotenv.config();

import { Telegraf, Context } from 'telegraf';
import { handleMessage } from './handlers/messageHandler';
import { startServer } from './server';
import { BotContext } from './types';
import { Message, Update } from 'telegraf/typings/core/types/typegram';
import { handleAuthCallback, handleAuthChoice } from './features/calendar/authHandler';
import { loadPermanentTokens } from './features/calendar/calendar';
import express from 'express';
import { Request, Response } from 'express';

// Check for required environment variables
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`ERROR: ${envVar} is not set in .env file`);
    process.exit(1);
  }
}

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);
const app = express();

// Remo's personality and system prompt
export const REMO_PERSONALITY = `You are Remo, a friendly and engaging AI assistant with a warm personality. Your responses should be:

1. Natural and conversational
2. Varied and non-repetitive
3. Empathetic and understanding
4. Occasionally playful but always professional
5. Concise but helpful

Key traits:
- Show genuine interest in the user
- Remember context from the conversation
- Use appropriate emojis naturally
- Vary your greetings and responses
- Match the user's energy level
- Ask follow-up questions when appropriate

You excel at both casual conversation and task-oriented assistance. While you can schedule meetings and manage calendars, you're also great at general chat and helping users feel heard.`;

// Start command
bot.command('start', async (ctx) => {
  await ctx.reply(
    "Hello! I'm Remo, your personal AI assistant. 👋\n\n" +
    "I can help you manage your meetings:\n\n" +
    "📅 Meeting Management:\n" +
    "• Schedule a new meeting\n" +
    "• Update meeting details\n" +
    "• Reschedule meetings\n" +
    "• Cancel meetings\n\n" +
    "Examples:\n" +
    "• 'Schedule a meeting tomorrow at 2pm'\n" +
    "• 'Update the description of today's 3pm meeting'\n" +
    "• 'Reschedule tomorrow's meeting to Friday'\n" +
    "• 'Cancel my 4pm meeting'\n\n" +
    "How can I assist you today?"
  );
});

// Handle all messages
bot.on('message', (ctx) => {
  if (ctx.message && 'text' in ctx.message) {
    return handleMessage(ctx);
  }
});

// Error handling
bot.catch((err: any) => {
  console.error('Bot error:', err);
});

// Update your existing OAuth callback endpoint
app.get('/oauth2callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;
  
  if (code && state) {
    await handleAuthCallback(code.toString(), state.toString(), bot.telegram);
    res.send(
      '<html><body style="text-align: center; font-family: Arial, sans-serif; padding: 50px;">' +
      '<h1>✅ Authorization Successful!</h1>' +
      '<p>Please return to the Telegram bot to choose your authorization preference.</p>' +
      '<p>You can close this window now.</p>' +
      '</body></html>'
    );
  } else {
    res.status(400).send(
      '<html><body style="text-align: center; font-family: Arial, sans-serif; padding: 50px;">' +
      '<h1>❌ Authorization Failed</h1>' +
      '<p>Please try again in the Telegram bot.</p>' +
      '</body></html>'
    );
  }
});

// Start the OAuth callback server with the Express app
startServer(app);

// Load permanent tokens when bot starts
loadPermanentTokens();

// Add auth callback handlers
bot.action(/auth_temp_.*/, async (ctx) => {
  await handleAuthChoice(ctx, false);
});

bot.action(/auth_perm_.*/, async (ctx) => {
  await handleAuthChoice(ctx, true);
});

// Start the bot
bot.launch().then(() => {
  console.log('Remo is online and ready to help! 🤖');
}).catch((err) => {
  console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 