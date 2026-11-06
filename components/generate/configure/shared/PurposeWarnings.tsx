"use client";

import { useGenerationStore } from "@/store/generation-store";
import {
  evaluateWarnings,
  type ConfigureSectionId,
} from "@/lib/profiles/dataset-purposes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Lightbulb } from "lucide-react";

// Renders the Dataset Purpose guidance warnings that currently apply to a
// given Configure section. GUIDANCE ONLY:
//   • Non-blocking — never disables or gates anything.
//   • Read-only — evaluateWarnings inspects the draft; nothing here writes.
//   • Reactive — recomputes on draft changes (no effects, no timers).
//
// Renders nothing when there are no applicable warnings (the common case:
// no purpose selected, custom, or the section's conditions are satisfied),
// so it's safe to drop at the top of any section's CardContent.
//
// Tone → visual:
//   "warning" → soft yellow Alert with a lightbulb (a suggestion)
//   "info"    → neutral Alert with an info icon (expectation-setting)

export function PurposeWarnings({ section }: { section: ConfigureSectionId }) {
  const datasetPurpose = useGenerationStore((s) => s.draft.datasetPurpose);
  const draft = useGenerationStore((s) => s.draft);

  const warnings = evaluateWarnings(datasetPurpose, draft).filter(
    (w) => w.section === section,
  );

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <Alert
          key={w.id}
          variant={w.tone === "warning" ? "warning" : "default"}
          className={w.tone === "info" ? "border-muted-foreground/20" : undefined}
        >
          {w.tone === "warning" ? (
            <Lightbulb className="h-4 w-4" />
          ) : (
            <Info className="h-4 w-4 text-muted-foreground" />
          )}
          <AlertDescription
            className={w.tone === "info" ? "text-xs text-muted-foreground" : "text-xs"}
          >
            {w.message}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
