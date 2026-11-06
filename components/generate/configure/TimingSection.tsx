"use client";

import { useGenerationStore } from "@/store/generation-store";
import { getSectionOverride } from "@/lib/profiles/dataset-purposes";
import { PriorityBadge } from "@/components/generate/configure/shared/PriorityBadge";
import type { TimeRangeConfig, TimePattern } from "@/lib/profiles/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunSizeInfo, RunSizeWarning, RECOMMENDED_RUN_SIZE } from "@/components/generate/shared/RunSizeHint";

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternDef {
  id: TimePattern;
  label: string;
  description: string;
  bars: number[];
}

const PATTERNS: PatternDef[] = [
  {
    id: "realistic_mix",
    label: "Realistic Mix",
    description:
      "More responses on recent dates, on weekdays, and during business hours. Looks like a real, active customer base.",
    // Right-weighted with weekday/weekend waves
    bars: [4, 10, 14, 12, 9, 3, 2, 6, 14, 18, 16, 12, 4, 3, 8, 22],
  },
  {
    id: "uniform",
    label: "Uniform",
    description: "Evenly spread across the date range. Good for showing steady adoption.",
    bars: Array<number>(16).fill(15),
  },
  {
    id: "recent_surge",
    label: "Recent Surge",
    description:
      "Most responses in the last 20% of the date range. Good for showing recent growth.",
    bars: [1, 1, 1, 2, 2, 3, 3, 4, 5, 7, 9, 12, 16, 21, 26, 30],
  },
  {
    id: "campaign_burst",
    label: "Campaign Burst",
    description:
      "A spike in the middle of the range. Looks like a survey campaign or email blast.",
    bars: [1, 3, 6, 10, 15, 21, 27, 30, 27, 21, 15, 10, 6, 3, 1, 1],
  },
];

// ---------------------------------------------------------------------------
// Slider constants
// ---------------------------------------------------------------------------

const MIN_COUNT = 10;
const MAX_COUNT = 5_000;
const SOFT_CAP = 1_000;
// The slider covers the useful range; the number box still accepts up to
// MAX_COUNT for anyone who really needs a bigger run.
const SLIDER_MAX = 1_000;
// Tick on the slider at the recommended run size.
const CAP_MARKER_PCT =
  ((RECOMMENDED_RUN_SIZE - MIN_COUNT) / (SLIDER_MAX - MIN_COUNT)) * 100;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function msToDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dateStrToMs(str: string): number {
  // Use T12:00:00 so UTC midnight ambiguity doesn't shift the date backward.
  return new Date(str + "T12:00:00").getTime();
}

const TWO_YEARS_AGO = msToDateStr(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
const TODAY = msToDateStr(Date.now());

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimingSection() {
  const timeRange = useGenerationStore((s) => s.draft.timeRange);
  const setDraft = useGenerationStore((s) => s.setDraft);
  const datasetPurpose = useGenerationStore((s) => s.draft.datasetPurpose);

  // Dataset Purpose can flag a priority badge here (e.g. "Recommended"
  // for hierarchy / support). GUIDANCE ONLY — the timing/volume logic
  // and the existing volume warnings are untouched.
  const override = getSectionOverride(datasetPurpose, "timing");
  const title = override?.label ?? "Responses and timing";

  function update(patch: Partial<TimeRangeConfig>) {
    setDraft((draft) => {
      draft.timeRange = { ...draft.timeRange, ...patch };
    });
  }

  const { responseCount } = timeRange;

  const volumeWarning =
    responseCount >= MAX_COUNT
      ? {
          level: "red" as const,
          msg: "This is the maximum. Expect 30+ minutes and a large LLM bill.",
        }
      : responseCount >= 3_000
        ? {
            level: "orange" as const,
            msg: "Very high volume. Only worth it for a final demo environment.",
          }
        : responseCount >= SOFT_CAP
          ? {
              level: "yellow" as const,
              msg: "1,000+ responses can take 10+ minutes and cost $5 or more. For a first demo, start with 200 to 500.",
            }
          : null;

  return (
    <section id="timing" className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            {title}
            <PriorityBadge priority={override?.priority} className="font-normal" />
          </CardTitle>
          <CardDescription>
            {override?.description ??
              "How many responses to create, and when they were submitted. Spreading dates over a range makes SurveySparrow's trend charts look real."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ---- Volume slider ---- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <label htmlFor="response-count" className="text-sm font-medium">
                  Number of responses
                </label>
                <RunSizeInfo />
                <span className="text-xs text-muted-foreground">
                  (up to {RECOMMENDED_RUN_SIZE} per run)
                </span>
              </div>
              <input
                id="response-count"
                type="number"
                value={responseCount}
                min={MIN_COUNT}
                max={MAX_COUNT}
                step={10}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) {
                    update({
                      responseCount: Math.max(MIN_COUNT, Math.min(MAX_COUNT, v)),
                    });
                  }
                }}
                className="h-7 w-20 rounded-md border bg-background px-2 text-right tabular-nums text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Slider + soft cap marker */}
            <div className="relative">
              <Slider
                value={[Math.min(responseCount, SLIDER_MAX)]}
                onValueChange={(values) => {
                  const v = values[0];
                  if (typeof v === "number") update({ responseCount: v });
                }}
                min={MIN_COUNT}
                max={SLIDER_MAX}
                step={10}
                aria-label="Number of responses"
              />
              {/* Tick at the recommended run size */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 cursor-default rounded-full bg-primary/70 pointer-events-auto"
                    style={{ left: `${CAP_MARKER_PCT}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{RECOMMENDED_RUN_SIZE} responses: the most that reliably finishes in one run</TooltipContent>
              </Tooltip>
            </div>

            <RunSizeWarning count={responseCount} />

            {/* Volume warning */}
            {volumeWarning && (
              <div
                className={cn(
                  "rounded-md border p-2.5 text-xs leading-relaxed",
                  volumeWarning.level === "red" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  volumeWarning.level === "orange" &&
                    "border-warning/60 bg-warning/15 text-warning",
                  volumeWarning.level === "yellow" &&
                    "border-warning/40 bg-warning/10 text-warning",
                )}
              >
                {volumeWarning.msg}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Plumage creates one persona per response, so this is{" "}
              <strong className="tabular-nums text-foreground">
                {responseCount.toLocaleString()}
              </strong>{" "}
              personas and{" "}
              <strong className="tabular-nums text-foreground">
                {responseCount.toLocaleString()}
              </strong>{" "}
              responses.
            </p>
          </div>

          <div className="border-t" />

          {/* ---- Date range ---- */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Date range</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="timing-from"
                  className="block text-xs text-muted-foreground"
                >
                  From
                </label>
                <Input
                  id="timing-from"
                  type="date"
                  value={msToDateStr(timeRange.from)}
                  min={TWO_YEARS_AGO}
                  max={msToDateStr(timeRange.to)}
                  onChange={(e) => {
                    if (e.target.value) update({ from: dateStrToMs(e.target.value) });
                  }}
                  className="h-8 text-sm"
                />
              </div>
              <span className="pb-1.5 text-muted-foreground">→</span>
              <div className="space-y-1">
                <label
                  htmlFor="timing-to"
                  className="block text-xs text-muted-foreground"
                >
                  To
                </label>
                <Input
                  id="timing-to"
                  type="date"
                  value={msToDateStr(timeRange.to)}
                  min={msToDateStr(timeRange.from)}
                  max={TODAY}
                  onChange={(e) => {
                    if (e.target.value) update({ to: dateStrToMs(e.target.value) });
                  }}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Responses are spread across these dates using the pattern you pick below.
            </p>
          </div>

          {/* ---- Pattern selector ---- */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Distribution pattern</p>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {PATTERNS.map((p) => (
                <PatternCard
                  key={p.id}
                  pattern={p}
                  selected={timeRange.pattern === p.id}
                  onSelect={() => update({ pattern: p.id })}
                />
              ))}
            </div>
          </div>

          {/* ---- Business hours ---- */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="business-hours"
              checked={timeRange.businessHoursWeight}
              onChange={(e) => update({ businessHoursWeight: e.target.checked })}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border accent-primary"
            />
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    htmlFor="business-hours"
                    className="cursor-pointer text-sm font-medium"
                  >
                    Favor business hours (9am to 6pm, Mon to Fri) in each persona&apos;s
                    time zone
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  When this is on, fewer responses land at 2am or on weekends, the
                  way real survey traffic does.
                </TooltipContent>
              </Tooltip>
              <p className="text-xs text-muted-foreground">
                Puts fewer responses at night and on weekends.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pattern card
// ---------------------------------------------------------------------------

function PatternCard({
  pattern,
  selected,
  onSelect,
}: {
  pattern: PatternDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "hover:border-muted-foreground/40 hover:bg-muted/30",
      )}
      aria-pressed={selected}
    >
      <Histogram bars={pattern.bars} selected={selected} />
      <div>
        <p className="text-xs font-semibold leading-tight">{pattern.label}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {pattern.description}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SVG histogram
// ---------------------------------------------------------------------------

function Histogram({ bars, selected }: { bars: number[]; selected: boolean }) {
  const BAR_W = 4;
  const GAP = 1;
  const MAX_H = 30;
  const svgW = bars.length * (BAR_W + GAP) - GAP;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${MAX_H}`}
      width={svgW}
      height={MAX_H}
      aria-hidden
      className={cn(
        "shrink-0",
        selected ? "text-primary" : "text-muted-foreground/60",
      )}
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * (BAR_W + GAP)}
          y={MAX_H - h}
          width={BAR_W}
          height={h}
          fill="currentColor"
          rx="0.5"
        />
      ))}
    </svg>
  );
}
