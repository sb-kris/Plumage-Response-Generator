"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnchorDef {
  /** DOM element id to scroll to + observe. */
  id: string;
  label: string;
  /** Essentials only: true once the section is filled in. */
  done?: boolean;
}

export interface AnchorGroup {
  label: string;
  anchors: AnchorDef[];
}

interface Props {
  groups: AnchorGroup[];
  /** Hash to scroll into view on mount (e.g. when navigating from /profiles). */
  initialAnchor?: string;
}

/**
 * Left rail of section anchors, in groups (Essentials, Optional). Highlights
 * the section in view, ticks finished essentials, and smooth-scrolls on click.
 */
export function SectionAnchorRail({ groups, initialAnchor }: Props) {
  const anchors = groups.flatMap((g) => g.anchors);
  const ids = anchors.map((a) => a.id).join(",");
  const [activeId, setActiveId] = useState<string | null>(
    initialAnchor ?? anchors[0]?.id ?? null,
  );

  // Observe section visibility: the most visible section becomes active.
  useEffect(() => {
    const targets = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveId(visible[0]!.target.id);
        }
      },
      {
        rootMargin: "-30% 0px -50% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  // If the page is loaded with a hash, scroll to it on mount.
  useEffect(() => {
    if (initialAnchor) {
      const el = document.getElementById(initialAnchor);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialAnchor]);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav aria-label="Configuration sections" className="sticky top-20 space-y-4 text-sm">
      {groups.map((g) => (
        <div key={g.label} className="space-y-0.5">
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </div>
          {g.anchors.map((a) => {
            const isActive = activeId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => jumpTo(a.id)}
                aria-current={isActive ? "location" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <span className="truncate">{a.label}</span>
                {a.done !== undefined &&
                  (a.done ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Done" />
                  ) : (
                    <span
                      aria-label="Not done yet"
                      className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/60"
                    />
                  ))}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
