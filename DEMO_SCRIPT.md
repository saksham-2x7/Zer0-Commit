# Demo script (3 minutes)

Not yet recorded. This is the planned shot list for the submission video.
Every step below must be something the real app actually does — no staged
UI states that the app can't reproduce. Use only seeded, synthetic example
messages. **Never use a real person's real OTP, real bank account number,
real phone number, or any actual victim's data** — the "scam" screenshot
used in the demo should be a message the presenter writes themselves for
the purpose of the recording.

## Setup before recording

- Deploy the stack (`sam deploy --guided`) with `MockBedrock=false` so the
  demo shows real Bedrock output, not the fallback, and with `AllowedOrigin`
  set to the deployed frontend URL.
- Build and publish the site: `cd frontend && npm run build`, then
  `aws s3 sync frontend/dist s3://<FrontendBucketName> --delete` where
  `FrontendBucketName` is the stack output. The deployed URL is the
  `FrontendWebsiteUrl` output.
- Have a synthetic example screenshot ready: a plain text message mocked up
  in a notes app or image editor, e.g. *"URGENT: Your KYC will expire
  today. Share your OTP immediately to verify, or your account will be
  blocked. Call 98XXXXXXXX."* — with the phone number itself already
  fake/blanked in the source image, since the point is to demo the app's
  own redaction, not to feed it something sensitive in the first place.
  Keep the image under the **4 MB** limit (the default `MAX_INPUT_BYTES` —
  the app rejects anything larger).
- Confirm the deployed frontend URL (the `FrontendWebsiteUrl` output) loads
  and successfully calls the deployed `ApiUrl`.

## Shot list

1. **(0:00–0:15) The scenario.** An elder receives a suspicious KYC/bank
   message on their phone. One sentence of narration: "This is the kind of
   message that panics people into acting fast." Optionally add a
   one-line stat for scale — e.g. "On India's National Cyber Crime Reporting
   Portal, online-fraud complaints roughly quadrupled from about 75,800 in
   FY23 to 2,92,800 in FY24 (RBI/RBI-annual-data reports)." Say it as a
   narrator, never as something the app itself displays.
2. **(0:15–0:30) Screenshot upload.** Open ScamSahayak (the deployed
   `FrontendWebsiteUrl`), select "Upload screenshot," choose the synthetic
   example image (must be under 4 MB).
3. **(0:30–0:45) Visible redaction.** Point out the "What we'll send"
   notice before pressing "Check message" — personal details are masked
   before anything is sent.
4. **(0:45–1:00) Analysis in progress.** Press "Check message," show the
   "Reading the screenshot and checking the message…" loading state (OCR +
   analysis both happen here).
5. **(1:00–1:20) High-risk result.** Show the risk badge and the
   `riskDisclaimer` text ("This is a risk signal, not an official fraud
   determination").
6. **(1:20–1:40) Exact evidence snippets.** Scroll to "Why this was
   flagged" — show the human-readable warning labels *and* the exact
   (already-redacted) text snippet that triggered each one.
7. **(1:40–1:55) Explanation.** Show the Bedrock-generated "In plain
   words" explanation, in Hindi if the presenter switches the language
   toggle here.
8. **(1:55–2:10) Safe action checklist.** Show "What to do now."
9. **(2:10–2:25) Reporting guidance.** Show the "Report this" block: the
   `1930` helpline tel: link and the `cybercrime.gov.in` link.
10. **(2:25–2:40) Evidence bundle download.** Click "Save a copy of this
    result" — show either the signed S3 download (deployed mode) or the
    local JSON download (Build It mode), whichever the demo environment is
    actually running.
11. **(2:40–2:50) Deployed AWS URL + architecture.** Briefly show the
    browser address bar with the real deployed URL — the
    `FrontendWebsiteUrl` stack output (e.g.
    `http://<stack>-frontendhostingbucket-xxxxx.s3-website-<region>.amazonaws.com`)
    — then cut to the architecture diagram in `README.md` to name the AWS
    services used (Lambda, API Gateway, Textract, Bedrock, DynamoDB, S3).
12. **(2:50–3:00) Limitation + disclaimer, closing line.** State one real
    limitation out loud (e.g. "this is a deterministic pattern check, not a
    trained classifier — it can miss new scam wording") and close on the
    disclaimer already shown in the app: this is guidance, not an official
    determination.

## What NOT to do in the recording

- Don't fabricate a UI state (e.g. a "fund frozen" or "complaint filed"
  screen) that the app doesn't actually have — the product explicitly
  never does those things.
- Don't use a real phone number, real UPI ID, real bank account number, or
  a real screenshot from an actual scam message someone received. Write a
  synthetic example.
- Don't skip the redaction/disclaimer beats to save time — they're part of
  what makes the product responsible, not just a feature to mention once.
