"use client";

import { useEffect, useState } from "react";
import { useSurveyStore } from "@/store/survey-store";
import { useWizardStore } from "@/store/wizard-store";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  SectionAnchorRail,
  type AnchorDef,
  type AnchorGroup,
} from "./SectionAnchorRail";
import { useConfigureProgress } from "./useConfigureProgress";
import { RunSizeInfo, RECOMMENDED_RUN_SIZE } from "@/components/generate/shared/RunSizeHint";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextSection } from "./ContextSection";
import { ThemesSection } from "./ThemesSection";
import { PersonasSection } from "./PersonasSection";
import { LanguagesSection } from "./LanguagesSection";
import { CountryFilterSection } from "./CountryFilterSection";
import { CustomVariablesSection } from "./CustomVariablesSection";
import { SystemMetadataSection } from "./SystemMetadataSection";
import { TimingSection } from "./TimingSection";
import { ProfileBar } from "./ProfileBar";
import { CostEstimatorPanel } from "./CostEstimatorPanel";

const ESSENTIAL_ANCHORS: Array<{ id: string; label: string }> = [
  { id: "context", label: "Context" },
  { id: "themes", label: "Themes" },
  { id: "personas", label: "Personas" },
  { id: "timing", label: "Responses" },
];

const OPTIONAL_ANCHORS: AnchorDef[] = [
  { id: "language", label: "Languages" },
  { id: "countries", label: "Countries" },
  { id: "variables", label: "Custom variables" },
  { id: "metadata", label: "System metadata" },
];

const ALL_IDS = [...ESSENTIAL_ANCHORS, ...OPTIONAL_ANCHORS].map((a) => a.id);

export function ConfigureStep() {
  const setStep = useWizardStore((s) => s.setStep);
  const selectedSurveyId = useSurveyStore((s) => s.selectedSurveyId);
  const surveys = useSurveyStore((s) => s.surveys.data);
  const selectedSurvey = surveys?.find((s) => s.id === selectedSurveyId) ?? null;
  const progress = useConfigureProgress();

  const groups: AnchorGroup[] = [
    {
      label: "Essentials",
      anchors: ESSENTIAL_ANCHORS.map((a) => ({
        ...a,
        done: progress.essentials.find((e) => e.id === a.id)?.done ?? false,
      })),
    },
    { label: "Optional", anchors: OPTIONAL_ANCHORS },
  ];

  // Read the URL hash on mount so deep links from /profiles or external links
  // (e.g. /generate#themes once 3b lands) jump to the right section.
  const [initialAnchor, setInitialAnchor] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (hash && ALL_IDS.includes(hash)) {
      setInitialAnchor(hash);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Selected-survey breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(1)}
            className="h-8 -ml-2 gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Change survey
          </Button>
          {selectedSurvey && (
            <span className="text-muted-foreground">
              · Configuring{" "}
              <span className="font-medium text-foreground">{selectedSurvey.name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Profile management bar */}
      <ProfileBar />

      {/* Two-pane configuration layout */}
      <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)_280px]">
        {/* Left rail */}
        <div className="hidden lg:block">
          <SectionAnchorRail groups={groups} initialAnchor={initialAnchor} />
        </div>

        {/* Sections */}
        <div className="min-w-0 space-y-6">
          <GroupHeading
            title="Essentials"
            description="Plumage needs these to write believable responses. AI Setup can fill them in for you."
          />
          <ContextSection />
          <ThemesSection />
          <PersonasSection />
          <TimingSection />

          <GroupHeading
            title="Optional"
            description="These already have sensible defaults. Change them only if the demo needs it."
            className="pt-4"
          />
          <LanguagesSection />
          <CountryFilterSection />
          <CustomVariablesSection />
          <SystemMetadataSection />
        </div>

        {/* Sticky cost panel (collapses to a bottom row on smaller screens) */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <CostEstimatorPanel />
        </div>
      </div>

      {/* Sticky Continue bar: always in reach on a long page, and says what's
          still missing. Guidance only; Continue is never blocked. */}
      <div className="sticky bottom-4 z-30 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <ProgressRing done={progress.doneCount} total={progress.total} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">
                {progress.nextTodo
                  ? `${progress.doneCount} of ${progress.total} essentials done`
                  : "Essentials done"}
              </p>
              <p className="flex items-center gap-1 text-xs leading-tight text-muted-foreground">
                {progress.nextTodo ? (
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById(progress.nextTodo!.id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Next: {progress.nextTodo.todo}
                  </button>
                ) : (
                  <>
                    {progress.responseCount.toLocaleString()} responses.
                    {progress.responseCount > RECOMMENDED_RUN_SIZE
                      ? ` Over ${RECOMMENDED_RUN_SIZE} may time out.`
                      : " Next, Plumage creates the personas."}
                    <RunSizeInfo />
                  </>
                )}
              </p>
            </div>
          </div>
          <Button onClick={() => setStep(3)} className="h-9 gap-1.5 px-4">
            Continue to personas
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupHeading({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Small circular progress for the essentials count. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const complete = done === total;
  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - done / total)}
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span
        className={cn(
          "absolute text-[11px] font-semibold tabular-nums",
          complete ? "text-primary" : "text-foreground",
        )}
      >
        {complete ? <Check className="h-4 w-4" /> : `${done}/${total}`}
      </span>
    </span>
  );
}
