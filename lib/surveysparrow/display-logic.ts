// Display-logic evaluator (phase: display-logic-respect).
//
// SurveySparrow surfaces conditional-show rules on each question:
//
//   {
//     "display_logic": {
//       "version": "1",
//       "logics": [{
//         "join_condition": "and",
//         "type": "question",
//         "comparator": "isSelected",
//         "question_id": 1004040340,
//         "choice_id": 1007061174,
//         "value": ""
//       }]
//     }
//   }
//
// Plumage used to ignore this entirely — every persona got an answer for
// every answerable question, including conditionally-shown ones, which
// produced unrealistic payloads (e.g. an answer to "Which performer did
// you see?" from a persona who said they didn't attend a show).
//
// This module evaluates logic deterministically AFTER the LLM produces
// answers, so we can DROP answers for questions that wouldn't have been
// shown to a given persona. The evaluator handles both display_logic AND
// jump_logic — the latter is structurally identical from a "should this
// question be answered?" perspective when we walk questions in order.
//
// Design choices worth knowing:
//
//   • Unknown comparators default to "show". Hiding a question on
//     ambiguous logic risks dropping a legitimate answer; showing
//     just sends a slightly-too-many-answers payload (SS tolerates it).
//
//   • Chained logic (Q3 depends on Q2 which depends on Q1) is resolved
//     by computing a "shown set" in survey order, so each evaluation
//     only sees answers from questions that are themselves shown.
//
//   • Variable-typed logic gates use `persona.variableValues`. Plumage
//     resolves these into concrete strings/numbers at generation time,
//     so by push time the persona has a definite value to compare.

import type {
  LogicCondition,
  LogicComparator,
  Question,
  QuestionLogic,
} from "@/lib/surveysparrow/types";
import {
  compareQuestionPositions,
  extractQuestionDisplay,
} from "@/lib/surveysparrow/types";
import type { AnswerValue } from "@/lib/generation/response-types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LogicEvalContext {
  /** Answers keyed by question ID for the persona under evaluation.
   *  When chained logic is involved the caller should restrict this to
   *  answers of already-confirmed-shown questions (see computeShownQuestions
   *  below). */
  answersByQuestionId: Map<number, AnswerValue>;
  /** Variable values for the persona. Keys are the snake_case
   *  apiIdentifier the SS dashboard / our custom-variables form uses. */
  variableValues: Record<string, string | number>;
}

/**
 * Evaluate a single QuestionLogic block. Returns true ("show this question")
 * when the logic passes or is missing/empty. Returns false only when logic
 * is present and at least one of its conditions definitively fails (after
 * joining via and/or).
 */
export function evaluateLogic(
  logic: QuestionLogic | null | undefined,
  ctx: LogicEvalContext,
): boolean {
  if (!logic) return true;
  const conditions = Array.isArray(logic.logics) ? logic.logics : [];
  if (conditions.length === 0) return true;

  // Walk conditions in order. The first condition's join_condition is
  // ignored (no left-hand side yet); subsequent conditions combine with
  // their own join_condition. SS treats this as a flat fold; we mirror
  // that. (If SS ever introduces grouped/nested logic, we'd port the
  // tree shape here — the input array doesn't model that today.)
  let result = evaluateOne(conditions[0]!, ctx);
  for (let i = 1; i < conditions.length; i++) {
    const c = conditions[i]!;
    const passes = evaluateOne(c, ctx);
    result = c.join_condition === "or" ? result || passes : result && passes;
  }
  return result;
}

/**
 * Walk the supplied questions in survey order and return the set of
 * question IDs that would have been shown to a persona whose answers +
 * variables match `ctx`. Chained logic is handled correctly — a child
 * question's evaluation only considers answers from QUESTIONS ALREADY
 * IN THE SHOWN SET.
 *
 * The returned Set always includes every question without logic (or
 * with empty logic), so callers can use this as a strict "include in
 * push payload?" gate without filtering further.
 */
export function computeShownQuestions(
  questions: Question[],
  ctx: LogicEvalContext,
): Set<number> {
  // CRITICAL: sort by (section.position, question.position) — see
  // compareQuestionPositions header for the bug history. Sorting by
  // question.position alone silently scrambles survey order across
  // sections and breaks gate-evaluation order.
  const sorted = [...questions].sort(compareQuestionPositions);
  const shown = new Set<number>();
  // We build a progressively-larger "confirmed shown" answer map, so each
  // question's logic only sees answers from questions earlier in the
  // survey that themselves passed.
  const confirmedAnswers = new Map<number, AnswerValue>();
  for (const q of sorted) {
    // Combine BOTH display_logic and jump_logic checks. Either one can
    // gate visibility:
    //   - display_logic: "show me only if condition X" → standard show/hide.
    //   - jump_logic on an EARLIER question: that earlier question's
    //     answer could have skipped past us. We don't model jump-logic
    //     fully in this pass (it's order-dependent across many questions);
    //     for now the per-question display_logic is the bulk of real-world
    //     usage and what the user explicitly asked for. Jump-logic-driven
    //     skipping is tracked as a follow-up.
    const passes =
      evaluateLogic(q.display_logic, {
        answersByQuestionId: confirmedAnswers,
        variableValues: ctx.variableValues,
      });
    if (passes) {
      shown.add(q.id);
      const a = ctx.answersByQuestionId.get(q.id);
      if (a) confirmedAnswers.set(q.id, a);
    }
  }
  return shown;
}

// ---------------------------------------------------------------------------
// Single-condition evaluator
// ---------------------------------------------------------------------------

function evaluateOne(c: LogicCondition, ctx: LogicEvalContext): boolean {
  // Unknown / missing type → default to "show". Logic blocks without a
  // type field have been seen in some workspaces.
  const type = c.type === "variable" ? "variable" : "question";

  if (type === "question") {
    if (c.question_id == null) return true; // malformed — show
    const answer = ctx.answersByQuestionId.get(c.question_id);
    return compareQuestionAnswer(c, answer);
  }

  // type === "variable"
  const key = c.variable_name ?? (typeof c.variable_id === "string" ? c.variable_id : "");
  if (!key) return true; // can't resolve — show
  const value = ctx.variableValues[key];
  return compareVariableValue(c, value);
}

function compareQuestionAnswer(
  c: LogicCondition,
  answer: AnswerValue | undefined,
): boolean {
  // "isAnswered" / "isNotAnswered" — special: doesn't compare values,
  // just checks whether an answer exists.
  if (c.comparator === "isAnswered") return answer != null;
  if (c.comparator === "isNotAnswered") return answer == null;
  // Beyond these two, an absent answer means the upstream question wasn't
  // shown (or wasn't reachable), which can't satisfy a value comparator.
  if (!answer) return false;

  switch (c.comparator as LogicComparator) {
    case "isSelected":
      return answerIncludesChoice(answer, toInt(c.choice_id));
    case "isNotSelected":
      return !answerIncludesChoice(answer, toInt(c.choice_id));
    case "equals":
      return answerEquals(answer, c.value);
    case "notEquals":
      return !answerEquals(answer, c.value);
    case "greaterThan":
      return numericAnswerCompare(answer, c.value, (a, b) => a > b);
    case "lessThan":
      return numericAnswerCompare(answer, c.value, (a, b) => a < b);
    case "greaterThanOrEqual":
      return numericAnswerCompare(answer, c.value, (a, b) => a >= b);
    case "lessThanOrEqual":
      return numericAnswerCompare(answer, c.value, (a, b) => a <= b);
    case "contains":
      return textAnswerContains(answer, c.value);
    case "doesNotContain":
      return !textAnswerContains(answer, c.value);
    case "startsWith":
      return textAnswerStartsWith(answer, c.value);
    case "endsWith":
      return textAnswerEndsWith(answer, c.value);
    default:
      // Unknown comparator — default to "show this question". Safer than
      // dropping a legitimate answer just because we don't recognise an
      // SS-side comparator name.
      return true;
  }
}

function compareVariableValue(
  c: LogicCondition,
  value: string | number | undefined,
): boolean {
  if (c.comparator === "isAnswered") return value != null && value !== "";
  if (c.comparator === "isNotAnswered") return value == null || value === "";
  if (value == null) return false;

  switch (c.comparator as LogicComparator) {
    case "equals":
      return stringEqual(value, c.value);
    case "notEquals":
      return !stringEqual(value, c.value);
    case "contains":
      return String(value).toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "doesNotContain":
      return !String(value).toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "startsWith":
      return String(value).toLowerCase().startsWith(String(c.value ?? "").toLowerCase());
    case "endsWith":
      return String(value).toLowerCase().endsWith(String(c.value ?? "").toLowerCase());
    case "greaterThan":
    case "lessThan":
    case "greaterThanOrEqual":
    case "lessThanOrEqual": {
      const lhs = typeof value === "number" ? value : parseFloat(String(value));
      const rhs = typeof c.value === "number" ? c.value : parseFloat(String(c.value ?? ""));
      if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) return true;
      if (c.comparator === "greaterThan") return lhs > rhs;
      if (c.comparator === "lessThan") return lhs < rhs;
      if (c.comparator === "greaterThanOrEqual") return lhs >= rhs;
      return lhs <= rhs;
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Answer-shape primitives
// ---------------------------------------------------------------------------

function answerIncludesChoice(answer: AnswerValue, choiceId: number | null): boolean {
  if (choiceId == null) return false;
  switch (answer.type) {
    case "single_choice":
    case "dropdown":
      return answer.choiceId === choiceId;
    case "multi_choice":
      return answer.choices.some((c) => c.id === choiceId);
    case "ranking":
      return answer.orderedChoiceIds.includes(choiceId);
    default:
      return false;
  }
}

function answerEquals(answer: AnswerValue, target: unknown): boolean {
  switch (answer.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
    case "date":
      return stringEqual(answer.value, target);
    case "number":
    case "nps":
    case "csat":
    case "ces":
    case "rating":
    case "opinion_scale":
    case "slider": {
      const lhs = answer.value;
      const rhs = typeof target === "number" ? target : parseFloat(String(target ?? ""));
      if (!Number.isFinite(rhs)) return false;
      return lhs === rhs;
    }
    case "yes_no":
      // SS surfaces "Yes" / "No" or true/false.
      return stringEqual(answer.value ? "Yes" : "No", target) || stringEqual(answer.value, target);
    case "single_choice":
    case "dropdown":
      // Some SS workspaces store the COMPARE VALUE as the choice id (string).
      return stringEqual(answer.choiceId, target);
    default:
      return false;
  }
}

function numericAnswerCompare(
  answer: AnswerValue,
  target: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  const rhs = typeof target === "number" ? target : parseFloat(String(target ?? ""));
  if (!Number.isFinite(rhs)) return false;
  switch (answer.type) {
    case "number":
    case "nps":
    case "csat":
    case "ces":
    case "rating":
    case "opinion_scale":
    case "slider":
      return cmp(answer.value, rhs);
    default:
      return false;
  }
}

function textAnswerContains(answer: AnswerValue, needle: unknown): boolean {
  const s = needleStringRequired(needle);
  if (s == null) return false;
  switch (answer.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
      return answer.value.toLowerCase().includes(s);
    default:
      return false;
  }
}
function textAnswerStartsWith(answer: AnswerValue, needle: unknown): boolean {
  const s = needleStringRequired(needle);
  if (s == null) return false;
  switch (answer.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
      return answer.value.toLowerCase().startsWith(s);
    default:
      return false;
  }
}
function textAnswerEndsWith(answer: AnswerValue, needle: unknown): boolean {
  const s = needleStringRequired(needle);
  if (s == null) return false;
  switch (answer.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
      return answer.value.toLowerCase().endsWith(s);
    default:
      return false;
  }
}
function needleStringRequired(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s.length === 0 ? null : s;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInt(n: number | null | undefined): number | null {
  if (n == null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function stringEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a === b;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// (parsePosition removed — replaced by compareQuestionPositions in
// lib/surveysparrow/types.ts which correctly handles section ordering.)

// ---------------------------------------------------------------------------
// Human-readable description (was private inside response-prompt.ts;
// extracted so QuestionPreview.tsx can render Conditional badges too)
// ---------------------------------------------------------------------------
//
// Renders a QuestionLogic block as a one-liner intended for two consumers:
//   1. The response prompt, which tells the LLM "you don't have to answer
//      this for Promoters" as a token-saving hint (validator's evaluator
//      is still the source of truth).
//   2. Step 2's Question Preview, which shows the same string in a
//      tooltip so SEs can see which upstream picks gate each question.
//
// Callers pass a `Map<number, Question>` for upstream lookup. That keeps
// the helper independent of RenderedQuestion (the prompt module's
// internal shape) and lets the Question Preview call it with raw
// questions straight from the SS API.
//
// Examples:
//   - Q3 includes choice "Yes, I attended a show" (id=1234)
//   - Q5 ≤ 6 AND Q7 includes choice "Service" (id=789)
//   - variable loyalty_tier equals "Gold"

export function describeDisplayLogic(
  logic: QuestionLogic | null | undefined,
  questionsById: Map<number, Question>,
): string | null {
  if (!logic?.logics || logic.logics.length === 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < logic.logics.length; i++) {
    const c = logic.logics[i]!;
    if (i > 0) {
      parts.push(c.join_condition === "or" ? " OR " : " AND ");
    }
    parts.push(describeCondition(c, questionsById));
  }
  return parts.join("");
}

function describeCondition(
  c: LogicCondition,
  questionsById: Map<number, Question>,
): string {
  if (c.type === "variable") {
    const v = c.variable_name ?? c.variable_id ?? "?";
    if (c.comparator === "isAnswered") return `variable ${v} is set`;
    if (c.comparator === "isNotAnswered") return `variable ${v} is empty`;
    return `variable ${v} ${humanComparator(c.comparator)} ${JSON.stringify(c.value ?? "")}`;
  }
  // type === "question"
  const qid = c.question_id ?? 0;
  const upstream = questionsById.get(qid);
  const upstreamDisplay = upstream ? extractQuestionDisplay(upstream) : null;
  const ref = upstream ? `Q${upstream.position}` : `question id=${qid}`;
  switch (c.comparator) {
    case "isSelected": {
      if (c.choice_id != null) {
        const choiceText = upstreamDisplay?.choices?.find((ch) => ch.id === c.choice_id)?.text;
        return choiceText
          ? `${ref} includes choice "${choiceText}" (id=${c.choice_id})`
          : `${ref} includes choice id=${c.choice_id}`;
      }
      return `${ref} has a selection`;
    }
    case "isNotSelected": {
      if (c.choice_id != null) {
        const choiceText = upstreamDisplay?.choices?.find((ch) => ch.id === c.choice_id)?.text;
        return choiceText
          ? `${ref} does NOT include choice "${choiceText}" (id=${c.choice_id})`
          : `${ref} does NOT include choice id=${c.choice_id}`;
      }
      return `${ref} has no selection`;
    }
    case "isAnswered":
      return `${ref} is answered`;
    case "isNotAnswered":
      return `${ref} is not answered`;
    default:
      return `${ref} ${humanComparator(c.comparator)} ${JSON.stringify(c.value ?? "")}`;
  }
}

function humanComparator(c: string): string {
  switch (c) {
    case "equals": return "=";
    case "notEquals": return "≠";
    case "greaterThan": return ">";
    case "lessThan": return "<";
    case "greaterThanOrEqual": return "≥";
    case "lessThanOrEqual": return "≤";
    case "contains": return "contains";
    case "doesNotContain": return "does NOT contain";
    case "startsWith": return "starts with";
    case "endsWith": return "ends with";
    default: return c;
  }
}

// ---------------------------------------------------------------------------
// Piping heuristic (see comment: SS API does NOT expose piping metadata)
// ---------------------------------------------------------------------------
//
// SurveySparrow's `/v3/questions` payload does NOT surface piping refs as
// dedicated fields (no `piped_question_id`, no `piped_choice_id`, no
// `source_question_id`). The SS dashboard's piping feature inserts
// workspace-specific tokens into the question's rtxt/html_text field, but
// the token format is undocumented and varies. So we can't reliably
// resolve "this question is piped from Q3" from what the API gives us.
//
// This heuristic scans a question's rendered text for common placeholder
// patterns and flags the question as MAYBE-piped so the SE can spot-check
// generated answers. Never asserts confident detection — the badge in
// QuestionPreview says "may use piping" not "piped from ...".
//
// Detected patterns:
//   {{...}}    Handlebars-style ({{Q1}}, {{previous_answer}})
//   [[...]]    Markdown-linkish ([[Q1]], [[choice]])
//   #...#      Hash-delimited (#Q1#, #Answer#)
//   [Q1]       Bracketed question ref
//   %Q1%       Percent-delimited
//   @{...}     At-brace
//
// Kept liberal on purpose — false positives are fine (worst case: SE sees
// a warning on a non-piped question); false negatives are worse (SE
// doesn't know piping might be broken).

const PIPING_TOKEN_PATTERNS: RegExp[] = [
  /\{\{[^{}]{1,80}\}\}/,
  /\[\[[^\[\]]{1,80}\]\]/,
  /#[A-Za-z][A-Za-z0-9_]{0,60}#/,
  /\[Q\d{1,4}[^\]]{0,20}\]/i,
  /%[A-Za-z][A-Za-z0-9_]{0,60}%/,
  /@\{[^{}]{1,80}\}/,
];

/**
 * Returns true if the question's rendered text contains a token that
 * *looks* like a piping placeholder. See the module comment above for
 * caveats — this is a heuristic, not a confident detection.
 */
export function detectPipingHeuristic(q: Question): boolean {
  const display = extractQuestionDisplay(q);
  const candidates: string[] = [display.text, display.description ?? ""];
  // Also probe common raw fields in case rtxt HTML holds tokens the
  // display extractor stripped for readability.
  const rawFields: Array<keyof Question> = ["rtxt", "text", "html_text", "question_text", "title"];
  for (const key of rawFields) {
    const v = q[key];
    if (typeof v === "string") candidates.push(v);
  }
  for (const text of candidates) {
    if (!text) continue;
    for (const re of PIPING_TOKEN_PATTERNS) {
      if (re.test(text)) return true;
    }
  }
  return false;
}
