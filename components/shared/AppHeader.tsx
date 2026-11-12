"use client";

import { ConnectionStatusBar } from "./ConnectionStatusBar";
import { PlumageWordmark } from "./Wordmark";
import { PreferencesMenu } from "./PreferencesMenu";
import { ThemeToggle } from "./ThemeToggle";
import { NavLinks } from "./NavLinks";

export function AppHeader() {
  return (
    <header
      className={
        // Glass treatment — softer border, stronger blur, lower opacity
        // when backdrop-filter is supported so the page content underneath
        // visibly fogs through. Falls back to a solid-ish background on
        // browsers that don't support backdrop-filter.
        "sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50"
      }
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
        {/* Left cluster: wordmark + nav. Replaced the vertical separator with
            whitespace — the separator felt heavy and the gap reads as a
            visual divider on its own. */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3 lg:gap-6">
          <PlumageWordmark />
          <NavLinks />
        </div>
        {/* Right cluster: connection pills, then a thin border-l divider
            separating status info from theme controls. Password auth was
            removed (Plumage relies on the SS/LLM credentials the user
            enters on the Setup page, which live in browser memory only). */}
        {/* Narrow screens: the connection pills drop out (the Setup cards
            show the same status) so the header never scrolls sideways. */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden md:block">
            <ConnectionStatusBar />
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 md:ml-1 md:border-l md:pl-3">
            <PreferencesMenu />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
