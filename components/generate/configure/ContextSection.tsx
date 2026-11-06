"use client";

import { useGenerationStore } from "@/store/generation-store";
import {
  DATASET_PURPOSE_IDS,
  DATASET_PURPOSES,
  getDatasetPurposeMeta,
  getSectionOverride,
  getPurposeContextChecklist,
  type DatasetPurpose,
} from "@/lib/profiles/dataset-purposes";
import { PriorityBadge } from "@/components/generate/configure/shared/PriorityBadge";
import { PurposeWarnings } from "@/components/generate/configure/shared/PurposeWarnings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FileText, Lightbulb } from "lucide-react";

const MAX_CHARS = 2000;
// Neutral fallback placeholder used when no purpose is selected. This is
// the copy that shipped before Dataset Purpose existed — keeping it here
// verbatim means the "no selection" state behaves exactly like the old
// ContextSection did.
const FALLBACK_PLACEHOLDER = `e.g. Demo for Nexora Living, premium US smart home brand. Focus on installation experience, AI-powered features, and customer support quality. Customers are middle-to-upper-income homeowners aged 30 to 55.`;

export function ContextSection() {
  const useCase = useGenerationStore((s) => s.draft.useCase);
  const setUseCase = useGenerationStore((s) => s.setUseCase);
  const datasetPurpose = useGenerationStore((s) => s.draft.datasetPurpose);
  const setDatasetPurpose = useGenerationStore((s) => s.setDatasetPurpose);

  const charCount = useCase.length;
  const overLimit = charCount > MAX_CHARS;
  const nearLimit = charCount > MAX_CHARS * 0.9 && !overLimit;

  // Purpose drives placeholder text + the one-line hint under the chips.
  // When nothing is selected (or "custom" is selected explicitly), we
  // fall back to the pre-Dataset-Purpose placeholder so behavior is
  // identical to the old UI. Never mutates useCase — the placeholder is
  // purely display.
  const activePurpose = datasetPurpose && datasetPurpose !== "custom"
    ? datasetPurpose
    : null;
  const placeholder = activePurpose
    ? DATASET_PURPOSES[activePurpose].contextPlaceholder
    : FALLBACK_PLACEHOLDER;
  const purposeHint = activePurpose
    ? DATASET_PURPOSES[activePurpose].description
    : null;

  // ContextSection shows a priority badge only — its title/description
  // stay fixed (the picker + placeholder already carry the purpose
  // signal here, so reframing the title would be redundant).
  const sectionOverride = getSectionOverride(datasetPurpose, "context");

  // "What to include" adapts to the purpose. Falls back to the generic
  // checklist for custom / unset.
  const checklist = getPurposeContextChecklist(datasetPurpose) ?? [
    "Customer name + a one-line description of the product / brand",
    "What you want the demo to emphasize (positives, pain points, both)",
    "Who the respondents are (age, income, region), if it matters",
    "Any specific themes you want responses to touch on",
  ];

  return (
    <section id="context" className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Use case context
            <PriorityBadge priority={sectionOverride?.priority} className="font-normal" />
          </CardTitle>
          <CardDescription>
            Tell Plumage what this demo is about. Personas, themes and the tone of
            every answer follow from this, so name the customer, the product and
            what the demo should highlight.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dataset Purpose — smart preset picker (guidance-only) */}
          <PurposePicker
            selected={datasetPurpose}
            onSelect={setDatasetPurpose}
          />
          {purposeHint && (
            <p className="text-xs text-muted-foreground">{purposeHint}</p>
          )}

          <PurposeWarnings section="context" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="use-case-textarea">Context</Label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  overLimit && "text-destructive",
                  nearLimit && "text-warning",
                  !overLimit && !nearLimit && "text-muted-foreground",
                )}
                aria-live="polite"
              >
                {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
            <Textarea
              id="use-case-textarea"
              value={useCase}
              onChange={(e) => setUseCase(e.target.value.slice(0, MAX_CHARS + 200))}
              placeholder={placeholder}
              className={cn(
                "min-h-[180px] resize-y",
                overLimit && "border-destructive focus-visible:ring-destructive",
              )}
              maxLength={MAX_CHARS + 200}
              spellCheck
            />
            {overLimit && (
              <p className="text-xs text-destructive">
                Cut {charCount - MAX_CHARS} characters to get under the limit. Shorter
                briefs also keep the model more focused.
              </p>
            )}
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <Lightbulb className="h-3.5 w-3.5" />
              What to include
            </div>
            <ul className="list-disc space-y-0.5 pl-5">
              {checklist.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chip picker (internal component)
// ---------------------------------------------------------------------------
//
// Renders all 8 dataset-purpose chips in a wrap layout. Clicking the
// already-selected chip clears the selection (falls back to "no
// purpose", which behaves like "custom"). Purely visual — never touches
// any other field on the draft.
//
// Semantics:
//   - When no purpose is set (undefined), no chip is highlighted.
//   - Clicking a chip sets that purpose. Clicking again clears it.
//   - Selecting "Custom" explicitly is fine — it's a valid choice that
//     confirms "I don't want a preset". Same effect as undefined for
//     placeholder/vocabulary purposes.

function PurposePicker({
  selected,
  onSelect,
}: {
  selected: DatasetPurpose | undefined;
  onSelect: (purpose: DatasetPurpose | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">What are you building?</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Dataset purpose">
        {DATASET_PURPOSE_IDS.map((id) => {
          const meta = getDatasetPurposeMeta(id);
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(isSelected ? undefined : id)}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title={meta.description}
            >
              {meta.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
