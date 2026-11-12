"use client";

import React, { useState } from "react";
import { useSetupStore } from "@/store/setup-store";
import { testLLMConnection } from "@/lib/setup/connection-tests";
import { RememberKeyToggle } from "@/components/setup/RememberKeyToggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ApiKeyInput } from "@/components/shared/ApiKeyInput";
import { ModelSelector } from "./ModelSelector";
import { ProviderSelect } from "./ProviderSelect";
import { ProviderIcon } from "@/components/shared/ProviderIcon";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Info,
  ShieldAlert,
} from "lucide-react";
import { getModelsByProvider, getProviderMeta, type LLMProvider } from "@/lib/llm/models";

// ---------------------------------------------------------------------------
// Custom-model-ID input for OpenRouter
// ---------------------------------------------------------------------------

interface CustomModelIdRowProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function CustomModelIdRow({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: CustomModelIdRowProps) {
  return (
    <div className="mt-2 space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "e.g. anthropic/claude-3.5-haiku"}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        className="font-mono text-xs"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LLMConfigForm() {
  const llm = useSetupStore((s) => s.llm);
  const setProvider = useSetupStore((s) => s.setLLMProvider);
  const setApiKey = useSetupStore((s) => s.setLLMApiKey);
  const setPersonaModel = useSetupStore((s) => s.setLLMPersonaModel);
  const setResponseModel = useSetupStore((s) => s.setLLMResponseModel);
  const setCustomPersonaModelId = useSetupStore((s) => s.setLLMCustomPersonaModelId);
  const setCustomResponseModelId = useSetupStore((s) => s.setLLMCustomResponseModelId);
  const connection = useSetupStore((s) => s.llmConnection);
  const remember = useSetupStore((s) => s.rememberLLM);
  const setRemember = useSetupStore((s) => s.setRememberLLM);

  const validating = connection.status === "validating";
  const meta = getProviderMeta(llm.provider);
  const providerLabel = meta.label;

  // Whether we need (and have) a custom OpenRouter model ID for either kind.
  const personaNeedsCustomId =
    llm.provider === "openrouter" && llm.personaModel === "openrouter:custom";
  const responseNeedsCustomId =
    llm.provider === "openrouter" && llm.responseModel === "openrouter:custom";
  const customIdsSatisfied =
    (!personaNeedsCustomId || llm.customPersonaModelId.trim().length > 0) &&
    (!responseNeedsCustomId || llm.customResponseModelId.trim().length > 0);

  const canTest = !validating && llm.apiKey.trim().length > 0 && customIdsSatisfied;

  // Collapsible advanced notes (risk + free-tier warning, when present).
  const [notesOpen, setNotesOpen] = useState(false);

  async function handleTest() {
    await testLLMConnection();
  }

  return (
    <Card className="flex h-full flex-col border-border/60 shadow-none">
      <CardHeader className="space-y-1 p-5 pb-4">
        <CardTitle className="flex items-center gap-2">
          <ProviderIcon provider={llm.provider} className="h-6 w-6 shrink-0" />
          AI provider
          <ConnectionBadge status={connection.status} />
        </CardTitle>
        <CardDescription>
          Plumage uses this to create personas and write their answers.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 p-5 pt-0">
        {/* Provider dropdown — replaces the old 6-card grid. */}
        <div className="space-y-2">
          <Label htmlFor="llm-provider">Provider</Label>
          <ProviderSelect
            id="llm-provider"
            value={llm.provider}
            onChange={setProvider}
            disabled={validating}
          />
        </div>

        {/* API key */}
        <div className="space-y-2">
          <Label htmlFor="llm-api-key">{providerLabel} API key</Label>
          <ApiKeyInput
            id="llm-api-key"
            placeholder={placeholderForProvider(llm.provider)}
            value={llm.apiKey}
            onChange={setApiKey}
            disabled={validating}
          />
          <p className="text-xs text-muted-foreground">{meta.apiKeyHint}</p>
          <RememberKeyToggle
            id="llm-remember"
            checked={remember}
            onCheckedChange={setRemember}
          />

          {/* Provider risk + free-tier notes (collapsible if any). */}
          {(meta.riskNote || meta.freeTierWarning) && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left font-medium text-foreground"
                aria-expanded={notesOpen}
              >
                <span className="flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  Advanced provider notes
                </span>
                <span className="text-muted-foreground">
                  {notesOpen ? "Hide" : "Show"}
                </span>
              </button>
              {notesOpen && (
                <div className="mt-2 space-y-1.5 text-muted-foreground">
                  {meta.riskNote && (
                    <div className="flex items-start gap-1.5">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <span>{meta.riskNote}</span>
                    </div>
                  )}
                  {meta.freeTierWarning && (
                    <div className="flex items-start gap-1.5">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{meta.freeTierWarning}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Model selectors — side by side whenever the card is wide enough:
            md viewport when the cards are stacked, xl when they sit in the
            two-column Setup grid (each card ≈ half the page). */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="space-y-1">
            <ModelSelector
              id="persona-model"
              label="Persona model"
              description="Builds synthetic respondent profiles."
              kind="personas"
              provider={llm.provider}
              value={llm.personaModel}
              onChange={setPersonaModel}
              disabled={validating}
            />
            {personaNeedsCustomId && (
              <CustomModelIdRow
                id="persona-custom-id"
                label="OpenRouter model ID"
                value={llm.customPersonaModelId}
                onChange={setCustomPersonaModelId}
                disabled={validating}
                placeholder="e.g. anthropic/claude-3.5-haiku"
              />
            )}
          </div>
          <div className="space-y-1">
            <ModelSelector
              id="response-model"
              label="Response model"
              description="Writes survey answers for each persona."
              kind="responses"
              provider={llm.provider}
              value={llm.responseModel}
              onChange={setResponseModel}
              disabled={validating}
            />
            {responseNeedsCustomId && (
              <CustomModelIdRow
                id="response-custom-id"
                label="OpenRouter model ID"
                value={llm.customResponseModelId}
                onChange={setCustomResponseModelId}
                disabled={validating}
                placeholder="e.g. anthropic/claude-3.5-sonnet"
              />
            )}
          </div>
        </div>

        {/* Connection feedback */}
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

        {/* Footer action row — mt-auto pins it to the card bottom so both
            setup cards share the same footer position. */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Sends one tiny request to the persona model (under $0.0001).
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
// API-key placeholders per provider
// ---------------------------------------------------------------------------

function placeholderForProvider(provider: LLMProvider): string {
  switch (provider) {
    case "anthropic":
      return "sk-ant-...";
    case "openai":
      return "sk-...";
    case "google":
      return "AIza...";
    case "deepseek":
      return "sk-...";
    case "groq":
      return "gsk_...";
    case "openrouter":
      return "sk-or-...";
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Connection badge
// ---------------------------------------------------------------------------

function ConnectionBadge({
  status,
}: {
  status: "idle" | "validating" | "ok" | "error";
}) {
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
