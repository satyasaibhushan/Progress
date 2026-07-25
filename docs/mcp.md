# Progress MCP server

Progress exposes a remote, read-only MCP server at `/mcp`. It uses Streamable HTTP with JSON responses and requires an OAuth 2.1 bearer access token for every MCP request.

The application is an OAuth resource server only. Authorization, consent, PKCE, token issuance, refresh tokens, client registration, and authorization-server discovery are owned by an external identity provider such as Auth0, Okta, Cognito, or Stytch.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /mcp` | MCP Streamable HTTP requests |
| `GET /mcp` | Authenticated transport request; stateless mode returns method-not-allowed |
| `DELETE /mcp` | Authenticated transport request; stateless mode returns method-not-allowed |
| `OPTIONS /mcp` | CORS preflight for browser-based inspectors |
| `GET /.well-known/oauth-protected-resource/mcp` | Path-specific RFC 9728 protected-resource metadata |
| `GET /.well-known/oauth-protected-resource` | Root metadata fallback |

Unauthenticated requests return `401` with a `WWW-Authenticate` challenge pointing at the path-specific metadata document. Tokens with insufficient scopes return `403`.

## Tools

All tools require `progress:read`, are marked read-only and idempotent, and derive the internal user from the access token rather than accepting a `userId` argument.

| Tool | Result |
| --- | --- |
| `get_progress_overview` | Overall weighted progress, task/habit counts, overdue counts, and priority items |
| `list_tasks` | Up to 100 tasks, filtered by status and text, with hierarchy, groups, labels, dates, and derived progress |
| `list_habits` | Up to 100 habits, filtered by status, type, and text, with streak and current-period metrics |
| `get_progress_item` | One task or habit; habit details include at most 30 recent logs |

## Required configuration

```dotenv
MCP_RESOURCE_URL=https://progress.example.com/mcp
MCP_AUTH_ISSUER=https://tenant.example.com/
MCP_AUTH_JWKS_URL=https://tenant.example.com/.well-known/jwks.json
MCP_AUTH_AUDIENCE=https://progress.example.com/mcp
MCP_AUTH_REQUIRED_SCOPES=progress:read
MCP_AUTH_JWT_ALGORITHMS=RS256
```

`MCP_RESOURCE_URL` is the canonical RFC 8707 resource identifier. Configure the authorization server to preserve the OAuth `resource` parameter and issue access tokens with the same value as their audience.

The server verifies the JWT signature, algorithm, issuer, audience, expiration/not-before claims, subject, and required scopes on every request. Scopes may be supplied in `scope`, `scp`, or `permissions`.

## Linking OAuth identities to Progress users

The stable authorization identity is `(issuer, subject)`. It is stored in `mcp_identities` and linked to one existing Progress `User`.

The preferred first-link flow is a trusted custom access-token claim containing the internal Progress user ID:

```dotenv
MCP_AUTH_USER_ID_CLAIM=https://progress.example.com/user_id
```

Configure the identity provider to populate that claim from protected user metadata. On the first valid MCP request, Progress verifies that the user exists and persists the `(issuer, subject)` link. Later requests use only that stable link, even if email or other claims change.

For a controlled migration, verified-email linking can be temporarily enabled:

```dotenv
MCP_AUTH_ALLOW_EMAIL_LINKING=true
```

Email linking is attempted only for a token from the configured issuer with `email_verified: true`. Keep it disabled when the custom user-ID claim or pre-provisioned identity links are available.

## Authorization-server requirements

The external provider must:

- publish OAuth authorization-server metadata or OpenID Connect discovery;
- support authorization code with PKCE using `S256`;
- support the MCP client's registration mode: CIMD, DCR, or a pre-registered client;
- preserve the OAuth `resource` parameter and bind tokens to the MCP audience;
- issue `progress:read`;
- issue refresh tokens when long-lived client connectivity is required.

The existing Auth.js Google login and database session remain responsible for browser authentication. Browser session cookies and Google access tokens are never accepted by `/mcp`.

See the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Operational behavior

- MCP access events are emitted as structured JSON logs.
- Tokens, emails, tool inputs, and tool outputs are not logged.
- The external subject is represented only by a short SHA-256-derived value in allowed tool-call logs.
- Responses include a request ID and `Cache-Control: no-store`.
- Output limits are enforced independently of client input.
- Apply the Prisma migration before enabling the endpoint in production.

Use the MCP Inspector against the deployed HTTPS endpoint to validate discovery, PKCE, token audience, refresh, and all four tools before enabling the connector for additional users.
