"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSetupStore } from "@/store/setup-store";
import { estimateCost, formatUsd } from "@/lib/generation/cost-estimator";
import { cn } from "@/lib/utils";

// "How Plumage works": what the app is for, three plain facts (time, cost,
// safety), and a click-through of the four steps after connecting, each with
// a sample screen so people can see the app before they paste any keys.
// Connecting isn't a step here because the real Connect cards sit right
// below this section.
//
// Read-only: the only store read is the model choice, which feeds the live
// cost figure. Collapsible; the choice is a per-browser convenience in
// localStorage so a returning SE isn't shown the tour on every visit.

const COLLAPSED_KEY = "plumage:how-it-works:collapsed";

// Cost figure assumptions, stated in the UI so the number isn't misleading.
const SAMPLE_RESPONSES = 200;
const SAMPLE_QUESTIONS = 12;

interface Step {
  id: string;
  title: string;
  caption: string;
  summary: string;
}

const STEPS: Step[] = [
  {
    id: "survey",
    title: "Pick a survey",
    caption: "From your workspace",
    summary:
      "Choose the SurveySparrow survey you're demoing. Plumage reads its questions so every answer fits the question type: NPS scores, choices, ratings, open text.",
  },
  {
    id: "describe",
    title: "Describe the demo",
    caption: "Customer, themes, mood",
    summary:
      "Tell Plumage who the customer is and what the demo should show: themes to mention and the mix of happy and unhappy respondents. AI Setup can draft all of this from a company name.",
  },
  {
    id: "generate",
    title: "Generate",
    caption: "People first, then answers",
    summary:
      "Plumage first invents the respondents: a name, a city, a device and a reason to feel the way they do. Then it writes each person's answers, so a happy customer stays happy from the NPS score to the last comment.",
  },
  {
    id: "push",
    title: "Review and push",
    caption: "You confirm first",
    summary:
      "Read through the responses, then push them into your survey. You see the survey, workspace and tag before anything is sent. Prefer not to push? Download a CSV instead.",
  },
];

export function HowItWorks() {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const personaModel = useSetupStore((s) => s.llm.personaModel);
  const responseModel = useSetupStore((s) => s.llm.responseModel);

  // Restore the per-browser collapsed choice after mount (hydration-safe).
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSED_KEY) === "1") setCollapsed(true);
    } catch {
      // Storage blocked: just show the section.
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Not persisted; fine.
      }
      return next;
    });
  }

  const sampleCost = useMemo(() => {
    const est = estimateCost({
      responseCount: SAMPLE_RESPONSES,
      questionCount: SAMPLE_QUESTIONS,
      personaModelId: personaModel,
      responseModelId: responseModel,
      nonEnglishFraction: 0,
    });
    return est.totalCost;
  }, [personaModel, responseModel]);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % STEPS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + STEPS.length) % STEPS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = STEPS.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  const step = STEPS[active]!;
  const isLast = active === STEPS.length - 1;

  return (
    <section
      aria-labelledby="how-it-works-title"
      className="rounded-lg border border-border/60 bg-card"
    >
      {/* Header row: always visible, doubles as the collapsed state. */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 max-w-2xl space-y-1">
          <h2 id="how-it-works-title" className="text-base font-semibold">
            How Plumage works
          </h2>
          <p className="text-sm text-muted-foreground">
            Plumage fills a SurveySparrow survey with realistic responses, so
            dashboards and reports look like a real customer&apos;s when you demo
            them. Connect your accounts below, then it&apos;s four steps.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="how-it-works-body"
          className="gap-1 text-muted-foreground"
        >
          {collapsed ? "Show how it works" : "Hide"}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-180")}
          />
        </Button>
      </div>

      {!collapsed && (
        <div id="how-it-works-body" className="space-y-5 border-t px-5 pb-5 pt-4">
          {/* The three things people ask first: how long, how much, is it safe. */}
          <ul className="grid gap-2 sm:grid-cols-3">
            <Fact value="About 5 min" label="from connected to responses in your survey" />
            <Fact
              value={sampleCost !== null ? formatUsd(sampleCost) : "Varies"}
              label={
                sampleCost !== null
                  ? `for ${SAMPLE_RESPONSES} responses on a ${SAMPLE_QUESTIONS}-question survey, with your current models`
                  : "depends on the AI model you pick"
              }
            />
            <Fact value="You confirm" label="before anything is sent to SurveySparrow" />
          </ul>

          {/* Stepper: horizontal tabs joined by a line. Scrolls sideways on
              narrow screens instead of wrapping. */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div
              role="tablist"
              aria-label="Steps"
              className="grid min-w-[560px] grid-cols-4 gap-2"
            >
              {STEPS.map((s, i) => {
                const selected = i === active;
                const done = i < active;
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    role="tab"
                    id={`how-tab-${s.id}`}
                    aria-selected={selected}
                    aria-controls={`how-panel-${s.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(i)}
                    onKeyDown={(e) => onTabKeyDown(e, i)}
                    className="group flex flex-col gap-2 rounded-lg px-1 pb-2 pt-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* Progress bar segment: filled up to and including the
                        current step. */}
                    <span
                      aria-hidden
                      className={cn(
                        "h-1 w-full rounded-full transition-colors",
                        selected || done ? "bg-primary" : "bg-border group-hover:bg-muted-foreground/40",
                      )}
                    />
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          selected || done ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-sm",
                            selected ? "font-semibold text-foreground" : "font-medium text-muted-foreground group-hover:text-foreground",
                          )}
                        >
                          {s.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">{s.caption}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel: explanation on the left, sample screen on the right. */}
          <div
            role="tabpanel"
            id={`how-panel-${step.id}`}
            aria-labelledby={`how-tab-${step.id}`}
            className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          >
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.summary}</p>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActive((a) => Math.max(0, a - 1))}
                  disabled={active === 0}
                >
                  Back
                </Button>
                {!isLast ? (
                  <Button size="sm" onClick={() => setActive((a) => a + 1)}>
                    Next: {STEPS[active + 1]!.title}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      document
                        .getElementById("setup-connections")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    Connect your accounts
                  </Button>
                )}
              </div>
            </div>

            {/* Sample screen in a small window frame. The title bar says it's
                an example, so nothing floats over the content. */}
            <figure className="overflow-hidden rounded-lg border bg-background">
              <figcaption className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-border" />
                  <span className="h-2 w-2 rounded-full bg-border" />
                  <span className="h-2 w-2 rounded-full bg-border" />
                </span>
                Example with sample data
              </figcaption>
              <div className="p-4">
                <StepPreview id={step.id} />
              </div>
            </figure>
          </div>
        </div>
      )}
    </section>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <li className="rounded-lg bg-muted/50 px-3 py-2.5">
      <span className="block text-base font-semibold tabular-nums text-foreground">{value}</span>
      <span className="block text-xs text-muted-foreground">{label}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sample previews. Small static mock-ups of each real screen, using the same
// tokens so they read as part of the app. All data here is invented and the
// frame is captioned "Example with sample data".
// ---------------------------------------------------------------------------

function StepPreview({ id }: { id: string }) {
  switch (id) {
    case "survey":
      return <SurveyPreview />;
    case "describe":
      return <DescribePreview />;
    case "generate":
      return <GeneratePreview />;
    case "push":
      return <PushPreview />;
    default:
      return null;
  }
}

function SurveyPreview() {
  const questions = [
    { text: "How likely are you to recommend Nexora to a friend?", type: "NPS" },
    { text: "Which part of the installation went best?", type: "Multiple choice" },
    { text: "How easy was the app to set up?", type: "Rating" },
    { text: "Anything we could have done better?", type: "Open text" },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card px-3 py-2">
        <div className="text-xs text-muted-foreground">Survey</div>
        <div className="text-sm font-medium">Nexora Living · Post-install feedback</div>
      </div>
      <ol className="space-y-1.5">
        {questions.map((q, i) => (
          <li key={q.text} className="flex items-center gap-2.5 text-sm">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{q.text}</span>
            <Badge variant="outline" className="shrink-0 text-[11px] font-normal">
              {q.type}
            </Badge>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DescribePreview() {
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card px-3 py-2 text-sm">
        <div className="mb-1 text-xs text-muted-foreground">Use case context</div>
        Nexora Living sells smart-home kits in the US. Show strong installation
        feedback, with a few complaints about app setup.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["Installation experience", "App setup", "Support response time"].map((t) => (
          <span key={t} className="rounded-full border bg-card px-2.5 py-0.5 text-xs">
            {t}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <div className="bg-success" style={{ width: "60%" }} />
          <div className="bg-muted-foreground/40" style={{ width: "25%" }} />
          <div className="bg-destructive" style={{ width: "15%" }} />
        </div>
        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span>Promoters 60%</span>
          <span>Passives 25%</span>
          <span>Detractors 15%</span>
        </div>
      </div>
    </div>
  );
}

function GeneratePreview() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-md border bg-card px-3 py-2.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          PR
        </span>
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Priya Raman</span>
            <Badge variant="success" className="text-[11px]">Promoter</Badge>
          </div>
          <div className="text-xs text-muted-foreground">Austin, United States · Mobile</div>
          <div className="text-xs text-muted-foreground">
            Cares about: an install that fits around her work schedule.
          </div>
        </div>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-muted-foreground">Recommend</dt>
          <dd className="font-medium tabular-nums">9 out of 10</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-muted-foreground">Went best</dt>
          <dd>Scheduling the visit</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-muted-foreground">Do better</dt>
          <dd className="italic">
            &ldquo;The installer was on time and walked me through the app. Pairing the
            door sensor took two tries.&rdquo;
          </dd>
        </div>
      </dl>
    </div>
  );
}

function PushPreview() {
  const now = new Date();
  const tag = `plumage-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">Push 200 responses to SurveySparrow?</div>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Survey</dt>
          <dd className="truncate">Nexora Living · Post-install feedback</dd>
          <dt className="text-muted-foreground">Workspace</dt>
          <dd>Demo workspace (US)</dd>
          <dt className="text-muted-foreground">Workflows</dt>
          <dd>Off: no emails or automations fire</dd>
          <dt className="text-muted-foreground">Tag</dt>
          <dd className="font-mono text-xs leading-5">{tag}</dd>
        </dl>
      </div>
      <p className="text-xs text-muted-foreground">
        The tag lets you find or delete the demo data later in SurveySparrow.
      </p>
    </div>
  );
}
