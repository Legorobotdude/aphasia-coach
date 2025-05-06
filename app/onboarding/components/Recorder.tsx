'use client';

// Minimal imports needed for display component
import React from 'react';

interface RecorderProps {
  isRecording: boolean;
  recordingSeconds: number;
  error: Error | null; // Accept potential errors from the hook
}

export function Recorder({ isRecording, recordingSeconds, error }: RecorderProps) {
  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-64 h-64 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        {/* Animated recording indicator */}
        {isRecording && (
          <div className="absolute w-full h-full rounded-full border-4 border-red-500 animate-pulse" />
        )}
        
        {/* Microphone icon */}
        <div className={`text-6xl ${isRecording ? 'text-red-500' : 'text-gray-400'}`}>
          🎤
        </div>
      </div>
      
      {/* Timer */}
      <div className="text-xl font-mono">
        {formatTime(recordingSeconds)}
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-300 dark:border-red-700 rounded-md w-full text-center">
          {error.message}
        </div>
      )}
    </div>
  );
} 