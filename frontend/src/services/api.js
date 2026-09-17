/**
 * Talks to SUTRADHAR's POST /api/analyze per backend/api/CONTRACT.md.
 * Never hardcode the API URL — always read VITE_API_BASE_URL.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function analyzeMessage({ language, inputType, rawText, imageBase64 }) {
  const response = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, inputType, rawText, imageBase64 }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (data && data.error) || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}
