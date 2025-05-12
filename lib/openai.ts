import OpenAI from "openai";
import "server-only";
import fs from "fs";
import path from "path";
import { adminFirestore } from "@/lib/firebaseAdmin";
import {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase-admin/firestore";
import { calculateDifficulty } from './difficultyUtil';

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
    // Create a temporary file
    const tempFilePath = path.join("/tmp", `audio-${Date.now()}.wav`);
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
 * Generates speech from text using OpenAI's TTS API.
 * @param text - The text to synthesize.
 * @param voice - Optional voice model (e.g., 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'). Defaults to 'alloy'.
 * @returns ArrayBuffer containing the audio data (typically MP3).
 * @throws Error if speech synthesis fails.
 */
export async function generateSpeechFromText(
  text: string,
  voice: string = "alloy", // Default voice
): Promise<ArrayBuffer> {
  try {
    console.log(
      `[OpenAI Lib] Generating speech for text: "${text.substring(0, 50)}...", Voice: ${voice}`,
    );

    const response = await openai.audio.speech.create({
      model: "tts-1", // Or "tts-1-hd" for higher quality
      input: text,
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer", // Cast to accepted voice types
      response_format: "mp3", // Default is mp3, can also be opus, aac, flac
    });

    // The response body is a ReadableStream. Convert it to an ArrayBuffer.
    const audioArrayBuffer = await response.arrayBuffer();

    if (!audioArrayBuffer || audioArrayBuffer.byteLength === 0) {
      console.error("[OpenAI Lib] TTS API returned empty audio buffer.");
      throw new Error("OpenAI API Error: TTS returned empty audio buffer.");
    }

    console.log(
      `[OpenAI Lib] Speech generated successfully. Audio size: ${audioArrayBuffer.byteLength} bytes.`,
    );
    return audioArrayBuffer;
  } catch (error: unknown) {
    console.error("[OpenAI Lib] Error generating speech:", error);
    // Enhance error message to be more specific if possible
    let errorMessage =
      "Failed to generate speech due to an unknown OpenAI API error.";
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      errorMessage = (error as { message: string }).message;
    }
    throw new Error(`OpenAI API Error: ${errorMessage}`);
  }
}

// Define the Prompt structure expected by the frontend
interface Prompt {
  id: string; // This will now be the Firestore document ID
  text: string;
}

/**
 * Generates personalized prompts based on user topics AND SAVES THEM TO FIRESTORE.
 * @param uid - User ID to generate prompts for
 * @returns Array of prompt objects { id, text } - id is now Firestore doc ID.
 */
export async function generatePromptDocs({
  uid,
  targetCategory = 'genericVocab',
  targetDifficulty = 50,
  window = 8,
  batch = 20,
}: {
  uid: string;
  targetCategory?: 'open' | 'personalVocab' | 'genericVocab' | 'challenge';
  targetDifficulty?: number;
  window?: number;
  batch?: number;
}): Promise<void> {
  const D_LOW = Math.max(0, targetDifficulty - window);
  const D_HIGH = Math.min(100, targetDifficulty + window);

  const systemPrompt = `
    You are generating therapy prompts for aphasia rehab.
    Return exactly ${batch} JSON objects.

    ### Target specs
    • category = "${targetCategory}"
    • aim for difficulty **between ${D_LOW} and ${D_HIGH}** on a 0-100 scale
      (see difficulty rubric below).

    ### Difficulty rubric (internal)
    0-30 very easy – high-frequency, concrete, single-word answers
    31-50 moderate – everyday but less common, single-word answers
    51-70 hard – low-frequency or abstract but concrete enough to cue
    71-85 very hard – rare words, two-word collocations allowed
    86-100 expert – do NOT output; reserved for future

    ### Prompt format rules
    1. One clear single-word answer unless <CATEGORY> is "open".
    2. Sentence ≤ 12 words.
    3. No "two-word phrase for…" meta wording.
    4. Friendly tone.

    ### Output JSON schema
    { "prompt":"...", "category":"...", "answer":"..." }

    ### Examples (good)
    { "prompt":"Name the tool that trims tree branches.", "category":"personalVocab", "answer":"loppers" }
    { "prompt":"What do you call a baby cat?", "category":"genericVocab", "answer":"kitten" }
    { "prompt":"Name the document immigrants carry for travel.", "category":"challenge", "answer":"passport" }

    Return as: { "prompts":[…${batch} items…] }
    NO comments or markdown.
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });

  const responseText = response.choices[0].message.content || '';
  let generatedPrompts: { prompt: string; category: string; answer: string }[] = [];

  try {
    const parsedResponse = JSON.parse(responseText);
    if (parsedResponse.prompts && Array.isArray(parsedResponse.prompts)) {
      generatedPrompts = parsedResponse.prompts;
    }
  } catch (error) {
    console.error('Failed to parse OpenAI response:', error);
    return;
  }

  const promptPoolRef = adminFirestore
    .collection('users')
    .doc(uid)
    .collection('promptPool');

  const existingPromptsSnapshot = await promptPoolRef.get();
  const existingPromptTexts = new Set(
    existingPromptsSnapshot.docs.map(doc => {
      const data = doc.data();
      return data.text ? data.text.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    })
  );

  const newPrompts = generatedPrompts.filter(prompt => {
    const normalizedText = prompt.prompt.toLowerCase().replace(/[^a-z0-9]/g, '');
    return !existingPromptTexts.has(normalizedText);
  });

  for (const prompt of newPrompts) {
    const difficultyData = calculateDifficulty(prompt.prompt, prompt.category);
    await promptPoolRef.add({
      text: prompt.prompt,
      createdAt: Timestamp.now(),
      source: 'api-cached',
      lastScore: null,
      timesUsed: 0,
      lastUsedAt: null,
      ownerUid: uid,
      category: prompt.category,
      difficulty: difficultyData.difficulty,
      freqNorm: difficultyData.freqNorm,
      abstractness: difficultyData.abstractness,
      lengthScale: difficultyData.lengthScale,
      responseTypeScale: difficultyData.responseTypeScale,
      semanticDistanceScale: difficultyData.semanticDistanceScale,
    });
  }

  console.log(`Added ${newPrompts.length} new prompts to promptPool for user ${uid}.`);
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
      model: "gpt-4.1-mini",
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
          Provide brief, encouraging feedback (1-2 sentences) regardless of score.
          Return your response as a JSON object with keys 'score' (number 0-1) and 'feedback' (string).`,
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
