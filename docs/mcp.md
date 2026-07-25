# Progress MCP server

Progress exposes a remote, read-only MCP server at `/mcp`. The same application
acts as the OAuth authorization server and MCP resource server. A user's normal
Auth.js/Google session authenticates the consent screen; it is never accepted as
an MCP credential.

Kairo is a pre-registered public client. It uses authorization code with PKCE
`S256`, so there is no client secret to copy onto the devbox.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /mcp` | MCP Streamable HTTP requests |
| `GET` or `DELETE /mcp` | Authenticated transport requests |
| `OPTIONS /mcp` | CORS preflight |
| `GET /.well-known/oauth-protected-resource/mcp` | RFC 9728 protected-resource metadata |
| `GET /.well-known/oauth-protected-resource` | Root protected-resource metadata fallback |
| `GET /.well-known/oauth-authorization-server` | OAuth authorization-server metadata |
| `GET /.well-known/jwks.json` | Public access-token signing key |
| `GET /oauth/authorize` | Login and authorization entry point |
| `POST /oauth/authorize/decision` | Consent decision |
| `POST /oauth/token` | Authorization-code exchange and refresh-token rotation |
| `POST /oauth/revoke` | Refresh-token family revocation |

Unauthenticated MCP requests return `401` with a `WWW-Authenticate` challenge
pointing to the protected-resource metadata. Tokens with insufficient scopes
return `403`.

## Tools

All tools require `progress:read`, are marked read-only and idempotent, and
derive the internal user from the access token rather than accepting a
`userId` argument.

| Tool | Result |
| --- | --- |
| `get_progress_overview` | Overall weighted progress, task/habit counts, overdue counts, and priority items |
| `list_tasks` | Up to 100 tasks, filtered by status and text, with hierarchy, groups, labels, dates, and derived progress |
| `list_habits` | Up to 100 habits, filtered by status, type, and text, with streak and current-period metrics |
| `get_progress_item` | One task or habit; habit details include at most 30 recent logs |

## Production configuration

Generate a dedicated RSA signing key outside the repository:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out progress-oauth-private.pem
```

Store the private key only in the production environment-variable manager.
Configure:

```dotenv
OAUTH_ISSUER=https://progress.bhushan.fun
MCP_RESOURCE_URL=https://progress.bhushan.fun/mcp
MCP_AUTH_REQUIRED_SCOPES=progress:read
OAUTH_KAIRO_CLIENT_ID=kairo
OAUTH_KAIRO_CLIENT_NAME=Kairo
OAUTH_KAIRO_REDIRECT_URIS=http://127.0.0.1:8765/callback
OAUTH_SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
OAUTH_SIGNING_KEY_ID=progress-oauth-1
OAUTH_ACCESS_TOKEN_TTL_SECONDS=900
OAUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
```

`NEXTAUTH_URL` must also remain `https://progress.bhushan.fun`. The signing key
may be multiline or use literal `\n` separators.

The production build applies the Prisma migration before building. It creates
tables for pending authorization requests, one-use authorization codes, and
rotating refresh tokens.

## Authorization and token behavior

1. Kairo discovers `/mcp` as a protected resource and then discovers Progress
   as its authorization server.
2. Kairo opens `/oauth/authorize` with its registered loopback callback, the
   exact MCP resource, requested scope, state, and a PKCE challenge.
3. Progress asks the user to sign in with the existing Google flow and displays
   a read-only consent screen.
4. Progress returns a one-use, five-minute authorization code to Kairo's local
   callback listener.
5. Kairo exchanges the code and PKCE verifier for a 15-minute signed access
   token and an opaque refresh token.
6. Every refresh rotates the refresh token. Reuse of an older token revokes the
   entire token family. The family expires after 30 days.

Authorization codes and refresh tokens are stored only as SHA-256 hashes.
Access tokens are RS256 JWTs bound to the exact issuer, `/mcp` audience,
internal user ID, `kairo` client ID, and `progress:read` scope. Each MCP request
also verifies that the referenced Progress user still exists.

Changing the signing key invalidates active access tokens. Existing refresh
tokens can obtain access tokens signed with the new key. Use a new
`OAUTH_SIGNING_KEY_ID` whenever the private key changes.

## Kairo configuration

Add this to `~/.hermes/profiles/kairo/config.yaml`:

```yaml
mcp_servers:
  progress:
    url: "https://progress.bhushan.fun/mcp"
    auth: oauth
    timeout: 120
    connect_timeout: 315
    oauth:
      client_id: "kairo"
      scope: "progress:read"
      redirect_port: 8765
      redirect_host: "127.0.0.1"
```

Then run:

```bash
kairo mcp login progress
kairo mcp test progress
kairo mcp list
```

The login command starts a temporary callback listener on
`127.0.0.1:8765`, opens the Progress consent page, and stores Kairo's tokens in
its profile-specific token store. Re-run the login command if consent is
revoked, the refresh-token family expires, or the local token file is removed.

## Operational behavior

- OAuth and MCP access decisions are emitted as structured JSON logs.
- Tokens, emails, tool inputs, and tool outputs are not logged.
- Responses include a request ID where applicable and disable caching of
  sensitive responses.
- Redirect URIs, client IDs, resources, and scopes are exact-match allowlists.
- Output limits are enforced independently of client input.
