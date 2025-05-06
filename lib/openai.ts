import OpenAI from "openai";
import "server-only";
import fs from 'fs';
import path from 'path';
import { adminFirestore } from "@/lib/firebaseAdmin";
import { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";

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

// Define the Prompt structure expected by the frontend
interface Prompt {
  id: string; // Or generate one if AI doesn't provide
  text: string;
}

/**
 * Generates personalized prompts based on user topics
 * @param uid - User ID to generate prompts for
 * @returns Array of prompt objects { id, text }
 */
export async function generatePromptDocs(uid: string): Promise<Prompt[]> {
  try {
    // --- Step 1: Fetch Onboarding Answers from Firestore --- //
    let onboardingContext = "User provided no specific context during onboarding.";
    try {
      // Define the correct reference based on the build plan structure: users/{uid}/onboardingAnswers/{label}
      const userAnswersRef = adminFirestore.collection('users').doc(uid).collection('onboardingAnswers');
      
      // Remove unused/incorrect query definitions that caused errors
      /*
      const answersCollectionRef = adminFirestore.collection('onboardingAnswers').doc(uid).collection('answers'); 
      const answersCollectionGroup = adminFirestore.collectionGroup('onboardingAnswers')
                                       .where('__name__', '>=', `onboardingAnswers/${uid}/`)
                                       .where('__name__', '<', `onboardingAnswers/${uid}/`); // This line caused the error
      */
      
      // Fetch the answers
      const answersSnapshot = await userAnswersRef.get();

      if (!answersSnapshot.empty) {
        const answers = answersSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => {
          const data = doc.data();
          return `${doc.id}: ${data.transcript}`;
        });
        onboardingContext = `User's Onboarding Context:\n${answers.join('\n')}`;
        console.log(`[generatePromptDocs] Fetched onboarding context for user ${uid}`);
      } else {
         console.log(`[generatePromptDocs] No onboarding answers found for user ${uid}`);
      }
    } catch (firestoreError) {
      console.error(`[generatePromptDocs] Error fetching onboarding answers for ${uid}:`, firestoreError);
      // Proceed without context, or throw error?
      // For now, we'll proceed with the default context message.
    }
    // --- End Step 1 --- //

    // --- Log the context being sent --- //
    console.log("[generatePromptDocs] Context being sent to OpenAI:", onboardingContext);
    // --------------------------------- //

    // --- Step 2: Generate Prompts using Context --- //
    const systemPrompt = `You are an aphasia therapy assistant generating practice prompts for user ID ${uid}.
Generate exactly 10 prompts designed for word retrieval practice, mixing different types based on the user's context provided below.

Include approximately:
1.  **3-4 Personalized Open-Ended Questions:** Ask about their life, experiences, or feelings related to the context (e.g., "Tell me more about your time working as a [Job mentioned in context]?").
2.  **3-4 Personalized Vocabulary Questions:** Ask definition or naming questions related to specific terms, objects, or concepts mentioned in the context (e.g., "What tool related to [Hobby mentioned] is used for [Action]?", "Name a common task involved in [Routine mentioned]?"). These should ideally have a clear, shorter answer.
3.  **3-4 Generic Vocabulary Questions:** Ask definition or naming questions covering common knowledge categories (e.g., Time, History, Household Objects, Animals, Actions, Opposites). Examples: "What do you call a baby cat?", "What is the opposite of fast?"

Prioritize clear wording suitable for word retrieval.
Return ONLY a JSON object containing a single key "prompts". The value should be an array of exactly 10 JSON objects, each with a single key "prompt" holding the prompt text string.`;

    const userContextMessage = onboardingContext; // Use the fetched context

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
           role: "user", // Provide context as a user message
           content: userContextMessage,
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(
      completion.choices[0].message.content || '{"prompts":[]}',
    );

    // Validate the structure somewhat
    if (!result || !Array.isArray(result.prompts)) {
        console.error('Invalid response structure from OpenAI prompt generation:', result);
        return []; // Return empty array on invalid structure
    }

    // Map the AI response to our Prompt interface
    return result.prompts.map((p: { prompt: string }, index: number): Prompt => {
        if (typeof p.prompt !== 'string') {
            console.warn('Received non-string prompt:', p);
            // Handle invalid item, e.g., skip or return a default
            return { id: `invalid-${index}`, text: 'Error loading prompt.' }; 
        }
        return {
            // Create a simple ID based on index - refine if needed
            id: `prompt-${uid}-${index}`,
            text: p.prompt, 
        };
    });

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
