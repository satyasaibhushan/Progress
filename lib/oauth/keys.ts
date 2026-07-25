import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto"
import { OAuthConfigurationError } from "@/lib/oauth/config"

type OAuthEnvironment = Readonly<Record<string, string | undefined>>

export type OAuthSigningKeys = {
  privateKey: KeyObject
  publicKey: KeyObject
  keyId: string
  publicJwk: JsonWebKey & {
    alg: "RS256"
    kid: string
    use: "sig"
  }
}

const signingKeyCache = new Map<string, OAuthSigningKeys>()

function normalizePrivateKey(value: string): string {
  return value.includes("\n") ? value : value.replace(/\\n/g, "\n")
}

export function readOAuthSigningKeys(
  environment: OAuthEnvironment = process.env,
): OAuthSigningKeys {
  const configuredKey = environment.OAUTH_SIGNING_PRIVATE_KEY?.trim()
  if (!configuredKey) {
    throw new OAuthConfigurationError("OAUTH_SIGNING_PRIVATE_KEY is required")
  }

  const privateKeyPem = normalizePrivateKey(configuredKey)
  const keyId = environment.OAUTH_SIGNING_KEY_ID?.trim() || "progress-oauth-1"
  const cacheKey = createHash("sha256")
    .update(keyId)
    .update("\0")
    .update(privateKeyPem)
    .digest("hex")
  const cached = signingKeyCache.get(cacheKey)
  if (cached) return cached

  let privateKey: KeyObject
  try {
    privateKey = createPrivateKey(privateKeyPem)
  } catch {
    throw new OAuthConfigurationError(
      "OAUTH_SIGNING_PRIVATE_KEY must be a valid private key",
    )
  }

  if (privateKey.asymmetricKeyType !== "rsa") {
    throw new OAuthConfigurationError(
      "OAUTH_SIGNING_PRIVATE_KEY must be an RSA private key",
    )
  }

  const modulusLength = privateKey.asymmetricKeyDetails?.modulusLength || 0
  if (modulusLength < 2048) {
    throw new OAuthConfigurationError(
      "OAUTH_SIGNING_PRIVATE_KEY must be at least 2048 bits",
    )
  }

  const publicKey = createPublicKey(privateKey)
  const publicJwk = {
    ...publicKey.export({ format: "jwk" }),
    alg: "RS256" as const,
    kid: keyId,
    use: "sig" as const,
  }
  const keys = {
    privateKey,
    publicKey,
    keyId,
    publicJwk,
  }
  signingKeyCache.set(cacheKey, keys)
  return keys
}

export function getPublicJwks(environment: OAuthEnvironment = process.env) {
  return {
    keys: [readOAuthSigningKeys(environment).publicJwk],
  }
}
