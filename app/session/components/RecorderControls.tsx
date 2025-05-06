'use client';

import React from 'react';
import { Mic, Square } from 'lucide-react'; // Assuming lucide-react is installed
import LatencyTicker from './LatencyTicker'; // Import the ticker

interface RecorderControlsProps {
  isRecording: boolean;
  onStopRecording: () => void;
  // onStartRecording: () => void; // Keep if manual start is ever needed
  recorderError: Error | null;
}

/**
 * Renders controls for the audio recorder, primarily the stop button.
 * Reflects the current recording state and displays errors.
 */
export default function RecorderControls({
  isRecording,
  onStopRecording,
  recorderError,
}: RecorderControlsProps) {
  // In the primary flow, recording starts automatically after TTS.
  // So, we mainly need to show the stop button when isRecording is true.

  return (
    <div className="flex flex-col items-center mt-8"> 
      {/* Conditionally render the stop button and ticker */} 
      {isRecording && (
        <>
          <button
            onClick={onStopRecording} 
            aria-label="Stop recording"
            className={`p-4 rounded-full transition-colors duration-150 ease-in-out 
                        bg-red-500 hover:bg-red-600 text-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                      `}
          >
            <Square size={28} /> 
          </button>
          {/* Add the LatencyTicker below the button */}
          <LatencyTicker isActive={isRecording} />
        </>
      )}
      
      {/* Display recorder errors */} 
      {recorderError && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-4"> 
              Error: {recorderError.message}
          </p>
      )}

      {/* Placeholder/Indicator for when not actively recording but in the RECORDING state */} 
      {!isRecording && !recorderError && (
          <div className="flex items-center text-gray-500 dark:text-gray-400 mt-4"> {/* Added margin top */}
              {/* You might want a visual indicator here, like a pulsing mic or just text */} 
              {/* <Mic size={28} className="animate-pulse" /> */} 
              <span>Preparing recorder...</span>
          </div>
      )}
    </div>
  );
} 