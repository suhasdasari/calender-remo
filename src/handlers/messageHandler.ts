import { OpenAIApi, Configuration } from 'openai';
import type { BotContext } from '../types';
import { REMO_PERSONALITY } from '../index';
import { 
  isMeetingRequest,
  handleMeetingRequest,
  handleListMeetingsRequest,
  determineMeetingAction,
  userMeetingStates
} from '../features/calendar';
import { handleCalendarMessage } from './calendarHandler';

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

// Store conversation history
interface Conversation {
  messages: { role: 'user' | 'assistant' | 'system', content: string }[];
  lastUpdate: number;
}

const conversations = new Map<number, Conversation>();

// Greeting variations
const greetings = [
  "Hey! How's it going? 😊",
  "Hi there! What's on your mind today?",
  "Hello! How can I help you today? 💫",
  "Hey! Nice to see you! What's up? 😊",
  "Hi! How's your day going so far? ✨",
  "Hello there! What can I do for you today? 🌟",
];

async function handleChat(userId: number, userMessage: string): Promise<string> {
  // Get or initialize conversation
  let conversation = conversations.get(userId);
  if (!conversation) {
    conversation = {
      messages: [{ role: 'system', content: REMO_PERSONALITY }],
      lastUpdate: Date.now()
    };
  }

  // Add user message
  conversation.messages.push({ role: 'user', content: userMessage });

  try {
    // Get AI response
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: conversation.messages,
      temperature: 0.7,
      presence_penalty: 0.6,
      frequency_penalty: 0.5,
    });

    const response = completion.data.choices[0]?.message?.content || 
      "I'm having trouble understanding. Could you rephrase that?";

    conversation.messages.push({ role: 'assistant', content: response });
    conversation.lastUpdate = Date.now();
    conversations.set(userId, conversation);

    return response;
  } catch (error) {
    console.error('Error in chat:', error);
    return "I encountered an error. Could you try again?";
  }
}

// Clean up old conversations every hour
setInterval(() => {
  const now = Date.now();
  for (const [userId, conversation] of conversations.entries()) {
    if (now - conversation.lastUpdate > 3600000) { // 1 hour
      conversations.delete(userId);
    }
  }
}, 3600000);

// Handle incoming messages
export async function handleMessage(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      console.error('No user ID found in context');
      return;
    }

    const userMessage = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    if (!userMessage) {
      console.error('No text message found in context');
      return;
    }

    console.log('Processing message:', userMessage);

    // Check if there's an ongoing meeting scheduling
    const hasOngoingMeeting = userMeetingStates.get(userId);
    
    // Handle calendar-related messages or ongoing meeting scheduling
    if (isMeetingRequest(userMessage) || hasOngoingMeeting) {
      await handleCalendarMessage(ctx);
      return;
    }

    // Only handle as chat if no calendar-related activity
    const response = await handleChat(userId, userMessage);
    await ctx.reply(response);

  } catch (error) {
    console.error('Error in handleMessage:', error);
    await ctx.reply("I encountered an error. Please try again.");
  }
} 