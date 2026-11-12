"use client";

import Link from "next/link";
import { ConnectionForm } from "@/components/setup/ConnectionForm";
import { LLMConfigForm } from "@/components/setup/LLMConfigForm";
import { HowItWorks } from "@/components/setup/HowItWorks";
import { useSetupStore } from "@/store/setup-store";
import { Button } from "@/components/ui/button";
import { Sparkles, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
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
    <div className={cn("space-y-8", bothConnected && "pb-20")}>
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
          Plumage fills a SurveySparrow survey with realistic demo responses.
          Connect two accounts below to get started.
        </p>
      </header>

      {/* Secondary: what Plumage does, with sample screens. Viewable without
          keys, collapsible, and visually quieter than the connect section. */}
      <HowItWorks />

      {/* Primary task. One heading for the section; each card's own
          Connected badge shows progress, so there's no separate checklist. */}
      <section
        id="setup-connections"
        aria-labelledby="connect-title"
        className="scroll-mt-20 space-y-4 pt-2"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="space-y-0.5">
            <h2 id="connect-title" className="text-lg font-semibold tracking-tight">
              Connect your accounts
            </h2>
            <p className="text-sm text-muted-foreground">
              {bothConnected
                ? "Both connected. You're ready to generate."
                : ssOk || llmOk
                  ? "One down, one to go. Both are needed before you can generate."
                  : "Both are needed before you can generate."}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="inline-flex cursor-help items-center gap-1.5 rounded-sm text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
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

        {/* Side by side on desktop, stacked below lg. Cards
            stretch to equal height; their footers pin to the bottom via
            mt-auto so the Test connection rows sit at the same position. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ConnectionForm />
          <LLMConfigForm />
        </div>
      </section>

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
