import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { readOAuthServerConfig } from "@/lib/oauth/config"
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/oauth/crypto"
import { OAuthProtocolError } from "@/lib/oauth/protocol"
import { exchangeRefreshToken } from "@/lib/oauth/store"

async function main(): Promise<void> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const privateKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey.export({
    format: "pem",
    type: "pkcs8",
  }).toString()
  process.env.OAUTH_SIGNING_PRIVATE_KEY = privateKey
  process.env.OAUTH_SIGNING_KEY_ID = `oauth-refresh-integration-${runId}`

  const config = readOAuthServerConfig({
    NEXTAUTH_URL: "https://progress.example.com",
    MCP_RESOURCE_URL: "https://progress.example.com/mcp",
    MCP_AUTH_REQUIRED_SCOPES: "progress:read",
  })
  const user = await prisma.user.create({
    data: { email: `oauth-refresh-${runId}@example.test` },
  })
  const refreshToken = createOpaqueToken("progress_rt_")
  const familyId = `oauth-refresh-family-${runId}`

  try {
    await prisma.oauthRefreshToken.create({
      data: {
        tokenHash: hashOpaqueToken(refreshToken),
        familyId,
        userId: user.id,
        clientId: "oauth-refresh-integration-client",
        resource: config.resourceUrl.toString(),
        scope: "progress:read",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        exchangeRefreshToken(
          {
            refreshToken,
            clientId: "oauth-refresh-integration-client",
            resource: config.resourceUrl.toString(),
          },
          config,
        )
      ),
    )
    const successful = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)

    assert.equal(
      successful.length,
      3,
      "concurrent refreshes should all receive an idempotent response",
    )
    assert.equal(
      new Set(successful.map((tokens) => tokens.refresh_token)).size,
      1,
      "concurrent refreshes should receive the same replacement refresh token",
    )

    const family = await prisma.oauthRefreshToken.findMany({
      where: { familyId },
    })
    assert.equal(
      family.filter((token) => token.consumedAt === null).length,
      1,
      "the refresh race should create one active replacement token",
    )
    assert.equal(
      family.filter((token) => token.revokedAt !== null).length,
      0,
      "an immediate retry should not revoke the refresh-token family",
    )
    const activeReplacement = family.find((token) => token.consumedAt === null)
    assert.ok(activeReplacement)
    assert.ok(
      activeReplacement.expiresAt.getTime()
        > Date.now() + (config.refreshTokenTtlSeconds - 5) * 1000,
      "successful refresh should renew the inactivity window",
    )

    await prisma.oauthRefreshToken.update({
      where: { tokenHash: hashOpaqueToken(refreshToken) },
      data: {
        consumedAt: new Date(
          Date.now() - (config.refreshTokenReuseGraceSeconds + 1) * 1000,
        ),
      },
    })
    await assert.rejects(
      exchangeRefreshToken(
        {
          refreshToken,
          clientId: "oauth-refresh-integration-client",
          resource: config.resourceUrl.toString(),
        },
        config,
      ),
      (error: unknown) => (
        error instanceof OAuthProtocolError
        && error.errorCode === "invalid_grant"
        && /family was revoked/.test(error.message)
      ),
    )

    const revokedFamily = await prisma.oauthRefreshToken.findMany({
      where: { familyId },
    })
    assert.equal(
      revokedFamily.every((token) => token.revokedAt !== null),
      true,
      "reuse after the grace period should revoke the refresh-token family",
    )
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exitCode = 1
})
