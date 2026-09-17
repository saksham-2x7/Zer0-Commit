# API & Module Contract — DO NOT CHANGE WITHOUT TEAM AGREEMENT

This is the single source of truth for how the pieces connect. Everyone builds
against this shape. If it needs to change, flag it to the whole team before
editing this file — a silent change here breaks someone else's already-working
code.

## HTTP endpoint (what DRISHYA's frontend calls)

```
POST /api/analyze
```

### Text request

```json
{
  "language": "hi" | "en",
  "inputType": "text",
  "rawText": "string — should already be redacted by the frontend before sending"
}
```

### Image request

```json
{
  "language": "hi" | "en",
  "inputType": "image",
  "imageBase64": "string — raw base64, no data: URI prefix",
  "imageMimeType": "image/png" | "image/jpeg"
}
```

### Response body (200)

```json
{
  "caseId": "case_xxx",
  "riskLevel": "high" | "medium" | "low",
  "riskDisclaimer": "This is a risk signal, not an official fraud determination.",
  "matchedPatterns": ["urgency", "otp_request"],
  "evidence": [
    { "pattern": "otp_request", "snippet": "Share your OTP immediately" }
  ],
  "explanation": "string",
  "checklist": ["string", "..."],
  "languageUsed": "hi" | "en",
  "inputSummary": {
    "inputType": "text" | "image",
    "ocrUsed": false,
    "redactionApplied": true,
    "charactersAnalyzed": 143
  },
  "reportingLinks": {
    "helpline": "1930",
    "portal": "https://cybercrime.gov.in/"
  },
  "evidenceBundle": {
    "available": false
  }
}
```

`evidenceBundle.available` is `true` with a `downloadUrl` (a short-lived
signed S3 URL) only in Ship It / deployed mode (`EVIDENCE_BUCKET_NAME` set).
In Build It / local mode it's always `{ "available": false }` — the frontend
builds and downloads the same bundle client-side instead
(`frontend/src/utils/evidenceBundle.js`).

The response never includes the raw input text or raw image data.

### Error response (4xx/5xx)

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Please provide text or an image to analyze.",
    "requestId": "..."
  }
}
```

Error codes:

| Code | HTTP status | Meaning |
|---|---|---|
| `INVALID_REQUEST` | 400 | Missing/malformed body, missing text/image |
| `UNSUPPORTED_LANGUAGE` | 400 | `language` is not one of `en`, `hi`, `ta`, `te`, `bn`, `mr` |
| `UNSUPPORTED_INPUT_TYPE` | 400 | `inputType` is not `text` or `image` |
| `INPUT_TOO_LARGE` | 413 | Text or image exceeds the configured size limit |
| `INVALID_IMAGE` | 400 | Bad MIME type or undecodable base64 |
| `OCR_FAILED` | 422 | Textract could not process the image |
| `ANALYSIS_FAILED` | 422 | OCR succeeded but found no readable text |
| `INTERNAL_ERROR` | 500 | Unexpected failure — message never includes internals |

## Additional endpoints (health-profile feature)

These are deliberately separate from `/api/analyze` — they don't run scam
detection, don't use `backend/persistence/caseStore.js` or
`backend/evidence/evidenceBundle.js`, and create no DynamoDB/S3 record.
The confirmed health profile lives only in the browser's `localStorage`.

### `POST /api/ocr`

OCR-only (`backend/ocr/textractClient.js`, reused as-is). Used to read a
photographed medical document/note before proposing tags.

```json
// request
{ "imageBase64": "...", "imageMimeType": "image/png" }
// response
{ "text": "..." }
```

### `POST /api/health-tags`

Proposes candidate condition/allergy tags from OCR'd or typed text —
**never auto-saved**; the frontend always shows these for the user to
confirm/uncheck before anything is stored. See
`backend/api/healthTagsHandler.js`.

```json
// request
{ "text": "...", "language": "en" }
// response
{ "suggestedTags": ["Type 2 Diabetes", "Peanut allergy"] }
```

### `POST /api/food-feedback`

Conversational feedback on a scanned product against the user's confirmed
health tags. Never a definitive "safe/unsafe to eat" verdict — the
"not medical advice" disclaimer is appended by the handler itself, not
left to the model. See `backend/api/foodFeedbackHandler.js`.

```json
// request
{
  "language": "en",
  "healthTags": ["Diabetes"],
  "product": { "name": "...", "brand": "...", "nutriScore": "E" }
}
// response
{ "feedback": "..." }
```

## Module: backend/detection/scamDetector.js (PRAHARI owns this)

```
detectScamPatterns(text: string) -> {
  riskLevel: "high" | "medium" | "low",
  matchedPatterns: string[],   // subset of PATTERN_KEYS below
  evidence: [{ pattern: string, snippet: string }]
}
```

Pattern keys (fixed — do not rename, add is fine, but don't rename existing ones
since VAANI's prompt copy may reference them):
`"urgency"`, `"otp_request"`, `"screen_share_request"`, `"suspicious_link"`,
`"impersonation"`, `"suspicious_collect_request"`

Must be pure and synchronous. No AWS SDK, no network calls, no side effects.

`riskLevel` semantics — say exactly this to users, never "safe":
- `low`: no strong scam indicators detected (not a safety guarantee).
- `medium`: one caution indicator detected.
- `high`: a high-risk request (OTP/PIN, screen-share, or a suspicious
  collect/payment request) or multiple indicators detected.

## Module: backend/redaction/redact.js (shared, defense-in-depth)

```
redactText(text: string) -> string
```

Masks phone numbers, UPI IDs, emails, Aadhaar-like numbers, other long
account/card-like digit strings, and strips the path/query of URLs. Pure and
synchronous. Used by both the frontend (before sending) and the backend
(before the text reaches the detector, Bedrock, logs, or storage) — the API
may be called directly without the frontend, so the backend never trusts
that redaction already happened.

## Module: backend/ocr/textractClient.js (SUTRADHAR owns this)

```
async extractText({ imageBase64, imageMimeType }) -> { text: string }
```

Wraps Amazon Textract `DetectDocumentText`. Only ever receives image bytes —
never persists them. Throws `ApiError("INVALID_IMAGE", ...)` for bad input
and `ApiError("OCR_FAILED", ...)` if Textract itself fails, so the caller
never sees a raw AWS error.

## Module: backend/ai/explainRisk.js (VAANI owns this)

```
async generateExplanation({ riskLevel, matchedPatterns, language }) -> {
  explanation: string,
  checklist: string[],
  languageUsed: "hi" | "en",
  generationMode: "bedrock" | "fallback"
}
```

Receives only the risk level, matched pattern *names*, and language — never
the original message. Must never throw — falls back to a hardcoded
deterministic response on any Bedrock/parsing failure. Supports
`MOCK_BEDROCK=true` env var for offline integration testing by the rest of
the team. Never claims certainty that a message *is* a scam.

## Module: backend/persistence/caseStore.js (SUTRADHAR owns this)

```
async saveCase(record) -> record
```

DynamoDB when `CASES_TABLE_NAME` is set (Ship It), an in-memory `Map`
otherwise (Build It). Stores only the redacted record shape below — never
raw text, raw images, or raw OCR output:

```json
{
  "caseId": "case_xxx",
  "createdAt": "ISO-8601",
  "language": "en",
  "inputType": "text",
  "riskLevel": "high",
  "matchedPatterns": ["urgency", "otp_request"],
  "evidence": [{ "pattern": "otp_request", "snippet": "..." }],
  "ocrUsed": false,
  "redactionApplied": true,
  "generationMode": "bedrock",
  "schemaVersion": "1.0"
}
```

## Module: backend/evidence/evidenceBundle.js (SUTRADHAR owns this)

```
buildEvidenceBundle({ caseId, language, inputType, redactedText, riskLevel,
  matchedPatterns, evidence, checklist, reportingLinks }) -> bundle

async storeEvidenceBundle(bundle) -> { available: boolean, downloadUrl?: string }
```

Uploads to a private, encrypted S3 bucket and returns a 15-minute signed URL
when `EVIDENCE_BUCKET_NAME` is set (Ship It); reports `{ available: false }`
otherwise (Build It) so the frontend downloads the same bundle client-side.

## Orchestrator: backend/api/analyzeHandler.js (SUTRADHAR owns this)

Wires the modules together in this order:

1. `validateAnalyzeRequest(body)` — throws a typed `ApiError` on any problem.
2. If `inputType === "image"`: `extractText(...)` (Textract OCR).
3. `redactText(text)` — defense-in-depth, always runs.
4. `detectScamPatterns(redactedText)` → `{ riskLevel, matchedPatterns, evidence }`
5. `generateExplanation({ riskLevel, matchedPatterns, language })` → `{ explanation, checklist, languageUsed, generationMode }`
6. `saveCase(...)` (redacted record only) and `storeEvidenceBundle(...)` in parallel.
7. Return the response body shape defined above.

## Environment variables (used across modules — keep names exact)

- `BEDROCK_MODEL_ID` — used by VAANI, never hardcode a model id elsewhere
- `MOCK_BEDROCK` — `"true"` to skip real Bedrock calls (VAANI + everyone testing locally)
- `AWS_REGION` — region for Textract/Bedrock/DynamoDB/S3 clients
- `CASES_TABLE_NAME` — DynamoDB table name; unset = local in-memory mode
- `EVIDENCE_BUCKET_NAME` — S3 bucket name; unset = local client-side download mode
- `ALLOWED_ORIGIN` — CORS origin for API Gateway responses; defaults to `*` locally
- `MAX_INPUT_BYTES` — max raw image size in bytes (default 5 MB)
- `VITE_API_BASE_URL` — used by DRISHYA's frontend, never hardcode the API URL

## Git workflow — everyone is on `main`

- Only touch files inside your own folder (see README ownership table).
- Commit message prefix by owner: `feat(detection): ...`, `feat(ai): ...`,
  `feat(api): ...`, `feat(frontend): ...`, `feat(infra): ...`
- Pull before you push. If you get a conflict outside your folder, something
  went wrong — stop and ask, don't force-push over someone else's work.
