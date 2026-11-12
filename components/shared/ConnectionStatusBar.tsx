"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSetupStore, type ConnectionState } from "@/store/setup-store";
import { getProviderLabel } from "@/lib/llm/models";
import { formatRelativeTime, cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { XCircle, Loader2, Circle, Clock } from "lucide-react";
import { ProviderIcon } from "./ProviderIcon";

const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes

interface DotProps {
  state: ConnectionState;
  /** Short label rendered in the pill (kept under ~3 chars for compact width). */
  label: string;
  /** Full label used in tooltips. Defaults to `label` if the abbreviation is
   *  already clear. The pill stays compact; the tooltip stays informative. */
  tooltipLabel?: string;
  // Optional identifier shown after the label (the connected account name).
  nickname?: string;
  // Longer form for the tooltip (e.g. "Nexora Living · nexora.surveysparrow.com").
  nicknameDetail?: string;
  /** Brand symbol shown before the status indicator when status is "ok"
   *  (and the connection isn't stale). Tiny reminder of "plugged into X". */
  brandSymbolSrc?: string;
  /** Alt text for the brand symbol — used by screen readers. */
  brandSymbolAlt?: string;
  /** Pre-rendered brand symbol node — used when the icon needs to inherit
   *  currentColor (e.g. provider monogram icons). Takes precedence over
   *  brandSymbolSrc when both are provided. */
  brandSymbolNode?: React.ReactNode;
  /** Connected account's own logo (any https host). When the pill shows an
   *  account name, this replaces the brand symbol; falls back to it if
   *  missing or broken. */
  accountLogoUrl?: string | null;
}

// Pulsing heartbeat dot for "connected" status — soft outer ring expands and
// fades on a 3s cadence (3s reads as a heartbeat; 1s default would feel
// anxious). Inner dot stays solid green so the state is unambiguous even
// when the pulse is mid-fade.
function PulsingDot() {
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden"
        style={{ animationDuration: "3s" }}
      />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
    </span>
  );
}

function StatusDot({
  state,
  label,
  tooltipLabel,
  nickname,
  nicknameDetail,
  brandSymbolSrc,
  brandSymbolAlt,
  brandSymbolNode,
  accountLogoUrl,
}: DotProps) {
  const fullLabel = tooltipLabel ?? label;
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [accountLogoUrl]);
  // Tick periodically so relative time stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    if (state.status !== "ok") return;
    const id = setInterval(() => force((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, [state.status]);

  const stale =
    state.status === "ok" &&
    state.lastSuccessAt !== null &&
    Date.now() - state.lastSuccessAt > STALE_AFTER_MS;

  let icon: React.ReactNode;
  let color = "";
  let tooltip = "";

  switch (state.status) {
    case "validating":
      icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      color = "text-muted-foreground";
      tooltip = `${fullLabel}: validating...`;
      break;
    case "ok":
      if (stale) {
        icon = <Clock className="h-3.5 w-3.5" />;
        color = "text-warning";
        tooltip = `${fullLabel}: last tested ${formatRelativeTime(state.lastSuccessAt)}. Click Re-test connection on the Setup page to check it still works.`;
      } else {
        // Pulsing heartbeat dot — feels alive on the page without being noisy.
        icon = <PulsingDot />;
        color = "text-success";
        tooltip = `${fullLabel}: connected (tested ${formatRelativeTime(state.lastSuccessAt)})`;
      }
      break;
    case "error":
      icon = <XCircle className="h-3.5 w-3.5" />;
      color = "text-destructive";
      tooltip = `${fullLabel}: ${state.error ?? "connection failed"}`;
      break;
    default:
      icon = <Circle className="h-3.5 w-3.5" />;
      color = "text-muted-foreground/60";
      tooltip = `${fullLabel}: not connected yet`;
  }

  // Compact summary — pill width matters more than verbosity here. Full
  // context lives in the tooltip if the user wants it.
  const summary =
    state.status === "ok"
      ? formatRelativeTime(state.lastSuccessAt)
      : state.status === "validating"
        ? "…"
        : state.status === "error"
          ? "failed"
          : "—";

  // Account mode: once connected and the account is known, the pill is just
  // [logo] [status] [account name]. The short label and relative time move
  // to the tooltip.
  const showNickname = Boolean(nickname && nickname.trim().length > 0 && state.status === "ok");
  const useAccountLogo = showNickname && Boolean(accountLogoUrl) && !logoFailed;
  // Brand symbol appears when connected and fresh, and always in account
  // mode (it identifies the account, not the health; the dot does that).
  const showBrandSymbol =
    (brandSymbolNode || brandSymbolSrc) && state.status === "ok" && (!stale || showNickname);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border bg-card/50 px-2 py-1 text-xs",
            color,
          )}
        >
          {useAccountLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote account logo, any host
            <img
              src={accountLogoUrl!}
              alt=""
              aria-hidden
              className="h-4 w-4 rounded-sm object-contain"
              onError={() => setLogoFailed(true)}
            />
          ) : showBrandSymbol && (
            brandSymbolNode ? (
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center opacity-90">
                {brandSymbolNode}
              </span>
            ) : (
              <Image
                src={brandSymbolSrc!}
                alt={brandSymbolAlt ?? ""}
                width={14}
                height={14}
                className="h-3.5 w-3.5 opacity-90"
                aria-hidden={brandSymbolAlt ? undefined : true}
              />
            )
          )}
          {icon}
          {showNickname ? (
            <span className="max-w-[160px] shrink-0 truncate font-medium text-foreground">
              {nickname}
            </span>
          ) : (
            <>
              <span className="font-medium text-foreground">{label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{summary}</span>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {tooltip}
        {showNickname && (
          <span className="block opacity-80">Account: {nicknameDetail ?? nickname}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function ConnectionStatusBar() {
  const ssConnection = useSetupStore((s) => s.ssConnection);
  const ssAccount = useSetupStore((s) => s.ssConnection.account ?? null);
  const ssNickname = ssAccount ? ssAccount.companyName || ssAccount.domain : undefined;
  const ssNicknameDetail =
    ssAccount && ssAccount.companyName && ssAccount.domain
      ? `${ssAccount.companyName} · ${ssAccount.domain}`
      : ssNickname;
  const llmConnection = useSetupStore((s) => s.llmConnection);
  const provider = useSetupStore((s) => s.llm.provider);
  const llmLabel = getProviderLabel(provider);

  return (
    <div className="flex items-center gap-2">
      {/* Pill labels are abbreviated to keep header width predictable —
          tooltips still spell out "SurveySparrow" for clarity. */}
      <StatusDot
        state={ssConnection}
        label="SS"
        tooltipLabel="SurveySparrow"
        nickname={ssNickname}
        nicknameDetail={ssNicknameDetail}
        accountLogoUrl={ssAccount?.logoUrl ?? null}
        brandSymbolSrc="/brand/surveysparrow-symbol.svg"
        brandSymbolAlt="SurveySparrow"
      />
      <StatusDot
        state={llmConnection}
        label={llmLabel}
        brandSymbolNode={<ProviderIcon provider={provider} className="h-3 w-3" />}
      />
    </div>
  );
}
