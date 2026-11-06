"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGenerationStore, isDraftDirty } from "@/store/generation-store";
import { SaveProfileDialog } from "./SaveProfileDialog";
import { LoadProfileDialog } from "./LoadProfileDialog";
import { SetupAssistantDialog } from "./SetupAssistantDialog";
import {
  Save,
  ChevronDown,
  FolderOpen,
  CopyPlus,
  RotateCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export function ProfileBar() {
  const draft = useGenerationStore((s) => s.draft);
  const loadedProfile = useGenerationStore((s) => s.loadedProfile);
  const resetDraft = useGenerationStore((s) => s.resetDraft);
  const clearLoadedSource = useGenerationStore((s) => s.clearLoadedSource);

  const dirty = isDraftDirty(draft, loadedProfile);
  // A brand-new draft (no profile, no context, no themes). This is where a
  // first-time user is most likely to stall in front of a long page, so we
  // point them at AI Setup, the fastest way to fill it in.
  const isFreshDraft =
    !loadedProfile && draft.useCase.trim().length === 0 && draft.themes.length === 0;

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Cmd/Ctrl+S → save profile (intercepts the browser's "save page" prompt).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        setSaveAsNew(false);
        setSaveOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openSave(asNew: boolean) {
    setSaveAsNew(asNew);
    setSaveOpen(true);
  }

  function handleResetDraft() {
    if (
      !confirm("Reset this draft to the default settings? Your saved profiles stay as they are.")
    ) {
      return;
    }
    resetDraft();
    toast.success("Draft reset to defaults");
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/40 p-3">
        <div className="flex min-w-0 items-center gap-2">
          {loadedProfile ? (
            <>
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium" title={loadedProfile.name}>
                    {loadedProfile.name}
                  </span>
                  {dirty ? (
                    <Badge variant="warning" className="text-[10px]">
                      Unsaved changes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      Saved
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Loaded profile · edits stay in this draft until you save.
                </div>
              </div>
            </>
          ) : (
            <>
              <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Unsaved configuration</div>
                <div className="text-[11px] text-muted-foreground">
                  Save it as a profile to reuse these settings in future demos.
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setLoadOpen(true)}>
            <FolderOpen className="h-3.5 w-3.5" />
            Load
          </Button>
          {/* AI Setup Assistant — pre-fills context / themes / persona
              distribution / custom variables tailored to the company +
              survey. Placed between Load and Save so it's discoverable
              but visually subordinate to Save (the primary action). */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssistantOpen(true)}
            className="gap-1 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
            title="Fill in these settings automatically from a company name and the selected survey"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Setup
          </Button>
          <Button size="sm" onClick={() => openSave(false)}>
            <Save className="h-3.5 w-3.5" />
            {loadedProfile ? "Save changes" : "Save profile"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More profile actions">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Profiles</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => openSave(true)}>
                <CopyPlus className="h-3.5 w-3.5" />
                Save as new...
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/profiles">
                  <Settings2 className="h-3.5 w-3.5" />
                  Manage all profiles
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clearLoadedSource} disabled={!loadedProfile}>
                Detach loaded profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleResetDraft}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reset draft to defaults
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isFreshDraft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-accent-foreground">
              New here? Let AI Setup fill this in.
            </p>
            <p className="text-xs text-muted-foreground">
              Give it a company name and it drafts the context, themes and persona
              mix for this survey. You review everything before it&apos;s applied.
              Prefer to do it yourself? Start with the Use case context section below.
            </p>
          </div>
          <Button size="sm" onClick={() => setAssistantOpen(true)} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Open AI Setup
          </Button>
        </div>
      )}

      <SaveProfileDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        mode={saveAsNew ? "as-new" : "auto"}
      />
      <LoadProfileDialog open={loadOpen} onOpenChange={setLoadOpen} />
      <SetupAssistantDialog open={assistantOpen} onOpenChange={setAssistantOpen} />
    </>
  );
}
