# Future Plans for Aphasia Coach

This document outlines potential enhancements and new features for Aphasia Coach, focusing on integrating additional speech therapy techniques to improve the app's effectiveness for users recovering from aphasia post-stroke. These ideas are based on established practices in speech-language pathology and are intended to complement the existing text and image-based prompting systems.

## Speech Therapy Techniques for Future Implementation

### 1. Melodic Intonation Therapy (MIT)

- **Description**: MIT leverages musical elements of speech (melody and rhythm) to improve language production. It involves singing phrases or sentences with exaggerated intonation, which can help bypass damaged left-hemisphere language areas by engaging the right hemisphere.
- **Relevance**: Particularly effective for non-fluent aphasia (e.g., Broca's aphasia), where users struggle with speech production but may retain singing abilities.
- **Integration**:
  - Develop a mode where prompts are delivered with a melodic pattern or rhythm (e.g., via pre-recorded audio or synthesized speech with tonal variations).
  - Users could repeat or sing along with the prompt before attempting to speak it naturally.
  - Implementation could involve a new session mode (`/session?mode=melodic`) with audio prompts designed for rhythm and melody, potentially requiring a library of short, singable phrases.

### 2. Constraint-Induced Language Therapy (CILT)

- **Description**: CILT focuses on intensive, forced use of verbal communication by restricting alternative communication methods (e.g., gestures, writing). It often involves group settings where users must speak to communicate.
- **Relevance**: Encourages active use of spoken language, which can strengthen neural pathways for speech in aphasia patients.
- **Integration**:
  - Create a mode or setting that disables text input or visual cues, forcing users to respond verbally to prompts.
  - Gamify the experience by setting challenges (e.g., "Complete 5 prompts using only speech") with rewards like badges or progress tracking.
  - This could be a toggle in the session settings, emphasizing voice-only interaction, though it might be challenging to enforce without physical supervision.

### 3. Semantic Feature Analysis (SFA)

- **Description**: SFA helps users retrieve words by focusing on semantic features of a target word (e.g., category, function, location, attributes). For example, for "apple," a therapist might ask, "What category is it? What do you do with it?"
- **Relevance**: Useful for word-finding difficulties, common in aphasia, by providing structured cues to trigger recall.
- **Integration**:
  - Implement a multi-step prompt system where, if a user struggles (e.g., low score or long latency), the app provides semantic cues one at a time (e.g., "This is a type of fruit. You eat it.").
  - Store semantic features with each prompt in Firestore (e.g., in `promptPool` or `imagePrompts`) and dynamically present them as hints during a session.
  - This could tie into the micro-loop adaptation, offering cues as part of the "easier" backup prompts when a user is struggling.

### 4. Phonological Cueing

- **Description**: This technique provides sound-based hints to help retrieve a word, such as the first sound or syllable (e.g., "It starts with 'b'" for "banana").
- **Relevance**: Effective for users who can recognize a word when given a phonetic starting point, addressing tip-of-the-tongue phenomena.
- **Integration**:
  - Add a feature to provide phonological cues after a failed attempt or timeout. Store the first phoneme or syllable with each prompt in Firestore.
  - In `VoiceSession.tsx`, if a user's score is below a threshold (e.g., <0.6), play or display a phonetic cue before the next attempt.
  - This could be part of the feedback loop, enhancing the existing `FeedbackOverlay` to include audio or text cues.

### 5. Script Training

- **Description**: Users practice functional, everyday scripts or dialogues (e.g., ordering at a restaurant) to improve fluency in specific contexts through repetition and role-play.
- **Relevance**: Helps with practical communication skills, making therapy directly applicable to daily life.
- **Integration**:
  - Develop a mode (`/session?mode=script`) with pre-defined conversational scripts based on user context (e.g., from onboarding data like "routine" or "goals").
  - Prompts could be multi-turn, simulating a dialogue (e.g., "Hello, how can I help you?" followed by user response, then "Would you like anything else?").
  - Store scripts in Firestore with associated difficulty levels, adapting them based on user skill via the existing Elo system.

### 6. Reading and Writing Therapy

- **Description**: Focuses on improving reading comprehension and written expression, often paired with spoken language tasks to reinforce connections between modalities.
- **Relevance**: Many aphasia patients have parallel difficulties with reading and writing, and cross-modal training can enhance overall language recovery.
- **Integration**:
  - Add a mode or optional feature where users read a prompt aloud from text or write a response (via keyboard input) after speaking.
  - Score written responses using a simple text similarity check against the expected answer, possibly via a lightweight NLP API or local logic.
  - This could be a future enhancement, requiring UI changes to include text input fields during sessions and storing written responses in `utterances`.

### 7. Group Therapy and Social Interaction

- **Description**: Involves practicing language in a social context with peers, often led by a therapist, to build confidence and functional communication skills.
- **Relevance**: Social interaction can motivate users and provide real-world practice, though it's challenging in a solo app environment.
- **Integration**:
  - Simulate group interaction through pre-recorded or AI-generated peer responses, creating a virtual conversation environment.
  - Alternatively, allow caregivers or family to join sessions remotely (future feature) via a shared session link, though this requires significant backend and UI work.
  - For MVP, focus on motivational feedback mimicking social encouragement (e.g., "Great job, everyone noticed your improvement!").

### 8. Gestural and Multimodal Approaches

- **Description**: Encourages use of gestures, drawing, or other non-verbal methods alongside speech to support communication, especially when verbal expression fails.
- **Relevance**: Can reduce frustration by providing alternative expression methods, though the primary goal remains spoken language.
- **Integration**:
  - Offer an optional gesture recognition feature using device camera (long-term, privacy and tech challenges).
  - For now, include instructions or animations showing gestures for certain prompts (e.g., "Point to the sky" with an image or video), reinforcing multimodal learning.
  - Track if gestures were used (via user self-report or future camera integration) in `utterances` for analytics.

## Implementation Considerations

- **Prioritization**: Start with techniques that fit seamlessly into the current voice session framework, like Semantic Feature Analysis and Phonological Cueing, as they enhance existing prompts with minimal UI overhaul. Melodic Intonation Therapy and Script Training could follow as distinct modes.
- **Adaptation**: Use the adaptive difficulty system (`difficultyplan.md`) to tailor these techniques. For example, adjust the complexity of scripts or the frequency of cues based on user skill scores (`S_category`).
- **Data Model**: Extend Firestore collections (`promptPool`, `imagePrompts`) to store additional metadata (e.g., semantic features, phonetic cues, script sequences) for each prompt type.
- **User Experience**: Ensure new modes are optional and accessible via clear navigation (e.g., mode selection screen before a session starts), maintaining simplicity for users with cognitive challenges.
- **Testing**: Unit test new logic (e.g., cue delivery, script progression) and conduct user feedback sessions to gauge effectiveness and frustration levels with each technique.

## Next Steps

Prioritize Semantic Feature Analysis and Phonological Cueing for initial implementation, as they can be integrated as enhancements to the feedback loop without requiring major UI changes. Steps include:

1. Update `promptPool` to include fields for semantic features and phonetic cues.
2. Modify `VoiceSession.tsx` to deliver cues after low-scoring attempts.
3. Test these features with a small set of prompts to ensure they aid word retrieval without overwhelming users.

These plans will be revisited and refined based on user feedback, technical feasibility, and therapeutic impact as Aphasia Coach evolves.
