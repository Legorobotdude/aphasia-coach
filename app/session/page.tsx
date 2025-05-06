'use client';

import React, { Suspense } from 'react';
import VoiceSession from './components/VoiceSession';
import { useAuth } from '@/context/AuthContext'; // Assuming AuthContext provides user info
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Inner component to handle logic dependent on searchParams.
 * This component will be wrapped in Suspense.
 */
function SessionContent() {
  const searchParams = useSearchParams(); // Get search params

  // Check for focus mode parameters
  const mode = searchParams.get('mode');
  const promptIdFromQuery = searchParams.get('promptId');

  let focusModePromptId: string | undefined = undefined;
  if (mode === 'focus' && promptIdFromQuery) {
    focusModePromptId = promptIdFromQuery;
    console.log(`[SessionPage] Focus mode activated for promptId: ${focusModePromptId}`);
  }

  // Render the main session component, passing focusModePromptId if set
  return <VoiceSession focusModePromptId={focusModePromptId} />;
}

/**
 * Main page component for the voice session.
 * Renders the VoiceSession component if the user is authenticated,
 * using Suspense for components that use useSearchParams.
 */
export default function SessionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // const searchParams = useSearchParams(); // Moved to SessionContent

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

  // Render the SessionContent component wrapped in Suspense
  return (
    <Suspense fallback={<div>Loading session details...</div>}>
      <SessionContent />
    </Suspense>
  );
} 