import { NextRequest, NextResponse } from 'next/server';
import { scoreUtterance } from '@/lib/openai';
import { adminAuth } from '@/lib/firebaseAdmin';

// Set runtime to Node.js (not Edge)
export const runtime = 'nodejs';

/**
 * POST handler for scoring user utterances
 * Receives prompt and response text, scores them, and returns feedback
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const sessionCookie = req.cookies.get('session')?.value;
    
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized: No session cookie' },
        { status: 401 }
      );
    }

    try {
      // Verify the session cookie
      await adminAuth.verifySessionCookie(sessionCookie);
    } catch (_error) {
      // Log the error if needed, but variable _error itself might not be used
      console.error('Error verifying session cookie in score API:', _error);
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session' },
        { status: 401 }
      );
    }

    // Parse request body
    const { prompt, response } = await req.json();
    
    // Validate request data
    if (!prompt || !response) {
      return NextResponse.json(
        { error: 'Bad request: Missing prompt or response' },
        { status: 400 }
      );
    }

    // Score the utterance using OpenAI
    const result = await scoreUtterance(prompt, response);
    
    // Return the score, feedback, and latency
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in score API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 