import { GeneratedPrompt } from './types/firestore';

/**
 * Calculates the difficulty score of a prompt based on multiple dimensions.
 * @param promptText The text of the prompt.
 * @param category The category of the prompt.
 * @returns An object containing the overall difficulty score and individual dimension scores.
 */
export function calculateDifficulty(promptText: string, category: string): {
  difficulty: number;
  freqNorm: number;
  abstractness: number;
  lengthScale: number;
  responseTypeScale: number;
  semanticDistanceScale: number;
} {
  // Placeholder values for now, to be replaced with real calculations
  const freqNorm = 3; // Placeholder for lexical rarity (1-5 scale)
  const abstractness = 3; // Placeholder for concreteness/abstractness (1-5 scale)
  const lengthScale = Math.min(5, Math.ceil(promptText.split(' ').length / 3)); // Rough scale based on word count
  const responseTypeScale = category === 'open' ? 3 : category === 'personalVocab' ? 2 : 1; // Based on category
  const semanticDistanceScale = category === 'personalVocab' || category === 'open' ? 1 : category === 'genericVocab' ? 2 : 3; // Placeholder based on category

  // Calculate overall difficulty score using the formula from difficultyplan.md
  const difficulty = (20 * (5 - freqNorm)) + (15 * abstractness) + (10 * lengthScale) + (25 * responseTypeScale) + (30 * semanticDistanceScale);

  return {
    difficulty: Math.min(100, Math.max(0, difficulty)), // Ensure score is between 0 and 100
    freqNorm,
    abstractness,
    lengthScale,
    responseTypeScale,
    semanticDistanceScale,
  };
} 