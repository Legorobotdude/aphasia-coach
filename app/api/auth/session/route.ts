import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

// Set runtime to Node.js (not Edge)
export const runtime = 'nodejs';

/**
 * POST handler for creating a session cookie
 * Receives an ID token from client-side auth and creates a secure server-side session
 */
export async function POST(req: NextRequest) {
  try {
    // Get the ID token from request body
    const { idToken } = await req.json();
    
    if (!idToken) {
      return NextResponse.json(
        { error: 'Unauthorized: No ID token provided' },
        { status: 401 }
      );
    }

    // Set session expiration to 5 days (same as Firebase default)
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days in milliseconds
    
    try {
      // Create a session cookie
      const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
      
      // Create the response
      const response = NextResponse.json({ success: true });
      
      // Set the cookie on the response
      response.cookies.set({
        name: 'session',
        value: sessionCookie,
        maxAge: expiresIn / 1000, // Convert to seconds
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      });
      
      return response;
    } catch (error) {
      console.error('Error creating session:', error);
      return NextResponse.json(
        { error: 'Unauthorized: Invalid ID token' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 