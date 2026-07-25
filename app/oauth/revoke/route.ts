import { findOAuthClient } from "@/lib/oauth/clients"
import { readOAuthServerConfig } from "@/lib/oauth/config"
import {
  OAuthProtocolError,
  readFormRequest,
  requireSingleFormValue,
} from "@/lib/oauth/protocol"
import {
  handleOAuthRouteError,
  logOAuthEvent,
  oauthCorsPreflightResponse,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/responses"
import { revokeRefreshToken } from "@/lib/oauth/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const OPTIONS = oauthCorsPreflightResponse

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

    readOAuthServerConfig()
    const form = await readFormRequest(request)
    clientId = requireSingleFormValue(form, "client_id", 128)
    const token = requireSingleFormValue(form, "token")

    if (!await findOAuthClient(clientId)) {
      throw new OAuthProtocolError("invalid_client", "Unknown OAuth client", 401)
    }

    await revokeRefreshToken(token, clientId)
    logOAuthEvent({
      action: "revoke",
      outcome: "allowed",
      clientId,
    })
    return new Response(null, {
      status: 200,
      headers: OAUTH_NO_STORE_HEADERS,
    })
  } catch (error) {
    logOAuthEvent({
      action: "revoke",
      outcome: "denied",
      clientId,
    })
    return handleOAuthRouteError(error)
  }
}
