"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Largest run that reliably finishes on the free hosting tier. */
export const RECOMMENDED_RUN_SIZE = 300;

const COPY = `Keep each run to ${RECOMMENDED_RUN_SIZE} responses or fewer. Plumage runs on a free server, and bigger runs can time out partway through. Need more? Generate ${RECOMMENDED_RUN_SIZE}, push them, then run again.`;

/** Small (i) button with the run-size guidance. */
export function RunSizeInfo({ label = "Why 300 at a time?" }: { label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">
        {COPY}
      </TooltipContent>
    </Tooltip>
  );
}

/** Inline warning shown when a run is bigger than the recommended size. */
export function RunSizeWarning({ count }: { count: number }) {
  if (count <= RECOMMENDED_RUN_SIZE) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs leading-relaxed text-warning">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {count.toLocaleString()} responses may time out on Plumage&apos;s free
        server. Generate {RECOMMENDED_RUN_SIZE}, push them, then run again for
        the rest.
      </span>
    </div>
  );
}
