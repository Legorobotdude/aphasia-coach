/**
 * Calculates the difficulty score of a prompt based on multiple dimensions (V1 - Heuristic Proxies, Bounded Weights).
 * Uses empirically scaled weights so outputs realistically span 0–85 (see difficultyplan.md).
 * @param promptText The text of the prompt.
 * @param category The category of the prompt.
 * @returns An object containing the overall difficulty score and individual dimension scores.
 */
export function calculateDifficulty(
  promptText: string,
  category: string,
): {
  difficulty: number;
  freqNorm: number;
  abstractness: number;
  lengthScale: number;
  responseTypeScale: number;
  semanticDistanceScale: number;
} {
  // FreqNorm (1=easy/high-freq, 5=hard/low-freq); Use max word length as a proxy.
  const longestWord = promptText
    .split(" ")
    .reduce((a, b) => (b.length > a.length ? b : a), "");
  // ≤4 letters: 1, 5-6:2, 7-8:3, 9-10:4, >10:5
  const freqNorm = Math.max(
    1,
    Math.min(
      5,
      longestWord.length <= 4
        ? 1
        : longestWord.length <= 6
          ? 2
          : longestWord.length <= 8
            ? 3
            : longestWord.length <= 10
              ? 4
              : 5,
    ),
  );

  // Abstractness (1=concrete, 5=abstract): Use inverse of length, and open prompts are more abstract
  let abstractness = 2; // Default more concrete
  if (category === "open") abstractness = 4;
  else if (category === "challenge") abstractness = 3;
  else if (longestWord.length > 8) abstractness = 3;

  // Prompt length scale: 1-3 words=1, 4-6=2, 7-9=3, 10-12=4, >12=5
  const length = promptText.trim().split(/\s+/).length;
  const lengthScale =
    length <= 3 ? 1 : length <= 6 ? 2 : length <= 9 ? 3 : length <= 12 ? 4 : 5;

  // Response type: open=3, personal=2, else=1
  const responseTypeScale =
    category === "open" ? 3 : category === "personalVocab" ? 2 : 1;

  // Semantic distance: open|personal=1, generic=2, challenge=3
  const semanticDistanceScale =
    category === "personalVocab" || category === "open"
      ? 1
      : category === "genericVocab"
        ? 2
        : 3;

  // Raw weighted scoring: weights chosen to fill out 0–85 range
  const rawDifficulty =
    8 * (5 - freqNorm) + // Higher freq= easier
    5 * abstractness +
    4 * lengthScale +
    6 * responseTypeScale +
    8 * semanticDistanceScale;

  // Clamp to 0-85 (per rubric)
  const difficulty = Math.max(0, Math.min(85, rawDifficulty));

  return {
    difficulty,
    freqNorm,
    abstractness,
    lengthScale,
    responseTypeScale,
    semanticDistanceScale,
  };
}
