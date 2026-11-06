"use client";

import { Badge } from "@/components/ui/badge";
import type { SectionPriority } from "@/lib/profiles/dataset-purposes";

// Small badge that signals how relevant a Configure section is to the
// currently-selected Dataset Purpose. GUIDANCE ONLY — it never disables,
// hides, or reorders the section. It's purely a visual cue so an SE can
// see at a glance which sections matter most for the dataset they're
// building.
//
// Priority → visual:
//   primary / undefined → nothing (the neutral, unremarkable state;
//                         rendering a badge on every "primary" section
//                         would just be noise)
//   recommended         → soft green "Recommended"
//   optional            → muted outline "Optional"
//   secondary           → muted outline "Secondary" (same visual weight
//                         as optional for now; the distinct priority is
//                         preserved in the type so we can differentiate
//                         later without touching call sites)

export function PriorityBadge({
  priority,
  className,
}: {
  priority: SectionPriority | undefined;
  className?: string;
}) {
  if (!priority || priority === "primary") return null;

  if (priority === "recommended") {
    return (
      <Badge variant="success" className={className}>
        Recommended
      </Badge>
    );
  }

  // optional | secondary — muted, low-emphasis.
  return (
    <Badge variant="outline" className={className}>
      {priority === "secondary" ? "Secondary" : "Optional"}
    </Badge>
  );
}
