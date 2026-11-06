// Dataset Purpose — smart preset / intelligence layer.
//
// Plumage evolves from "response generator" to "demo dataset builder" by
// asking one lightweight question up front: what kind of demo dataset
// are you trying to build?
//
// Product principle (do not violate):
//   Dataset Purpose is GUIDANCE. It steers copy, placeholders, theme
//   vocabulary, and AI Setup Assistant prompt tone. It NEVER
//   overwrites the user's manual configuration. If a purpose is not
//   selected, or the user picks "custom", Plumage behaves exactly as
//   it did before this concept existed.
//
// This module is deliberately runtime-cheap and dependency-free — it's
// pure data. No React, no store, no LLM calls. Sections read it to
// swap in vocabulary; the Setup Assistant reads it to inject a
// guidance paragraph into its prompt. Nothing else consumes it in this
// first pass — response generation is intentionally untouched.

// ---------------------------------------------------------------------------
// Purpose identifiers
// ---------------------------------------------------------------------------

export type DatasetPurpose =
  | "voc_dashboard"
  | "market_research"
  | "hierarchy_dashboard"
  | "testimonial_advocacy"
  | "multilingual_demo"
  | "support_csat_recovery"
  | "migration_import_test"
  | "custom";

export const DATASET_PURPOSE_IDS: readonly DatasetPurpose[] = [
  "voc_dashboard",
  "market_research",
  "hierarchy_dashboard",
  "testimonial_advocacy",
  "multilingual_demo",
  "support_csat_recovery",
  "migration_import_test",
  "custom",
] as const;

// ---------------------------------------------------------------------------
// Per-purpose metadata
// ---------------------------------------------------------------------------
//
// Every purpose carries the copy needed by ContextSection, ThemesSection,
// and the Setup Assistant. Adding a 9th purpose = one entry here.
//
// Fields:
//   label            - Full label used in the ContextSection description
//                      and Setup Assistant chip.
//   shortLabel       - Compact label for the chip picker (fits on one
//                      row without wrapping).
//   description      - One-line hint shown under the chip row when a
//                      purpose is selected.
//   themesVocabulary - Word ThemesSection substitutes into its copy
//                      ("Themes" / "Research dimensions" / etc.).
//   contextPlaceholder - Textarea placeholder that appears in
//                        ContextSection when this purpose is selected.
//   assistantGuidance  - Paragraph injected into the Setup Assistant
//                        prompt to steer suggestions. Only appended
//                        when the purpose is set AND not "custom".

// ---------------------------------------------------------------------------
// Section behavior metadata (purpose-aware Configure — Stage 1)
// ---------------------------------------------------------------------------
//
// Each purpose can reframe individual Configure sections: swap the
// CardTitle, swap the CardDescription, and flag a priority that renders
// as a small badge. This is COPY + BADGES ONLY. It never mutates draft
// data, hides sections, reorders them, or changes any internal logic.
// Missing keys keep the section's default title/description/badge — so a
// purpose only lists the sections it wants to reframe.

export type SectionPriority = "primary" | "recommended" | "optional" | "secondary";

export type ConfigureSectionId =
  | "context"
  | "themes"
  | "personas"
  | "languages"
  | "countries"
  | "variables"
  | "metadata"
  | "timing";

export interface SectionOverride {
  /** Replaces the section's CardTitle text. Omit to keep the default. */
  label?: string;
  /** Replaces the section's CardDescription text. Omit to keep the default. */
  description?: string;
  /** Drives a small badge next to the title. "primary" (or undefined)
   *  renders no badge — it's the neutral, unremarkable state. */
  priority?: SectionPriority;
}

// ---------------------------------------------------------------------------
// Non-blocking guidance warnings (purpose-aware Configure — Stage 2)
// ---------------------------------------------------------------------------
//
// A purpose may attach gentle, observational warnings that appear at the
// top of a section. HARD RULES (do not violate):
//   • Never blocks push.
//   • Never mutates the draft.
//   • Never auto-adds variables or changes any field.
//   • Purely reactive to draft state — a pure function reads the draft
//     and returns which warnings currently apply.
// Two tones: "warning" (soft yellow — a suggestion) and "info" (neutral —
// an expectation-setting note, e.g. the migration-test disclaimer).

export type WarningTone = "warning" | "info";

export type WarningRule =
  | {
      id: string;
      section: ConfigureSectionId;
      tone: WarningTone;
      /** Fires when the draft has zero custom variables. */
      kind: "empty_variables";
      message: string;
    }
  | {
      id: string;
      section: ConfigureSectionId;
      tone: WarningTone;
      /** Fires when NO custom variable's apiIdentifier or label contains
       *  any of these (case-insensitive) substrings. Also fires when
       *  there are no variables at all. */
      kind: "no_matching_variables";
      keywords: string[];
      message: string;
    }
  | {
      id: string;
      section: ConfigureSectionId;
      tone: WarningTone;
      /** Fires when personaDistribution.promoter is below this threshold. */
      kind: "sentiment_below_promoter";
      minPromoter: number;
      message: string;
    }
  | {
      id: string;
      section: ConfigureSectionId;
      tone: WarningTone;
      /** Fires when fewer than 2 languages have weight > 0. */
      kind: "single_active_language";
      message: string;
    }
  | {
      id: string;
      section: ConfigureSectionId;
      tone: WarningTone;
      /** Always fires while this purpose is selected (expectation-setting). */
      kind: "always";
      message: string;
    };

/** A warning that currently applies — the flattened shape sections render. */
export interface EvaluatedWarning {
  id: string;
  section: ConfigureSectionId;
  tone: WarningTone;
  message: string;
}

// ---------------------------------------------------------------------------
// Suggestion + label metadata (purpose-aware suggestions — this pass)
// ---------------------------------------------------------------------------
//
// Reframing the section titles wasn't enough: the CHIPS inside sections
// (theme suggestions, variable presets) and the persona bucket LABELS
// were still CX-shaped. This metadata makes those purpose-aware too.
// Still guidance-only — clicking a chip pre-fills the same editors and
// nothing auto-adds. Persona label changes are display-only; the
// underlying promoter/passive/detractor keys are unchanged.

/** One persona bucket's display label + description for a purpose. */
export interface PersonaBucketLabel {
  label: string;
  description: string;
}

/**
 * A purpose-specific variable preset chip. STRING is the default (weighted
 * `options`). NUMBER / DATE / PERSONA presets carry their own config so the
 * migration-test purpose can surface presets that exercise every variable
 * type. Structurally a superset of the section's STRING-only preset, so the
 * existing generic presets remain valid without changes.
 */
export interface PurposeVariablePreset {
  label: string;
  apiIdentifier: string;
  description: string;
  /** Defaults to "STRING" when omitted. */
  type?: "STRING" | "NUMBER" | "DATE" | "PERSONA";
  /** STRING — weighted options the persona picks from. */
  options?: Array<{ text: string; weight: number }>;
  /** STRING — when true, some responses get a blank value (weighted). */
  allowBlank?: boolean;
  /** STRING — weight of the blank outcome (used with allowBlank). */
  blankWeight?: number;
  /** NUMBER — inclusive range + optional decimals. */
  number?: { min: number; max: number; allowDecimals?: boolean; decimalPlaces?: number };
  /** DATE — relative window (N days back from submission). */
  date?: { relativeDays: number };
  /** PERSONA — must match a PersonaFieldKey (e.g. "language", "country"). */
  personaField?: string;
}

// Fields:
//   label            - Full label used in the ContextSection description
//                      and Setup Assistant chip.
//   shortLabel       - Compact label for the chip picker (fits on one
//                      row without wrapping).
//   description      - One-line hint shown under the chip row when a
//                      purpose is selected.
//   themesVocabulary - Word ThemesSection substitutes into its copy
//                      ("Themes" / "Research dimensions" / etc.).
//   contextPlaceholder - Textarea placeholder that appears in
//                        ContextSection when this purpose is selected.
//   assistantGuidance  - Paragraph injected into the Setup Assistant
//                        prompt to steer suggestions. Only appended
//                        when the purpose is set AND not "custom".
//   sectionOverrides   - Per-section label/description/priority reframing
//                        (Stage 1). Optional; missing sections use defaults.
//   variableEmphasis   - Bullet list injected into the Setup Assistant
//                        prompt so it suggests the right KIND of variables.
//   avoidTerms         - "Language to avoid" note for the Setup Assistant
//                        prompt (e.g. don't overuse "NPS" for research).
export interface DatasetPurposeMeta {
  id: DatasetPurpose;
  label: string;
  shortLabel: string;
  description: string;
  themesVocabulary: string;
  contextPlaceholder: string;
  assistantGuidance: string;
  sectionOverrides?: Partial<Record<ConfigureSectionId, SectionOverride>>;
  variableEmphasis?: string[];
  avoidTerms?: string[];
  /** Non-blocking guidance warnings evaluated against draft state
   *  (Stage 2). Missing = no warnings for this purpose. */
  warnings?: WarningRule[];
  /** Theme/research-dimension suggestion chips shown FIRST in ThemesSection.
   *  Survey-type suggestions still append after these (deduped). */
  themeSuggestions?: string[];
  /** Word used in the ThemesSection suggestions header, e.g.
   *  "market research" → "Suggestions for market research". */
  themeSuggestionsLabel?: string;
  /** Purpose-specific variable preset chips, shown before the generic
   *  presets in CustomVariablesSection. */
  variablePresets?: PurposeVariablePreset[];
  /** Display labels + descriptions for the persona buckets. Keys stay
   *  promoter/passive/detractor internally — this only reskins the UI. */
  personaLabels?: {
    promoter: PersonaBucketLabel;
    passive: PersonaBucketLabel;
    detractor: PersonaBucketLabel;
  };
  /** Relabels the persona preset cards, keyed by preset id
   *  (healthy / nps / recovery / polarized). Percentages unchanged. */
  personaPresetLabels?: Record<string, string>;
  /** Replaces the PersonasSection helper paragraph. */
  personaHelperText?: string;
  /** Replaces the ThemesSection input placeholder. */
  themeInputPlaceholder?: string;
  /** Replaces the ThemesSection empty-state title ("No themes yet"). */
  themeEmptyTitle?: string;
  /** Replaces the ThemesSection empty-state supporting line. */
  themeEmptyDescription?: string;
  /** Replaces the ContextSection "What to include" checklist bullets. */
  contextChecklist?: string[];
}

/**
 * Neutral fallback placeholder used when no purpose is selected or the
 * user picks "custom". Matches the copy that shipped in ContextSection
 * before Dataset Purpose existed, so behavior stays identical.
 */
export const CUSTOM_CONTEXT_PLACEHOLDER =
  "e.g. Demo for Nexora Living, premium US smart home brand. Focus on installation experience, AI-powered features, and customer support quality. Customers are middle-to-upper-income homeowners aged 30 to 55.";

export const DATASET_PURPOSES: Record<DatasetPurpose, DatasetPurposeMeta> = {
  voc_dashboard: {
    id: "voc_dashboard",
    label: "VOC / CX dashboard",
    shortLabel: "VOC / CX",
    description:
      "Build realistic customer feedback for NPS, CSAT, CES, open-text, and executive dashboard demos.",
    themesVocabulary: "Themes",
    contextPlaceholder:
      "Example: Generate a realistic customer experience dataset for a VOC dashboard. Include a mix of promoters, passives, and detractors across product experience, support, pricing, onboarding, and renewal themes.",
    contextChecklist: [
      "Customer journey or touchpoint",
      "Product / service being evaluated",
      "Key customer segments",
      "Experience drivers you want reflected",
    ],
    assistantGuidance:
      "Optimize for a realistic customer experience dashboard. Suggest CX themes, satisfaction drivers, sentiment mix, useful segmentation variables, and open-text patterns that help dashboards look meaningful.",
    sectionOverrides: {
      context: { priority: "primary" },
      themes: { priority: "primary" },
      personas: { priority: "primary" },
      languages: { priority: "recommended" },
      countries: { priority: "recommended" },
      variables: { priority: "recommended", label: "Segmentation variables" },
      metadata: { priority: "optional" },
      timing: { priority: "optional" },
    },
    themeSuggestions: [
      "product quality",
      "support experience",
      "ease of use",
      "pricing concerns",
      "feature requests",
      "performance issues",
      "onboarding experience",
      "renewal risk",
    ],
    themeSuggestionsLabel: "VOC dashboards",
    variablePresets: [
      { label: "Product", apiIdentifier: "product", description: "Product line the respondent used", options: [{ text: "Product A", weight: 34 }, { text: "Product B", weight: 33 }, { text: "Product C", weight: 33 }] },
      { label: "Plan", apiIdentifier: "plan", description: "Subscription plan", options: [{ text: "Free", weight: 25 }, { text: "Pro", weight: 45 }, { text: "Enterprise", weight: 30 }] },
      { label: "Customer Tier", apiIdentifier: "customer_tier", description: "Enterprise / Growth / Starter split", options: [{ text: "Enterprise", weight: 40 }, { text: "Growth", weight: 35 }, { text: "Starter", weight: 25 }] },
      { label: "Lifecycle Stage", apiIdentifier: "lifecycle_stage", description: "Customer lifecycle segment", options: [{ text: "Active", weight: 50 }, { text: "Onboarding", weight: 30 }, { text: "At Risk", weight: 20 }] },
      { label: "Region", apiIdentifier: "region", description: "Geographic region", options: [{ text: "North America", weight: 40 }, { text: "EMEA", weight: 35 }, { text: "APAC", weight: 25 }] },
      { label: "Account Type", apiIdentifier: "account_type", description: "New / existing / renewal", options: [{ text: "New", weight: 35 }, { text: "Existing", weight: 45 }, { text: "Renewal", weight: 20 }] },
      { label: "Renewal Stage", apiIdentifier: "renewal_stage", description: "Where the account is in its renewal cycle", options: [{ text: "Early", weight: 40 }, { text: "Mid-term", weight: 35 }, { text: "Up for renewal", weight: 25 }] },
      { label: "Channel", apiIdentifier: "channel", description: "Channel the feedback came through", options: [{ text: "Web", weight: 40 }, { text: "Email", weight: 25 }, { text: "In-app", weight: 25 }, { text: "Support", weight: 10 }] },
    ],
  },

  market_research: {
    id: "market_research",
    label: "Market research",
    shortLabel: "Market research",
    description:
      "Build segment-driven research data for brand awareness, preference, usage, purchase intent, or impact studies.",
    themesVocabulary: "Research dimensions",
    contextPlaceholder:
      "Example: Generate market research responses for a brand awareness and purchase intent study. Focus on audience segments, demographics, product familiarity, consideration, barriers, and preference drivers.",
    themeInputPlaceholder: "Type a research dimension and press Enter (e.g. purchase intent)",
    themeEmptyTitle: "No research dimensions yet",
    themeEmptyDescription:
      "Add research dimensions so respondents differ on awareness, preference, barriers, and intent.",
    contextChecklist: [
      "Study objective or research question",
      "Target audience or sample criteria",
      "Brand / product / category being studied",
      "Segments to compare, such as age band, region, awareness, or intent",
      "Any competitor or purchase-decision context",
    ],
    assistantGuidance:
      "Optimize for market research analysis. Focus less on NPS-style sentiment and more on audience segments, demographics, awareness, usage, preference, barriers, and purchase intent.",
    sectionOverrides: {
      context: { priority: "primary" },
      themes: {
        priority: "primary",
        label: "Research dimensions",
        description:
          "Aspects of the brand, product, or study that responses should vary on, such as awareness, familiarity, preference, purchase intent, barriers, or price sensitivity.",
      },
      personas: {
        priority: "primary",
        label: "Audience composition",
        description:
          "The balance of high-intent, neutral, and low-intent respondents in your research audience.",
      },
      languages: { priority: "recommended" },
      countries: {
        priority: "recommended",
        label: "Markets",
        description: "Markets or geographies to include in this study.",
      },
      variables: {
        priority: "primary",
        label: "Demographics & segments",
        description:
          "Audience segmentation dimensions such as age band, region, awareness level, purchase intent, competitor familiarity, or usage frequency.",
      },
      metadata: { priority: "optional" },
      timing: { priority: "optional" },
    },
    variableEmphasis: [
      "age band",
      "region",
      "awareness level",
      "purchase intent",
      "competitor familiarity",
      "usage frequency",
    ],
    avoidTerms: [
      "NPS",
      "promoter",
      "detractor (unless the selected survey explicitly includes an NPS question)",
    ],
    warnings: [
      {
        id: "market_research.empty_variables",
        section: "variables",
        tone: "warning",
        kind: "empty_variables",
        message:
          "Market research datasets usually need demographic or segmentation variables such as age band, region, awareness level, or purchase intent.",
      },
    ],
    themeSuggestions: [
      "brand awareness",
      "product familiarity",
      "purchase intent",
      "usage frequency",
      "preference drivers",
      "barriers to purchase",
      "price sensitivity",
      "competitor consideration",
      "channel preference",
      "decision criteria",
      "ad recall",
      "message resonance",
    ],
    themeSuggestionsLabel: "market research",
    variablePresets: [
      { label: "Age Band", apiIdentifier: "age_band", description: "Respondent age range", options: [{ text: "18–24", weight: 20 }, { text: "25–34", weight: 28 }, { text: "35–44", weight: 24 }, { text: "45–54", weight: 16 }, { text: "55+", weight: 12 }] },
      { label: "Gender", apiIdentifier: "gender", description: "Respondent gender", options: [{ text: "Female", weight: 48 }, { text: "Male", weight: 48 }, { text: "Non-binary", weight: 2 }, { text: "Prefer not to say", weight: 2 }] },
      { label: "Income Band", apiIdentifier: "income_band", description: "Household income range", options: [{ text: "Under $50k", weight: 30 }, { text: "$50k–$100k", weight: 35 }, { text: "$100k–$150k", weight: 22 }, { text: "$150k+", weight: 13 }] },
      { label: "Region", apiIdentifier: "region", description: "Market region", options: [{ text: "North America", weight: 35 }, { text: "EMEA", weight: 30 }, { text: "APAC", weight: 25 }, { text: "LATAM", weight: 10 }] },
      { label: "Awareness Level", apiIdentifier: "awareness_level", description: "Brand awareness", options: [{ text: "Unaware", weight: 20 }, { text: "Aware", weight: 35 }, { text: "Familiar", weight: 30 }, { text: "Very familiar", weight: 15 }] },
      { label: "Product Familiarity", apiIdentifier: "product_familiarity", description: "How well they know the product", options: [{ text: "Never used", weight: 30 }, { text: "Tried once", weight: 25 }, { text: "Occasional", weight: 25 }, { text: "Regular", weight: 20 }] },
      { label: "Purchase Intent", apiIdentifier: "purchase_intent", description: "Likelihood to purchase", options: [{ text: "Very likely", weight: 20 }, { text: "Likely", weight: 30 }, { text: "Neutral", weight: 30 }, { text: "Unlikely", weight: 20 }] },
      { label: "Usage Frequency", apiIdentifier: "usage_frequency", description: "How often they use the category", options: [{ text: "Daily", weight: 25 }, { text: "Weekly", weight: 35 }, { text: "Monthly", weight: 25 }, { text: "Rarely", weight: 15 }] },
      { label: "Competitor Consideration", apiIdentifier: "competitor_consideration", description: "Where they sit vs competitors", options: [{ text: "Us only", weight: 30 }, { text: "Comparing options", weight: 45 }, { text: "Competitor-leaning", weight: 25 }] },
      { label: "Channel Preference", apiIdentifier: "channel_preference", description: "Preferred purchase channel", options: [{ text: "Online", weight: 45 }, { text: "In-store", weight: 30 }, { text: "Mobile app", weight: 20 }, { text: "Phone", weight: 5 }] },
    ],
    personaLabels: {
      promoter: {
        label: "High intent",
        description: "Interested respondents with stronger awareness, preference, or purchase intent.",
      },
      passive: {
        label: "Neutral / undecided",
        description: "Middle-ground respondents who are aware but not strongly committed.",
      },
      detractor: {
        label: "Low intent / resistant",
        description: "Low-interest respondents with barriers, objections, or preference for alternatives.",
      },
    },
    personaPresetLabels: {
      healthy: "Balanced study",
      nps: "High-intent skew",
      recovery: "Low-intent skew",
      polarized: "Polarized market",
    },
    personaHelperText:
      "Set how many respondents are high-intent, neutral, or low-intent. A spread across all three gives awareness, preference, and purchase-intent dashboards realistic segments.",
  },

  hierarchy_dashboard: {
    id: "hierarchy_dashboard",
    label: "Hierarchy dashboard",
    shortLabel: "Hierarchy",
    description:
      "Build data for dashboards split by region, location, department, manager, or other hierarchy variables.",
    themesVocabulary: "Dashboard themes",
    contextPlaceholder:
      "Example: Generate a hierarchy dashboard dataset with realistic variation across regions, locations, and teams. Give each node enough responses to make comparisons meaningful.",
    themeInputPlaceholder: "Type a dashboard theme and press Enter (e.g. location performance)",
    themeEmptyTitle: "No dashboard themes yet",
    contextChecklist: [
      "Hierarchy structure, such as region, location, team, manager, or department",
      "Nodes that should have meaningful response volume",
      "Comparison goals for the dashboard",
      "Existing SurveySparrow variables to reuse",
    ],
    assistantGuidance:
      "Optimize for hierarchy dashboard demos. Prioritize existing SurveySparrow variables, hierarchy-shaped variables, location/team/region segmentation, and enough variation across nodes. Avoid suggesting duplicate variables when existing SurveySparrow variables can be reused.",
    sectionOverrides: {
      context: { priority: "primary" },
      themes: {
        priority: "recommended",
        label: "Dashboard themes",
        description: "Themes that make results differ from one hierarchy node to the next.",
      },
      personas: {
        priority: "recommended",
        label: "Response mix",
        description: "The sentiment mix applied across every hierarchy node.",
      },
      languages: { priority: "optional" },
      countries: {
        priority: "primary",
        label: "Regions / markets",
        description: "Regions or markets to segment the hierarchy dashboard by.",
      },
      variables: {
        priority: "primary",
        label: "Hierarchy variables",
        description:
          "Region, brand, location, department, or team variables. Reuse existing SurveySparrow variables instead of creating duplicates.",
      },
      metadata: { priority: "optional" },
      timing: { priority: "recommended" },
    },
    variableEmphasis: [
      "existing SurveySparrow hierarchy variables first",
      "region",
      "location",
      "department",
      "team",
      "brand",
      "storefront",
    ],
    avoidTerms: ["duplicate hierarchy variables when workspace variables already fit"],
    warnings: [
      {
        id: "hierarchy.no_hierarchy_vars",
        section: "variables",
        tone: "warning",
        kind: "no_matching_variables",
        keywords: [
          "region",
          "location",
          "store",
          "team",
          "manager",
          "department",
          "brand",
          "franchise",
          "market",
        ],
        message:
          "Hierarchy dashboards need variables such as region, location, team, or department. Reuse existing SurveySparrow variables where you can instead of creating duplicates.",
      },
    ],
    themeSuggestions: [
      "regional experience",
      "location performance",
      "service consistency",
      "team responsiveness",
      "operational gaps",
      "manager effectiveness",
      "department comparison",
      "branch-level trends",
    ],
    themeSuggestionsLabel: "hierarchy dashboards",
    variablePresets: [
      { label: "Region", apiIdentifier: "region", description: "Top-level region", options: [{ text: "North", weight: 25 }, { text: "South", weight: 25 }, { text: "East", weight: 25 }, { text: "West", weight: 25 }] },
      { label: "Market", apiIdentifier: "market", description: "Market grouping", options: [{ text: "US", weight: 35 }, { text: "UK", weight: 25 }, { text: "DACH", weight: 20 }, { text: "APAC", weight: 20 }] },
      { label: "Location", apiIdentifier: "location", description: "Location / site", options: [{ text: "Location A", weight: 34 }, { text: "Location B", weight: 33 }, { text: "Location C", weight: 33 }] },
      { label: "Store", apiIdentifier: "store", description: "Storefront", options: [{ text: "Store 1", weight: 34 }, { text: "Store 2", weight: 33 }, { text: "Store 3", weight: 33 }] },
      { label: "Department", apiIdentifier: "department", description: "Department", options: [{ text: "Sales", weight: 34 }, { text: "Support", weight: 33 }, { text: "Operations", weight: 33 }] },
      { label: "Team", apiIdentifier: "team", description: "Team", options: [{ text: "Team Alpha", weight: 34 }, { text: "Team Bravo", weight: 33 }, { text: "Team Charlie", weight: 33 }] },
      { label: "Manager", apiIdentifier: "manager", description: "Reporting manager", options: [{ text: "Manager 1", weight: 34 }, { text: "Manager 2", weight: 33 }, { text: "Manager 3", weight: 33 }] },
      { label: "Brand", apiIdentifier: "brand", description: "Brand within the portfolio", options: [{ text: "Brand X", weight: 34 }, { text: "Brand Y", weight: 33 }, { text: "Brand Z", weight: 33 }] },
      { label: "Franchise", apiIdentifier: "franchise", description: "Franchise unit", options: [{ text: "Franchise 1", weight: 34 }, { text: "Franchise 2", weight: 33 }, { text: "Franchise 3", weight: 33 }] },
      { label: "Business Unit", apiIdentifier: "business_unit", description: "Business unit", options: [{ text: "Retail", weight: 34 }, { text: "Wholesale", weight: 33 }, { text: "Online", weight: 33 }] },
    ],
    personaLabels: {
      promoter: {
        label: "Positive nodes",
        description: "Respondents with stronger experiences in a hierarchy node.",
      },
      passive: {
        label: "Mixed nodes",
        description: "Neutral or inconsistent experiences across nodes.",
      },
      detractor: {
        label: "At-risk nodes",
        description: "Negative experiences that expose location, team, or department gaps.",
      },
    },
  },

  testimonial_advocacy: {
    id: "testimonial_advocacy",
    label: "Testimonials",
    shortLabel: "Testimonials",
    description:
      "Build promoter-heavy feedback for testimonials, advocacy, reviews, referrals, and customer story demos.",
    themesVocabulary: "Advocacy angles",
    contextPlaceholder:
      "Example: Generate a promoter-heavy testimonial dataset with natural, public-facing comments about product value, service quality, ease of use, trust, and measurable outcomes.",
    themeInputPlaceholder: "Type an advocacy angle and press Enter (e.g. time saved)",
    themeEmptyTitle: "No advocacy angles yet",
    contextChecklist: [
      "Product / service being endorsed",
      "Customer outcomes or value moments",
      "Type of quote or advocacy story desired",
      "Whether public sharing or consent is part of the survey",
    ],
    assistantGuidance:
      "Optimize for testimonial and advocacy use cases. Bias toward promoter-heavy responses, natural pull-quote-ready open text, consent/public-sharing variables, referral likelihood, and customer story angles.",
    sectionOverrides: {
      context: { priority: "primary" },
      themes: {
        priority: "primary",
        label: "Advocacy angles",
        description:
          "Story angles you want testimonials to touch on, such as value, quality, outcomes, trust, service, or ease of use.",
      },
      personas: {
        priority: "primary",
        label: "Advocacy mix",
        description:
          "Balance of advocates, neutral customers, and detractors. Testimonial datasets usually skew heavily toward advocates.",
      },
      languages: { priority: "optional" },
      countries: { priority: "optional" },
      variables: {
        priority: "recommended",
        label: "Testimonial segments",
        description:
          "Customer tier, product line, tenure, use case, outcome achieved, or consent-to-share flags.",
      },
      metadata: { priority: "secondary" },
      timing: { priority: "optional" },
    },
    variableEmphasis: [
      "customer tier",
      "tenure",
      "product line",
      "referral consent",
      "publish permission",
      "outcome achieved",
    ],
    avoidTerms: ["churn-heavy language", "dissatisfaction-heavy language"],
    warnings: [
      {
        id: "testimonial.not_promoter_heavy",
        section: "personas",
        tone: "warning",
        kind: "sentiment_below_promoter",
        minPromoter: 60,
        message:
          "Testimonial datasets work best when most respondents are advocates. Try setting Advocates to 65% or higher.",
      },
    ],
    themeSuggestions: [
      "measurable outcomes",
      "ease of adoption",
      "product value",
      "service quality",
      "trust and reliability",
      "customer support",
      "time saved",
      "recommendation reasons",
      "favorite features",
      "success story angle",
    ],
    themeSuggestionsLabel: "testimonial datasets",
    variablePresets: [
      { label: "Customer Type", apiIdentifier: "customer_type", description: "New / returning / long-term", options: [{ text: "New", weight: 30 }, { text: "Returning", weight: 35 }, { text: "Long-term", weight: 35 }] },
      { label: "Product Line", apiIdentifier: "product_line", description: "Product line", options: [{ text: "Line A", weight: 34 }, { text: "Line B", weight: 33 }, { text: "Line C", weight: 33 }] },
      { label: "Tenure", apiIdentifier: "tenure", description: "How long they've been a customer", options: [{ text: "Under 1 year", weight: 30 }, { text: "1–3 years", weight: 40 }, { text: "3+ years", weight: 30 }] },
      { label: "Use Case", apiIdentifier: "use_case", description: "Primary use case", options: [{ text: "Onboarding", weight: 30 }, { text: "Scaling", weight: 40 }, { text: "Optimization", weight: 30 }] },
      { label: "Outcome Achieved", apiIdentifier: "outcome_achieved", description: "Headline outcome", options: [{ text: "Time saved", weight: 34 }, { text: "Cost reduced", weight: 33 }, { text: "Revenue up", weight: 33 }] },
      { label: "Consent To Publish", apiIdentifier: "consent_to_publish", description: "Permission to share publicly", options: [{ text: "Yes", weight: 75 }, { text: "No", weight: 25 }] },
      { label: "Referral Interest", apiIdentifier: "referral_interest", description: "Willingness to refer", options: [{ text: "Very likely", weight: 45 }, { text: "Likely", weight: 35 }, { text: "Maybe", weight: 20 }] },
      { label: "Advocacy Segment", apiIdentifier: "advocacy_segment", description: "Advocacy tier", options: [{ text: "Champion", weight: 40 }, { text: "Supporter", weight: 40 }, { text: "Neutral", weight: 20 }] },
    ],
    personaLabels: {
      promoter: {
        label: "Advocates",
        description: "Happy customers likely to provide strong quotes or public feedback.",
      },
      passive: {
        label: "Neutral customers",
        description: "Satisfied but less expressive customers.",
      },
      detractor: {
        label: "Hesitant customers",
        description: "Customers with concerns or lower willingness to advocate.",
      },
    },
    personaPresetLabels: {
      healthy: "Balanced quotes",
      nps: "Advocacy-heavy",
      recovery: "Hesitant mix",
      polarized: "Polarized",
    },
    personaHelperText:
      "Testimonial datasets usually work best when advocates are the majority. Keep a small neutral or hesitant group for realism.",
  },

  multilingual_demo: {
    id: "multilingual_demo",
    label: "Multilingual demo",
    shortLabel: "Multilingual",
    description:
      "Build multilingual responses with aligned language metadata, locale, and natural open-text responses.",
    themesVocabulary: "Themes",
    contextPlaceholder:
      "Example: Generate a multilingual demo dataset with responses across English, Spanish, Hindi, and French. Open-text answers should read the way a native speaker would write them, rather than as literal translations.",
    themeInputPlaceholder: "Type a theme and press Enter (e.g. language accessibility)",
    contextChecklist: [
      "Languages and markets to represent",
      "Whether open text should sound native / local",
      "Locale, timezone, and browser-language expectations",
      "Any region-specific terminology",
    ],
    assistantGuidance:
      "Optimize for multilingual demos. Prioritize language distribution, locale consistency, browser language, timezone alignment, and natural open-text quality in each selected language.",
    sectionOverrides: {
      context: { priority: "recommended" },
      themes: { priority: "recommended" },
      personas: { priority: "recommended" },
      languages: {
        priority: "primary",
        label: "Language mix",
        description:
          "How responses split across languages. Each persona answers open-text questions in its own language, with names, cities, and time zones that fit.",
      },
      countries: {
        priority: "recommended",
        label: "Locales",
        description: "Limit which countries personas come from. Leave empty to use the countries that match each language.",
      },
      variables: {
        priority: "recommended",
        label: "Locale & segment variables",
        description: "Localization and segmentation variables for multilingual analysis.",
      },
      metadata: { priority: "recommended" },
      timing: { priority: "optional" },
    },
    variableEmphasis: [
      "language code",
      "locale",
      "country",
      "market segment",
      "browser language",
      "timezone",
    ],
    avoidTerms: ["English-only assumptions"],
    warnings: [
      {
        id: "multilingual.single_language",
        section: "languages",
        tone: "warning",
        kind: "single_active_language",
        message:
          "Multilingual demos work better with 2 to 4 languages and enough responses in each one.",
      },
    ],
    themeSuggestions: [
      "localized experience",
      "language accessibility",
      "regional expectations",
      "support clarity",
      "cultural relevance",
      "translation quality",
      "local market fit",
      "global consistency",
    ],
    themeSuggestionsLabel: "multilingual demos",
    variablePresets: [
      { label: "Language", apiIdentifier: "language", description: "Bound to each persona's assigned language", type: "PERSONA", personaField: "language" },
      { label: "Country", apiIdentifier: "country", description: "Bound to each persona's country", type: "PERSONA", personaField: "countryName" },
      { label: "City", apiIdentifier: "city", description: "Bound to each persona's city", type: "PERSONA", personaField: "city" },
      { label: "Locale", apiIdentifier: "locale", description: "BCP 47 locale", options: [{ text: "en-US", weight: 30 }, { text: "es-ES", weight: 25 }, { text: "fr-FR", weight: 25 }, { text: "de-DE", weight: 20 }] },
      { label: "Region", apiIdentifier: "region", description: "Market region", options: [{ text: "North America", weight: 35 }, { text: "EMEA", weight: 40 }, { text: "APAC", weight: 25 }] },
      { label: "Market Segment", apiIdentifier: "market_segment", description: "Domestic vs international", options: [{ text: "Domestic", weight: 55 }, { text: "International", weight: 45 }] },
    ],
    personaLabels: {
      promoter: {
        label: "Positive",
        description: "Positive responses written naturally in the assigned language.",
      },
      passive: {
        label: "Neutral",
        description: "Neutral responses written naturally in the assigned language.",
      },
      detractor: {
        label: "Negative",
        description: "Negative responses written naturally in the assigned language.",
      },
    },
  },

  support_csat_recovery: {
    id: "support_csat_recovery",
    label: "Support CSAT / recovery",
    shortLabel: "Support CSAT",
    description:
      "Build support feedback with case IDs, issue types, resolution status, detractor recovery, and root-cause themes.",
    themesVocabulary: "Issue themes",
    contextPlaceholder:
      "Example: Generate a support CSAT dataset with ticket IDs, issue categories, resolution outcomes, agent experience, wait time concerns, and recovery opportunities.",
    themeInputPlaceholder: "Type an issue theme and press Enter (e.g. response time)",
    themeEmptyTitle: "No issue themes yet",
    contextChecklist: [
      "Support scenario or ticket type",
      "Channels, issue categories, severity, or resolution status",
      "Recovery or closed-loop follow-up story",
      "Agent / team segmentation if relevant",
    ],
    assistantGuidance:
      "Optimize for support CSAT and recovery workflows. Suggest ticket/case variables, issue categories, severity, resolution status, support channel, agent/team segmentation, and realistic detractor/passive recovery narratives.",
    sectionOverrides: {
      context: { priority: "primary" },
      themes: {
        priority: "primary",
        label: "Issue themes",
        description:
          "Common issue categories and root causes you want represented in the dataset.",
      },
      personas: {
        priority: "primary",
        label: "Recovery mix",
        description:
          "Balance of satisfied, neutral, and dissatisfied support experiences. Recovery demos usually need a visible group of detractors and stories about how their issues were resolved.",
      },
      languages: { priority: "optional" },
      countries: { priority: "optional" },
      variables: {
        priority: "primary",
        label: "Ticket & support variables",
        description:
          "Ticket ID, issue type, severity, channel, resolution status, agent, or team.",
      },
      metadata: { priority: "optional" },
      timing: { priority: "recommended" },
    },
    variableEmphasis: [
      "ticket ID",
      "issue category",
      "severity",
      "channel",
      "resolution status",
      "agent",
      "team",
    ],
    warnings: [
      {
        id: "support.no_ticket_vars",
        section: "variables",
        tone: "warning",
        kind: "no_matching_variables",
        keywords: [
          "ticket",
          "case",
          "issue",
          "severity",
          "channel",
          "resolution",
          "agent",
        ],
        message:
          "Support CSAT demos work better with ticket ID, issue type, channel, severity, and resolution status variables.",
      },
    ],
    themeSuggestions: [
      "issue resolution",
      "response time",
      "agent helpfulness",
      "communication clarity",
      "escalation experience",
      "first contact resolution",
      "product issue",
      "billing issue",
      "technical support",
      "follow-up quality",
    ],
    themeSuggestionsLabel: "support recovery",
    variablePresets: [
      { label: "Ticket ID", apiIdentifier: "ticket_id", description: "Numeric ticket / case ID", type: "NUMBER", number: { min: 100000, max: 999999 } },
      { label: "Issue Type", apiIdentifier: "issue_type", description: "Category of the issue", options: [{ text: "Billing", weight: 22 }, { text: "Technical", weight: 33 }, { text: "Account", weight: 20 }, { text: "Product", weight: 20 }, { text: "Other", weight: 5 }] },
      { label: "Severity", apiIdentifier: "severity", description: "Issue severity", options: [{ text: "Low", weight: 35 }, { text: "Medium", weight: 35 }, { text: "High", weight: 22 }, { text: "Critical", weight: 8 }] },
      { label: "Support Channel", apiIdentifier: "support_channel", description: "Channel the case came in on", options: [{ text: "Email", weight: 35 }, { text: "Chat", weight: 30 }, { text: "Phone", weight: 20 }, { text: "Portal", weight: 15 }] },
      { label: "Resolution Status", apiIdentifier: "resolution_status", description: "Where the case ended up", options: [{ text: "Resolved", weight: 45 }, { text: "Pending", weight: 25 }, { text: "Escalated", weight: 20 }, { text: "Unresolved", weight: 10 }] },
      { label: "Agent Team", apiIdentifier: "agent_team", description: "Team that handled the case", options: [{ text: "Tier 1", weight: 50 }, { text: "Tier 2", weight: 35 }, { text: "Specialist", weight: 15 }] },
      { label: "Escalation Status", apiIdentifier: "escalation_status", description: "Escalation state", options: [{ text: "None", weight: 65 }, { text: "Escalated", weight: 28 }, { text: "Re-escalated", weight: 7 }] },
      { label: "First Contact Resolution", apiIdentifier: "first_contact_resolution", description: "Resolved on first contact?", options: [{ text: "Yes", weight: 60 }, { text: "No", weight: 40 }] },
      { label: "Case Created Date", apiIdentifier: "case_created_date", description: "When the case was opened (last 30 days)", type: "DATE", date: { relativeDays: 30 } },
    ],
    personaLabels: {
      promoter: {
        label: "Resolved well",
        description: "Satisfied support experiences with clear resolution.",
      },
      passive: {
        label: "Partially resolved",
        description: "Mixed experiences with some friction or delay.",
      },
      detractor: {
        label: "Needs recovery",
        description: "Unresolved or frustrating support experiences that need follow-up.",
      },
    },
    personaPresetLabels: {
      healthy: "Balanced support",
      nps: "Mostly resolved",
      recovery: "Recovery-heavy",
      polarized: "Polarized support",
    },
    personaHelperText:
      "Support recovery datasets usually need enough dissatisfied or partially resolved experiences to make root-cause and follow-up dashboards meaningful.",
  },

  migration_import_test: {
    id: "migration_import_test",
    label: "Migration / import test",
    shortLabel: "Migration test",
    description:
      "Build a technical validation dataset to test question types, variables, dates, metadata, and import behavior.",
    themesVocabulary: "Validation focus",
    contextPlaceholder:
      "Example: Generate a technical import test dataset that covers all supported question types, variables, date ranges, languages, metadata, and edge cases. Prioritize validation over polished customer-facing storytelling.",
    themeInputPlaceholder: "Type a validation focus and press Enter (e.g. date handling)",
    themeEmptyTitle: "No validation focus areas yet",
    themeEmptyDescription:
      "Add focus areas so the dataset covers the formats, variables, and edge cases you want to test.",
    contextChecklist: [
      "Question types to stress-test",
      "Variable formats to validate",
      "Date / number / string / persona-bound edge cases",
      "Metadata and API behavior to check",
      "Whether output should be realistic or intentionally coverage-heavy",
    ],
    assistantGuidance:
      "Optimize for import and migration validation. Focus on coverage, edge cases, variable formats, date handling, metadata, required questions, and question-type compatibility rather than polished demo storytelling.",
    sectionOverrides: {
      context: { priority: "optional" },
      themes: {
        priority: "optional",
        label: "Validation focus",
        description: "The areas the import test should cover. Aim for coverage; the data doesn't need to look polished.",
      },
      personas: {
        priority: "optional",
        label: "Test coverage mix",
        description: "The sentiment mix for test coverage. It doesn't need to tell a story.",
      },
      languages: { priority: "recommended" },
      countries: { priority: "optional" },
      variables: {
        priority: "primary",
        label: "Import variables",
        description:
          "Cover every variable type and edge case: STRING options, STRING examples, NUMBER decimals, DATE ranges, and persona-bound fields.",
      },
      metadata: { priority: "recommended" },
      timing: { priority: "optional" },
    },
    variableEmphasis: [
      "STRING options",
      "STRING examples",
      "NUMBER decimals",
      "DATE relative",
      "DATE range",
      "PERSONA-bound fields",
      "edge cases",
    ],
    avoidTerms: ["polished demo storytelling"],
    warnings: [
      {
        id: "migration.info_note",
        section: "context",
        tone: "info",
        kind: "always",
        message:
          "Migration / import test datasets are meant for validation. They may not look like polished customer-facing demo data.",
      },
    ],
    themeSuggestions: [
      "required question coverage",
      "matrix question coverage",
      "variable mapping",
      "date handling",
      "multilingual text",
      "metadata validation",
      "edge cases",
      "long text handling",
      "rating distribution",
      "conditional logic",
    ],
    themeSuggestionsLabel: "import testing",
    variablePresets: [
      { label: "String Option Test", apiIdentifier: "string_option_test", description: "STRING with weighted options", options: [{ text: "Alpha", weight: 34 }, { text: "Beta", weight: 33 }, { text: "Gamma", weight: 33 }] },
      { label: "Number Range Test", apiIdentifier: "number_range_test", description: "NUMBER within an integer range", type: "NUMBER", number: { min: 1, max: 100 } },
      { label: "Decimal Amount Test", apiIdentifier: "decimal_amount_test", description: "NUMBER with 2 decimal places", type: "NUMBER", number: { min: 0, max: 1000, allowDecimals: true, decimalPlaces: 2 } },
      { label: "Date Range Test", apiIdentifier: "date_range_test", description: "DATE within the last 90 days", type: "DATE", date: { relativeDays: 90 } },
      { label: "Persona Field Test", apiIdentifier: "persona_field_test", description: "Bound to each persona's city", type: "PERSONA", personaField: "city" },
      { label: "Blank Value Test", apiIdentifier: "blank_value_test", description: "STRING that is blank ~30% of the time", options: [{ text: "Value A", weight: 40 }, { text: "Value B", weight: 30 }], allowBlank: true, blankWeight: 30 },
      { label: "Long Text Segment", apiIdentifier: "long_text_segment", description: "Exercises long variable values", options: [{ text: "Short label", weight: 50 }, { text: "A considerably longer descriptive segment label used to exercise long text handling during import", weight: 50 }] },
      { label: "Metadata Segment", apiIdentifier: "metadata_segment", description: "Segment for metadata validation", options: [{ text: "Organic", weight: 40 }, { text: "Campaign", weight: 35 }, { text: "Referral", weight: 25 }] },
    ],
    personaLabels: {
      promoter: {
        label: "Positive test cases",
        description: "High-rating responses used to validate positive paths.",
      },
      passive: {
        label: "Neutral test cases",
        description: "Mid-rating responses used to validate neutral paths.",
      },
      detractor: {
        label: "Negative test cases",
        description: "Low-rating responses used to validate negative paths.",
      },
    },
    personaHelperText:
      "Use the test coverage mix to cover positive, neutral, and negative paths. This data is for validation, so it doesn't need to read like a polished demo.",
  },

  custom: {
    id: "custom",
    label: "Custom",
    shortLabel: "Custom",
    description: "No preset. Set up every section yourself.",
    themesVocabulary: "Themes",
    contextPlaceholder: CUSTOM_CONTEXT_PLACEHOLDER,
    assistantGuidance:
      "Use the user's context and survey structure without applying a specific dataset-purpose preset.",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a purpose to its metadata, defaulting to "custom" when the
 * argument is undefined or unknown. Safe for use in components that
 * subscribe to `draft.datasetPurpose` — the returned object is always
 * populated, so callers never need to null-check.
 */
export function getDatasetPurposeMeta(
  purpose: DatasetPurpose | undefined | null,
): DatasetPurposeMeta {
  if (purpose && isDatasetPurpose(purpose)) return DATASET_PURPOSES[purpose];
  return DATASET_PURPOSES.custom;
}

/**
 * Resolve the section override for a given (purpose, section) pair.
 * Returns null when no purpose is set, the purpose is "custom", or the
 * purpose simply doesn't reframe that section — in every one of those
 * cases the section keeps its own hardcoded title/description/badge, so
 * the pre-purpose UI is byte-identical. Sections call this once and
 * apply `label`/`description`/`priority` only if present.
 */
export function getSectionOverride(
  purpose: DatasetPurpose | undefined | null,
  section: ConfigureSectionId,
): SectionOverride | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  return DATASET_PURPOSES[purpose].sectionOverrides?.[section] ?? null;
}

// ---------------------------------------------------------------------------
// Suggestion + label accessors
// ---------------------------------------------------------------------------
//
// Each returns null / [] for custom / unset / purposes that don't define
// the data, so sections cleanly fall back to their existing behavior.

/** Purpose-specific theme/research-dimension suggestions + header label. */
export function getPurposeThemeSuggestions(
  purpose: DatasetPurpose | undefined | null,
): { themes: string[]; label: string } | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  const meta = DATASET_PURPOSES[purpose];
  if (!meta.themeSuggestions || meta.themeSuggestions.length === 0) return null;
  return {
    themes: meta.themeSuggestions,
    label: meta.themeSuggestionsLabel ?? meta.label.toLowerCase(),
  };
}

/** Purpose-specific variable preset chips (empty array when none). */
export function getPurposeVariablePresets(
  purpose: DatasetPurpose | undefined | null,
): PurposeVariablePreset[] {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return [];
  return DATASET_PURPOSES[purpose].variablePresets ?? [];
}

/** Persona bucket display labels + descriptions (null = use defaults). */
export function getPurposePersonaLabels(
  purpose: DatasetPurpose | undefined | null,
): DatasetPurposeMeta["personaLabels"] | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  return DATASET_PURPOSES[purpose].personaLabels ?? null;
}

/** Relabel for a persona preset card by id (null = keep the default label). */
export function getPurposePersonaPresetLabel(
  purpose: DatasetPurpose | undefined | null,
  presetId: string,
): string | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  return DATASET_PURPOSES[purpose].personaPresetLabels?.[presetId] ?? null;
}

/** Replacement PersonasSection helper text (null = keep the default). */
export function getPurposePersonaHelperText(
  purpose: DatasetPurpose | undefined | null,
): string | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  return DATASET_PURPOSES[purpose].personaHelperText ?? null;
}

/** ThemesSection input placeholder (null = keep the default). */
export function getPurposeThemeInputPlaceholder(
  purpose: DatasetPurpose | undefined | null,
): string | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  return DATASET_PURPOSES[purpose].themeInputPlaceholder ?? null;
}

/** ThemesSection empty-state title + description (null = keep defaults). */
export function getPurposeThemeEmptyState(
  purpose: DatasetPurpose | undefined | null,
): { title: string | null; description: string | null } | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  const meta = DATASET_PURPOSES[purpose];
  if (!meta.themeEmptyTitle && !meta.themeEmptyDescription) return null;
  return {
    title: meta.themeEmptyTitle ?? null,
    description: meta.themeEmptyDescription ?? null,
  };
}

/** ContextSection "What to include" bullets (null = keep the default list). */
export function getPurposeContextChecklist(
  purpose: DatasetPurpose | undefined | null,
): string[] | null {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return null;
  return DATASET_PURPOSES[purpose].contextChecklist ?? null;
}

// ---------------------------------------------------------------------------
// Warning evaluation (Stage 2)
// ---------------------------------------------------------------------------

/**
 * Structural subset of ProfileDraft that warning evaluation reads.
 * Declared locally (not imported from profiles/types.ts) so this module
 * stays free of a circular import — ProfileDraft satisfies this shape
 * structurally, so callers pass the draft directly:
 *   evaluateWarnings(draft.datasetPurpose, draft)
 */
export interface WarningDraftInput {
  customVariables: ReadonlyArray<{ apiIdentifier: string; label: string }>;
  personaDistribution: { promoter: number; passive: number; detractor: number };
  languageDistribution: ReadonlyArray<{ code: string; weight: number }>;
}

/**
 * Return the warnings that currently apply for a purpose + draft state.
 * Pure and read-only: it inspects the draft and returns which warnings
 * should show. It NEVER mutates anything, blocks anything, or adds
 * variables. Returns [] for custom / unset / purposes with no warnings.
 */
export function evaluateWarnings(
  purpose: DatasetPurpose | undefined | null,
  draft: WarningDraftInput,
): EvaluatedWarning[] {
  if (!purpose || !isDatasetPurpose(purpose) || purpose === "custom") return [];
  const rules = DATASET_PURPOSES[purpose].warnings;
  if (!rules || rules.length === 0) return [];

  const out: EvaluatedWarning[] = [];
  for (const rule of rules) {
    if (warningApplies(rule, draft)) {
      out.push({
        id: rule.id,
        section: rule.section,
        tone: rule.tone,
        message: rule.message,
      });
    }
  }
  return out;
}

function warningApplies(rule: WarningRule, draft: WarningDraftInput): boolean {
  switch (rule.kind) {
    case "always":
      return true;
    case "empty_variables":
      return draft.customVariables.length === 0;
    case "no_matching_variables": {
      const haystacks = draft.customVariables.map((v) =>
        `${v.apiIdentifier} ${v.label}`.toLowerCase(),
      );
      const keywords = rule.keywords.map((k) => k.toLowerCase());
      const anyMatch = haystacks.some((h) => keywords.some((k) => h.includes(k)));
      // Fires when nothing matches — which includes the zero-variables case.
      return !anyMatch;
    }
    case "sentiment_below_promoter":
      return draft.personaDistribution.promoter < rule.minPromoter;
    case "single_active_language":
      return draft.languageDistribution.filter((l) => l.weight > 0).length < 2;
    default: {
      // Exhaustiveness guard — adding a WarningRule kind forces a case here.
      const _exhaustive: never = rule;
      void _exhaustive;
      return false;
    }
  }
}

/**
 * Type guard for validating serialized values (from imported profile JSON,
 * URL params, LLM payloads, etc.). Rejects anything that isn't one of the
 * known slugs so a rogue value can't poison the type system.
 */
export function isDatasetPurpose(value: unknown): value is DatasetPurpose {
  return (
    typeof value === "string" &&
    (DATASET_PURPOSE_IDS as readonly string[]).includes(value)
  );
}
