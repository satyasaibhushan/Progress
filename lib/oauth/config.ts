const DEFAULT_SCOPE = "progress:read"
const DEFAULT_CLIENT_ID = "kairo"
const DEFAULT_CLIENT_NAME = "Kairo"
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8765/callback"
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
const AUTHORIZATION_REQUEST_TTL_SECONDS = 10 * 60
const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60

type OAuthEnvironment = Readonly<Record<string, string | undefined>>

export type OAuthClientConfig = {
  id: string
  name: string
  redirectUris: string[]
}

export type OAuthServerConfig = {
  issuer: string
  resourceUrl: URL
  protectedResourceMetadataUrl: URL
  authorizationEndpoint: URL
  tokenEndpoint: URL
  revocationEndpoint: URL
  jwksUrl: URL
  scopes: string[]
  client: OAuthClientConfig
  accessTokenTtlSeconds: number
  refreshTokenTtlSeconds: number
  authorizationRequestTtlSeconds: number
  authorizationCodeTtlSeconds: number
}

export class OAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OAuthConfigurationError"
  }
}

function parseAbsoluteUrl(value: string, name: string): URL {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new OAuthConfigurationError(`${name} must be an absolute URL`)
  }

  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if (url.protocol !== "https:" && !(isLoopback && url.protocol === "http:")) {
    throw new OAuthConfigurationError(`${name} must use HTTPS outside localhost`)
  }

  if (url.username || url.password || url.hash) {
    throw new OAuthConfigurationError(`${name} must not contain credentials or a fragment`)
  }

  return url
}

function getIssuer(environment: OAuthEnvironment): string {
  const configured = environment.OAUTH_ISSUER?.trim()
    || environment.NEXTAUTH_URL?.trim()
    || environment.MCP_RESOURCE_URL?.trim()

  if (!configured) {
    throw new OAuthConfigurationError(
      "OAUTH_ISSUER, NEXTAUTH_URL, or MCP_RESOURCE_URL is required",
    )
  }

  const url = parseAbsoluteUrl(configured, "OAUTH_ISSUER")
  if (url.pathname !== "/" && url.pathname !== "/mcp") {
    throw new OAuthConfigurationError("OAUTH_ISSUER must identify the application origin")
  }

  return url.origin
}

function parseList(value: string | undefined, fallback: string): string[] {
  return [...new Set(
    (value || fallback)
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )]
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!value?.trim()) return fallback
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new OAuthConfigurationError(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    )
  }

  return parsed
}

function validateRedirectUri(value: string): string {
  const url = parseAbsoluteUrl(value, "OAUTH_KAIRO_REDIRECT_URIS")
  if (url.search) {
    throw new OAuthConfigurationError(
      "OAUTH_KAIRO_REDIRECT_URIS must not contain a query",
    )
  }
  return url.toString()
}

export function readOAuthServerConfig(
  environment: OAuthEnvironment = process.env,
): OAuthServerConfig {
  const issuer = getIssuer(environment)
  const configuredResource = environment.MCP_RESOURCE_URL?.trim()
  const resourceUrl = configuredResource
    ? parseAbsoluteUrl(configuredResource, "MCP_RESOURCE_URL")
    : new URL("/mcp", issuer)
  const scopes = parseList(environment.MCP_AUTH_REQUIRED_SCOPES, DEFAULT_SCOPE)
  const redirectUris = parseList(
    environment.OAUTH_KAIRO_REDIRECT_URIS,
    DEFAULT_REDIRECT_URI,
  ).map(validateRedirectUri)

  if (resourceUrl.origin !== issuer) {
    throw new OAuthConfigurationError(
      "MCP_RESOURCE_URL must use the same origin as OAUTH_ISSUER",
    )
  }
  if (scopes.length === 0) {
    throw new OAuthConfigurationError("MCP_AUTH_REQUIRED_SCOPES must not be empty")
  }
  if (redirectUris.length === 0) {
    throw new OAuthConfigurationError("OAUTH_KAIRO_REDIRECT_URIS must not be empty")
  }

  const resourcePath = resourceUrl.pathname === "/"
    ? ""
    : resourceUrl.pathname.replace(/\/$/, "")

  return {
    issuer,
    resourceUrl,
    protectedResourceMetadataUrl: new URL(
      `/.well-known/oauth-protected-resource${resourcePath}`,
      issuer,
    ),
    authorizationEndpoint: new URL("/oauth/authorize", issuer),
    tokenEndpoint: new URL("/oauth/token", issuer),
    revocationEndpoint: new URL("/oauth/revoke", issuer),
    jwksUrl: new URL("/.well-known/jwks.json", issuer),
    scopes,
    client: {
      id: environment.OAUTH_KAIRO_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID,
      name: environment.OAUTH_KAIRO_CLIENT_NAME?.trim() || DEFAULT_CLIENT_NAME,
      redirectUris,
    },
    accessTokenTtlSeconds: parsePositiveInteger(
      environment.OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      "OAUTH_ACCESS_TOKEN_TTL_SECONDS",
      300,
      60 * 60,
    ),
    refreshTokenTtlSeconds: parsePositiveInteger(
      environment.OAUTH_REFRESH_TOKEN_TTL_SECONDS,
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      "OAUTH_REFRESH_TOKEN_TTL_SECONDS",
      60 * 60,
      365 * 24 * 60 * 60,
    ),
    authorizationRequestTtlSeconds: AUTHORIZATION_REQUEST_TTL_SECONDS,
    authorizationCodeTtlSeconds: AUTHORIZATION_CODE_TTL_SECONDS,
  }
}

export function getAuthorizationServerMetadata(config: OAuthServerConfig) {
  return {
    issuer: config.issuer,
    authorization_endpoint: config.authorizationEndpoint.toString(),
    token_endpoint: config.tokenEndpoint.toString(),
    revocation_endpoint: config.revocationEndpoint.toString(),
    jwks_uri: config.jwksUrl.toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: config.scopes,
  }
}

export function getProtectedResourceMetadata(config: OAuthServerConfig) {
  return {
    resource: config.resourceUrl.toString(),
    authorization_servers: [config.issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: config.scopes,
  }
}

function sanitizeChallengeValue(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f"\\]/g, "")
}

export function getBearerChallenge(
  config: OAuthServerConfig,
  options?: {
    error?: string
    description?: string
    scopes?: string[]
  },
): string {
  const values = [
    `resource_metadata="${config.protectedResourceMetadataUrl.toString()}"`,
    `scope="${(options?.scopes || config.scopes).join(" ")}"`,
  ]

  if (options?.error) {
    values.push(`error="${sanitizeChallengeValue(options.error)}"`)
  }
  if (options?.description) {
    values.push(`error_description="${sanitizeChallengeValue(options.description)}"`)
  }

  return `Bearer ${values.join(", ")}`
}
