"use client";

import { useState } from "react";
import { useSetupStore } from "@/store/setup-store";
import type { ChannelConfig } from "@/store/setup-store";
import { testSurveySparrowConnection } from "@/lib/setup/connection-tests";
import { RememberKeyToggle } from "@/components/setup/RememberKeyToggle";
import { REGION_LIST, getRegion } from "@/lib/surveysparrow/regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ApiKeyInput } from "@/components/shared/ApiKeyInput";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Lock,
  LockOpen,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// SurveySparrow brand logo — real brand asset from public/brand/.
// Single source of truth for the SS mark across the app (status pill +
// this Setup form). If the brand updates, swap the file at the path below
// and both surfaces pick it up.
// ---------------------------------------------------------------------------

function SurveySparrowLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/surveysparrow-symbol.svg"
      alt="SurveySparrow"
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Weight rebalancing helpers
// ---------------------------------------------------------------------------

/**
 * When a channel's weight is changed, proportionally redistribute the leftover
 * budget among other UNLOCKED channels so the total stays at ~100%.
 * Locked channels are never touched.
 */
function applyWeightChange(
  channels: ChannelConfig[],
  changedId: string,
  rawValue: number,
): ChannelConfig[] {
  const newWeight = Math.max(1, Math.min(98, Math.round(rawValue)));

  const lockedOtherTotal = channels
    .filter((c) => c.id !== changedId && c.locked)
    .reduce((s, c) => s + c.weight, 0);

  const otherUnlocked = channels.filter((c) => c.id !== changedId && !c.locked);

  // Budget remaining for all other unlocked channels
  const budget = Math.max(0, 100 - lockedOtherTotal - newWeight);

  if (otherUnlocked.length === 0) {
    return channels.map((c) => (c.id === changedId ? { ...c, weight: newWeight } : c));
  }

  const currentOtherTotal = otherUnlocked.reduce((s, c) => s + c.weight, 0);
  const newWeights = new Map<string, number>();
  let distributed = 0;

  otherUnlocked.forEach((c, i) => {
    if (i === otherUnlocked.length - 1) {
      newWeights.set(c.id, Math.max(1, budget - distributed));
    } else {
      const ratio =
        currentOtherTotal > 0 ? c.weight / currentOtherTotal : 1 / otherUnlocked.length;
      const w = Math.max(1, Math.round(ratio * budget));
      newWeights.set(c.id, w);
      distributed += w;
    }
  });

  return channels.map((c) => {
    if (c.id === changedId) return { ...c, weight: newWeight };
    const w = newWeights.get(c.id);
    return w !== undefined ? { ...c, weight: w } : c;
  });
}

/** Redistribute budget equally among unlocked channels — used on add/remove. */
function equallyDistribute(channels: ChannelConfig[]): ChannelConfig[] {
  const lockedTotal = channels.filter((c) => c.locked).reduce((s, c) => s + c.weight, 0);
  const unlocked = channels.filter((c) => !c.locked);
  if (unlocked.length === 0) return channels;

  const budget = Math.max(0, 100 - lockedTotal);
  const base = Math.max(1, Math.floor(budget / unlocked.length));
  let remainder = budget - base * unlocked.length;

  return channels.map((c) => {
    if (c.locked) return c;
    const w = base + (remainder-- > 0 ? 1 : 0);
    return { ...c, weight: w };
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConnectionForm() {
  const ss = useSetupStore((s) => s.surveySparrow);
  const setSSField = useSetupStore((s) => s.setSSField);
  const connection = useSetupStore((s) => s.ssConnection);
  const remember = useSetupStore((s) => s.rememberSS);
  const setRemember = useSetupStore((s) => s.setRememberSS);
  const [_lastTestedRegion, setLastTestedRegion] = useState<string | null>(null);

  const validating = connection.status === "validating";
  const canTest = ss.region && ss.apiKey.trim().length > 0 && !validating;

  // Push behavior is an advanced concern — collapsed by default so it doesn't
  // compete with the primary "connect" task. Auto-expanded only if the user
  // has already customized it (so a loaded/edited config stays visible).
  const [pushOpen, setPushOpen] = useState(ss.channelsEnabled || ss.triggerWorkflow);

  // ── Channel helpers ────────────────────────────────────────────────────────

  function addChannel() {
    const existing = ss.channels;
    const newChannel: ChannelConfig = {
      id: crypto.randomUUID(),
      channelId: 0,
      label: "",
      weight: 0, // set below after distribution
      locked: false,
    };
    // Equal split: include new channel in the unlocked pool, then distribute.
    const withNew = equallyDistribute([...existing, newChannel]);
    setSSField("channels", withNew);
  }

  function removeChannel(id: string) {
    const remaining = ss.channels.filter((c) => c.id !== id);
    setSSField("channels", equallyDistribute(remaining));
  }

  function handleWeightChange(id: string, value: number) {
    setSSField("channels", applyWeightChange(ss.channels, id, value));
  }

  function toggleLock(id: string) {
    setSSField(
      "channels",
      ss.channels.map((c) => (c.id === id ? { ...c, locked: !c.locked } : c)),
    );
  }

  function updateChannelField(id: string, patch: Partial<Omit<ChannelConfig, "id" | "weight" | "locked">>) {
    setSSField(
      "channels",
      ss.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  const totalWeight = ss.channels.reduce((s, c) => s + c.weight, 0);

  // ── SS connection test ─────────────────────────────────────────────────────

  async function handleTest() {
    setLastTestedRegion(ss.region);
    await testSurveySparrowConnection();
  }

  const regionMeta = getRegion(ss.region);

  return (
    <Card className="flex h-full flex-col border-border/60 shadow-none">
      <CardHeader className="p-5 pb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Step 1 · Workspace
        </div>
        <CardTitle className="flex items-center gap-2">
          <SurveySparrowLogo className="h-6 w-6 shrink-0" />
          SurveySparrow
          <ConnectionBadge status={connection.status} />
        </CardTitle>
        <CardDescription>
          Use an account-level API key that can access surveys and responses.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 p-5 pt-0">
        {/* Region + Nickname */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ss-region">Data center region</Label>
            <Select
              value={ss.region}
              onValueChange={(v) => setSSField("region", v as typeof ss.region)}
              disabled={validating}
            >
              <SelectTrigger id="ss-region">
                {/* Compact closed state: short code + muted host. The full
                    label/endpoint detail lives in the option rows below. */}
                <SelectValue placeholder="Select region">
                  {regionMeta && (
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium">{regionMeta.shortLabel}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {stripProtocol(regionMeta.baseUrl)}
                      </span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REGION_LIST.map((r) => (
                  <SelectItem key={r.code} value={r.code} className="py-1.5">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium leading-tight">
                        {r.shortLabel}
                      </span>
                      <span className="text-[11px] leading-tight text-muted-foreground">
                        {r.label} · {stripProtocol(r.baseUrl)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ss-nickname">Workspace nickname (optional)</Label>
            <Input
              id="ss-nickname"
              placeholder="e.g. Nexora Production, Demo Sandbox"
              value={ss.workspaceNickname}
              onChange={(e) => setSSField("workspaceNickname", e.target.value)}
              maxLength={40}
            />
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="ss-api-key">API key</Label>
          <ApiKeyInput
            id="ss-api-key"
            placeholder="Paste your SurveySparrow API key"
            value={ss.apiKey}
            onChange={(v) => setSSField("apiKey", v)}
            disabled={validating}
          />
          <RememberKeyToggle
            id="ss-remember"
            checked={remember}
            onCheckedChange={setRemember}
          />
        </div>

        {/* Connection status alerts */}
        {connection.status === "error" && connection.error && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {connection.error}
            </AlertDescription>
          </Alert>
        )}
        {/* Compact success note — the floating ready bar on the page owns
            the "what's next" moment, so this stays a slim confirmation. */}
        {connection.status === "ok" && connection.detail && (
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{connection.detail}</span>
          </div>
        )}

        {/* Push behavior — advanced, collapsed by default (see pushOpen).
            Soft muted container mirrors the LLM card's "Advanced provider
            notes" box so both cards share one advanced-zone treatment. */}
        <div className="rounded-md border bg-muted/30 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setPushOpen((v) => !v)}
            aria-expanded={pushOpen}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Advanced push behavior</p>
              <p className="text-xs text-muted-foreground">
                {ss.triggerWorkflow ? "Workflows on" : "Workflows off"}
                {" · "}
                {ss.channelsEnabled
                  ? `${ss.channels.length} channel${ss.channels.length === 1 ? "" : "s"}`
                  : "Single channel"}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              {pushOpen ? "Hide" : "Customize"}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", pushOpen && "rotate-180")}
              />
            </span>
          </button>

          {pushOpen && (
          <div className="mt-3 space-y-4">
          {/* Trigger workflow toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="trigger-workflow" className="cursor-pointer">
                Trigger workflows
              </Label>
              <p className="text-xs text-muted-foreground">
                When on, pushed responses trigger the survey&apos;s notifications and
                automations. Leave it off for demo data.
              </p>
            </div>
            <Switch
              id="trigger-workflow"
              checked={ss.triggerWorkflow}
              onCheckedChange={(v) => setSSField("triggerWorkflow", v)}
            />
          </div>

          {/* Channel distribution toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="channels-enabled" className="cursor-pointer">
                Channel distribution
              </Label>
              <p className="text-xs text-muted-foreground">
                Split pushed responses across several channels by weight. Lock a channel
                to keep its share fixed while the others adjust.
              </p>
            </div>
            <Switch
              id="channels-enabled"
              checked={ss.channelsEnabled}
              onCheckedChange={(v) => setSSField("channelsEnabled", v)}
            />
          </div>

          {/* Channel list */}
          {ss.channelsEnabled && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              {ss.channels.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No channels yet. Add one below.
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_1fr_7rem_2.5rem_2.5rem] items-center gap-2 px-1">
                    {["Channel ID", "Label", "Weight", "", ""].map((h, i) => (
                      <p
                        key={i}
                        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </p>
                    ))}
                  </div>

                  {/* Channel rows */}
                  {ss.channels.map((ch) => {
                    const pct =
                      totalWeight > 0 ? Math.round((ch.weight / totalWeight) * 100) : 0;
                    return (
                      <div
                        key={ch.id}
                        className="grid grid-cols-[1fr_1fr_7rem_2.5rem_2.5rem] items-center gap-2"
                      >
                        {/* Channel ID */}
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g. 10008161"
                          value={ch.channelId || ""}
                          onChange={(e) =>
                            updateChannelField(ch.id, {
                              channelId: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="h-9 text-sm"
                        />

                        {/* Label */}
                        <Input
                          placeholder="Label (optional)"
                          value={ch.label}
                          onChange={(e) => updateChannelField(ch.id, { label: e.target.value })}
                          className="h-9 text-sm"
                          maxLength={30}
                        />

                        {/* Weight % — input + suffix outside, no overlay */}
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            max={98}
                            value={ch.weight}
                            disabled={ch.locked}
                            onChange={(e) =>
                              handleWeightChange(
                                ch.id,
                                parseInt(e.target.value, 10) || 1,
                              )
                            }
                            className={cn(
                              "h-9 w-16 text-center text-sm tabular-nums",
                              ch.locked && "opacity-60",
                            )}
                          />
                          <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">
                            {pct}%
                          </span>
                        </div>

                        {/* Lock button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-9 w-9 transition-colors",
                            ch.locked
                              ? "text-warning hover:text-warning/80"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => toggleLock(ch.id)}
                          aria-label={ch.locked ? "Unlock this channel" : "Lock this channel"}
                          title={ch.locked ? "Locked. Click to unlock." : "Unlocked. Click to lock."}
                        >
                          {ch.locked ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <LockOpen className="h-4 w-4" />
                          )}
                        </Button>

                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={() => removeChannel(ch.id)}
                          aria-label="Remove channel"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addChannel}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add channel
                </Button>

                {ss.channels.length >= 2 && (
                  <p className="text-[11px] text-muted-foreground">
                    {ss.channels.map((c, i) => {
                      const pct =
                        totalWeight > 0
                          ? Math.round((c.weight / totalWeight) * 100)
                          : 0;
                      const lbl = c.label || (c.channelId ? `#${c.channelId}` : `Ch ${i + 1}`);
                      return (
                        <span key={c.id}>
                          {i > 0 && <span className="mx-1 text-border">·</span>}
                          {c.locked && <Lock className="mr-0.5 inline h-2.5 w-2.5 text-warning" />}
                          {lbl} {pct}%
                        </span>
                      );
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
          </div>
          )}
        </div>

        {/* Footer action row — mt-auto pins it to the card bottom so both
            setup cards share the same footer position. */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Checks your key and region by reading your survey list.
          </p>
          <Button onClick={handleTest} disabled={!canTest}>
            {validating && <Loader2 className="h-4 w-4 animate-spin" />}
            {validating
              ? "Validating..."
              : connection.status === "ok"
                ? "Re-test connection"
                : "Test connection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "https://api.surveysparrow.com" → "api.surveysparrow.com" (display only). */
function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

// ---------------------------------------------------------------------------
// Connection badge
// ---------------------------------------------------------------------------

function ConnectionBadge({ status }: { status: "idle" | "validating" | "ok" | "error" }) {
  if (status === "ok") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  if (status === "validating") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Validating
      </Badge>
    );
  }
  // Idle = no test attempted yet → show nothing. The step checklist above
  // the cards and the header pills already communicate "not connected";
  // repeating it as a third badge was pure noise.
  return null;
}
