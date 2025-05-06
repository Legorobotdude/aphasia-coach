'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, getFirestoreInstance } from '@/lib/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
// import StyledFirebaseAuth from './StyledFirebaseAuth'; // Assuming path is correct
// import { uiConfig } from '@/lib/firebaseUIConfig'; // Assuming path is correct

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Sign in with Google popup
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth as ReturnType<typeof getAuth>, provider);
      const user = result.user;

      if (!user) {
        throw new Error('Failed to authenticate');
      }

      // Get user's ID token
      const idToken = await user.getIdToken();

      // Send token to server to create session cookie
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      // Check if user has completed onboarding
      const userRef = doc(getFirestoreInstance(), "users", user.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists() && userSnap.data().onboardComplete) {
        // Redirect to session page if onboarding is complete
        router.push('/session');
      } else {
        // Create/update user document
        await setDoc(
          userRef,
          {
            fullName: user.displayName,
            email: user.email,
            lastLogin: new Date(),
            onboardComplete: false
          },
          { merge: true }
        );
        
        // Redirect to onboarding flow
        router.push('/onboarding');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Failed to log in');
    } finally {
      setIsLoading(false);
    }
  };

  // Handlers for FirebaseUI - currently unused as component is commented out
  // const handleLoginSuccess = (authResult: any, redirectUrl?: string) => {
  //   console.log('Login successful:', authResult);
  //   router.push('/onboarding');
  // };

  // const handleLoginError = (error: any) => {
  //   console.error('Login failed:', error);
  // };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-24">
      <div className="max-w-5xl w-full flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Aphasia Coach
        </h1>
        
        <p className="text-xl md:text-2xl mb-12 max-w-2xl">
          Personalized voice therapy to help you practice word retrieval and track your progress
        </p>
        
        <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-6">Welcome</h2>
          
          <p className="mb-8">
            Sign in to start your personalized therapy sessions or continue your progress
          </p>
          
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center justify-center disabled:bg-blue-400"
          >
            {isLoading ? (
              <span className="mr-2">Loading...</span>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </button>
          
          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-md">
              {error}
            </div>
          )}
        </div>
      </div>
      
      <footer className="w-full mt-12 text-center text-sm text-gray-500">
        <p>Aphasia Coach &copy; {new Date().getFullYear()}</p>
      </footer>
    </main>
  );
}
