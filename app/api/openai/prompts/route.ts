import { NextRequest, NextResponse } from "next/server";
import { generatePromptDocs } from "@/lib/openai";
import { adminAuth, adminFirestore } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Set runtime to Node.js (not Edge)
export const runtime = "nodejs";

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
    const userDocRef = adminFirestore.collection("users").doc(userId);
    const userDoc = await userDocRef.get();
    const userData = userDoc.data();
    const skillScores = userData?.skillScores || {
      genericVocab: 50,
      personalVocab: 50,
      challenge: 50,
    };
    const category = url.searchParams.get("category") || "genericVocab";
    const skill = skillScores[category] || 50;
    const band = 8; // Difficulty window

    console.log(`[API /prompts] User ${userId} skill scores:`, skillScores);
    console.log(
      `[API /prompts] Filtering for category ${category} with skill ${skill}, difficulty band ${skill - band} to ${skill + band}`,
    );

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
        return (
          difficulty >= skill - widerBand && difficulty <= skill + widerBand
        );
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

    // Categorize prompts into main, easyBackups, and hardBackups
    const mainPrompts = [];
    const easyBackups = [];
    const hardBackups = [];
    for (const doc of eligiblePrompts) {
      const d = doc.data();
      let difficulty = d.difficulty || 50;
      // Ensure difficulty is within 0-100 range
      difficulty = Math.max(0, Math.min(100, difficulty));
      const prompt = {
        id: doc.id,
        text: d.text,
        category: d.category || "genericVocab",
        difficulty: difficulty,
      };
      if (difficulty < skill - band / 2) {
        if (easyBackups.length < 3) easyBackups.push(prompt);
      } else if (difficulty > skill + band / 2) {
        if (hardBackups.length < 3) hardBackups.push(prompt);
      } else {
        if (mainPrompts.length < BATCH_SIZE) mainPrompts.push(prompt);
      }
      if (
        mainPrompts.length === BATCH_SIZE &&
        easyBackups.length === 3 &&
        hardBackups.length === 3
      )
        break;
    }

    // If not enough main prompts, fill from backups
    while (mainPrompts.length < BATCH_SIZE && easyBackups.length > 0) {
      mainPrompts.push(easyBackups.shift());
    }
    while (mainPrompts.length < BATCH_SIZE && hardBackups.length > 0) {
      mainPrompts.push(hardBackups.shift());
    }

    console.log(
      `[API /prompts] Using ${mainPrompts.length} main prompts, ${easyBackups.length} easy backups, and ${hardBackups.length} hard backups for user ${userId}.`,
    );

    // If not enough main prompts after all filtering, generate more
    if (
      mainPrompts.length < BATCH_SIZE ||
      easyBackups.length < 3 ||
      hardBackups.length < 3
    ) {
      console.log(
        `[API /prompts] Not enough prompts in cache (Main: ${mainPrompts.length}/${BATCH_SIZE}, Easy: ${easyBackups.length}/3, Hard: ${hardBackups.length}/3). Attempting to generate new prompts for user ${userId}.`,
      );

      // Generate prompts for different difficulty levels
      const generationPromises = [
        generatePromptDocs({
          uid: userId,
          targetCategory: category as
            | "genericVocab"
            | "personalVocab"
            | "challenge"
            | "open",
          targetDifficulty: skill,
          window: band,
          batch: BATCH_SIZE, // For main prompts
        }).then((result) => {
          console.log(
            `[API /prompts] Generated ${Array.isArray(result) ? result.length : "N/A"} main prompts for skill ${skill}`,
          );
          return result;
        }),
        generatePromptDocs({
          uid: userId,
          targetCategory: category as
            | "genericVocab"
            | "personalVocab"
            | "challenge"
            | "open",
          targetDifficulty: Math.max(0, skill - 15),
          window: band,
          batch: 6, // For easy backups
        }).then((result) => {
          console.log(
            `[API /prompts] Generated ${Array.isArray(result) ? result.length : "N/A"} easy prompts for skill ${Math.max(0, skill - 15)}`,
          );
          return result;
        }),
        generatePromptDocs({
          uid: userId,
          targetCategory: category as
            | "genericVocab"
            | "personalVocab"
            | "challenge"
            | "open",
          targetDifficulty: Math.min(100, skill + 15),
          window: band,
          batch: 6, // For hard backups
        }).then((result) => {
          console.log(
            `[API /prompts] Generated ${Array.isArray(result) ? result.length : "N/A"} hard prompts for skill ${Math.min(100, skill + 15)}`,
          );
          return result;
        }),
      ];

      await Promise.all(generationPromises);

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
      if (newEligiblePrompts.length < BATCH_SIZE + 6) {
        newEligiblePrompts = newPromptDocs.filter((doc) => {
          const d = doc.data();
          const lastUsedAt = d.lastUsedAt ? d.lastUsedAt.toDate().getTime() : 0;
          // Only filter by recently used
          if (lastUsedAt > recentCutoff) return false;
          return true;
        });
      }
      // As a last resort, allow everything
      if (newEligiblePrompts.length < BATCH_SIZE + 6) {
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

      // Reset current lists to re-categorize with new prompts
      mainPrompts.length = 0;
      easyBackups.length = 0;
      hardBackups.length = 0;

      // Log difficulty values for debugging
      console.log(
        `[API /prompts] Difficulty values of eligible prompts for user ${userId}:`,
      );
      newEligiblePrompts.forEach((doc) => {
        const d = doc.data();
        console.log(
          `Prompt ID: ${doc.id}, Difficulty: ${d.difficulty || 50}, Category: ${d.category || "genericVocab"}`,
        );
      });

      // Categorize newly generated prompts with more flexible logic
      for (const doc of newEligiblePrompts) {
        const d = doc.data();
        let difficulty = d.difficulty || 50;
        // Ensure difficulty is within 0-100 range
        difficulty = Math.max(0, Math.min(100, difficulty));
        const prompt = {
          id: doc.id,
          text: d.text,
          category: d.category || "genericVocab",
          difficulty: difficulty,
        };
        // More flexible categorization: prioritize filling main prompts first
        if (mainPrompts.length < BATCH_SIZE) {
          mainPrompts.push(prompt);
        } else if (difficulty < skill) {
          if (easyBackups.length < 3) easyBackups.push(prompt);
        } else {
          if (hardBackups.length < 3) hardBackups.push(prompt);
        }
        if (
          mainPrompts.length === BATCH_SIZE &&
          easyBackups.length === 3 &&
          hardBackups.length === 3
        )
          break;
      }

      // If still not enough main prompts, fill from any remaining eligible prompts
      for (const doc of newEligiblePrompts) {
        if (mainPrompts.length >= BATCH_SIZE) break;
        const d = doc.data();
        if (!mainPrompts.some((p) => p && p.id === doc.id)) {
          let difficulty = d.difficulty || 50;
          difficulty = Math.max(0, Math.min(100, difficulty));
          mainPrompts.push({
            id: doc.id,
            text: d.text,
            category: d.category || "genericVocab",
            difficulty: difficulty,
          });
        }
      }

      console.log(
        `[API /prompts] After generation and flexible categorization, using ${mainPrompts.length} main prompts, ${easyBackups.length} easy backups, and ${hardBackups.length} hard backups for user ${userId}.`,
      );

      // Final check: If after generation still not enough prompts, log error but proceed
      if (mainPrompts.length === 0) {
        console.error(
          `[API /prompts] Critical Failure: Failed to generate any new prompts for user ${userId}.`,
        );
        return NextResponse.json(
          {
            error:
              "We're having trouble preparing your exercises right now. Please try again in a few moments.",
          },
          { status: 500 },
        );
      }
    }

    // --- Step 3: (Optional) Update lastUsedAt for the fetched prompts --- //
    // This is important for the 'orderBy lastUsedAt' logic to work correctly for subsequent fetches.
    // We'll do this without blocking the response.
    const updateBatch = adminFirestore.batch();
    const now = FieldValue.serverTimestamp(); // Use imported FieldValue

    mainPrompts.forEach((prompt) => {
      if (prompt) {
        const promptRef = userPromptsRef.doc(prompt.id);
        updateBatch.update(promptRef, {
          lastUsedAt: now,
          timesUsed: FieldValue.increment(1), // Use imported FieldValue
        });
      }
    });

    easyBackups.forEach((prompt) => {
      if (prompt) {
        const promptRef = userPromptsRef.doc(prompt.id);
        updateBatch.update(promptRef, {
          lastUsedAt: now,
          timesUsed: FieldValue.increment(1),
        });
      }
    });

    hardBackups.forEach((prompt) => {
      if (prompt) {
        const promptRef = userPromptsRef.doc(prompt.id);
        updateBatch.update(promptRef, {
          lastUsedAt: now,
          timesUsed: FieldValue.increment(1),
        });
      }
    });

    updateBatch.commit().catch((err) => {
      console.error(
        `[API /prompts] Error updating lastUsedAt/timesUsed for prompts for user ${userId}:`,
        err,
      );
      // Non-critical error, don't fail the request.
    });

    return NextResponse.json({
      main: mainPrompts,
      easyBackups: easyBackups,
      hardBackups: hardBackups,
    });
  } catch (error) {
    console.error("[API /prompts] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
