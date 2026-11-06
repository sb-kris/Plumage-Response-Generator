// Purpose-aware quality assessment for AI Setup Assistant output.
//
// This is SEPARATE from setup-assistant-validator.ts on purpose:
//   - The validator enforces the JSON SCHEMA strictly (shape, types,
//     identifier rules). It decides ok/not-ok.
//   - This module makes GENTLE, purpose-aware judgements about whether the
//     (already schema-valid) output actually fits the selected Dataset
//     Purpose — e.g. "a market-research setup with no demographic
//     variables". It never rejects; it returns soft warnings and an
//     optional single repair hint.
//
// It does not mutate anything and has no side effects. The route decides
// whether to act on the repair hint (one repair max) and surfaces the
// warnings to the preview.

import {
  DATASET_PURPOSES,
  isDatasetPurpose,
  type DatasetPurpose,
} from "@/lib/profiles/dataset-purposes";
import type { SetupAssistantLLMOutput } from "@/lib/generation/setup-assistant-types";

export interface SetupQualityResult {
  /** Soft, non-blocking notes shown in the preview's "Notes from the assistant". */
  warnings: string[];
  /** A single combined repair hint, or null when the output looks fine.
   *  The route may use this for at most one repair attempt. */
  repairHint: string | null;
}

const EMPTY: SetupQualityResult = { warnings: [], repairHint: null };

// Minimal stopword set so keyword matching stays meaningful without being
// noisy. We keep domain words (region, ticket, awareness, …) and drop only
// connective filler that would over-match.
const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "for",
  "with",
  "unless",
  "selected",
  "survey",
  "explicitly",
  "includes",
  "question",
  "existing",
  "first",
  "when",
  "already",
  "fit",
  "variables",
  "surveysparrow",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Assess how well the LLM's setup output fits the Dataset Purpose.
 * Returns EMPTY for custom / unset — those have no purpose expectations.
 */
export function assessSetupPurposeQuality(
  purpose: DatasetPurpose | undefined,
  output: SetupAssistantLLMOutput,
): SetupQualityResult {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return EMPTY;
  const meta = DATASET_PURPOSES[purpose];

  const warnings: string[] = [];
  const repairHints: string[] = [];

  const varHaystacks = output.customVariables.map((v) =>
    `${v.apiIdentifier} ${v.label}`.toLowerCase(),
  );

  // ---- 1. Variable emphasis coverage -------------------------------------
  // If the purpose expects a KIND of variable (demographics, ticket fields,
  // hierarchy nodes, …) and NONE of the suggested variables look like any
  // of them, nudge once.
  if (meta.variableEmphasis && meta.variableEmphasis.length > 0) {
    const keywords = dedupe(meta.variableEmphasis.flatMap(tokenize));
    const covered =
      varHaystacks.length > 0 &&
      varHaystacks.some((h) => keywords.some((k) => h.includes(k)));
    if (!covered) {
      const top = meta.variableEmphasis.slice(0, 3).join(", ");
      warnings.push(
        `No ${meta.label.toLowerCase()} variables were suggested. You could add ${top}.`,
      );
      repairHints.push(
        `Suggest at least two variables typical for ${meta.label}: ${top}.`,
      );
    }
  }

  // ---- 2. Theme framing vs purpose vocabulary ----------------------------
  // If the suggested themes share no vocabulary with the purpose's
  // research-dimension / issue-theme / advocacy-angle list, they're
  // probably generic CX themes — nudge to reframe.
  if (
    meta.themeSuggestions &&
    meta.themeSuggestions.length > 0 &&
    output.themes.length > 0
  ) {
    const vocab = new Set(meta.themeSuggestions.flatMap(tokenize));
    const overlap = output.themes.some((t) =>
      tokenize(t.label).some((w) => vocab.has(w)),
    );
    if (!overlap) {
      const examples = meta.themeSuggestions.slice(0, 3).join(", ");
      warnings.push(
        `The suggested ${meta.themesVocabulary.toLowerCase()} look generic. Try framing them like ${examples}.`,
      );
      repairHints.push(
        `Frame themes as ${meta.themesVocabulary} (e.g. ${meta.themeSuggestions
          .slice(0, 4)
          .join(", ")}).`,
      );
    }
  }

  // ---- 3. Migration type coverage ----------------------------------------
  // Import/migration test data should exercise more than one variable type.
  if (purpose === "migration_import_test" && output.customVariables.length > 0) {
    const types = new Set(output.customVariables.map((v) => v.type ?? "STRING"));
    if (types.size < 2) {
      warnings.push(
        "All the import-test variables are the same type. Add a NUMBER, DATE, or PERSONA-bound variable to test more types.",
      );
      repairHints.push(
        "Include variables of at least two different types (STRING, NUMBER, DATE, PERSONA-bound).",
      );
    }
  }

  return {
    warnings,
    repairHint: repairHints.length > 0 ? repairHints.join(" ") : null,
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
