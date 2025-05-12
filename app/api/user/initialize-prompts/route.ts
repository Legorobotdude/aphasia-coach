import { NextRequest, NextResponse } from "next/server";
import { generatePromptDocs } from "@/lib/openai"; // To generate and save prompts
import { adminAuth } from "@/lib/firebaseAdmin"; // For authentication

// Set runtime to Node.js (not Edge) as generatePromptDocs uses Node.js APIs (fs, path) and server-only packages
export const runtime = "nodejs";

/**
 * POST handler for initializing (generating and saving) prompts for a user.
 * This is typically called at the end of the onboarding process.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify authentication
    const sessionCookie = req.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Unauthorized: No session cookie" },
        { status: 401 },
      );
    }

    let userId: string;
    try {
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
      userId = decodedClaims.uid;
    } catch (error) {
      console.error("[API /initialize-prompts] Authentication error:", error);
      return NextResponse.json(
        { error: "Unauthorized: Invalid session" },
        { status: 401 },
      );
    }

    // 2. Call generatePromptDocs to create and save prompts
    console.log(`[API /initialize-prompts] Attempting to generate initial prompts for user ${userId}.`);
    await generatePromptDocs({ uid: userId });
    
    console.log(`[API /initialize-prompts] Initial prompts generation attempted for user ${userId}.`);
    return NextResponse.json(
      { message: "Prompts initialized successfully." },
      { status: 201 }
    );
  } catch (error) {
    // Catch any unexpected errors from generatePromptDocs or other issues
    console.error("[API /initialize-prompts] Unhandled error:", error);
    // Check if it's an error we threw deliberately from generatePromptDocs
    const errorMessage = error instanceof Error ? error.message : "Internal server error during prompt initialization.";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
} 