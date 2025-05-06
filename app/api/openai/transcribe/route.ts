import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/openai';
import { adminAuth } from '@/lib/firebaseAdmin';

// Set runtime to Node.js (not Edge)
export const runtime = 'nodejs';

/**
 * POST handler for audio transcription
 * Receives audio file, verifies authentication, and returns transcribed text
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[API /transcribe] Received request');
    // Verify authentication
    const sessionCookie = req.cookies.get('session')?.value;
    
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Unauthorized: No session cookie' },
        { status: 401 }
      );
    }

    try {
      console.log('[API /transcribe] Verifying session cookie...');
      await adminAuth.verifySessionCookie(sessionCookie);
      console.log('[API /transcribe] Session verified.');
    } catch (error) {
      console.error('[API /transcribe] Session verification failed:', error);
      return NextResponse.json(
        { error: 'Unauthorized: Invalid session' },
        { status: 401 }
      );
    }

    // Process form data with audio file
    const formData = await req.formData();
    const audioFile = formData.get('audio');
    
    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: 'Bad request: Missing or invalid audio file' },
        { status: 400 }
      );
    }

    console.log(`[API /transcribe] Received audio file. Type: ${audioFile.type}, Size: ${audioFile.size}`);

    // Check file format by validating the mime type
    const validBaseMimeTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac'];
    const isValidType = validBaseMimeTypes.some(baseType => audioFile.type.startsWith(baseType));

    console.log(`[API /transcribe] MIME type check: isValidType = ${isValidType}`);

    if (!isValidType) {
      console.warn('[API /transcribe] Invalid MIME type detected. Rejecting.');
      return NextResponse.json(
        { 
          error: `Invalid file format. Received: ${audioFile.type}. Supported base types: ${validBaseMimeTypes.join(', ')}`,
          receivedType: audioFile.type
        },
        { status: 400 }
      );
    }

    // Convert Blob to Buffer for OpenAI
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    
    console.log(`[API /transcribe] Converting Blob to Buffer (size: ${buffer.length})`);

    // Check minimum audio size
    if (buffer.length < 10000) {
      console.warn('[API /transcribe] Audio buffer too short. Rejecting.');
      return NextResponse.json(
        { error: 'Audio file is too short. Minimum audio length is 0.1 seconds.' },
        { status: 400 }
      );
    }
    
    console.log('[API /transcribe] Calling OpenAI wrapper...');
    // Call OpenAI through our wrapper
    const text = await transcribeAudio(buffer);
    
    console.log('[API /transcribe] OpenAI call successful. Returning text.');
    
    // Return the transcribed text
    return NextResponse.json({ text });
  } catch (error) {
    console.error('Error in transcribe API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 