"use client";

import { useMemo, useState } from "react";
import { useGenerationStore } from "@/store/generation-store";
import { getSectionOverride } from "@/lib/profiles/dataset-purposes";
import { PriorityBadge } from "@/components/generate/configure/shared/PriorityBadge";
import {
  mergeSystemMetadata,
  type MetadataWeightedOption,
  type SystemMetadataConfig,
} from "@/lib/profiles/types";
import {
  rebalanceToTotal,
  distributeEvenly,
  type WeightedItem,
} from "@/lib/utils/sum-to-total";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertCircle,
  MonitorSmartphone,
  Info,
  Tag,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function optionItems(options: MetadataWeightedOption[]): WeightedItem[] {
  return options.map((o) => ({ key: o.value, value: o.weight }));
}

function applyItems(
  original: MetadataWeightedOption[],
  next: WeightedItem[],
): MetadataWeightedOption[] {
  const byKey = new Map(next.map((i) => [i.key, i.value]));
  return original.map((o) => ({ ...o, weight: byKey.get(o.value) ?? o.weight }));
}

function optionSum(options: MetadataWeightedOption[]): number {
  return options.reduce((s, o) => s + o.weight, 0);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SystemMetadataSection() {
  const rawMetadata = useGenerationStore((s) => s.draft.systemMetadata);
  const setDraft = useGenerationStore((s) => s.setDraft);
  const datasetPurpose = useGenerationStore((s) => s.draft.datasetPurpose);

  // Dataset Purpose can flag a priority badge here. GUIDANCE ONLY — the
  // metadata fields and their behavior are untouched. No purpose reframes
  // this section's title/description today, but the override plumbing is
  // in place for consistency.
  const override = getSectionOverride(datasetPurpose, "metadata");
  const title = override?.label ?? "System metadata";

  // Normalize on read so the component never crashes on stale sessionStorage or
  // old profiles that predate the 3f schema (which have a different shape).
  const metadata = useMemo(() => mergeSystemMetadata(rawMetadata), [rawMetadata]);

  function update(patch: Partial<SystemMetadataConfig>) {
    setDraft((draft) => {
      // Base the write on the merged shape so a single toggle also fixes any
      // missing keys from old data in one pass.
      draft.systemMetadata = { ...mergeSystemMetadata(draft.systemMetadata), ...patch };
    });
  }

  function toggleField(field: keyof SystemMetadataConfig) {
    const current = metadata[field] as { enabled: boolean };
    update({ [field]: { ...current, enabled: !current.enabled } });
  }

  // ---------------------------------------------------------------------------
  // Weighted-options updaters (device_type / browser / os)
  // ---------------------------------------------------------------------------

  function changeOptionWeight(
    field: "device_type" | "browser" | "os",
    value: string,
    raw: string,
  ) {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(100, parsed));
    const current = metadata[field].options;
    const next = applyItems(
      current,
      rebalanceToTotal(optionItems(current), value, clamped, new Set(), 100),
    );
    update({ [field]: { ...metadata[field], options: next } });
  }

  function autoBalanceField(field: "device_type" | "browser" | "os") {
    const current = metadata[field].options;
    const next = applyItems(
      current,
      distributeEvenly(optionItems(current), new Set(), 100),
    );
    update({ [field]: { ...metadata[field], options: next } });
  }

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  const [tagDraft, setTagDraft] = useState("");

  function addTag() {
    const tag = tagDraft.trim();
    if (!tag) return;
    if (metadata.tags.values.includes(tag)) return;
    update({ tags: { ...metadata.tags, values: [...metadata.tags.values, tag] } });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    update({
      tags: { ...metadata.tags, values: metadata.tags.values.filter((t) => t !== tag) },
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section id="metadata" className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="h-4 w-4" />
            {title}
            <PriorityBadge priority={override?.priority} className="font-normal" />
          </CardTitle>
          <CardDescription>
            {override?.description ? (
              override.description
            ) : (
              <>
                Details SurveySparrow records with each response. Set the mix of
                devices, browsers and operating systems, and choose whether to
                add an IP address and tags.
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* device_type */}
          <FieldRow
            label="Device type"
            fieldKey="device_type"
            description="The device the respondent used."
          >
            <WeightedOptionsField
              options={metadata.device_type.options}
              onWeightChange={(val, raw) => changeOptionWeight("device_type", val, raw)}
              onAutoBalance={() => autoBalanceField("device_type")}
            />
          </FieldRow>

          {/* browser */}
          <FieldRow
            label="Browser"
            fieldKey="browser"
            description="The browser the response was submitted from."
          >
            <WeightedOptionsField
              options={metadata.browser.options}
              onWeightChange={(val, raw) => changeOptionWeight("browser", val, raw)}
              onAutoBalance={() => autoBalanceField("browser")}
            />
          </FieldRow>

          {/* os */}
          <FieldRow
            label="Operating system"
            fieldKey="os"
            description="The operating system on the respondent's device."
          >
            <WeightedOptionsField
              options={metadata.os.options}
              onWeightChange={(val, raw) => changeOptionWeight("os", val, raw)}
              onAutoBalance={() => autoBalanceField("os")}
            />
          </FieldRow>

          {/* ip */}
          <FieldRow
            toggle={{ enabled: metadata.ip.enabled, onToggle: () => toggleField("ip") }}
            label="IP address"
            fieldKey="ip"
            description="The IP address recorded with the response."
          >
            <IpField
              mode={metadata.ip.mode}
              fixedIp={metadata.ip.fixedIp}
              onModeChange={(mode) =>
                update({ ip: { ...metadata.ip, mode } })
              }
              onFixedIpChange={(fixedIp) =>
                update({ ip: { ...metadata.ip, fixedIp } })
              }
            />
          </FieldRow>

          {/* tags */}
          <FieldRow
            toggle={{ enabled: metadata.tags.enabled, onToggle: () => toggleField("tags") }}
            label="Tags"
            fieldKey="tags"
            description="Labels added to every generated response in SurveySparrow."
          >
            <TagsField
              values={metadata.tags.values}
              draft={tagDraft}
              onDraftChange={setTagDraft}
              onAdd={addTag}
              onRemove={removeTag}
            />
          </FieldRow>

          <AutoFieldsNote />
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Field row wrapper
// ---------------------------------------------------------------------------

interface FieldRowProps {
  /** Rows with a switch can be left out of the response entirely. Rows
   *  without one (device, browser, OS) are always sent. */
  toggle?: { enabled: boolean; onToggle: () => void };
  label: string;
  fieldKey: string;
  description: string;
  children: React.ReactNode;
}

function FieldRow({ toggle, label, fieldKey, description, children }: FieldRowProps) {
  const enabled = toggle ? toggle.enabled : true;
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        enabled ? "bg-card" : "bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {toggle && (
          <Switch
            checked={toggle.enabled}
            onCheckedChange={toggle.onToggle}
            aria-label={`Include ${label.toLowerCase()}`}
            className="mt-0.5 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <code
                  tabIndex={0}
                  className="cursor-help rounded bg-muted px-1 font-mono text-[11px] text-muted-foreground"
                >
                  {fieldKey}
                </code>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                The field name in SurveySparrow&apos;s response data.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>

          {enabled && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weighted options field (device_type / browser / os)
// ---------------------------------------------------------------------------

interface WeightedOptionsFieldProps {
  options: MetadataWeightedOption[];
  onWeightChange: (value: string, raw: string) => void;
  onAutoBalance: () => void;
}

function WeightedOptionsField({
  options,
  onWeightChange,
  onAutoBalance,
}: WeightedOptionsFieldProps) {
  const sum = optionSum(options);
  const sumOk = sum === 100;

  return (
    <div className="space-y-2">
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {options.map((o) => (
          <div key={o.value} className="flex items-center gap-2">
            <span className="w-20 text-sm">{o.value}</span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="numeric"
                value={o.weight}
                onChange={(e) => onWeightChange(o.value, e.target.value)}
                min={0}
                max={100}
                className="h-7 w-16 px-2 text-right tabular-nums text-xs"
                aria-label={`${o.value} weight`}
              />
              <span className="w-3 text-xs text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        {!sumOk && (
          <span className="flex items-center gap-1 text-[11px] text-warning">
            <AlertCircle className="h-3 w-3" />
            Total is {sum}%. It should be 100%.
          </span>
        )}
        {sumOk && <span />}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={onAutoBalance}
            >
              <Wand2 className="h-3 w-3" />
              Auto-balance
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Split 100% evenly across options.</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fields Plumage always fills in from other sections. Shown as one note
// rather than switches, because they're always sent.
// ---------------------------------------------------------------------------

function AutoFieldsNote() {
  const rows: Array<[string, string]> = [
    ["Survey and browser language", "from the Languages section"],
    ["Time zone", "from each persona's country"],
    ["Submission date and time", "from Responses and timing"],
  ];
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Filled in for you
      </p>
      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        {rows.map(([field, source]) => (
          <li key={field}>
            <span className="font-medium text-foreground">{field}</span> {source}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IP field
// ---------------------------------------------------------------------------

interface IpFieldProps {
  mode: "none" | "coherent" | "fixed";
  fixedIp?: string;
  onModeChange: (mode: "none" | "coherent" | "fixed") => void;
  onFixedIpChange: (ip: string) => void;
}

function IpField({ mode, fixedIp, onModeChange, onFixedIpChange }: IpFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5">
        <RadioOption
          selected={mode === "none"}
          label="None"
          description="Don't send an IP address."
          onSelect={() => onModeChange("none")}
        />
        <RadioOption
          selected={mode === "coherent"}
          label="Coherent"
          description="Give each persona an IP address from its own country."
          onSelect={() => onModeChange("coherent")}
        />
        <RadioOption
          selected={mode === "fixed"}
          label="Fixed"
          description="Use the same IP address for every response."
          onSelect={() => onModeChange("fixed")}
        />
      </div>
      {mode === "fixed" && (
        <Input
          value={fixedIp ?? ""}
          onChange={(e) => onFixedIpChange(e.target.value)}
          placeholder="e.g. 203.0.113.42"
          className="h-8 font-mono text-sm"
          autoFocus
        />
      )}
      {(mode === "coherent" || mode === "fixed") && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Turn on IP address collection in the survey&apos;s settings in
            SurveySparrow. If it&apos;s off there, SurveySparrow ignores the IP.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tags field
// ---------------------------------------------------------------------------

interface TagsFieldProps {
  values: string[];
  draft: string;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (tag: string) => void;
}

function TagsField({ values, draft, onDraftChange, onAdd, onRemove }: TagsFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium"
          >
            <Tag className="h-2.5 w-2.5 text-muted-foreground" />
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="ml-0.5 text-muted-foreground hover:text-destructive"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">No tags yet.</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Add a tag…"
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={!draft.trim()}
        >
          Add
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The{" "}
        <code className="rounded bg-muted px-1 font-mono">plumage-YYYY-MM</code> tag
        lets you find demo responses later and delete them.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared radio-option button
// ---------------------------------------------------------------------------

interface RadioOptionProps {
  selected: boolean;
  label: string;
  description: string;
  onSelect: () => void;
}

function RadioOption({ selected, label, description, onSelect }: RadioOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors",
        selected
          ? "border-primary/50 bg-primary/5"
          : "hover:border-muted-foreground/30 hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-primary" : "border-muted-foreground/50",
        )}
      >
        {selected && (
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </span>
      <span>
        <span className="text-xs font-medium">{label}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}
