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
  category: string;
  difficulty: number;
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
      .collection("users")
      .doc(userId)
      .collection("promptPool");

    // Define recent window for prompt reuse (e.g., last 2 sessions is about ~1-2 days)
    const RECENT_DAYS = 2;
    const MASTERED_THRESHOLD = 0.85;
    const nowTime = Date.now();
    const recentCutoff = nowTime - RECENT_DAYS * 24 * 60 * 60 * 1000; // in ms

    // Fetch *all* prompts (if user has < 120, otherwise, you could paginate)
    const allPromptsSnapshot = await userPromptsRef.get();
    const promptDocs = allPromptsSnapshot.docs;

    // First pass filter: only those not mastered recently and not over-served
    let eligiblePrompts = promptDocs.filter((doc) => {
      const d = doc.data();
      const lastScore = d.lastScore ?? 0;
      const lastUsedAt = d.lastUsedAt ? d.lastUsedAt.toDate().getTime() : 0;
      // Exclude if mastered (lastScore >= 0.85) AND used within the recent window
      if (lastScore >= MASTERED_THRESHOLD && lastUsedAt > recentCutoff)
        return false;
      // Exclude if used in last RECENT_DAYS
      if (lastUsedAt > recentCutoff) return false;
      return true;
    });

    // Order eligible prompts by least-used and least-recently-used (ascending)
    eligiblePrompts.sort((a, b) => {
      // By timesUsed, then by lastUsedAt
      const aD = a.data(),
        bD = b.data();
      const tuA = aD.timesUsed ?? 0,
        tuB = bD.timesUsed ?? 0;
      if (tuA !== tuB) return tuA - tuB;
      // Nulls first (never used)
      const luaA = aD.lastUsedAt ? aD.lastUsedAt.toDate().getTime() : 0;
      const luaB = bD.lastUsedAt ? bD.lastUsedAt.toDate().getTime() : 0;
      return luaA - luaB;
    });

    // Get user's skill scores to filter prompts by difficulty
    const userDocRef = adminFirestore.collection('users').doc(userId);
    const userDoc = await userDocRef.get();
    const userData = userDoc.data();
    const skillScores = userData?.skillScores || { genericVocab: 50, personalVocab: 50, challenge: 50 };
    const category = url.searchParams.get('category') || 'genericVocab';
    const skill = skillScores[category] || 50;
    const band = 8; // Difficulty window

    console.log(`[API /prompts] User ${userId} skill scores:`, skillScores);
    console.log(`[API /prompts] Filtering for category ${category} with skill ${skill}, difficulty band ${skill - band} to ${skill + band}`);

    // Filter prompts by difficulty band based on user's skill
    eligiblePrompts = eligiblePrompts.filter((doc) => {
      const d = doc.data();
      const difficulty = d.difficulty || 50; // Default to 50 if not set
      return difficulty >= skill - band && difficulty <= skill + band;
    });

    // If not enough prompts after difficulty filter, relax the band
    if (eligiblePrompts.length < BATCH_SIZE) {
      const widerBand = band + 2;
      eligiblePrompts = promptDocs.filter((doc) => {
        const d = doc.data();
        const lastScore = d.lastScore ?? 0;
        const lastUsedAt = d.lastUsedAt ? d.lastUsedAt.toDate().getTime() : 0;
        const difficulty = d.difficulty || 50;
        // Exclude if mastered (lastScore >= 0.85) AND used within the recent window
        if (lastScore >= MASTERED_THRESHOLD && lastUsedAt > recentCutoff)
          return false;
        // Exclude if used in last RECENT_DAYS
        if (lastUsedAt > recentCutoff) return false;
        // Filter by wider difficulty band
        return difficulty >= skill - widerBand && difficulty <= skill + widerBand;
      });
    }

    // If still not enough, relax difficulty filter but keep other filters
    if (eligiblePrompts.length < BATCH_SIZE) {
      eligiblePrompts = promptDocs.filter((doc) => {
        const d = doc.data();
        const lastScore = d.lastScore ?? 0;
        const lastUsedAt = d.lastUsedAt ? d.lastUsedAt.toDate().getTime() : 0;
        // Exclude if mastered (lastScore >= 0.85) AND used within the recent window
        if (lastScore >= MASTERED_THRESHOLD && lastUsedAt > recentCutoff)
          return false;
        // Exclude if used in last RECENT_DAYS
        if (lastUsedAt > recentCutoff) return false;
        return true;
      });
    }

    // As a last resort, allow everything
    if (eligiblePrompts.length < BATCH_SIZE) {
      eligiblePrompts = promptDocs;
    }

    // Re-sort after potential re-filtering
    eligiblePrompts.sort((a, b) => {
      const aD = a.data(),
        bD = b.data();
      const tuA = aD.timesUsed ?? 0,
        tuB = bD.timesUsed ?? 0;
      if (tuA !== tuB) return tuA - tuB;
      const luaA = aD.lastUsedAt ? aD.lastUsedAt.toDate().getTime() : 0;
      const luaB = bD.lastUsedAt ? bD.lastUsedAt.toDate().getTime() : 0;
      return luaA - luaB;
    });

    prompts = eligiblePrompts.slice(0, BATCH_SIZE).map((doc) => ({
      id: doc.id,
      text: doc.data().text,
      // Include category and difficulty for client-side use
      category: doc.data().category || 'genericVocab',
      difficulty: doc.data().difficulty || 50
    }));

    console.log(
      `[API /prompts] Using ${prompts.length} prompts (eligible pool size: ${eligiblePrompts.length} of ${promptDocs.length}) for user ${userId}.`,
    );

    // --- Step 2: If Not Enough Prompts in Cache, Generate and Use/Recache --- //
    // All prompt data is stored in 'promptPool'.
    if (prompts.length < BATCH_SIZE) {
      console.log(
        `[API /prompts] Not enough prompts in cache (${prompts.length}/${BATCH_SIZE}). Attempting to generate new prompts for user ${userId}.`,
      );

      await generatePromptDocs({
        uid: userId,
        targetCategory: 'genericVocab',
        targetDifficulty: 50,
        window: 8,
        batch: 20
      }); // This function saves to Firestore but does not return prompts.

      // Re-query Firestore to get the newly generated prompts
      const newPromptsSnapshot = await userPromptsRef.get();
      const newPromptDocs = newPromptsSnapshot.docs;

      // Re-apply filters to get eligible prompts after generation
      let newEligiblePrompts = newPromptDocs.filter((doc) => {
        const d = doc.data();
        const lastScore = d.lastScore ?? 0;
        const lastUsedAt = d.lastUsedAt ? d.lastUsedAt.toDate().getTime() : 0;
        // Exclude if mastered (lastScore >= 0.85) AND used within the recent window
        if (lastScore >= MASTERED_THRESHOLD && lastUsedAt > recentCutoff)
          return false;
        // Exclude if used in last RECENT_DAYS
        if (lastUsedAt > recentCutoff) return false;
        return true;
      });

      // If too few eligible prompts, relax only the mastered filter
      if (newEligiblePrompts.length < BATCH_SIZE) {
        newEligiblePrompts = newPromptDocs.filter((doc) => {
          const d = doc.data();
          const lastUsedAt = d.lastUsedAt ? d.lastUsedAt.toDate().getTime() : 0;
          // Only filter by recently used
          if (lastUsedAt > recentCutoff) return false;
          return true;
        });
      }
      // As a last resort, allow everything
      if (newEligiblePrompts.length < BATCH_SIZE) {
        newEligiblePrompts = newPromptDocs;
      }

      // Order by least-used and least-recently-used
      newEligiblePrompts.sort((a, b) => {
        const aD = a.data(),
          bD = b.data();
        const tuA = aD.timesUsed ?? 0,
          tuB = bD.timesUsed ?? 0;
        if (tuA !== tuB) return tuA - tuB;
        const luaA = aD.lastUsedAt ? aD.lastUsedAt.toDate().getTime() : 0;
        const luaB = bD.lastUsedAt ? bD.lastUsedAt.toDate().getTime() : 0;
        return luaA - luaB;
      });

      prompts = newEligiblePrompts.slice(0, BATCH_SIZE).map((doc) => ({
        id: doc.id,
        text: doc.data().text,
        category: doc.data().category || 'genericVocab',
        difficulty: doc.data().difficulty || 50
      }));

      console.log(
        `[API /prompts] After generation attempt, proceeding with ${prompts.length} prompts for user ${userId}.`,
      );

      if (prompts.length === 0) {
        console.error(
          `[API /prompts] Critical Failure: Initial cache was empty and failed to generate any new prompts for user ${userId}.`,
        );
        return NextResponse.json(
          {
            error: "We're having trouble preparing your exercises right now. Please try again in a few moments.",
          },
          { status: 500 },
        );
      }
    }

    // Final check: If after all attempts, prompts array is still empty, it's an issue.
    if (prompts.length === 0) {
      console.error(
        `[API /prompts] Final check: No prompts available for user ${userId}. This should not happen.`,
      );
      return NextResponse.json(
        {
          error: "No prompts available at this moment. Please try again later.",
        },
        { status: 404 }, // Or 500, depending on how critical this is
      );
    }

    // --- Step 3: (Optional) Update lastUsedAt for the fetched prompts --- //
    // This is important for the 'orderBy lastUsedAt' logic to work correctly for subsequent fetches.
    // We'll do this without blocking the response.
    const updateBatch = adminFirestore.batch();
    const now = FieldValue.serverTimestamp(); // Use imported FieldValue

    prompts.forEach((prompt) => {
      const promptRef = userPromptsRef.doc(prompt.id);
      updateBatch.update(promptRef, {
        lastUsedAt: now,
        timesUsed: FieldValue.increment(1), // Use imported FieldValue
      });
    });

    updateBatch.commit().catch((err) => {
      console.error(
        `[API /prompts] Error updating lastUsedAt/timesUsed for prompts for user ${userId}:`,
        err,
      );
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
