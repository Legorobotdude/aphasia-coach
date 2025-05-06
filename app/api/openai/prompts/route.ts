import { NextRequest, NextResponse } from 'next/server';
import { generatePromptDocs } from '@/lib/openai';
import { adminAuth } from '@/lib/firebaseAdmin';

// Set runtime to Node.js (not Edge)
export const runtime = 'nodejs';

/**
 * GET handler for generating and retrieving prompts
 * Generates prompts based on user's onboarding answers and stores them in Firestore
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const sessionCookie = req.cookies.get('session')?.value;
    
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized: No session cookie' },
        { status: 401 }
      );
    }

    let userId: string;
    try {
      // Verify the session cookie
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
      userId = decodedClaims.uid;
    } catch (error) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session' },
        { status: 401 }
      );
    }

    // Get the requested UID from query parameter
    const url = new URL(req.url);
    const requestedUid = url.searchParams.get('uid');
    const batchSize = Number(url.searchParams.get('batch') || '10');

    // Only allow generating prompts for the authenticated user
    if (requestedUid && requestedUid !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot generate prompts for another user' },
        { status: 403 }
      );
    }

    // Generate prompts using OpenAI
    const prompts = await generatePromptDocs(userId);

    // TODO: Handle generating prompts if none exist or are stale
    // This might involve checking Firestore first, then calling generatePromptDocs

    return NextResponse.json({ prompts });
  } catch (_error) {
    console.error('[API /prompts] Error:', _error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Placeholder function for generating prompts (implementation in @/lib/openai)
async function handleGeneratePrompts(uid: string) {
  console.log(`Placeholder: Generate prompts logic for user ${uid}`);
  // Example: Directly call the lib function if needed from here
  await generatePromptDocs(uid); // Assuming this is the intended action if triggered
} 