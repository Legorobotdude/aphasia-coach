import React from 'react';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router

// TODO: Define a proper type for revisit words, including score if needed for sorting display
// TODO: Fetch real data in parent component and pass as props
interface WordRevisitListProps {
  words: string[]; // Simple list for now
}

const MAX_WORDS_TO_SHOW = 20;

export default function WordRevisitList({ words }: WordRevisitListProps) {
  const router = useRouter();

  const handlePracticeClick = (word: string) => {
    // Navigate to session page in focus mode for the specific word
    // Note: For multiple words, the URL structure might need adjustment
    router.push(`/session?mode=focus&ids=${encodeURIComponent(word)}`);
  };

  const wordsToShow = words.slice(0, MAX_WORDS_TO_SHOW);

  return (
    <div className="p-4 border rounded shadow-sm bg-white md:col-span-2"> {/* Match grid span from page.tsx */} 
      <h2 className="text-lg font-semibold mb-3">Words to Revisit</h2>
      {wordsToShow.length > 0 ? (
        <ul className="space-y-2">
          {wordsToShow.map((word, index) => (
            <li key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span className="text-gray-800">{word}</span>
              <button
                onClick={() => handlePracticeClick(word)}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
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