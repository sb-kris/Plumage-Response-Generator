"use client";

import { useEffect, useState } from "react";
import { useResponsesStore } from "@/store/responses-store";
import { useSurveyStore } from "@/store/survey-store";
import { useGenerationStore } from "@/store/generation-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import type { PushResponsesHookState } from "./usePushResponses";
import { DebugPanel } from "./DebugPanel";
import { PushConfirmDialog } from "./PushConfirmDialog";
import { RotatingLoadingMessage } from "@/components/ui/RotatingLoadingMessage";
import { PUSH_MESSAGES } from "@/lib/copy/loading-messages";
import { celebrateFirstPush, replayCelebration } from "@/lib/effects/celebrate";
import { playFailureCue } from "@/lib/effects/sound-effects";
import { SpeakerButton } from "@/components/shared/SpeakerButton";

// Phase 5c — States D (pushing) and E (push complete / partial failed).
//
// Both states live in one component because the data shown in E is a
// summary of what happened in D; keeping them together avoids duplicating
// the results block.

interface Props {
  pushHook: PushResponsesHookState;
  onBack: () => void;
  autoStart?: boolean;
}

export function PushToSurveySparrowCard({ pushHook, onBack, autoStart }: Props) {
  const pushStatus = useResponsesStore((s) => s.pushStatus);
  const pushProgress = useResponsesStore((s) => s.pushProgress);
  const pushPhase = useResponsesStore((s) => s.pushPhase);
  const variableStats = useResponsesStore((s) => s.variableStats);
  const responses = useResponsesStore((s) => s.responses);
  // Generation-time warnings surfaced by the validator (missing required
  // answers, invalid MCQ/Matrix shapes, missing variables, unsupported
  // types, etc.). Preview card shows detail; Push card shows the count so
  // SEs see the pre-push status at a glance.
  const generationWarnings = useResponsesStore((s) => s.progress.warnings);
  const { push, pushAgain, cancel, canPush, reasonNotReady } = pushHook;
  // Tags make demo data easy to find and remove later in SurveySparrow.
  const tagsConfig = useGenerationStore((s) => s.draft.systemMetadata.tags);
  const pushTags = tagsConfig.enabled ? tagsConfig.values : [];
  const surveyName = useSurveyStore(
    (s) => s.surveys.data?.find((x) => x.id === s.selectedSurveyId)?.name ?? null,
  );

  // Which confirmation is open. Every push path that sends to a NEW
  // destination decision goes through PushConfirmDialog; "Retry failed" and
  // "Send remaining" skip it because they continue a push already confirmed.
  const [confirmMode, setConfirmMode] = useState<"push" | "again" | null>(null);

  // Skip-preview lands here straight after generation. It skips the preview
  // table, NOT the confirmation: open the dialog instead of pushing.
  useEffect(() => {
    if (autoStart && canPush) {
      setConfirmMode("push");
    }
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-push celebration — fires once per session when a push completes
  // with zero failures. Module-level guard in celebrateFirstPush prevents
  // re-firing on subsequent successful pushes.
  const notSentCount = responses.filter((r) => r.status === "generated").length;
  useEffect(() => {
    if (
      pushStatus === "complete" &&
      pushProgress.failed === 0 &&
      pushProgress.pushed > 0 &&
      notSentCount === 0
    ) {
      void celebrateFirstPush();
    }
  }, [pushStatus, pushProgress.failed, pushProgress.pushed, notSentCount]);

  // Failure cue — fires once each time a push completes with any failures.
  // Distinct from celebration: we WANT this to fire every time (not session-
  // guarded) because each failed batch is a discrete event the user needs to
  // hear. Detached useEffect with the same trigger keys means changing
  // pushed counts can't accidentally double-fire — we only react to the
  // moment the status flips to "complete".
  useEffect(() => {
    if (pushStatus === "complete" && pushProgress.failed > 0) {
      void playFailureCue();
    }
  }, [pushStatus, pushProgress.failed]);

  const isRunning = pushStatus === "running";
  const isComplete = pushStatus === "complete";
  const pct =
    pushProgress.total > 0
      ? Math.round(((pushProgress.pushed + pushProgress.failed) / pushProgress.total) * 100)
      : 0;

  const failedResponses = responses.filter((r) => r.status === "failed");
  const pushedCount = responses.filter((r) => r.status === "pushed").length;
  // Responses still in "generated" after completion = were never attempted (cancelled).
  const remainingCount = notSentCount;
  const wasCancelled = isComplete && remainingCount > 0;
  const toSendCount = responses.length - pushedCount;

  const confirmDialog = (
    <PushConfirmDialog
      open={confirmMode !== null}
      onOpenChange={(o) => !o && setConfirmMode(null)}
      mode={confirmMode ?? "push"}
      count={confirmMode === "again" ? responses.length : toSendCount}
      onConfirm={() => {
        const mode = confirmMode;
        setConfirmMode(null);
        if (mode === "again") void pushAgain();
        else void push();
      }}
    />
  );

  if (pushStatus === "idle") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <CardTitle>Push to SurveySparrow</CardTitle>
          </div>
          <CardDescription>
            Send {toSendCount.toLocaleString()} response{toSendCount === 1 ? "" : "s"} to{" "}
            {surveyName ? (
              <span className="font-medium text-foreground">&ldquo;{surveyName}&rdquo;</span>
            ) : (
              "your SurveySparrow survey"
            )}
            . You&apos;ll confirm the destination before anything is sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canPush && reasonNotReady && (
            <Alert variant="warning">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Can&apos;t push yet</AlertTitle>
              <AlertDescription>{reasonNotReady}</AlertDescription>
            </Alert>
          )}
          {generationWarnings.length > 0 && (
            <Alert variant="warning">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                {generationWarnings.length}{" "}
                {generationWarnings.length === 1 ? "response has" : "responses have"}{" "}
                validation warnings
              </AlertTitle>
              <AlertDescription className="text-xs">
                They will still be pushed, but some answers may be missing.
                Click Back to preview to see which personas are affected.
              </AlertDescription>
            </Alert>
          )}
          <ApiLimitationsAlert />
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              onClick={() => setConfirmMode("push")}
              disabled={!canPush || toSendCount === 0}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Push {toSendCount.toLocaleString()} response{toSendCount === 1 ? "" : "s"}…
            </Button>
            <Button variant="outline" size="lg" onClick={onBack} className="gap-2">
              Back to preview
            </Button>
          </div>
        </CardContent>
        {confirmDialog}
      </Card>
    );
  }

  // Organic shape on the celebratory state only — running and partial-fail
  // states keep the standard rectilinear card so they don't read as "done".
  const isSuccessComplete =
    isComplete && pushProgress.failed === 0 && !wasCancelled && pushedCount > 0;

  return (
    <Card className={isSuccessComplete ? "card-organic-static" : undefined}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : isSuccessComplete ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-warning" />
          )}
          <CardTitle>
            {isRunning
              ? "Pushing to SurveySparrow…"
              : isSuccessComplete
                ? "All responses pushed"
                : wasCancelled
                  ? `Push stopped: ${remainingCount.toLocaleString()} not sent`
                  : `Push finished: ${pushProgress.failed} failed`}
          </CardTitle>
        </div>
        <CardDescription>
          {isRunning ? (
            pushPhase === "checking_variables" ? (
              <span className="text-xs">Checking your survey&apos;s existing variables…</span>
            ) : pushPhase === "creating_variables" ? (
              <span className="text-xs">
                Creating missing variables in SurveySparrow…
              </span>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <RotatingLoadingMessage pool={PUSH_MESSAGES} />
                <span className="text-xs opacity-70">
                  {pushProgress.pushed + pushProgress.failed} of {pushProgress.total} sent, in batches of up to 100.
                </span>
              </span>
            )
          ) : (
            `${pushedCount.toLocaleString()} pushed · ${pushProgress.failed} failed`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Variable readiness pill — only rendered once a stats snapshot
            exists. Surfaces what happened in the pre-push step:
              "Variables ready: 5 existing, 2 created" (success)
              "Variable creation failed for customer_tier…" (failure)
            Stays visible after the push completes so the SE can audit. */}
        {variableStats && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              variableStats.failedNames.length > 0 || variableStats.errorMessage
                ? "border-destructive/40 bg-destructive/5 text-destructive-foreground"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {variableStats.failedNames.length > 0 || variableStats.errorMessage ? (
              <>
                <span className="font-medium">Variable check failed.</span>{" "}
                {variableStats.errorMessage ?? "Could not create one or more variables."}
                {variableStats.failedNames.length > 0 && (
                  <span> Affected: {variableStats.failedNames.slice(0, 3).join(", ")}{variableStats.failedNames.length > 3 ? "…" : ""}.</span>
                )}
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  Variables ready:
                </span>{" "}
                {variableStats.existing} existing
                {variableStats.created > 0 && `, ${variableStats.created} created`}.
              </>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium tabular-nums">
              {pushProgress.pushed + pushProgress.failed} / {pushProgress.total}
            </span>
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
            />
          </div>
          {pushProgress.failed > 0 && (
            <p className="text-xs text-warning">
              {pushProgress.failed} failed so far
            </p>
          )}
        </div>

        {/* Failed response list (shown after completion) */}
        {isComplete && failedResponses.length > 0 && (
          <Alert variant="warning">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>
              {failedResponses.length} response{failedResponses.length === 1 ? "" : "s"} failed to push
            </AlertTitle>
            <AlertDescription className="space-y-1">
              {failedResponses.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-start gap-1.5 text-xs">
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                  <span>
                    <span className="font-medium">{r.personaName}</span>
                    {r.errorMessage ? `: ${r.errorMessage}` : ""}
                  </span>
                </div>
              ))}
              {failedResponses.length > 5 && (
                <p className="text-[10px] text-muted-foreground">
                  +{failedResponses.length - 5} more
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Success banner */}
        {isSuccessComplete && (
          <Alert className="relative">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertTitle className="pr-20">
              {pushedCount.toLocaleString()} responses are now in SurveySparrow
            </AlertTitle>
            <AlertDescription className="pr-20">
              They appear in your survey&apos;s Responses tab within a few seconds.
              {pushTags.length > 0 && (
                <>
                  {" "}They&apos;re tagged <code className="rounded bg-muted px-1 font-mono text-xs">{pushTags.join(", ")}</code>,
                  so you can filter by that tag in SurveySparrow to find or delete this
                  demo data later.
                </>
              )}
            </AlertDescription>
            {/* Replay celebration — animated speaker icon (webm) top-right.
                On click: re-fires confetti + celebration sound. Sized to
                fill the alert's right-edge negative space without crowding
                the title text. Vertically centered on the alert. */}
            <SpeakerButton
              onPlay={() => void replayCelebration()}
              label="Replay celebration sound"
              className="absolute right-3 top-1/2 h-14 w-14 -translate-y-1/2"
            />
          </Alert>
        )}

        {/* Pushing can become blocked after a push finished, e.g. when the
            user switches survey. Say why here too, not only on the idle card. */}
        {isComplete && !canPush && reasonNotReady && (
          <Alert variant="warning">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Can&apos;t push again</AlertTitle>
            <AlertDescription>{reasonNotReady}</AlertDescription>
          </Alert>
        )}

        <DebugPanel />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {isRunning && (
            <>
              <Button variant="outline" size="sm" onClick={cancel} className="gap-1.5">
                <X className="h-3.5 w-3.5" />
                Cancel push
              </Button>
              {/* Back-to-preview while pushing — the push hook lives on the
                  parent and continues in the background, so the user can
                  inspect / verify responses without halting delivery. The
                  push card auto-returns via the Push button when they want
                  to watch progress again. */}
              <Button
                variant="outline"
                size="sm"
                onClick={onBack}
                className="gap-1.5"
                title="The push keeps running in the background. Click View push progress to come back here."
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to preview
              </Button>
            </>
          )}
          {/* "Send remaining" — continues after a cancel (pushes all non-pushed). */}
          {isComplete && (wasCancelled || failedResponses.length > 0) && (
            <Button
              size="sm"
              onClick={() => void push()}
              disabled={!canPush}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {wasCancelled
                ? `Send remaining (${remainingCount + failedResponses.length})`
                : `Retry failed (${failedResponses.length})`}
            </Button>
          )}
          {/* "Push another copy" — re-pushes the entire response set even
              after a clean success. Two scenarios where this matters:
              (1) SS accepted the batch (202) but a silent downstream drop
                  meant some responses never landed — UI says "Pushed" but
                  the dashboard is missing data. One-click rescue.
              (2) The user genuinely wants duplicates for a stress demo. */}
          {isComplete && pushedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmMode("again")}
              disabled={!canPush}
              className="gap-1.5"
              title="Sends the full set again, which creates duplicate responses in SurveySparrow."
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Push another copy…
            </Button>
          )}
          {isComplete && (
            <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to preview
            </Button>
          )}
        </div>
      </CardContent>
      {confirmDialog}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API-limitations alert (State D pre-push view only)
// ---------------------------------------------------------------------------
//
// Collapsible callout that sets expectations before push. Uses native
// <details>/<summary> to avoid pulling in @radix-ui/react-collapsible for
// a single toggle. Default state = collapsed (users who've seen it once
// don't need it in their face on every subsequent push).

function ApiLimitationsAlert() {
  return (
    <Alert variant="default" className="border-muted-foreground/20">
      <Info className="h-4 w-4 text-muted-foreground" />
      <details>
        <summary className="cursor-pointer list-none text-sm font-medium">
          What SurveySparrow&apos;s API can and can&apos;t fill in
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (click to expand)
          </span>
        </summary>
        <AlertDescription className="pt-2 text-xs text-muted-foreground">
          SurveySparrow&apos;s batch response API creates completed responses, which
          show up in response tables and dashboards. These responses don&apos;t come
          from a real browser session, so session analytics such as drop-off
          funnels, page timing, completion duration, and session recordings may
          not fill in the same way. Plumage can&apos;t work around this; it&apos;s
          how SurveySparrow&apos;s API behaves.
        </AlertDescription>
      </details>
    </Alert>
  );
}
