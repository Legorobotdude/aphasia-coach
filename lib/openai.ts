import OpenAI from "openai";
import "server-only";
import fs from 'fs';
import path from 'path';
import { adminFirestore } from "@/lib/firebaseAdmin";
import { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";

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
    console.log(`[OpenAI Lib] Generating speech for text: "${text.substring(0, 50)}...", Voice: ${voice}`);
    
    const response = await openai.audio.speech.create({
      model: "tts-1", // Or "tts-1-hd" for higher quality
      input: text,
      voice: voice as | 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer', // Cast to accepted voice types
      response_format: "mp3", // Default is mp3, can also be opus, aac, flac
    });

    // The response body is a ReadableStream. Convert it to an ArrayBuffer.
    const audioArrayBuffer = await response.arrayBuffer();

    if (!audioArrayBuffer || audioArrayBuffer.byteLength === 0) {
      console.error("[OpenAI Lib] TTS API returned empty audio buffer.");
      throw new Error("OpenAI API Error: TTS returned empty audio buffer.");
    }

    console.log(`[OpenAI Lib] Speech generated successfully. Audio size: ${audioArrayBuffer.byteLength} bytes.`);
    return audioArrayBuffer;

  } catch (error: any) {
    console.error("[OpenAI Lib] Error generating speech:", error);
    // Enhance error message to be more specific if possible
    const errorMessage = error.response?.data?.error?.message || error.message || "Failed to generate speech due to an unknown OpenAI API error.";
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
export async function generatePromptDocs(uid: string): Promise<Prompt[]> {
  try {
    // --- Step 1: Fetch Onboarding Answers from Firestore --- //
    let onboardingContextJson = "{}"; // Default to an empty JSON object string

    try {
      const userAnswersRef = adminFirestore.collection('users').doc(uid).collection('onboardingAnswers');
      const answersSnapshot = await userAnswersRef.get();

      if (!answersSnapshot.empty) {
        const contextData: { [key: string]: string } = {}; // Assuming all transcripts are strings for now
        answersSnapshot.docs.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
          const data = doc.data();
          // Ensure transcript exists and is a string before adding to context
          if (data && typeof data.transcript === 'string') { 
            contextData[doc.id] = data.transcript;
          }
        });
        
        if (Object.keys(contextData).length > 0) {
            onboardingContextJson = JSON.stringify(contextData); // Compact JSON for the API call
            console.log(`[generatePromptDocs] Fetched onboarding context (JSON) for user ${uid}:`, onboardingContextJson);
        } else {
            console.log(`[generatePromptDocs] No valid onboarding answers with transcripts found for user ${uid}. Using empty JSON context.`);
        }
      } else {
         console.log(`[generatePromptDocs] No onboardingAnswers collection found for user ${uid}. Using empty JSON context.`);
      }
    } catch (firestoreError) {
      console.error(`[generatePromptDocs] Error fetching onboarding answers for ${uid}:`, firestoreError);
      // Proceed with empty JSON context, onboardingContextJson is already "{}"
    }
    // --- End Step 1 --- //

    // --- Log the context being sent --- //
    // console.log("[generatePromptDocs] Context being sent to OpenAI:", onboardingContext); // Old log
    // No need to log the full JSON string here again if logged above, or keep it if preferred.
    // For brevity in logs, the above log inside the try block is good.

    // --- Step 2: Generate Prompts using Context --- //
    const systemPrompt = `You are an aphasia-therapy assistant.  
Goal: create **exactly 30 practice prompts** to exercise word-retrieval for user **${uid}**.

Therapy design rules:
1. **Clarity & Brevity** – Sentence ≤ 12 words. One idea only.
2. **Single-Word Answers for Vocab Prompts** – ✅ Ask questions whose most typical answer is **one clear word** (e.g., "Cat", "Garden"). **Never** ask for multi-word phrases like "taking care".  
3. **Concrete Language** – Prefer everyday objects / actions / feelings. Avoid abstract concepts unless tagged "challenge".
4. **Cue-Ready** – Each prompt can accept a phonemic cue later (do *not* include cues now).
5. **Positive Tone** – Friendly, encouraging wording.

Prompt mix (exact counts add to 30):
- **9 Personalized Open-Ended Questions** (Assign category: "open")
  *Purpose:* encourage longer expressive output about the user's life.
- **9 Personalized Vocabulary Questions** (Assign category: "personalVocab")
  *Purpose:* single-word or short-phrase answers tied to the user's context (job, hobbies, routines).
- **6 Generic Vocabulary Questions** (Assign category: "genericVocab")
  *Purpose:* common nouns or verbs outside the user's personal context (e.g., "What do you call a baby cat?").
- **6 Challenge/Stretch Questions** (Assign category: "challenge")
  *Purpose:* slightly less frequent words or tricker words.

Input context (JSON):
The user's context will be provided in the User message in JSON format like this:
{
  "job": "...",
  "hobbies": ["...", "..."],
  "routines": "...",
  "culture": "...",
  "goals": "..."
}

Return ONLY a JSON object containing a single key "prompts". The value should be an array of exactly 30 JSON objects, each with keys "prompt" (holding the prompt text string) and "category" (a string: "open", "personalVocab", "genericVocab", or "challenge").`;

    const userContextMessage = onboardingContextJson; // Use the JSON string context

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContextMessage,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(
      completion.choices[0].message.content || '{"prompts":[]}',
    );

    if (!result || !Array.isArray(result.prompts)) {
        console.error('Invalid response structure from OpenAI prompt generation:', result);
        return [];
    }

    const userPromptsCollectionRef = adminFirestore
      .collection('users')
      .doc(uid)
      .collection('promptPool');

    // --- DEDUPLICATION STEP --- //
    // Fetch all existing prompt texts for this user and normalize for comparison
    const existingPromptsSnapshot = await userPromptsCollectionRef.get();
    const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
    const existingNormalizedTexts = new Set(
      existingPromptsSnapshot.docs
        .map(doc => doc.data().text)
        .filter(Boolean)
        .map(normalize)
    );

    let deduped = 0;
    const batch = adminFirestore.batch();
    const generatedPrompts: Prompt[] = [];
    for (const p of result.prompts) {
      if (typeof p.prompt !== 'string' || typeof p.category !== 'string') {
        console.warn('[generatePromptDocs] Skipping invalid prompt item (missing prompt or category):', p);
        continue;
      }
      const cleanCategory = ['open', 'personalVocab', 'genericVocab', 'challenge'].includes(p.category) ? p.category : null;
      if (!cleanCategory) {
        console.warn(`[generatePromptDocs] Skipping prompt with invalid category (${p.category}):`, p.prompt);
        continue;
      }
      const normText = normalize(p.prompt);
      if (existingNormalizedTexts.has(normText)) {
        deduped++;
        continue; // Skip this prompt, it's a duplicate
      }
      existingNormalizedTexts.add(normText); // Add to the set so new dups are prevented in the same batch
      const promptData = {
        text: p.prompt,
        category: cleanCategory,
        createdAt: Timestamp.now(),
        source: "onboarding-initial", // Or flag if generating for another reason
        lastUsedAt: null,
        timesUsed: 0,
        lastScore: null,
        ownerUid: uid,
        difficulty: null,
        freqNorm: null,
        abstractness: null,
        lengthScale: null,
        responseTypeScale: null,
        semanticDistanceScale: null,
      };
      const newPromptRef = userPromptsCollectionRef.doc();
      batch.set(newPromptRef, promptData);
      generatedPrompts.push({ id: newPromptRef.id, text: promptData.text });
    }

    await batch.commit();
    console.log(`[generatePromptDocs] Generated ${result.prompts.length}. Skipped ${deduped} duplicates. Saved ${generatedPrompts.length} new prompts to promptPool for user ${uid}.`);

    return generatedPrompts;
    // --- End Step 3 --- //

  } catch (error) {
    console.error("[generatePromptDocs] Error:", error); // Changed logging key
    throw new Error("Failed to generate and save prompts");
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
