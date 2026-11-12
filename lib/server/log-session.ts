// Per-browser scoping for the API log buffer.
//
// The buffer in ./api-log-buffer.ts is process-wide, and one warm Vercel
// instance serves every SE hitting the deployment. Without scoping, anyone
// with the URL could list and read other SEs' request/response bodies
// (survey questions, prompts with customer use-case context, generated
// responses) through /api/logs.
//
// Each browser gets a random, HttpOnly session cookie. Route handlers that
// make upstream calls are wrapped in `withLogSession`, which runs the handler
// inside an AsyncLocalStorage scope holding that id. The instrumenters
// (lib/llm, lib/surveysparrow) call `beginLog` deep in the stack, and the
// buffer reads the owner from this scope, so nothing has to thread an id
// through every function signature. /api/logs only returns entries whose
// owner matches the caller's cookie.
//
// The cookie is a scoping key for debug logs. It is not authentication: it
// keeps SEs out of each other's logs, it doesn't keep strangers out of the
// app.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

export const LOG_SESSION_COOKIE = "plumage_log_session";

// randomUUID() output. Anything else in the cookie is ignored and replaced.
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const logSessionScope = new AsyncLocalStorage<string>();

/** The log session of the request currently being handled, if any. */
export function currentLogSession(): string | undefined {
  return logSessionScope.getStore();
}

/** The caller's log session id from its cookie, if present and well-formed. */
export function readLogSession(req: NextRequest): string | undefined {
  const value = req.cookies.get(LOG_SESSION_COOKIE)?.value;
  return value && SESSION_ID_PATTERN.test(value) ? value : undefined;
}

/**
 * Wrap a route handler so API calls it makes are logged under the caller's
 * browser session. Issues the cookie on the response when the request didn't
 * carry one.
 *
 * Streaming handlers work too: the ReadableStream `start` callback runs while
 * the stream is constructed, inside this scope, and AsyncLocalStorage follows
 * every await from there.
 */
export function withLogSession<
  Args extends [NextRequest, ...unknown[]],
  R extends Response,
>(handler: (...args: Args) => Promise<R>): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const req = args[0];
    const existing = readLogSession(req);
    const sessionId = existing ?? randomUUID();
    const res = await logSessionScope.run(sessionId, () => handler(...args));
    if (!existing) {
      res.headers.append("Set-Cookie", serializeCookie(sessionId, req));
    }
    return res;
  };
}

function serializeCookie(sessionId: string, req: NextRequest): string {
  const parts = [
    `${LOG_SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  // Secure whenever the request came in over HTTPS (Vercel). Left off for
  // plain-http localhost so `next start` without TLS still works.
  if (req.nextUrl.protocol === "https:") parts.push("Secure");
  // No Max-Age: a browser-session cookie. The logs themselves only live in
  // one instance's memory, so a longer-lived id buys nothing.
  return parts.join("; ");
}
