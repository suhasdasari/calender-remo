# Remo - AI-Powered Calendar Assistant

Remo is an intelligent calendar assistant that uses AWS Bedrock and other AWS services to provide smart meeting scheduling, meeting intelligence, and calendar analytics.

## Features

### 1. Smart Meeting Scheduling
- Natural language understanding for meeting requests
- Context-aware scheduling based on participant preferences
- Intelligent time slot suggestions
- Meeting pattern analysis

### 2. Meeting Intelligence
- Pre-meeting preparation with relevant context
- Automated action item extraction
- Meeting effectiveness scoring
- Sentiment analysis of meetings

### 3. Calendar Analytics
- Time management insights
- Meeting distribution analysis
- Productivity optimization suggestions
- Team collaboration patterns

## Architecture

The application uses several AWS services:
- Amazon Bedrock (Claude model) for natural language processing
- Amazon DynamoDB for storing meeting analytics
- Amazon Comprehend for sentiment analysis
- Amazon CloudFormation for infrastructure

## Prerequisites

1. AWS Account with access to:
   - Amazon Bedrock
   - Amazon DynamoDB
   - Amazon Comprehend

2. Required credentials:
   - AWS credentials
   - Google Calendar API credentials
   - Telegram Bot token

## Setup

1. Clone the repository:
```bash
git clone https://github.com/suhasdasari/calender-remo.git
cd calender-remo
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Deploy AWS infrastructure:
```bash
aws cloudformation deploy --template-file infrastructure/template.yaml --stack-name remo-calendar --capabilities CAPABILITY_IAM
```

5. Build and run:
```bash
npm run build
npm start
```

## Usage

### Smart Meeting Scheduling
```typescript
const scheduler = new SmartScheduler(calendarClient);
const slots = await scheduler.suggestMeetingTime(
    "Set up a meeting with the engineering team next week to discuss AWS integration"
);
```

### Meeting Intelligence
```typescript
const intelligence = new MeetingIntelligence(calendarClient);
const brief = await intelligence.generateMeetingBrief("meeting-id");
const actionItems = await intelligence.extractActionItems("meeting-transcript");
```

### Calendar Analytics
```typescript
const analytics = new CalendarAnalytics(calendarClient);
const insights = await analytics.analyzeTimeManagement(startDate, endDate);
const meetingScore = await analytics.scoreMeeting("meeting-id", feedback);
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- AWS Bedrock team for providing powerful AI capabilities
- Google Calendar API for calendar integration
- Telegram Bot API for user interface 