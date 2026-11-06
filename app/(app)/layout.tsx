import { AppHeader } from "@/components/shared/AppHeader";
import { GenerationRunningBanner } from "@/components/shared/GenerationRunningBanner";
import { AppFooter } from "@/components/shared/AppFooter";
import { ConnectionRestorer } from "@/components/setup/ConnectionRestorer";

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ConnectionRestorer />
      <AppHeader />
      <GenerationRunningBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      <AppFooter />
    </div>
  );
}
