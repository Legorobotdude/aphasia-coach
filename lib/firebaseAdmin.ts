import { getApps, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Use environment variable for service account or parse JSON
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : undefined;

// Initialize Firebase Admin SDK for server-side only
const firebaseAdminApp =
  getApps().length === 0
    ? initializeApp({
        credential: serviceAccount
          ? cert(serviceAccount)
          : cert({
              projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(
                /\\n/g,
                "\n",
              ),
            }),
        databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com`,
      })
    : getApps()[0];

// Create and export Firestore and Auth instances
const adminFirestore = getFirestore(firebaseAdminApp);
const adminAuth = getAuth(firebaseAdminApp);

export { adminFirestore, adminAuth };
