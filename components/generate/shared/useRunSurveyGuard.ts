"use client";

import { useSurveyStore } from "@/store/survey-store";
import { usePersonasStore } from "@/store/personas-store";
import { useResponsesStore } from "@/store/responses-store";

// Detects personas / responses that were produced for a different survey
// than the one currently selected. Picking a new survey in step 1 keeps the
// previous run's data (so switching back is lossless), which means without
// this check a push could send survey A's answers into survey B.
//
// A run whose survey is unknown (sourceSurveyId === null — no run yet, or
// data persisted before the field existed) is never treated as stale, so
// this guard can only block when it positively knows the surveys differ.

export interface RunSurveyGuard {
  /** Personas exist and were synthesized for another survey. */
  personasStale: boolean;
  /** Responses exist and were generated for another survey. Push is unsafe. */
  responsesStale: boolean;
  /** Display name of the survey the stale data belongs to. */
  staleSurveyName: string | null;
  /** Display name of the currently selected survey. */
  selectedSurveyName: string | null;
}

export function useRunSurveyGuard(): RunSurveyGuard {
  const selectedSurveyId = useSurveyStore((s) => s.selectedSurveyId);
  const surveys = useSurveyStore((s) => s.surveys.data);
  const personasSurveyId = usePersonasStore((s) => s.sourceSurveyId);
  const hasPersonas = usePersonasStore((s) => s.personas.length > 0);
  const responsesSurveyId = useResponsesStore((s) => s.sourceSurveyId);
  const hasResponses = useResponsesStore((s) => s.responses.length > 0);

  const differs = (runSurveyId: number | null) =>
    runSurveyId !== null && selectedSurveyId !== null && runSurveyId !== selectedSurveyId;

  const personasStale = hasPersonas && differs(personasSurveyId);
  const responsesStale = hasResponses && differs(responsesSurveyId);

  const nameFor = (id: number | null): string | null => {
    if (id === null) return null;
    return surveys?.find((s) => s.id === id)?.name ?? `survey #${id}`;
  };

  return {
    personasStale,
    responsesStale,
    staleSurveyName: nameFor(responsesStale ? responsesSurveyId : personasStale ? personasSurveyId : null),
    selectedSurveyName: nameFor(selectedSurveyId),
  };
}
