'use client';

import { OnboardingWizard } from './components/Wizard';

export default function OnboardingPage() {
  return (
    <main className="container max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Voice Onboarding</h1>
      <OnboardingWizard />
    </main>
  );
} 