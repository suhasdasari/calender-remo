import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ComprehendClient } from "@aws-sdk/client-comprehend";
import { TranscribeClient } from "@aws-sdk/client-transcribe";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || 'us-east-1';

// Initialize AWS clients
export const bedrockRuntime = new BedrockRuntimeClient({ region });
export const dynamoDb = new DynamoDBClient({ region });
export const comprehend = new ComprehendClient({ region });
export const transcribe = new TranscribeClient({ region });

// Create the DynamoDB Document client
const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
};

const unmarshallOptions = {
    wrapNumbers: false,
};

export const docClient = DynamoDBDocumentClient.from(dynamoDb, {
    marshallOptions,
    unmarshallOptions,
}); 