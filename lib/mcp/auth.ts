import { createHash, randomUUID } from "node:crypto"
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose"
import { prisma } from "@/lib/prisma"
import {
  getBearerChallenge,
  type McpAuthConfig,
} from "@/lib/mcp/config"

const remoteKeySets = new Map<string, JWTVerifyGetKey>()

export type McpPrincipal = {
  userId: string
  issuer: string
  subject: string
  clientId: string
  scopes: string[]
  expiresAt?: number
}

export type McpIdentityStore = {
  findIdentity(issuer: string, subject: string): Promise<{ userId: string } | null>
  findUserById(userId: string): Promise<{ id: string } | null>
  findUserByEmail(email: string): Promise<{ id: string } | null>
  linkIdentity(issuer: string, subject: string, userId: string): Promise<{ userId: string }>
}

export class McpAuthenticationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
    readonly errorCode: string,
    readonly scopes?: string[],
  ) {
    super(message)
    this.name = "McpAuthenticationError"
  }
}

const prismaIdentityStore: McpIdentityStore = {
  findIdentity(issuer, subject) {
    return prisma.mcpIdentity.findUnique({
      where: {
        issuer_subject: { issuer, subject },
      },
      select: { userId: true },
    })
  },
  findUserById(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
  },
  findUserByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
  },
  linkIdentity(issuer, subject, userId) {
    return prisma.mcpIdentity.upsert({
      where: {
        issuer_subject: { issuer, subject },
      },
      update: {},
      create: {
        issuer,
        subject,
        userId,
      },
      select: { userId: true },
    })
  },
}

function getRemoteKeySet(url: URL): JWTVerifyGetKey {
  const key = url.toString()
  const existing = remoteKeySets.get(key)
  if (existing) return existing

  const created = createRemoteJWKSet(url)
  remoteKeySets.set(key, created)
  return created
}

export function getTokenScopes(payload: JWTPayload): string[] {
  const scopes = new Set<string>()

  if (typeof payload.scope === "string") {
    for (const scope of payload.scope.split(/\s+/)) {
      if (scope) scopes.add(scope)
    }
  }

  for (const claim of [payload.scp, payload.permissions]) {
    if (!Array.isArray(claim)) continue
    for (const scope of claim) {
      if (typeof scope === "string" && scope) scopes.add(scope)
    }
  }

  return [...scopes]
}

function requireScopes(
  tokenScopes: string[],
  requiredScopes: string[],
): void {
  const granted = new Set(tokenScopes)
  const missing = requiredScopes.filter((scope) => !granted.has(scope))

  if (missing.length > 0) {
    throw new McpAuthenticationError(
      `Missing required scope${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
      403,
      "insufficient_scope",
      requiredScopes,
    )
  }
}

function getStringClaim(payload: JWTPayload, name: string): string | null {
  const value = payload[name]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export async function resolveMcpUserId(
  payload: JWTPayload,
  config: McpAuthConfig,
  store: McpIdentityStore = prismaIdentityStore,
): Promise<string> {
  if (!payload.sub) {
    throw new McpAuthenticationError("Access token has no subject", 401, "invalid_token")
  }

  const existing = await store.findIdentity(config.issuer, payload.sub)
  if (existing) return existing.userId

  let candidateUserId: string | null = null

  if (config.userIdClaim) {
    const claimedUserId = getStringClaim(payload, config.userIdClaim)
    if (claimedUserId) {
      const user = await store.findUserById(claimedUserId)
      candidateUserId = user?.id || null
    }
  }

  if (
    !candidateUserId &&
    config.allowEmailLinking &&
    payload.email_verified === true &&
    typeof payload.email === "string"
  ) {
    const user = await store.findUserByEmail(payload.email.trim().toLowerCase())
    candidateUserId = user?.id || null
  }

  if (!candidateUserId) {
    throw new McpAuthenticationError(
      "This OAuth identity is not linked to a Progress account",
      403,
      "account_not_linked",
    )
  }

  const linked = await store.linkIdentity(config.issuer, payload.sub, candidateUserId)
  return linked.userId
}

export async function verifyMcpAccessToken(
  token: string,
  config: McpAuthConfig,
  keySet: JWTVerifyGetKey = getRemoteKeySet(config.jwksUrl),
  store: McpIdentityStore = prismaIdentityStore,
): Promise<McpPrincipal> {
  let payload: JWTPayload

  try {
    const verified = await jwtVerify(token, keySet, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: config.jwtAlgorithms,
      clockTolerance: 5,
    })
    payload = verified.payload
  } catch {
    throw new McpAuthenticationError(
      "Access token is invalid or expired",
      401,
      "invalid_token",
    )
  }

  if (!payload.sub) {
    throw new McpAuthenticationError("Access token has no subject", 401, "invalid_token")
  }

  const scopes = getTokenScopes(payload)
  requireScopes(scopes, config.requiredScopes)
  const userId = await resolveMcpUserId(payload, config, store)
  const clientId = getStringClaim(payload, "client_id")
    || getStringClaim(payload, "azp")
    || "unknown"

  return {
    userId,
    issuer: config.issuer,
    subject: payload.sub,
    clientId,
    scopes,
    expiresAt: payload.exp,
  }
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization")
  if (!authorization) {
    throw new McpAuthenticationError(
      "Bearer access token is required",
      401,
      "invalid_token",
    )
  }

  const match = authorization.match(/^Bearer ([^\s]+)$/i)
  if (!match) {
    throw new McpAuthenticationError(
      "Authorization header must use the Bearer scheme",
      401,
      "invalid_token",
    )
  }

  return match[1]
}

export async function authenticateMcpRequest(
  request: Request,
  config: McpAuthConfig,
): Promise<McpPrincipal> {
  return verifyMcpAccessToken(getBearerToken(request), config)
}

export function createMcpAuthErrorResponse(
  error: McpAuthenticationError,
  config: McpAuthConfig,
  requestId: string = randomUUID(),
): Response {
  const challenge = getBearerChallenge(config, {
    error: error.errorCode,
    description: error.message,
    scopes: error.scopes,
  })

  return Response.json(
    {
      error: error.errorCode,
      error_description: error.message,
      request_id: requestId,
    },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": challenge,
        "X-Request-Id": requestId,
      },
    },
  )
}

export function logMcpAuditEvent(event: {
  requestId: string
  outcome: "allowed" | "denied" | "error"
  action: string
  principal?: McpPrincipal
  status?: number
}): void {
  const subjectHash = event.principal
    ? createHash("sha256")
      .update(`${event.principal.issuer}\0${event.principal.subject}`)
      .digest("hex")
      .slice(0, 16)
    : undefined

  console.info(JSON.stringify({
    event: "mcp_access",
    requestId: event.requestId,
    outcome: event.outcome,
    action: event.action,
    status: event.status,
    userId: event.principal?.userId,
    clientId: event.principal?.clientId,
    subjectHash,
  }))
}
