import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import test from "node:test"
import { SignJWT } from "jose"
import {
  McpAuthenticationError,
  verifyMcpAccessToken,
  type McpUserStore,
} from "../lib/mcp/auth"
import {
  getBearerChallenge,
  getProtectedResourceMetadata,
  readMcpAuthConfig,
} from "../lib/mcp/config"
import {
  getAuthorizationServerMetadata,
  readOAuthServerConfig,
} from "../lib/oauth/config"
import {
  createPkceChallenge,
  verifyPkceChallenge,
} from "../lib/oauth/crypto"
import { readOAuthSigningKeys } from "../lib/oauth/keys"
import {
  OAuthProtocolError,
  validateAuthorizationRequest,
} from "../lib/oauth/protocol"
import { signProgressAccessToken } from "../lib/oauth/tokens"

const privateKeyPem = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey.export({
  format: "pem",
  type: "pkcs8",
}).toString()

const environment = {
  NEXTAUTH_URL: "https://progress.example.com",
  MCP_RESOURCE_URL: "https://progress.example.com/mcp",
  MCP_AUTH_REQUIRED_SCOPES: "progress:read",
  OAUTH_KAIRO_CLIENT_ID: "kairo",
  OAUTH_KAIRO_REDIRECT_URIS: "http://127.0.0.1:8765/callback",
  OAUTH_SIGNING_PRIVATE_KEY: privateKeyPem,
  OAUTH_SIGNING_KEY_ID: "test-key",
}

const config = readMcpAuthConfig(environment)
const keys = readOAuthSigningKeys(environment)

function createUserStore(userId: string | null): McpUserStore {
  return {
    async findUserById(candidate) {
      return candidate === userId ? { id: candidate } : null
    },
  }
}

test("first-party OAuth configuration publishes MCP and authorization metadata", () => {
  assert.equal(config.issuer, "https://progress.example.com")
  assert.equal(
    config.resourceMetadataUrl.toString(),
    "https://progress.example.com/.well-known/oauth-protected-resource/mcp",
  )
  assert.deepEqual(getProtectedResourceMetadata(config), {
    resource: "https://progress.example.com/mcp",
    authorization_servers: ["https://progress.example.com"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["progress:read"],
  })

  const metadata = getAuthorizationServerMetadata(
    readOAuthServerConfig(environment),
  )
  assert.equal(metadata.authorization_endpoint, "https://progress.example.com/oauth/authorize")
  assert.equal(metadata.token_endpoint, "https://progress.example.com/oauth/token")
  assert.equal(metadata.jwks_uri, "https://progress.example.com/.well-known/jwks.json")
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"])
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"])
  assert.match(
    getBearerChallenge(config),
    /resource_metadata="https:\/\/progress\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/,
  )
})

test("OAuth configuration rejects a cross-origin MCP resource", () => {
  assert.throws(
    () => readOAuthServerConfig({
      NEXTAUTH_URL: "https://progress.example.com",
      MCP_RESOURCE_URL: "https://other.example.com/mcp",
    }),
    /same origin/,
  )
})

test("authorization requests require the registered client, resource, scope, redirect, and S256 PKCE", () => {
  const verifier = "a".repeat(64)
  const challenge = createPkceChallenge(verifier)
  const validUrl = new URL("https://progress.example.com/oauth/authorize")
  validUrl.searchParams.set("response_type", "code")
  validUrl.searchParams.set("client_id", "kairo")
  validUrl.searchParams.set("redirect_uri", "http://127.0.0.1:8765/callback")
  validUrl.searchParams.set("resource", "https://progress.example.com/mcp")
  validUrl.searchParams.set("scope", "progress:read")
  validUrl.searchParams.set("state", "test-state")
  validUrl.searchParams.set("code_challenge", challenge)
  validUrl.searchParams.set("code_challenge_method", "S256")

  assert.deepEqual(validateAuthorizationRequest(validUrl, config), {
    clientId: "kairo",
    redirectUri: "http://127.0.0.1:8765/callback",
    resource: "https://progress.example.com/mcp",
    scope: "progress:read",
    state: "test-state",
    codeChallenge: challenge,
  })
  assert.equal(verifyPkceChallenge(verifier, challenge), true)
  assert.equal(verifyPkceChallenge(`${verifier}x`, challenge), false)

  for (const [parameter, value, errorCode] of [
    ["client_id", "unknown", "unauthorized_client"],
    ["redirect_uri", "http://127.0.0.1:9999/callback", "invalid_request"],
    ["resource", "https://other.example.com/mcp", "invalid_target"],
    ["scope", "progress:write", "invalid_scope"],
    ["code_challenge_method", "plain", "invalid_request"],
  ] as const) {
    const invalidUrl = new URL(validUrl)
    invalidUrl.searchParams.set(parameter, value)
    assert.throws(
      () => validateAuthorizationRequest(invalidUrl, config),
      (error: unknown) => (
        error instanceof OAuthProtocolError
        && error.errorCode === errorCode
      ),
    )
  }
})

test("Progress access tokens require the first-party issuer, audience, client, scope, and user", async () => {
  const signed = await signProgressAccessToken(
    {
      userId: "progress-user",
      clientId: "kairo",
      scope: "progress:read",
    },
    config,
    keys,
  )
  const principal = await verifyMcpAccessToken(
    signed.token,
    config,
    keys,
    createUserStore("progress-user"),
  )

  assert.deepEqual(principal, {
    userId: "progress-user",
    issuer: "https://progress.example.com",
    subject: "progress-user",
    clientId: "kairo",
    scopes: ["progress:read"],
    expiresAt: signed.expiresAt,
  })

  await assert.rejects(
    verifyMcpAccessToken(
      signed.token,
      config,
      keys,
      createUserStore(null),
    ),
    (error: unknown) => (
      error instanceof McpAuthenticationError
      && error.errorCode === "invalid_token"
    ),
  )
})

test("Progress access tokens reject an incorrect audience or missing scope", async () => {
  const now = Math.floor(Date.now() / 1000)
  const wrongAudience = await new SignJWT({
    scope: "progress:read",
    client_id: "kairo",
  })
    .setProtectedHeader({ alg: "RS256", kid: keys.keyId, typ: "at+jwt" })
    .setIssuer(config.issuer)
    .setAudience("https://other.example.com/mcp")
    .setSubject("progress-user")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(keys.privateKey)

  const missingScope = await signProgressAccessToken(
    {
      userId: "progress-user",
      clientId: "kairo",
      scope: "openid",
    },
    config,
    keys,
  )

  await assert.rejects(
    verifyMcpAccessToken(
      wrongAudience,
      config,
      keys,
      createUserStore("progress-user"),
    ),
    (error: unknown) => (
      error instanceof McpAuthenticationError
      && error.status === 401
    ),
  )
  await assert.rejects(
    verifyMcpAccessToken(
      missingScope.token,
      config,
      keys,
      createUserStore("progress-user"),
    ),
    (error: unknown) => (
      error instanceof McpAuthenticationError
      && error.status === 403
      && error.errorCode === "insufficient_scope"
    ),
  )
})
