"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSetupStore, useSetupHydrated } from "@/store/setup-store";
import { useSurveyStore } from "@/store/survey-store";
import { useWizardStore } from "@/store/wizard-store";
import { usePersonasStore } from "@/store/personas-store";
import { useResponsesStore } from "@/store/responses-store";
import { SurveySelector } from "@/components/generate/SurveySelector";
import { QuestionPreview } from "@/components/generate/QuestionPreview";
import { StepNav } from "@/components/generate/StepNav";
import { ConfigureStep } from "@/components/generate/configure/ConfigureStep";
import { SynthesizeStep } from "@/components/generate/synthesize/SynthesizeStep";
import { GenerateAndPushStep } from "@/components/generate/generate/GenerateAndPushStep";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowRight, Loader2 } from "lucide-react";

export default function GeneratePage() {
  const ssStatus = useSetupStore((s) => s.ssConnection.status);
  const llmStatus = useSetupStore((s) => s.llmConnection.status);
  const ssOk = ssStatus === "ok";
  const llmOk = llmStatus === "ok";
  const setupHydrated = useSetupHydrated();

  const currentStep = useWizardStore((s) => s.currentStep);
  const setStep = useWizardStore((s) => s.setStep);

  const selectedSurveyId = useSurveyStore((s) => s.selectedSurveyId);
  // Saved work survives a reload (sessionStorage). Keys only do if the user
  // ticked "Remember on this device". Used to reassure people on the
  // "connect first" screen after a reload.
  const savedPersonas = usePersonasStore((s) => s.personas.length);
  const savedResponses = useResponsesStore((s) => s.responses.length);
  const questionsStatus = useSurveyStore((s) => s.questions.status);
  const step1Complete = selectedSurveyId !== null && questionsStatus === "ok";

  // Defensive: if the user lands on /generate while step 2/3/4 is active but
  // step 1 isn't actually complete yet (e.g. fresh browser, sessionStorage
  // restored a wizard step but the survey hasn't loaded yet), reset to 1.
  useEffect(() => {
    if (currentStep > 1 && !step1Complete) {
      setStep(1);
    }
  }, [currentStep, step1Complete, setStep]);

  // Start each step at the top. Without this the new step inherits the
  // previous step's scroll position (Configure opened mid-page, below the
  // profile bar and AI Setup). Skips the first render so a deep link to a
  // Configure section (#themes etc.) keeps its own scroll.
  const prevStep = useRef(currentStep);
  useEffect(() => {
    if (prevStep.current !== currentStep) {
      window.scrollTo({ top: 0 });
      prevStep.current = currentStep;
    }
  }, [currentStep]);

  // Remembered keys load and re-test right after mount. Show that instead of
  // flashing the "connect first" warning.
  const restoring =
    !setupHydrated || ssStatus === "validating" || llmStatus === "validating";
  if ((!ssOk || !llmOk) && restoring) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Generate</h1>
        </header>
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your connections…
        </div>
      </div>
    );
  }

  if (!ssOk || !llmOk) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Generate</h1>
          <p className="text-muted-foreground">
            Pick a survey, configure the demo context, and generate persona-driven
            responses.
          </p>
        </header>

        <Alert variant="warning">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Connect your accounts first.</AlertTitle>
          <AlertDescription className="space-y-3">
            {(savedPersonas > 0 || savedResponses > 0) && (
              <p>
                Your work is saved: {savedResponses > 0
                  ? `${savedResponses.toLocaleString()} generated responses`
                  : `${savedPersonas.toLocaleString()} personas`}{" "}
                and your settings will be here once you reconnect. To skip
                this next time, turn on &ldquo;Remember on this device&rdquo;
                under each key on Setup.
              </p>
            )}
            <p>
              {!ssOk && !llmOk
                ? "Go to Setup and click Test connection for both SurveySparrow and your AI provider. Both need to pass before you can generate responses."
                : !ssOk
                  ? "SurveySparrow isn't connected yet. Go to Setup and click Test connection on the SurveySparrow card."
                  : "Your AI provider isn't connected yet. Go to Setup and click Test connection on the AI provider card."}
            </p>
            <Button asChild size="sm" variant="outline" className="bg-background">
              <Link href="/">Go to Setup</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Generate</h1>
        <p className="text-muted-foreground">
          Work through the steps below. Your settings survive a page refresh in
          this tab. To reuse them in a later demo, save them as a profile.
        </p>
      </header>

      <StepNav />

      {currentStep === 1 && (
        <div className="space-y-6">
          <SurveySelector />
          <QuestionPreview />

          {step1Complete && (
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>
                Continue to configure
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {currentStep === 2 && <ConfigureStep />}
      {currentStep === 3 && <SynthesizeStep />}
      {currentStep === 4 && <GenerateAndPushStep />}
    </div>
  );
}
