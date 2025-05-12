# Adaptive Difficulty Blueprint for Aphasia Coach

This document outlines a comprehensive plan for implementing an adaptive difficulty system in the Aphasia Coach application. The goal is to keep users within their Zone of Proximal Development (ZPD) by dynamically adjusting prompt difficulty based on their performance.

## 1. Define "Difficulty"

Prompt difficulty will be quantified by several dimensions, combined into a weighted Difficulty Score (D) ranging from 0 to 100.

| Dimension                               | Why it matters                                  | How to quantify (v1)                                                                                                   | Weight (Example) |
| :-------------------------------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :--------------- |
| **Lexical Rarity**                      | Low-frequency words are harder to retrieve.     | `log10(frequency)` from a reference corpus (e.g., SUBTLEX-US), normalized to a 1 (easy) – 5 (hard) scale (`freqNorm`). | 20               |
| **Concreteness/Abstractness**           | Abstract nouns & verbs are tougher post-stroke. | MRC concreteness ratings or a GPT-based estimation (1–5 scale, where 5 is more abstract).                              | 15               |
| **Prompt Length**                       | More words = higher working-memory load.        | Token count, bucketed into a 1–5 scale (e.g., 1-3 tokens=1, 4-6=2, etc.).                                              | 10               |
| **Response Type**                       | Sentence > phrase > single word.                | Ordinal scale: single word=1, phrase=2, sentence=3.                                                                    | 25               |
| **Semantic Distance from User Context** | Unfamiliar topics are harder.                   | Cosine distance between prompt embedding and user topic embeddings (from onboarding), binned to 3 levels (1-3).        | 30               |

**Difficulty Score Formula (D):**
\[ D = 20 \cdot (5 - freqNorm) + 15 \cdot (abstractness) + 10 \cdot (lengthScale) + 25 \cdot (responseTypeScale) + 30 \cdot (semanticDistanceScale) \]
_(Weights are illustrative and can be tuned. `freqNorm` is inverted as higher frequency means lower difficulty)._

## 2. Measure User Performance

User performance will be tracked through several signals, primarily to update a User Skill Index (S) for different prompt categories.

| Signal               | Sampling      | Stored Where                                                                                          |
| :------------------- | :------------ | :---------------------------------------------------------------------------------------------------- |
| Accuracy (score 0-1) | Per utterance | `promptPool/{uid}/{promptId}` (as `lastScore`), and historically in `sessions/{sid}/utterances/{uid}` |
| Latency (ms)         | Per utterance | `sessions/{sid}/utterances/{uid}`                                                                     |
| Cue Needed (bool)    | Per utterance | `sessions/{sid}/utterances/{uid}` (FUTURE)                                                            |
| Session Aggregates   | Per session   | `sessions/{sid}` (mean accuracy, latency)                                                             |

**User Skill Index (S):**
A skill index (S), ranging from 0 to 100, will be maintained for each relevant prompt category (e.g., `personalVocab`, `genericVocab`, `challenge`). This will be updated using an Elo-like formula after each scored utterance:

1.  **Expected Outcome (`expected`):**
    \[ expected = \frac{1}{1 + 10^{\frac{D - S\_{category}}{20}}} \]
    (Where D is the difficulty of the attempted prompt, and S_category is the user's current skill in that prompt's category. The divisor 20 implies a 200 Elo point difference gives a ~90% win rate, can be tuned).

2.  **Actual Result (`result`):**

    - `result = 1` if `utterance.score ≥ 0.8`
    - `result = 0` if `utterance.score < 0.8`

3.  **Skill Update (`S_next`):**
    \[ S*{next} = S*{category} + K \cdot (result - expected) \]
    (K is a sensitivity factor, e.g., K ≈ 4 for finer adjustments, or K ≈ 16-32 for faster changes initially).

## 3. Adaptation Loops

### 3.1 Micro-Loop (Within a Session)

- **Rule 1 (Struggling):** If a user scores `< 0.6` on 3 consecutive prompts within the same category, the next prompt fetched for that category (or a general easy prompt) should be easier (e.g., target D a certain amount lower than current S).
- **Rule 2 (Excelling):** If a user scores `> 0.85` AND has low latency (e.g., `< 2 seconds`) on 3 consecutive prompts, the next prompt fetched could be harder (e.g., target D slightly higher than current S).
- **Implementation:**
  - The initial batch of prompts returned by `/api/openai/prompts` will include main prompts and backup prompts:
    ```ts
    // batch returned shape
    { main:[10 prompts], easyBackups:[3], hardBackups:[3] }
    ```
  - Maintain streak counters (e.g., `wrongStreak`, `fastCorrectStreak`) in `VoiceSession.tsx` component state.
  - If a struggling streak (e.g., 3 `wrongStreak`) is met, replace the current prompt with one from `easyBackups`: `replacePrompt(easyBackups.shift())`.
  - If an excelling streak (e.g., 3 `fastCorrectStreak`) is met, replace the current prompt with one from `hardBackups`: `replacePrompt(hardBackups.shift())`.
  - If a backup pool (`easyBackups` or `hardBackups`) empties, `VoiceSession.tsx` will make an API call to fetch more: `/api/openai/prompts?difficulty=lower|higher&count=2&currentSkill={S_category}`.

### 3.2 Macro-Loop (Across Sessions)

- **User Skill Score Updates:** The User Skill Index (S) for each category is updated after each utterance. This naturally influences future sessions.
- **Scheduled Re-computation/Analysis (Nightly):**
  - A nightly scheduled job (e.g., Vercel CRON job triggering an API route like `/api/cron/update-user-skills`) will:
    - Iterate through users (or active users).
    - Potentially re-evaluate or decay older skill scores if needed, or aggregate performance trends.
    - Ensure `users/{uid}.skillScores` is up-to-date. This can also be used for reporting or identifying plateaus.
    - This job will call `generatePromptDocs` for each relevant category to top-up the prompt pool, using the user's current skill score as the target difficulty. For example:
      ```ts
      await generatePromptDocs({
        uid,
        targetCategory: "genericVocab",
        targetDifficulty: S.genericVocab, // User's current skill for that category
        window: 8, // Default window size
        batch: 20, // Default batch size
      });
      // Similar calls for other categories like 'personalVocab', 'challenge'
      ```
- **Prompt Pool Refresh/Augmentation:** Periodically, or when the pool runs low (see Section 8), the `generatePromptDocs` function will be called by the nightly job to add new prompts.

- **Composition Rule for Next Session Batch (Example - 10 prompts):**
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

- **Challenge Prompt Generation:**
  When generating "challenge" category prompts, the `generatePromptDocs` function will be called with `targetCategory: 'challenge'` and `targetDifficulty` set based on the user's `S_challenge` score (e.g., `S_challenge + 10` or simply `S_challenge`).
  ```ts
  await generatePromptDocs({
    uid,
    targetCategory: "challenge",
    targetDifficulty: S.challenge, // Or S.challenge + 10 for a higher target
    window: 8,
    batch: 10, // Potentially smaller batch for specialized challenges
  });
  ```

### 3.3 Overall Adaptive Flow Summary

The following diagram illustrates the flow of information in the adaptive system:

```scss
[User skill S] ──► nightly CRON ──► generatePromptDocs(targetDifficulty=S)
            ▲                                  │
            │                                  ▼
      Elo update ◄── score utterance ◄── VoiceSession (with micro-loop adjustments)
```

## 4. Prompt Generation & Storage

- **New Firestore Collection:** `users/{uid}/promptPool/{promptId}` (replaces `generatedPrompts`)

  - `text: string`
  - `category: 'open' | 'personalVocab' | 'genericVocab' | 'challenge'` (AI needs to output this)
  - `difficulty: number` (0-100, calculated by `difficulty.js`)
  - `freqNorm: number` (1-5, from `difficulty.js`)
  - `abstractness: number` (1-5, from `difficulty.js`)
  - `lengthScale: number` (1-5, from `difficulty.js`)
  - `responseTypeScale: number` (1-3, from `difficulty.js`)
  - `semanticDistanceScale: number` (1-3, from `difficulty.js`)
  - `lastUsedAt: Timestamp | null`
  - `timesServed: number`
  - `lastScore: number | null` (score of the last attempt on this specific prompt)
  - `createdAt: Timestamp`
  - `source: string`
  - `ownerUid: string`

- **Generation Pipeline:**

  1.  **Initiation**: The `generatePromptDocs` function is called, typically by the nightly CRON job or when a user's prompt pool for a category is low.
      ```typescript
      // lib/openai.ts (illustrative)
      export async function generatePromptDocs({
        uid,
        targetCategory, // 'personalVocab' | 'genericVocab' | 'challenge' | 'open'
        targetDifficulty, // number 0-100, centre of the target difficulty band
        window = 8, // ± range for the difficulty band
        batch = 20, // Number of prompts to request from LLM
      }: {
        /* params */
      }) {
        // ...
      }
      ```
  2.  **LLM Prompting**: OpenAI (`gpt-4o-mini` or successor) is called with a difficulty-aware system prompt. The generation wrapper fills `<CATEGORY>`, `<BATCH>`, `<D_LOW>`, and `<D_HIGH>` from the `generatePromptDocs` parameters (`D_LOW = targetDifficulty - window`, `D_HIGH = targetDifficulty + window`).

      ```text
      You are generating therapy prompts for aphasia rehab.
      Return exactly <BATCH> JSON objects.

      ### Target specs
      • category = "<CATEGORY>"
      • aim for difficulty **between <D_LOW> and <D_HIGH>** on a 0-100 scale
        (see difficulty rubric below).

      ### Difficulty rubric (internal)
      0-30 very easy – high-frequency, concrete, single-word answers
      31-50 moderate – everyday but less common, single-word answers
      51-70 hard – low-frequency or abstract but concrete enough to cue
      71-85 very hard – rare words, two-word collocations allowed
      86-100 expert – do NOT output; reserved for future

      ### Prompt format rules
      1. One clear single-word answer unless <CATEGORY> is "open".
      2. Sentence ≤ 12 words.
      3. No "two-word phrase for…" meta wording.
      4. Friendly tone.

      ### Output JSON schema
      { "prompt":"...", "category":"...", "answer":"..." }

      ### Examples (good)
      { "prompt":"Name the tool that trims tree branches.", "category":"personalVocab", "answer":"loppers" }
      { "prompt":"What do you call a baby cat?", "category":"genericVocab", "answer":"kitten" }
      { "prompt":"Name the document immigrants carry for travel.", "category":"challenge", "answer":"passport" }

      Return as: { "prompts":[…<BATCH> items…] }
      NO comments or markdown.
      ```

  3.  **Post-Generation Scoring & Filtering**:
      - Parse the `batch` (e.g., 20) items returned by the LLM.
      - For each generated prompt, run `lib/difficultyUtil.ts` to compute its actual difficulty score (`D_actual`) and constituent dimension scores.
      - Filter out items where `D_actual` is outside the target window: `[targetDifficulty - window, targetDifficulty + window]`.
      - Deduplicate the remaining valid prompts against the user's existing `promptPool` (case- and punctuation-insensitive matching with whitespace normalized).
      - Upsert the new, valid, unique prompts into `users/{uid}/promptPool/{promptId}` in Firestore, including all calculated dimension scores.
      - If too few items remain after filtering and deduplication (e.g., less than `batch / 2`), consider re-calling the LLM with a slightly shifted window, a different batch size, or logging for manual review.

- **`/api/openai/prompts` (Querying `promptPool`):**

  - Accepts user skill score for a category (e.g., `skill=57`) and the category itself (e.g., `category=genericVocab`) as parameters. May also accept `count` for micro-loop refills.
    `GET /api/openai/prompts?category=genericVocab&skill=57`
  - Applies composition rules (see 3.2) to determine how many prompts of each category to fetch for a new session's main batch.
  - For each required category, queries `promptPool`:

    ```typescript
    // Server-side conceptual logic
    const skill = /* from query params */;
    const category = /* from query params */;
    const band = 8; // Difficulty window
    const neededCount = /* from composition rules or 'count' param */;

    // Query Firestore
    query(
      collection(db, `users/${uid}/promptPool`),
      where('category', '==', category),
      where('difficulty', '>=', skill - band),
      where('difficulty', '<=', skill + band),
      orderBy('difficulty'), // or orderBy('lastUsedAt', 'asc')
      limit(neededCount)
    );
    ```

  - If the query returns fewer prompts than `neededCount`:
    - Try widening the band (e.g., `band + 2`).
    - If still insufficient, fetch prompts from the next-easier slice first (e.g., `where('difficulty', '<', skill - band), orderBy('difficulty', 'desc')`) or trigger a top-up generation.
  - Assembles and returns the final batch of prompts. For a full session, this includes `main`, `easyBackups`, and `hardBackups` arrays. For micro-loop refills, it might just be a small array of prompts.

## 5. Cue Adaptation (Future Enhancement)

- If `utterances.cueUsed` (a new boolean field) is true on two consecutive errors for similar prompts/categories, the system could automatically decide to offer a more explicit cue (e.g., phonemic cue like "It starts with B...") for the next prompt in that category.
- Store cue type offered and success rate for SLP analytics and further system tuning.

## 6. Short-Term vs. Long-Term Strategy

| Horizon        | Goal                                         | Mechanism                                                                                                     |
| :------------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| Within Session | Maintain flow, prevent frustration/boredom   | Micro-loop: streak-based easier/harder prompt injection.                                                      |
| Next Session   | Gradual skill progression                    | Macro-loop: Updated S_category influencing prompt mix and difficulty band selection by `/api/openai/prompts`. |
| Weekly/Monthly | Re-baseline, surface plateaus, adapt domains | Nightly job data, reports to user/caregiver. Consider suggesting new lexical domains or goals.                |

## 7. Phased Implementation Order

1.  **Data Model Update (Core):**

    - **[COMPLETED]** Rename Firestore collection `generatedPrompts` to `promptPool` (path: `users/{uid}/promptPool/{promptId}`). Update all CRUD operations.
    - **[COMPLETED]** Add new fields to `promptPool` documents: `category`, `difficulty` (nullable initially), and the five constituent difficulty dimension scores (e.g., `lexicalRarityScore`, `concretenessScore`, etc., all nullable initially).
    - **[COMPLETED]** Update the system prompt for OpenAI in `lib/openai.ts` to request prompts with a specified `category` ("open", "personalVocab", "genericVocab", "challenge") and to aim for a difficulty range. The `generatePromptDocs` function in `lib/openai.ts` will be updated to accept `targetCategory`, `targetDifficulty`, `window`, and `batch` parameters.
    - **[COMPLETED]** Modify `generatePromptDocs` in `lib/openai.ts` to save the `category` returned by OpenAI (or inferred) and implement the post-generation scoring, filtering, and deduplication logic. Set `difficulty` and dimension scores to null/default for prompts generated before this system is active.

2.  **`difficulty.js` Utility (V1 - Basic Dimensions):**

    - **[NOT STARTED]** Create `lib/difficultyUtil.ts` (or similar).
    - **[NOT STARTED]** Implement calculation for:
      - `promptLength` (token count bucketed).
      - `responseType` (estimated based on category or keywords).
    - **[NOT STARTED]** Integrate basic lexical rarity (e.g., placeholder based on word length for now, or a very small high/low freq list).
    - **[NOT STARTED]** Integrate basic concreteness (e.g., placeholder, or all concrete for now).
    - **[NOT STARTED]** Semantic distance can be a placeholder (e.g., all "personalVocab" and "open" are close, "genericVocab" and "challenge" are further).
    - **[NOT STARTED]** Implement the weighted `Difficulty Score D` formula using these (potentially placeholder) dimensions.
    - **[NOT STARTED]** Update `generatePromptDocs` to call this utility and save the calculated `difficulty` and dimension scores.

3.  **User Skill Score Storage & Basic Elo Update:**

    - **[NOT STARTED]** Add `skillScores: { personalVocab: number, genericVocab: number, challenge: number }` (all defaulting to e.g., 50) to `users/{uid}` document in Firestore. (Initially omit `open` from Elo).
    - **[NOT STARTED]** In `VoiceSession.tsx` (`handleProcessRecording`):
      - Retrieve `prompt.category` and `prompt.difficulty` for the current prompt.
      - Retrieve user's current `S_category` from their profile (fetched via `useAuth` or a dedicated context/hook if skill scores are updated frequently).
      - Implement the Elo update formulas (`expected`, `result`, `S_next`).
      - Update `users/{uid}.skillScores.{category}` in Firestore with `S_next`. _(Consider debouncing or end-of-session update for `skillScores` to reduce writes if per-utterance is too chatty)._

4.  **Update `/api/openai/prompts` for Difficulty Bracketing:**

    - **[NOT STARTED]** Modify this API route to:
      - Accept user's current skill score for a given category (e.g. `S_category`) and `category` as parameters.
      - Implement the prompt composition rules (e.g., how many of each category based on `S_genericVocab`).
      - For each category, query `promptPool` using a difficulty band around `S_category` (e.g., `difficulty BETWEEN (S_category - band) AND (S_category + band)`).
      - Implement fallback logic if not enough prompts are found (widen band, fetch from adjacent bands).
      - Return `main`, `easyBackups`, and `hardBackups` arrays for full session requests.

5.  **Micro-Loop (Within Session - V1):**

    - **[NOT STARTED]** In `VoiceSession.tsx`, implement streak counters.
    - **[NOT STARTED]** On streak, use `easyBackups.shift()` or `hardBackups.shift()`.
    - **[NOT STARTED]** If backup pools empty, call `/api/openai/prompts?difficulty=lower|higher&count=2&currentSkill={S_category}`.

6.  **Nightly/Scheduled Job (V1 - Basic):**

    - **[NOT STARTED]** Set up a Vercel CRON job pointing to an API route (e.g., `/api/cron/update-user-skills`).
    - **[NOT STARTED]** Initially, this job might just log activity or perform very simple maintenance. Full re-computation of Elo scores for all users might be complex to start. The per-utterance Elo update is the primary driver. This job could be more for future decay models or global analytics.

7.  **Testing & Iteration:**

    - **[IN PROGRESS - INFORMAL]** Unit-test `difficultyUtil.ts` and Elo update logic.
    - **[IN PROGRESS - INFORMAL]** Seed data for users and `promptPool` to test API responses.
    - **[IN PROGRESS - INFORMAL]** A/B test the adaptive mode against the previous non-adaptive system if feasible, tracking engagement and user-reported satisfaction/frustration, alongside accuracy metrics.
    - **Quick Sanity Tests:**
      1.  Seed a fake user with `S.genericVocab = 35`.
      2.  Run `generatePromptDocs` for the `genericVocab` category with `targetDifficulty: 35, window: 8`. Verify that most prompts written to `promptPool` have a calculated `difficulty` between 27 and 43.
      3.  Call `/api/openai/prompts?category=genericVocab&skill=35`. Confirm that the retrieved prompts primarily fall within the 27-43 difficulty band.
      4.  In the UI (mocked or actual), simulate a 3-wrong streak and verify that `easyBackups.shift()` is called and a fallback prompt is presented.
      5.  Simulate emptying `easyBackups` and verify the API call to fetch more easy prompts.

8.  **Full `difficulty.js` Implementation (V2+):**
    - **[NOT STARTED]** Integrate real SUBTLEX-US data for lexical rarity.
    - **[NOT STARTED]** Integrate real MRC (or similar) data for concreteness, or develop/fine-tune a GPT-based estimator.
    - **[NOT STARTED]** Implement prompt and user context embeddings and cosine similarity for semantic distance.

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
This wiring keeps the difficulty engine (data layer) and prompt generator (LLM layer) talking in a tight loop, ensuring users always practise at the right challenge level.
