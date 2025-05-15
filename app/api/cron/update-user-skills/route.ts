import { NextResponse } from "next/server";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { generatePromptDocs } from "../../../../lib/openai";

// Initialize Firebase app
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function GET() {
  try {
    // Fetch all users
    const usersSnapshot = await getDocs(collection(db, "users"));
    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    for (const user of users) {
      const uid = user.id;
      // Use type assertion for skillScores as {[key: string]: number}
      const skillScores =
        (user as { skillScores?: { [category: string]: number } })
          .skillScores || {};

      // Update skill scores if needed (future decay logic can be added here)
      // For now, we'll just ensure the prompt pool is topped up

      const categories = [
        "genericVocab",
        "personalVocab",
        "challenge",
      ] as const;
      for (const category of categories) {
        const targetDifficulty = skillScores[category] || 50;
        await generatePromptDocs({
          uid,
          targetCategory: category,
          targetDifficulty,
          window: 8,
          batch: 20,
        });
      }

      // Log the update
      console.log(`Updated prompt pool for user ${uid}`);
    }

    return NextResponse.json(
      { message: "Nightly update completed successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error in nightly update:", error);
    return NextResponse.json(
      { error: "Failed to complete nightly update" },
      { status: 500 },
    );
  }
}
