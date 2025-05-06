import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase for client-side
let firebaseApp: FirebaseApp | undefined;
let auth: Auth | undefined;
let firestore: Firestore | undefined;

if (typeof window !== 'undefined' && !getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  firestore = getFirestore(firebaseApp);
}

// Export the potentially undefined instances if needed directly
export { firebaseApp, auth };

// Export a getter function for Firestore that ensures initialization
export function getFirestoreInstance(): Firestore {
  if (!firestore) {
    if (typeof window !== 'undefined') {
      if (!getApps().length) {
        // Initialize if not already done (e.g., during SSR/fast refresh edge cases)
        const app = initializeApp(firebaseConfig);
        firestore = getFirestore(app);
      } else {
        // Use the existing app if initialization happened but variable wasn't assigned (unlikely but safe)
        firestore = getFirestore(getApps()[0]);
      }
    } else {
      // This case should ideally not happen if called from client-side code
      // But throw an error to make it explicit
      throw new Error("Firestore can only be initialized on the client-side.");
    }
  }
  if (!firestore) {
     // If it's STILL undefined after the above, something is wrong
     throw new Error("Failed to initialize Firestore.");
  }
  return firestore;
} 