import {
  registerOAuthClient,
  validateClientRegistration,
} from "@/lib/oauth/clients"
import { readOAuthServerConfig } from "@/lib/oauth/config"
import {
  OAuthProtocolError,
  readJsonRequest,
} from "@/lib/oauth/protocol"
import {
  handleOAuthRouteError,
  logOAuthEvent,
  oauthCorsPreflightResponse,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/responses"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const OPTIONS = oauthCorsPreflightResponse

export async function POST(request: Request) {
  try {
    const config = readOAuthServerConfig()
    const registration = validateClientRegistration(
      await readJsonRequest(request),
      config,
    )
    const client = await registerOAuthClient(registration)

    logOAuthEvent({
      action: "register",
      outcome: "allowed",
      clientId: client.clientId,
    })
    return Response.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        scope: client.scope,
      },
      {
        status: 201,
        headers: OAUTH_NO_STORE_HEADERS,
      },
    )
  } catch (error) {
    logOAuthEvent({
      action: "register",
      outcome: error instanceof OAuthProtocolError ? "denied" : "error",
    })
    return handleOAuthRouteError(error)
  }
}
