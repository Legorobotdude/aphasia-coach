'use client';

import React from 'react';
// Using lucide-react for icons, ensure it's installed: pnpm add lucide-react
import { Volume2 } from 'lucide-react'; 

interface PromptCardProps {
  promptText: string;
  onPlayPrompt: () => void;
  isPlaying: boolean; // To disable button while playing
}

/**
 * Displays the current prompt text and a button to play it via TTS.
 */
export default function PromptCard({ promptText, onPlayPrompt, isPlaying }: PromptCardProps) {
  return (
    <div className="w-full max-w-md p-6 bg-white border border-gray-200 rounded-lg shadow-md dark:bg-gray-800 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Prompt:</h3>
      <p className="text-xl text-gray-900 dark:text-white mb-6 min-h-[3em]"> 
        {promptText || 'Loading prompt...'}
      </p>
      <div className="flex justify-center">
        <button
          onClick={onPlayPrompt}
          disabled={isPlaying || !promptText}
          aria-label="Play prompt aloud"
          className={`p-4 rounded-full transition-colors duration-150 ease-in-out 
                      ${isPlaying || !promptText 
                        ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed' 
                        : 'bg-blue-500 hover:bg-blue-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800'}
                    `}
        >
          <Volume2 size={28} />
        </button>
      </div>
    </div>
  );
} 