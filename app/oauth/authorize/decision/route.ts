import { auth } from "@/lib/auth"
import { readOAuthServerConfig } from "@/lib/oauth/config"
import {
  createAuthorizationResponseUrl,
  OAuthProtocolError,
} from "@/lib/oauth/protocol"
import {
  handleOAuthRouteError,
  logOAuthEvent,
} from "@/lib/oauth/responses"
import { completeAuthorizationRequest } from "@/lib/oauth/store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const config = readOAuthServerConfig()
    if (request.headers.get("origin") !== config.issuer) {
      throw new OAuthProtocolError(
        "access_denied",
        "The authorization decision must come from Progress",
        403,
      )
    }

    const session = await auth()
    if (!session?.user?.id) {
      throw new OAuthProtocolError(
        "access_denied",
        "Your Progress session has expired",
        401,
      )
    }

    const form = await request.formData()
    const requestId = String(form.get("request") || "")
    const decision = String(form.get("decision") || "")
    if (!/^[a-z0-9]{10,128}$/i.test(requestId)) {
      throw new OAuthProtocolError("invalid_request", "Invalid authorization request")
    }
    if (decision !== "allow" && decision !== "deny") {
      throw new OAuthProtocolError("invalid_request", "Invalid authorization decision")
    }

    const completed = await completeAuthorizationRequest(
      {
        id: requestId,
        userId: session.user.id,
        approved: decision === "allow",
      },
      config,
    )
    const redirectUrl = decision === "allow"
      ? createAuthorizationResponseUrl(completed.redirectUri, {
        code: completed.code,
        state: completed.state,
      })
      : createAuthorizationResponseUrl(completed.redirectUri, {
        error: "access_denied",
        error_description: "The user denied the authorization request",
        state: completed.state,
      })

    logOAuthEvent({
      action: "consent",
      outcome: decision === "allow" ? "allowed" : "denied",
      userId: session.user.id,
      clientId: config.client.id,
    })
    return Response.redirect(redirectUrl, 303)
  } catch (error) {
    logOAuthEvent({
      action: "consent",
      outcome: "error",
    })
    return handleOAuthRouteError(error)
  }
}
