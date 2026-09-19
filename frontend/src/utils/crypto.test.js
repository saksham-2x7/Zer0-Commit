// @vitest-environment node
import { describe, test, expect } from "vitest";
import {
  generateMemberKeyPair,
  exportPrivateKeyJwk,
  importPrivateKeyJwk,
  deriveFingerprint,
  generateGroupKey,
  wrapGroupKeyForMember,
  unwrapGroupKey,
  encryptMessage,
  decryptMessage,
} from "./crypto";

describe("member keypairs", () => {
  test("generates an ECDH P-256 pair and round-trips the private JWK", async () => {
    const { privateKey, publicKeyJwk } = await generateMemberKeyPair();
    expect(publicKeyJwk.kty).toBe("EC");
    expect(publicKeyJwk.crv).toBe("P-256");
    expect(publicKeyJwk.x).toBeTruthy();
    expect(publicKeyJwk.y).toBeTruthy();

    const jwk = await exportPrivateKeyJwk(privateKey);
    const reimported = await importPrivateKeyJwk(jwk);
    expect(reimported.type).toBe("private");
    expect(reimported.algorithm.name).toBe("ECDH");
  });

  test("fingerprint is stable and formatted abcd-ef01-2345-6789", async () => {
    const { publicKeyJwk } = await generateMemberKeyPair();
    const a = await deriveFingerprint(publicKeyJwk);
    const b = await deriveFingerprint(publicKeyJwk);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
  });

  test("different keys produce different fingerprints", async () => {
    const { publicKeyJwk: k1 } = await generateMemberKeyPair();
    const { publicKeyJwk: k2 } = await generateMemberKeyPair();
    expect(await deriveFingerprint(k1)).not.toBe(await deriveFingerprint(k2));
  });
});

describe("group key wrapping", () => {
  test("alice wraps for bob, bob unwraps with his private key", async () => {
    const alice = await generateMemberKeyPair();
    const bob = await generateMemberKeyPair();
    const groupKey = await generateGroupKey();
    const threadId = "thread_abc";

    const { wrappedKey, iv } = await wrapGroupKeyForMember(
      groupKey,
      alice.privateKey,
      bob.publicKeyJwk,
      threadId
    );
    expect(wrappedKey).toBeTruthy();
    expect(iv).toBeTruthy();

    const recovered = await unwrapGroupKey(
      wrappedKey,
      iv,
      bob.privateKey,
      alice.publicKeyJwk,
      threadId
    );
    expect(recovered.algorithm.name).toBe("AES-GCM");
    expect(recovered.usages).toContain("decrypt");
  });

  test("wrong threadId (AAD) makes unwrap fail", async () => {
    const alice = await generateMemberKeyPair();
    const bob = await generateMemberKeyPair();
    const groupKey = await generateGroupKey();

    const { wrappedKey, iv } = await wrapGroupKeyForMember(
      groupKey,
      alice.privateKey,
      bob.publicKeyJwk,
      "thread_abc"
    );
    await expect(
      unwrapGroupKey(wrappedKey, iv, bob.privateKey, alice.publicKeyJwk, "thread_other")
    ).rejects.toThrow();
  });
});

describe("message encryption", () => {
  test("encrypt -> decrypt round-trips the plaintext", async () => {
    const groupKey = await generateGroupKey();
    const { iv, ciphertext } = await encryptMessage(groupKey, "OTP 123456 — do not share");
    expect(ciphertext).not.toContain("OTP");
    const plaintext = await decryptMessage(groupKey, iv, ciphertext);
    expect(plaintext).toBe("OTP 123456 — do not share");
  });

  test("tampered ciphertext fails to decrypt", async () => {
    const groupKey = await generateGroupKey();
    const { iv, ciphertext } = await encryptMessage(groupKey, "hello");
    const tampered = (ciphertext.slice(0, -2) + (ciphertext.endsWith("AA") ? "BB" : "AA"));
    await expect(decryptMessage(groupKey, iv, tampered)).rejects.toThrow();
  });

  test("full flow: alice wraps for bob, bob decrypts alice's message", async () => {
    const alice = await generateMemberKeyPair();
    const bob = await generateMemberKeyPair();
    const groupKey = await generateGroupKey();
    const threadId = "thread_full";

    const { wrappedKey, iv } = await wrapGroupKeyForMember(
      groupKey,
      alice.privateKey,
      bob.publicKeyJwk,
      threadId
    );
    const bobGroupKey = await unwrapGroupKey(
      wrappedKey,
      iv,
      bob.privateKey,
      alice.publicKeyJwk,
      threadId
    );

    const { iv: mIv, ciphertext } = await encryptMessage(groupKey, "family secret");
    expect(await decryptMessage(bobGroupKey, mIv, ciphertext)).toBe("family secret");
  });
});