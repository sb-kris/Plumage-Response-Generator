"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SurveySparrowRegion } from "@/lib/surveysparrow/regions";
import type { LLMProvider } from "@/lib/llm/models";
import { getProviderDefaultModels } from "@/lib/llm/models";

// API KEYS: in memory by default, and saved ONLY when the user opts in.
// Each service has its own "Remember on this device" switch (rememberSS /
// rememberLLM), matching the Weave importer. When a switch is on, that
// service's settings, key included, go to localStorage (plain text, this
// browser only). Turning it off rewrites storage without them, which deletes
// the saved key. Connection status is never saved: remembered keys are
// re-tested on load by ConnectionRestorer.
//
// skipHydration: the saved values are loaded after mount (ConnectionRestorer
// calls persist.rehydrate()), so the server render and first client render
// match and no hydration warnings fire.

export type ConnectionStatus = "idle" | "validating" | "ok" | "error";

export interface ChannelConfig {
  /** React key — not sent to the API. */
  id: string;
  channelId: number;
  label: string;
  /** Percentage weight (1–99). All channels should sum to ~100. */
  weight: number;
  /** When true, auto-rebalance never mutates this channel's weight. */
  locked: boolean;
}

export interface ConnectionState {
  status: ConnectionStatus;
  // The error message returned by the API on failure
  error: string | null;
  // Wall-clock timestamp (ms) of the last successful test
  lastSuccessAt: number | null;
  // Optional human-readable detail shown on success (e.g. "Found 12 surveys")
  detail: string | null;
}

const idleConnection: ConnectionState = {
  status: "idle",
  error: null,
  lastSuccessAt: null,
  detail: null,
};

interface SurveySparrowConfig {
  region: SurveySparrowRegion;
  apiKey: string;
  workspaceNickname: string;
  /** When true, push events fire survey notification/automation rules. Default: false. */
  triggerWorkflow: boolean;
  /** When true, responses are distributed across `channels` by weight. */
  channelsEnabled: boolean;
  channels: ChannelConfig[];
}

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  personaModel: string;
  responseModel: string;
  /** OpenRouter only — actual upstream ID when `personaModel` is `openrouter:custom`. */
  customPersonaModelId: string;
  /** OpenRouter only — actual upstream ID when `responseModel` is `openrouter:custom`. */
  customResponseModelId: string;
}

interface SetupStore {
  surveySparrow: SurveySparrowConfig;
  llm: LLMConfig;
  ssConnection: ConnectionState;
  llmConnection: ConnectionState;
  /** Opt-in: save the SurveySparrow settings and key in this browser. */
  rememberSS: boolean;
  /** Opt-in: save the AI provider settings and key in this browser. */
  rememberLLM: boolean;
  setRememberSS: (v: boolean) => void;
  setRememberLLM: (v: boolean) => void;

  // SurveySparrow
  setSSField: <K extends keyof SurveySparrowConfig>(key: K, value: SurveySparrowConfig[K]) => void;
  setSSConnection: (state: Partial<ConnectionState>) => void;

  // LLM
  setLLMProvider: (provider: LLMProvider) => void;
  setLLMApiKey: (apiKey: string) => void;
  setLLMPersonaModel: (model: string) => void;
  setLLMResponseModel: (model: string) => void;
  setLLMCustomPersonaModelId: (id: string) => void;
  setLLMCustomResponseModelId: (id: string) => void;
  setLLMConnection: (state: Partial<ConnectionState>) => void;

  reset: () => void;
}

const defaultSS: SurveySparrowConfig = {
  region: "us",
  apiKey: "",
  workspaceNickname: "",
  triggerWorkflow: false,
  channelsEnabled: false,
  channels: [],
};

// Default provider: OpenAI — the current preferred cost/quality default for
// Plumage (GPT-4o Mini personas + GPT-4.1 Mini responses via the registry's
// defaultForPersona/defaultForResponse flags). The store is in-memory only,
// so this default applies to fresh tabs; a provider picked during a session
// is never overridden. The "Recommended" badge treatment stays on Google
// Gemini (cheapest bulk option) via ProviderSelect.
const DEFAULT_PROVIDER: LLMProvider = "openai";
const defaultDefaultModels = getProviderDefaultModels(DEFAULT_PROVIDER);
const defaultLLM: LLMConfig = {
  provider: DEFAULT_PROVIDER,
  apiKey: "",
  personaModel: defaultDefaultModels.personaModel,
  responseModel: defaultDefaultModels.responseModel,
  customPersonaModelId: "",
  customResponseModelId: "",
};

type PersistedSetup = Partial<
  Pick<SetupStore, "rememberSS" | "rememberLLM" | "surveySparrow" | "llm">
>;

export const useSetupStore = create<SetupStore>()(
  persist(
    (set) => ({
  surveySparrow: defaultSS,
  llm: defaultLLM,
  ssConnection: idleConnection,
  llmConnection: idleConnection,
  rememberSS: false,
  rememberLLM: false,
  setRememberSS: (v) => set({ rememberSS: v }),
  setRememberLLM: (v) => set({ rememberLLM: v }),

  setSSField: (key, value) =>
    set((s) => {
      const next = { ...s.surveySparrow, [key]: value };
      // These fields don't affect API auth — changing them keeps the connection valid.
      const affectsConnection =
        key !== "workspaceNickname" &&
        key !== "triggerWorkflow" &&
        key !== "channelsEnabled" &&
        key !== "channels";
      const ssConnection =
        affectsConnection &&
        (s.ssConnection.status === "ok" || s.ssConnection.status === "error")
          ? idleConnection
          : s.ssConnection;
      return { surveySparrow: next, ssConnection };
    }),
  setSSConnection: (state) =>
    set((s) => ({ ssConnection: { ...s.ssConnection, ...state } })),

  setLLMProvider: (provider) =>
    set((s) => {
      const defaults = getProviderDefaultModels(provider);
      return {
        llm: {
          ...s.llm,
          provider,
          // API key is per-provider sensitive — never carry one across.
          // Keeping it cleared per provider is also the security-correct
          // default since the test-connection state we just invalidated is
          // tied to the previous key anyway.
          apiKey: "",
          personaModel: defaults.personaModel,
          responseModel: defaults.responseModel,
          // OpenRouter sentinel fields are reset whenever the provider
          // changes — they only have meaning under OpenRouter.
          customPersonaModelId: "",
          customResponseModelId: "",
        },
        llmConnection: idleConnection,
      };
    }),
  setLLMApiKey: (apiKey) =>
    set((s) => ({
      llm: { ...s.llm, apiKey },
      llmConnection:
        s.llmConnection.status === "ok" || s.llmConnection.status === "error"
          ? idleConnection
          : s.llmConnection,
    })),
  setLLMPersonaModel: (model) =>
    set((s) => ({
      llm: {
        ...s.llm,
        personaModel: model,
        // If user moves OFF the custom sentinel, the custom ID is no longer
        // meaningful — clear it so a stale value doesn't sneak into a request.
        customPersonaModelId:
          model === "openrouter:custom" ? s.llm.customPersonaModelId : "",
      },
      llmConnection:
        s.llmConnection.status === "ok" || s.llmConnection.status === "error"
          ? idleConnection
          : s.llmConnection,
    })),
  setLLMResponseModel: (model) =>
    set((s) => ({
      llm: {
        ...s.llm,
        responseModel: model,
        customResponseModelId:
          model === "openrouter:custom" ? s.llm.customResponseModelId : "",
      },
      llmConnection:
        s.llmConnection.status === "ok" || s.llmConnection.status === "error"
          ? idleConnection
          : s.llmConnection,
    })),
  setLLMCustomPersonaModelId: (id) =>
    set((s) => ({
      llm: { ...s.llm, customPersonaModelId: id },
      // Changing the upstream ID invalidates the previous test result.
      llmConnection:
        s.llmConnection.status === "ok" || s.llmConnection.status === "error"
          ? idleConnection
          : s.llmConnection,
    })),
  setLLMCustomResponseModelId: (id) =>
    set((s) => ({
      llm: { ...s.llm, customResponseModelId: id },
      llmConnection:
        s.llmConnection.status === "ok" || s.llmConnection.status === "error"
          ? idleConnection
          : s.llmConnection,
    })),
  setLLMConnection: (state) =>
    set((s) => ({ llmConnection: { ...s.llmConnection, ...state } })),

  reset: () =>
    set({
      surveySparrow: defaultSS,
      llm: defaultLLM,
      ssConnection: idleConnection,
      llmConnection: idleConnection,
      rememberSS: false,
      rememberLLM: false,
    }),
    }),
    {
      name: "plumage:setup:v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Only remembered services are written. Unticking a switch drops that
      // service from storage on the next write, which deletes the saved key.
      partialize: (s): PersistedSetup => ({
        rememberSS: s.rememberSS,
        rememberLLM: s.rememberLLM,
        ...(s.rememberSS ? { surveySparrow: s.surveySparrow } : {}),
        ...(s.rememberLLM ? { llm: s.llm } : {}),
      }),
      // Layer saved values over the defaults so fields added later still get
      // a value. Connection status always starts idle.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as PersistedSetup;
        return {
          ...current,
          rememberSS: p.rememberSS ?? false,
          rememberLLM: p.rememberLLM ?? false,
          surveySparrow: p.surveySparrow
            ? { ...current.surveySparrow, ...p.surveySparrow }
            : current.surveySparrow,
          llm: p.llm ? { ...current.llm, ...p.llm } : current.llm,
        };
      },
      version: 1,
    },
  ),
);

/**
 * True once remembered settings have been loaded from localStorage (or there
 * were none). Lets pages show "Checking your connections…" instead of flashing a
 * "connect first" warning while saved keys are being loaded and re-tested.
 */
export function useSetupHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(useSetupStore.persist.hasHydrated());
    return useSetupStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
