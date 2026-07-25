import { auth } from "@/lib/auth"
import { findOAuthClient } from "@/lib/oauth/clients"
import { readOAuthServerConfig } from "@/lib/oauth/config"
import {
  OAuthProtocolError,
  readAuthorizationClientId,
  validateAuthorizationRequest,
} from "@/lib/oauth/protocol"
import {
  handleOAuthRouteError,
  logOAuthEvent,
} from "@/lib/oauth/responses"
import { createAuthorizationRequest } from "@/lib/oauth/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const config = readOAuthServerConfig()
    const url = new URL(request.url)
    const client = await findOAuthClient(readAuthorizationClientId(url))
    if (!client) {
      throw new OAuthProtocolError("unauthorized_client", "Unknown OAuth client")
    }
    const authorizationRequest = validateAuthorizationRequest(url, config, client)
    const session = await auth()

    if (!session?.user?.id) {
      const callbackUrl = `${url.pathname}${url.search}`
      const signInUrl = new URL("/auth/signin", config.issuer)
      signInUrl.searchParams.set("callbackUrl", callbackUrl)
      return Response.redirect(signInUrl, 302)
    }

    const pending = await createAuthorizationRequest(
      session.user.id,
      authorizationRequest,
      config,
    )
    const consentUrl = new URL("/oauth/consent", config.issuer)
    consentUrl.searchParams.set("request", pending.id)

    logOAuthEvent({
      action: "authorize",
      outcome: "allowed",
      userId: session.user.id,
      clientId: authorizationRequest.clientId,
    })
    return Response.redirect(consentUrl, 303)
  } catch (error) {
    logOAuthEvent({
      action: "authorize",
      outcome: "denied",
    })
    return handleOAuthRouteError(error)
  }
}
