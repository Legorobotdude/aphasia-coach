# Aphasia Coach

**Personalized AI Aphasia Coach** – a mobile-installable web app (PWA) designed to help post-stroke users practice and improve word-retrieval skills through voice interaction.

## Core Features

1.  **Onboarding Wizard**:
    - A 6-step voice-based questionnaire (e.g., "Tell me about your job...") to gather personal topics and context.
    - User voice input is transcribed and used to seed personalized practice material.
2.  **Daily Voice Session**:
    - Presents spoken prompts to the user.
    - Records the user's spoken reply.
    - Sends both prompt and reply to an AI (OpenAI) for semantic scoring and analysis.
    - Provides instant, encouraging feedback (both visual and spoken).
    - Logs performance metrics (accuracy, latency).
3.  **Progress Dashboard**:
    - Displays trends in accuracy and response latency.
    - Tracks practice streaks.
    - Allows a caregiver to view the user's progress.

The application is designed to be accessible, responsive, and supports offline use for basic drills.

## Tech Stack

- **Framework**: Next.js (v15.3.1+) with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Firebase Authentication (Email/Password, Google)
- **Database**: Firestore (for user data, topics, session logs)
- **AI Integration**:
  - OpenAI Whisper for speech-to-text.
  - OpenAI GPT models (e.g., GPT-4.1 mini) for prompt generation and response scoring.
- **PWA**: `next-pwa` for progressive web app capabilities (installable, offline support).
- **Linting & Formatting**: ESLint, Prettier
- **Git Hooks**: Husky, lint-staged
- **Testing**:
  - Unit: Vitest, React Testing Library
  - E2E: Playwright

## Project Structure

The project follows the Next.js App Router paradigm.

- `app/`: Main application directory.
  - `(auth)/login/`: Firebase Authentication UI.
  - `onboarding/`: The 6-step voice-based onboarding wizard.
  - `session/`: The core daily voice practice session page.
  - `dashboard/`: User progress tracking and caregiver view.
  - `api/`: Server-side API routes.
    - `openai/transcribe/`: Handles audio transcription via Whisper.
    - `openai/score/`: Scores user utterance against a prompt.
    - `openai/prompts/`: Generates/fetches practice prompts.
- `lib/`: Shared utilities, TypeScript types, and core logic.
  - `firebaseConfig.ts`: Firebase client SDK configuration.
  - `firebaseAdmin.ts`: Firebase Admin SDK for server-side operations.
  - `openai.ts`: Wrappers for OpenAI API calls (server-only).
  - `audio.ts`: Browser audio recording utilities and hooks.
  - `types/`: TypeScript type definitions (e.g., Firestore data structures).
- `public/`: Static assets, including PWA manifest (`manifest.json`) and icons.
- `components/`: Shared React components.
  - `ui/`: Base UI elements (e.g., buttons, cards) potentially using a library like Shadcn/ui.
- `context/`: React context providers if needed for global state.
- `scripts/`: Utility scripts for development or deployment.

### Key Configuration Files

- `next.config.js`: Next.js and PWA configuration.
- `firebase.json`: Firebase project configuration (hosting, etc.).
- `firestore.rules`: Firestore security rules.
- `firestore.indexes.json`: Firestore index definitions.
- `tsconfig.json`: TypeScript compiler options.
- `eslint.config.mjs`: ESLint configuration.
- `postcss.config.mjs`: PostCSS configuration (for Tailwind CSS).
- `.env.local`: Local environment variables (API keys, Firebase config - **DO NOT COMMIT**).

## Getting Started

### Prerequisites

- Node.js (version recommended by Next.js, e.g., >=18.x)
- pnpm (or npm/yarn)
- Firebase account and a project set up.
- OpenAI API key.

### Setup

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd aphasia-coach
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Set up environment variables:**

    - Create a `.env.local` file in the root directory by copying `.env.example` (if provided, otherwise create from scratch).
    - Populate it with your Firebase project configuration details and your OpenAI API key.
      Example:

      ```
      NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
      NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
      NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

      OPENAI_API_KEY=your_openai_api_key

      # For Firebase Admin SDK (server-side)
      FIREBASE_SERVICE_ACCOUNT_JSON=path_to_your_service_account_key.json
      # or individual components:
      # FIREBASE_PROJECT_ID=your_project_id
      # FIREBASE_CLIENT_EMAIL=your_client_email
      # FIREBASE_PRIVATE_KEY=your_private_key
      ```

    - Ensure your Firebase service account key JSON is accessible or its contents are correctly set as environment variables for server-side Firebase Admin SDK initialization.

4.  **Firebase Setup:**

    - In your Firebase console:
      - Enable **Email/Password** and **Google** providers in Authentication.
      - Create a **Firestore** database (start in production mode and configure security rules).
    - Deploy Firestore rules from `firestore.rules` and indexes from `firestore.indexes.json`.

5.  **Run the development server:**
    ```bash
    pnpm dev
    ```
    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Development

- **Linting & Formatting**:

  ```bash
  pnpm lint
  pnpm format
  ```

  These are also run automatically on commit via Husky and lint-staged.

- **Testing**:
  - Run unit tests:
    ```bash
    pnpm test:unit
    ```
  - Run E2E tests (ensure the app is running):
    ```bash
    pnpm test:e2e
    ```
  - Run all tests:
    ```bash
    pnpm test
    ```

## Key Architectural Decisions & Features

- **Server-Side Logic**: API routes in `app/api/` handle sensitive operations like OpenAI calls and direct Firestore mutations, protected by Firebase ID token verification.
- **Offline Support**:
  - PWA capabilities allow installation and basic offline access.
  - Static assets and essential API GET requests (like prompts) are cached.
  - During offline voice sessions, utterances are stored locally (e.g., in IndexedDB) and synced to Firestore upon reconnection.
- **Accessibility**: Designed with accessibility in mind, including keyboard navigation, sufficient color contrast, and ARIA attributes.
- **Security**: Firestore security rules are defined to protect user data. Server-side authentication checks ensure only authorized users can access or modify their data.

## Firestore Data Model

- **`users/{uid}`**: Stores user profile information.
  - `fullName: string`
  - `timezone: string`
  - `onboardComplete: boolean`
- **`topics/{uid}/{topicId}`**: Personalized topics for the user, generated from onboarding.
  - `label: string` (e.g., "aviation")
  - `embedding: number[]` (vector embedding for semantic similarity)
  - `weight: number` (relevance score)
- **`sessions/{uid}/{sessionId}`**: Summary of each practice session.
  - `startedAt: timestamp`
  - `durationSec: number`
  - `accuracy: number` (average score)
  - `latencyMs: number` (average response time)
  - `promptCount: number`
- **`utterances/{sessionId}/{uttId}`**: Individual prompt-response pairs within a session.
  - `prompt: string`
  - `response: string` (transcribed user speech)
  - `score: number` (0-1, semantic similarity)
  - `latencyMs: number`
  - `ownerUid: string` (denormalized for security rules if needed)

(Refer to `buildplan.md` for more detailed schema and security rule logic.)

## Deployment

The application is intended for deployment on platforms like Vercel.

1.  Ensure all environment variables are set in the Vercel project settings.
2.  Connect your Git repository to Vercel.
3.  Pushing to the main branch will trigger a deployment.

## Contributing

Please refer to the `buildplan.md` for the overall architecture and upcoming features. Adhere to the established coding standards (TypeScript, ESLint, Prettier) and testing practices.

---

This `README.md` provides a comprehensive overview for developers and anyone interested in the Aphasia Coach project.
