"use client";

import { toast } from "sonner";
import { useSetupStore, type SSAccount } from "@/store/setup-store";
import { loggedFetch } from "@/store/api-logs-store";
import { playErrorChime, playSuccessChime } from "@/lib/effects/sound-effects";
import { getModelsByProvider, getProviderMeta } from "@/lib/llm/models";

// The two connection checks, shared by the Setup forms (Test connection
// button) and ConnectionRestorer (automatic reconnect with remembered keys).
//
// Both read the current values straight from the setup store, so they always
// test what's on screen. `quiet` is for the automatic reconnect: no success
// toast or chime, but failures are still announced so a stale saved key
// doesn't fail silently.

interface TestOptions {
  /** Saved-key reconnect: no success toast; failures still toast. */
  quiet?: boolean;
  /** Automatic test after typing or pasting a key: no toasts or sounds at
   *  all. The card shows the result inline. */
  auto?: boolean;
}

export async function testSurveySparrowConnection({ quiet = false, auto = false }: TestOptions = {}) {
  const { surveySparrow: ss, setSSConnection: setConnection } = useSetupStore.getState();
  const testedKey = ss.apiKey;
  const testedRegion = ss.region;
  // The key or region changed while this test was running: drop the result
  // and go back to idle, so the newer values get tested instead.
  const isStale = () => {
    const now = useSetupStore.getState().surveySparrow;
    return now.apiKey !== testedKey || now.region !== testedRegion;
  };
  setConnection({ status: "validating", error: null, detail: null, account: null });
  try {
    const res = await loggedFetch(
      "/api/surveysparrow/test-connection",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: ss.region, apiKey: ss.apiKey }),
      },
      { kind: "internal", provider: "plumage", contextLabel: "ss-probe" },
    );
    const json = (await res.json()) as {
      ok: boolean;
      error?: string;
      sampleSurveyName?: string | null;
      hasSurveys?: boolean;
      account?: SSAccount | null;
    };
    if (isStale()) {
      setConnection({ status: "idle", error: null, detail: null, account: null });
      return;
    }
    if (!json.ok) {
      setConnection({ status: "error", error: json.error ?? "Connection failed", detail: null });
      if (!auto) {
        toast.error(
          quiet ? "Your saved SurveySparrow key didn't work" : "SurveySparrow connection failed",
          { description: json.error ?? "Unknown error" },
        );
        void playErrorChime();
      }
      return;
    }
    const account = json.account ?? null;
    const where = account?.companyName ? account.companyName : "this workspace";
    // Detail only carries what the account pill doesn't: an empty workspace.
    const detail = json.hasSurveys
      ? null
      : `${where} has no surveys yet. Create one in SurveySparrow before you generate responses.`;
    setConnection({ status: "ok", error: null, lastSuccessAt: Date.now(), detail, account });
    if (!quiet && !auto) {
      toast.success("SurveySparrow connected", {
        description: account ? `Connected to ${account.companyName || account.domain}.` : undefined,
      });
      void playSuccessChime();
    }
  } catch (err) {
    if (isStale()) {
      setConnection({ status: "idle", error: null, detail: null, account: null });
      return;
    }
    const msg = err instanceof Error ? err.message : "Network error";
    setConnection({ status: "error", error: msg, detail: null });
    if (!auto) {
      toast.error("Network error", { description: msg });
      void playErrorChime();
    }
  }
}

export async function testLLMConnection({ quiet = false }: TestOptions = {}) {
  const { llm, setLLMConnection: setConnection } = useSetupStore.getState();
  const providerLabel = getProviderMeta(llm.provider).label;
  const personaNeedsCustomId =
    llm.provider === "openrouter" && llm.personaModel === "openrouter:custom";
  setConnection({ status: "validating", error: null, detail: null });
  try {
    // Probe the persona model. It's usually the cheaper of the two, and an
    // auth or model-availability error shows up the same way for either.
    const res = await loggedFetch(
      "/api/llm/test-connection",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: llm.provider,
          apiKey: llm.apiKey,
          model: llm.personaModel,
          customModelId: personaNeedsCustomId ? llm.customPersonaModelId : undefined,
        }),
      },
      { kind: "internal", provider: "plumage", contextLabel: `llm-probe:${llm.provider}` },
    );
    const json = (await res.json()) as {
      ok: boolean;
      error?: string | null;
      sample?: string | null;
      model?: string;
    };
    if (!json.ok) {
      setConnection({ status: "error", error: json.error ?? "Connection failed", detail: null });
      toast.error(
        quiet ? `Your saved ${providerLabel} key didn't work` : `${providerLabel} connection failed`,
        { description: json.error ?? "Unknown error" },
      );
      void playErrorChime();
      return;
    }
    // Plain confirmation. The raw model reply (a JSON echo) means nothing to
    // an SE; the Logs page keeps the full request if anyone needs it.
    const testedModel =
      getModelsByProvider(llm.provider).find((m) => m.id === (json.model ?? llm.personaModel))
        ?.label ?? json.model ?? llm.personaModel;
    const detail = `Connected. ${providerLabel} answered a test request using ${testedModel}.`;
    setConnection({ status: "ok", error: null, lastSuccessAt: Date.now(), detail });
    if (!quiet) {
      toast.success(`${providerLabel} connected`, { description: detail });
      void playSuccessChime();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    setConnection({ status: "error", error: msg, detail: null });
    toast.error("Network error", { description: msg });
    void playErrorChime();
  }
}
