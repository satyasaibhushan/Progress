import { readOAuthServerConfig } from "@/lib/oauth/config"
import {
  OAuthProtocolError,
  readFormRequest,
  readOptionalSingleFormValue,
  requireSingleFormValue,
} from "@/lib/oauth/protocol"
import {
  handleOAuthRouteError,
  logOAuthEvent,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/responses"
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
} from "@/lib/oauth/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  let clientId: string | undefined

  try {
    if (request.headers.has("authorization")) {
      throw new OAuthProtocolError(
        "invalid_client",
        "This public client must not use client authentication",
        401,
      )
    }

    const config = readOAuthServerConfig()
    const form = await readFormRequest(request)
    const grantType = requireSingleFormValue(form, "grant_type", 64)
    clientId = requireSingleFormValue(form, "client_id", 128)
    const resource = requireSingleFormValue(form, "resource")

    if (clientId !== config.client.id) {
      throw new OAuthProtocolError("invalid_client", "Unknown OAuth client", 401)
    }
    if (resource !== config.resourceUrl.toString()) {
      throw new OAuthProtocolError("invalid_target", "resource is not supported")
    }

    let tokens
    if (grantType === "authorization_code") {
      tokens = await exchangeAuthorizationCode(
        {
          code: requireSingleFormValue(form, "code"),
          codeVerifier: requireSingleFormValue(form, "code_verifier", 128),
          clientId,
          redirectUri: requireSingleFormValue(form, "redirect_uri"),
          resource,
        },
        config,
      )
    } else if (grantType === "refresh_token") {
      const requestedScope = readOptionalSingleFormValue(form, "scope", 512)
      if (requestedScope && requestedScope !== config.scopes.join(" ")) {
        throw new OAuthProtocolError(
          "invalid_scope",
          "Refresh tokens cannot request a different scope",
        )
      }
      tokens = await exchangeRefreshToken(
        {
          refreshToken: requireSingleFormValue(form, "refresh_token"),
          clientId,
          resource,
        },
        config,
      )
    } else {
      throw new OAuthProtocolError(
        "unsupported_grant_type",
        "Only authorization_code and refresh_token are supported",
      )
    }

    logOAuthEvent({
      action: `token:${grantType}`,
      outcome: "allowed",
      clientId,
    })
    return Response.json(tokens, {
      headers: OAUTH_NO_STORE_HEADERS,
    })
  } catch (error) {
    logOAuthEvent({
      action: "token",
      outcome: "denied",
      clientId,
    })
    return handleOAuthRouteError(error)
  }
}
