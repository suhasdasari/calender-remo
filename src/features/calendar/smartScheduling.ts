import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrockRuntime } from "../../config/aws";
import { calendar_v3 } from "googleapis";

interface MeetingRequest {
    description: string;
    participants: string[];
    duration?: number;
    timeframe?: string;
}

interface MeetingSlot {
    startTime: string;
    endTime: string;
    score: number;
    reason: string;
}

export class SmartScheduler {
    private calendar: calendar_v3.Calendar;

    constructor(calendarClient: calendar_v3.Calendar) {
        this.calendar = calendarClient;
    }

    async analyzeMeetingRequest(request: string): Promise<MeetingRequest> {
        const prompt = {
            prompt: `Analyze the following meeting request and extract key information:
                    "${request}"
                    Return a JSON object with:
                    - description: meeting description
                    - participants: list of participants mentioned
                    - duration: suggested duration in minutes
                    - timeframe: when the meeting should occur`,
            max_tokens: 500,
            temperature: 0
        };

        const command = new InvokeModelCommand({
            modelId: "anthropic.claude-v2",
            body: JSON.stringify(prompt),
            contentType: "application/json",
            accept: "application/json",
        });

        try {
            const response = await bedrockRuntime.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            return result;
        } catch (error) {
            console.error("Error analyzing meeting request:", error);
            throw error;
        }
    }

    async findOptimalSlots(request: MeetingRequest): Promise<MeetingSlot[]> {
        // Get participants' calendars for the specified timeframe
        const calendars = await Promise.all(
            request.participants.map(participant =>
                this.calendar.events.list({
                    calendarId: participant,
                    timeMin: new Date().toISOString(),
                    timeMax: this.getTimeMax(request.timeframe),
                    singleEvents: true,
                    orderBy: 'startTime',
                })
            )
        );

        // Extract events from response
        const events = calendars.map(calendar => calendar.data);

        // Analyze available slots
        const availableSlots = this.findAvailableSlots(events, request);
        
        // Score each slot based on various factors
        return this.scoreSlots(availableSlots, request);
    }

    private getTimeMax(timeframe: string | undefined): string {
        // Default to one week if timeframe not specified
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        return endDate.toISOString();
    }

    private findAvailableSlots(
        calendars: calendar_v3.Schema$Events[],
        request: MeetingRequest
    ): { start: Date; end: Date }[] {
        // Implementation to find common free slots
        // This is a simplified version - you would need to implement the actual logic
        return [];
    }

    private async scoreSlots(
        slots: { start: Date; end: Date }[],
        request: MeetingRequest
    ): Promise<MeetingSlot[]> {
        // Score slots based on:
        // 1. Time of day preferences
        // 2. Meeting patterns
        // 3. Participant availability
        // 4. Travel time if applicable
        return slots.map(slot => ({
            startTime: slot.start.toISOString(),
            endTime: slot.end.toISOString(),
            score: 0.8, // Implement actual scoring logic
            reason: "Optimal time based on participant preferences"
        }));
    }

    async suggestMeetingTime(request: string): Promise<MeetingSlot[]> {
        const analyzedRequest = await this.analyzeMeetingRequest(request);
        const optimalSlots = await this.findOptimalSlots(analyzedRequest);
        return optimalSlots;
    }
} 