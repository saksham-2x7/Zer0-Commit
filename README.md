# ScamSahayak

An elder-first, Hindi/English assistant that turns a suspicious UPI, SMS, or KYC
screenshot into three safe outcomes:

1. An explainable **risk signal** with the observable warning signs.
2. A short, bilingual **action checklist** (never share OTP/PIN, verify via the
   bank's official app/number, don't click unknown links).
3. A **redacted evidence bundle** pointing to India's official reporting channels
   (**1930**, [cybercrime.gov.in](https://cybercrime.gov.in/)).

Built for WeMakeDevs × AWS "First Commit" (Bharat Builds Tour, Sept 17–20, 2026).

This product never claims to freeze funds, recover money, identify a caller, file
a complaint automatically, or replace a bank/police process.

## Architecture

```
User (elder / family helper)
   │
   ▼
frontend/  (React + Vite)
  - language toggle (hi/en)
  - paste text OR upload screenshot
  - client-side redaction (masks phone/UPI/account-like strings) BEFORE sending
   │  POST /api/analyze
   ▼
backend/api/analyzeHandler.js   ← orchestrator (Lambda)
   │                    │
   ▼                    ▼
backend/detection/      backend/ai/
scamDetector.js         explainRisk.js
(pure, deterministic    (Bedrock call →
 pattern rules)          bilingual explanation
                         + checklist, JSON out)
   │
   ▼
DynamoDB (case record)  +  S3 (redacted evidence bundle)
```

## Team ownership (do not edit outside your folder)

| Codename | Folder | Responsibility |
|---|---|---|
| **SUTRADHAR** (#1) | `backend/api/`, `infra/` (skeleton) | Architecture, integration, contracts |
| **PRAHARI** (#2) | `backend/detection/` | Deterministic scam-pattern detection engine |
| **VAANI** (#3) | `backend/ai/` | Bedrock explanation/checklist generation |
| **DRISHYA** (#4) | `frontend/`, `infra/` (extensions) | UI, redaction, deploy, demo video |

The interface everyone builds against is fixed in
[`backend/api/CONTRACT.md`](backend/api/CONTRACT.md). Read it before writing code
that touches the API boundary.

## Local setup

```bash
npm install
# Backend orchestrator uses working stubs until PRAHARI/VAANI replace them
node backend/api/analyzeHandler.js   # quick manual smoke test
```

## Build track

Targeting **Build It** first (fully local, no AWS account required to demo), with
a **Ship It** deploy (Amplify + Lambda + API Gateway + DynamoDB) once the local
loop is solid — see `infra/template.yaml`.

## Non-negotiables (from judging rubric)

- One feature that runs beats five that almost do.
- AWS must be visible in the 3-minute demo video, not just named in the README.
- No live demo — the video is what judges see.
