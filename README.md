# ScamSahayak

An elder-first, six-language assistant (English, Hindi, Tamil, Telugu,
Bengali, Marathi) that checks a suspicious UPI, SMS,
KYC, or bank message and gives a **risk signal, an explanation, and a safe
next step** — not a verdict.

Built for WeMakeDevs × AWS "First Commit" (Bharat Builds Tour, Sept 17–20,
2026).

## The problem

Scam messages targeting elders in India (fake KYC updates, "your account
will be blocked," OTP requests, UPI collect requests) are designed to create
panic and urgency. The person receiving one often has seconds to decide
whether to trust it, and no easy way to check. ScamSahayak gives them — or a
family member helping them — a fast, bilingual second opinion before they
act.

**Target user:** an elder in India reading a suspicious message, or a family
member/helper checking it on their behalf.

## What it actually does

1. Paste the message text, or upload a screenshot.
2. Personal details (phone numbers, UPI IDs, emails, account-like numbers)
   are masked before anything is analyzed.
3. A deterministic rule engine looks for known scam patterns (urgency, OTP
   requests, remote-access requests, suspicious links/QR codes,
   impersonation, suspicious payment/collect requests).
4. Amazon Bedrock turns that into a short, bilingual explanation and action
   checklist (with a safe, deterministic fallback if Bedrock is unavailable).
5. The result shows the exact warning signs found, in plain language — never
   raw internal pattern names.
6. Official reporting channels (1930 helpline, cybercrime.gov.in) are always
   shown.
7. A redacted evidence bundle can be saved/downloaded to attach to a report.
8. Can also scan a QR code (e.g. a UPI payment code) and run it through the
   same scam-check pipeline, or scan a product barcode and look up what it
   is via a free, open product database — see "Scan a code" below.
9. Results can be read aloud, and a message can be spoken instead of typed,
   using the browser's built-in voice features — no extra AWS service
   involved.
10. Dark mode, and a local (on-device only) history of past checks.

![Risk result badge in high-risk state — screenshot to be added](docs/screenshots/risk-result-badge.png "Risk result badge (high-risk state)")

*screenshot to be added*

![Redaction preview masking personal details before analysis — screenshot to be added](docs/screenshots/redaction-preview.png "Redaction preview before analysis")

*screenshot to be added*

**What it deliberately does *not* do:** claim a message is definitely a
scam, claim a "low risk" result is safe, freeze funds, recover money,
identify a caller, file a complaint automatically, or approve/reject a
payment request. See [SECURITY.md](SECURITY.md) for the full data-handling
and safety model.

## Feature status

| Feature | Status |
|---|---|
| Text analysis (6 deterministic pattern categories) in 6 languages (English, Hindi, Tamil, Telugu, Bengali, Marathi) | **Implemented & tested** |
| Language selector, dark mode, adjustable text size, first-visit "How to use" guide | **Implemented & tested** |
| Health profile (self-reported, locally stored) + food-scan feedback against it | **Implemented & tested** — see "Health profile & food feedback" below for the safety design |
| Client-side redaction before sending | **Implemented & tested** |
| Server-side redaction (defense-in-depth, in case the API is called directly) | **Implemented & tested** |
| Screenshot OCR via Amazon Textract | **Implemented & tested** (mocked Textract in tests; real AWS calls untested against a live account — see Limitations) |
| Bedrock explanation + checklist, with deterministic fallback | **Implemented & tested** (mocked Bedrock in tests) |
| Evidence snippets shown per matched pattern | **Implemented & tested** |
| DynamoDB case persistence (redacted only) | **Implemented & tested** locally against mocks; requires a deployed stack to run for real |
| S3 redacted evidence bundle + signed download URL | **Implemented & tested** locally against mocks; requires a deployed stack to run for real |
| Structured API errors + CORS | **Implemented & tested** |
| Dark mode (persisted, respects system preference) | **Implemented & tested** |
| Local history of past checks (on-device only, never sent anywhere) | **Implemented & tested** |
| Read result aloud / speak instead of typing (Web Speech API) | **Implemented & tested** (feature-detected — hidden entirely in browsers without support) |
| QR-code scan → same scam-check pipeline | **Implemented & tested** (verified end-to-end in a browser against a real generated QR code) |
| Barcode scan → product lookup (Open Food Facts) | **Implemented & tested** (verified end-to-end in a browser against a real barcode and the live API) |
| SAM infrastructure template (Lambda, API Gateway, DynamoDB, S3, IAM) | **Written, not yet deployed** — see Limitations |
| Live AWS deployment | **Not deployed** — no AWS CLI/credentials were available in the environment this was built in |
| CloudFront HTTPS frontend hosting (private bucket + OAC + `FrontendUrl` output in `infra/template.yaml`) | **Implemented in the template**, not yet deployed — requires `aws s3 sync frontend/dist s3://<FrontendBucketName>` after `sam deploy` (see "Frontend hosting") |
| Demo video | **Not recorded** — see [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the planned script |

## Architecture

```
User (elder / family helper)
   │
   ▼
frontend/  (React + Vite) — served as a static site from an S3 bucket
  - language toggle (en/hi/ta/te/bn/mr)
  - paste text OR upload screenshot
  - client-side redaction (masks phone/UPI/email/account-like strings)
    BEFORE sending
   │  POST /api/analyze
   ▼
backend/api/analyzeHandler.js   ← orchestrator (Lambda)
   │
   ├─▶ backend/ocr/textractClient.js       (image input only — Amazon Textract)
   ├─▶ backend/redaction/redact.js          (defense-in-depth, always runs)
   ├─▶ backend/detection/scamDetector.js    (pure, deterministic pattern rules)
   ├─▶ backend/ai/explainRisk.js            (Amazon Bedrock → bilingual explanation + checklist)
   ├─▶ backend/persistence/caseStore.js     (DynamoDB — redacted case record only)
   └─▶ backend/evidence/evidenceBundle.js   (S3 — redacted evidence bundle + signed URL)
```

Hosting: the built frontend (`frontend/dist`) is served from a **private**
S3 bucket created by `infra/template.yaml` (`FrontendHostingBucket`) and
delivered over **HTTPS by CloudFront** via Origin Access Control (OAC) — no
public bucket, no plain HTTP. The `FrontendUrl` output is the deployed,
HTTPS frontend URL (`https://<distribution>.cloudfront.net`). The API lives
behind API Gateway and **must** be given the frontend's real origin via the
`AllowedOrigin` parameter — set it to the `FrontendUrl` value before
deploying.

## AWS services used, and why

| Service | Why |
|---|---|
| **AWS Lambda** | Runs the orchestrator (`analyzeHandler.js`) — no server to manage for a hackathon-scale workload. |
| **Amazon API Gateway** | Exposes `POST /api/analyze` over HTTPS with CORS. |
| **Amazon Textract** | `DetectDocumentText` extracts text from an uploaded screenshot so OCR doesn't have to be hand-rolled. |
| **Amazon Bedrock** | Turns a risk level + matched pattern categories (never the raw message) into a bilingual, elder-friendly explanation and checklist. |
| **Amazon DynamoDB** | Stores the redacted case record (risk level, matched patterns, evidence snippets — never raw text/images) for basic audit/debugging. |
| **Amazon S3** | Stores the redacted evidence bundle a user can attach when filing a report, behind a short-lived signed URL. |
| **Amazon S3 (frontend hosting)** | Serves the built `frontend/dist` site from a **private** bucket (no public policy). CloudFront reads it via OAC and serves it over HTTPS. Static assets only — no user data. |

Everything below is deliberately **not** an AWS service and does not touch
the backend at all — it runs entirely in the browser, at no AWS cost:

- **Dark mode, voice read-aloud/input, local history** — browser-native
  APIs (`prefers-color-scheme`, Web Speech API, `localStorage`).
- **QR/barcode scanning** — `@zxing/browser` decodes the camera feed or an
  uploaded photo client-side. A decoded QR code is treated as a normal
  message and run through the exact same `/api/analyze` pipeline above
  (so it gets the same redaction, detection, and Bedrock explanation). A
  decoded product barcode is looked up via
  [Open Food Facts](https://world.openfoodfacts.org/) (a free, keyless,
  public product database) directly from the browser — this is
  product-lookup only, not a scam check, and coverage is limited (mostly
  packaged food).

## Scan a code

The "Scan code" tab handles two different things, deliberately kept
separate so the product doesn't overclaim:

- **QR code** (e.g. a UPI payment QR): decoded, shown to the user for
  review, and — only if they choose to — run through the same scam
  analysis as pasted text. A QR code is just a link or payment string in a
  different encoding; it gets no special treatment or trust.
- **Barcode** (UPC/EAN, e.g. on packaged food): looked up in Open Food
  Facts and shown as plain product info. This is **not** a scam or safety
  check — it's a convenience lookup, and a "not found" result is common
  and expected, not an error.

## Health profile & food feedback

This touches real health information, so it's designed more conservatively
than the rest of the app:

1. **Nothing is auto-saved.** You can scan a photo of a medical
   document/note (via `POST /api/ocr`, the same Textract pipeline as
   screenshots) and have Bedrock *suggest* candidate condition/allergy tags
   (`POST /api/health-tags`) — but those suggestions are shown as checkboxes
   for you to review and uncheck anything wrong. Only what you confirm gets
   saved, and only into this browser's `localStorage`. Nothing from this
   flow is ever written to DynamoDB or S3.
2. **Food feedback is informational, never a verdict.** When a barcode scan
   finds a product and you have a saved health profile, `POST
   /api/food-feedback` asks Bedrock to point out concrete things worth
   noticing (e.g. "contains peanuts, and you noted a peanut allergy") —
   the system prompt explicitly forbids a definitive "safe/unsafe to eat"
   answer, and the "this is not medical advice, confirm with a doctor or
   pharmacist" line is appended by the backend code itself, not left to the
   model, so it's always present regardless of what Bedrock returns.
3. **Fails safe, not confident.** If OCR finds nothing, Bedrock is
   unavailable, or output doesn't parse, the result is "no tags suggested"
   or a neutral fallback message — never a fabricated guess.

This is still a hackathon feature, not a clinically validated one. It has
not been reviewed by a medical professional, and the deterministic
fallback's "no specific match found" wording is based only on whatever
Open Food Facts happens to have listed for that product — which is often
incomplete.

## Build It (local) mode vs. Ship It (deployed) mode

The same code runs in both modes — behavior is switched by environment
variables, not by a separate code path:

| Env var | Unset (Build It / local) | Set (Ship It / deployed) |
|---|---|---|
| `CASES_TABLE_NAME` | In-memory case store | DynamoDB |
| `EVIDENCE_BUCKET_NAME` | Evidence bundle built & downloaded client-side | Uploaded to S3, signed URL returned |
| `MOCK_BEDROCK=true` | Deterministic fallback explanation always used | (leave unset/`false` for real Bedrock) |

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `BEDROCK_MODEL_ID` | `backend/ai/explainRisk.js` | Bedrock model id (never hardcode elsewhere) |
| `MOCK_BEDROCK` | `backend/ai/explainRisk.js` | `"true"` to skip real Bedrock calls |
| `AWS_REGION` | Textract/Bedrock/DynamoDB/S3 clients | AWS region |
| `CASES_TABLE_NAME` | `backend/persistence/caseStore.js` | DynamoDB table name; unset = local mode |
| `EVIDENCE_BUCKET_NAME` | `backend/evidence/evidenceBundle.js` | S3 bucket name; unset = local mode |
| `ALLOWED_ORIGIN` | `backend/api/analyzeHandler.js` | CORS origin for API responses |
| `MAX_INPUT_BYTES` | `backend/api/validation.js` | Max raw image size in bytes (default 4 MiB = 4194304; keep the base64 payload under the ~6 MiB Lambda synchronous-invoke limit) |
| `VITE_API_BASE_URL` | `frontend/src/services/api.js` | Base URL the frontend calls |

## Local setup

```bash
npm install
cd frontend && npm install && cd ..
```

Run the backend orchestrator's own dev API server (wraps the Lambda handler
in a plain HTTP server for local frontend development):

```bash
MOCK_BEDROCK=true npm run dev:api        # http://localhost:3000
```

In another terminal, create `frontend/.env` (not committed) pointing at it:

```bash
echo "VITE_API_BASE_URL=http://localhost:3000" > frontend/.env
cd frontend && npm run dev               # http://localhost:5173
```

## Tests

```bash
npm test                                 # backend — Jest, 220 tests
MOCK_BEDROCK=true npm run smoke          # one-shot orchestrator smoke test
cd frontend && npm test -- --run         # frontend — Vitest, 155 tests
cd frontend && npm run build             # production build
```

Or all of the above in one go:

```bash
npm run verify
```

All AWS calls in the test suite (Textract, Bedrock, DynamoDB, S3) are
mocked with `aws-sdk-client-mock` — no real AWS account is touched by
`npm test`.

## Deploying (Ship It mode)

Requires the [AWS CLI](https://docs.aws.amazon.com/cli/) and
[AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
installed and configured with credentials that have permission to create
Lambda, API Gateway, DynamoDB, S3, and IAM resources.

```bash
sam build -t infra/template.yaml
sam deploy --guided
```

On first deploy, `--guided` will ask for a stack name/region and walk
through the parameters in `infra/template.yaml` (`BedrockModelId`,
`MockBedrock`, `AllowedOrigin`, `MaxInputBytes`, `EvidenceRetentionDays`).
Set `MockBedrock=false` and `AllowedOrigin` to your deployed frontend's real
URL for a production-like deploy. The frontend is served over HTTPS from
CloudFront, so `AllowedOrigin` should be the `FrontendUrl` output value
(`https://<distribution>.cloudfront.net`). The template's `AllowedOrigin`
default is a placeholder (`https://YOUR_DOMAIN.example.com`) — leaving it
as-is **breaks** browser calls to the API, and `"*"` in production lets any
website call it. Note the `ApiUrl` and `FrontendUrl` outputs — those are
what `VITE_API_BASE_URL` and the deployed URL should be.

**This template has not been deployed or tested against a real AWS
account** — the environment this was built in had no AWS CLI, SAM CLI, or
credentials available. Review the IAM policies and CORS settings before
deploying to anything beyond a personal sandbox account.

### Frontend hosting

`infra/template.yaml` creates a **private** S3 bucket
(`FrontendHostingBucket`), a CloudFront distribution with an Origin Access
Control (OAC) bucket policy so only CloudFront can read it, and a
`ResponseHeadersPolicy` (HSTS + `X-Content-Type-Options: nosniff`). The
`FrontendUrl` output is the deployed HTTPS URL. After `sam deploy`, build
the site and sync it into the bucket (bucket name = the `FrontendBucketName`
output):

```bash
cd frontend && npm run build
aws s3 sync frontend/dist s3://<FrontendBucketName> --delete
```

Open `FrontendUrl` (e.g.
`https://dXXXXXXXXXXXX.cloudfront.net`) — that's the deployable HTTPS URL the
demo shows. Points to remember:

- The bucket is **private** — no public-read policy, no S3 website endpoint.
  CloudFront reads it through OAC and serves everything over **HTTPS** on
  the default `*.cloudfront.net` domain (no ACM/custom domain needed).
- Set the stack's `AllowedOrigin` to the `FrontendUrl` output
  (`https://<distribution>.cloudfront.net`) and redeploy so the API's CORS
  accepts the served origin. Deploy with the placeholder once, read the
  `FrontendUrl` output, set `AllowedOrigin`, and redeploy.
- Build with `VITE_API_BASE_URL` pointing at the `ApiUrl` output minus the
  `/api/analyze` suffix, i.e. `https://<api-id>.execute-api.<region>.amazonaws.com/Prod`
  (the frontend appends `/api/analyze` itself).

Before SAM hosting existed, `npm run build && npm run preview` (or any
static host pointed at `frontend/dist`) worked the same way — it still does.

### Teardown

```bash
sam delete
```

This removes the Lambda function, API Gateway, DynamoDB table, and both S3
buckets (frontend hosting + evidence, and their contents) created by the stack.

## Cost controls

- DynamoDB is on-demand (`PAY_PER_REQUEST`) — no idle capacity cost.
- The S3 evidence bucket has a lifecycle rule (`EvidenceRetentionDays`,
  default 30) that auto-deletes objects — nothing accumulates indefinitely.
- `sam delete` fully tears down all billable resources.
- Bedrock and Textract are pay-per-call with no standing infrastructure.

## Data privacy model

See [SECURITY.md](SECURITY.md) for the complete model. Summary: redaction
runs both client-side and server-side; only redacted text ever reaches
Bedrock, DynamoDB, S3, or logs; raw images are never persisted; the API
never requests or reproduces OTPs, PINs, CVVs, or passwords.

## Known limitations

- Tamil, Telugu, Bengali, and Marathi UI translations were written without
  native-speaker review — meaning is intended to be correct but phrasing
  may be unnatural in places. Have a native speaker review before relying
  on this for a real audience. Hindi/English were reviewed more carefully
  since the product was originally built around those two.
- The health-profile feature has not been reviewed by a medical or legal
  professional — see SECURITY.md's "Health profile data" section for the
  specific safety constraints that are in place.
- The SAM template has not been deployed against a real AWS account in this
  environment — review it yourself before a production deploy.
- The deterministic detector is keyword/pattern-based, not a trained
  classifier — it will miss novel phrasing and can false-positive on
  legitimate urgent messages. It is a risk *signal*, explicitly not a
  verdict.
- Textract OCR accuracy depends on screenshot quality (rotation, low
  contrast, or heavily stylized fonts can reduce accuracy).
- No automated evaluation harness/benchmark dataset exists yet — pattern
  and Bedrock-prompt quality is untested beyond the unit tests in this repo.
- No demo video has been recorded (see `DEMO_SCRIPT.md` for the plan).
- The CloudFront HTTPS hosting is implemented in the SAM template (private
  bucket + OAC + security headers), but neither it nor the stack itself has
  been deployed against a real AWS account here — see "Deploying (Ship It
  mode)".
- The scanner's live-camera path was verified structurally against the
  `@zxing/browser` API but not end-to-end with a physical camera in this
  environment (no webcam available) — the upload-a-photo path *was*
  verified end-to-end with real generated QR and barcode images, including
  a live call to Open Food Facts. Test the camera path on a real device
  before relying on it for a demo.
- Voice input/read-aloud quality depends entirely on the browser's/OS's
  installed speech engines and Hindi voice availability — not something
  this app controls.
- Barcode product lookup only covers what's in Open Food Facts (mostly
  packaged food) — most non-food barcodes will correctly show "not found."

## AI coding tools used

This implementation (backend services, frontend, tests, infrastructure
template, and this README) was built with Claude Code (Anthropic).

## License

See [LICENSE](LICENSE).
