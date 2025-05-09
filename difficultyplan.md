# Adaptive Difficulty Blueprint for Aphasia Coach

This document outlines a comprehensive plan for implementing an adaptive difficulty system in the Aphasia Coach application. The goal is to keep users within their Zone of Proximal Development (ZPD) by dynamically adjusting prompt difficulty based on their performance.

## 1. Define "Difficulty"

Prompt difficulty will be quantified by several dimensions, combined into a weighted Difficulty Score (D) ranging from 0 to 100.

| Dimension                     | Why it matters                                  | How to quantify (v1)                                                                                                | Weight (Example) |
| :---------------------------- | :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :--------------- |
| **Lexical Rarity**            | Low-frequency words are harder to retrieve.     | `log10(frequency)` from a reference corpus (e.g., SUBTLEX-US), normalized to a 1 (easy) – 5 (hard) scale (`freqNorm`). | 20               |
| **Concreteness/Abstractness** | Abstract nouns & verbs are tougher post-stroke. | MRC concreteness ratings or a GPT-based estimation (1–5 scale, where 5 is more abstract).                           | 15               |
| **Prompt Length**             | More words = higher working-memory load.        | Token count, bucketed into a 1–5 scale (e.g., 1-3 tokens=1, 4-6=2, etc.).                                           | 10               |
| **Response Type**             | Sentence > phrase > single word.                | Ordinal scale: single word=1, phrase=2, sentence=3.                                                                 | 25               |
| **Semantic Distance from User Context** | Unfamiliar topics are harder.           | Cosine distance between prompt embedding and user topic embeddings (from onboarding), binned to 3 levels (1-3).     | 30               |

**Difficulty Score Formula (D):**
\[ D = 20 \cdot (5 - freqNorm) + 15 \cdot (abstractness) + 10 \cdot (lengthScale) + 25 \cdot (responseTypeScale) + 30 \cdot (semanticDistanceScale) \]
*(Weights are illustrative and can be tuned. `freqNorm` is inverted as higher frequency means lower difficulty).*

## 2. Measure User Performance

User performance will be tracked through several signals, primarily to update a User Skill Index (S) for different prompt categories.

| Signal                      | Sampling        | Stored Where                       |
| :-------------------------- | :-------------- | :--------------------------------- |
| Accuracy (score 0-1)        | Per utterance   | `promptPool/{uid}/{promptId}` (as `lastScore`), and historically in `sessions/{sid}/utterances/{uid}` |
| Latency (ms)                | Per utterance   | `sessions/{sid}/utterances/{uid}`  |
| Cue Needed (bool)           | Per utterance   | `sessions/{sid}/utterances/{uid}` (FUTURE) |
| Session Aggregates          | Per session     | `sessions/{sid}` (mean accuracy, latency) |

**User Skill Index (S):**
A skill index (S), ranging from 0 to 100, will be maintained for each relevant prompt category (e.g., `personalVocab`, `genericVocab`, `challenge`). This will be updated using an Elo-like formula after each scored utterance:

1.  **Expected Outcome (`expected`):**
    \[ expected = \frac{1}{1 + 10^{\frac{D - S_{category}}{20}}} \]
    (Where D is the difficulty of the attempted prompt, and S_category is the user's current skill in that prompt's category. The divisor 20 implies a 200 Elo point difference gives a ~90% win rate, can be tuned).

2.  **Actual Result (`result`):**
    *   `result = 1` if `utterance.score ≥ 0.8`
    *   `result = 0` if `utterance.score < 0.8`

3.  **Skill Update (`S_next`):**
    \[ S_{next} = S_{category} + K \cdot (result - expected) \]
    (K is a sensitivity factor, e.g., K ≈ 4 for finer adjustments, or K ≈ 16-32 for faster changes initially).

## 3. Adaptation Loops

### 3.1 Micro-Loop (Within a Session)

*   **Rule 1 (Struggling):** If a user scores `< 0.6` on 3 consecutive prompts within the same category, the next prompt fetched for that category (or a general easy prompt) should be easier (e.g., target D a certain amount lower than current S).
*   **Rule 2 (Excelling):** If a user scores `> 0.85` AND has low latency (e.g., `< 2 seconds`) on 3 consecutive prompts, the next prompt fetched could be harder (e.g., target D slightly higher than current S).
*   **Implementation:**
    *   Maintain streak counters (e.g., `wrongStreak`, `fastCorrectStreak`) in `VoiceSession.tsx` component state.
    *   If a streak condition is met, the `VoiceSession` component might make a specific API call to `/api/adaptive/next-prompt?type=easier|harder&currentSkill={S_category}` to get a replacement prompt. Or, the main prompt fetching could return a small "standby" pool.

### 3.2 Macro-Loop (Across Sessions)

*   **User Skill Score Updates:** The User Skill Index (S) for each category is updated after each utterance. This naturally influences future sessions.
*   **Scheduled Re-computation/Analysis (Nightly):**
    *   A nightly scheduled job (e.g., Vercel CRON job triggering an API route like `/api/cron/update-user-skills`) will:
        *   Iterate through users (or active users).
        *   Potentially re-evaluate or decay older skill scores if needed, or aggregate performance trends.
        *   Ensure `users/{uid}.skillScores` is up-to-date. This can also be used for reporting or identifying plateaus.
*   **Prompt Pool Refresh/Augmentation:** Periodically, the `generatePromptDocs` function might be called to add new prompts to the `promptPool`, especially if variety is running low or users are mastering existing content.

*   **Composition Rule for Next Session Batch (Example - 10 prompts):**
    The `/api/openai/prompts` endpoint will use the user's current skill scores (`S_category` from `users/{uid}.skillScores`) to determine the mix and difficulty of prompts for the next session.
    Example logic:
    ```
    if S_genericVocab < 40:
      // Emphasize easier, foundational content
      num_easy_generic = 3
      num_personal_vocab = 3 (difficulty based on S_personalVocab)
      num_open_ended = 2
      num_challenge = 2 (difficulty based on S_challenge, perhaps capped lower)
    else if S_genericVocab >= 40 && S_genericVocab <= 70:
      // Balanced mix
      num_easy_generic = 2
      num_personal_vocab = 3
      num_open_ended = 2
      num_generic_vocab = 1 (at current S_genericVocab level)
      num_challenge = 2
    else: // S_genericVocab > 70
      // More challenging content
      num_easy_generic = 1
      num_personal_vocab = 2
      num_open_ended = 2
      num_generic_vocab = 2 (at current S_genericVocab level)
      num_challenge = 3
    ```
    (This is illustrative; the exact categories and counts will align with the AI generation capabilities.)

*   **Challenge Prompt Generation:**
    When generating "challenge" category prompts, the `generatePromptDocs` function (or a specialized version) could be informed by the user's average skill level (`S_avg`) to request prompts from OpenAI with a target difficulty, e.g., "Generate 2 challenge prompts with a conceptual difficulty around `S_avg + 10` out of 100..."

## 4. Prompt Generation & Storage

*   **New Firestore Collection:** `users/{uid}/promptPool/{promptId}` (replaces `generatedPrompts`)
    *   `text: string`
    *   `category: 'open' | 'personalVocab' | 'genericVocab' | 'challenge'` (AI needs to output this)
    *   `difficulty: number` (0-100, calculated by `difficulty.js`)
    *   `freqNorm: number` (1-5, from `difficulty.js`)
    *   `abstractness: number` (1-5, from `difficulty.js`)
    *   `lengthScale: number` (1-5, from `difficulty.js`)
    *   `responseTypeScale: number` (1-3, from `difficulty.js`)
    *   `semanticDistanceScale: number` (1-3, from `difficulty.js`)
    *   `lastUsedAt: Timestamp | null`
    *   `timesServed: number`
    *   `lastScore: number | null` (score of the last attempt on this specific prompt)
    *   `createdAt: Timestamp`
    *   `source: string`
    *   `ownerUid: string`

*   **Generation Pipeline:**
    1.  OpenAI (`gpt-4o-mini` or successor) produces ~15 raw prompts based on an enhanced system prompt that requests categories.
    2.  A server-side utility (`lib/difficulty.js` or similar) calculates the difficulty dimensions and final `difficulty` score for each raw prompt. This may involve:
        *   Fetching lexical frequency data (e.g., from a local SUBTLEX-US data file/map).
        *   Fetching concreteness ratings (e.g., from a local MRC data file/map or another GPT call for estimation if necessary).
        *   Calculating token count for length.
        *   Estimating response type (single word, phrase, sentence) based on prompt structure/category.
        *   Calculating semantic distance using embeddings (requires prompt text embedding and user context embeddings).
    3.  Prompts, along with their categories and difficulty scores (and constituent dimension scores), are written to `users/{uid}/promptPool`.

*   **`/api/openai/prompts` (Querying `promptPool`):**
    *   Accepts user skill scores (`S_category`) as parameters.
    *   Applies composition rules (see 3.2) to determine how many prompts of each category to fetch.
    *   For each required category, queries `promptPool`:
        ```sql
        -- Conceptual query for a category
        SELECT * FROM users/{uid}/promptPool
        WHERE category = 'specific_category' 
          AND difficulty BETWEEN (S_category - difficulty_window_delta) 
                           AND (S_category + difficulty_window_delta)
        ORDER BY lastUsedAt ASC
        LIMIT num_prompts_for_category;
        ```
    *   `difficulty_window_delta` (e.g., δ ≈ 8-10 points) keeps fetched prompts bracketed around the user's current skill level for that category.
    *   Assembles and returns the final batch of ~10-12 prompts for the session.

## 5. Cue Adaptation (Future Enhancement)

*   If `utterances.cueUsed` (a new boolean field) is true on two consecutive errors for similar prompts/categories, the system could automatically decide to offer a more explicit cue (e.g., phonemic cue like "It starts with B...") for the next prompt in that category.
*   Store cue type offered and success rate for SLP analytics and further system tuning.

## 6. Short-Term vs. Long-Term Strategy

| Horizon        | Goal                                         | Mechanism                                                                                               |
| :------------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| Within Session | Maintain flow, prevent frustration/boredom   | Micro-loop: streak-based easier/harder prompt injection.                                                |
| Next Session   | Gradual skill progression                    | Macro-loop: Updated S_category influencing prompt mix and difficulty band selection by `/api/openai/prompts`. |
| Weekly/Monthly | Re-baseline, surface plateaus, adapt domains | Nightly job data, reports to user/caregiver. Consider suggesting new lexical domains or goals.            |

## 7. Phased Implementation Order

1.  **Data Model Update (Core):**
    *   Rename Firestore collection `generatedPrompts` to `promptPool` (path: `users/{uid}/promptPool/{promptId}`). Update all CRUD operations.
    *   Add new fields to `promptPool` documents: `category`, `difficulty` (nullable initially), and the five constituent difficulty dimension scores (e.g., `lexicalRarityScore`, `concretenessScore`, etc., all nullable initially).
    *   Update the system prompt for OpenAI in `lib/openai.ts` to request prompts with a specified `category` ("open", "personalVocab", "genericVocab", "challenge").
    *   Modify `generatePromptDocs` in `lib/openai.ts` to save the `category` returned by OpenAI (or inferred). Set `difficulty` and dimension scores to null/default for now.

2.  **`difficulty.js` Utility (V1 - Basic Dimensions):**
    *   Create `lib/difficultyUtil.ts` (or similar).
    *   Implement calculation for:
        *   `promptLength` (token count bucketed).
        *   `responseType` (estimated based on category or keywords).
    *   Integrate basic lexical rarity (e.g., placeholder based on word length for now, or a very small high/low freq list).
    *   Integrate basic concreteness (e.g., placeholder, or all concrete for now).
    *   Semantic distance can be a placeholder (e.g., all "personalVocab" and "open" are close, "genericVocab" and "challenge" are further).
    *   Implement the weighted `Difficulty Score D` formula using these (potentially placeholder) dimensions.
    *   Update `generatePromptDocs` to call this utility and save the calculated `difficulty` and dimension scores.

3.  **User Skill Score Storage & Basic Elo Update:**
    *   Add `skillScores: { personalVocab: number, genericVocab: number, challenge: number }` (all defaulting to e.g., 50) to `users/{uid}` document in Firestore. (Initially omit `open` from Elo).
    *   In `VoiceSession.tsx` (`handleProcessRecording`):
        *   Retrieve `prompt.category` and `prompt.difficulty` for the current prompt.
        *   Retrieve user's current `S_category` from their profile (fetched via `useAuth` or a dedicated context/hook if skill scores are updated frequently).
        *   Implement the Elo update formulas (`expected`, `result`, `S_next`).
        *   Update `users/{uid}.skillScores.{category}` in Firestore with `S_next`. *(Consider debouncing or end-of-session update for `skillScores` to reduce writes if per-utterance is too chatty).*

4.  **Update `/api/openai/prompts` for Difficulty Bracketing:**
    *   Modify this API route to:
        *   Accept user's current skill scores (`S_category`) as parameters (client will need to send them).
        *   Implement the prompt composition rules (e.g., how many of each category based on `S_genericVocab`).
        *   For each category, query `promptPool` using the `difficulty BETWEEN (S_category - δ) AND (S_category + δ)` clause.
        *   Handle cases where not enough prompts are found in the target difficulty band (e.g., widen `δ`, fetch from adjacent bands, or trigger new generation).

5.  **Micro-Loop (Within Session - V1):**
    *   In `VoiceSession.tsx`, implement streak counters for consecutive errors or fast correct answers.
    *   If a streak is met, for now, log it. The actual "injection" of an easier/harder prompt can be a V2 if fetching on-the-fly is complex initially. Or, the main prompt fetch could return 1-2 "spare" easy/hard prompts.

6.  **Nightly/Scheduled Job (V1 - Basic):**
    *   Set up a Vercel CRON job pointing to an API route (e.g., `/api/cron/update-user-skills`).
    *   Initially, this job might just log activity or perform very simple maintenance. Full re-computation of Elo scores for all users might be complex to start. The per-utterance Elo update is the primary driver. This job could be more for future decay models or global analytics.

7.  **Testing & Iteration:**
    *   Unit-test `difficultyUtil.ts` and Elo update logic.
    *   Seed data for users and `promptPool` to test API responses.
    *   A/B test the adaptive mode against the previous non-adaptive system if feasible, tracking engagement and user-reported satisfaction/frustration, alongside accuracy metrics.

8.  **Full `difficulty.js` Implementation (V2+):**
    *   Integrate real SUBTLEX-US data for lexical rarity.
    *   Integrate real MRC (or similar) data for concreteness, or develop/fine-tune a GPT-based estimator.
    *   Implement prompt and user context embeddings and cosine similarity for semantic distance.

## Prompt Pool Size, Deduplication, and Batch Assembly Policy (Update)

**Minimum Pool Size & Regeneration:**
- Each user should maintain at least N=60–100 prompts in their `promptPool` covering all categories.
- If the pool for a user falls below N=35, trigger `generatePromptDocs` to top up; each generation call should request 20–40 new unique prompts.

**Deduplication:**
- Before writing new prompts, ensure no duplicate `text` fields exist for that user (case- and punctuation-insensitive matching with whitespace normalized).
- Reject any generated prompt whose text is already in the user's pool.

**Session Batch Assembly (`/api/openai/prompts`):**
- When composing a session batch:
    1. Exclude prompts where user's recent average score for that prompt is ≥ 0.85 ("mastered"), unless the pool is too small.
    2. Exclude prompts with `lastUsedAt` among the two most recent sessions for that user.
    3. Optionally, deprioritize or exclude prompts with repeated skips/timeouts (if tracked).
- If there aren't enough eligible prompts, progressively relax the filters or trigger a pool top-up.

**Prompt Pool Maintenance (Archival):**
- Optionally, prompts can be archived or marked "retired" if they haven't been served in >3 months AND are mastered.

This phased approach allows for incremental development and testing of a very sophisticated system. 