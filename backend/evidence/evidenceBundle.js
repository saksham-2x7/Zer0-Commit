/**
 * Redacted evidence bundle — a plain JSON record the user can attach when
 * filing a report at cybercrime.gov.in. Only ever built from already-
 * redacted data; never includes raw text or raw images.
 *
 * In deployed ("Ship It") mode (EVIDENCE_BUCKET_NAME set), the bundle is
 * uploaded to a private S3 bucket and a short-lived signed URL is returned.
 * In local ("Build It") mode, storage is skipped — the frontend builds and
 * downloads the same bundle client-side instead (see
 * frontend/src/utils/evidenceBundle.js), which is a documented, explicit
 * Build It fallback, not a silent difference in what's redacted.
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const SIGNED_URL_TTL_SECONDS = 15 * 60;

let cachedClient = null;
function getClient() {
  if (!cachedClient) {
    cachedClient = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
  }
  return cachedClient;
}

function isDeployedMode() {
  return Boolean(process.env.EVIDENCE_BUCKET_NAME);
}

/**
 * @param {{ caseId, language, inputType, redactedText, riskLevel, matchedPatterns, evidence, checklist, reportingLinks }} input
 */
function buildEvidenceBundle({
  caseId,
  language,
  inputType,
  redactedText,
  riskLevel,
  matchedPatterns,
  evidence,
  checklist,
  reportingLinks,
}) {
  return {
    caseId,
    createdAt: new Date().toISOString(),
    language,
    inputType,
    redactedText: redactedText || "",
    riskLevel,
    matchedPatterns,
    evidence,
    checklist,
    reportingLinks,
    disclaimer: "This is a risk signal, not an official fraud determination.",
  };
}

/**
 * Stores the bundle in S3 (deployed mode) and returns a short-lived signed
 * download URL, or reports unavailability (local mode) so the frontend
 * falls back to a client-side download.
 * @returns {Promise<{ available: boolean, downloadUrl?: string }>}
 */
async function storeEvidenceBundle(bundle) {
  if (!isDeployedMode()) {
    return { available: false };
  }

  const client = getClient();
  const key = `evidence/${bundle.caseId}.json`;

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.EVIDENCE_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(bundle, null, 2),
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
    })
  );

  const downloadUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: process.env.EVIDENCE_BUCKET_NAME, Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );

  return { available: true, downloadUrl };
}

module.exports = { buildEvidenceBundle, storeEvidenceBundle, isDeployedMode };
