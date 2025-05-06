# Revised Technical Build‑Plan

_(Single‑repo Next.js PWA · Firebase Auth + Firestore · Secure server routes · Rich context for the coding sub‑LLM)_

---

## 0 · What We’re Building (give this to the sub‑LLM up front)

> **Personalized AI Aphasia Coach** – a mobile‑installable web app that helps post‑stroke users practice word‑retrieval.
> **Core flow:**
>
> 1. **Onboarding Wizard** – records 6 short voice answers (“Tell me about your job…”) → transcribes → seeds personal topic data.
> 2. **Daily Voice Session Page** – plays a spoken prompt, records user reply, sends both to OpenAI for semantic scoring, gives instant feedback, logs metrics.
> 3. **Progress Dashboard** – shows accuracy trend, latency, streaks; caregiver can view.
>    Pages must be accessible, responsive, and work offline for basic drills.

The sub‑LLM should **re‑use shared utilities** (`/lib`) and respect the file structure below.

---

## 1 · Repo & Tooling

1. `npx create-next-app@latest aphasia-coach --ts --eslint --tailwind --app`.
2. Add **Firebase SDK** (`firebase`, `firebase-admin`) and a minimal `firebaseConfig.ts` exporting client & admin instances.
3. Configure **next-pwa**; enable `register: true, skipWaiting: true`.
4. Install **Husky + lint‑staged** (run `eslint --fix` & `prettier` on commit).

---

## 2 · Firebase Setup (No Cloud Functions)

5. In Firebase console:

   - Enable **Email / Google** providers in **Auth**.
   - Create **Firestore** (production mode).

6. Firestore **top‑level collections & example docs**

```
users/{uid}
  fullName: string
  timezone: string
  onboardComplete: boolean

topics/{uid}/{topicId}
  label: string         // e.g. "aviation"
  embedding: number[]   // 768‑float array
  weight: number

sessions/{uid}/{sessionId}
  startedAt: timestamp
  durationSec: number
  accuracy: number
  latencyMs: number

utterances/{sessionId}/{uttId}
  prompt: string
  response: string
  score: number
  latencyMs: number
```

_Firestore is schemaless; keep these shapes consistent._

7. **Security rules** (high‑level):

```rules
match /users/{userId} { allow read,write: if request.auth.uid == userId; }
match /topics/{userId}/{topicId} { allow read,write: if request.auth.uid == userId; }
match /sessions/{userId}/{sessionId} { allow read,write: if request.auth.uid == userId; }
match /utterances/{sessionId}/{uttId} {
  allow read,write: if isSessionOwner(sessionId);
}
function isSessionOwner(sessionId) {
  return get(/databases/$(database)/documents/sessions/$(request.auth.uid)/$(sessionId)).exists();
}
```

---

## 3 · Shared Libraries (create in `/lib`)

8. `firebaseClient.ts` – lazy‑init Firebase JS SDK (Auth + Firestore).
9. `firebaseAdmin.ts` – Node‑side admin SDK (used only in server routes).
10. `openai.ts` – wrappers:

- `transcribeAudio(buffer)` → Whisper.
- `generatePromptDocs(uid)` → GPT‑4.1 mini.
- `scoreUtterance(prompt, response)` → GPT‑4.1 mini.
  _Important: This file is **server‑only**; never import in client code._

11. `audio.ts` – browser recorder hook returning a `Blob` ready for Whisper (16 kHz, 16‑bit PCM). iOS Safari quirk: use `AudioContext` resample; sub‑LLM add fallback.

---

## 4 · Next.js File Structure & Page Context

```
app/
 └ (auth)/login              – Firebase UI or custom form
 └ onboarding/               – 6‑step voice wizard
 └ session/                  – ★ Voice Session Page ★
 └ dashboard/                – progress and caregiver invite
 api/
 └ openai/transcribe.ts      – POST audio → Whisper
 └ openai/score.ts           – POST {prompt,response}
 └ openai/prompts.ts         – GET next N prompts
```

### What each page is for

**Onboarding**
Collects personal context; after the final step it calls `/api/openai/prompts` to pre‑seed Firestore `topics` and sets `onboardComplete=true`.

4 · Onboarding Wizard (Single‑Page Implementation)
4.1 Route & File Layout
pgsql
Copy
Edit
app/
 └ onboarding/
     ├ page.tsx          // renders <OnboardingWizard />
     └ components/
         ├ Wizard.tsx    // core logic
         └ Recorder.tsx  // voice recorder hook wrapper
No additional routes; step transitions are handled by React state.

4.2 Wizard Config (questions array)
ts
Copy
Edit
// onboarding/questions.ts
export const QUESTIONS = [
  { id: 1, label: 'work',    prompt: 'Tell me about your most recent job.' },
  { id: 2, label: 'family',  prompt: 'Who do you live with and what roles do they play in your life?' },
  { id: 3, label: 'hobbies', prompt: 'What activities do you enjoy in your free time?' },
  { id: 4, label: 'culture', prompt: 'Are there any cultural traditions that are important to you?' },
  { id: 5, label: 'routine', prompt: 'Walk me through a typical morning.' },
  { id: 6, label: 'goals',   prompt: 'What are your main goals for recovery?' }
] satisfies readonly {id:number;label:string;prompt:string;}[];
4.3 URL‑Synced Step State
tsx
Copy
Edit
// Wizard.tsx
const router = useRouter();
const stepParam = Number(router.query.step ?? 1);
const [step, setStep] = useState(stepParam);

function next() {
  const nextStep = step + 1;
  setStep(nextStep);
  router.replace({ query: { step: nextStep } }, undefined, { shallow: true });
}
If the tab reloads, the wizard resumes from the step query param.

4.4 Flow per Step
Display QUESTIONS[step‑1].prompt.

Recorder component handles mic permission, waveform, timer.

On stop → POST /api/openai/transcribe → returns transcript.

Show editable textarea (unless user toggles “voice‑only”).

On “Looks good”:

ts
Copy
Edit
await writeDoc(
  doc(db, 'onboardingAnswers', uid, QUESTIONS[step-1].label),
  { question, transcript, createdAt: serverTimestamp() },
  { merge: true }
);
Call next() or, if step === 6, trigger generatePromptDocs(uid) then redirect /session.

4.5 Progress & Visuals
tsx
Copy
Edit
<progress value={step} max={QUESTIONS.length} className="w-full h-2 bg-gray-200 rounded" />
4.6 Offline Resilience
Recorder stores raw blob + tentative transcript in IndexedDB (key: onboard-{label}) immediately.

A useEffect watches connectivity; when online it flushes any queued answers to Firestore, then deletes the local copy.

If the user reloads offline, wizard loads cached answers and skips completed steps.

4.7 Test Hooks
Unit: Wizard.test.tsx mocks router, steps through all six prompts with stubbed /api/openai/transcribe.

E2E: Playwright script visits /onboarding?step=4, ensures the prompt matches “cultural traditions”, records stub audio, advances, and finally lands on /session.

4.8 Edge/Tricky Parts & Hints
Focus management: after transcript loads, auto‑focus textarea for quick edits; return key triggers “Looks good”.

Token expiry mid‑wizard: before every Firestore write call auth.currentUser?.getIdToken(true) if the last refresh > 50 min ago.

Mobile keyboards: add “Voice‑only mode” toggle that skips textarea and uses re‑record flow instead.

**Voice Session Page**

6 · Voice Session Screen (Full, High‑Fidelity Spec)
(The heart of the product. Hand this section to your coding sub‑LLM right after the Dashboard step.)

6.1 Purpose
Deliver 10–12 adaptive prompts in a hands‑free loop.

Capture and transcribe each user response, then score meaning & latency via OpenAI.

Provide immediate, encouraging spoken + visual feedback.

Persist granular utterance data plus session summary to Firestore.

Support two modes:

Standard – mixed familiar + stretch prompts.

Focus – targeted list (e.g., “Words to Revisit”) via query param.

6.2 Route & File Layout
less
Copy
Edit
app/
 └ session/
     ├ page.tsx                // <VoiceSession />
     └ components/
         ├ PromptCard.tsx
         ├ RecorderControls.tsx
         ├ FeedbackOverlay.tsx
         ├ ProgressRing.tsx
         └ LatencyTicker.tsx
 lib/
 └ audio/
     ├ useRecorder.ts          // hook returns {start, stop, isRecording, blob}
     └ downsample.ts           // 48→16 kHz PCM util
6.3 URL Parameters & Modes
bash
Copy
Edit
/session                 → Standard (batch from /prompts)
/session?mode=focus&ids=word1,word2  → Focus practice
If mode=focus, /api/openai/prompts returns only those words in shuffled order.

6.4 UI / Interaction Flow
Prefetch prompts:

ts
Copy
Edit
const { data: prompts } = useSWR('/api/openai/prompts?batch=12');
PromptCard renders current prompt text; when user taps Play (speaker icon), call:

ts
Copy
Edit
speechSynthesis.speak(new SpeechSynthesisUtterance(prompt.text));
RecorderControls show mic button. On tap:

request getUserMedia({ audio: true });

start MediaRecorder;

display LatencyTicker (counts seconds).

On mic stop:

Use downsample.ts to 16 kHz mono WAV; size ≤ 1 MB.

POST to /api/openai/transcribe → { transcript }.

POST to /api/openai/score → { score (0‑1), feedback, latency }.

Display FeedbackOverlay:

Green (≥ 0.8) “Great!” / Yellow (0.6‑0.79) “Almost” / Red (< 0.6) “Let’s try again later.”

Also speak feedback via TTS.

Persist utterance:

ts
Copy
Edit
await addDoc(collection(db, 'utterances', sessionId), {
  prompt,
  response: transcript,
  score,
  latencyMs: latency,
  createdAt: serverTimestamp(),
  ownerUid: uid
});
ProgressRing animates (10 slices). After 10 prompts:

Compute aggregate stats (accuracy = mean scores).

Write sessions/{uid}/{sessionId}.

Navigate to /dashboard?justFinished=true.

6.5 State Machine Diagram
lua
Copy
Edit
IDLE → PLAY_PROMPT → RECORDING → PROCESSING → FEEDBACK → (next prompt or COMPLETE)
Managed via useReducer to keep effects predictable.

6.6 Firestore Write Shapes
js
Copy
Edit
// sessions/{uid}/{sessionId}
{
  startedAt: Timestamp,
  durationSec: number,
  accuracy: number,      // mean(score)
  latencyMs: number,     // mean(latency)
  promptCount: number
}
6.7 Offline & Retry Logic
On start, cache the fetched prompts array in localforage.

If offline mid‑session:

Skip /transcribe & /score. Store utterances locally with score = null.

Show toast “Offline practice—results will sync later.”

A background syncPendingUtterances() runs on navigator.onLine event—transcribes & scores missed items, then writes session.

6.8 Accessibility & UX Details
Single‑tap workflow – play prompt auto‑starts mic unless setting manualMic.

Keyboard‑free – all controls accessible via big 64 px buttons.

Color‑blind safe – use shapes/icons alongside traffic‑light colors.

Voice feedback uses the same locale voice selected in onboarding settings.

6.9 API Route Contracts (Recap)
POST /api/openai/transcribe → { transcript }

Accepts audio/wav; rejects > 1 MB.

POST /api/openai/score → { score, feedback, latency }

Prompt engineering hint for sub‑LLM:

makefile
Copy
Edit
System: You are a speech therapist grading word-retrieval.
UserPrompt: <prompt>
PatientReply: <transcript>
## Evaluate semantic accuracy (0-1) and give one-sentence gentle feedback.
GET /api/openai/prompts?batch=N&mode=focus&ids=... → Prompt[]

Returns objects { id, text, label }.

6.10 Testing Plan
Unit

useRecorder fires onStop with Blob length > 0.

computeSessionStats() given fake utterances returns correct accuracy.

Integration

Mock /transcribe & /score; render <VoiceSession>; step through 3 prompts; expect 3 Firestore utterances docs.

E2E (Playwright)

Use fixture prompts & prerecorded answers.

Validate FeedbackOverlay color matches expected score.

Verify redirect to /dashboard at completion and sessions doc exists.

Performance

Ensure TTI < 2 s on cold PWA launch.

Audio round‑trip (stop mic → feedback overlay) target ≤ 1200 ms on good network.

6.11 Edge / Tricky Parts & Hints
Mic permission persistence – browsers ask permission once per session; if user blocks, display modal with link to settings.

SpeechSynthesis cut‑off iOS bug – always call speechSynthesis.cancel() before new utterance.

Back‑pressure on OpenAI quota – queue calls with p-limit(1) so only one prompt processes at a time.

Unsaved exit – if window unloads mid‑prompt, use beforeunload listener to persist draftUtterance to IndexedDB.

6.12 Implementation Order for Sub‑LLM
Build useRecorder hook + downsample.ts; mock tests.

Scaffold /api/openai/transcribe & /score routes (dev uses fake services first).

Implement <VoiceSession> skeleton with PromptCard & ProgressRing using hardcoded prompts.

Wire real prompt fetch & TTS.

Integrate recorder, STT, scoring, FeedbackOverlay.

Add Firestore writes for utterances, then aggregate session summary.

Incorporate offline cache & syncPendingUtterances.

Final E2E Playwright run; optimize bundle (code‑split charts).


**Dashboard**
Loads last 30 `sessions`, charts accuracy & latency, lists “Words to revisit” (low‑score labels). Provides “Invite caregiver” which writes an email under `users/{uid}/invites`.

---

## 5 · API Route Details (Secure Server Side)

- All `/api/openai/*` handlers **import `firebaseAdmin`** to verify ID token from cookie header; reject if missing.
- Use **Edge‑runtime = ‘nodejs’** route type, not Firebase Functions.
- Rate‑limit: `p-limit(2)` to avoid concurrent OpenAI calls spikes.

---

## 6 · Implementation Steps for the Sub‑LLM

1. **Scaffold repo & tooling** (see section 1). Commit. Run `next dev`.
2. **Implement Firebase client/admin wrappers**. Verify you can sign up & read/write a test doc.
3. **Auth flow** – build `(auth)/login` with Firebase Auth UI (`styled` minimal). Add middleware in `middleware.ts` to redirect unauthenticated users to login.
4. **Onboarding wizard** – pages `onboarding/step-[1‑6]/page.tsx`. Each step: record audio, POST to `/api/openai/transcribe`, display transcript for confirmation, save to Firestore under `users/{uid}/onboardingAnswers`. After last step, call `generatePromptDocs(uid)` (server action) and push `/session`. Write Jest tests for Firestore write.
5. **Voice utilities** – create `useRecorder` hook (audio.ts) and unit‑test its callback sequence with fake MediaStream.
6. **API route: `/api/openai/transcribe`** – parse multipart, call Whisper, return JSON. Protect with ID token validation. Add Playwright test posting fixture WAV.
7. **API route: `/api/openai/score`** – body validation, call GPT scoring prompt, return `{score,feedback,latency}`.
8. **API route: `/api/openai/prompts`** – for GET: query Firestore `topics` sorted by weight desc, return 10 prompts (generate if cache stale).
9. **Voice Session Page** – build UI with Tailwind grid: prompt card, mic button, progress ring. Integrate TTS (`SpeechSynthesisUtterance`). Write Cypress (or Playwright) flow using pre‑recorded answers.
10. **Dashboard** – fetch sessions via Firestore `collectionGroup`. Render charts with `@tanstack/react-charts`. Write vitest snapshot of chart props.
11. **PWA manifest & offline** – cache `/api/openai/prompts` GET and static assets. When offline, session stores utterances in IndexedDB; sync on reconnect.
12. **Invite Caregiver** – add Firestore `invites` sub‑collection; email out of scope for MVP (placeholder toast).
13. **E2E Mobile‑install Test** – Playwright `@mobile` context, ensure PWA installs and launches offline.

_After each step, run `pnpm test` and `pnpm lint` before committing; prefix commit with step number._

---

## 7 · Potential Tricky Parts & Hints

- **SSR + Firebase Auth** – use `next/headers` to read cookies, verify token with admin SDK; don’t rely on client SDK alone.
- **Large Embedding Arrays** – Firestore 1 MiB doc limit; store embedding as `Float32Array` b64 string or shard across sub‑docs.
- **iOS microphone permissions** – must be triggered by a user gesture; show a modal explainer first.
- **TTS queue** – iOS Safari cuts off if new utterance starts early; await `onend` event before next play.
- **Rate limits** – Whisper has 25 MB/min cap; downsample to 16 kHz mono to stay safe.

---

## 8 · Testing & Deployment

- **Unit**: Vitest + React Testing Library.
- **E2E**: Playwright; store fixture audio in `/tests/fixtures`.
- **CI**: GitHub Actions → build, lint, unit, e2e (headless).
- **Hosting**: Vercel (set env `NEXT_PUBLIC_FIREBASE_*`, `OPENAI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`).

---

Hand this document to your sub‑LLM. It now knows **what each page does, why it exists, the data shapes, and where secrets live**—enough context to implement each successive step and keep the architecture clean, maintainable, and expandable.
