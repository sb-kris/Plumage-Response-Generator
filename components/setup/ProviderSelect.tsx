"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ProviderIcon } from "@/components/shared/ProviderIcon";
import { Sparkles, ShieldAlert } from "lucide-react";
import {
  LLM_PROVIDERS,
  getProviderMeta,
  type LLMProvider,
} from "@/lib/llm/models";
import { cn } from "@/lib/utils";

/** Visually highlight ONE provider as "recommended for most SEs". Kept in
 *  sync with the cost-estimator's recommendation: Google Gemini is the
 *  cost-sensitive default surfaced to new SEs. We don't auto-switch the
 *  store's default provider — backward compatibility with existing Anthropic
 *  test flows matters more — we only surface the recommendation visually. */
const RECOMMENDED_PROVIDER: LLMProvider = "google";

interface ProviderSelectProps {
  id?: string;
  value: LLMProvider;
  onChange: (provider: LLMProvider) => void;
  disabled?: boolean;
}

/**
 * Compact provider picker — replaces the old 6-card grid. One row of
 * trigger instead of two rows of cards; the same metadata (icon, accent
 * color, blurb, recommended / use-with-care flags) moves into the trigger
 * and option rows. Selection behavior is unchanged: onChange feeds the
 * store's setLLMProvider, which handles model-default resets.
 */
export function ProviderSelect({ id, value, onChange, disabled }: ProviderSelectProps) {
  const meta = getProviderMeta(value);
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as LLMProvider)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="[&>span]:min-w-0 [&>span]:flex-1">
        {/* Closed state stays a single compact row: icon + name + badge +
            muted blurb. The two-line detail lives in the option rows. */}
        <SelectValue placeholder="Select a provider">
          <span className="flex min-w-0 items-center gap-2">
            <ProviderIcon provider={value} className="h-4 w-4 shrink-0" />
            <span className={cn("shrink-0 text-sm font-semibold", meta.accentClass)}>
              {meta.label}
            </span>
            {value === RECOMMENDED_PROVIDER && (
              <Badge
                variant="success"
                className="h-4 shrink-0 gap-0.5 px-1.5 text-[10px] font-medium leading-none"
              >
                <Sparkles className="h-2.5 w-2.5" />
                Recommended
              </Badge>
            )}
            <span className="hidden truncate text-xs font-normal text-muted-foreground sm:inline">
              {meta.blurb}
            </span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LLM_PROVIDERS.map((p) => (
          <SelectItem key={p} value={p} className="py-1.5">
            <ProviderOptionRow provider={p} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProviderOptionRow({ provider }: { provider: LLMProvider }) {
  const meta = getProviderMeta(provider);
  const isRecommended = provider === RECOMMENDED_PROVIDER;
  const hasRisk = Boolean(meta.riskNote);

  return (
    <span className="flex min-w-0 flex-col gap-0.5 text-left">
      <span className="flex items-center gap-2">
        <ProviderIcon provider={provider} className="h-4 w-4 shrink-0" />
        <span className={cn("text-sm font-semibold", meta.accentClass)}>
          {meta.label}
        </span>
        {isRecommended && (
          <Badge
            variant="success"
            className="h-4 gap-0.5 px-1.5 text-[10px] font-medium leading-none"
          >
            <Sparkles className="h-2.5 w-2.5" />
            Recommended
          </Badge>
        )}
        {hasRisk && (
          <Badge
            variant="outline"
            className="h-4 gap-0.5 border-warning/30 bg-warning/10 px-1.5 text-[10px] font-medium leading-none text-warning"
          >
            <ShieldAlert className="h-2.5 w-2.5" />
            Use with care
          </Badge>
        )}
      </span>
      <span className="block truncate text-xs font-normal text-muted-foreground">
        {meta.blurb}
      </span>
    </span>
  );
}
