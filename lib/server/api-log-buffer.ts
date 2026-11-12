// Process-level ring buffer for API call observability.
//
// Two tiers, both bounded:
//
//   Tier 1 — SUMMARIES (kept: SUMMARY_CAP = 500)
//     ~150-200 bytes per entry. The /api/logs page renders these directly.
//     Includes: id, timestamp, provider, endpoint, method, status, duration,
//     retry count, error message (if any), and a "kind" tag (llm / ss /
//     internal) for filtering.
//
//   Tier 2 — FULL PAYLOADS (kept: PAYLOAD_CAP = 50)
//     Request + response bodies, headers, etc. Trimmed to MAX_PAYLOAD_BYTES
//     per side. Only fetched on-demand when a user expands a row in the UI.
//     Evicted FIFO; older entries silently lose their full payload but the
//     summary survives.
//
// Why bounded? A 5000-response generation makes ~10000 LLM calls when retries
// land. Without caps, the buffer would consume ~MB-scale memory permanently.
// 500 summaries × 200B ≈ 100KB. 50 full payloads × 60KB (32KB req + 32KB res
// in the worst case) ≈ 3MB peak. Both reset on process restart.
//
// Why no disk persistence? Persistence introduces:
//   • disk I/O on every call → hot-path drag we don't need
//   • stale-data risk → SE debugging old runs misled by content they cleared
//   • a security concern → prompts/answers may contain customer context;
//     they should NOT outlive the process
// The buffer is meant for "tail the last 500 calls during a debugging
// session", not a long-term audit log.
//
// SECURITY: API keys MUST NOT land in the buffer. The instrumenters scrub
// `Authorization` / `x-api-key` / `api-key` / `Bearer` tokens from headers
// before recording. The buffer itself enforces this via `scrubHeaders()`,
// and `scrubEndpoint()` redacts key-like query parameters in URLs.
//
// SCOPING: the buffer is shared by every browser hitting this instance, so
// every entry is tagged with the caller's log session (see ./log-session.ts)
// and the readers only return the caller's own entries. Calls made outside a
// `withLogSession` scope have no owner and are not recorded at all, since no
// one could read them back. The caps below are still global: heavy traffic
// from one SE can evict another SE's older entries.

import { randomUUID } from "node:crypto";
import { currentLogSession } from "./log-session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiLogKind = "llm" | "surveysparrow" | "internal";
export type ApiLogStatus =
  | "success"
  | "client_error" // 4xx (excluding 429)
  | "server_error" // 5xx
  | "rate_limited" // 429 or provider-tagged rate limit
  | "network_error"
  | "aborted"
  | "in_progress";

export interface ApiLogSummary {
  /** UUID — also the key for the full-payload tier. */
  id: string;
  /** Wall-clock ms when the call started. */
  startedAt: number;
  /** Wall-clock ms when the call settled (omitted if `in_progress`). */
  finishedAt?: number;
  kind: ApiLogKind;
  /** Provider/tool label, e.g. "anthropic", "openai", "surveysparrow". */
  provider: string;
  /** HTTP method. Defaults to GET if not set. */
  method: string;
  /** Endpoint URL (sans secrets). For internal routes, the path. */
  endpoint: string;
  /** Upstream HTTP status, or 0 for transport failures. */
  httpStatus?: number;
  /** Bucketed status — friendlier for filters. */
  status: ApiLogStatus;
  /** Wall-clock duration in ms. Omitted if `in_progress`. */
  durationMs?: number;
  /** Number of automatic retries the orchestrator made for this logical call.
   *  Each retry is also recorded separately, but it's useful to know "this
   *  call needed 3 attempts to succeed". */
  retryCount?: number;
  /** Short error string (already pre-extracted from the upstream body).
   *  Truncated to ERROR_MESSAGE_LIMIT chars. */
  error?: string;
  /** Whether a full payload is available in tier 2. Drives the chevron arrow
   *  in the UI — collapsed rows whose payloads have been evicted show a hint
   *  rather than fetching and 404ing. */
  hasFullPayload: boolean;
  /** Free-form label for cross-references. Generation orchestrators set
   *  this to the persona ID / batch index so a UI can group entries. */
  contextLabel?: string;
}

export interface ApiLogFullPayload {
  id: string;
  /** Scrubbed headers — Authorization-class headers replaced with "[redacted]". */
  requestHeaders: Record<string, string>;
  /** Request body as text. May be JSON, may be empty. Truncated. */
  requestBody?: string;
  /** Response headers as captured. */
  responseHeaders?: Record<string, string>;
  /** Response body as text. Truncated. */
  responseBody?: string;
  /** True if we trimmed the request body. */
  requestTruncated?: boolean;
  /** True if we trimmed the response body. */
  responseTruncated?: boolean;
}

// ---------------------------------------------------------------------------
// Tunables — change these if memory pressure or debug-window scope shifts.
// ---------------------------------------------------------------------------

const SUMMARY_CAP = 500;
// A single push of 500 responses = 5 batches × ~16 calls (1 submit + up
// to 15 poll-status). That's 80 payloads from one push alone. The previous
// cap of 50 was evicting batch-status response bodies before the user
// could inspect them — exactly the symptom the user reported. 250 covers
// realistic push sizes without unbounded memory growth. At ~64KB worst
// case per entry: 250 × 64KB ≈ 16MB peak, acceptable for a Node process.
const PAYLOAD_CAP = 250;
const MAX_PAYLOAD_BYTES = 32 * 1024; // 32 KB per side
const ERROR_MESSAGE_LIMIT = 500;

// ---------------------------------------------------------------------------
// Storage — two ring buffers
// ---------------------------------------------------------------------------
//
// Summaries: array-based ring with a head pointer. Reading is O(n) but n is
// bounded at 500 so that's fine. Inserts are O(1).
//
// Payloads: simple Map; we track insertion order via a separate FIFO queue
// for eviction. Map gives us O(1) lookup by id which is what the
// `/api/logs/[id]` endpoint needs.

// `owner` is the log session id. It stays inside this module; readers return
// the bare summary/payload.
interface StoredSummary {
  owner: string;
  entry: ApiLogSummary;
}
interface StoredPayload {
  owner: string;
  payload: ApiLogFullPayload;
}

const summaries: StoredSummary[] = [];
const payloads = new Map<string, StoredPayload>();
const payloadOrder: string[] = []; // FIFO eviction queue

// ---------------------------------------------------------------------------
// Public API — used by instrumenters in lib/llm + lib/surveysparrow
// ---------------------------------------------------------------------------

export interface BeginLogInput {
  kind: ApiLogKind;
  provider: string;
  method: string;
  endpoint: string;
  contextLabel?: string;
  /** Scrubbed request headers — instrumenters pass these (we scrub again as
   *  belt-and-braces). */
  requestHeaders?: Record<string, string>;
  /** Request body as captured. */
  requestBody?: string;
}

/**
 * Start recording a call. Returns the entry's id which the caller passes
 * back into `finishLog`. Begin/finish pairing lets us record `in_progress`
 * rows that show up in the UI immediately for long-running calls.
 */
export function beginLog(input: BeginLogInput): string {
  const id = randomUUID();
  const owner = currentLogSession();
  if (!owner) {
    // Not inside a withLogSession-wrapped route. Returning an id that was
    // never stored makes the matching finishLog a no-op.
    warnUnscoped(input.endpoint);
    return id;
  }
  const summary: ApiLogSummary = {
    id,
    startedAt: Date.now(),
    kind: input.kind,
    provider: input.provider,
    method: input.method.toUpperCase(),
    endpoint: scrubEndpoint(input.endpoint),
    status: "in_progress",
    hasFullPayload: Boolean(input.requestBody || input.requestHeaders),
    contextLabel: input.contextLabel,
  };
  appendSummary({ owner, entry: summary });

  if (input.requestBody || input.requestHeaders) {
    const headers = scrubHeaders(input.requestHeaders ?? {});
    const { text: requestBody, truncated: requestTruncated } = trim(
      input.requestBody,
    );
    putPayload({
      owner,
      payload: {
        id,
        requestHeaders: headers,
        requestBody,
        requestTruncated,
      },
    });
  }

  return id;
}

export interface FinishLogInput {
  id: string;
  /** Final HTTP status (or 0 for transport-level failures). */
  httpStatus?: number;
  /** Bucketed status. If omitted, derived from `httpStatus`. */
  status?: ApiLogStatus;
  error?: string;
  retryCount?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

/**
 * Complete a previously-begun call. Updates the summary AND merges the
 * response into tier 2 if we still have the entry there.
 */
export function finishLog(input: FinishLogInput): void {
  const idx = summaries.findIndex((s) => s.entry.id === input.id);
  if (idx < 0) return; // never recorded, or evicted from tier 1
  const now = Date.now();
  const summary = summaries[idx]!.entry;
  summary.finishedAt = now;
  summary.durationMs = now - summary.startedAt;
  summary.httpStatus = input.httpStatus;
  summary.status = input.status ?? bucketStatus(input.httpStatus, input.error);
  if (input.error) {
    summary.error = input.error.slice(0, ERROR_MESSAGE_LIMIT);
  }
  if (typeof input.retryCount === "number") {
    summary.retryCount = input.retryCount;
  }

  // If tier 2 still has the entry, merge response data in.
  const existing = payloads.get(input.id);
  if (existing) {
    const headers = input.responseHeaders ? scrubHeaders(input.responseHeaders) : undefined;
    const { text: responseBody, truncated: responseTruncated } = trim(
      input.responseBody,
    );
    payloads.set(input.id, {
      ...existing,
      payload: {
        ...existing.payload,
        responseHeaders: headers,
        responseBody,
        responseTruncated,
      },
    });
    summary.hasFullPayload = true;
  }
}

/**
 * One-shot recording — for calls that finish synchronously enough that we
 * don't need a separate `in_progress` row. Currently unused but exposed for
 * future "log a non-retried call" callers.
 */
export function recordLog(
  input: BeginLogInput & FinishLogInput,
): string {
  const id = beginLog(input);
  finishLog({ ...input, id });
  return id;
}

// ---------------------------------------------------------------------------
// Reader API — for /api/logs route handlers
// ---------------------------------------------------------------------------

export interface ListLogsFilter {
  /** Only entries with `startedAt` strictly greater than this (ms since epoch). */
  since?: number;
  /** Status bucket filter. */
  status?: ApiLogStatus | "all";
  /** Provider/kind filter. */
  kind?: ApiLogKind;
  /** Provider name filter (e.g. "anthropic"). */
  provider?: string;
  /** Substring filter on endpoint OR error message — for the search box. */
  query?: string;
  /** Cap on returned rows. Defaults to SUMMARY_CAP. */
  limit?: number;
}

/** The given log session's entries, newest first. */
export function listLogs(owner: string, filter: ListLogsFilter = {}): ApiLogSummary[] {
  const limit = Math.max(1, Math.min(SUMMARY_CAP, filter.limit ?? SUMMARY_CAP));
  const q = filter.query?.toLowerCase().trim() || null;
  const out: ApiLogSummary[] = [];
  // Iterate newest-first (we always append, so reverse-iterate the array).
  for (let i = summaries.length - 1; i >= 0; i--) {
    if (summaries[i]!.owner !== owner) continue;
    const s = summaries[i]!.entry;
    if (filter.since !== undefined && s.startedAt <= filter.since) continue;
    if (filter.status && filter.status !== "all" && s.status !== filter.status) continue;
    if (filter.kind && s.kind !== filter.kind) continue;
    if (filter.provider && s.provider !== filter.provider) continue;
    if (q) {
      const hay = `${s.endpoint} ${s.error ?? ""} ${s.contextLabel ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Full payload for one entry, or null if it was evicted or belongs to
 *  another log session (the caller can't tell the two apart). */
export function getFullPayload(owner: string, id: string): ApiLogFullPayload | null {
  const stored = payloads.get(id);
  return stored && stored.owner === owner ? stored.payload : null;
}

/** Remove the given log session's entries. Other sessions' entries stay. */
export function clearLogs(owner: string): void {
  for (let i = summaries.length - 1; i >= 0; i--) {
    if (summaries[i]!.owner === owner) summaries.splice(i, 1);
  }
  for (let i = payloadOrder.length - 1; i >= 0; i--) {
    const id = payloadOrder[i]!;
    if (payloads.get(id)?.owner === owner) {
      payloads.delete(id);
      payloadOrder.splice(i, 1);
    }
  }
}

/** Counts for the given log session. Caps are shared by all sessions. */
export function stats(owner: string): {
  summaryCount: number;
  payloadCount: number;
  summaryCap: number;
  payloadCap: number;
} {
  let summaryCount = 0;
  for (const s of summaries) if (s.owner === owner) summaryCount++;
  let payloadCount = 0;
  for (const p of payloads.values()) if (p.owner === owner) payloadCount++;
  return {
    summaryCount,
    payloadCount,
    summaryCap: SUMMARY_CAP,
    payloadCap: PAYLOAD_CAP,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function appendSummary(s: StoredSummary): void {
  summaries.push(s);
  while (summaries.length > SUMMARY_CAP) {
    summaries.shift();
  }
}

function putPayload(p: StoredPayload): void {
  payloads.set(p.payload.id, p);
  payloadOrder.push(p.payload.id);
  while (payloadOrder.length > PAYLOAD_CAP) {
    const oldest = payloadOrder.shift();
    if (oldest) {
      payloads.delete(oldest);
      // Also flip the summary's hasFullPayload flag so the UI doesn't
      // promise a payload that no longer exists. The summary itself stays.
      const sIdx = summaries.findIndex((s) => s.entry.id === oldest);
      if (sIdx >= 0) summaries[sIdx]!.entry.hasFullPayload = false;
    }
  }
}

function bucketStatus(
  httpStatus: number | undefined,
  error: string | undefined,
): ApiLogStatus {
  if (httpStatus === undefined || httpStatus === 0) {
    if (error && /abort/i.test(error)) return "aborted";
    return "network_error";
  }
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus >= 200 && httpStatus < 300) return "success";
  if (httpStatus >= 400 && httpStatus < 500) return "client_error";
  if (httpStatus >= 500) return "server_error";
  return "success";
}

// Headers we always redact. Case-insensitive match on the header name.
const SECRET_HEADER_PATTERN = /^(authorization|x-api-key|api-key|x-auth-token|cookie|x-anthropic-key)$/i;

export function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SECRET_HEADER_PATTERN.test(k)) {
      // Preserve length hint so debugging "was the header set at all?" works
      // without leaking the value.
      out[k] = `[redacted ${v.length}ch]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Query parameters that carry credentials (e.g. Gemini's `?key=`). The
// instrumenters already log endpoints without them; this is the backstop.
const SECRET_QUERY_PARAM_PATTERN = /^(key|api[-_]?key|token|access[-_]?token)$/i;

function scrubEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return endpoint; // a bare path, nothing to scrub
  }
  let changed = false;
  for (const name of [...url.searchParams.keys()]) {
    if (SECRET_QUERY_PARAM_PATTERN.test(name)) {
      url.searchParams.set(name, "REDACTED");
      changed = true;
    }
  }
  return changed ? url.toString() : endpoint;
}

let warnedUnscoped = false;

function warnUnscoped(endpoint: string): void {
  if (warnedUnscoped || process.env.NODE_ENV === "production") return;
  warnedUnscoped = true;
  console.warn(
    `[api-log-buffer] Not logging ${endpoint}: the call ran outside withLogSession, ` +
      "so it has no owner. Wrap the route handler with withLogSession " +
      "(lib/server/log-session.ts) to show its calls on the API Logs page.",
  );
}

function trim(text: string | undefined): { text?: string; truncated?: boolean } {
  if (text === undefined) return {};
  if (text.length <= MAX_PAYLOAD_BYTES) return { text };
  return { text: text.slice(0, MAX_PAYLOAD_BYTES), truncated: true };
}
