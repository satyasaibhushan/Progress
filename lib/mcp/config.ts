import {
  getBearerChallenge as getOAuthBearerChallenge,
  getProtectedResourceMetadata as getOAuthProtectedResourceMetadata,
  OAuthConfigurationError,
  readOAuthServerConfig,
  type OAuthServerConfig,
} from "@/lib/oauth/config"

export type McpAuthConfig = OAuthServerConfig & {
  resourceMetadataUrl: URL
  requiredScopes: string[]
}

export { OAuthConfigurationError as McpConfigurationError }

export function readMcpAuthConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): McpAuthConfig {
  const config = readOAuthServerConfig(environment)
  return {
    ...config,
    resourceMetadataUrl: config.protectedResourceMetadataUrl,
    requiredScopes: config.scopes,
  }
}

export function getProtectedResourceMetadata(config: McpAuthConfig) {
  return getOAuthProtectedResourceMetadata(config)
}

export function getBearerChallenge(
  config: McpAuthConfig,
  options?: {
    error?: string
    description?: string
    scopes?: string[]
  },
): string {
  return getOAuthBearerChallenge(config, options)
}
