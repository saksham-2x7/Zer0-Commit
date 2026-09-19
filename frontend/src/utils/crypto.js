/**
 * Zero-knowledge E2E encryption for the family chat ("crypto chan").
 *
 * Scheme (see docs/FAMILY_UPGRADE.md §Messaging):
 *  - Every member owns an ECDH P-256 keypair. The private key never leaves
 *    the device (localStorage); the public JWK is registered server-side.
 *  - One AES-256-GCM group key per thread. It is wrapped for each member
 *    with ECDH + HKDF-SHA256 + AES-GCM (AAD = threadId) and only the wrapped
 *    copy is stored on the server.
 *  - Messages are AES-256-GCM under the group key; the server only ever sees
 *    { iv, ciphertext }.
 *  - A member's fingerprint is SHA-256 of their public JWK, shown as
 *    abcd-ef01-2345-6789 so people can verify keys out-of-band.
 *
 * Requires a secure context (HTTPS or localhost) for crypto.subtle.
 */

const HKDF_INFO = new TextEncoder().encode("scamsahayak-group-key-v1");
const HKDF_SALT = new TextEncoder().encode("scamsahayak-ecdh-salt-v1");

function bytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function canonicalJwk(jwk) {
  // Stable serialization so the same key always fingerprints the same way.
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
}

/** Generate a member's ECDH P-256 keypair. Returns { privateKey, publicKeyJwk }. */
export async function generateMemberKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return { privateKey: keyPair.privateKey, publicKeyJwk };
}

/** Export a private CryptoKey as JWK (for localStorage persistence). */
export async function exportPrivateKeyJwk(privateKey) {
  return crypto.subtle.exportKey("jwk", privateKey);
}

/** Re-import a private JWK from localStorage. */
export async function importPrivateKeyJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
}

/** SHA-256 of a public JWK, formatted abcd-ef01-2345-6789. */
export async function deriveFingerprint(publicKeyJwk) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJwk(publicKeyJwk))
  );
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/** Fresh AES-256-GCM group key for a thread. */
export async function generateGroupKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/**
 * Wrap the group key for a recipient using OUR private key.
 * Returns { wrappedKey, iv } as base64.
 */
export async function wrapGroupKeyForMember(groupKey, ourPrivateKey, recipientPublicJwk, threadId) {
  const recipientPublicKey = await crypto.subtle.importKey(
    "jwk",
    recipientPublicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientPublicKey },
    ourPrivateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const groupKeyRaw = await crypto.subtle.exportKey("raw", groupKey);
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(threadId) },
    wrappingKey,
    groupKeyRaw
  );
  return { wrappedKey: bytesToBase64(new Uint8Array(wrapped)), iv: bytesToBase64(iv) };
}

/**
 * Recover the group key from a wrapped copy: ECDH(ourPrivate, senderPublic) ->
 * HKDF -> AES-GCM decrypt. Returns the AES-256-GCM group CryptoKey.
 */
export async function unwrapGroupKey(wrappedKeyB64, ivB64, ourPrivateKey, senderPublicJwk, threadId) {
  const senderPublicKey = await crypto.subtle.importKey(
    "jwk",
    senderPublicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: senderPublicKey },
    ourPrivateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const groupKeyRaw = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivB64),
      additionalData: new TextEncoder().encode(threadId),
    },
    wrappingKey,
    base64ToBytes(wrappedKeyB64)
  );
  return crypto.subtle.importKey("raw", groupKeyRaw, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a message under the group key. Returns { iv, ciphertext } base64. */
export async function encryptMessage(groupKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    groupKey,
    new TextEncoder().encode(plaintext)
  );
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

/** Decrypt a message under the group key. Returns the plaintext string. */
export async function decryptMessage(groupKey, ivB64, ciphertextB64) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) },
    groupKey,
    base64ToBytes(ciphertextB64)
  );
  return new TextDecoder().decode(plaintext);
}