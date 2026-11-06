# SurveySparrow — Create a Response (API reference)

How to push survey responses (including **multiple-choice**) into SurveySparrow via the public REST API. Field shapes below are the ones we actually send in production from Plumage, so they match what SS accepts — not just the public docs.

---

## Endpoint

```
POST  https://api.surveysparrow.com/v3/responses/batch
```

Use the **batch** endpoint, not `POST /v3/responses`:
- Only batch supports **contact** creation (`full_name` / `email` / `phone`) per response.
- Accepts up to **200** responses per call.

**Base URL is per data center** — swap the host for non-US accounts:

| Region | Base URL |
|---|---|
| US | `https://api.surveysparrow.com` |
| EU | `https://eu-api.surveysparrow.com` |
| UK | `https://eu-ln-api.surveysparrow.com` |
| APAC / IN | `https://ap-api.surveysparrow.com` |
| CA | `https://ca-api.surveysparrow.com` |
| ME | `https://me-api.surveysparrow.com` |

## Headers

```
Authorization: Bearer <YOUR_ACCOUNT_API_KEY>
Content-Type: application/json
```

---

## Multiple-choice: the one rule to remember

A choice answer's value is **an array of the choice *option IDs*** (numbers) — **not** the option text — and it's an array **even for single-select**.

| Question type | `answer` value | Example |
|---|---|---|
| Single-select (radio) / Dropdown | `[optionId]` (one-element array) | `[456789]` |
| Multi-select (checkbox) | `[optionId, …]` | `[456820, 456821]` |

> Get `question_id` and the per-option `id`s from `GET /v3/questions?survey_id=<id>` first. You're sending the numeric option **id**, never the label.

---

## Request body

```json
{
  "survey_id": 123456,
  "responses": [
    {
      "answers": [
        { "question_id": 789012, "answer": [456789] },
        { "question_id": 789013, "answer": [456820, 456821] }
      ],
      "contact": {
        "full_name": "Jordan Lee",
        "email": "jordan.lee@example.com",
        "contact_type": "contact"
      },
      "trigger_workflow": false,
      "meta_data": {
        "device_type": "COMPUTER",
        "browser": "Chrome",
        "os": "macOS",
        "time_zone": "America/New_York",
        "language": "en",
        "date_time": "2026-10-02T14:03:00.000Z"
      }
    }
  ]
}
```

- `survey_id` lives at the **top level**; each item in `responses[]` does **not** repeat it.
- `answers[]` line 1 = single-select; line 2 = multi-select.
- `trigger_workflow: false` keeps imports from firing automation / notification rules — set `true` only if you want them to.
- Everything under `meta_data` is optional; include what you need. `channel_id` (optional, per item) routes the response to a specific channel.

---

## Submit → poll for completion

The batch submit returns a **token**. Poll until the job finishes:

```
GET  https://api.surveysparrow.com/v3/responses/status/{token}
```

> An HTTP 200 from the status endpoint only means SS answered your poll — **inspect the body** for per-item success/failure before assuming the batch landed. Re-submitting a batch you can't confirm risks duplicates.

---

## Answer-shape cheat sheet (all question types)

Every entry goes in the item's `answers[]` array.

### Simple / scalar
| Type | Shape |
|---|---|
| Text / Long text / URL / Email | `{ "question_id": q, "answer": "free text" }` |
| Number | `{ "question_id": q, "answer": 42 }` |
| NPS / CSAT / CES / Rating / Opinion Scale / Slider | `{ "question_id": q, "answer": 9 }` |
| Yes/No | `{ "question_id": q, "answer": "Yes" }`  (literal `"Yes"` / `"No"`) |
| Date | `{ "question_id": q, "answer": "2026-10-02", "time_zone": "America/New_York" }` |
| Phone | `{ "question_id": q, "answer": "+16824331083", "region_code": "US" }` — must be **E.164** (digits only, leading `+CC`); `region_code` is mandatory |

### Choice
| Type | Shape |
|---|---|
| Single-select / Dropdown | `{ "question_id": q, "answer": [optionId] }` |
| Multi-select | `{ "question_id": q, "answer": [id1, id2, …] }` |
| Ranking | `{ "question_id": q, "answer": [idRank1, idRank2, …] }` — array in ranked order |

### Grouped / Matrix — one entry **per row**, each with `parent_question_id`
Here `question_id` is the **row** id and `parent_question_id` is the parent question's id.

| Type | Shape (per row) |
|---|---|
| Group Rating | `{ "question_id": rowId, "parent_question_id": q, "answer": 8 }` |
| Constant Sum | `{ "question_id": rowId, "parent_question_id": q, "answer": 25 }` |
| Matrix (single / multi select) | `{ "question_id": rowId, "parent_question_id": q, "answer": [colId, …] }` |
| Matrix Dropdown | `{ "question_id": rowId, "parent_question_id": q, "answer": [choiceId] }` |
| Matrix Text | `{ "question_id": rowId, "parent_question_id": q, "answer": [colId, …], "matrix_txt": ["text", …] }` |
| Matrix Rating | `{ "question_id": rowId, "parent_question_id": q, "answer": [colId, …], "matrix_int": [val, …] }` |

For Matrix Text/Rating, `answer` (column IDs) and `matrix_txt` / `matrix_int` are **parallel arrays** — index *i* pairs the column with its value.

---

## Optional item fields

| Field | Notes |
|---|---|
| `contact` | `{ full_name, email?, phone?, contact_type: "contact" }`. `phone` uses the same E.164 rule as a phone answer. |
| `trigger_workflow` | `false` for clean imports; `true` to fire rules. |
| `channel_id` | Route this response to a specific channel. |
| `variables` | `{ "<variable_name>": "<value>" }` — populate custom/CRM variables on the response. |
| `meta_data` | `device_type` (`COMPUTER` / `MOBILE` / `TABLET`), `browser`, `os`, `time_zone`, `language` (ISO 639-1 — SS uses this to assign the response language), `browser_language` (BCP 47, metadata only), `date_time` (ISO timestamp), `ip`, `tags` (`string[]`). |

---

## Quick cURL

```bash
curl -X POST https://api.surveysparrow.com/v3/responses/batch \
  -H "Authorization: Bearer $SS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "survey_id": 123456,
    "responses": [
      {
        "answers": [
          { "question_id": 789012, "answer": [456789] },
          { "question_id": 789013, "answer": [456820, 456821] }
        ]
      }
    ]
  }'
```
