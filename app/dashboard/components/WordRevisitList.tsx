import React from 'react';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router

// Define the structure of the prompt object this component now expects
interface RevisitPromptItem {
  id: string;   // The unique ID of the prompt (from promptPool collection)
  text: string; // The prompt text
  lastScore: number; // The last score achieved for this prompt
}

interface WordRevisitListProps {
  words: RevisitPromptItem[]; // Updated to accept an array of objects
}

const MAX_WORDS_TO_SHOW = 10; // Consistent with fetcher limit

export default function WordRevisitList({ words }: WordRevisitListProps) {
  const router = useRouter();

  const handlePracticeClick = (promptId: string) => {
    // Navigate to session page in focus mode for the specific prompt ID
    router.push(`/session?mode=focus&promptId=${encodeURIComponent(promptId)}`);
    // Note: The /session page will need to be able to fetch a prompt by this ID for focus mode.
  };

  const wordsToShow = words.slice(0, MAX_WORDS_TO_SHOW);

  return (
    <div className="p-4 border rounded shadow-sm bg-white md:col-span-2"> {/* Match grid span from page.tsx */} 
      <h2 className="text-lg font-semibold mb-3">Words to Revisit</h2>
      {wordsToShow.length > 0 ? (
        <ul className="space-y-2">
          {wordsToShow.map((promptItem) => (
            <li key={promptItem.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg shadow-sm">
              <div className="flex-grow">
                <span className="text-gray-800 block">{promptItem.text}</span>
                <span className="text-xs text-gray-500">
                  Last Score: {Math.round(promptItem.lastScore * 100)}%
                </span>
              </div>
              <button
                onClick={() => handlePracticeClick(promptItem.id)} // Pass promptItem.id
                className="ml-4 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                Practice
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-gray-500 italic">No words marked for revisit yet. Keep practicing!</div>
      )}
    </div>
  );
} 