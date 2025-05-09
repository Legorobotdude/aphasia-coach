'use client';

import React, { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import useSWR from 'swr';
import { db } from '@/lib/firebaseClient';
import {
  collection, query, where, orderBy, limit, getDocs, Timestamp
} from 'firebase/firestore';
import dynamic from 'next/dynamic';
import { format } from 'date-fns'; // Ensure date-fns is installed and imported

// --- Types (Should align with component props and Firestore data) ---
interface Session {
  id: string;
  date: Date; // Renamed from startedAt to match component props
  accuracy: number;
  latencyMs: number;
  durationSec: number;
  sessionNumber?: number; // Optional for chart tooltips
}

interface Utterance {
  id: string;
  prompt: string;
  score: number;
  // Add other fields if needed by WordRevisitList logic
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted';
}

// --- Firestore Fetchers (Defined outside the component) ---
const fetchRecentSessions = async (uid: string | null): Promise<Session[]> => {
  if (!uid) return [];
  console.log('Fetching recent sessions for UID:', uid);
  const sessionsCollection = collection(db, 'sessions');
  const q = query(sessionsCollection,
                  where('ownerUid', '==', uid),
                  orderBy('startedAt', 'desc'), // Use original Firestore field name 'startedAt'
                  limit(30));
  const snapshot = await getDocs(q);
  console.log(`Found ${snapshot.docs.length} sessions.`);
  return snapshot.docs.map((doc, index) => {
      const data = doc.data();
      // Convert Timestamp and map to Session interface
      return {
          id: doc.id,
          date: (data.startedAt as Timestamp)?.toDate() || new Date(), // Map startedAt to date
          accuracy: data.accuracy ?? 0,
          latencyMs: data.latencyMs ?? 0,
          durationSec: data.durationSec ?? 0,
          sessionNumber: snapshot.docs.length - index
      };
  }).filter(session => session.date instanceof Date); // Ensure date conversion worked
};

// --- NEW FETCHER for Prompts to Revisit from the generatedPrompts collection ---
interface RevisitPrompt {
  id: string;       // Firestore document ID of the prompt in generatedPrompts
  text: string;     // The prompt text
  lastScore: number; // The last score achieved on this prompt
  lastUsedAt: Date | null; // When it was last used
}

const fetchPromptsToRevisit = async (uid: string | null): Promise<RevisitPrompt[]> => {
  if (!uid) {
    console.log('[Dashboard] fetchPromptsToRevisit: No UID provided.');
    return [];
  }
  console.log('[Dashboard] fetchPromptsToRevisit: Fetching for UID:', uid);

  const promptsToRevisitRef = collection(db, 'users', uid, 'promptPool');
  const q = query(promptsToRevisitRef,
                  where('timesUsed', '>', 0),
                  where('lastScore', '<', 0.6),
                  orderBy('lastScore', 'asc'),
                  orderBy('lastUsedAt', 'desc'),
                  limit(10)
                 );

  try {
    const snapshot = await getDocs(q);
    console.log(`[Dashboard] fetchPromptsToRevisit: Found ${snapshot.docs.length} prompts to revisit for UID ${uid}.`);
    if (snapshot.docs.length > 0) {
        console.log('[Dashboard] fetchPromptsToRevisit: First few prompts:', snapshot.docs.slice(0,3).map(d => ({id: d.id, ...d.data()})));
    }
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        text: data.text ?? '',
        lastScore: data.lastScore ?? 0,
        lastUsedAt: (data.lastUsedAt as Timestamp)?.toDate() || null,
      };
    });
  } catch (error) {
    console.error(`[Dashboard] fetchPromptsToRevisit: Error fetching prompts for UID ${uid}:`, error);
    return []; 
  }
};

const fetchInvites = async (uid: string | null): Promise<Invite[]> => {
  if (!uid) return [];
  console.log('Fetching invites for UID:', uid);
  const invitesCol = collection(db, 'users', uid, 'invites');
  const snapshot = await getDocs(query(invitesCol));
  console.log(`Found ${snapshot.docs.length} invites.`);
  return snapshot.docs.map(doc => ({
      id: doc.id,
      email: doc.data().email ?? '',
      role: doc.data().role ?? '',
      status: doc.data().status ?? 'pending',
  }));
};

// --- Helper Loading Skeletons ---
const ChartSkeleton: React.FC<{ title: string }> = ({ title }) => (
    <div className="p-4 border rounded shadow-sm bg-white h-64 md:h-80 animate-pulse">
      <h2 className="text-lg font-semibold mb-2 text-center text-gray-400">{title}</h2>
      <div className="flex items-center justify-center h-full bg-gray-200 rounded">
        <span className="text-gray-400">Loading Chart...</span>
      </div>
    </div>
);
const WidgetSkeleton: React.FC<{ title: string }> = ({ title }) => (
    <div className="p-4 border rounded shadow-sm bg-white animate-pulse">
      <h2 className="text-lg font-semibold mb-3 text-gray-400">{title}</h2>
      <div className="h-24 bg-gray-200 rounded"></div>
    </div>
);

// --- Dynamic Imports ---
const AccuracyChart = dynamic(() => import('./components/AccuracyChart'), { ssr: false, loading: () => <ChartSkeleton title="Accuracy Trend" /> });
const LatencyChart = dynamic(() => import('./components/LatencyChart'), { ssr: false, loading: () => <ChartSkeleton title="Response Latency (Avg)" /> });
const StreakWidget = dynamic(() => import('./components/StreakWidget'), { ssr: false, loading: () => <WidgetSkeleton title="Daily Streak" /> });
const WordRevisitList = dynamic(() => import('./components/WordRevisitList'), { ssr: false, loading: () => <WidgetSkeleton title="Words to Revisit" /> });
const SessionTable = dynamic(() => import('./components/SessionTable'), { ssr: false, loading: () => <WidgetSkeleton title="Recent Sessions" /> });
const CaregiverInvite = dynamic(() => import('./components/CaregiverInvite'), { ssr: false, loading: () => <WidgetSkeleton title="Caregiver Access" /> });

// --- Main Component ---
export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;

  // Fetch Data using SWR
  const { data: sessions, error: sessionsError } = useSWR(uid ? ['sessions', uid] : null, () => fetchRecentSessions(uid));
  const { data: promptsToRevisit, error: promptsToRevisitError } = useSWR(uid ? ['promptsToRevisit', uid] : null, () => fetchPromptsToRevisit(uid));
  const { data: invites, error: invitesError } = useSWR(uid ? ['invites', uid] : null, () => fetchInvites(uid));

  // --- Derived Data Calculation ---
  const currentStreak = useMemo(() => {
      // Placeholder logic - TODO: Implement real streak calculation
      if (!sessions || sessions.length === 0) return 0;
       // Add actual logic here based on session dates
      return 3; // Placeholder
  }, [sessions]);

  const completedDays = useMemo(() => {
      const map = new Map<string, boolean>();
      sessions?.forEach(s => {
          if (s.date instanceof Date && !isNaN(s.date.getTime())) {
              map.set(format(s.date, 'yyyy-MM-dd'), true);
          }
      });
      return map;
  }, [sessions]);

  const revisitWords = useMemo(() => {
      if (!promptsToRevisit) return [];
      // promptsToRevisit is already RevisitPrompt[] which matches what WordRevisitList now expects
      return promptsToRevisit;
  }, [promptsToRevisit]);

  // --- Render Logic ---
  if (authLoading) {
    return <div className="text-center p-10">Authenticating...</div>;
  }

  if (!user) {
      return <div className="text-center p-10">Please log in to view your dashboard.</div>;
  }

  // Consolidated Error Handling
  const hasError = sessionsError || promptsToRevisitError || invitesError;
  if (hasError) {
      console.error("Dashboard Fetch Error:", { sessionsError, promptsToRevisitError, invitesError });
      // Display specific errors if needed, or a general message
      let errorMsg = 'Failed to load some dashboard data. Please try again later.';
      if (sessionsError) errorMsg = `Failed to load sessions: ${sessionsError.message || sessionsError}`;
      else if (promptsToRevisitError) errorMsg = `Failed to load words to revisit: ${promptsToRevisitError.message || promptsToRevisitError}`;
      else if (invitesError) errorMsg = `Failed to load invites: ${invitesError.message || invitesError}`;

      return <div className="text-center p-10 text-red-600">{errorMsg}</div>;
  }

  // Prepare data for components (use defaults if loading/undefined via SWR)
  // SWR handles the loading state implicitly, components will receive undefined or data
  const accuracyData = sessions ?? [];
  const latencyData = sessions ?? [];
  const recentSessions = sessions ?? [];
  const caregiverInvites = invites ?? [];

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Your Progress Dashboard</h1>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AccuracyChart data={accuracyData} />
        <LatencyChart data={latencyData} />
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pass potentially undefined sessions to StreakWidget's completedDays calc */}
        <StreakWidget currentStreak={currentStreak} completedDays={completedDays} />
         {/* Pass potentially undefined utterances to revisitWords calc */}
        <WordRevisitList words={revisitWords} />
      </div>

      {/* Session Table */}
      <SessionTable sessions={recentSessions} />

      {/* Caregiver Invite */}
      <CaregiverInvite invites={caregiverInvites} />
    </div>
  );
}