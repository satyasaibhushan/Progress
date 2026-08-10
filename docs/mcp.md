# Progress MCP server

Progress exposes a remote, read-only MCP server at `/mcp`. The same application
acts as the OAuth authorization server and MCP resource server. A user's normal
Auth.js/Google session authenticates the consent screen; it is never accepted as
an MCP credential.

Any compatible MCP client can connect. Progress implements RFC 7591 Dynamic
Client Registration for public clients, authorization code with PKCE `S256`,
OAuth authorization-server discovery, protected-resource metadata, resource
indicators, refresh-token rotation, and token revocation.

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
| `POST /oauth/register` | RFC 7591 public-client registration |
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
OAUTH_SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
OAUTH_SIGNING_KEY_ID=progress-oauth-1
OAUTH_ACCESS_TOKEN_TTL_SECONDS=900
OAUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
OAUTH_REFRESH_TOKEN_REUSE_GRACE_SECONDS=10
```

`NEXTAUTH_URL` must also remain `https://progress.bhushan.fun`. The signing key
may be multiline or use literal `\n` separators.

The production build applies the Prisma migration before building. It creates
tables for dynamically registered clients, pending authorization requests,
one-use authorization codes, and rotating refresh tokens.

## Authorization and token behavior

1. The MCP client discovers `/mcp` as a protected resource and then discovers
   Progress as its authorization server.
2. The client registers its name, supported grants, and exact redirect URI
   allowlist at `/oauth/register`. Progress returns an opaque public client ID.
3. The client opens `/oauth/authorize` with that client ID, a registered
   callback, the exact MCP resource, requested scope, state, and a PKCE
   challenge.
4. Progress asks the user to sign in with the existing Google flow and displays
   a read-only consent screen.
5. Progress returns a one-use, five-minute authorization code to the client's
   registered callback listener.
6. The client exchanges the code and PKCE verifier for a 15-minute signed access
   token and, when the client registered for refresh, an opaque refresh token.
7. Every issued refresh token is rotated when used. Concurrent refreshes during
   the configured 10-second grace period receive the same encrypted rotation
   result, which makes shared multi-process MCP clients safe. Reuse after that
   grace period revokes the entire token family. Each successful refresh renews
   the 30-day inactivity window, so an actively used connection does not
   require periodic browser authorization.

Authorization codes and active refresh tokens are stored only as SHA-256
hashes. A consumed refresh token stores its replacement encrypted with an
authenticated key derived from the OAuth signing key; Progress accepts that
cached result only during the configured grace period. The encrypted value is
unusable after signing-key rotation and never appears in logs.
Access tokens are RS256 JWTs bound to the exact issuer, `/mcp` audience,
internal user ID, registered client ID, and `progress:read` scope. Each MCP
request also verifies that the referenced Progress user still exists.

Changing the signing key invalidates active access tokens. Existing refresh
tokens can obtain access tokens signed with the new key. Use a new
`OAUTH_SIGNING_KEY_ID` whenever the private key changes.

## Client configuration

An MCP client should need only the endpoint and OAuth mode. It discovers all
OAuth endpoints and registers itself dynamically.

For Kairo, add this to `~/.hermes/profiles/kairo/config.yaml`:

```yaml
mcp_servers:
  progress:
    url: "https://progress.bhushan.fun/mcp"
    auth: oauth
    timeout: 120
    connect_timeout: 315
```

Then run:

```bash
kairo mcp login progress
kairo mcp test progress
kairo mcp list
```

The login command selects a loopback callback port, dynamically registers that
exact callback, opens the Progress consent page, and stores its client
registration and tokens in the profile-specific token store. Authorization is
normally one-time: access tokens refresh silently, including when multiple
processes refresh concurrently. Re-run the login command only if consent is
revoked, the connection is unused for 30 days, or the local OAuth state is
removed.

## Operational behavior

- OAuth and MCP access decisions are emitted as structured JSON logs.
- Tokens, emails, tool inputs, and tool outputs are not logged.
- Responses include a request ID where applicable and disable caching of
  sensitive responses.
- Registered redirect URIs, client IDs, resources, and scopes are exact-match
  allowlists.
- Output limits are enforced independently of client input.
