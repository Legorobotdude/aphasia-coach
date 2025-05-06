'use client';

import React from 'react';
import VoiceSession from './components/VoiceSession';
import { useAuth } from '@/context/AuthContext'; // Assuming AuthContext provides user info
import { useRouter } from 'next/navigation';

/**
 * Main page component for the voice session.
 * Renders the VoiceSession component if the user is authenticated.
 */
export default function SessionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated and not loading
  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login'); // Or your login route
    }
  }, [user, loading, router]);

  // Show loading indicator or null while checking auth or redirecting
  if (loading || !user) {
    return <div>Loading...</div>; // Or a proper loading skeleton
  }

  // Render the main session component
  return <VoiceSession />;
} 