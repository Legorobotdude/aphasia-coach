"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { QUESTIONS } from "../questions";
import { Recorder } from "./Recorder";
import { getFirestoreInstance } from "@/lib/firebaseConfig";
import { useRecorder } from "@/lib/audio";

// Type for cached onboarding data
interface CachedOnboardingData {
  label: string;
  question: string;
  transcript: string;
  recordingBlob?: Blob;
  createdAt: Date;
}

// IndexedDB for offline support
const DB_NAME = "aphasiaCoach";
const STORE_NAME = "onboardingAnswers";
let db: IDBDatabase | null = null;

// Initialize IndexedDB
async function initDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    // Check if running in a browser environment before accessing indexedDB
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn("IndexedDB is not available in this environment.");
      // Resolve with null or a mock DB if necessary for server-side rendering or testing
      resolve(null as any); // Or handle appropriately
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject("Error opening IndexedDB");

    request.onupgradeneeded = () => {
      const db = request.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "label" });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
  });
}

// Save data to IndexedDB
async function saveToIndexedDB(
  label: string,
  data: Partial<CachedOnboardingData>,
) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ ...data, label });

    request.onerror = () => reject("Error saving to IndexedDB");
    request.onsuccess = () => resolve(request.result);
  });
}

// Get data from IndexedDB
async function getFromIndexedDB(
  label: string,
): Promise<CachedOnboardingData | null> {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(label);

    request.onerror = () => reject("Error reading from IndexedDB");
    request.onsuccess = () =>
      resolve((request.result as CachedOnboardingData) || null);
  });
}

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get step from URL or default to 1
  const initialStep = Number(searchParams.get("step") || 1);
  const [step, setStep] = useState(initialStep);

  // Enhanced Recording State
  const [wizardState, setWizardState] = useState<
    "ready" | "playing_question" | "recording" | "transcribing" | "confirming"
  >("ready");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorderError, setRecorderError] = useState<Error | null>(null); // Specific recorder errors
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const [hasUserGestured, setHasUserGestured] = useState(false); // New state

  // --- AudioContext for playing API-sourced audio --- //
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [isQuestionPlaying, setIsQuestionPlaying] = useState(false);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !audioContext) {
      const newAudioContext = new window.AudioContext();
      setAudioContext(newAudioContext);
    }
    return () => {
      currentAudioSource?.stop(); // Stop any playing audio
      currentAudioSource?.disconnect();
      audioContext?.close().catch(console.error); // Clean up on unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount
  // --- End AudioContext --- //

  // Current question
  const currentQuestion = QUESTIONS[step - 1];

  // Recording state & Wizard Flow
  const [transcript, setTranscript] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false); // Reinstate submitting flag
  const [submitMessage, setSubmitMessage] = useState<string>(""); // For more specific feedback during submission
  const [error, setError] = useState<string | null>(null); // Keep this error state for general errors
  const [voiceOnly, setVoiceOnly] = useState(false); // Keep voice-only toggle

  // Instantiate the recorder hook
  const {
    startRecording,
    stopRecording,
    error: recorderHookError, // Capture errors from the hook itself
  } = useRecorder({
    onDataAvailable: (blob: Blob) => {
      // Log blob details before sending
      console.log(
        `Recording complete. Blob details: size=${blob.size}, type=${blob.type}`,
      );

      // Basic check moved to API route - client just sends what it gets

      setWizardState("transcribing"); // Move to transcribing state
      handleTranscription(blob); // Trigger transcription
    },
  });

  // Initialize IndexedDB on component mount
  useEffect(() => {
    initDB().catch(console.error);

    // Check for cached data
    const checkCachedData = async () => {
      try {
        const cached = await getFromIndexedDB(currentQuestion.label);
        if (cached) {
          setTranscript(cached.transcript || "");
          if (cached.recordingBlob) {
            // setRecordingBlob(cached.recordingBlob); // Don't store blob in state, handle directly if needed
          }
        }
      } catch (err) {
        console.error("Error checking cached data:", err);
      }
    };

    checkCachedData();
  }, [currentQuestion.label]);

  // --- TTS Functionality --- //
  const playCurrentQuestion = useCallback(async () => {
    if (!currentQuestion || !currentQuestion.prompt || !audioContext || isQuestionPlaying) {
      return;
    }

    if (!hasUserGestured) setHasUserGestured(true); // Record user gesture

    console.log("Playing question:", currentQuestion.prompt);
    setIsQuestionPlaying(true);
    setWizardState("playing_question"); // Set wizard state

    try {
      // Stop any previously playing audio
      if (currentAudioSource) {
        currentAudioSource.stop();
        currentAudioSource.disconnect();
        setCurrentAudioSource(null);
      }
       // Ensure AudioContext is running
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const response = await fetch("/api/openai/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: currentQuestion.prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `TTS API request failed: ${response.status} - ${errorData.error || "Unknown API error"}`,
        );
      }

      const audioData = await response.arrayBuffer();
      if (audioData.byteLength === 0) {
        throw new Error("TTS API returned empty audio data.");
      }

      const audioBuffer = await audioContext.decodeAudioData(audioData);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      setCurrentAudioSource(source); // Store the source node

      source.onended = () => {
        console.log("Question finished playing.");
        setIsQuestionPlaying(false);
        setCurrentAudioSource(null);
        setWizardState("ready"); // Transition to ready after question plays
      };
      source.start();
    } catch (err) {
      console.error("Error playing question audio:", err);
      setError(err instanceof Error ? err.message : "Failed to play question");
      setIsQuestionPlaying(false);
      setCurrentAudioSource(null);
      setWizardState("ready"); // Revert to ready on error
    }
  }, [currentQuestion, audioContext, isQuestionPlaying, currentAudioSource, hasUserGestured]);

  // Auto-play question when step changes or component mounts with a valid question
  useEffect(() => {
    // Only auto-play if it's not the first step on initial load without a gesture,
    // OR if a user gesture has already occurred.
    if (currentQuestion && audioContext && wizardState === "ready" && !isQuestionPlaying) {
      if (step > 1 || hasUserGestured) {
         playCurrentQuestion();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, audioContext, step, hasUserGestured]); // Added step and hasUserGestured
  // --- End TTS Functionality --- //

  // Update URL when step changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set("step", step.toString());
    router.replace(`/onboarding?${params.toString()}`, { scroll: false });
  }, [step, router, searchParams]);

  // Handle timer logic
  useEffect(() => {
    if (wizardState === "recording" && !timer) {
      const interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
        // Optional: Add max duration stop logic here
        // if (recordingSeconds >= 90) { handleStopRecording(); }
      }, 1000);
      setTimer(interval);
    } else if (wizardState !== "recording" && timer) {
      clearInterval(timer);
      setTimer(null);
      setRecordingSeconds(0); // Reset timer display
    }

    // Cleanup timer on unmount or when state changes away from recording
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [wizardState, timer]); // Removed recordingSeconds from dependency array

  // Update recorderError state when hook reports an error
  useEffect(() => {
    if (recorderHookError) {
      console.error("Recorder hook reported error:", recorderHookError);
      setRecorderError(recorderHookError);
      setError(null); // Clear general errors when recorder specific error occurs
      setWizardState("ready"); // Reset on hook error
      // Timer cleanup is handled by the other useEffect watching wizardState
    }
  }, [recorderHookError]);

  // Function to handle transcription process
  const handleTranscription = async (blob: Blob) => {
    setError(null); // Clear general errors
    setRecorderError(null); // Clear recorder errors

    try {
      // Create form data for API request
      const formData = new FormData();
      formData.append("audio", blob);

      // Send to transcription API
      const response = await fetch("/api/openai/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      } else {
        const data = await response.json();
        console.log("Transcription successful:", data);
        setTranscript(data.text);
        setWizardState("confirming"); // Move to confirmation state

        // Cache locally (async, don't wait)
        saveToIndexedDB(currentQuestion.label, {
          question: currentQuestion.prompt,
          transcript: data.text,
          recordingBlob: blob, // Save blob too
          createdAt: new Date(),
        }).catch((err) => console.error("Failed to cache locally:", err));
      }
    } catch (err) {
      console.error("Error transcribing audio:", err);
      setError(
        err instanceof Error ? err.message : "Failed to transcribe audio",
      ); // Use setError for transcription errors
      setRecorderError(null); // Clear recorder error state
      setWizardState("ready"); // Reset to ready on transcription failure
    }
  };

  // Handler for the "Ready" button
  const handleReady = () => {
    setError(null);
    setRecorderError(null);
    setTranscript(""); // Clear previous transcript
    setRecordingSeconds(0); // Reset timer

    if (!hasUserGestured) setHasUserGestured(true); // Record user gesture

    // Stop TTS if it's playing
    if (currentAudioSource) {
      currentAudioSource.stop();
      currentAudioSource.disconnect();
      setCurrentAudioSource(null);
      setIsQuestionPlaying(false);
    }

    console.log("Ready clicked, starting recording...");
    startRecording();
    setWizardState("recording");
  };

  // Handler for the "Stop" button
  const handleStopRecording = () => {
    console.log("Stop clicked, stopping recording...");
    stopRecording();
    // onDataAvailable in useRecorder will trigger the next steps
    // We might briefly stay in 'recording' state until the blob is processed
  };

  // Handle submit and continue
  const handleContinue = async () => {
    if (wizardState !== "confirming") return; // Only continue from confirmation

    setIsSubmitting(true);
    setError(null);
    setRecorderError(null);

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        throw new Error("You must be logged in");
      }

      // Save to Firestore
      const dbInstance = getFirestoreInstance();
      const answerDocRef = doc(
        dbInstance,
        "users",
        user.uid,
        "onboardingAnswers",
        currentQuestion.label,
      );

      await setDoc(
        answerDocRef,
        {
          question: currentQuestion.prompt,
          transcript,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Handle final step
      if (step === QUESTIONS.length) {
        try {
          setIsSubmitting(true); // Ensure submission state is active
          setSubmitMessage("Finalizing onboarding and preparing your first set of exercises..."); // Feedback for user

          // Call API to initialize (generate and save) prompt docs
          // This is a POST request to the new endpoint. It uses the session cookie for auth.
          const initPromptsResponse = await fetch(`/api/user/initialize-prompts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json", // Though no body is sent, good practice
            },
            credentials: "include", // Important for sending session cookie
          });

          if (!initPromptsResponse.ok) {
            const errorData = await initPromptsResponse.json().catch(() => ({ error: "Failed to initialize exercises. Please try again later." }));
            throw new Error(errorData.error || "Failed to initialize exercises.");
          }

          const initResult = await initPromptsResponse.json();
          console.log("Prompt initialization successful:", initResult);
          setSubmitMessage("Exercises ready! Taking you to your first session..."); // Update feedback

          // Update user's onboarding status in Firestore
          await setDoc(
            doc(getFirestoreInstance(), "users", user.uid),
            {
              onboardComplete: true,
              promptsInitializedAt: serverTimestamp(), // Optionally track when prompts were set up
            },
            { merge: true },
          );

          // Redirect to session page after a brief delay to show the message
          setTimeout(() => {
            router.push("/session");
          }, 1500); // 1.5 seconds delay
          return; // Return here to prevent resetting state below for next step

        } catch (err) {
          console.error("Error during final onboarding step or prompt initialization:", err);
          setError(
            err instanceof Error ? err.message : "An unexpected error occurred during final setup.",
          );
          setSubmitMessage(""); // Clear specific submit message on error
          setIsSubmitting(false); // Ensure submitting is false on error
          return; // Stop further processing
        }
      }

      // Move to next step
      setWizardState("ready");
      setStep(step + 1);
      setTranscript("");
      // setRecordingBlob(null); // No blob state to clear
      setRecordingSeconds(0);
    } catch (err) {
      console.error("Error saving onboarding data:", err);
      setError(err instanceof Error ? err.message : "Failed to save data");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle re-record request
  const handleReRecord = () => {
    setWizardState("ready");
    setError(null);
    setRecorderError(null);
    setTranscript("");
    // setRecordingBlob(null); // No blob state to clear
    setRecordingSeconds(0);
    if (timer) clearInterval(timer);
    setTimer(null);
    console.log("Re-recording requested.");
  };

  // Sync offline data (Placeholder - needs implementation based on build plan 4.6)
  const syncOfflineData = async () => {
    // TODO: Implement logic to check connectivity and flush IndexedDB
    console.log("Offline sync check placeholder");
  };

  // Trigger offline sync check periodically or on visibility change
  useEffect(() => {
    // Example: Check on mount
    syncOfflineData();
  }, []);

  return (
    <div className="flex flex-col space-y-6">
      {/* Progress Bar */}
      <progress
        value={step}
        max={QUESTIONS.length}
        className="w-full h-2 rounded-md bg-gray-200 dark:bg-gray-700 [&::-webkit-progress-bar]:rounded-md [&::-webkit-progress-bar]:bg-gray-200 dark:[&::-webkit-progress-bar]:bg-gray-700 [&::-webkit-progress-value]:rounded-md [&::-webkit-progress-value]:bg-blue-500 dark:[&::-webkit-progress-value]:bg-blue-400"
      />

      {/* Question Prompt & Play Button */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md shadow-sm flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-blue-800 dark:text-blue-200">
            Step {step}:
          </p>
          <p className="mt-1 text-xl text-gray-700 dark:text-gray-300">
            {currentQuestion.prompt}
          </p>
        </div>
        <button
          onClick={playCurrentQuestion}
          disabled={isQuestionPlaying || !audioContext}
          className="ml-4 p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Play question audio"
        >
          {isQuestionPlaying ? (
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.75V6.25M12 17.75V19.25M5.75002 5.75002L6.81002 6.81002M17.19 17.19L18.25 18.25M4.75 12H6.25M17.75 12H19.25M6.81002 17.19L5.75002 18.25M18.25 5.75002L17.19 6.81002" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464A5 5 0 0112 11.035V17.586a.5.5 0 01-.814.39L7.186 15.58a5 5 0 010-7.16l4-2.4a.5.5 0 01.814.39v3.055zM12 6.035a7 7 0 010 11.93" />
            </svg>
          )}
        </button>
      </div>

      {/* Main Interaction Area */}
      <div className="flex flex-col items-center space-y-4">
        {/* State: Ready to Record */}
        {wizardState === "ready" && (
          <button
            onClick={handleReady}
            disabled={isQuestionPlaying} // Disable if question is playing
            className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white text-xl font-bold rounded-full shadow-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ready to Answer
          </button>
        )}

        {/* State: Playing Question (Visual Cue - can be a spinner or message) */}
        {wizardState === "playing_question" && (
          <div className="text-center py-4">
            <p className="text-lg text-gray-600 dark:text-gray-400">Playing question...</p>
            {/* Optional: Add a more prominent loading indicator here */}
          </div>
        )}

        {/* State: Recording */}
        {(wizardState === "recording" || wizardState === "transcribing") && (
          <>
            <Recorder
              isRecording={wizardState === "recording"} // Pass recording status
              recordingSeconds={recordingSeconds} // Pass timer value
              error={recorderError} // Pass recorder-specific errors
            />
            <button
              onClick={handleStopRecording}
              disabled={wizardState === "transcribing"} // Disable stop if already transcribing
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white text-lg font-semibold rounded-lg shadow transition duration-150 ease-in-out disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              {wizardState === "transcribing"
                ? "Processing..."
                : "Stop Recording"}
            </button>
          </>
        )}

        {/* State: Confirming Transcript */}
        {wizardState === "confirming" && (
          <div className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow">
            <label
              htmlFor="transcript"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Your Answer (edit if needed):
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full h-32 p-2 border border-gray-300 rounded-md"
              placeholder="Your transcribed answer will appear here..."
              disabled={isSubmitting}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleContinue();
                }
              }}
            />
          </div>
        )}

        {/* Global Error Display (for API/Firestore errors) */}
        {error &&
          wizardState !== "confirming" && ( // Don't show global error during confirmation if recorder error exists
            <div className="w-full mt-4 p-3 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-300 dark:border-red-700 rounded-md">
              Error: {error}
            </div>
          )}
      </div>

      {/* Bottom Controls: Continue / Re-record */}
      {wizardState === "confirming" && (
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={handleReRecord}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Re-record Answer
          </button>
          <button
            onClick={handleContinue}
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSubmitting
              ? submitMessage || "Saving..." // Show specific message or generic "Saving..."
              : step === QUESTIONS.length
                ? "Finish Onboarding & Start First Session"
                : "Looks Good, Next Step"}
          </button>
        </div>
      )}

      {/* Voice-only Toggle */}
      <div className="flex items-center justify-center mt-4">
        <input
          type="checkbox"
          id="voiceOnly"
          checked={voiceOnly}
          onChange={(e) => setVoiceOnly(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="voiceOnly">Voice-only mode (skip text editing)</label>
      </div>
    </div>
  );
}
