import { getPublicJwks } from "@/lib/oauth/keys"
import { getOAuthConfigurationErrorResponse } from "@/lib/oauth/responses"

export const dynamic = "force-dynamic"

export function GET() {
  try {
    return Response.json(getPublicJwks(), {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch (error) {
    return getOAuthConfigurationErrorResponse(error)
  }
}
