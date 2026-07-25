import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

export function createOpaqueToken(prefix: "progress_ac_" | "progress_rt_"): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function createPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export function verifyPkceChallenge(
  verifier: string,
  expectedChallenge: string,
): boolean {
  const actual = Buffer.from(createPkceChallenge(verifier))
  const expected = Buffer.from(expectedChallenge)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
