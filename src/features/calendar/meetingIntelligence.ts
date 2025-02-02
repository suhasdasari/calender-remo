import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { ComprehendClient, DetectSentimentCommand } from "@aws-sdk/client-comprehend";
import { bedrockRuntime, comprehend } from "../../config/aws";
import { calendar_v3 } from "googleapis";

interface MeetingContext {
    title: string;
    description: string;
    participants: string[];
    previousMeetings: calendar_v3.Schema$Event[];
    relatedDocuments: string[];
}

interface MeetingBrief {
    summary: string;
    keyPoints: string[];
    suggestedQuestions: string[];
    participantContext: Record<string, string>;
    relevantResources: string[];
}

interface ActionItem {
    description: string;
    assignee: string;
    dueDate: string;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed';
}

export class MeetingIntelligence {
    private calendar: calendar_v3.Calendar;

    constructor(calendarClient: calendar_v3.Calendar) {
        this.calendar = calendarClient;
    }

    async generateMeetingBrief(eventId: string): Promise<MeetingBrief> {
        // Get meeting context
        const context = await this.getMeetingContext(eventId);

        // Generate brief using Bedrock
        const prompt = {
            prompt: `Generate a comprehensive meeting brief for the following meeting:
                    Title: ${context.title}
                    Description: ${context.description}
                    Participants: ${context.participants.join(', ')}
                    
                    Previous meetings context:
                    ${context.previousMeetings.map(m => `- ${m.summary}: ${m.description}`).join('\n')}
                    
                    Related documents:
                    ${context.relatedDocuments.join('\n')}
                    
                    Generate:
                    1. Brief summary
                    2. Key points to discuss
                    3. Suggested questions
                    4. Context for each participant
                    5. Relevant resources`,
            max_tokens: 1000,
            temperature: 0.7
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
            return this.parseBriefResponse(result);
        } catch (error) {
            console.error("Error generating meeting brief:", error);
            throw error;
        }
    }

    private async getMeetingContext(eventId: string): Promise<MeetingContext> {
        // Get meeting details
        const event = await this.calendar.events.get({
            calendarId: 'primary',
            eventId: eventId
        });

        // Get previous meetings with same participants
        const previousMeetings = await this.getPreviousMeetings(event.data);

        // Get related documents (implement based on your document storage)
        const relatedDocuments = await this.getRelatedDocuments(event.data);

        return {
            title: event.data.summary || '',
            description: event.data.description || '',
            participants: this.extractParticipants(event.data),
            previousMeetings: previousMeetings,
            relatedDocuments: relatedDocuments
        };
    }

    private extractParticipants(event: calendar_v3.Schema$Event): string[] {
        return event.attendees?.map(attendee => attendee.email || '') || [];
    }

    private async getPreviousMeetings(event: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event[]> {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        try {
            const response = await this.calendar.events.list({
                calendarId: 'primary',
                timeMin: oneMonthAgo.toISOString(),
                timeMax: new Date().toISOString(),
                q: event.summary || undefined,
                singleEvents: true,
                orderBy: 'startTime'
            });

            return (response.data?.items || []) as calendar_v3.Schema$Event[];
        } catch (error) {
            console.error("Error fetching previous meetings:", error);
            return [];
        }
    }

    private async getRelatedDocuments(event: calendar_v3.Schema$Event): Promise<string[]> {
        // Implement based on your document storage system
        // This could search through Google Drive, SharePoint, etc.
        return [];
    }

    private parseBriefResponse(response: any): MeetingBrief {
        // Implement parsing logic based on your model's response format
        return {
            summary: response.summary || '',
            keyPoints: response.keyPoints || [],
            suggestedQuestions: response.suggestedQuestions || [],
            participantContext: response.participantContext || {},
            relevantResources: response.relevantResources || []
        };
    }

    async extractActionItems(transcript: string): Promise<ActionItem[]> {
        const prompt = {
            prompt: `Extract action items from the following meeting transcript:
                    "${transcript}"
                    For each action item, identify:
                    1. Description
                    2. Assignee
                    3. Due date (if mentioned)
                    4. Priority (high/medium/low)
                    Return as JSON array.`,
            max_tokens: 800,
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
            return result.actionItems || [];
        } catch (error) {
            console.error("Error extracting action items:", error);
            throw error;
        }
    }

    async analyzeMeetingSentiment(transcript: string): Promise<string> {
        const command = new DetectSentimentCommand({
            Text: transcript,
            LanguageCode: "en"
        });

        try {
            const response = await comprehend.send(command);
            return response.Sentiment || 'NEUTRAL';
        } catch (error) {
            console.error("Error analyzing sentiment:", error);
            throw error;
        }
    }
} 