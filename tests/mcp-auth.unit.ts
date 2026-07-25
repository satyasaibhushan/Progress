import assert from "node:assert/strict"
import test from "node:test"
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose"
import {
  McpAuthenticationError,
  resolveMcpUserId,
  verifyMcpAccessToken,
  type McpIdentityStore,
} from "../lib/mcp/auth"
import {
  getBearerChallenge,
  getProtectedResourceMetadata,
  readMcpAuthConfig,
  type McpAuthConfig,
} from "../lib/mcp/config"

const USER_ID_CLAIM = "https://progress.example.com/user_id"

function getConfig(): McpAuthConfig {
  return readMcpAuthConfig({
    MCP_RESOURCE_URL: "https://progress.example.com/mcp",
    MCP_AUTH_ISSUER: "https://auth.example.com/",
    MCP_AUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
    MCP_AUTH_AUDIENCE: "https://progress.example.com/mcp",
    MCP_AUTH_REQUIRED_SCOPES: "progress:read",
    MCP_AUTH_JWT_ALGORITHMS: "RS256",
    MCP_AUTH_USER_ID_CLAIM: USER_ID_CLAIM,
    MCP_AUTH_ALLOW_EMAIL_LINKING: "false",
  })
}

function createIdentityStore(options?: {
  existingUserId?: string
  validUserId?: string
  emailUserId?: string
}) {
  const links: Array<{ issuer: string; subject: string; userId: string }> = []
  const store: McpIdentityStore = {
    async findIdentity() {
      return options?.existingUserId
        ? { userId: options.existingUserId }
        : null
    },
    async findUserById(userId) {
      return userId === options?.validUserId ? { id: userId } : null
    },
    async findUserByEmail() {
      return options?.emailUserId ? { id: options.emailUserId } : null
    },
    async linkIdentity(issuer, subject, userId) {
      links.push({ issuer, subject, userId })
      return { userId }
    },
  }

  return { store, links }
}

test("MCP configuration publishes path-specific OAuth metadata", () => {
  const config = getConfig()

  assert.equal(
    config.resourceMetadataUrl.toString(),
    "https://progress.example.com/.well-known/oauth-protected-resource/mcp",
  )
  assert.deepEqual(getProtectedResourceMetadata(config), {
    resource: "https://progress.example.com/mcp",
    authorization_servers: ["https://auth.example.com/"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["progress:read"],
  })
  assert.match(
    getBearerChallenge(config),
    /resource_metadata="https:\/\/progress\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/,
  )

  const issuerWithoutTrailingSlash = readMcpAuthConfig({
    MCP_RESOURCE_URL: "https://progress.example.com/mcp",
    MCP_AUTH_ISSUER: "https://auth.example.com",
    MCP_AUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
  })
  assert.equal(issuerWithoutTrailingSlash.issuer, "https://auth.example.com")
})

test("MCP identity mapping uses a stable existing issuer and subject link", async () => {
  const config = getConfig()
  const { store, links } = createIdentityStore({
    existingUserId: "existing-user",
  })

  const userId = await resolveMcpUserId(
    {
      sub: "provider-subject",
      [USER_ID_CLAIM]: "untrusted-new-value",
    },
    config,
    store,
  )

  assert.equal(userId, "existing-user")
  assert.deepEqual(links, [])
})

test("MCP identity mapping creates a stable link from a trusted user ID claim", async () => {
  const config = getConfig()
  const { store, links } = createIdentityStore({
    validUserId: "progress-user",
  })

  const userId = await resolveMcpUserId(
    {
      sub: "provider-subject",
      [USER_ID_CLAIM]: "progress-user",
    },
    config,
    store,
  )

  assert.equal(userId, "progress-user")
  assert.deepEqual(links, [{
    issuer: "https://auth.example.com/",
    subject: "provider-subject",
    userId: "progress-user",
  }])
})

test("MCP email linking requires both explicit opt-in and a verified email", async () => {
  const config = {
    ...getConfig(),
    userIdClaim: null,
    allowEmailLinking: true,
  }
  const { store } = createIdentityStore({
    emailUserId: "email-user",
  })

  await assert.rejects(
    resolveMcpUserId(
      {
        sub: "provider-subject",
        email: "user@example.com",
        email_verified: false,
      },
      config,
      store,
    ),
    (error: unknown) => (
      error instanceof McpAuthenticationError
      && error.errorCode === "account_not_linked"
    ),
  )

  assert.equal(
    await resolveMcpUserId(
      {
        sub: "provider-subject",
        email: "USER@example.com",
        email_verified: true,
      },
      config,
      store,
    ),
    "email-user",
  )
})

test("MCP access tokens require signature, issuer, audience, scope, and user mapping", async () => {
  const config = getConfig()
  const { publicKey, privateKey } = await generateKeyPair("RS256")
  const publicJwk = await exportJWK(publicKey)
  const keySet = createLocalJWKSet({
    keys: [{
      ...publicJwk,
      alg: "RS256",
      kid: "test-key",
      use: "sig",
    }],
  })
  const { store } = createIdentityStore({
    validUserId: "progress-user",
  })
  const now = Math.floor(Date.now() / 1000)

  const validToken = await new SignJWT({
    scope: "openid progress:read",
    client_id: "test-client",
    [USER_ID_CLAIM]: "progress-user",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject("provider-subject")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey)

  const principal = await verifyMcpAccessToken(
    validToken,
    config,
    keySet,
    store,
  )
  assert.deepEqual(principal, {
    userId: "progress-user",
    issuer: "https://auth.example.com/",
    subject: "provider-subject",
    clientId: "test-client",
    scopes: ["openid", "progress:read"],
    expiresAt: now + 300,
  })

  const wrongAudienceToken = await new SignJWT({
    scope: "progress:read",
    [USER_ID_CLAIM]: "progress-user",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(config.issuer)
    .setAudience("https://other.example.com/mcp")
    .setSubject("provider-subject")
    .setExpirationTime(now + 300)
    .sign(privateKey)

  await assert.rejects(
    verifyMcpAccessToken(wrongAudienceToken, config, keySet, store),
    (error: unknown) => (
      error instanceof McpAuthenticationError
      && error.status === 401
      && error.errorCode === "invalid_token"
    ),
  )

  const missingScopeToken = await new SignJWT({
    scope: "openid",
    [USER_ID_CLAIM]: "progress-user",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject("provider-subject")
    .setExpirationTime(now + 300)
    .sign(privateKey)

  await assert.rejects(
    verifyMcpAccessToken(missingScopeToken, config, keySet, store),
    (error: unknown) => (
      error instanceof McpAuthenticationError
      && error.status === 403
      && error.errorCode === "insufficient_scope"
    ),
  )
})
