// Per-entry full-payload fetch.
//
// GET /api/logs/{id}
//   Returns the full request/response bodies + headers for one entry, if
//   still present in tier 2 (see PAYLOAD_CAP in lib/server/api-log-buffer.ts)
//   AND recorded under the caller's log session cookie. Evicted entries and
//   other sessions' entries both return the same 404, so ids from someone
//   else's session can't be probed.

import { NextResponse, type NextRequest } from "next/server";
import { getFullPayload } from "@/lib/server/api-log-buffer";
import { readLogSession } from "@/lib/server/log-session";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = readLogSession(req);
  const payload = owner ? getFullPayload(owner, id) : null;
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: "The request and response for this call are no longer stored. The server only keeps them for recent calls." },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { ok: true, payload },
    { headers: { "Cache-Control": "no-store" } },
  );
}
