import OpenAI from "openai";
import "server-only";
import fs from 'fs';
import path from 'path';

// Initialize the OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Transcribes audio using OpenAI's Whisper API
 * @param buffer - Audio buffer to transcribe
 * @returns Transcribed text
 */
export async function transcribeAudio(buffer: Buffer): Promise<string> {
  try {
    // Validate minimum audio length (rough estimation based on buffer size)
    // Audio file should be at least 0.1 seconds (assuming 16-bit stereo at 44.1kHz)
    if (buffer.length < 10000) {
      throw new Error("Audio file is too short. Minimum audio length is 0.1 seconds.");
    }

    // Create a temporary file
    const tempFilePath = path.join('/tmp', `audio-${Date.now()}.wav`);
    fs.writeFileSync(tempFilePath, buffer);

    // Use the file directly from the file system
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "en",
    });

    // Clean up the temporary file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (cleanupError) {
      console.error("Failed to clean up temporary file:", cleanupError);
    }

    return response.text;
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio");
  }
}

/**
 * Generates personalized prompts based on user topics
 * @param uid - User ID to generate prompts for
 * @returns Array of prompt strings
 */
export async function generatePromptDocs(uid: string): Promise<string[]> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an aphasia therapy assistant specializing in word retrieval exercises. 
          Create 10 personalized prompts based on the user's interests and background. 
          These prompts should be clearly worded questions that encourage the user to retrieve 
          specific vocabulary. The user ID is ${uid}. Return only an array of JSON objects, 
          each with a 'prompt' property.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(
      completion.choices[0].message.content || '{"prompts":[]}',
    );

    // Define the type for prompt objects
    interface PromptData {
      prompt: string;
    }

    return result.prompts.map((p: PromptData) => p.prompt);
  } catch (error) {
    console.error("Prompt generation error:", error);
    throw new Error("Failed to generate prompts");
  }
}

/**
 * Scores user utterance against a prompt
 * @param prompt - The original prompt
 * @param response - User's spoken response
 * @returns Score object with numeric score, feedback, and latency
 */
export async function scoreUtterance(
  prompt: string,
  response: string,
): Promise<{ score: number; feedback: string; latency: number }> {
  const startTime = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an aphasia therapy assistant evaluating word retrieval responses.
          Score the user's response to the given prompt on a scale from 0 to 1, where:
          - 1.0: Perfect response with target vocabulary
          - 0.7-0.9: Good response with related vocabulary
          - 0.4-0.6: Partial response with some related concepts
          - 0.1-0.3: Poor response with few relevant words
          - 0.0: Completely unrelated or no meaningful response
          Provide brief, encouraging feedback (1-2 sentences) regardless of score.`,
        },
        {
          role: "user",
          content: `Prompt: "${prompt}"\nResponse: "${response}"\n\nPlease score this response.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const latency = Date.now() - startTime;
    const result = JSON.parse(
      completion.choices[0].message.content || '{"score":0,"feedback":""}',
    );

    return {
      score: result.score || 0,
      feedback: result.feedback || "Let's try again.",
      latency,
    };
  } catch (error) {
    console.error("Scoring error:", error);
    throw new Error("Failed to score response");
  }
}
