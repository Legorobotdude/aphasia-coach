import { useState, useEffect, useCallback, useRef } from "react";

interface RecorderState {
  isRecording: boolean;
  isPaused: boolean;
  recordingBlob: Blob | null;
  error: Error | null;
}

interface UseRecorderOptions {
  audioBitsPerSecond?: number;
  mimeType?: string;
  onDataAvailable?: (blob: Blob) => void;
}

// Add interface for window with webkitAudioContext
interface ExtendedWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Custom hook for recording audio in the browser
 * Handles iOS Safari quirks and resampling
 */
export function useRecorder(options: UseRecorderOptions = {}) {
  const [recorderState, setRecorderState] = useState<RecorderState>({
    isRecording: false,
    isPaused: false,
    recordingBlob: null,
    error: null,
  });

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  // Default options
  const audioBitsPerSecond = options.audioBitsPerSecond || 16000;
  const mimeType = options.mimeType || "audio/webm";
  
  // Store callback in ref to avoid dependency changes
  const onDataAvailableRef = useRef<((blob: Blob) => void) | undefined>(
    options.onDataAvailable
  );
  
  // Update ref if callback changes
  useEffect(() => {
    onDataAvailableRef.current = options.onDataAvailable;
  }, [options.onDataAvailable]);

  // Start recording function
  const startRecording = useCallback(async () => {
    // Don't try to start if already recording
    if (recorderState.isRecording) {
      return;
    }

    try {
      // Reset state
      setRecorderState({
        isRecording: false,
        isPaused: false,
        recordingBlob: null,
        error: null,
      });

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);

      // Create media recorder
      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond,
        mimeType: MediaRecorder.isTypeSupported(mimeType)
          ? mimeType
          : "audio/webm",
      });

      // Set up data handling
      const chunks: BlobPart[] = [];

      recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      });

      recorder.addEventListener("stop", async () => {
        // For iOS Safari, we need to use AudioContext to resample to 16kHz
        let finalBlob: Blob;

        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
          finalBlob = await resampleAudio(
            new Blob(chunks, { type: recorder.mimeType }),
            16000,
          );
        } else {
          finalBlob = new Blob(chunks, { type: recorder.mimeType });
        }

        setRecorderState((prev) => ({
          ...prev,
          recordingBlob: finalBlob,
          isRecording: false,
        }));

        // Use the ref to access the latest callback
        if (onDataAvailableRef.current) {
          onDataAvailableRef.current(finalBlob);
        }

        // Clean up stream tracks
        stream.getTracks().forEach((track) => track.stop());
      });

      // Save recorder and start
      setMediaRecorder(recorder);
      recorder.start(100); // Collect data every 100ms

      setRecorderState((prev) => ({
        ...prev,
        isRecording: true,
      }));
    } catch (error) {
      console.error("Error starting recording:", error);
      setRecorderState((prev) => ({
        ...prev,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    }
  }, [audioBitsPerSecond, mimeType, recorderState.isRecording]);

  // Stop recording function
  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }, [mediaRecorder]);

  // Pause recording function
  const pauseRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      setRecorderState((prev) => ({
        ...prev,
        isPaused: true,
      }));
    }
  }, [mediaRecorder]);

  // Resume recording function
  const resumeRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      setRecorderState((prev) => ({
        ...prev,
        isPaused: false,
      }));
    }
  }, [mediaRecorder]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [mediaRecorder, audioStream]);

  return {
    ...recorderState,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}

/**
 * Resamples audio to the target sample rate using Web Audio API
 * Critical for iOS Safari which doesn't support setting sampleRate directly
 */
async function resampleAudio(
  blob: Blob,
  targetSampleRate: number,
): Promise<Blob> {
  // Create audio context
  const extendedWindow = window as ExtendedWindow;
  const AudioContext = window.AudioContext || extendedWindow.webkitAudioContext;
  const audioContext = new AudioContext();

  // Convert blob to array buffer
  const arrayBuffer = await blob.arrayBuffer();

  // Decode the audio data
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Create offline context for resampling
  const offlineContext = new OfflineAudioContext(
    1, // mono
    audioBuffer.duration * targetSampleRate,
    targetSampleRate,
  );

  // Create buffer source
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);

  // Start processing
  source.start(0);
  const renderedBuffer = await offlineContext.startRendering();

  // Convert to 16-bit PCM
  const channelData = renderedBuffer.getChannelData(0);
  const pcmData = new Int16Array(channelData.length);

  for (let i = 0; i < channelData.length; i++) {
    // Convert float32 to int16
    const s = Math.max(-1, Math.min(1, channelData[i]));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // Return as WAV blob
  const wavBlob = createWavBlob(pcmData, targetSampleRate);
  return wavBlob;
}

/**
 * Creates a WAV blob from PCM data
 */
function createWavBlob(pcmData: Int16Array, sampleRate: number): Blob {
  // WAV header
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono channel
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * channels * bytesPerSample)
  view.setUint16(32, 2, true); // block align (channels * bytesPerSample)
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, pcmData.byteLength, true);

  // Combine header and data
  const wavBuffer = new Uint8Array(header.byteLength + pcmData.byteLength);
  wavBuffer.set(new Uint8Array(header), 0);
  wavBuffer.set(new Uint8Array(pcmData.buffer), header.byteLength);

  return new Blob([wavBuffer], { type: "audio/wav" });
}

/**
 * Helper to write string to DataView
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
