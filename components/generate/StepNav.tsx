"use client";

import { useWizardStore, type WizardStep } from "@/store/wizard-store";
import { useSurveyStore } from "@/store/survey-store";
import { usePersonasStore } from "@/store/personas-store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Lock } from "lucide-react";

interface StepState {
  surveyOk: boolean;
  questionsOk: boolean;
  personasOk: boolean;
  /** Furthest step opened this session (wizard store). */
  furthestStep: WizardStep;
}

interface StepDef {
  id: WizardStep;
  title: string;
  hint: string;
  // True if this step is unlocked given the current data state.
  isUnlocked: (state: StepState) => boolean;
  // True once the step's work is actually done — drives the green tick.
  // (Previously every step before the current one was ticked, even when
  // it had been skipped.)
  isDone: (state: StepState) => boolean;
  /** Future phases — show a Lock icon and a tooltip hint. */
  futurePhase?: number;
}

const STEPS: StepDef[] = [
  {
    id: 1,
    title: "Select survey",
    hint: "Pick the SurveySparrow survey to generate responses for.",
    isUnlocked: () => true,
    isDone: ({ surveyOk, questionsOk }) => surveyOk && questionsOk,
  },
  {
    id: 2,
    title: "Configure",
    hint: "Describe the demo and set the persona, language, and timing mix.",
    isUnlocked: ({ surveyOk, questionsOk }) => surveyOk && questionsOk,
    isDone: ({ furthestStep }) => furthestStep >= 3,
  },
  {
    id: 3,
    title: "Synthesize personas",
    hint: "Generate persona profiles before producing responses.",
    // Requires opening Configure first, so the paid step can't be reached
    // with an untouched draft. Existing personas (restored after a refresh)
    // keep it open.
    isUnlocked: ({ surveyOk, questionsOk, furthestStep, personasOk }) =>
      surveyOk && questionsOk && (furthestStep >= 2 || personasOk),
    isDone: ({ personasOk }) => personasOk,
  },
  {
    id: 4,
    title: "Generate & push",
    hint: "Generate responses, preview them, then push to SurveySparrow.",
    isUnlocked: ({ personasOk }) => personasOk,
    isDone: () => false,
  },
];

export function StepNav() {
  const currentStep = useWizardStore((s) => s.currentStep);
  const furthestStep = useWizardStore((s) => s.furthestStep);
  const setStep = useWizardStore((s) => s.setStep);
  const surveyOk = useSurveyStore((s) => s.selectedSurveyId !== null);
  const questionsOk = useSurveyStore((s) => s.questions.status === "ok");
  const personasOk = usePersonasStore(
    (s) => s.status === "complete" && s.personas.length > 0,
  );

  return (
    <ol className="flex w-full items-center gap-1 overflow-x-auto rounded-lg border bg-card/50 p-2 text-sm">
      {STEPS.map((step, idx) => {
        const isCurrent = currentStep === step.id;
        const state = { surveyOk, questionsOk, personasOk, furthestStep };
        const unlocked = step.isUnlocked(state);
        // The current step always shows its number, never a tick.
        const isComplete = !isCurrent && unlocked && step.isDone(state);
        const navigable = unlocked && !isCurrent;

        const button = (
          <button
            type="button"
            disabled={!navigable}
            onClick={() => navigable && setStep(step.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
              isCurrent && "bg-accent text-accent-foreground",
              !isCurrent && navigable && "hover:bg-accent/50",
              !unlocked && "cursor-not-allowed opacity-60",
            )}
            aria-current={isCurrent ? "step" : undefined}
          >
            <StepIndicator
              n={idx + 1}
              isCurrent={isCurrent}
              isComplete={isComplete}
              isLocked={!unlocked}
            />
            <div className="min-w-0">
              <div
                className={cn(
                  "text-xs font-medium uppercase tracking-wide",
                  isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                Step {idx + 1}
              </div>
              <div className="truncate text-sm font-medium">{step.title}</div>
            </div>
          </button>
        );

        const wrapped =
          !unlocked || !isCurrent ? (
            <Tooltip key={step.id}>
              <TooltipTrigger asChild>
                <li className="flex-1 min-w-[160px]">{button}</li>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {step.futurePhase ? (
                  <span>Coming soon.</span>
                ) : !unlocked ? (
                  <span>Complete the previous step first.</span>
                ) : (
                  step.hint
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <li key={step.id} className="flex-1 min-w-[160px]">
              {button}
            </li>
          );

        return wrapped;
      })}
    </ol>
  );
}

function StepIndicator({
  n,
  isCurrent,
  isComplete,
  isLocked,
}: {
  n: number;
  isCurrent: boolean;
  isComplete: boolean;
  isLocked: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        // One accent for progress: current = solid teal, done = soft teal.
        // (Green is reserved for status messages, not progress.)
        isComplete && "border-primary/40 bg-accent text-accent-foreground",
        !isComplete &&
          isCurrent &&
          "border-primary bg-primary text-primary-foreground",
        !isComplete && !isCurrent && !isLocked && "border-input bg-card text-muted-foreground",
        isLocked && "border-input bg-muted text-muted-foreground",
      )}
    >
      {isComplete ? (
        <Check className="h-4 w-4" />
      ) : isLocked ? (
        <Lock className="h-3.5 w-3.5" />
      ) : (
        n
      )}
    </div>
  );
}
