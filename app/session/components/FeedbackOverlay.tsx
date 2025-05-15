'use client';

import * as React from 'react';
import { CheckCircle, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';

interface FeedbackOverlayProps {
  score: number | null;
  feedbackText?: string; // Now supports detailed feedback from API
  onNext: () => void;
  isLastPrompt: boolean;
}

/**
 * Displays feedback after an utterance is scored.
 * Shows score, visual indicator (color/icon), and a button to proceed.
 */
export default function FeedbackOverlay({ 
  score, 
  feedbackText,
  onNext, 
  isLastPrompt 
}: FeedbackOverlayProps) {
  console.log('FeedbackOverlay: feedbackText', feedbackText);
  let bgColor = 'bg-gray-100 dark:bg-gray-700';
  let textColor = 'text-gray-800 dark:text-gray-200';
  let icon = null;
  let feedbackMessage = 'Processing...'; // Default message if score is null initially

  if (score !== null) {
    if (score >= 0.8) {
      bgColor = 'bg-green-100 dark:bg-green-900';
      textColor = 'text-green-800 dark:text-green-200';
      icon = <CheckCircle size={24} className="mr-2" />;
      feedbackMessage = 'Great!';
    } else if (score >= 0.6) {
      bgColor = 'bg-yellow-100 dark:bg-yellow-900';
      textColor = 'text-yellow-800 dark:text-yellow-200';
      icon = <AlertTriangle size={24} className="mr-2" />;
      feedbackMessage = 'Almost!';
    } else {
      bgColor = 'bg-red-100 dark:bg-red-900';
      textColor = 'text-red-800 dark:text-red-200';
      icon = <XCircle size={24} className="mr-2" />;
      feedbackMessage = 'Let\'s try again later.';
    }
  }

  const buttonText = isLastPrompt ? 'Finish Session' : 'Next Prompt';
  const buttonBgColor = isLastPrompt ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-500 hover:bg-blue-600';

  return (
    <div className={`w-full max-w-md p-6 rounded-lg shadow-md mt-8 transition-colors duration-300 ${bgColor}`}>
      <div className={`flex items-center text-xl font-semibold mb-4 ${textColor}`}>
        {icon}
        {feedbackMessage}
      </div>
      {score !== null && (
        <p className={`text-lg mb-2 ${textColor}`}>
          Score: {score.toFixed(2)}
        </p>
      )}
      <div
        className={`mb-6 p-3 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${textColor}`}
        style={{ fontStyle: feedbackText ? 'normal' : 'italic', color: feedbackText ? undefined : '#888' }}
      >
        {feedbackText && feedbackText.trim().length > 0
          ? feedbackText
          : 'No additional feedback returned.'}
      </div>
      <div className="flex justify-center">
        <button
          onClick={onNext}
          aria-label={buttonText}
          className={`px-6 py-3 rounded-lg transition-colors duration-150 ease-in-out flex items-center
                        ${buttonBgColor} text-white focus:outline-none focus:ring-2 focus:ring-opacity-50 
                        ${isLastPrompt ? 'focus:ring-yellow-400' : 'focus:ring-blue-400' }
                        focus:ring-offset-2 dark:focus:ring-offset-gray-800
                      `}
        >
          {buttonText}
          <ArrowRight size={20} className="ml-2" />
        </button>
      </div>
    </div>
  );
} 