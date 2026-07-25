import {
  getAuthorizationServerMetadata,
  readOAuthServerConfig,
} from "@/lib/oauth/config"
import {
  getOAuthConfigurationErrorResponse,
  OAUTH_NO_STORE_HEADERS,
} from "@/lib/oauth/responses"

export const dynamic = "force-dynamic"

export function GET() {
  try {
    return Response.json(
      getAuthorizationServerMetadata(readOAuthServerConfig()),
      { headers: OAUTH_NO_STORE_HEADERS },
    )
  } catch (error) {
    return getOAuthConfigurationErrorResponse(error)
  }
}
