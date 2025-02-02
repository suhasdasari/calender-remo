import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { bedrockRuntime, docClient } from "../../config/aws";
import { calendar_v3 } from "googleapis";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

interface TimeAnalysis {
    meetingDistribution: {
        technical: number;
        planning: number;
        clientCalls: number;
        teamSync: number;
    };
    productiveHours: string[];
    overScheduledDays: string[];
    recommendations: string[];
}

interface MeetingScore {
    meetingId: string;
    score: number;
    metrics: {
        attendance: number;
        agendaCoverage: number;
        actionItems: number;
        timeManagement: number;
    };
    feedback: string[];
}

interface ProductivityInsight {
    weeklyPatterns: {
        bestMeetingTimes: string[];
        focusTimeBlocks: string[];
        collaborationSlots: string[];
    };
    recommendations: {
        schedule: string[];
        collaboration: string[];
        timeManagement: string[];
    };
}

export class CalendarAnalytics {
    private calendar: calendar_v3.Calendar;
    private readonly TABLE_NAME = "meeting-analytics";

    constructor(calendarClient: calendar_v3.Calendar) {
        this.calendar = calendarClient;
    }

    async analyzeTimeManagement(startDate: Date, endDate: Date): Promise<TimeAnalysis> {
        // Fetch calendar events for the specified period
        const events = await this.getEvents(startDate, endDate);
        
        // Analyze meeting patterns
        const meetingTypes = await this.categorizeMeetings(events);
        
        // Generate insights using Bedrock
        const prompt = {
            prompt: `Analyze the following calendar data and provide insights:
                    Meeting Categories:
                    ${JSON.stringify(meetingTypes)}
                    
                    Generate:
                    1. Meeting distribution analysis
                    2. Productive hours identification
                    3. Schedule optimization recommendations`,
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
            return this.parseTimeAnalysis(result);
        } catch (error) {
            console.error("Error analyzing time management:", error);
            throw error;
        }
    }

    private async getEvents(startDate: Date, endDate: Date): Promise<calendar_v3.Schema$Event[]> {
        const response = await this.calendar.events.list({
            calendarId: 'primary',
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
        });

        return response.data.items || [];
    }

    private async categorizeMeetings(events: calendar_v3.Schema$Event[]): Promise<Record<string, number>> {
        const categories: Record<string, number> = {
            technical: 0,
            planning: 0,
            clientCalls: 0,
            teamSync: 0
        };

        for (const event of events) {
            const category = await this.classifyMeeting(event);
            categories[category] = (categories[category] || 0) + 1;
        }

        return categories;
    }

    private async classifyMeeting(event: calendar_v3.Schema$Event): Promise<string> {
        const prompt = {
            prompt: `Classify the following meeting into one category (technical, planning, clientCalls, teamSync):
                    Title: ${event.summary}
                    Description: ${event.description}
                    Attendees: ${event.attendees?.map(a => a.email).join(', ')}`,
            max_tokens: 100,
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
            return result.category;
        } catch (error) {
            console.error("Error classifying meeting:", error);
            return "other";
        }
    }

    private parseTimeAnalysis(result: any): TimeAnalysis {
        return {
            meetingDistribution: result.distribution || {
                technical: 0,
                planning: 0,
                clientCalls: 0,
                teamSync: 0
            },
            productiveHours: result.productiveHours || [],
            overScheduledDays: result.overScheduledDays || [],
            recommendations: result.recommendations || []
        };
    }

    async scoreMeeting(eventId: string, feedback: string[]): Promise<MeetingScore> {
        const event = await this.calendar.events.get({
            calendarId: 'primary',
            eventId: eventId
        });

        const metrics = await this.calculateMeetingMetrics(event.data, feedback);
        const score = this.calculateOverallScore(metrics);

        const meetingScore: MeetingScore = {
            meetingId: eventId,
            score,
            metrics,
            feedback
        };

        // Store the score in DynamoDB
        await this.storeMeetingScore(meetingScore);

        return meetingScore;
    }

    private async calculateMeetingMetrics(event: calendar_v3.Schema$Event, feedback: string[]): Promise<MeetingScore['metrics']> {
        const totalAttendees = event.attendees?.length || 0;
        const actualAttendees = event.attendees?.filter(a => a.responseStatus === 'accepted').length || 0;

        return {
            attendance: totalAttendees > 0 ? (actualAttendees / totalAttendees) * 100 : 100,
            agendaCoverage: 90, // This would come from meeting notes analysis
            actionItems: 85, // This would come from action items tracking
            timeManagement: 95 // This would come from scheduled vs actual duration
        };
    }

    private calculateOverallScore(metrics: MeetingScore['metrics']): number {
        const weights = {
            attendance: 0.25,
            agendaCoverage: 0.25,
            actionItems: 0.25,
            timeManagement: 0.25
        };

        return Object.entries(metrics).reduce((score, [key, value]) => {
            return score + (value * weights[key as keyof typeof weights]);
        }, 0);
    }

    private async storeMeetingScore(score: MeetingScore): Promise<void> {
        const command = new PutCommand({
            TableName: this.TABLE_NAME,
            Item: {
                meetingId: score.meetingId,
                score: score.score,
                metrics: score.metrics,
                feedback: score.feedback,
                timestamp: new Date().toISOString()
            }
        });

        try {
            await docClient.send(command);
        } catch (error) {
            console.error("Error storing meeting score:", error);
            throw error;
        }
    }

    async generateProductivityInsights(): Promise<ProductivityInsight> {
        // Get historical meeting scores
        const scores = await this.getMeetingScores();

        // Generate insights using Bedrock
        const prompt = {
            prompt: `Analyze the following meeting scores and generate productivity insights:
                    ${JSON.stringify(scores)}
                    
                    Generate:
                    1. Weekly patterns (best meeting times, focus time blocks, collaboration slots)
                    2. Schedule optimization recommendations
                    3. Collaboration improvement suggestions
                    4. Time management tips`,
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
            return this.parseProductivityInsights(result);
        } catch (error) {
            console.error("Error generating productivity insights:", error);
            throw error;
        }
    }

    private async getMeetingScores(): Promise<MeetingScore[]> {
        const command = new QueryCommand({
            TableName: this.TABLE_NAME,
            IndexName: "timestamp-index",
            KeyConditionExpression: "#ts > :minDate",
            ExpressionAttributeNames: {
                "#ts": "timestamp"
            },
            ExpressionAttributeValues: {
                ":minDate": new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // Last 30 days
            }
        });

        try {
            const response = await docClient.send(command);
            return (response.Items || []) as MeetingScore[];
        } catch (error) {
            console.error("Error fetching meeting scores:", error);
            return [];
        }
    }

    private parseProductivityInsights(result: any): ProductivityInsight {
        return {
            weeklyPatterns: {
                bestMeetingTimes: result.bestMeetingTimes || [],
                focusTimeBlocks: result.focusTimeBlocks || [],
                collaborationSlots: result.collaborationSlots || []
            },
            recommendations: {
                schedule: result.scheduleRecommendations || [],
                collaboration: result.collaborationRecommendations || [],
                timeManagement: result.timeManagementRecommendations || []
            }
        };
    }
} 