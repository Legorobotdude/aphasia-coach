import { Timestamp } from 'firebase/firestore';

export interface User {
  fullName: string;
  timezone: string;
  onboardComplete: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Topic {
  label: string;
  embedding: number[];
  weight: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Session {
  startedAt: Timestamp;
  durationSec: number;
  accuracy: number;
  latencyMs: number;
  createdAt?: Timestamp;
}

export interface Utterance {
  prompt: string;
  response: string;
  score: number;
  latencyMs: number;
  createdAt?: Timestamp;
}

// Collection paths
export const COLLECTIONS = {
  USERS: 'users',
  TOPICS: 'topics',
  SESSIONS: 'sessions',
  UTTERANCES: 'utterances',
} as const;

// Helper type for document references
export type CollectionPath = typeof COLLECTIONS[keyof typeof COLLECTIONS];

// Firestore document types mapped to their collections
export interface FirestoreSchema {
  [COLLECTIONS.USERS]: User;
  [COLLECTIONS.TOPICS]: Topic;
  [COLLECTIONS.SESSIONS]: Session;
  [COLLECTIONS.UTTERANCES]: Utterance;
} 