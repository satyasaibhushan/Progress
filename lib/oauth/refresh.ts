import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  type KeyObject,
} from "node:crypto"

const REPLAY_CIPHER_VERSION = "v1"
const REPLAY_CIPHER_AAD = Buffer.from("progress-oauth-refresh-replay:v1")

export type RefreshTokenState = {
  clientId: string
  resource: string
  expiresAt: Date
  consumedAt: Date | null
  revokedAt: Date | null
  replacementTokenCiphertext: string | null
}

export type RefreshTokenUse = "rotate" | "retry" | "reused" | "invalid"

export function classifyRefreshTokenUse(
  token: RefreshTokenState,
  request: {
    clientId: string
    resource: string
  },
  now: Date,
  reuseGraceSeconds: number,
): RefreshTokenUse {
  const valid = token.revokedAt === null
    && token.expiresAt > now
    && token.clientId === request.clientId
    && token.resource === request.resource
  if (!valid) return "invalid"
  if (!token.consumedAt) return "rotate"

  const elapsedMilliseconds = now.getTime() - token.consumedAt.getTime()
  if (
    token.replacementTokenCiphertext
    && elapsedMilliseconds >= 0
    && elapsedMilliseconds <= reuseGraceSeconds * 1000
  ) {
    return "retry"
  }
  return "reused"
}

function deriveReplayEncryptionKey(signingKey: KeyObject): Buffer {
  const privateKey = signingKey.export({
    format: "der",
    type: "pkcs8",
  })
  return createHash("sha256")
    .update("progress-oauth-refresh-replay\0")
    .update(privateKey)
    .digest()
}

export function protectRefreshTokenForReplay(
  refreshToken: string,
  signingKey: KeyObject,
): string {
  const initializationVector = randomBytes(12)
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveReplayEncryptionKey(signingKey),
    initializationVector,
  )
  cipher.setAAD(REPLAY_CIPHER_AAD)
  const encrypted = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ])
  const authenticationTag = cipher.getAuthTag()

  return [
    REPLAY_CIPHER_VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

export function recoverRefreshTokenForReplay(
  protectedToken: string,
  signingKey: KeyObject,
): string | null {
  try {
    const [version, encodedIv, encodedTag, encodedToken, extra] =
      protectedToken.split(".")
    if (
      version !== REPLAY_CIPHER_VERSION
      || !encodedIv
      || !encodedTag
      || !encodedToken
      || extra
    ) {
      return null
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveReplayEncryptionKey(signingKey),
      Buffer.from(encodedIv, "base64url"),
    )
    decipher.setAAD(REPLAY_CIPHER_AAD)
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(encodedToken, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}
