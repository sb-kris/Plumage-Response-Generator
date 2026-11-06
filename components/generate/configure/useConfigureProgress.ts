"use client";

import { useGenerationStore } from "@/store/generation-store";

/** Context shorter than this reads as thin (matches the Synthesize warning). */
export const MIN_CONTEXT_CHARS = 80;

export interface EssentialStatus {
  id: string;
  label: string;
  done: boolean;
  /** Short instruction shown while the item isn't done. */
  todo: string;
}

/**
 * Which of the Configure essentials are filled in. Guidance only: nothing is
 * blocked, because the defaults are valid. It powers the ticks in the
 * section rail and the "what's left" line in the sticky Continue bar.
 */
export function useConfigureProgress() {
  const useCase = useGenerationStore((s) => s.draft.useCase);
  const themeCount = useGenerationStore((s) => s.draft.themes.length);
  const dist = useGenerationStore((s) => s.draft.personaDistribution);
  const responseCount = useGenerationStore((s) => s.draft.timeRange.responseCount);

  const distSum = dist.promoter + dist.passive + dist.detractor;
  const essentials: EssentialStatus[] = [
    {
      id: "context",
      label: "Context",
      done: useCase.trim().length >= MIN_CONTEXT_CHARS,
      todo:
        useCase.trim().length === 0
          ? "Describe the customer and the demo"
          : "Add a bit more detail to the context",
    },
    {
      id: "themes",
      label: "Themes",
      done: themeCount > 0,
      todo: "Add at least one theme",
    },
    {
      id: "personas",
      label: "Personas",
      done: distSum === 100,
      todo: "Make the persona mix add up to 100%",
    },
    {
      id: "timing",
      label: "Responses and timing",
      done: responseCount > 0,
      todo: "Choose how many responses to create",
    },
  ];
  const doneCount = essentials.filter((e) => e.done).length;
  const nextTodo = essentials.find((e) => !e.done) ?? null;
  return { essentials, doneCount, total: essentials.length, nextTodo, responseCount };
}
