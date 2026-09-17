# API & Module Contract — DO NOT CHANGE WITHOUT TEAM AGREEMENT

This is the single source of truth for how the pieces connect. Everyone builds
against this shape. If it needs to change, flag it to the whole team before
editing this file — a silent change here breaks someone else's already-working
code.

## HTTP endpoint (what DRISHYA's frontend calls)

```
POST /api/analyze

Request body:
{
  "language": "hi" | "en",
  "inputType": "text" | "image",
  "rawText": string,       // present if inputType === "text"
  "imageBase64": string    // present if inputType === "image"
}

Response body (200):
{
  "caseId": string,
  "riskLevel": "high" | "medium" | "low",
  "matchedPatterns": string[],
  "explanation": string,
  "checklist": string[],
  "reportingLinks": {
    "helpline": "1930",
    "portal": "https://cybercrime.gov.in/"
  }
}
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

## Module: backend/ai/explainRisk.js (VAANI owns this)

```
async generateExplanation({ riskLevel, matchedPatterns, language }) -> {
  explanation: string,
  checklist: string[],
  languageUsed: "hi" | "en"
}
```

Must never throw — falls back to a hardcoded deterministic response on any
Bedrock/parsing failure. Supports `MOCK_BEDROCK=true` env var for offline
integration testing by the rest of the team.

## Orchestrator: backend/api/analyzeHandler.js (SUTRADHAR owns this)

Wires the two modules together in this order:

1. Extract text (if `inputType === "image"`, OCR is optional/stretch — falls back
   to requiring `rawText` if OCR isn't wired up yet).
2. `detectScamPatterns(text)` → `{ riskLevel, matchedPatterns, evidence }`
3. `generateExplanation({ riskLevel, matchedPatterns, language })` → `{ explanation, checklist, languageUsed }`
4. Persist case (DynamoDB in deployed mode, in-memory/local JSON in Build It mode)
5. Return the response body shape defined above, with a generated `caseId`.

## Environment variables (used across modules — keep names exact)

- `BEDROCK_MODEL_ID` — used by VAANI, never hardcode a model id elsewhere
- `MOCK_BEDROCK` — `"true"` to skip real Bedrock calls (VAANI + everyone testing locally)
- `VITE_API_BASE_URL` — used by DRISHYA's frontend, never hardcode the API URL

## Git workflow — everyone is on `main`

- Only touch files inside your own folder (see README ownership table).
- Commit message prefix by owner: `feat(detection): ...`, `feat(ai): ...`,
  `feat(api): ...`, `feat(frontend): ...`, `feat(infra): ...`
- Pull before you push. If you get a conflict outside your folder, something
  went wrong — stop and ask, don't force-push over someone else's work.
