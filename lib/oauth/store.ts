import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type {
  OAuthServerConfig,
} from "@/lib/oauth/config"
import {
  createOpaqueToken,
  hashOpaqueToken,
  verifyPkceChallenge,
} from "@/lib/oauth/crypto"
import {
  OAuthProtocolError,
  validatePkceVerifier,
  type ValidatedAuthorizationRequest,
} from "@/lib/oauth/protocol"
import { signProgressAccessToken } from "@/lib/oauth/tokens"

export type OAuthTokenResponse = {
  access_token: string
  token_type: "Bearer"
  expires_in: number
  refresh_token?: string
  scope: string
}

function expiresAt(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000)
}

export async function createAuthorizationRequest(
  userId: string,
  request: ValidatedAuthorizationRequest,
  config: OAuthServerConfig,
) {
  return prisma.oauthAuthorizationRequest.create({
    data: {
      userId,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      resource: request.resource,
      scope: request.scope,
      state: request.state,
      codeChallenge: request.codeChallenge,
      expiresAt: expiresAt(config.authorizationRequestTtlSeconds),
    },
  })
}

export async function getAuthorizationRequest(
  id: string,
  userId: string,
) {
  return prisma.oauthAuthorizationRequest.findFirst({
    where: {
      id,
      userId,
      expiresAt: { gt: new Date() },
    },
  })
}

export async function completeAuthorizationRequest(
  input: {
    id: string
    userId: string
    approved: boolean
  },
  config: OAuthServerConfig,
): Promise<{
  redirectUri: string
  state: string
  clientId: string
  code: string | null
}> {
  const rawCode = input.approved ? createOpaqueToken("progress_ac_") : null
  const codeHash = rawCode ? hashOpaqueToken(rawCode) : null

  const completed = await prisma.$transaction(async (transaction) => {
    const pending = await transaction.oauthAuthorizationRequest.findFirst({
      where: {
        id: input.id,
        userId: input.userId,
        expiresAt: { gt: new Date() },
      },
    })
    if (!pending) return null

    const consumed = await transaction.oauthAuthorizationRequest.deleteMany({
      where: {
        id: pending.id,
        userId: input.userId,
        expiresAt: { gt: new Date() },
      },
    })
    if (consumed.count !== 1) return null

    if (input.approved && codeHash) {
      await transaction.oauthAuthorizationCode.create({
        data: {
          codeHash,
          userId: pending.userId,
          clientId: pending.clientId,
          redirectUri: pending.redirectUri,
          resource: pending.resource,
          scope: pending.scope,
          codeChallenge: pending.codeChallenge,
          expiresAt: expiresAt(config.authorizationCodeTtlSeconds),
        },
      })
    }

    return pending
  })

  if (!completed) {
    throw new OAuthProtocolError(
      "invalid_request",
      "Authorization request is invalid or expired",
    )
  }

  return {
    redirectUri: completed.redirectUri,
    state: completed.state,
    clientId: completed.clientId,
    code: rawCode,
  }
}

async function createTokenResponse(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string
    clientId: string
    resource: string
    scope: string
    familyId: string
    refreshExpiresAt: Date
    refreshToken: string
    issueRefreshToken: boolean
  },
  config: OAuthServerConfig,
): Promise<OAuthTokenResponse> {
  const signed = await signProgressAccessToken(input, config)
  if (input.issueRefreshToken) {
    await transaction.oauthRefreshToken.create({
      data: {
        tokenHash: hashOpaqueToken(input.refreshToken),
        familyId: input.familyId,
        userId: input.userId,
        clientId: input.clientId,
        resource: input.resource,
        scope: input.scope,
        expiresAt: input.refreshExpiresAt,
      },
    })
  }

  return {
    access_token: signed.token,
    token_type: "Bearer",
    expires_in: config.accessTokenTtlSeconds,
    ...(input.issueRefreshToken
      ? { refresh_token: input.refreshToken }
      : {}),
    scope: input.scope,
  }
}

export async function exchangeAuthorizationCode(
  input: {
    code: string
    codeVerifier: string
    clientId: string
    redirectUri: string
    resource: string
    issueRefreshToken: boolean
  },
  config: OAuthServerConfig,
): Promise<OAuthTokenResponse> {
  validatePkceVerifier(input.codeVerifier)
  const refreshToken = createOpaqueToken("progress_rt_")
  const familyId = randomUUID()

  const outcome = await prisma.$transaction(async (transaction) => {
    const authorizationCode = await transaction.oauthAuthorizationCode.findUnique({
      where: { codeHash: hashOpaqueToken(input.code) },
    })
    if (!authorizationCode) return null

    const valid = authorizationCode.consumedAt === null
      && authorizationCode.expiresAt > new Date()
      && authorizationCode.clientId === input.clientId
      && authorizationCode.redirectUri === input.redirectUri
      && authorizationCode.resource === input.resource
      && verifyPkceChallenge(
        input.codeVerifier,
        authorizationCode.codeChallenge,
      )
    if (!valid) return null

    const consumed = await transaction.oauthAuthorizationCode.updateMany({
      where: {
        id: authorizationCode.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    })
    if (consumed.count !== 1) return null

    return createTokenResponse(
      transaction,
      {
        userId: authorizationCode.userId,
        clientId: authorizationCode.clientId,
        resource: authorizationCode.resource,
        scope: authorizationCode.scope,
        familyId,
        refreshExpiresAt: expiresAt(config.refreshTokenTtlSeconds),
        refreshToken,
        issueRefreshToken: input.issueRefreshToken,
      },
      config,
    )
  })

  if (!outcome) {
    throw new OAuthProtocolError(
      "invalid_grant",
      "Authorization code is invalid, expired, or already used",
    )
  }
  return outcome
}

export async function exchangeRefreshToken(
  input: {
    refreshToken: string
    clientId: string
    resource: string
  },
  config: OAuthServerConfig,
): Promise<OAuthTokenResponse> {
  const replacementToken = createOpaqueToken("progress_rt_")
  const outcome = await prisma.$transaction(async (transaction) => {
    const current = await transaction.oauthRefreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(input.refreshToken) },
    })
    if (!current) return { kind: "invalid" as const }

    if (current.consumedAt) {
      await transaction.oauthRefreshToken.updateMany({
        where: {
          familyId: current.familyId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      })
      return { kind: "reused" as const }
    }

    const valid = current.revokedAt === null
      && current.expiresAt > new Date()
      && current.clientId === input.clientId
      && current.resource === input.resource
    if (!valid) return { kind: "invalid" as const }

    const consumed = await transaction.oauthRefreshToken.updateMany({
      where: {
        id: current.id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    })
    if (consumed.count !== 1) {
      await transaction.oauthRefreshToken.updateMany({
        where: {
          familyId: current.familyId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      })
      return { kind: "reused" as const }
    }

    const tokens = await createTokenResponse(
      transaction,
      {
        userId: current.userId,
        clientId: current.clientId,
        resource: current.resource,
        scope: current.scope,
        familyId: current.familyId,
        refreshExpiresAt: current.expiresAt,
        refreshToken: replacementToken,
        issueRefreshToken: true,
      },
      config,
    )
    return { kind: "success" as const, tokens }
  })

  if (outcome.kind !== "success") {
    throw new OAuthProtocolError(
      "invalid_grant",
      outcome.kind === "reused"
        ? "Refresh token reuse detected; the token family was revoked"
        : "Refresh token is invalid, expired, or revoked",
    )
  }
  return outcome.tokens
}

export async function revokeRefreshToken(
  token: string,
  clientId: string,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.oauthRefreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    })
    if (!current || current.clientId !== clientId) return

    await transaction.oauthRefreshToken.updateMany({
      where: {
        familyId: current.familyId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    })
  })
}
