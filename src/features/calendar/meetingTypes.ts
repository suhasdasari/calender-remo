export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
}

export interface TimeInfo {
  hours: number;
  minutes: number;
} 