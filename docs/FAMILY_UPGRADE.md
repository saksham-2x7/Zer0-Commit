# ScamSahayak Family Upgrade — Architecture & Feature Plan

Goal: turn the single-user scam checker into a **family scam-protection app**
(Family Link for scams): a family circle with shared suspicious contacts and
alerts, food/product scanning that flags allergens against **every family
member's** health profile, and a zero-knowledge E2E-encrypted family
messaging channel ("crypto chan") — wrapped in a Swiss-style UI and kept
AWS-deployable.

Positioning (from competitive research): *"Truecaller tells you who's
calling. ScamSahayak tells you what's a scam — in your language, offline,
helps the whole family survive it."*

---

## 1. Family circle (F1/F2/F5/F6)

### Data model — `backend/family/familyStore.js`
Single family document per `familyId` (in-memory Map locally, DynamoDB item
when `FAMILY_TABLE_NAME` is set — same pattern as `caseStore.js`):

```
Family {
  familyId, name, createdAt,
  members:   [{ memberId, name, role: admin|member|elder, allergies: string[], createdAt }],
  contacts:  [{ contactId, name, phone, note, flaggedBy, status: flagged|confirmed-scam|cleared, createdAt }],
  alerts:    [{ alertId, title, detail, riskLevel: low|medium|high, createdAt, confirmedBy: memberId[] }],
  blocklist: [{ phone, addedBy, createdAt }]
}
```

- `allergies` are self-reported short tags (same limits as food feedback:
  ≤15 tags, ≤60 chars each) — never a medical record.
- `role: elder` marks a member whose alerts get extra prominence (elder
  protection mode).

### Endpoints — `backend/api/familyHandler.js`
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/family/create` | `{name, adminName}` | `{familyId, family}` |
| POST | `/api/family/members` | `{familyId, name, role, allergies}` | `{member}` |
| POST | `/api/family/contacts` | `{familyId, name, phone, note}` | `{contact}` |
| POST | `/api/family/alerts` | `{familyId, title, detail, riskLevel}` | `{alert}` |
| POST | `/api/family/blocklist` | `{familyId, phone}` | `{entry}` |
| POST | `/api/family/confirm-alert` | `{familyId, alertId, memberId}` | `{alert}` |
| GET | `/api/family/:familyId` | — | `{family}` |

All handlers wrapped with `wrapHandler` for Lambda parity; devServer gains
GET + path-param routing.

## 2. Food/product scan with family allergy flags (F3)

### Server-side lookup — `backend/food/productLookup.js`
Proxy to Open Food Facts v2 (`GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`)
with an in-memory TTL cache (respects ~15 req/min/IP; sends a real
User-Agent). Normalized shape:

```
Product { name, brand, imageUrl, ingredientsText, allergens: string[],
          traces: string[], additives: string[], novaGroup, nutriScore }
```

### Allergen matching — `backend/food/allergenMatch.js`
Normalizes allergen names (case, "peanut" vs "peanuts", "milk" vs "dairy")
and matches a product's `allergens` + `traces` + `ingredientsText` against
each family member's allergy tags. Returns per-member flags:

```
memberFlags: [{ memberId, name, matched: [{ allergen, source: allergens|traces|ingredients }] }]
```

### Endpoint — `backend/api/foodHandler.js`
`POST /api/food-lookup` `{barcode, familyId?}` → `{product, memberFlags}`.
No familyId → product only (single-user mode). Existing
`/api/food-feedback` (LLM conversational feedback vs one user's tags) stays
as-is; the new endpoint adds the deterministic family-wide flagging.

## 3. E2E encrypted family messaging (F4) — "crypto chan"

Zero-knowledge: the server stores **only ciphertext and wrapped keys**.
Plaintext and the group key never leave the browser.

### Crypto scheme — `frontend/src/utils/crypto.js` (Web Crypto, zero deps)
1. Each member generates an **ECDH P-256** keypair; private key stays in
   localStorage, public key (JWK) registers with the server.
2. Thread creation: creator generates an **AES-256-GCM group key**, wraps it
   per member via ECDH shared secret → HKDF → AES-GCM (random IV per wrap).
3. Sending: AES-GCM encrypt with group key, AAD = threadId, random IV.
4. Receiving: unwrap group key with own private key + sender's public key,
   then decrypt.
5. Key verification: fingerprint = SHA-256 of public key JWK, shown as
   `abcd-ef01-2345-6789`; members compare out-of-band.

`crypto.subtle` requires a secure context (HTTPS or localhost) — noted in
deployment docs.

### Data model — `backend/messaging/messageStore.js`
```
Thread { threadId, name, createdAt, memberIds: string[],
         wrappedKeys: { [memberId]: { wrappedKey, iv, ownerPublicKeyId } },
         messages: [{ messageId, senderId, iv, ciphertext, createdAt }] }
```
No plaintext, no group key, no member public keys stored in the thread
(public keys live in a separate member-key registry).

### Endpoints — `backend/api/messagingHandler.js`
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/messaging/keys` | `{memberId, publicKeyJwk}` | `{fingerprint}` |
| POST | `/api/messaging/threads` | `{name, memberIds}` | `{threadId}` |
| POST | `/api/messaging/threads/:id/keys` | `{memberId, wrappedKey, iv, ownerPublicKeyId}` | `{ok}` |
| POST | `/api/messaging/threads/:id/messages` | `{senderId, iv, ciphertext}` | `{messageId}` |
| GET | `/api/messaging/threads` | — | `{threads: metadata[]}` |
| GET | `/api/messaging/threads/:id/messages` | — | `{messages: ciphertext[]}` |

## 4. Swiss UI — "Helvetica Noir" (from UI/UX research)

- Ink `#0A0A0A`, Paper `#FFFFFF`, Ash `#C8C8C8`; one signal accent red
  `#E60000` (scam alerts ONLY); Cobalt `#1A4FD8` (brand mark only).
- Fonts: Inter + Noto Sans (covers all 6 scripts: en/hi/ta/te/bn/mr).
- 1px rules, radius 0, no shadows; asymmetric flush-left grid; uppercase
  labels; flat buttons min-height 48px; square chip badges, never
  color-only (always text + shape).
- Dark mode: bg `#0A0A0A`, text `#F5F5F5`, borders `#2E2E2E`, red `#FF5C5C`.
- Tailwind v3 (already installed) — tokens via CSS variables + utility
  classes; no new dependencies.

## 5. AWS deployment

- `infra/template.yaml` (existing SAM): add `FamilyFunction`,
  `FoodLookupFunction`, `MessagingFunction` + `FamilyTable`,
  `MessagingTable` (DynamoDB, PAY_PER_REQUEST, SSE, TTL).
- New: `Dockerfile` (node:22-alpine, non-root, healthcheck),
  `docker-compose.yml`, `.github/workflows/ci.yml` + `deploy.yml` (OIDC →
  sam deploy → s3 sync → CloudFront invalidation), `frontend/.env.production.example`.
- Cloud-readiness: `VITE_API_BASE_URL` already honored; CORS fail-closed
  already; storage already abstracted (Map local / DynamoDB deployed);
  HTTPS required for `crypto.subtle` (CloudFront provides it).

## 6. Build order

1. Backend: family store+handler → food lookup+allergen match+handler →
   messaging store+handler → devServer GET/param routing → tests.
2. Frontend: crypto util → api layer → FamilyView, FoodScanView, FamilyChat
   → App wiring + i18n ×6 → tests.
3. Swiss UI pass (tokens + component polish).
4. AWS: template.yaml additions (main thread) + Docker/CI files (agent,
   done).
5. Full suite (backend jest 80% gate, frontend vitest, build) → commit →
   push.