import { NextRequest, NextResponse } from "next/server";
import { generatePromptDocs } from "@/lib/openai";
import { adminAuth, adminFirestore } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * POST handler to reset prompts: deletes all existing prompts and regenerates them.
 */
export async function POST(req: NextRequest) {
  try {
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
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Invalid session" },
        { status: 401 },
      );
    }

    const usersCollection = adminFirestore.collection("users");
    const userDocRef = usersCollection.doc(userId);
    const promptPoolRef = userDocRef.collection("promptPool");
    const snapshot = await promptPoolRef.get(); // Directly use get() on the collection reference
    const deletePromises = snapshot.docs.map((doc) => doc.ref.delete()); // Use doc.ref.delete()
    await Promise.all(deletePromises);
    console.log(`[API /reset-prompts] Deleted all prompts for user ${userId}.`);

    await generatePromptDocs({ uid: userId });
    console.log(`[API /reset-prompts] Regenerated prompts for user ${userId}.`);

    return NextResponse.json(
      { message: "Prompts reset successfully." },
      { status: 200 },
    );
  } catch (error) {
    console.error("[API /reset-prompts] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset prompts." },
      { status: 500 },
    );
  }
}
