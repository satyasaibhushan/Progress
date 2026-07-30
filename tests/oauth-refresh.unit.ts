import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import test from "node:test"
import {
  classifyRefreshTokenUse,
  protectRefreshTokenForReplay,
  recoverRefreshTokenForReplay,
  type RefreshTokenState,
} from "../lib/oauth/refresh"

const now = new Date("2026-07-30T06:30:00.000Z")
const signingKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey
const activeToken: RefreshTokenState = {
  clientId: "mcp-client",
  resource: "https://progress.example.com/mcp",
  expiresAt: new Date("2026-08-30T06:30:00.000Z"),
  consumedAt: null,
  revokedAt: null,
  replacementTokenCiphertext: null,
}

test("an active refresh token is rotated normally", () => {
  assert.equal(
    classifyRefreshTokenUse(
      activeToken,
      {
        clientId: "mcp-client",
        resource: "https://progress.example.com/mcp",
      },
      now,
      10,
    ),
    "rotate",
  )
})

test("an immediate concurrent refresh receives the prior rotation result", () => {
  assert.equal(
    classifyRefreshTokenUse(
      {
        ...activeToken,
        consumedAt: new Date(now.getTime() - 2_000),
        replacementTokenCiphertext: "protected-replacement",
      },
      {
        clientId: "mcp-client",
        resource: "https://progress.example.com/mcp",
      },
      now,
      10,
    ),
    "retry",
  )
})

test("refresh-token reuse outside the grace period remains an attack signal", () => {
  assert.equal(
    classifyRefreshTokenUse(
      {
        ...activeToken,
        consumedAt: new Date(now.getTime() - 11_000),
        replacementTokenCiphertext: "protected-replacement",
      },
      {
        clientId: "mcp-client",
        resource: "https://progress.example.com/mcp",
      },
      now,
      10,
    ),
    "reused",
  )
})

test("invalid client, resource, expiry, or revocation never receives a replacement", () => {
  const request = {
    clientId: "mcp-client",
    resource: "https://progress.example.com/mcp",
  }

  assert.equal(
    classifyRefreshTokenUse(activeToken, { ...request, clientId: "other" }, now, 10),
    "invalid",
  )
  assert.equal(
    classifyRefreshTokenUse(activeToken, { ...request, resource: "https://other.example/mcp" }, now, 10),
    "invalid",
  )
  assert.equal(
    classifyRefreshTokenUse({ ...activeToken, expiresAt: now }, request, now, 10),
    "invalid",
  )
  assert.equal(
    classifyRefreshTokenUse({ ...activeToken, revokedAt: now }, request, now, 10),
    "invalid",
  )
})

test("the cached replacement token is encrypted and authenticated", () => {
  const refreshToken = "progress_rt_test-replacement"
  const protectedToken = protectRefreshTokenForReplay(refreshToken, signingKey)

  assert.notEqual(protectedToken, refreshToken)
  assert.equal(
    recoverRefreshTokenForReplay(protectedToken, signingKey),
    refreshToken,
  )

  const parts = protectedToken.split(".")
  parts[3] = `${parts[3].startsWith("A") ? "B" : "A"}${parts[3].slice(1)}`
  const tampered = parts.join(".")
  assert.equal(recoverRefreshTokenForReplay(tampered, signingKey), null)
})
