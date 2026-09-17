# Security & data-handling model

ScamSahayak is a harm-prevention assistant, not a fraud-determination
system. This document explains what data it touches, what it never does,
and where the boundaries are.

## What the product must never do

- Ask for, request, or reproduce an OTP, PIN, CVV, password, or full bank
  credential, under any circumstance.
- Claim that a message *is* a scam with certainty — every result is
  labeled a risk signal, not an official fraud determination
  (`riskDisclaimer` in every API response).
- Claim that a `"low"` risk result means the message is safe.
- Claim to freeze funds, recover money, identify a caller, or automatically
  file a police/bank complaint.
- Automatically send money or approve/reject a UPI collect or payment
  request on the user's behalf.
- Encourage the user to click a suspicious link — the UI never renders a
  clickable version of a link found in the analyzed message.
- Link to anything other than the two verified official Indian reporting
  channels: the `1930` helpline and `https://cybercrime.gov.in/`.

## Data flow and redaction

```
User input (text or screenshot)
   │
   ├─ text  → redacted client-side (frontend/src/utils/redact.js)
   │           before it ever leaves the browser
   │
   └─ image → sent to the backend for OCR only; the raw image is never
              logged or stored. Textract's extracted text is redacted
              immediately (backend/redaction/redact.js) before it touches
              anything else.

Redacted text only, from here on:
   → backend/detection/scamDetector.js   (deterministic, no network call)
   → backend/ai/explainRisk.js           (Bedrock receives risk level +
                                           matched pattern NAMES only —
                                           never the message text)
   → backend/persistence/caseStore.js    (DynamoDB — redacted record only)
   → backend/evidence/evidenceBundle.js  (S3 — redacted bundle only)
```

The backend also redacts independently of the frontend
(`backend/redaction/redact.js`), because `POST /api/analyze` could be
called directly, bypassing the frontend's own redaction.

**Redaction covers:** Indian phone numbers, UPI IDs, email addresses,
Aadhaar-like 12-digit numbers, other long (9+ digit) account/card-like
numbers, and the path/query portion of URLs (the host is kept so scam-link
patterns can still be flagged).

**Redaction does not claim to be perfect.** It is regex/pattern-based and
can miss unusual formats. It is a mitigation, not a guarantee — this is why
raw text/images are never persisted at all, rather than persisted and
"cleaned up later."

## What is never logged or stored

- Raw message text (only the redacted version reaches logs at all, and
  only implicitly via error context — no request body is ever logged).
- Raw image bytes (used in-memory for a single Textract call, then
  discarded; never written to disk or S3).
- Raw OCR output before redaction.
- API keys, AWS credentials, or any other secret.
- Full account numbers, card numbers, OTPs, PINs, or passwords.

`backend/persistence/caseStore.js` and `backend/evidence/evidenceBundle.js`
only ever construct the pre-defined redacted record/bundle shapes — they
have no code path that could accept or forward raw input, by construction
(see `backend/api/CONTRACT.md` for the exact shapes).

## Bedrock

- Receives only `{ riskLevel, matchedPatterns, language }` — never the
  original or redacted message text, never an image.
- The system prompt explicitly forbids requesting or repeating OTP/PIN/
  CVV/password/account numbers, and forbids claiming certainty that a
  message *is* a scam.
- Output is validated against an explicit shape check
  (`isValidModelOutput` in `backend/ai/explainRisk.js`) before being
  trusted; any malformed output, parsing error, missing `BEDROCK_MODEL_ID`,
  or Bedrock API failure falls back to a hardcoded, deterministic response
  — the request never fails outright because of a Bedrock problem.
- Failures are logged only as an error *name/category*
  (`error.name || "UnknownError"`), never the raw error message or a stack
  trace, and the caller only ever sees a generic `INTERNAL_ERROR` /
  `ANALYSIS_FAILED` message — never Bedrock's raw response.

## Storage

- **DynamoDB**: server-side encryption enabled (`SSESpecification.SSEEnabled:
  true`); stores only the redacted case record (see `CONTRACT.md`); no
  original text, images, or credentials.
- **S3 evidence bucket**: private by default (`PublicAccessBlockConfiguration`
  blocks all public access), AES-256 server-side encryption on every
  object, versioning off, and a lifecycle rule that expires objects after
  `EvidenceRetentionDays` (default 30) so nothing accumulates indefinitely.
  Download access is only ever via a short-lived (15-minute) signed URL
  generated per-request — objects are never made public.

## Network and API surface

- CORS is controlled by `ALLOWED_ORIGIN`; defaults to `*` for local/demo
  use, should be set to the real deployed frontend origin in production.
- Request validation (`backend/api/validation.js`) rejects unsupported
  languages/input types, oversized text/images, and invalid/undecodable
  base64 or MIME types before any downstream processing happens.
- All error responses use a fixed set of codes and generic messages
  (`backend/api/errors.js`); no error path returns a raw stack trace,
  internal file path, or AWS SDK error message to the caller.
- IAM permissions on the Lambda function are scoped per-service
  (DynamoDB/S3 policies scoped to the specific table/bucket; Bedrock scoped
  to the configured model ARN). Textract's `DetectDocumentText` action does
  not support resource-level ARNs, so that one statement uses
  `Resource: "*"` — documented explicitly in `infra/template.yaml`.

## Third-party network calls from the browser

The QR/barcode scanner (`frontend/src/components/Scanner.jsx`) is the only
part of the app that talks to something other than our own backend:

- **Camera feed / uploaded photo**: decoded entirely client-side by
  `@zxing/browser`. Never uploaded anywhere — no network call at all for
  the decode step itself.
- **Barcode lookup**: the decoded barcode *number* (not the photo) is sent
  directly from the browser to `world.openfoodfacts.org`, a free, keyless,
  public product database, to fetch product info. A barcode number
  identifies a product, not a person — this call carries no personal data,
  no message text, and no redaction is needed. It never touches our
  backend, DynamoDB, or S3.
- A decoded **QR code**, by contrast, is treated as user-authored text: it
  goes through the same client-side redaction and `/api/analyze` pipeline
  as anything pasted into the text box, and is never auto-submitted
  without the user reviewing it first.

## Known gaps / not yet verified

- This has not been deployed against a real AWS account in the environment
  it was built in, so the IAM policies, CORS configuration, and S3
  lifecycle rule are reviewed but not live-tested.
- No third-party penetration test or formal security review has been
  performed. Treat this as a hackathon MVP's security posture, not a
  production-audited one.
- Redaction is regex-based, not a certified PII-detection library — do not
  rely on it as the sole control for genuinely sensitive data.
