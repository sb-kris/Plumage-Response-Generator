"use client";

import { useEffect, useState } from "react";
import { MousePointerClick, SlidersHorizontal, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePreferencesStore } from "@/store/preferences-store";

// Header preferences menu: the opt-in effects (cursor trail, sounds).
//
// This replaced the old colour-theme picker when Plumage moved to the Twigs
// design system with exactly one light and one dark palette. Light/dark stays
// on its own toggle (ThemeToggle).

/** localStorage key + <html> classes left behind by the retired colour themes. */
const LEGACY_THEME_KEY = "plumage-color-theme";
const LEGACY_THEME_CLASSES = ["theme-graphite", "theme-cobalt", "theme-crimson", "theme-indigo"];

export function PreferencesMenu() {
  const [mounted, setMounted] = useState(false);
  const cursorEffects = usePreferencesStore((s) => s.cursorEffects);
  const setCursorEffects = usePreferencesStore((s) => s.setCursorEffects);
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const setSoundEnabled = usePreferencesStore((s) => s.setSoundEnabled);
  const clickSoundEnabled = usePreferencesStore((s) => s.clickSoundEnabled);
  const setClickSoundEnabled = usePreferencesStore((s) => s.setClickSoundEnabled);

  useEffect(() => {
    // One-time cleanup for browsers that picked a retired colour theme.
    document.documentElement.classList.remove(...LEGACY_THEME_CLASSES);
    try {
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch {
      // localStorage unavailable (private browsing) — nothing to clean.
    }
    setMounted(true);
  }, []);

  // Same-size invisible placeholder until mounted: avoids layout shift and a
  // hydration mismatch on the persisted checkbox states.
  if (!mounted) {
    return <Button variant="ghost" size="icon" disabled className="opacity-0" aria-hidden />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Preferences">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="sr-only">Preferences</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Effects
        </DropdownMenuLabel>

        {/* Cursor breadcrumbs — opt-in. */}
        <DropdownMenuCheckboxItem
          checked={cursorEffects}
          onCheckedChange={setCursorEffects}
          onSelect={(e) => e.preventDefault()}
          className="gap-2.5 py-2"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-none">Cursor breadcrumbs</span>
            <span className="mt-0.5 text-xs leading-tight text-muted-foreground">
              Persona faces drift behind your cursor while generating.
            </span>
          </div>
        </DropdownMenuCheckboxItem>

        {/* Push-complete + connection chimes — off by default (screen-shares). */}
        <DropdownMenuCheckboxItem
          checked={soundEnabled}
          onCheckedChange={setSoundEnabled}
          onSelect={(e) => e.preventDefault()}
          className="gap-2.5 py-2"
        >
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-none">Status chimes</span>
            <span className="mt-0.5 text-xs leading-tight text-muted-foreground">
              Plays a short sound when a push finishes or a connection test
              passes or fails.
            </span>
          </div>
        </DropdownMenuCheckboxItem>

        {/* Button click sounds — off by default. */}
        <DropdownMenuCheckboxItem
          checked={clickSoundEnabled}
          onCheckedChange={setClickSoundEnabled}
          onSelect={(e) => e.preventDefault()}
          className="gap-2.5 py-2"
        >
          <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-none">Button click sounds</span>
            <span className="mt-0.5 text-xs leading-tight text-muted-foreground">
              Soft mechanical click on every button.
            </span>
          </div>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
