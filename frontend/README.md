# Frontend — React + Vite

Elder-first, Hindi/English UI for ScamSahayak. Talks to `POST /api/analyze`
per [`../backend/api/CONTRACT.md`](../backend/api/CONTRACT.md) — read that
before touching `src/services/api.js` or the request/response shapes below.

## Structure

```
src/
  App.jsx                    orchestrates state + the analyze request
  components/
    LanguageToggle.jsx        hi/en switch
    TextInput.jsx             paste-message textarea
    ImageUpload.jsx           screenshot upload + base64 encoding
    RedactionPreview.jsx      shows the redacted text before sending
    ResultsView.jsx           risk badge, evidence, checklist, reporting
    ReportingBlock.jsx        1930 helpline + cybercrime.gov.in links
  i18n/translations.js        all user-facing strings, hi + en
  services/api.js             fetch wrapper for POST /api/analyze
  utils/redact.js             client-side redaction (masks before sending)
  utils/evidenceBundle.js     builds/downloads the local evidence bundle
                               (Build It fallback — see CONTRACT.md)
```

## Local development

```bash
npm install
echo "VITE_API_BASE_URL=http://localhost:3000" > .env   # not committed
npm run dev
```

Requires the backend dev API running (`MOCK_BEDROCK=true npm run dev:api`
from the repo root) or a deployed `ApiUrl`.

## Tests

```bash
npm test -- --run
npm run build
```

Vitest + Testing Library (jsdom). `src/App.test.jsx` covers text
submission (including that text is actually redacted before being sent —
verify this doesn't regress if you touch `App.jsx`'s submit handler),
evidence/label rendering, error states, the language toggle, and the
evidence-bundle download path.

## Conventions

- Never render the analyzed message's own links as clickable — only the
  two official reporting links (1930, cybercrime.gov.in) are.
- Never show a raw pattern key (e.g. `otp_request`) — always map through
  `patternNames` in `i18n/translations.js`.
- Don't touch anything outside this folder except `infra/template.yaml`
  (only append Amplify/hosting resources below the marked line there).
