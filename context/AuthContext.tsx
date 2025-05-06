'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth } from '@/lib/firebaseClient'; // Adjust path if needed
import { User, onAuthStateChanged } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Listen for Firebase authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in.
        setUser(firebaseUser);

        // Manage session cookie
        try {
          const idToken = await firebaseUser.getIdToken();
          // Send the token to your backend to create a session cookie
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ idToken: idToken })
          });
        } catch (error) {
          console.error("Error setting session cookie:", error);
          // Handle error appropriately, maybe sign out user
          // await auth.signOut(); // Consider this
        }

      } else {
        // User is signed out.
        setUser(null);

        // Clear the session cookie by calling the backend
        try {
           await fetch('/api/auth/session', { method: 'DELETE' });
        } catch (error) {
          console.error("Error clearing session cookie:", error);
        }
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const value = { user, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 