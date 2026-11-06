"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSetupStore } from "@/store/setup-store";
import { useSurveyStore } from "@/store/survey-store";
import { useGenerationStore } from "@/store/generation-store";
import { getRegion } from "@/lib/surveysparrow/regions";
import { Send } from "lucide-react";

// The one confirmation before an irreversible write into a SurveySparrow
// workspace. It names the destination (survey, workspace, region) and the
// side effects (workflows, tags) so an SE connected to a customer's
// account can't push into the wrong place by accident.
//
// mode "again" is the deliberate-duplicate path ("Push another copy"):
// same destination block, but the title and body say duplicates are made.

interface PushConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many responses this push will send. */
  count: number;
  mode: "push" | "again";
  onConfirm: () => void;
}

export function PushConfirmDialog({
  open,
  onOpenChange,
  count,
  mode,
  onConfirm,
}: PushConfirmDialogProps) {
  const ss = useSetupStore((s) => s.surveySparrow);
  const selectedSurveyId = useSurveyStore((s) => s.selectedSurveyId);
  const surveys = useSurveyStore((s) => s.surveys.data);
  const tags = useGenerationStore((s) => s.draft.systemMetadata.tags);

  const surveyName =
    surveys?.find((s) => s.id === selectedSurveyId)?.name ??
    (selectedSurveyId !== null ? `Survey #${selectedSurveyId}` : "No survey selected");
  const region = getRegion(ss.region);
  const workspace = ss.workspaceNickname.trim() || "Unnamed workspace";
  const regionLabel = region ? `${region.shortLabel} · ${region.baseUrl.replace(/^https?:\/\//, "")}` : ss.region;
  const tagList = tags.enabled && tags.values.length > 0 ? tags.values.join(", ") : null;
  const channelCount = ss.channelsEnabled ? ss.channels.length : 0;

  const noun = `${count.toLocaleString()} response${count === 1 ? "" : "s"}`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "again"
              ? `Push another copy of ${noun}?`
              : `Push ${noun} to SurveySparrow?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "again"
              ? "This sends the full set again, creating duplicate responses in the survey below. Responses can't be un-pushed from Plumage."
              : "Responses can't be un-pushed from Plumage. Check the destination before you continue."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <dt className="text-muted-foreground">Survey</dt>
          <dd className="min-w-0 break-words font-medium">{surveyName}</dd>

          <dt className="text-muted-foreground">Workspace</dt>
          <dd className="min-w-0 break-words">
            {workspace} <span className="text-muted-foreground">({regionLabel})</span>
          </dd>

          <dt className="text-muted-foreground">Workflows</dt>
          <dd>
            {ss.triggerWorkflow
              ? "On: notifications and automations will fire"
              : "Off: no emails or automations fire"}
          </dd>

          {channelCount > 0 && (
            <>
              <dt className="text-muted-foreground">Channels</dt>
              <dd>Split across {channelCount} channels</dd>
            </>
          )}

          <dt className="text-muted-foreground">Tags</dt>
          <dd className="min-w-0 break-words">
            {tagList ?? <span className="text-muted-foreground">None</span>}
          </dd>
        </dl>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="gap-2">
            <Send className="h-4 w-4" />
            {mode === "again" ? `Push ${noun} again` : `Push ${noun}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
