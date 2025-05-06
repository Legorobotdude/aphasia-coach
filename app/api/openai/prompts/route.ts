import { NextRequest, NextResponse } from "next/server";
import { generatePromptDocs } from "@/lib/openai";
import { adminAuth, adminFirestore } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Set runtime to Node.js (not Edge)
export const runtime = "nodejs";

// Define the expected structure of a prompt object for the client
interface ClientPrompt {
  id: string;
  text: string;
}

/**
 * GET handler for generating and retrieving prompts
 * Generates prompts based on user's onboarding answers and stores them in Firestore
 */
export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const sessionCookie = req.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Unauthorized: No session cookie" },
        { status: 401 },
      );
    }

    let userId: string;
    try {
      // Verify the session cookie
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
      userId = decodedClaims.uid;
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Invalid session" },
        { status: 401 },
      );
    }

    // Get the requested UID from query parameter
    const url = new URL(req.url);
    const requestedUid = url.searchParams.get("uid");

    // Only allow generating prompts for the authenticated user
    if (requestedUid && requestedUid !== userId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot generate prompts for another user" },
        { status: 403 },
      );
    }

    // --- Step 1: Try to Fetch Prompts from Cache --- //
    const BATCH_SIZE = 12; // Number of prompts to fetch
    let prompts: ClientPrompt[] = [];

    const userPromptsRef = adminFirestore
      .collection('users')
      .doc(userId)
      .collection('generatedPrompts');

    // Query for prompts: order by least used, then by oldest lastUsedAt (nulls first)
    const cachedPromptsQuery = userPromptsRef
      .orderBy('timesUsed', 'asc')
      .orderBy('lastUsedAt', 'asc') // Firestore treats nulls as smaller than timestamps
      .limit(BATCH_SIZE);

    const cachedPromptsSnapshot = await cachedPromptsQuery.get();

    if (!cachedPromptsSnapshot.empty) {
      prompts = cachedPromptsSnapshot.docs.map(doc => ({
        id: doc.id,
        text: doc.data().text,
        // Potentially add other fields if the client needs them, like 'source' or 'lastScore' for debugging
      }));
    }
    console.log(`[API /prompts] Fetched ${prompts.length} prompts from cache for user ${userId}.`);

    // --- Step 2: If Not Enough Prompts in Cache, Generate and Use/Recache --- //
    if (prompts.length < BATCH_SIZE) {
      console.log(`[API /prompts] Not enough prompts in cache (${prompts.length}/${BATCH_SIZE}). Attempting to generate new prompts for user ${userId}.`);
      
      const newlyGeneratedPrompts = await generatePromptDocs(userId); // This function saves to Firestore.
      
      if (newlyGeneratedPrompts.length > 0) {
        // If generation was successful, prioritize using these newly generated prompts for the current session.
        // This is more direct than re-querying immediately and avoids potential consistency delays.
        console.log(`[API /prompts] Successfully generated ${newlyGeneratedPrompts.length} prompts. Using these for the current session for user ${userId}.`);
        // If the cache was completely empty, `prompts` will be replaced.
        // If the cache had some items but less than BATCH_SIZE, we are still prioritizing the new batch.
        // This ensures the user gets a full set if generation is successful.
        prompts = newlyGeneratedPrompts.slice(0, BATCH_SIZE).map(p => ({ id: p.id, text: p.text }));
        
        // The `generatePromptDocs` function has already saved these to Firestore, so the cache will be populated for the *next* request.
      } else if (prompts.length === 0) {
        // This means: initial cache was empty AND prompt generation failed to produce any prompts.
        console.error(`[API /prompts] Critical Failure: Initial cache was empty and failed to generate any new prompts for user ${userId}.`);
        return NextResponse.json(
          { error: "We're having trouble preparing your exercises right now. Please try again in a few moments." }, 
          { status: 500 }
        );
      }
      // If prompts.length > 0 (partial cache hit) but newlyGeneratedPrompts.length === 0 (generation failed),
      // we will proceed with the partially filled `prompts` array from the cache. This is acceptable.
      console.log(`[API /prompts] After generation attempt, proceeding with ${prompts.length} prompts for user ${userId}.`);
    }

    // Final check: If after all attempts, prompts array is still empty, it's an issue.
    if (prompts.length === 0) {
      console.error(`[API /prompts] Final check: No prompts available for user ${userId}. This should not happen.`);
      return NextResponse.json(
        { error: "No prompts available at this moment. Please try again later." },
        { status: 404 } // Or 500, depending on how critical this is
      );
    }

    // --- Step 3: (Optional) Update lastUsedAt for the fetched prompts --- //
    // This is important for the 'orderBy lastUsedAt' logic to work correctly for subsequent fetches.
    // We'll do this without blocking the response.
    const updateBatch = adminFirestore.batch();
    const now = FieldValue.serverTimestamp(); // Use imported FieldValue

    prompts.forEach(prompt => {
      const promptRef = userPromptsRef.doc(prompt.id);
      updateBatch.update(promptRef, { 
        lastUsedAt: now,
        timesUsed: FieldValue.increment(1) // Use imported FieldValue
      });
    });
    
    updateBatch.commit().catch(err => {
      console.error(`[API /prompts] Error updating lastUsedAt/timesUsed for prompts for user ${userId}:`, err);
      // Non-critical error, don't fail the request.
    });

    return NextResponse.json({ prompts });
  } catch (error) {
    console.error("[API /prompts] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
