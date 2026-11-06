"use client";

import { create } from "zustand";

// Wizard step machine.
//
// 1. Select survey       (Phase 2 — survey + question preview)
// 2. Configure           (Phase 3 — context / themes / personas / etc.)
// 3. Synthesize personas (Phase 4 — LLM persona synthesis)
// 4. Generate & push     (Phase 5a/b/c — response generation + preview + push)
//
// Step 4 is a single screen with multiple internal states (pre-gen → running
// → preview → pushing → complete). 5a builds the first three; 5b polishes
// the preview; 5c adds push + complete.
export type WizardStep = 1 | 2 | 3 | 4;

interface WizardStore {
  currentStep: WizardStep;
  /** Furthest step the user has opened this session. Drives StepNav's
   *  unlock + "completed" ticks so Configure can't be skipped and a tick
   *  means "done", not merely "positioned before the current step". */
  furthestStep: WizardStep;
  setStep: (step: WizardStep) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardStore>((set) => ({
  currentStep: 1,
  furthestStep: 1,
  setStep: (step) =>
    set((s) => ({
      currentStep: step,
      furthestStep: (Math.max(s.furthestStep, step) as WizardStep),
    })),
  reset: () => set({ currentStep: 1, furthestStep: 1 }),
}));
