"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { useRunSurveyGuard } from "./useRunSurveyGuard";

/**
 * Warns when the personas or responses on screen belong to a different
 * survey than the one selected in step 1. Renders nothing otherwise.
 *
 * `scope` picks which data the current step cares about: step 3 only has
 * personas; step 4 cares about responses (and blocks pushing them).
 */
export function StaleRunAlert({ scope }: { scope: "personas" | "responses" }) {
  const { personasStale, responsesStale, staleSurveyName, selectedSurveyName } =
    useRunSurveyGuard();

  const stale = scope === "responses" ? responsesStale : personasStale;
  if (!stale) return null;

  const what = scope === "responses" ? "responses" : "personas";
  return (
    <Alert variant="warning">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>
        These {what} were made for &ldquo;{staleSurveyName}&rdquo;
      </AlertTitle>
      <AlertDescription>
        You&apos;ve since selected &ldquo;{selectedSurveyName}&rdquo;.{" "}
        {scope === "responses"
          ? "Pushing is blocked so these answers don't go to the wrong survey. Switch back to the original survey in step 1, or generate new responses for this one."
          : "Re-synthesize for this survey, or switch back to the original one in step 1."}
      </AlertDescription>
    </Alert>
  );
}
