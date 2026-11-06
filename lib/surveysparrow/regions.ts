// SurveySparrow regional API endpoints.
// Verified against https://developers.surveysparrow.com/rest-apis/Introduction/ — May 2026.
//
// India does not have a dedicated endpoint per the public docs; accounts hosted in
// India typically use the Asia/Pacific endpoint. If your IN account uses a different
// host, contact SurveySparrow support and update this map.

export type SurveySparrowRegion =
  | "us"
  | "eu"
  | "uk"
  | "au"
  | "ca"
  | "in"
  | "me";

export interface RegionConfig {
  code: SurveySparrowRegion;
  /** Compact display code shown in the closed select (e.g. "US", "APAC").
   *  Display-only — never sent to the API. */
  shortLabel: string;
  label: string;
  baseUrl: string;
  description: string;
}

export const REGIONS: Record<SurveySparrowRegion, RegionConfig> = {
  us: {
    code: "us",
    shortLabel: "US",
    label: "United States",
    baseUrl: "https://api.surveysparrow.com",
    description: "US-Virginia data center (default for new accounts)",
  },
  eu: {
    code: "eu",
    shortLabel: "EU",
    label: "European Union",
    baseUrl: "https://eu-api.surveysparrow.com",
    description: "EU-Frankfurt data center",
  },
  uk: {
    code: "uk",
    shortLabel: "UK",
    label: "United Kingdom",
    baseUrl: "https://eu-ln-api.surveysparrow.com",
    description: "UK-London data center",
  },
  au: {
    code: "au",
    shortLabel: "APAC",
    label: "Asia / Pacific",
    baseUrl: "https://ap-api.surveysparrow.com",
    description: "AP-Sydney data center (also used for AU/NZ)",
  },
  ca: {
    code: "ca",
    shortLabel: "CA",
    label: "Canada",
    baseUrl: "https://ca-api.surveysparrow.com",
    description: "CA-Central data center",
  },
  in: {
    code: "in",
    shortLabel: "IN",
    label: "India",
    baseUrl: "https://ap-api.surveysparrow.com",
    description: "Asia/Pacific endpoint — IN accounts may differ; contact SS support to confirm",
  },
  me: {
    code: "me",
    shortLabel: "ME",
    label: "Middle East",
    baseUrl: "https://me-api.surveysparrow.com",
    description: "ME data center",
  },
};

export const REGION_LIST: RegionConfig[] = Object.values(REGIONS);

export function getRegion(code: string): RegionConfig | null {
  return REGIONS[code as SurveySparrowRegion] ?? null;
}
