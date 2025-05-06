import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  type DocumentReference,
} from 'firebase/firestore';
import { getFirestoreInstance } from '../firebaseConfig';
import type { CollectionPath, FirestoreSchema } from '../types/firestore';

/**
 * Creates or updates a document with timestamps
 */
export async function setDocument<T extends CollectionPath>(
  collection: T,
  id: string,
  data: Partial<FirestoreSchema[T]>,
  merge = true
) {
  const firestore = getFirestoreInstance();
  const ref = doc(firestore, collection, id);
  const timestamp = serverTimestamp();
  const docData = {
    ...data,
    updatedAt: timestamp,
    ...(merge ? {} : { createdAt: timestamp }),
  };

  await setDoc(ref, docData, { merge });
  return ref;
}

/**
 * Updates specific fields in a document
 */
export async function updateDocument<T extends CollectionPath>(
  collection: T,
  id: string,
  data: Partial<FirestoreSchema[T]>
) {
  const ref = doc(getFirestoreInstance(), collection, id);
  const timestamp = serverTimestamp();
  await updateDoc(ref, {
    ...data,
    updatedAt: timestamp,
  });
  return ref;
}

/**
 * Gets a document by ID with type safety
 */
export async function getDocument<T extends CollectionPath>(
  collection: T,
  id: string
) {
  const ref = doc(getFirestoreInstance(), collection, id) as DocumentReference<FirestoreSchema[T]>;
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * Creates a typed document reference
 */
export function getDocumentRef<T extends CollectionPath>(
  collection: T,
  id: string
): DocumentReference<FirestoreSchema[T]> {
  return doc(getFirestoreInstance(), collection, id) as DocumentReference<FirestoreSchema[T]>;
} 