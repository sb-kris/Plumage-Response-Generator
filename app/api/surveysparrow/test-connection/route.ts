import { NextResponse, type NextRequest } from "next/server";
import { surveySparrowFetch } from "@/lib/surveysparrow/client";
import type { SurveyListResponse } from "@/lib/surveysparrow/types";
import { getRegion, type SurveySparrowRegion } from "@/lib/surveysparrow/regions";

export const runtime = "nodejs";

// GET /api/internal/integration/accountinfo, same Bearer key as v3. Returns
// { data: { id, name, company_name, domain, logo, account_status, region,
// features[], subscription[], ... } }. Only the identity fields are passed on.
interface AccountInfoResponse {
  data?: {
    name?: string | null;
    company_name?: string | null;
    domain?: string | null;
    logo?: string | null;
    account_status?: boolean | null;
  };
}

interface TestRequest {
  region?: string;
  apiKey?: string;
}

export async function POST(req: NextRequest) {
  let body: TestRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const region = body.region as SurveySparrowRegion | undefined;
  if (!region || !getRegion(region)) {
    return NextResponse.json({ ok: false, error: "Select a region." }, { status: 400 });
  }
  if (!body.apiKey) {
    return NextResponse.json({ ok: false, error: "API key is required." }, { status: 400 });
  }

  const config = { region, apiKey: body.apiKey };
  // Two calls in parallel: list 1 survey (confirms the key, region and read
  // access Plumage needs) and account info (who the key belongs to). Account
  // info is a nice-to-have: if it fails, the connection still counts.
  const [result, accountResult] = await Promise.all([
    surveySparrowFetch<SurveyListResponse>(config, "/v3/surveys?limit=1"),
    // Body kept out of the shared API log: it carries plan, subscription and
    // feature details. Only the identity fields below are used.
    surveySparrowFetch<AccountInfoResponse>(
      config,
      "/api/internal/integration/accountinfo",
      {},
      { omitResponseBody: true },
    ),
  ]);

  if (!result.ok) {
    const upstream = result.error ?? "Unknown error";
    // Keep SurveySparrow's own wording visible (SEs debug with it), but say
    // what it means for the two cases people actually hit.
    const error =
      result.status === 401
        ? `SurveySparrow didn't accept this key (${upstream}). Check you copied the whole key and picked the region your account is in.`
        : result.status === 403
          ? `This key can't read surveys (${upstream}). Use an account-level key with access to surveys and responses.`
          : upstream;
    return NextResponse.json({ ok: false, status: result.status, error }, { status: 200 });
  }

  const surveyCount = result.data?.data?.length ?? 0;
  return NextResponse.json({
    ok: true,
    status: result.status,
    region,
    sampleSurveyName: result.data?.data?.[0]?.name ?? null,
    hasSurveys: surveyCount > 0,
    account: toAccount(accountResult.ok ? accountResult.data : undefined),
  });
}

function toAccount(res: AccountInfoResponse | undefined) {
  const d = res?.data;
  if (!d) return null;
  const companyName = d.company_name?.trim() || d.name?.trim() || "";
  const domain = d.domain?.trim() || "";
  if (!companyName && !domain) return null;
  const logo = d.logo?.trim() || "";
  return {
    companyName,
    domain,
    // Only pass through an https image URL.
    logoUrl: /^https:\/\//i.test(logo) ? logo : null,
    active: d.account_status !== false,
  };
}
