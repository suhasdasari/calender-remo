import { Context } from 'telegraf';
import { CalendarEvent } from './features/calendar';
import { Update } from 'telegraf/typings/core/types/typegram';

export type BotContext = Context<Update>;

export interface ChatMessage {
  text: string;
  userId: number;
  username?: string;
}

export interface MeetingState {
  step: 'date' | 'time' | 'email' | 'duration' | 'description' | 'confirm' | 'confirm_cancel' | 'select_cancel';
  details: {
    date: Date | null;
    time?: string;
    duration?: number;
    attendees: string[];
    description?: string;
    meetingId?: string;
    meetings?: CalendarEvent[];
  };
} 