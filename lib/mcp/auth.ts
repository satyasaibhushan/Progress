import { createHash, randomUUID } from "node:crypto"
import type { OAuthSigningKeys } from "@/lib/oauth/keys"
import { OAuthConfigurationError } from "@/lib/oauth/config"
import { verifyProgressAccessToken } from "@/lib/oauth/tokens"
import { prisma } from "@/lib/prisma"
import {
  getBearerChallenge,
  type McpAuthConfig,
} from "@/lib/mcp/config"

export type McpPrincipal = {
  userId: string
  issuer: string
  subject: string
  clientId: string
  scopes: string[]
  expiresAt?: number
}

export type McpUserStore = {
  findUserById(userId: string): Promise<{ id: string } | null>
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

const prismaUserStore: McpUserStore = {
  findUserById(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
  },
}

export function getTokenScopes(payload: { scope?: unknown }): string[] {
  if (typeof payload.scope !== "string") return []
  return [...new Set(payload.scope.split(/\s+/).filter(Boolean))]
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

export async function verifyMcpAccessToken(
  token: string,
  config: McpAuthConfig,
  keys?: OAuthSigningKeys,
  store: McpUserStore = prismaUserStore,
): Promise<McpPrincipal> {
  let payload
  try {
    payload = await verifyProgressAccessToken(token, config, keys)
  } catch (error) {
    if (error instanceof OAuthConfigurationError) throw error
    throw new McpAuthenticationError(
      "Access token is invalid or expired",
      401,
      "invalid_token",
    )
  }

  if (payload.client_id !== config.client.id) {
    throw new McpAuthenticationError(
      "Access token was issued to an unknown client",
      401,
      "invalid_token",
    )
  }

  const scopes = getTokenScopes(payload)
  requireScopes(scopes, config.requiredScopes)

  const user = await store.findUserById(payload.sub)
  if (!user) {
    throw new McpAuthenticationError(
      "Access token subject is not a Progress user",
      401,
      "invalid_token",
    )
  }

  return {
    userId: user.id,
    issuer: config.issuer,
    subject: payload.sub,
    clientId: payload.client_id,
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
