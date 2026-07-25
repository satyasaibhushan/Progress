import { prisma } from "@/lib/prisma"
import type { OAuthServerConfig } from "@/lib/oauth/config"
import { createOpaqueToken } from "@/lib/oauth/crypto"
import { OAuthProtocolError } from "@/lib/oauth/protocol"

const MAX_REDIRECT_URIS = 10
const MAX_REDIRECT_URI_LENGTH = 2048
const MAX_CLIENT_NAME_LENGTH = 200
const SUPPORTED_GRANT_TYPES = new Set([
  "authorization_code",
  "refresh_token",
])

export type OAuthClientRegistration = {
  clientName: string
  redirectUris: string[]
  grantTypes: string[]
  responseTypes: string[]
  tokenEndpointAuthMethod: string
  scope: string
}

export type RegisteredOAuthClient = OAuthClientRegistration & {
  clientId: string
  createdAt: Date
}

function getString(
  value: unknown,
  name: string,
  maximumLength: number,
  fallback?: string,
): string {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== "string" || !value.trim()) {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      `${name} must be a non-empty string`,
    )
  }

  const normalized = value.trim()
  if (
    normalized.length > maximumLength
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      `${name} is invalid`,
    )
  }
  return normalized
}

function getStringArray(
  value: unknown,
  name: string,
  fallback: string[],
): string[] {
  const candidate = value === undefined ? fallback : value
  if (
    !Array.isArray(candidate)
    || candidate.length === 0
    || candidate.some((entry) => typeof entry !== "string" || !entry)
  ) {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      `${name} must be a non-empty array of strings`,
    )
  }
  return [...new Set(candidate)]
}

function validateRedirectUri(value: string): string {
  if (value.length > MAX_REDIRECT_URI_LENGTH) {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      "A redirect URI is too long",
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      "A redirect URI is not an absolute URL",
    )
  }

  const isLoopback = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]"
  const hasValidScheme = url.protocol === "https:"
    || (url.protocol === "http:" && isLoopback)
  if (
    !hasValidScheme
    || url.username
    || url.password
    || url.hash
  ) {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      "Redirect URIs must use HTTPS or an HTTP loopback address",
    )
  }

  return url.toString()
}

function readRegistrationObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      "Registration metadata must be a JSON object",
    )
  }
  return value as Record<string, unknown>
}

export function validateClientRegistration(
  value: unknown,
  config: OAuthServerConfig,
): OAuthClientRegistration {
  const metadata = readRegistrationObject(value)
  const redirectUris = getStringArray(
    metadata.redirect_uris,
    "redirect_uris",
    [],
  )
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      `At most ${MAX_REDIRECT_URIS} redirect URIs may be registered`,
    )
  }

  const normalizedRedirectUris = redirectUris.map(validateRedirectUri)
  if (new Set(normalizedRedirectUris).size !== normalizedRedirectUris.length) {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      "redirect_uris must not contain duplicates",
    )
  }

  const grantTypes = getStringArray(
    metadata.grant_types,
    "grant_types",
    ["authorization_code"],
  )
  if (
    !grantTypes.includes("authorization_code")
    || grantTypes.some((grantType) => !SUPPORTED_GRANT_TYPES.has(grantType))
  ) {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      "Only authorization_code and refresh_token grants are supported",
    )
  }

  const responseTypes = getStringArray(
    metadata.response_types,
    "response_types",
    ["code"],
  )
  if (responseTypes.length !== 1 || responseTypes[0] !== "code") {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      "Only the code response type is supported",
    )
  }

  const tokenEndpointAuthMethod = getString(
    metadata.token_endpoint_auth_method,
    "token_endpoint_auth_method",
    64,
    "none",
  )
  if (tokenEndpointAuthMethod !== "none") {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      "Only public clients using token_endpoint_auth_method=none are supported",
    )
  }

  const scope = getString(
    metadata.scope,
    "scope",
    512,
    config.scopes.join(" "),
  )
  const requestedScopes = new Set(scope.split(/\s+/).filter(Boolean))
  if (
    requestedScopes.size !== config.scopes.length
    || config.scopes.some((required) => !requestedScopes.has(required))
  ) {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      "The requested scope is not supported",
    )
  }

  return {
    clientName: getString(
      metadata.client_name,
      "client_name",
      MAX_CLIENT_NAME_LENGTH,
      "MCP client",
    ),
    redirectUris: normalizedRedirectUris,
    grantTypes,
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none",
    scope: config.scopes.join(" "),
  }
}

export async function registerOAuthClient(
  registration: OAuthClientRegistration,
): Promise<RegisteredOAuthClient> {
  return prisma.oauthClient.create({
    data: {
      clientId: createOpaqueToken("progress_client_"),
      clientName: registration.clientName,
      redirectUris: registration.redirectUris,
      grantTypes: registration.grantTypes,
      responseTypes: registration.responseTypes,
      tokenEndpointAuthMethod: registration.tokenEndpointAuthMethod,
      scope: registration.scope,
    },
  })
}

export async function findOAuthClient(
  clientId: string,
): Promise<RegisteredOAuthClient | null> {
  return prisma.oauthClient.findUnique({
    where: { clientId },
  })
}
