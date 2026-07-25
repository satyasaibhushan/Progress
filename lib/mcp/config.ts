const DEFAULT_REQUIRED_SCOPE = "progress:read"
const DEFAULT_JWT_ALGORITHM = "RS256"

type McpEnvironment = Readonly<Record<string, string | undefined>>

export type McpAuthConfig = {
  resourceUrl: URL
  resourceMetadataUrl: URL
  issuer: string
  jwksUrl: URL
  audience: string
  requiredScopes: string[]
  jwtAlgorithms: string[]
  userIdClaim: string | null
  allowEmailLinking: boolean
}

export class McpConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "McpConfigurationError"
  }
}

function requireValue(
  environment: McpEnvironment,
  name: string,
): string {
  const value = environment[name]?.trim()
  if (!value) {
    throw new McpConfigurationError(`${name} is required`)
  }
  return value
}

function parseUrl(
  environment: McpEnvironment,
  name: string,
): URL {
  const value = requireValue(environment, name)
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new McpConfigurationError(`${name} must be an absolute URL`)
  }

  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new McpConfigurationError(`${name} must use HTTPS outside localhost`)
  }

  if (url.username || url.password || url.hash || url.search) {
    throw new McpConfigurationError(`${name} must not contain credentials, a query, or a fragment`)
  }

  return url
}

function parseList(value: string | undefined, fallback: string): string[] {
  const entries = (value || fallback)
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  return [...new Set(entries)]
}

function getProtectedResourceMetadataUrl(resourceUrl: URL): URL {
  const resourcePath = resourceUrl.pathname === "/"
    ? ""
    : resourceUrl.pathname.replace(/\/$/, "")
  return new URL(
    `/.well-known/oauth-protected-resource${resourcePath}`,
    resourceUrl.origin,
  )
}

export function readMcpAuthConfig(
  environment: McpEnvironment = process.env,
): McpAuthConfig {
  const resourceUrl = parseUrl(environment, "MCP_RESOURCE_URL")
  const issuer = requireValue(environment, "MCP_AUTH_ISSUER")
  parseUrl(environment, "MCP_AUTH_ISSUER")
  const jwksUrl = parseUrl(environment, "MCP_AUTH_JWKS_URL")
  const audience = environment.MCP_AUTH_AUDIENCE?.trim() || resourceUrl.toString()
  const requiredScopes = parseList(
    environment.MCP_AUTH_REQUIRED_SCOPES,
    DEFAULT_REQUIRED_SCOPE,
  )
  const jwtAlgorithms = parseList(
    environment.MCP_AUTH_JWT_ALGORITHMS,
    DEFAULT_JWT_ALGORITHM,
  )

  if (requiredScopes.length === 0) {
    throw new McpConfigurationError("MCP_AUTH_REQUIRED_SCOPES must not be empty")
  }

  if (jwtAlgorithms.length === 0) {
    throw new McpConfigurationError("MCP_AUTH_JWT_ALGORITHMS must not be empty")
  }

  return {
    resourceUrl,
    resourceMetadataUrl: getProtectedResourceMetadataUrl(resourceUrl),
    issuer,
    jwksUrl,
    audience,
    requiredScopes,
    jwtAlgorithms,
    userIdClaim: environment.MCP_AUTH_USER_ID_CLAIM?.trim() || null,
    allowEmailLinking: environment.MCP_AUTH_ALLOW_EMAIL_LINKING === "true",
  }
}

export function getProtectedResourceMetadata(config: McpAuthConfig) {
  return {
    resource: config.resourceUrl.toString(),
    authorization_servers: [config.issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: config.requiredScopes,
  }
}

export function getBearerChallenge(
  config: McpAuthConfig,
  options?: {
    error?: string
    description?: string
    scopes?: string[]
  },
): string {
  const values = [
    `resource_metadata="${config.resourceMetadataUrl.toString()}"`,
    `scope="${(options?.scopes || config.requiredScopes).join(" ")}"`,
  ]

  if (options?.error) {
    values.push(`error="${options.error.replace(/[\u0000-\u001f\u007f"\\]/g, "")}"`)
  }

  if (options?.description) {
    values.push(`error_description="${options.description.replace(/[\u0000-\u001f\u007f"\\]/g, "")}"`)
  }

  return `Bearer ${values.join(", ")}`
}
