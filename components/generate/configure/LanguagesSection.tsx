"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGenerationStore } from "@/store/generation-store";
import { getSectionOverride } from "@/lib/profiles/dataset-purposes";
import { PriorityBadge } from "@/components/generate/configure/shared/PriorityBadge";
import { PurposeWarnings } from "@/components/generate/configure/shared/PurposeWarnings";
import {
  getLanguage,
  isSupportedLanguage,
  LANGUAGES_BY_CODE,
} from "@/lib/utils/language-geography";
import {
  rebalanceToTotal,
  removeKeyAndRedistribute,
  distributeEvenly,
  type WeightedItem,
} from "@/lib/utils/sum-to-total";
import type { LanguageWeight } from "@/lib/profiles/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  Globe,
  Info,
  Lock,
  Trash2,
  Unlock,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CountryPreviewChips } from "./CountryPreviewChips";
import { AddLanguagePopover } from "./AddLanguagePopover";

const ENGLISH_CODE = "en";
const TOTAL = 100;
const SOFT_DILUTE_THRESHOLD = 5;

export function LanguagesSection() {
  const distribution = useGenerationStore((s) => s.draft.languageDistribution);
  const setDraft = useGenerationStore((s) => s.setDraft);
  const datasetPurpose = useGenerationStore((s) => s.draft.datasetPurpose);

  // Dataset Purpose can reframe the title/description ("Language mix" for
  // multilingual demos) and flag a priority. GUIDANCE ONLY — the weight
  // rebalancing and language logic are untouched.
  const override = getSectionOverride(datasetPurpose, "languages");
  const title = override?.label ?? "Languages";

  // Locks are session-only — never persisted in the saved profile.
  const [lockedCodes, setLockedCodes] = useState<Set<string>>(() => new Set());

  // ----- Validate on mount: strip unsupported codes and dump weight on EN.
  // Runs once per mount to clean up imported / sessionStorage-restored drafts.
  const validatedRef = useRef(false);
  useEffect(() => {
    if (validatedRef.current) return;
    validatedRef.current = true;

    const unsupported = distribution.filter((l) => !isSupportedLanguage(l.code));
    if (unsupported.length === 0) return;

    setDraft((draft) => {
      const cleaned = draft.languageDistribution.filter((l) =>
        isSupportedLanguage(l.code),
      );
      const removedWeight = unsupported.reduce((s, l) => s + l.weight, 0);
      // Ensure English exists; dump removed weight on it.
      const englishIdx = cleaned.findIndex((l) => l.code === ENGLISH_CODE);
      if (englishIdx >= 0) {
        cleaned[englishIdx] = {
          ...cleaned[englishIdx]!,
          weight: cleaned[englishIdx]!.weight + removedWeight,
        };
      } else {
        cleaned.unshift({ code: ENGLISH_CODE, weight: removedWeight || TOTAL });
      }
      // Re-normalize to integers summing to TOTAL.
      draft.languageDistribution = normalizeDistribution(cleaned);
    });

    toast.warning("Unsupported languages removed", {
      description: `Plumage doesn't support ${unsupported
        .map((l) => l.code)
        .join(", ")}. Their weight was added to English.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Ensure English is always present. Defensive — UI prevents removal.
  useEffect(() => {
    const hasEnglish = distribution.some((l) => l.code === ENGLISH_CODE);
    if (hasEnglish) return;
    setDraft((draft) => {
      draft.languageDistribution = normalizeDistribution([
        { code: ENGLISH_CODE, weight: TOTAL },
        ...draft.languageDistribution,
      ]);
    });
  }, [distribution, setDraft]);

  // ----- Derived state
  const items: WeightedItem[] = useMemo(
    () => distribution.map((l) => ({ key: l.code, value: l.weight })),
    [distribution],
  );
  const sum = useMemo(
    () => items.reduce((s, i) => s + i.value, 0),
    [items],
  );
  const onlyEnglish =
    distribution.length === 1 && distribution[0]?.code === ENGLISH_CODE;

  // ----- Handlers
  function applyDistribution(next: WeightedItem[]) {
    setDraft((draft) => {
      // Preserve insertion order from the original array.
      const byKey = new Map(next.map((i) => [i.key, i.value]));
      draft.languageDistribution = draft.languageDistribution
        .filter((l) => byKey.has(l.code))
        .map((l) => ({ code: l.code, weight: byKey.get(l.code) ?? l.weight }));
    });
  }

  function handleSliderChange(code: string, requested: number) {
    if (onlyEnglish) return;
    const next = rebalanceToTotal(items, code, requested, lockedCodes, TOTAL);
    applyDistribution(next);
  }

  function handleNumericInput(code: string, raw: string) {
    if (raw === "") {
      handleSliderChange(code, 0);
      return;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      handleSliderChange(code, Math.max(0, Math.min(TOTAL, parsed)));
    }
  }

  function toggleLock(code: string) {
    setLockedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function handleAdd(code: string) {
    if (!isSupportedLanguage(code)) return;
    if (distribution.some((l) => l.code === code)) return;
    setDraft((draft) => {
      // New languages start at 0% so the user makes an explicit allocation.
      draft.languageDistribution = [
        ...draft.languageDistribution,
        { code, weight: 0 },
      ];
    });
    if (distribution.length + 1 > SOFT_DILUTE_THRESHOLD) {
      toast.message("That's a lot of languages", {
        description: `With ${distribution.length + 1} languages, each one gets only a small share of the personas. Click Auto-balance to split 100% evenly.`,
      });
    }
  }

  function handleRemove(code: string) {
    if (code === ENGLISH_CODE) return;
    const next = removeKeyAndRedistribute(
      items,
      code,
      lockedCodes,
      ENGLISH_CODE,
      TOTAL,
    );
    applyDistribution(next);
    setLockedCodes((prev) => {
      const cleaned = new Set(prev);
      cleaned.delete(code);
      return cleaned;
    });
  }

  function handleAutoBalance() {
    const next = distributeEvenly(items, lockedCodes, TOTAL);
    applyDistribution(next);
  }

  return (
    <section id="language" className="scroll-mt-24">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                {title}
                <SumBadge sum={sum} />
                <PriorityBadge priority={override?.priority} className="font-normal" />
              </CardTitle>
              <CardDescription>
                {override?.description ??
                  "Split responses across languages. Each persona answers open-text questions in its assigned language, with names, cities, and time zones that fit that language."}
              </CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoBalance}
                  disabled={onlyEnglish}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto-balance
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                Spread 100% evenly across the languages below. Locked rows stay put.
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <PurposeWarnings section="languages" />
          <ul className="space-y-3">
            {distribution.map((entry) => {
              const lang = getLanguage(entry.code);
              if (!lang) return null;
              const isEnglish = entry.code === ENGLISH_CODE;
              const isLocked = lockedCodes.has(entry.code);
              return (
                <li
                  key={entry.code}
                  className="space-y-2 rounded-md border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className="text-2xl leading-none">
                        {lang.flag}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">
                            {lang.nativeName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {lang.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="font-mono text-[9px] uppercase tracking-wider"
                          >
                            {lang.code}
                          </Badge>
                          {lang.notes && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="cursor-help text-[10px] text-warning underline decoration-dotted underline-offset-2"
                                  aria-label="Language notes"
                                >
                                  note
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                {lang.notes}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleLock(entry.code)}
                            aria-label={isLocked ? `Unlock ${lang.name}` : `Lock ${lang.name}`}
                            aria-pressed={isLocked}
                            className={cn(
                              "h-7 w-7",
                              isLocked
                                ? "text-warning hover:text-warning"
                                : "text-muted-foreground",
                            )}
                          >
                            {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          {isLocked
                            ? "Locked. This value stays put when you move other sliders."
                            : "Click to lock this value while you adjust the others."}
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(entry.code)}
                            disabled={isEnglish}
                            aria-label={`Remove ${lang.name}`}
                            className={cn(
                              "h-7 w-7",
                              !isEnglish && "text-muted-foreground hover:text-destructive",
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          {isEnglish
                            ? "English is always available."
                            : "Remove this language. Its share is split across the remaining languages."}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Slider
                      value={[entry.weight]}
                      onValueChange={(values) => {
                        const v = values[0];
                        if (typeof v === "number") handleSliderChange(entry.code, v);
                      }}
                      min={0}
                      max={100}
                      step={1}
                      disabled={onlyEnglish}
                      aria-label={`${lang.name} percentage`}
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={entry.weight}
                        onChange={(e) => handleNumericInput(entry.code, e.target.value)}
                        min={0}
                        max={100}
                        disabled={onlyEnglish}
                        className="h-8 w-16 px-2 text-right tabular-nums"
                        aria-label={`${lang.name} numeric value`}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>

                  <CountryPreviewChips languageCode={entry.code} />
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <AddLanguagePopover
              alreadyAdded={distribution.map((l) => l.code)}
              onAdd={handleAdd}
            />
            {onlyEnglish && (
              <p className="text-xs text-muted-foreground">
                Add another language to split responses across more than English.
              </p>
            )}
          </div>

          {/* SS language-settings reminder — only when multiple languages are configured */}
          {distribution.length > 1 && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Turn on every language listed here in the survey&apos;s
                language settings in SurveySparrow. Responses in a language
                the survey doesn&apos;t have may not display correctly.
              </span>
            </div>
          )}

          {sum !== TOTAL && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Languages add up to <strong>{sum}%</strong> and should total 100%.
                Click Auto-balance or adjust the sliders. You can still save and
                continue, but personas may get the wrong languages.
              </span>
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            Each language places personas in countries where it&apos;s actually
            spoken, so names, cities, phone formats, and time zones match. Click
            the &quot;more&quot; chip under a language to see its full country list.
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDistribution(list: LanguageWeight[]): LanguageWeight[] {
  // Round + force-normalize so the saved value always sums to 100.
  if (list.length === 0) return [{ code: ENGLISH_CODE, weight: TOTAL }];
  const items: WeightedItem[] = list.map((l) => ({ key: l.code, value: l.weight }));
  const sum = items.reduce((s, i) => s + i.value, 0);
  if (sum === 0) {
    // Pathological: zero everywhere — collapse to English at 100.
    const englishItem = items.find((i) => i.key === ENGLISH_CODE);
    if (englishItem) englishItem.value = TOTAL;
    else items.unshift({ key: ENGLISH_CODE, value: TOTAL });
    return items.map((i) => ({ code: i.key, weight: i.value }));
  }
  // Scale to TOTAL, round, absorb error in the largest field.
  const scaled = items.map((i) => ({ key: i.key, value: (i.value / sum) * TOTAL }));
  const rounded = scaled.map((i) => ({ key: i.key, value: Math.round(i.value) }));
  const roundedSum = rounded.reduce((s, i) => s + i.value, 0);
  const diff = TOTAL - roundedSum;
  if (diff !== 0) {
    let largestIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i]!.value > rounded[largestIdx]!.value) largestIdx = i;
    }
    const target = rounded[largestIdx]!;
    rounded[largestIdx] = { ...target, value: Math.max(0, target.value + diff) };
  }
  return rounded.map((i) => ({ code: i.key, weight: i.value }));
}

// Re-export the LANGUAGES_BY_CODE map so other components don't need to thread
// the import (useful for the test suite + future sub-phases).
export { LANGUAGES_BY_CODE };

function SumBadge({ sum }: { sum: number }) {
  const ok = sum === 100;
  return (
    <Badge
      variant={ok ? "outline" : "warning"}
      className="font-mono tabular-nums"
    >
      {ok ? "100%" : `${sum}%`}
    </Badge>
  );
}
