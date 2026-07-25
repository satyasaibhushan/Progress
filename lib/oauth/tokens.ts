import { randomUUID } from "node:crypto"
import {
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from "jose"
import type { OAuthServerConfig } from "@/lib/oauth/config"
import {
  readOAuthSigningKeys,
  type OAuthSigningKeys,
} from "@/lib/oauth/keys"
import { OAuthProtocolError } from "@/lib/oauth/protocol"

export type ProgressAccessTokenClaims = JWTPayload & {
  sub: string
  scope: string
  client_id: string
}

export async function signProgressAccessToken(
  input: {
    userId: string
    clientId: string
    scope: string
  },
  config: OAuthServerConfig,
  keys: OAuthSigningKeys = readOAuthSigningKeys(),
): Promise<{ token: string; expiresAt: number }> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + config.accessTokenTtlSeconds
  const token = await new SignJWT({
    scope: input.scope,
    client_id: input.clientId,
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: keys.keyId,
      typ: "at+jwt",
    })
    .setIssuer(config.issuer)
    .setAudience(config.resourceUrl.toString())
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setNotBefore(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(keys.privateKey)

  return { token, expiresAt }
}

export async function verifyProgressAccessToken(
  token: string,
  config: OAuthServerConfig,
  keys: OAuthSigningKeys = readOAuthSigningKeys(),
): Promise<ProgressAccessTokenClaims> {
  try {
    const verified = await jwtVerify(token, keys.publicKey, {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: config.resourceUrl.toString(),
      typ: "at+jwt",
      clockTolerance: 5,
    })
    const payload = verified.payload

    if (
      typeof payload.sub !== "string"
      || typeof payload.scope !== "string"
      || typeof payload.client_id !== "string"
    ) {
      throw new Error("Required access-token claims are missing")
    }

    return payload as ProgressAccessTokenClaims
  } catch {
    throw new OAuthProtocolError(
      "invalid_token",
      "Access token is invalid or expired",
      401,
    )
  }
}
