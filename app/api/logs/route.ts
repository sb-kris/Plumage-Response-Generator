// API Logs view — list + clear, scoped to the caller's browser.
//
// GET  /api/logs?since=<ms>&status=<bucket>&kind=<llm|surveysparrow|internal>
//                &provider=<name>&q=<text>&limit=<n>
//      Returns: { entries: ApiLogSummary[], stats: { ... } }
//
// DELETE /api/logs
//      Removes the caller's entries from both ring buffers. Returns: { ok: true }.
//
// There is no auth in front of this route. The buffer is shared by everyone
// hitting the same server instance, so both handlers only touch entries
// recorded under the caller's log session cookie (lib/server/log-session.ts).
// A request without the cookie sees nothing. No payload data is returned
// here — that's a separate per-id endpoint so the list view stays cheap.

import { NextResponse, type NextRequest } from "next/server";
import {
  clearLogs,
  listLogs,
  stats,
  type ApiLogKind,
  type ApiLogStatus,
} from "@/lib/server/api-log-buffer";
import { readLogSession } from "@/lib/server/log-session";

export const runtime = "nodejs";

const KNOWN_STATUSES: ReadonlyArray<ApiLogStatus | "all"> = [
  "all",
  "success",
  "client_error",
  "server_error",
  "rate_limited",
  "network_error",
  "aborted",
  "in_progress",
];

// Same caps as a real session, zero counts. The caps don't depend on the
// session, so reading them via a placeholder owner is safe.
const EMPTY_STATS = stats("");

const KNOWN_KINDS: ReadonlyArray<ApiLogKind> = ["llm", "surveysparrow", "internal"];

export async function GET(req: NextRequest) {
  const owner = readLogSession(req);
  if (!owner) {
    return NextResponse.json(
      { entries: [], stats: EMPTY_STATS },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const params = req.nextUrl.searchParams;

  const sinceRaw = params.get("since");
  const since = sinceRaw ? Number.parseInt(sinceRaw, 10) : undefined;

  const statusRaw = params.get("status");
  const status =
    statusRaw && (KNOWN_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as ApiLogStatus | "all")
      : undefined;

  const kindRaw = params.get("kind");
  const kind =
    kindRaw && (KNOWN_KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as ApiLogKind)
      : undefined;

  const provider = params.get("provider") ?? undefined;
  const query = params.get("q") ?? undefined;
  const limitRaw = params.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const entries = listLogs(owner, {
    since: Number.isFinite(since) ? since : undefined,
    status,
    kind,
    provider: provider || undefined,
    query: query || undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json(
    { entries, stats: stats(owner) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(req: NextRequest) {
  const owner = readLogSession(req);
  if (owner) clearLogs(owner);
  return NextResponse.json({ ok: true });
}
