"use client";

import React, { useReducer, useEffect, useCallback } from "react";
import PromptCard from "./PromptCard"; // Import the real component
import RecorderControls from "./RecorderControls"; // Import the real component
import FeedbackOverlay from "./FeedbackOverlay"; // Import the real component
import ProgressRing from "./ProgressRing"; // Import the real component
// import LatencyTicker from './LatencyTicker';
import { useAuth } from "@/context/AuthContext"; // Assuming this provides user info
import { db } from "@/lib/firebaseClient"; // Reverted path
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  increment,
  getDoc,
} from "firebase/firestore";
import useSWR from "swr"; // For fetching prompts
import { useRecorder } from "@/lib/audio"; // Import the recorder hook
import { useRouter } from "next/navigation"; // Import useRouter
import { FieldValue } from "firebase/firestore";

// --- Types --- //
// Define Prompt and Utterance types matching Firestore and API structures
interface Prompt {
  id: string;
  text: string;
  // Add other fields if they exist, e.g., label
}

interface Utterance {
  id: string; // Firestore document ID
  prompt: string;
  promptId: string;
  response: string;
  score: number | null;
  feedback?: string;
  latencyMs: number | null;
  createdAt: FieldValue | Date; // Can be FieldValue when creating, Date when retrieved
  ownerUid: string;
  sessionId: string;
}

// --- State Machine --- //
type SessionState =
  | "IDLE"
  | "FETCHING_PROMPTS"
  | "INITIALIZING_SESSION"
  | "SESSION_READY"
  | "PLAYING_PROMPT"
  | "RECORDING"
  | "PROCESSING"
  | "FEEDBACK"
  | "COMPLETE"
  | "ERROR";

interface State {
  status: SessionState;
  prompts: Prompt[];
  currentPromptIndex: number;
  currentUtterance: Utterance | null;
  completedUtterances: Utterance[]; // Store successfully processed utterances
  error: string | null;
  sessionId: string | null;
  sessionDocCreated: boolean;
  recordingStartTime: number | null;
  sessionStartedAt: number | null; // Timestamp when session doc was created
}

type Action =
  | { type: "FETCH_PROMPTS_START" }
  | { type: "FETCH_PROMPTS_SUCCESS"; payload: Prompt[] } // Use Prompt[] type
  | { type: "FETCH_PROMPTS_ERROR"; payload: string }
  | { type: "START_PROMPT" }
  | { type: "PROMPT_PLAYED" }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "PROCESSING_START" }
  | { type: "PROCESSING_SUCCESS"; payload: Utterance } // Use Utterance type
  | { type: "PROCESSING_ERROR"; payload: string }
  | { type: "SHOW_FEEDBACK" }
  | { type: "NEXT_PROMPT" }
  | { type: "SESSION_COMPLETE" }
  | { type: "SESSION_DOC_CREATED" }
  | { type: "SET_RECORDING_START_TIME"; payload: number }
  | { type: "RESET" }
  | { type: "MARK_PASSED"; payload: { prompt: Prompt; ownerUid: string; } }
  | { type: "MARK_FAILED"; payload: { prompt: Prompt; ownerUid: string; } }
  | { type: "SESSION_INITIALIZATION_ERROR"; payload: string };

const initialState: State = {
  status: "IDLE",
  prompts: [],
  currentPromptIndex: 0,
  currentUtterance: null,
  completedUtterances: [], // Initialize as empty array
  error: null,
  sessionId: null,
  sessionDocCreated: false,
  recordingStartTime: null,
  sessionStartedAt: null, // Initialize as null
};

// --- Props for VoiceSession component --- //
interface VoiceSessionProps {
  focusModePromptId?: string; // Optional ID for focus mode
}

function sessionReducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_PROMPTS_START":
      // Reset completed utterances when starting a new fetch
      return {
        ...state,
        status: "FETCHING_PROMPTS",
        error: null,
        completedUtterances: [],
        sessionStartedAt: null,
      };
    case "FETCH_PROMPTS_SUCCESS":
      const newSessionId = doc(collection(db, "sessions")).id;
      return {
        ...state,
        status: "INITIALIZING_SESSION",
        prompts: action.payload,
        sessionId: newSessionId,
        currentPromptIndex: 0,
        sessionDocCreated: false,
        recordingStartTime: null,
        completedUtterances: [], // Ensure cleared on new session ID
        sessionStartedAt: null, // Ensure cleared
      };
    case "SESSION_DOC_CREATED":
      return {
        ...state,
        status: "SESSION_READY",
        sessionDocCreated: true,
        sessionStartedAt: Date.now(), // Record the start time
      };
    case "FETCH_PROMPTS_ERROR":
      return { ...state, status: "ERROR", error: action.payload };
    case "START_PROMPT":
      if (state.status === "SESSION_READY") {
        // Check if session is ready
        return { ...state, status: "PLAYING_PROMPT" };
      }
      return state; // Ignore if not ready
    case "PROMPT_PLAYED":
      return { ...state, status: "RECORDING" }; // Or 'READY_TO_RECORD' if manual start
    case "START_RECORDING":
      return { ...state, status: "RECORDING" };
    case "SET_RECORDING_START_TIME": // Store start time
      return { ...state, recordingStartTime: action.payload };
    case "STOP_RECORDING":
      return { ...state, status: "PROCESSING" };
    case "PROCESSING_START": // Optional explicit step
      return { ...state, status: "PROCESSING" };
    case "PROCESSING_SUCCESS":
      return {
        ...state,
        status: "FEEDBACK",
        currentUtterance: action.payload,
        // Add the successful utterance to the completed list
        completedUtterances: [...state.completedUtterances, action.payload],
      };
    case "PROCESSING_ERROR":
      return { ...state, status: "ERROR", error: action.payload }; // Or go back to READY_TO_PROMPT?
    case "SHOW_FEEDBACK": // Might be automatically transitioned from PROCESSING_SUCCESS
      return { ...state, status: "FEEDBACK" };
    case "MARK_PASSED":
      // Create a mock utterance for passing
      const passedUtterance: Utterance = {
        id: `mock-passed-${Date.now()}`, // Unique mock ID
        prompt: action.payload.prompt.text,
        promptId: action.payload.prompt.id,
        response: "User marked as passed (debug override)", // Mock response
        score: 1.0, // High score for passing
        feedback: "Great job! You passed this one.", // Positive feedback
        latencyMs: 0, // Mock latency
        createdAt: serverTimestamp(), // Use server timestamp placeholder
        ownerUid: action.payload.ownerUid, // Use ownerUid from action payload
        sessionId: state.sessionId || "unknown-session", // Get session ID from state
      };
      return {
        ...state,
        status: "FEEDBACK",
        currentUtterance: passedUtterance,
        completedUtterances: [...state.completedUtterances, passedUtterance], // Add to completed
      };
    case "MARK_FAILED":
      // Create a mock utterance for failing
      const failedUtterance: Utterance = {
        id: `mock-failed-${Date.now()}`, // Unique mock ID
        prompt: action.payload.prompt.text,
        promptId: action.payload.prompt.id,
        response: "User marked as failed (debug override)", // Mock response
        score: 0.0, // Low score for failing
        feedback: "Let's keep practicing this one.", // Encouraging feedback
        latencyMs: 0, // Mock latency
        createdAt: serverTimestamp(), // Use server timestamp placeholder
        ownerUid: action.payload.ownerUid, // Use ownerUid from action payload
        sessionId: state.sessionId || "unknown-session", // Get session ID from state
      };
      return {
        ...state,
        status: "FEEDBACK",
        currentUtterance: failedUtterance,
        completedUtterances: [...state.completedUtterances, failedUtterance], // Add to completed
      };
    case "NEXT_PROMPT":
      const nextIndex = state.currentPromptIndex + 1;
      if (nextIndex < state.prompts.length) {
        return {
          ...state,
          status: "SESSION_READY", // Go back to ready state
          currentPromptIndex: nextIndex,
          currentUtterance: null,
          recordingStartTime: null, // Reset latency timer for next prompt
        };
      } else {
        return { ...state, status: "COMPLETE", currentUtterance: null };
      }
    case "SESSION_COMPLETE": // Can be triggered explicitly or from NEXT_PROMPT
      return { ...state, status: "COMPLETE" };
    case "RESET":
      // Ensure reset clears the new fields too
      return { ...initialState };
    case "SESSION_INITIALIZATION_ERROR":
      return {
        ...state,
        status: "ERROR", // Keep general error status for UI consistency
        error: action.payload, // Use the specific error message
      };
    default:
      return state;
  }
}

// --- Component --- //

// Placeholder fetcher for SWR
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error("Failed to fetch prompts");
    }
    return res.json();
  });

export default function VoiceSession({ focusModePromptId }: VoiceSessionProps) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const { user } = useAuth();
  const router = useRouter(); // Get router instance

  // --- AudioContext for playing API-sourced audio --- //
  // Keep a single AudioContext instance
  const [audioContext, setAudioContext] = React.useState<AudioContext | null>(
    null,
  );
  // Ensure AudioContext is created after user interaction / component mount
  useEffect(() => {
    if (typeof window !== "undefined" && !audioContext) {
      setAudioContext(new window.AudioContext());
    }
    return () => {
      audioContext?.close(); // Clean up on unmount
    };
  }, [audioContext]);
  // --- End AudioContext --- //

  // --- Recorder Hook Integration --- //
  const {
    isRecording,
    // isPaused, // If needed later
    error: recorderError,
    startRecording,
    stopRecording,
    // pauseRecording, // If needed later
    // resumeRecording // If needed later
  } = useRecorder({
    // Pass the callback to handle blob when recording stops
    onDataAvailable: (blob) => {
      if (
        state.status === "RECORDING" &&
        user &&
        state.sessionId &&
        currentPrompt
      ) {
        // Stop latency timer *before* processing
        const endTime = Date.now();
        const latencyMs = state.recordingStartTime
          ? endTime - state.recordingStartTime
          : null;
        console.log(`Recording stopped. Calculated Latency: ${latencyMs}ms`);
        handleProcessRecording(blob, latencyMs);
      }
    },
    mimeType: "audio/wav", // Explicitly request WAV as needed by resampleAudio and potentially backend
  });
  // --- End Recorder Hook Integration ---

  const {
    data: promptsData,
    error: promptsError,
    isLoading: promptsLoading,
    mutate: mutatePrompts,
  } = useSWR(
    !focusModePromptId && user ? "/api/openai/prompts?batch=12" : null, // Only fetch if not in focus mode and user is available
    fetcher,
    {
      shouldRetryOnError: false, // Handle error explicitly
      revalidateOnFocus: false, // Don't refetch on focus
    },
  );

  // Effect to dispatch actions based on SWR state (for non-focus mode)
  useEffect(() => {
    if (focusModePromptId) return; // Skip if in focus mode, handled by another effect

    if (promptsLoading && state.status === "IDLE") {
      dispatch({ type: "FETCH_PROMPTS_START" });
    }
    if (promptsError && state.status === "FETCHING_PROMPTS") {
      dispatch({ type: "FETCH_PROMPTS_ERROR", payload: promptsError.message });
    }
    if (promptsData && state.status === "FETCHING_PROMPTS") {
      // Assuming promptsData is { prompts: Prompt[] }
      if (promptsData && Array.isArray(promptsData.prompts)) {
        dispatch({
          type: "FETCH_PROMPTS_SUCCESS",
          payload: promptsData.prompts,
        });
      } else {
        console.error("Invalid prompts data structure received:", promptsData);
        dispatch({
          type: "FETCH_PROMPTS_ERROR",
          payload: "Invalid data received from prompts API",
        });
      }
    }
  }, [
    promptsData, promptsError, promptsLoading, 
    state.status, 
    focusModePromptId, user, dispatch
  ]); // Added user and dispatch

  // --- Effect to Fetch Single Prompt for Focus Mode --- //
  useEffect(() => {
    if (focusModePromptId && user && state.status === "IDLE") {
      dispatch({ type: "FETCH_PROMPTS_START" });
      console.log(`[VoiceSession] Focus mode: Fetching prompt with ID: ${focusModePromptId}`);
      
      const fetchSinglePrompt = async () => {
        try {
          const promptDocRef = doc(db, 'users', user.uid, 'generatedPrompts', focusModePromptId);
          const promptSnap = await getDoc(promptDocRef);

          if (promptSnap.exists()) {
            const promptData = promptSnap.data();
            const prompt: Prompt = {
              id: promptSnap.id,
              text: promptData.text,
            };
            // Dispatch success with an array containing the single prompt
            dispatch({ type: "FETCH_PROMPTS_SUCCESS", payload: [prompt] });
          } else {
            console.error(`[VoiceSession] Focus mode: Prompt ${focusModePromptId} not found.`);
            dispatch({ type: "FETCH_PROMPTS_ERROR", payload: "Focused prompt not found." });
          }
        } catch (error) {
          console.error("[VoiceSession] Focus mode: Error fetching prompt:", error);
          const errorMessage = error instanceof Error ? error.message : "Failed to fetch focused prompt.";
          dispatch({ type: "FETCH_PROMPTS_ERROR", payload: errorMessage });
        }
      };
      fetchSinglePrompt();
    }
  }, [focusModePromptId, user, state.status, dispatch]); // Added dispatch

  // --- Effect to Create Initial Session Doc --- //
  useEffect(() => {
    // Only run if we have a session ID, a user, and the doc hasn't been created yet
    if (
      state.status === "INITIALIZING_SESSION" &&
      state.sessionId &&
      user &&
      !state.sessionDocCreated
    ) {
      const initialSessionData = {
        ownerUid: user.uid,
        startedAt: serverTimestamp(),
        // Add other initial fields if needed, e.g., promptCount
        promptCount: state.prompts.length,
      };
      console.log(
        "Attempting to create initial session document...",
        state.sessionId,
      );
      setDoc(doc(db, "sessions", state.sessionId), initialSessionData)
        .then(() => {
          console.log("Initial session document created successfully.");
          dispatch({ type: "SESSION_DOC_CREATED" }); // Transition to SESSION_READY
        })
        .catch((error) => {
          console.error("Error creating initial session document:", error);
          // Transition to error state if initial write fails
          dispatch({
            type: "SESSION_INITIALIZATION_ERROR", // Use new action type
            payload: "Failed to create session in database. Please try again.", // More specific message
          });
        });
    }
  }, [
    state.status,
    state.sessionId,
    user,
    state.sessionDocCreated,
    state.prompts.length,
    dispatch,
  ]); // Added dispatch dependency

  // Effect to auto-start recording & latency timer
  useEffect(() => {
    if (state.status === "RECORDING" && !isRecording) {
      console.log("Auto-starting recording...");
      // Record start time for latency calculation
      dispatch({ type: "SET_RECORDING_START_TIME", payload: Date.now() });
      startRecording();
    }
  }, [state.status, isRecording, startRecording, dispatch]); // Added dispatch dependency

  // Effect to handle recorder errors
  useEffect(() => {
    if (recorderError) {
      console.error("Recorder Error:", recorderError);
      // Dispatch an error state or show a message
      dispatch({
        type: "PROCESSING_ERROR",
        payload: `Recording failed: ${recorderError.message}`,
      });
    }
  }, [recorderError]);

  // Now currentPrompt is of type Prompt | undefined
  const currentPrompt = state.prompts[state.currentPromptIndex];

  // --- Mock Handlers (Replace with real logic) --- //
  const handlePlayPrompt = useCallback(async () => {
    if (
      state.status === "SESSION_READY" &&
      currentPrompt?.text &&
      audioContext // Ensure AudioContext is available
    ) {
      console.log("Dispatching START_PROMPT for:", currentPrompt.text);
      dispatch({ type: "START_PROMPT" });

      try {
        // 1. Fetch audio from our API
        const response = await fetch("/api/openai/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: currentPrompt.text }),
          // User session cookie should be sent automatically by the browser
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})); // Try to get error details
          console.error(
            `TTS API request failed: ${response.status}`,
            errorData,
          );
          dispatch({
            type: "FETCH_PROMPTS_ERROR", // Reusing for simplicity, could be a new error type
            payload:
              `Failed to fetch audio: ${response.statusText} - ${errorData.error || "Unknown API error"}`,
          });
          return;
        }

        // 2. Get audio data as ArrayBuffer
        const audioData = await response.arrayBuffer();
        if (audioData.byteLength === 0) {
          console.error("TTS API returned empty audio data.");
          dispatch({
            type: "FETCH_PROMPTS_ERROR",
            payload: "Received empty audio from TTS service.",
          });
          return;
        }

        // 3. Decode and play audio
        // Ensure AudioContext is in a running state (resumes if suspended by browser policy)
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        const audioBuffer = await audioContext.decodeAudioData(audioData);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          console.log("API audio finished. Dispatching PROMPT_PLAYED");
          dispatch({ type: "PROMPT_PLAYED" });
        };
        source.start();
      } catch (error) {
        console.error("Error during TTS API call or audio playback:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown TTS error";
        dispatch({
          type: "FETCH_PROMPTS_ERROR", // Or a more specific error type
          payload: `Speech synthesis error: ${errorMessage}`,
        });
      }
    }
  }, [state.status, currentPrompt, audioContext, dispatch]); // Added audioContext and dispatch

  // This function now focuses only on initiating the stop,
  // the actual processing happens in handleProcessRecording via the onDataAvailable callback
  const handleStopRecordingClick = useCallback(() => {
    if (isRecording) {
      console.log("Manually stopping recording via button click...");
      stopRecording(); // This will trigger onDataAvailable
      // The reducer state will transition to PROCESSING within handleProcessRecording
    }
  }, [isRecording, stopRecording]);

  // New function to handle the processing logic, takes latency
  const handleProcessRecording = useCallback(
    async (blob: Blob | null, latencyMs: number | null) => {
      if (!blob) {
        console.error("Processing stopped: No blob received from recorder.");
        dispatch({
          type: "PROCESSING_ERROR",
          payload: "No audio data received.",
        });
        return;
      }
      if (
        state.status !== "RECORDING" ||
        !user ||
        !state.sessionId ||
        !currentPrompt
      ) {
        console.warn("Processing stopped: Invalid state or missing data.", {
          status: state.status,
          user: !!user,
          sessionId: state.sessionId,
          currentPrompt: !!currentPrompt,
        });
        // Don't dispatch error here as it might be a valid race condition
        // (e.g., user navigates away while recording)
        return;
      }

      console.log("Dispatching STOP_RECORDING/PROCESSING_START");
      dispatch({ type: "STOP_RECORDING" }); // Transition state to PROCESSING

      // REMOVED Placeholder latency
      // const mockLatency = 1500;

      try {
        // 1. Transcribe
        console.log(
          `Transcribing blob of size ${blob.size}, type ${blob.type}`,
        );
        const formData = new FormData();
        // Use a consistent filename, backend might use it
        formData.append("audio", blob, `recording-${Date.now()}.wav`);
        const transcribeRes = await fetch("/api/openai/transcribe", {
          method: "POST",
          body: formData,
          // Auth handled by session cookie
        });
        if (!transcribeRes.ok) {
          const errorBody = await transcribeRes.json().catch(() => ({})); // Try to get error details
          throw new Error(
            `Transcription failed: ${transcribeRes.status} ${transcribeRes.statusText} - ${errorBody.error || "Unknown error"}`,
          );
        }
        const { text: transcript } = await transcribeRes.json();
        console.log("[VoiceSession] Transcription successful:", transcript);

        // 2. Score
        console.log("[VoiceSession] Scoring transcription...");
        const scoreRes = await fetch("/api/openai/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Ensure currentPrompt exists and pass its text property
          body: JSON.stringify({
            prompt: currentPrompt.text,
            response: transcript,
          }),
          // Auth handled by session cookie
        });
        if (!scoreRes.ok) {
          const errorBody = await scoreRes.json().catch(() => ({}));
          throw new Error(
            `Scoring failed: ${scoreRes.status} ${scoreRes.statusText} - ${errorBody.error || "Unknown error"}`,
          );
        }
        const { score, feedback } = await scoreRes.json(); 
        console.log("[VoiceSession] Scoring API returned:", { score, feedback }); // LOG SCORE AND FEEDBACK

        // 3. Persist Utterance
        console.log("Persisting utterance...");
        // Ensure currentPrompt exists before accessing its properties
        const utteranceData = {
          prompt: currentPrompt.text, // Access text property
          promptId: currentPrompt.id, // Access id property
          response: transcript,
          score: score ?? null, // Handle potential null score
          feedback: feedback ?? "", // Handle potential null feedback
          latencyMs: latencyMs, // Use calculated latency
          createdAt: serverTimestamp(),
          ownerUid: user.uid,
          sessionId: state.sessionId,
        };

        // Correct Path Construction (Top-level Sessions):
        // 1. Get reference to the specific session document (using only session ID)
        const sessionDocRef = doc(db, "sessions", state.sessionId);

        // 2. Get reference to the 'utterances' subcollection nested under the session document.
        const utterancesCollectionRef = collection(sessionDocRef, "utterances");

        // 3. Use addDoc to add the utterance data to the subcollection.
        const newUtteranceDocRef = await addDoc(
          utterancesCollectionRef,
          utteranceData,
        );

        console.log("Utterance persisted with ID:", newUtteranceDocRef.id);

        // --- Update the master prompt in promptPool collection --- //
        const canUpdateMasterPrompt = user && currentPrompt && currentPrompt.id && typeof score === 'number';
        console.log("[VoiceSession] Condition to update master prompt:", canUpdateMasterPrompt, { userId: user?.uid, promptId: currentPrompt?.id, scoreValue: score, typeOfScore: typeof score }); // LOG CONDITION CHECK

        if (canUpdateMasterPrompt) {
          const userPromptRef = doc(db, 'users', user.uid, 'promptPool', currentPrompt.id);
          const updatePayload = {
            lastScore: score,
            lastUsedAt: serverTimestamp(),
            timesUsed: increment(1),
          };
          console.log(`[VoiceSession] Attempting to update master prompt ${currentPrompt.id} with payload:`, updatePayload); // LOG PAYLOAD
          try {
            await updateDoc(userPromptRef, updatePayload);
            console.log(`[VoiceSession] Master prompt ${currentPrompt.id} updated successfully with score: ${score}`);
          } catch (updateError) {
            console.error(`[VoiceSession] CRITICAL: Failed to update master prompt ${currentPrompt.id}:`, updateError); // LOG UPDATE ERROR
          }
        } else {
          console.warn("[VoiceSession] SKIPPED updating master prompt due to unmet conditions.");
        }
        // --- End master prompt update --- //

        dispatch({
          type: "PROCESSING_SUCCESS",
          payload: { ...utteranceData, id: newUtteranceDocRef.id },
        });
      } catch (error: unknown) {
        console.error("[VoiceSession] Processing error in handleProcessRecording:", error); // Enhanced logging
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to process recording";
        dispatch({ type: "PROCESSING_ERROR", payload: errorMessage });
      }
    },
    [state.status, user, currentPrompt, state.sessionId, dispatch],
  );

  const handleNext = useCallback(async () => {
    if (state.status === "FEEDBACK") {
      console.log("Dispatching NEXT_PROMPT");
      dispatch({ type: "NEXT_PROMPT" });
    }
    // --- Session Completion Logic --- //
    if (
      state.status === "COMPLETE" &&
      user &&
      state.sessionId &&
      state.sessionStartedAt
    ) {
      console.log("Calculating session summary...");

      const completed = state.completedUtterances;
      let meanAccuracy = 0;
      let meanLatencyMs = 0;
      let validScoresCount = 0;
      let validLatencyCount = 0;

      if (completed.length > 0) {
        let totalScore = 0;
        let totalLatency = 0;

        completed.forEach((utt) => {
          if (utt.score !== null) {
            totalScore += utt.score;
            validScoresCount++;
          }
          if (utt.latencyMs !== null) {
            totalLatency += utt.latencyMs;
            validLatencyCount++;
          }
        });

        meanAccuracy = validScoresCount > 0 ? totalScore / validScoresCount : 0;
        meanLatencyMs =
          validLatencyCount > 0 ? totalLatency / validLatencyCount : 0;
      }

      const sessionEndTime = Date.now();
      const durationSec = Math.round(
        (sessionEndTime - state.sessionStartedAt) / 1000,
      );

      console.log("Summary:", { meanAccuracy, meanLatencyMs, durationSec });

      const sessionSummary = {
        // startedAt: serverTimestamp(), // Already set during initial doc creation
        completedAt: serverTimestamp(), // Add completion timestamp
        durationSec: durationSec,
        accuracy: meanAccuracy,
        latencyMs: meanLatencyMs,
        promptCount: state.prompts.length, // Total prompts attempted
        completedCount: completed.length, // Successfully processed utterances
        ownerUid: user.uid,
      };
      try {
        // Merge summary into the existing session document
        await setDoc(doc(db, "sessions", state.sessionId), sessionSummary, {
          merge: true,
        });
        console.log("Session summary saved/merged.");
        // Navigate to dashboard
        router.push("/dashboard?justFinished=true");
      } catch (err) {
        console.error("Failed to save session summary:", err);
        // Handle error appropriately
      }
    }
  }, [
    state.status,
    state.sessionId,
    user,
    state.prompts.length,
    state.sessionStartedAt,
  ]);

  // --- Debug Handlers --- //
  const handleMarkPassed = useCallback(() => {
    if (currentPrompt && user) {
      console.log("Marking prompt as PASSED (Debug)", currentPrompt);
      dispatch({ type: "MARK_PASSED", payload: { prompt: currentPrompt, ownerUid: user.uid } });
    }
  }, [currentPrompt, user, dispatch]);

  const handleMarkFailed = useCallback(() => {
    if (currentPrompt && user) {
      console.log("Marking prompt as FAILED (Debug)", currentPrompt);
      dispatch({ type: "MARK_FAILED", payload: { prompt: currentPrompt, ownerUid: user.uid } });
    }
  }, [currentPrompt, user, dispatch]);
  // --- End Debug Handlers --- //

  // Calculate progress percentage
  const progress = state.prompts.length > 0
    ? ((state.currentPromptIndex + state.completedUtterances.length) / state.prompts.length) * 100
    : 0;

  // Calculate session duration for display / logging
  const sessionDuration = calculateDuration(state.sessionStartedAt);

  // --- Render Logic --- //

  if (
    state.status === "FETCHING_PROMPTS" ||
    state.status === "INITIALIZING_SESSION" ||
    promptsLoading
  ) {
    return <div>Loading session...</div>; // Updated loading message
  }

  if (state.status === "ERROR") {
    return (
      <div>
        Error: {state.error}{" "}
        <button onClick={() => {
          if (mutatePrompts) mutatePrompts(); // Trigger SWR revalidation
          dispatch({ type: "RESET" });    // Reset local state
        }}>Retry</button>
      </div>
    );
  }

  if (
    !currentPrompt &&
    state.status !== "IDLE" &&
    state.status !== "COMPLETE"
  ) {
    // This might happen if promptsData is empty or structure is wrong
    if (!promptsLoading && !promptsError) {
      return (
        <div>
          No prompts available or failed to load.{" "}
          <button onClick={() => dispatch({ type: "RESET" })}>Try Again</button>
        </div>
      );
    }
    // If still loading or error, those states handle the UI
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h2>Voice Session</h2>
      <p>Status: {state.status}</p>
      <p>Session ID: {state.sessionId}</p>

      {/* ProgressRing Integration */}
      <div className="mb-8">
        <ProgressRing
          currentStep={state.currentPromptIndex}
          // Handle case where prompts array might be empty initially
          totalSteps={state.prompts.length > 0 ? state.prompts.length : 10} // Default to 10 if length unknown
        />
      </div>

      {/* PromptCard Integration */}
      {(state.status === "SESSION_READY" ||
        state.status === "PLAYING_PROMPT" ||
        state.status === "RECORDING" ||
        state.status === "PROCESSING" ||
        state.status === "FEEDBACK") && (
        <PromptCard
          promptText={
            currentPrompt?.text ||
            (state.status === "SESSION_READY" ? "Ready..." : "Loading...")
          }
          onPlayPrompt={handlePlayPrompt}
          isPlaying={state.status === "PLAYING_PROMPT"}
        />
      )}

      {/* RecorderControls Integration */}
      {state.status === "RECORDING" && (
        <RecorderControls
          isRecording={isRecording}
          onStopRecording={handleStopRecordingClick}
          recorderError={recorderError}
          // Pass start time to potentially display in ticker or controls
          // recordingStartTime={state.recordingStartTime}
        />
      )}

      {/* FeedbackOverlay Integration */}
      {state.status === "FEEDBACK" && state.currentUtterance && (
        <FeedbackOverlay
          score={state.currentUtterance.score}
          // feedbackText={state.currentUtterance.feedback} // Pass if available and needed
          onNext={handleNext}
          isLastPrompt={state.currentPromptIndex + 1 >= state.prompts.length}
        />
      )}

      {state.status === "COMPLETE" && (
        <div className="my-4 p-4 border rounded shadow bg-yellow-100">
          <p>Session Complete!</p>
          <button
            onClick={handleNext}
            className="mt-2 px-4 py-2 bg-yellow-500 text-black rounded"
          >
            Go to Dashboard
          </button>
          {/* Navigation now happens in handleNext after Firestore write */}
        </div>
      )}

      {/* Debug Buttons (Visible in relevant states) */}
      {(state.status === "SESSION_READY" ||
        state.status === "PLAYING_PROMPT" ||
        state.status === "RECORDING" ||
        state.status === "PROCESSING") &&
        currentPrompt && (
          <div className="mt-4 space-x-4">
            <button
              onClick={handleMarkPassed}
              className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
            >
              Mark Passed (Debug)
            </button>
            <button
              onClick={handleMarkFailed}
              className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
            >
              Mark Failed (Debug)
            </button>
          </div>
        )}
    </div>
  );
}

// Helper to calculate session duration
const calculateDuration = (startedAt: number | null) => {
  if (!startedAt) return null;
  const now = Date.now();
  return Math.round((now - startedAt) / 1000); // Duration in seconds
};
