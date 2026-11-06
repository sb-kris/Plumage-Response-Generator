/* eslint-disable @next/next/no-img-element -- static brand SVG, no optimisation needed */

/**
 * Site footer: SurveySparrow attribution on the left, maker credit on the
 * right. Stacks on narrow screens.
 */
export function AppFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground sm:flex-row">
        <a
          href="https://surveysparrow.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span>Powered by</span>
          <img
            src="/brand/surveysparrow-symbol.svg"
            alt=""
            aria-hidden="true"
            width={14}
            height={15}
            className="h-[15px] w-auto"
          />
          <span className="font-semibold text-foreground/80 group-hover:text-foreground">
            SurveySparrow
          </span>
        </a>
        <p>
          Made by <span className="font-medium text-foreground/80">Sujith Balakrishnan</span>
        </p>
      </div>
    </footer>
  );
}
