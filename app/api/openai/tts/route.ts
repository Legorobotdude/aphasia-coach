import { NextRequest, NextResponse } from "next/server";
import { generateSpeechFromText } from "@/lib/openai"; // This function will be created next
import { adminAuth } from "@/lib/firebaseAdmin";

// Set runtime to Node.js (not Edge), as OpenAI SDK might rely on Node.js APIs
export const runtime = "nodejs";

interface TTSRequestPayload {
  text: string;
  voice?: string; // Optional voice selection
}

/**
 * POST handler for text-to-speech synthesis
 * Receives text, verifies authentication, and returns synthesized audio
 */
export async function POST(req: NextRequest) {
  try {
    console.log("[API /tts] Received request");

    // 1. Verify authentication
    const sessionCookie = req.cookies.get("session")?.value;
    if (!sessionCookie) {
      console.log("[API /tts] Unauthorized: No session cookie");
      return NextResponse.json(
        { error: "Unauthorized: No session cookie" },
        { status: 401 },
      );
    }

    try {
      console.log("[API /tts] Verifying session cookie...");
      await adminAuth.verifySessionCookie(sessionCookie);
      console.log("[API /tts] Session verified.");
    } catch (error) {
      console.error("[API /tts] Session verification failed:", error);
      return NextResponse.json(
        { error: "Unauthorized: Invalid session" },
        { status: 401 },
      );
    }

    // 2. Process JSON body with text
    let payload: TTSRequestPayload;
    try {
      payload = await req.json();
    } catch (error) {
      console.error("[API /tts] Invalid JSON payload:", error);
      return NextResponse.json(
        { error: "Bad request: Invalid JSON payload" },
        { status: 400 },
      );
    }

    const { text, voice } = payload;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      console.log("[API /tts] Bad request: Missing or invalid text");
      return NextResponse.json(
        { error: "Bad request: Missing or invalid text content" },
        { status: 400 },
      );
    }

    // Basic length check for TTS input
    if (text.length > 4096) {
      // OpenAI's TTS has a limit of 4096 characters
      console.log("[API /tts] Bad request: Text input exceeds maximum length");
      return NextResponse.json(
        {
          error:
            "Bad request: Text input exceeds maximum length of 4096 characters.",
        },
        { status: 400 },
      );
    }

    console.log(
      `[API /tts] Received text for synthesis. Length: ${text.length}, Voice: ${voice || "default"}`,
    );

    // 3. Call OpenAI through our wrapper to generate speech
    console.log("[API /tts] Calling OpenAI wrapper for speech synthesis...");
    const audioArrayBuffer = await generateSpeechFromText(text, voice); // Assuming this returns ArrayBuffer

    if (!audioArrayBuffer || audioArrayBuffer.byteLength === 0) {
      console.error(
        "[API /tts] Speech synthesis failed or returned empty audio.",
      );
      return NextResponse.json(
        { error: "Speech synthesis failed or returned empty audio." },
        { status: 500 }, // Internal server error or issue with upstream API
      );
    }

    console.log(
      `[API /tts] Speech synthesis successful. Audio size: ${audioArrayBuffer.byteLength} bytes.`,
    );

    // 4. Return the audio data
    // The 'Content-Type' header is important for the browser to understand the audio format.
    // OpenAI's TTS typically outputs MP3.
    const response = new NextResponse(audioArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // 'Content-Disposition': 'attachment; filename="speech.mp3"', // Optional: if you want to force download
      },
    });

    return response;
  } catch (error: unknown) {
    console.error("Error in TTS API:", error);
    // Check if it's an error from our generateSpeechFromText function or a general one
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string" &&
      ((error as { message: string }).message.includes("OpenAI API Error") ||
        (error as { status?: unknown }).status)
    ) {
      return NextResponse.json(
        {
          error: `Speech synthesis service error: ${(error as { message: string }).message}`,
        },
        { status: (error as { status?: number }).status || 500 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error while processing TTS request" },
      { status: 500 },
    );
  }
}
