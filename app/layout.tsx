import type { Metadata, Viewport } from "next";
import { DM_Sans, Roboto_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { CursorAvatarTrail } from "@/components/effects/CursorAvatarTrail";
import { ButtonClickListener } from "@/components/effects/ButtonClickListener";
import "./globals.css";

// Twigs (SurveySparrow's design system) type: DM Sans for UI and headings,
// Roboto Mono for data, labels and code. Twigs ships 400 / 500 / 700.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plumage — Demo data, fully feathered.",
  description:
    "Internal SurveySparrow Presales tool for generating persona-driven, multilingual survey responses for demos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1c" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${robotoMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans">
        <ThemeProvider
          attribute="class"
          // Light mode is the default for first-time visitors (8e). Most
          // demos and screenshares happen on bright displays, so a light
          // baseline reads better in front of customers. `enableSystem`
          // is preserved so a user who prefers dark mode can still flip
          // via the toggle or via OS-level system theme.
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={250}>
            {children}
            {/* Mounted globally — self-disables when not generating and
                when the user hasn't opted in. Off by default. */}
            <CursorAvatarTrail />
            {/* Window-level click listener for the button click chime.
                Catches every interactive element, not just shadcn Buttons.
                Itself silent — playButtonClick gates on the user pref. */}
            <ButtonClickListener />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
