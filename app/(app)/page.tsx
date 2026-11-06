"use client";

import Link from "next/link";
import { ConnectionForm } from "@/components/setup/ConnectionForm";
import { LLMConfigForm } from "@/components/setup/LLMConfigForm";
import { HowItWorks } from "@/components/setup/HowItWorks";
import { useSetupStore } from "@/store/setup-store";
import { Button } from "@/components/ui/button";
import { Sparkles, ShieldCheck, ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  const ssOk = useSetupStore((s) => s.ssConnection.status === "ok");
  const llmOk = useSetupStore((s) => s.llmConnection.status === "ok");
  const bothConnected = ssOk && llmOk;
  const rememberAny = useSetupStore((s) => s.rememberSS || s.rememberLLM);

  return (
    // Extra bottom padding while the ready bar floats so it never covers
    // the cards' footer buttons at the end of the scroll range.
    <div className={cn("space-y-6", bothConnected && "pb-20")}>
      <header className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
          {bothConnected && (
            <Badge variant="success" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Ready
            </Badge>
          )}
        </div>
        <p className="max-w-2xl text-muted-foreground">
          Connect SurveySparrow and an AI provider to start generating demo
          datasets.
        </p>
      </header>

      {/* What Plumage is and a sample walk-through, viewable without keys. */}
      <HowItWorks />

      {/* Progress + security row. Deliberately unboxed — the two setup cards
          below should be the only bordered surfaces competing for attention.
          Two-step indicator left, key-safety reassurance right (tooltip). */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1">
        <div className="flex items-center gap-3">
          <StepChecklistItem n={1} done={ssOk} label="SurveySparrow" />
          <span aria-hidden className="text-muted-foreground/50">→</span>
          <StepChecklistItem n={2} done={llmOk} label="AI provider" />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              {rememberAny
                ? "Saved keys stay in this browser only"
                : "Keys clear when you reload, unless you save them"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            By default your keys live in this tab&apos;s memory and are gone
            when you reload. Turn on &ldquo;Remember on this device&rdquo; under
            a key to save it in this browser (not encrypted, so only on your own
            computer). The server uses your key for each request and never
            stores it.
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Two-step grid — side by side on desktop, stacked below lg. Cards
          stretch to equal height; their footers pin to the bottom via
          mt-auto so the Test connection rows sit at the same position. */}
      <div id="setup-connections" className="grid scroll-mt-20 gap-4 lg:grid-cols-2">
        <ConnectionForm />
        <LLMConfigForm />
      </div>

      {/* Floating ready bar: the single "Continue" CTA on this page. Shown
          only when BOTH connections are healthy. Inverted colours (dark bar
          in light mode, light bar in dark mode) so it stands out from the
          page instead of blending into the cards behind it. */}
      {bothConnected && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-4 z-40 px-4 sm:bottom-6"
        >
          <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-xl bg-foreground py-3 pl-4 pr-3 text-background shadow-lg duration-300 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex min-w-0 items-center gap-3">
              <CheckCircle2
                aria-hidden
                className="h-5 w-5 shrink-0 text-[hsl(var(--success-inverse))]"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">You&apos;re connected</p>
                <p className="truncate text-xs leading-tight text-background/75">
                  Both connections passed the test.
                </p>
              </div>
            </div>
            <Button
              asChild
              className="h-9 shrink-0 bg-background px-4 text-primary hover:bg-background/90"
            >
              <Link href="/generate">
                Continue to Generate
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step checklist item — numbered marker that becomes a check once the step's
// connection is healthy. Purely a status read of the setup store; no logic.
// ---------------------------------------------------------------------------

function StepChecklistItem({
  n,
  done,
  label,
}: {
  n: number;
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-colors",
          done
            // Done = soft teal, same treatment as the wizard stepper. Green is
            // reserved for status messages (Connected, success notes).
            ? "border-primary/40 bg-accent text-accent-foreground"
            : "border-input bg-card text-muted-foreground",
        )}
      >
        {done ? <Check className="h-2.5 w-2.5" /> : n}
      </span>
      <span className={cn("font-medium", done ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}
