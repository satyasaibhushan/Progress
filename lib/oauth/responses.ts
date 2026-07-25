import {
  OAuthConfigurationError,
} from "@/lib/oauth/config"
import { oauthJsonError } from "@/lib/oauth/protocol"

export const OAUTH_NO_STORE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const

export function oauthCorsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Max-Age": "86400",
    },
  })
}

export function getOAuthConfigurationErrorResponse(error: unknown): Response {
  const message = error instanceof OAuthConfigurationError
    ? error.message
    : "OAuth configuration is unavailable"
  console.error("[OAUTH_CONFIGURATION_ERROR]", message)

  return Response.json(
    { error: "oauth_configuration_error" },
    {
      status: 503,
      headers: OAUTH_NO_STORE_HEADERS,
    },
  )
}

export function handleOAuthRouteError(error: unknown): Response {
  if (error instanceof OAuthConfigurationError) {
    return getOAuthConfigurationErrorResponse(error)
  }
  return oauthJsonError(error)
}

export function logOAuthEvent(event: {
  action: string
  outcome: "allowed" | "denied" | "error"
  userId?: string
  clientId?: string
}): void {
  console.info(JSON.stringify({
    event: "oauth_access",
    action: event.action,
    outcome: event.outcome,
    userId: event.userId,
    clientId: event.clientId,
  }))
}
