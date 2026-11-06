"use client";

import { useEffect } from "react";
import { useSetupStore } from "@/store/setup-store";
import { testLLMConnection, testSurveySparrowConnection } from "@/lib/setup/connection-tests";

/**
 * Loads keys the user chose to remember (see setup-store) and re-tests them
 * once per page load, quietly. Success shows up as the normal "connected"
 * state; a key that no longer works gets an error toast, so it never fails
 * silently. Renders nothing.
 */
export function ConnectionRestorer() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useSetupStore.persist.rehydrate();
      if (cancelled) return;
      const s = useSetupStore.getState();
      const tasks: Promise<void>[] = [];
      if (s.rememberSS && s.surveySparrow.apiKey.trim() && s.ssConnection.status === "idle") {
        tasks.push(testSurveySparrowConnection({ quiet: true }));
      }
      if (s.rememberLLM && s.llm.apiKey.trim() && s.llmConnection.status === "idle") {
        tasks.push(testLLMConnection({ quiet: true }));
      }
      await Promise.all(tasks);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
